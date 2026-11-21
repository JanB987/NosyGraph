/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- Obsidian metadata-cache and vault APIs expose runtime-shaped host data; this adapter narrows it before graph use. */
import type { App, TFile } from "obsidian";
import { extractInternalLinkCandidates } from "../linkResolver";
import { getGraphCutFrontmatter } from "../ObsidianGraphCutFrontmatter";
import type { O3LinkType } from "../O3LinkType";

export interface ObsidianGraphLinkTarget {
  path: string;
  label: string;
  file: TFile | null;
  missing: boolean;
}

export interface ObsidianGraphLinkResolverOptions {
  isFile(this: void, value: unknown): value is TFile;
  getLabels(this: void): ReadonlyMap<string, string>;
  getExpansionPropertyAliases(this: void): ReadonlyMap<string, readonly string[]>;
  getDiscoveryDirections(this: void): ReadonlyMap<string, "incoming" | "outgoing" | "both">;
}

/**
 * Resolves Obsidian frontmatter relationships for the graph application.
 * It owns metadata-cache parsing, linkpath resolution, and the optional
 * incoming-link index; graph rendering and expansion state stay outside it.
 */
export class ObsidianGraphLinkResolver {
  private readonly incomingLinksByProperty = new Map<string, Map<string, Set<string>>>();
  private readonly incomingLinksBySource = new Map<string, Map<string, Set<string>>>();
  private incomingLinkIndexReady = false;
  private readonly incomingIndexProperties = new Set<string>();

  constructor(
    private readonly app: App,
    private readonly options: ObsidianGraphLinkResolverOptions
  ) {}

  private normalizeProperty(value: string): string {
    return String(value ?? "").trim().toLowerCase();
  }

  collectFrontmatterLinksByType(file: TFile, includePropertyAliases = true): Map<string, Set<string>> {
    const byType = new Map<string, Set<string>>();
    const cache = this.readFileCache(file);

    const addTarget = (rawKey: string, targetPath: string): void => {
      const normalizedKey = this.normalizeFrontmatterLinkTypeKey(rawKey);
      if (!normalizedKey) return;
      if (!byType.has(normalizedKey)) byType.set(normalizedKey, new Set<string>());
      byType.get(normalizedKey)!.add(targetPath);
    };

    for (const link of this.getFrontmatterLinks(cache)) {
      const rawKey = String(link.key ?? "").trim();
      const linkText = String(link.link ?? "").trim();
      if (!rawKey || !linkText) continue;
      const target = this.resolveGraphLinkTarget(linkText, file.path);
      if (!target) continue;
      addTarget(rawKey.split(/[.[\]]/)[0] ?? rawKey, target.path);
    }

    for (const [key, value] of Object.entries(this.getFrontmatter(cache))) {
      if (String(key ?? "").trim().toLowerCase() === "position") continue;
      for (const candidate of extractInternalLinkCandidates(value)) {
        const target = this.resolveGraphLinkTarget(candidate, file.path);
        if (target) addTarget(key, target.path);
      }
    }

    if (includePropertyAliases) this.applyActiveLinkTypePropertyAliases(byType);
    return byType;
  }

  collectFrontmatterLinkTypeKeys(file: TFile): Set<string> {
    const out = new Set<string>();
    const cache = this.readFileCache(file);
    for (const link of this.getFrontmatterLinks(cache)) {
      const rawKey = String(link.key ?? "").trim();
      if (!rawKey) continue;
      const normalizedKey = this.normalizeFrontmatterLinkTypeKey(rawKey.split(/[.[\]]/)[0] ?? rawKey);
      if (normalizedKey) out.add(normalizedKey);
    }
    for (const [key, value] of Object.entries(this.getFrontmatter(cache))) {
      if (String(key ?? "").trim().toLowerCase() === "position") continue;
      if (extractInternalLinkCandidates(value).length > 0) {
        const normalizedKey = this.normalizeFrontmatterLinkTypeKey(key);
        if (normalizedKey) out.add(normalizedKey);
      }
    }
    return out;
  }

  resolveLinkPath(rawLinkText: string, sourcePath: string): string | undefined {
    return this.resolveGraphLinkTarget(rawLinkText, sourcePath)?.path;
  }

