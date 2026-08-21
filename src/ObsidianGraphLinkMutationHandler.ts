import { TFile, type App } from "obsidian";
import { extractInternalLinkCandidates } from "./linkResolver";

export interface GraphLinkMutationNodeRef {
  nodeId: string;
  path: string;
}

export interface GraphLinkBadgeDropMutationRequest {
  target: GraphLinkMutationNodeRef;
  sources: GraphLinkMutationNodeRef[];
  property: string;
  discoveryDirection: "incoming" | "outgoing" | "both";
}

export interface GraphLinkBadgeDropMutationResult {
  added: string[];
  removed: string[];
  skipped: string[];
}

export class ObsidianGraphLinkMutationHandler {
  constructor(private readonly app: App) {}

  async applyBadgeDrop(request: GraphLinkBadgeDropMutationRequest): Promise<GraphLinkBadgeDropMutationResult> {
    return this.applyBadgeLinkMutation(request, "toggle");
  }

  async applyBadgeLinkAdd(request: GraphLinkBadgeDropMutationRequest): Promise<GraphLinkBadgeDropMutationResult> {
    return this.applyBadgeLinkMutation(request, "add");
  }

  private async applyBadgeLinkMutation(
    request: GraphLinkBadgeDropMutationRequest,
    mode: "toggle" | "add",
  ): Promise<GraphLinkBadgeDropMutationResult> {
    if (request.discoveryDirection === "incoming") {
      return this.applyIncomingBadgeLinkMutation(request, mode);
    }

    const targetFile = this.resolveFile(request.target.path);
    const property = String(request.property ?? "").trim();
    if (!targetFile || !property) {
      return { added: [], removed: [], skipped: request.sources.map((source) => source.path) };
    }

    const uniqueSources = this.normalizeSources(request.sources, targetFile.path);
    const result: GraphLinkBadgeDropMutationResult = { added: [], removed: [], skipped: [] };
    if (uniqueSources.length === 0) {
      return result;
    }

    await this.app.fileManager.processFrontMatter(targetFile, (frontmatter) => {
      const propertyKey = this.findFrontmatterPropertyKey(frontmatter, property) ?? property;
      for (const source of uniqueSources) {
        const sourceFile = this.resolveFile(source.path);
        if (!sourceFile) {
          result.skipped.push(source.path);
          continue;
        }

        const exists = this.frontmatterValueContainsLink(frontmatter[propertyKey], sourceFile.path, targetFile.path);
        if (exists) {
          if (mode === "toggle") {
            this.removeFrontmatterLinkValue(frontmatter, propertyKey, sourceFile.path, targetFile.path);
            result.removed.push(sourceFile.path);
          } else {
            result.skipped.push(sourceFile.path);
          }
        } else {
          this.addFrontmatterLinkValue(
            frontmatter,
            propertyKey,
            this.toMarkdownLinkReference(sourceFile, targetFile.path),
            sourceFile.path,
            targetFile.path
          );
          result.added.push(sourceFile.path);
        }
      }
    });

    return result;
  }

  private async applyIncomingBadgeLinkMutation(
    request: GraphLinkBadgeDropMutationRequest,
    mode: "toggle" | "add",
  ): Promise<GraphLinkBadgeDropMutationResult> {
    const parentFile = this.resolveFile(request.target.path);
    const property = String(request.property ?? "").trim();
    if (!parentFile || !property) {
      return { added: [], removed: [], skipped: request.sources.map((source) => source.path) };
    }

    const uniqueChildren = this.normalizeSources(request.sources, parentFile.path);
    const result: GraphLinkBadgeDropMutationResult = { added: [], removed: [], skipped: [] };
    for (const child of uniqueChildren) {
      const childFile = this.resolveFile(child.path);
      if (!childFile) {
        result.skipped.push(child.path);
        continue;
      }

      await this.app.fileManager.processFrontMatter(childFile, (frontmatter) => {
        const propertyKey = this.findFrontmatterPropertyKey(frontmatter, property) ?? property;
        const exists = this.frontmatterValueContainsLink(frontmatter[propertyKey], parentFile.path, childFile.path);
        if (exists) {
          if (mode === "toggle") {
            this.removeFrontmatterLinkValue(frontmatter, propertyKey, parentFile.path, childFile.path);
            result.removed.push(child.path);
          } else {
            result.skipped.push(child.path);
          }
          return;
        }

        this.addFrontmatterLinkValue(
          frontmatter,
          propertyKey,
          this.toMarkdownLinkReference(parentFile, childFile.path),
          parentFile.path,
          childFile.path
        );
        result.added.push(child.path);
      });
    }
    return result;
  }

  private normalizeSources(sources: GraphLinkMutationNodeRef[], targetPath: string): GraphLinkMutationNodeRef[] {
    const seen = new Set<string>();
    const out: GraphLinkMutationNodeRef[] = [];
    for (const source of sources) {
      const path = String(source.path ?? "").trim();
      const nodeId = String(source.nodeId ?? "").trim() || path;
      if (!path || path === targetPath || seen.has(path)) continue;
      seen.add(path);
      out.push({ nodeId, path });
    }
    return out;
  }

  private resolveFile(path: string): TFile | null {
    const file = this.app.vault.getAbstractFileByPath(String(path ?? "").trim());
    return file instanceof TFile ? file : null;
  }

  private toMarkdownLinkReference(file: TFile, sourcePath: string): string {
    return this.app.fileManager.generateMarkdownLink(file, sourcePath);
  }

  private findFrontmatterPropertyKey(frontmatter: Record<string, unknown>, property: string): string | null {
    const normalizedProperty = this.normalizeProperty(property);
    return Object.keys(frontmatter).find((key) => this.normalizeProperty(key) === normalizedProperty) ?? null;
  }

  private addFrontmatterLinkValue(
    frontmatter: Record<string, unknown>,
    propertyKey: string,
    reference: string,
    targetPath: string,
    sourcePath: string,
  ): void {
    const current = frontmatter[propertyKey];
    if (this.frontmatterValueContainsLink(current, targetPath, sourcePath)) {
      return;
    }
    if (Array.isArray(current)) {
      frontmatter[propertyKey] = [...current, reference];
      return;
    }
    if (typeof current === "undefined" || current === null || current === "") {
      frontmatter[propertyKey] = [reference];
      return;
    }
    frontmatter[propertyKey] = [current, reference];
  }

  private removeFrontmatterLinkValue(
    frontmatter: Record<string, unknown>,
    propertyKey: string,
    targetPath: string,
    sourcePath: string,
  ): void {
    const current = frontmatter[propertyKey];
    if (Array.isArray(current)) {
      const next = current.filter((entry) => !this.frontmatterValueContainsLink(entry, targetPath, sourcePath));
      if (next.length > 0) {
        frontmatter[propertyKey] = next;
      } else {
        delete frontmatter[propertyKey];
      }
      return;
    }
    if (this.frontmatterValueContainsLink(current, targetPath, sourcePath)) {
      delete frontmatter[propertyKey];
    }
  }

  private frontmatterValueContainsLink(value: unknown, targetPath: string, sourcePath: string): boolean {
    for (const candidate of extractInternalLinkCandidates(value)) {
      const resolved = this.app.metadataCache.getFirstLinkpathDest(candidate, sourcePath);
      if (resolved?.path === targetPath) {
        return true;
      }
    }
    return false;
  }

  private normalizeProperty(property: string): string {
    return String(property ?? "").trim().toLowerCase();
  }
}
