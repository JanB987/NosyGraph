import { Notice, parseYaml, TFile, type App } from "obsidian";
import { drainGraphDocumentMutations, queueGraphDocumentMutation } from "./GraphDocumentMutationQueue";
import { publishGraphNodeLinks } from "./GraphNodeClipboard";
import { inspectMembershipReference } from "./GraphRootMembership";
import { resolveEffectiveRootProperties } from "./GraphRootPropertyResolver";
import { rememberGraphCutFrontmatter } from "./ObsidianGraphCutFrontmatter";
import { O3LinkType } from "./O3LinkType";
import type { BadgeMembershipConfig } from "./ObsidianGraphBadgeMembership";
import {
  cutGraphNodes, type GraphCutDefinition, type GraphCutReference, type GraphNodeCutPlan, type GraphNodeCutSelection
} from "./graph-application/GraphNodeCutService";

const activeCuts = new WeakMap<App, Set<string>>();
export const isGraphNodeCutActive = (app: App): boolean => activeCuts.has(app);
export const isGraphNodeCutHolder = (app: App, path: string): boolean => activeCuts.get(app)?.has(path) ?? false;

export interface GraphCutChange {
  file: TFile;
  frontmatter: Record<string, unknown>;
  properties: ReadonlySet<string>;
  rootMembership: boolean;
}

export interface GraphCutSurface {
  getCutSource(): TFile | null;
  hasCutFocus(): boolean;
  getCutSelection(): GraphNodeCutSelection[];
  getCutSelectedCount?(): number;
  copySelectedNodeLinksToClipboard(): Promise<unknown>;
  isCutNoteVisible?(path: string): boolean;
  waitForCutWrites?(): Promise<void>;
  refreshAfterCut(changes: readonly GraphCutChange[]): Promise<void>;
  persistAfterCut?(changes: readonly GraphCutChange[], savedOwners: Set<string>): Promise<void>;
  isCutPersistencePreferred?(): boolean;
}

interface Claim {
  target: GraphNodeCutSelection;
  holderPath: string;
  holder: TFile | undefined;
  referencePath: string;
  reference: TFile | undefined;
  sourcePath: string;
  source: TFile | undefined;
  definition?: GraphCutDefinition;
  definitionFile?: TFile;
  rawProperty?: string;
  optional: boolean;
}

interface PlannedReference extends GraphCutReference {
  claims: Claim[];
}

const normalize = (key: string) => key.trim().toLowerCase();
const referenceKey = (property: string, path: string) => JSON.stringify([property, path]);

function markdownFile(app: App, path: string): TFile | undefined {
  const file = app.vault.getAbstractFileByPath(path);
  return file instanceof TFile && file.extension === "md" ? file : undefined;
}

export async function readGraphCutFrontmatter(app: App, file: TFile): Promise<Record<string, unknown>> {
  const content = await app.vault.read(file);
  const yaml = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)?.[1];
  const data: unknown = yaml ? parseYaml(yaml) : undefined;
  return data && typeof data === "object" && !Array.isArray(data) ? { ...data } : {};
}

export function resolveGraphCutReference(app: App, reference: string, holder: string): string | undefined {
  const path = reference.split("|")[0].split("#")[0].trim().replace(/^<|>$/g, "").replace(/\\/g, "/");
  if (!path || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(path)) return undefined;
  let decoded = path;
  try { decoded = decodeURIComponent(path); } catch { /* Preserve malformed literal paths. */ }
  const resolved = app.metadataCache.getFirstLinkpathDest(decoded, holder)
    ?? (decoded !== path ? app.metadataCache.getFirstLinkpathDest(path, holder) : null);
  const clean = decoded.replace(/^\/+/, "");
  const missing = /\.md$/i.test(clean) ? clean : `${clean}.md`;
  return resolved instanceof TFile ? resolved.path : missing;
}

