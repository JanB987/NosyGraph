import type { GraphRelationshipIndex } from "../../graph-core/graph-types.js";

export interface ObsidianCachedFile {
  path: string;
  basename?: string;
  name?: string;
  frontmatter?: Record<string, unknown>;
}

export interface ObsidianLinkResolver {
  resolveLink(linkText: string, sourcePath: string): string | undefined;
}

export interface ObsidianMetadataSnapshot {
  files: ObsidianCachedFile[];
  resolver: ObsidianLinkResolver;
}

export class ObsidianMetadataProvider implements GraphRelationshipIndex {
  private readonly properties = new Set<string>();
  private readonly propertyOutgoingLinks = new Map<string, Map<string, Set<string>>>();
  private readonly propertyIncomingLinks = new Map<string, Map<string, Set<string>>>();

  constructor(snapshot: ObsidianMetadataSnapshot) {
    this.rebuild(snapshot);
  }

  getProperties(): string[] {
    return Array.from(this.properties).sort((left, right) => left.localeCompare(right));
  }

  getPropertyOutgoingLinks(property: string, nodeId: string): string[] {
    return Array.from(this.propertyOutgoingLinks.get(property)?.get(nodeId) ?? []);
  }

  getPropertyIncomingLinks(property: string, nodeId: string): string[] {
    return Array.from(this.propertyIncomingLinks.get(property)?.get(nodeId) ?? []);
  }

  private rebuild(snapshot: ObsidianMetadataSnapshot): void {
    const knownPaths = new Set(snapshot.files.map((file) => file.path));
    for (const file of snapshot.files) {
      const frontmatter = file.frontmatter ?? {};
      for (const [property, rawValue] of Object.entries(frontmatter)) {
        const normalizedProperty = property.trim();
        if (!normalizedProperty) {
          continue;
        }
        this.properties.add(normalizedProperty);
        for (const target of this.resolvePropertyTargets(rawValue, file.path, snapshot.resolver, knownPaths)) {
          this.addPropertyEdge(normalizedProperty, file.path, target);
        }
      }
    }
  }

  private addPropertyEdge(property: string, source: string, target: string): void {
    if (!this.propertyOutgoingLinks.has(property)) {
      this.propertyOutgoingLinks.set(property, new Map<string, Set<string>>());
    }
    if (!this.propertyIncomingLinks.has(property)) {
      this.propertyIncomingLinks.set(property, new Map<string, Set<string>>());
    }

    const outgoing = this.propertyOutgoingLinks.get(property)!;
    const incoming = this.propertyIncomingLinks.get(property)!;
    if (!outgoing.has(source)) {
      outgoing.set(source, new Set<string>());
    }
    if (!incoming.has(target)) {
      incoming.set(target, new Set<string>());
    }

    outgoing.get(source)!.add(target);
    incoming.get(target)!.add(source);
  }

  private resolvePropertyTargets(
    rawValue: unknown,
    sourcePath: string,
    resolver: ObsidianLinkResolver,
    knownPaths: Set<string>,
  ): string[] {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    const targets = new Set<string>();
    for (const value of values) {
      const linkText = this.readLinkText(value);
      if (!linkText) {
        continue;
      }
      const resolved = resolver.resolveLink(linkText, sourcePath);
      if (resolved && knownPaths.has(resolved)) {
        targets.add(resolved);
      }
    }
    return Array.from(targets);
  }

  private readLinkText(value: unknown): string | undefined {
    if (typeof value === "string") {
      const trimmed = value.trim();
      const wikiLinkMatch = trimmed.match(/^\[\[([^|\]]+)/);
      return (wikiLinkMatch?.[1] ?? trimmed).trim() || undefined;
    }
    if (value && typeof value === "object") {
      const candidate = value as { link?: unknown; path?: unknown };
      return this.readLinkText(candidate.link ?? candidate.path);
    }
    return undefined;
  }
}