  resolveLinkedTargets(
    sourceFile: TFile,
    linkType: Pick<O3LinkType, "property" | "linkDiscoveryDirection">,
    options?: { includePropertyAliases?: boolean }
  ): ObsidianGraphLinkTarget[] {
    const property = this.normalizeProperty(String(linkType.property ?? ""));
    if (!property) return [];
    const direction = linkType.linkDiscoveryDirection
      ?? this.options.getDiscoveryDirections().get(property)
      ?? Array.from(this.options.getDiscoveryDirections()).find(([key]) => this.normalizeProperty(key) === property)?.[1]
      ?? "outgoing";
    const candidates = new Set<string>();
    if (direction === "outgoing" || direction === "both") {
      const byType = this.collectFrontmatterLinksByType(sourceFile, options?.includePropertyAliases);
      for (const targetPath of byType.get(property) ?? []) {
        candidates.add(targetPath);
      }
    }
    if (direction === "incoming" || direction === "both") {
      this.ensureIncomingLinkIndex(property);
      const indexKey = options?.includePropertyAliases === false ? `raw:${property}` : `alias:${property}`;
      for (const incomingSource of this.incomingLinksByProperty.get(indexKey)?.get(sourceFile.path) ?? []) {
        candidates.add(incomingSource);
      }
    }

    const resolved: ObsidianGraphLinkTarget[] = [];
    const seen = new Set<string>();
    for (const candidate of candidates) {
      const file = this.app.vault.getAbstractFileByPath(candidate)
        ?? this.app.metadataCache.getFirstLinkpathDest(candidate, sourceFile.path);
      const target = this.options.isFile(file)
        ? {
            path: file.path,
            label: this.options.getLabels().get(file.path) ?? file.basename ?? file.name,
            file,
            missing: false
          }
        : this.resolveGraphLinkTarget(candidate, sourceFile.path);
      if (target && target.path !== sourceFile.path && !seen.has(target.path)) {
        seen.add(target.path);
        resolved.push(target);
      }
    }
    return resolved;
  }

  clearIncomingLinkIndex(): void {
    this.incomingLinksByProperty.clear();
    this.incomingLinksBySource.clear();
    this.incomingIndexProperties.clear();
    this.incomingLinkIndexReady = false;
  }

  updateLinkDiscoveryIndexForFile(file: TFile): void {
    if (!this.incomingLinkIndexReady) return;
    this.removeIncomingLinksForSource(file.path);
    this.indexIncomingLinksForFile(file);
  }

