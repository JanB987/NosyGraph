/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- NosyGraph parses Obsidian frontmatter, Bases data, and persisted graph JSON whose shapes are validated at runtime. */
import { type MetadataCache, TFile } from "obsidian";
import type { GraphEvent } from "./GraphEvents";

export class O3GraphDependencyWatcher {
  private graphFilePath: string | null = null;
  private linkTypeFolderPath: string | null = null;
  private watchedFiles: Set<string> = new Set();
  private linkTypeFilePaths: Set<string> = new Set();
  private groupFilePaths: Set<string> = new Set();
  private baseFilterFilePaths: Set<string> = new Set();
  private nodeFilePaths: Set<string> = new Set();
  private watchedProperties: Set<string> = new Set();
  private lastFrontmatterSnapshot: Map<string, Record<string, unknown>> = new Map();

  updateDependencies(params: {
    graphFile: TFile;
    linkTypeFiles: TFile[];
    groupFiles: TFile[];
    baseFilterFiles?: TFile[];
    nodeFiles: TFile[];
    linkTypeFolder: string;
    watchedProperties: string[];
    metadataCache: MetadataCache;
  }) {
    const {
      graphFile,
      linkTypeFiles,
      groupFiles,
      baseFilterFiles = [],
      nodeFiles,
      linkTypeFolder,
      watchedProperties,
      metadataCache
    } = params;

    this.graphFilePath = graphFile.path;
    this.linkTypeFolderPath = this.normalizeFolderPath(linkTypeFolder);

    this.watchedFiles.clear();
    this.watchedFiles.add(graphFile.path);
    this.linkTypeFilePaths.clear();
    this.groupFilePaths.clear();
    this.baseFilterFilePaths.clear();
    this.nodeFilePaths.clear();
    this.watchedProperties.clear();
    this.lastFrontmatterSnapshot.clear();

    for (const f of linkTypeFiles) {
      const path = String(f.path ?? "").trim();
      if (!path) continue;
      this.watchedFiles.add(path);
      this.linkTypeFilePaths.add(path);
      this.captureFrontmatterSnapshot(path, f, metadataCache);
    }
    for (const f of groupFiles) {
      const path = String(f.path ?? "").trim();
      if (!path) continue;
      this.watchedFiles.add(path);
      this.groupFilePaths.add(path);
      this.captureFrontmatterSnapshot(path, f, metadataCache);
    }

    for (const f of baseFilterFiles) {
      const path = String(f.path ?? "").trim();
      if (!path) continue;
      this.watchedFiles.add(path);
      this.baseFilterFilePaths.add(path);
      this.captureFrontmatterSnapshot(path, f, metadataCache);
    }

    for (const f of nodeFiles) {
      const path = String(f.path ?? "").trim();
      if (!path) continue;
      this.watchedFiles.add(path);
      this.nodeFilePaths.add(path);
      this.captureFrontmatterSnapshot(path, f, metadataCache);
    }

    for (const prop of watchedProperties) {
      const normalized = String(prop ?? "").trim().toLowerCase();
      if (!normalized) continue;
      this.watchedProperties.add(normalized);
    }
  }

  isWatched(path: string): boolean {
    return this.watchedFiles.has(path);
  }

  emitGraphEvents(file: TFile, metadataCache: MetadataCache): GraphEvent[] {
    if (!this.graphFilePath) return [];
    const path = String(file.path ?? "").trim();
    if (!path) return [];

    const events: GraphEvent[] = [];
    if (path === this.graphFilePath) {
      events.push({ type: "GRAPH_FILE_CHANGED", path });
      return events;
    }

    if (this.isPathInLinkTypeFolder(path) || this.linkTypeFilePaths.has(path)) {
      events.push({ type: "LINKTYPE_CHANGED", path });
      this.captureFrontmatterSnapshot(path, file, metadataCache);
      return events;
    }

    if (this.groupFilePaths.has(path)) {
      events.push({ type: "GROUP_CHANGED", path });
      this.captureFrontmatterSnapshot(path, file, metadataCache);
      return events;
    }

    if (this.baseFilterFilePaths.has(path)) {
      events.push({ type: "BASE_FILTER_CHANGED", path });
      this.captureFrontmatterSnapshot(path, file, metadataCache);
      return events;
    }

    if (!this.nodeFilePaths.has(path)) {
      this.nodeFilePaths.add(path);
      this.watchedFiles.add(path);
    }

    const cache = metadataCache.getFileCache(file);
    if (!cache && this.lastFrontmatterSnapshot.has(path)) {
      this.lastFrontmatterSnapshot.delete(path);
      events.push({ type: "NODE_REMOVED", path });
      return events;
    }

    // metadataCache.changed already scopes updates to file-level metadata changes.
    // Emit a node metadata event and let GraphView decide relevance.
    this.captureFrontmatterSnapshot(path, file, metadataCache);
    events.push({ type: "NODE_METADATA_CHANGED", path });
    return events;
  }

  private captureFrontmatterSnapshot(path: string, file: TFile, metadataCache: MetadataCache): void {
    this.lastFrontmatterSnapshot.set(path, this.readFrontmatterSnapshot(file, metadataCache));
  }

  private readFrontmatterSnapshot(file: TFile, metadataCache: MetadataCache): Record<string, unknown> {
    const cache = metadataCache.getFileCache(file);
    const fm = cache?.frontmatter ?? {};
    return JSON.parse(JSON.stringify(fm)) as Record<string, unknown>;
  }

  private readFrontmatterValueCaseInsensitive(frontmatter: Record<string, unknown>, property: string): unknown {
    const target = String(property ?? "").trim().toLowerCase();
    for (const [key, value] of Object.entries(frontmatter ?? {})) {
      if (String(key ?? "").trim().toLowerCase() === target) {
        return value;
      }
    }
    return undefined;
  }

  private normalizeFolderPath(raw: string): string | null {
    const normalized = String(raw ?? "").trim().replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
    return normalized || null;
  }

  private isPathInLinkTypeFolder(filePath: string): boolean {
    if (!this.linkTypeFolderPath) return false;
    const normalizedPath = String(filePath ?? "").trim();
    return normalizedPath.startsWith(`${this.linkTypeFolderPath}/`);
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- Re-enable dynamic-data lint rules after this module. */