export class ObsidianGraphNodeCutHost {
  private lastFocused?: GraphCutSurface;
  constructor(
    private readonly app: App,
    private readonly getConfig: () => BadgeMembershipConfig,
    private readonly getSurfaces: () => GraphCutSurface[],
    private readonly registerClipboard: (paths: string[], text: string) => void
  ) {}

  trackFocus(element: Element | null): void {
    if (element?.closest(".prompt")) return;
    this.lastFocused = this.focusedSurface(element);
  }

  focusedSurface(element: Element | null): GraphCutSurface | undefined {
    const surfaces = this.getSurfaces();
    return surfaces.find(surface => surface.hasCutFocus())
      ?? (element?.closest(".prompt") && this.lastFocused && surfaces.includes(this.lastFocused)
        ? this.lastFocused : undefined);
  }

  publishLinks(paths: readonly string[], sourcePath: string): Promise<number> {
    return publishGraphNodeLinks(paths, sourcePath, {
      serialize: (path, source) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        return file instanceof TFile ? this.app.fileManager.generateMarkdownLink(file, source) : `[[${path.replace(/\.md$/i, "")}]]`;
      },
      write: text => navigator.clipboard.writeText(text),
      register: this.registerClipboard
    });
  }

  async copy(surface: GraphCutSurface, paths: readonly string[]): Promise<void> {
    try {
      const count = await this.publishLinks(paths, surface.getCutSource()?.path ?? "");
      new Notice(count ? `Copied ${count === 1 ? "graph node link" : `${count} graph node links`}.` : "No graph nodes selected.");
    } catch {
      new Notice("Could not copy graph node links.");
    }
  }

  canCut(surface: GraphCutSurface, selection?: GraphNodeCutSelection[]): boolean {
    // Even an unsupported selection can invoke Cut to get its skip explanation.
    return !isGraphNodeCutActive(this.app) && !!surface.getCutSource() && (selection?.length ?? surface.getCutSelectedCount?.() ?? surface.getCutSelection().length) > 0;
  }

  async cut(surface: GraphCutSurface, selection = surface.getCutSelection()): Promise<void> {
    if (!this.canCut(surface, selection)) return;
    const source = surface.getCutSource();
    if (!source) return;
    const sourcePath = source.path;
    const captured = this.capture(selection);
    const changes: GraphCutChange[] = [];
    const surfaces = [...new Set([surface, ...this.getSurfaces()])];
    activeCuts.set(this.app, new Set());
    try {
      await Promise.all(surfaces.map(async host => {
        if (host.waitForCutWrites) await host.waitForCutWrites();
      }));
      await drainGraphDocumentMutations(this.app);
      const result = await cutGraphNodes(selection, {
        isCurrent: () => surface.getCutSource() === source && markdownFile(this.app, sourcePath) === source,
        publish: paths => this.publishLinks(paths, sourcePath),
        plan: () => this.plan(selection, captured),
        remove: (path, edits) => this.commit(path, edits, changes)
      });
      const refreshFailures: string[] = [];
      const persistFailures: string[] = [];
      if (changes.length) {
        // Read the connected surfaces again in case focus or the open panes changed during the writes.
        const live = [...new Set([...surfaces, ...this.getSurfaces()])].filter(host => host.getCutSource());
        const refreshed = new Set<GraphCutSurface>();
        for (const host of live) {
          try {
            await host.refreshAfterCut(changes);
            refreshed.add(host);
          } catch {
            refreshFailures.push(host.getCutSource()?.path ?? "a graph surface");
          }
        }
        const savedOwners = new Set<string>();
        const ordered = [...refreshed].sort((a, b) =>
          Number(!!b.isCutPersistencePreferred?.()) - Number(!!a.isCutPersistencePreferred?.()));
        for (const host of ordered) {
          try {
            await host.persistAfterCut?.(changes, savedOwners);
          } catch {
            persistFailures.push(host.getCutSource()?.path ?? "a graph surface");
          }
        }
        for (const change of changes.filter(change => change.rootMembership && !savedOwners.has(change.file.path))) {
          try {
            await this.persistClosedRoot(change);
          } catch {
            persistFailures.push(change.file.path);
          }
        }
      }
      const covered = new Set([...result.partiallyUnlinked, ...result.failed]);
      const skipped = new Set(result.skipped.map(issue => issue.target).filter(target => !covered.has(target)));
      let message = result.clipboardError ? "Could not publish Cut links. No properties changed."
        : `Cut ${result.fullyUnlinked.length} selected instance(s), ${result.partiallyUnlinked.length} partially unlinked, ${skipped.size} skipped, ${result.failed.length} failed. ${result.clipboardCount} note link(s) copied, ${result.removed.length} property reference(s) removed.`;
      const reasons = [...new Set(result.skipped.map(issue => `${issue.target.path}: ${issue.reason}`))];
      const stillVisible = new Set(result.fullyUnlinked.filter(target => surface.isCutNoteVisible?.(target.path)).map(target => target.path));
      if (stillVisible.size) message += ` Still visible through another membership or relationship: ${[...stillVisible].join(", ")}.`;
      if (reasons.length) message += ` ${reasons.join(" ")}`;
      if (refreshFailures.length) message += ` Refresh failed in ${refreshFailures.join(", ")}.`;
      if (persistFailures.length) message += ` Saving refreshed layout failed in ${persistFailures.join(", ")}.`;
      if (result.published && (covered.size || skipped.size)) message += " The clipboard retains the published recovery links.";
      new Notice(message);
    } catch (error) {
      console.error("[NosyGraph] Cut failed", error);
      new Notice("Cut failed. Check graph memberships before retrying.");
    } finally {
      activeCuts.delete(this.app);
    }
  }

  private capture(selection: readonly GraphNodeCutSelection[]): Claim[] {
    return selection.flatMap(target => {
      const claim = (holderPath: string, referencePath: string, sourcePath: string,
        optional: boolean, definition?: GraphCutDefinition, rawProperty?: string): Claim => ({
        target, holderPath, holder: markdownFile(this.app, holderPath), referencePath,
        reference: markdownFile(this.app, referencePath), sourcePath, source: markdownFile(this.app, sourcePath),
        definition, definitionFile: definition ? markdownFile(this.app, definition.definitionId) : undefined, rawProperty, optional
      });
      const origin = target.origin;
      if (origin.kind === "graph-membership" || origin.kind === "lens-membership") {
        return [claim(origin.ownerPath, target.path, origin.ownerPath, false,
          origin.kind === "lens-membership" ? origin.definition : undefined)];
      }
      if (origin.kind !== "relationship-expansion") return [];
      return origin.owners.flatMap(owner => {
        const direction = owner.definition?.direction ?? "outgoing";
        const claims: Claim[] = [];
        if (direction !== "incoming") {
          claims.push(claim(owner.sourcePath, target.path, owner.sourcePath, direction === "both", owner.definition, owner.rawProperty));
        }
        if (direction !== "outgoing") {
          claims.push(claim(target.path, owner.sourcePath, owner.sourcePath, direction === "both", owner.definition, owner.rawProperty));
        }
        return claims;
      });
    });
  }

  private isClaimCurrent(claim: Claim): boolean {
    return !!claim.holder && !!claim.source && markdownFile(this.app, claim.holderPath) === claim.holder
      && markdownFile(this.app, claim.sourcePath) === claim.source
      && markdownFile(this.app, claim.referencePath) === claim.reference
      && (!claim.definition || !!claim.definitionFile && markdownFile(this.app, claim.definition.definitionId) === claim.definitionFile);
  }

  private async validateDefinitions(claims: readonly Claim[]): Promise<Set<GraphCutDefinition>> {
    const valid = new Set<GraphCutDefinition>();
    const documents = new Map<TFile, Promise<Record<string, unknown>>>();
    for (const claim of claims) {
      const { definition, definitionFile } = claim;
      if (!definition || !definitionFile || valid.has(definition) || !this.isClaimCurrent(claim)) continue;
      try {
        const document = documents.get(definitionFile) ?? readGraphCutFrontmatter(this.app, definitionFile);
        documents.set(definitionFile, document);
        const current = new O3LinkType(definitionFile, await document, this.getConfig().linkTypePropertyKeys);
        const keys = (properties: readonly string[]) => JSON.stringify([...new Set(properties.map(normalize))].sort());
        if (current.isValid && current.isSupportedLinkType && current.semantic === definition.semantic
          && current.linkDiscoveryDirection === definition.direction
          && keys(current.properties) === keys(definition.readProperties)) valid.add(definition);
      } catch { /* A definition that cannot be read cannot authorize changes. */ }
    }
    return valid;
  }

  private keys(frontmatter: Record<string, unknown>, claim: Claim): string[] {
    const properties = claim.definition?.readProperties ?? (claim.rawProperty ? [claim.rawProperty] : undefined);
    if (properties) {
      const allowed = new Set(properties.map(normalize));
      return Object.keys(frontmatter).filter(key => allowed.has(normalize(key)));
    }
    const config = this.getConfig();
    return resolveEffectiveRootProperties(frontmatter, config.graphPropertyKeys, config.defaultRootNodeProperties).propertyKeys;
  }

  private inspect(frontmatter: Record<string, unknown>, property: string, claim: Claim) {
    return inspectMembershipReference(frontmatter[property], claim.referencePath,
      reference => resolveGraphCutReference(this.app, reference, claim.holderPath));
  }

  private async plan(selection: readonly GraphNodeCutSelection[], claims: readonly Claim[]): Promise<GraphNodeCutPlan<PlannedReference>> {
    const plan: GraphNodeCutPlan<PlannedReference> = { edits: [], skipped: [] };
    const valid = await this.validateDefinitions(claims);
    const byHolder = new Map<string, Map<string, PlannedReference>>();
    const documents = new Map<TFile, Promise<Record<string, unknown>>>();
    for (const target of selection) {
      const { origin } = target;
      if (origin.kind === "unavailable") plan.skipped.push({ target, reason: origin.reason });
      if (origin.kind === "relationship-expansion") {
        plan.skipped.push(...origin.unavailable.map(reason => ({ target, reason })));
      }
    }
    for (const claim of claims) {
      const { target, holder, holderPath, referencePath, optional, definition } = claim;
      if (optional && !holder && holderPath === target.path) continue;
      if (!holder || !this.isClaimCurrent(claim) || (definition && !valid.has(definition))) {
        plan.skipped.push({ target, reason: `Membership holder or definition is unavailable or changed (${holderPath}).`, failed: true });
        continue;
      }
      let frontmatter: Record<string, unknown>;
      try {
        const document = documents.get(holder) ?? readGraphCutFrontmatter(this.app, holder);
        documents.set(holder, document);
        frontmatter = await document;
      } catch {
        plan.skipped.push({ target, reason: `Could not read ${holderPath}.`, failed: true });
        continue;
      }
      const matches = this.keys(frontmatter, claim).map(property => ({ property, ...this.inspect(frontmatter, property, claim) }))
        .filter(match => match.matches);
      if (!matches.length && !optional) {
        const config = this.getConfig();
        const bodyRoot = target.origin.kind === "graph-membership"
          && resolveEffectiveRootProperties(frontmatter, config.graphPropertyKeys, config.defaultRootNodeProperties)
            .propertyNames.some(name => normalize(name) === "none-type links");
        plan.skipped.push({ target, reason: bodyRoot
          ? `This root is supplied by note-body links in ${holderPath}.`
          : `No matching property membership in ${holderPath}.` });
      }
      if (target.origin.kind === "graph-membership" && matches.some(match => match.ambiguous)) {
        plan.skipped.push({ target, reason: `Ambiguous root membership in ${holderPath} was preserved.` });
        continue;
      }
      const group = byHolder.get(holderPath) ?? new Map<string, PlannedReference>();
      byHolder.set(holderPath, group);
      for (const { property, ambiguous } of matches) {
        if (ambiguous) {
          plan.skipped.push({ target, reason: `Ambiguous value in ${holderPath} / ${property} was preserved.` });
          continue;
        }
        const key = referenceKey(property, referencePath);
        const previous = group.get(key);
        if (previous) {
          previous.claims.push(claim);
          if (!previous.targets.includes(target)) group.set(key, { ...previous, targets: [...previous.targets, target] });
        } else {
          group.set(key, { holderPath, referencePath, property, targets: [target], claims: [claim] });
        }
      }
    }
    plan.edits = [...byHolder.values()].flatMap(group => [...group.values()]);
    const accounted = new Set([...plan.edits.flatMap(edit => edit.targets), ...plan.skipped.map(skip => skip.target)]);
    for (const target of selection) {
      if (!accounted.has(target)) plan.skipped.push({ target, reason: "The active expansion has no matching property reference." });
    }
    return plan;
  }

  private commit(path: string, edits: PlannedReference[], changes: GraphCutChange[]): Promise<GraphNodeCutPlan> {
    return queueGraphDocumentMutation(this.app, path, async () => {
      const holder = edits[0].claims[0].holder;
      if (!holder || markdownFile(this.app, path) !== holder) throw Error("Cut holder unavailable");
      const claims = [...new Set(edits.flatMap(edit => edit.claims))];
      const definitions = await this.validateDefinitions(claims);
      let result: GraphNodeCutPlan = { edits: [], skipped: [] };
      let committed: GraphCutChange | undefined;
      activeCuts.get(this.app)?.add(path);
      await this.app.fileManager.processFrontMatter(holder, (frontmatter: Record<string, unknown>) => {
        result = { edits: [], skipped: [] };
        const properties = new Set<string>();
        let rootMembership = false;
        const planned = new Set(edits.map(edit => referenceKey(edit.property, edit.referencePath)));
        for (const claim of claims) {
          if (!this.isClaimCurrent(claim) || claim.definition && !definitions.has(claim.definition)) continue;
          for (const key of this.keys(frontmatter, claim)) {
            if (!planned.has(referenceKey(key, claim.referencePath)) && this.inspect(frontmatter, key, claim).matches) {
              result.skipped.push({ target: claim.target, reason: `Another reference appeared in ${path} / ${key} and was preserved.` });
            }
          }
        }
        for (const { property, referencePath, claims: authorizations } of edits) {
          const current = authorizations.filter(claim => {
            const accepted = this.isClaimCurrent(claim) && (!claim.definition || definitions.has(claim.definition))
              && this.keys(frontmatter, claim).includes(property);
            if (!accepted) result.skipped.push({ target: claim.target, reason: `Membership or definition changed in ${path} / ${property}.`, failed: true });
            return accepted;
          });
          if (!current.length) continue;
          const match = this.inspect(frontmatter, property, current[0]);
          const targets = [...new Set(current.map(claim => claim.target))];
          if (!match.matches || match.ambiguous) {
            result.skipped.push(...targets.map(target => ({
              target, reason: match.ambiguous ? `Ambiguous value in ${path} / ${property} was preserved.` : `Reference changed in ${path} / ${property}.`
            })));
            continue;
          }
          frontmatter[property] = match.remaining;
          properties.add(normalize(property));
          rootMembership ||= current.some(claim => claim.target.origin.kind === "graph-membership");
          result.edits.push({ holderPath: path, property, referencePath, targets });
        }
        if (properties.size) committed = { file: holder, frontmatter: { ...frontmatter }, properties, rootMembership };
      });
      if (committed) {
        rememberGraphCutFrontmatter(this.app, holder, committed.frontmatter);
        changes.push(committed);
      }
      return result;
    }, "badge-membership");
  }

  private async persistClosedRoot(change: GraphCutChange): Promise<void> {
    const { persistGraphCutRootTruth } = await import("./ObsidianGraphCutPersistence");
    await persistGraphCutRootTruth(this.app, change, this.getConfig());
  }
}
