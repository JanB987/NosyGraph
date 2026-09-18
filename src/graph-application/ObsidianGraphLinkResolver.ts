import type { App, TFile } from "obsidian";
import { extractInternalLinkCandidates } from "../linkResolver";
import type { O3LinkType } from "../O3LinkType";

export interface ObsidianGraphLinkTarget {
  path: string;
  label: string;
  file: TFile | null;
  missing: boolean;
}

export interface ObsidianGraphLinkResolverOptions {
  isFile(value: unknown): value is TFile;
  getLabels(): ReadonlyMap<string, string>;
  getExpansionPropertyAliases(): ReadonlyMap<string, readonly string[]>;
  getDiscoveryDirections(): ReadonlyMap<string, "incoming" | "outgoing" | "both">;
  normalizeType?(value: string): string;
}

/**
 * Resolves Obsidian frontmatter relationships for the graph application.
 * It owns metadata-cache parsing, linkpath resolution, and the optional
 * incoming-link index; graph rendering and expansion state stay outside it.
 */
export class ObsidianGraphLinkResolver {
  private readonly normalizeType: (value: string) => string;
  private readonly incomingLinksByProperty = new Map<string, Map<string, Set<string>>>();
  private readonly incomingLinksBySource = new Map<string, Map<string, Set<string>>>();
  private incomingLinkIndexReady = false;

  constructor(
    private readonly app: App,
    private readonly options: ObsidianGraphLinkResolverOptions
  ) {
    this.normalizeType = options.normalizeType ?? ((value) => String(value ?? "").trim().toLowerCase());
  }

  collectFrontmatterLinksByType(file: TFile): Map<string, Set<string>> {
    const byType = new Map<string, Set<string>>();
    const cache = this.app.metadataCache.getFileCache(file);

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

    const frontmatter = cache?.frontmatter;
    if (frontmatter) {
      for (const [key, value] of Object.entries(frontmatter)) {
        if (String(key ?? "").trim().toLowerCase() === "position") continue;
        for (const candidate of extractInternalLinkCandidates(value)) {
          const target = this.resolveGraphLinkTarget(candidate, file.path);
          if (target) addTarget(key, target.path);
        }
      }
    }

    this.applyActiveLinkTypePropertyAliases(byType);
    return byType;
  }

  collectFrontmatterLinkTypeKeys(file: TFile): Set<string> {
    const out = new Set<string>();
    const cache = this.app.metadataCache.getFileCache(file);
    for (const link of this.getFrontmatterLinks(cache)) {
      const rawKey = String(link.key ?? "").trim();
      if (!rawKey) continue;
      const normalizedKey = this.normalizeFrontmatterLinkTypeKey(rawKey.split(/[.[\]]/)[0] ?? rawKey);
      if (normalizedKey) out.add(normalizedKey);
    }
    const frontmatter = cache?.frontmatter;
    if (!frontmatter) return out;
    for (const [key, value] of Object.entries(frontmatter)) {
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

  resolveLinkedTargets(sourceFile: TFile, linkType: O3LinkType): ObsidianGraphLinkTarget[] {
    const property = this.normalizeType(String(linkType.property ?? ""));
    if (!property) return [];
    const direction = linkType.linkDiscoveryDirection
      ?? this.options.getDiscoveryDirections().get(property)
      ?? "outgoing";
    const candidates = new Set<string>();
    if (direction === "outgoing" || direction === "both") {
      for (const targetPath of this.collectFrontmatterLinksByType(sourceFile).get(property) ?? []) {
        candidates.add(targetPath);
      }
    }
    if (direction === "incoming" || direction === "both") {
      this.ensureIncomingLinkIndex();
      for (const incomingSource of this.incomingLinksByProperty.get(property)?.get(sourceFile.path) ?? []) {
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
    const resolved = this.app.metadataCache.getFirstLinkpathDest(normalized, sourcePath);
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
    for (const [primaryProperty, expansionProperties] of this.options.getExpansionPropertyAliases().entries()) {
      if (!primaryProperty || expansionProperties.length <= 1) continue;
      let primaryTargets = byType.get(primaryProperty);
      for (const property of expansionProperties) {
        const targets = byType.get(this.normalizeType(property));
        if (!targets) continue;
        if (!primaryTargets) {
          primaryTargets = new Set<string>();
          byType.set(primaryProperty, primaryTargets);
        }
        for (const target of targets) primaryTargets.add(target);
      }
    }
  }

  private ensureIncomingLinkIndex(): void {
    if (this.incomingLinkIndexReady) return;
    this.incomingLinksByProperty.clear();
    this.incomingLinksBySource.clear();
    for (const file of this.app.vault.getMarkdownFiles()) this.indexIncomingLinksForFile(file);
    this.incomingLinkIndexReady = true;
  }

  private indexIncomingLinksForFile(file: TFile): void {
    const linksByType = this.collectFrontmatterLinksByType(file);
    const sourceEntries = new Map<string, Set<string>>();
    for (const property of this.options.getDiscoveryDirections().keys()) {
      const targets = linksByType.get(property);
      if (!targets || targets.size === 0) continue;
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
    return this.normalizeType(key);
  }

  private getFrontmatterLinks(cache: unknown): Array<{ key?: string; link?: string }> {
    const record = cache && typeof cache === "object" ? cache as { frontmatterLinks?: unknown } : {};
    return Array.isArray(record.frontmatterLinks) ? record.frontmatterLinks as Array<{ key?: string; link?: string }> : [];
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