  private resolveGraphLinkTarget(rawLinkText: string, sourcePath: string): ObsidianGraphLinkTarget | null {
    const linkText = String(rawLinkText ?? "").trim();
    if (!linkText || /^(?:[a-z]+:)?\/\//i.test(linkText)) return null;
    const withoutAlias = linkText.split("|")[0]?.trim() ?? linkText;
    const withoutHeading = withoutAlias.split("#")[0]?.trim() ?? withoutAlias;
    const normalized = withoutHeading.replace(/\\/g, "/").trim();
    if (!normalized) return null;
    let decoded = normalized;
    try { decoded = decodeURIComponent(normalized); } catch { /* Preserve malformed literal paths. */ }
    const resolved = this.app.metadataCache.getFirstLinkpathDest(normalized, sourcePath)
      ?? (decoded !== normalized ? this.app.metadataCache.getFirstLinkpathDest(decoded, sourcePath) : null);
    if (this.options.isFile(resolved)) {
      return {
        path: resolved.path,
        label: this.options.getLabels().get(resolved.path) ?? resolved.basename ?? resolved.name,
        file: resolved,
        missing: false
      };
    }
    const missingPath = this.normalizeMissingLinkPath(normalized);
    if (!missingPath) return null;
    return { path: missingPath, label: this.labelFromPath(missingPath), file: null, missing: true };
  }

  private applyActiveLinkTypePropertyAliases(byType: Map<string, Set<string>>): void {
    for (const [rawPrimaryProperty, expansionProperties] of this.options.getExpansionPropertyAliases().entries()) {
      const primaryProperty = this.normalizeProperty(rawPrimaryProperty);
      if (!primaryProperty || expansionProperties.length <= 1) continue;
      let primaryTargets = byType.get(primaryProperty);
      for (const property of expansionProperties) {
        const targets = byType.get(this.normalizeProperty(property));
        if (!targets) continue;
        if (!primaryTargets) {
          primaryTargets = new Set<string>();
          byType.set(primaryProperty, primaryTargets);
        }
        for (const target of targets) primaryTargets.add(target);
      }
    }
  }

  private ensureIncomingLinkIndex(property: string): void {
    if (this.incomingLinkIndexReady && this.incomingIndexProperties.has(property)) return;
    this.incomingIndexProperties.add(property);
    for (const key of this.options.getDiscoveryDirections().keys()) this.incomingIndexProperties.add(this.normalizeProperty(key));
    for (const properties of this.options.getExpansionPropertyAliases().values()) {
      for (const key of properties) this.incomingIndexProperties.add(this.normalizeProperty(key));
    }
    this.incomingLinksByProperty.clear();
    this.incomingLinksBySource.clear();
    for (const file of this.app.vault.getMarkdownFiles()) this.indexIncomingLinksForFile(file);
    this.incomingLinkIndexReady = true;
  }

  private readFileCache(file: TFile): unknown {
    const cached = this.app.metadataCache.getFileCache(file);
    const committed = getGraphCutFrontmatter(this.app, file, cached);
    return committed ? { frontmatter: committed } : cached;
  }

  private getFrontmatter(cache: unknown): Record<string, unknown> {
    if (!isRecord(cache) || !isRecord(cache.frontmatter)) return {};
    return cache.frontmatter;
  }

  private indexIncomingLinksForFile(file: TFile): void {
    const linksByType = this.collectFrontmatterLinksByType(file, false);
    const indexEntries: Array<[string, Set<string>]> = [...linksByType]
      .filter(([property]) => this.incomingIndexProperties.has(property))
      .map(([property, targets]) => [`raw:${property}`, targets]);
    const aliased = new Map([...linksByType].map(([property, targets]) => [property, new Set(targets)]));
    this.applyActiveLinkTypePropertyAliases(aliased);
    for (const [property, targets] of aliased) {
      if (this.incomingIndexProperties.has(property)) indexEntries.push([`alias:${property}`, targets]);
    }
    const sourceEntries = new Map<string, Set<string>>();
    for (const [property, targets] of indexEntries) {
      if (targets.size === 0) continue;
      const sourceTargets = new Set<string>();
      for (const targetPath of targets) {
        sourceTargets.add(targetPath);
        let incomingByTarget = this.incomingLinksByProperty.get(property);
        if (!incomingByTarget) {
          incomingByTarget = new Map<string, Set<string>>();
          this.incomingLinksByProperty.set(property, incomingByTarget);
        }
        let sources = incomingByTarget.get(targetPath);
        if (!sources) {
          sources = new Set<string>();
          incomingByTarget.set(targetPath, sources);
        }
        sources.add(file.path);
      }
      sourceEntries.set(property, sourceTargets);
    }
    if (sourceEntries.size > 0) this.incomingLinksBySource.set(file.path, sourceEntries);
  }

  private removeIncomingLinksForSource(sourcePath: string): void {
    const previous = this.incomingLinksBySource.get(sourcePath);
    if (!previous) return;
    for (const [property, targets] of previous.entries()) {
      const incomingByTarget = this.incomingLinksByProperty.get(property);
      if (!incomingByTarget) continue;
      for (const targetPath of targets) {
        const sources = incomingByTarget.get(targetPath);
        if (!sources) continue;
        sources.delete(sourcePath);
        if (sources.size === 0) incomingByTarget.delete(targetPath);
      }
      if (incomingByTarget.size === 0) this.incomingLinksByProperty.delete(property);
    }
    this.incomingLinksBySource.delete(sourcePath);
  }

  private normalizeFrontmatterLinkTypeKey(key: string): string {
    return this.normalizeProperty(key);
  }

  private getFrontmatterLinks(cache: unknown): Array<{ key?: string; link?: string }> {
    if (!isRecord(cache) || !Array.isArray(cache.frontmatterLinks)) return [];
    return cache.frontmatterLinks.filter(isFrontmatterLink);
  }

  private normalizeMissingLinkPath(rawPath: string): string {
    const path = String(rawPath ?? "").replace(/\\/g, "/").replace(/^\/+/, "").trim();
    if (!path) return "";
    return /\.md$/i.test(path) ? path : `${path}.md`;
  }

  private labelFromPath(pathRaw: string): string {
    const path = String(pathRaw ?? "").trim();
    return path.split("/").pop()?.replace(/\.md$/i, "") || path;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFrontmatterLink(value: unknown): value is { key?: string; link?: string } {
  if (!isRecord(value)) return false;
  return (value.key === undefined || typeof value.key === "string")
    && (value.link === undefined || typeof value.link === "string");
}

/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- Re-enable host-boundary lint rules after this adapter. */
