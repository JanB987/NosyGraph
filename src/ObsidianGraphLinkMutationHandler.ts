/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- NosyGraph parses Obsidian frontmatter, Bases data, and persisted graph JSON whose shapes are validated at runtime. */
import { TFile, type App } from "obsidian";
import { getGraphMarkdownFile, graphPropertyContainsNote } from "./ObsidianGraphNoteLinkPaste";
import { queueGraphDocumentMutation } from "./GraphDocumentMutationQueue";
import type {
  GraphLinkBadgeDropMutationRequest, GraphLinkBadgeDropMutationResult, GraphLinkMutationNodeRef
} from "./graph-application/GraphLinkMutation";

export class ObsidianGraphLinkMutationHandler {
  constructor(private readonly app: App) {}

  async applyBadgeDrop(request: GraphLinkBadgeDropMutationRequest): Promise<GraphLinkBadgeDropMutationResult> {
    return this.applyBadgeLinkToggle(request);
  }

  async applyBadgeLinkAdd(request: GraphLinkBadgeDropMutationRequest): Promise<GraphLinkBadgeDropMutationResult> {
    const result: GraphLinkBadgeDropMutationResult & Required<Pick<
      GraphLinkBadgeDropMutationResult, "alreadyPresent" | "changedFilePaths" | "failed"
    >> = {
      added: [], removed: [], skipped: [], alreadyPresent: [], changedFilePaths: [], failed: [], origin: request.origin
    };
    const incoming = request.discoveryDirection === "incoming";
    const property = request.property.trim();
    const target = getGraphMarkdownFile(this.app, request.target.path);
    if (!target || !property) {
      result.skipped.push(...request.sources.map(({ path }) => path));
      return result;
    }
    const targetPath = request.target.path;
    if (request.sources.some(({ path }) => path === targetPath)) result.skipped.push(targetPath);
    const sources = this.normalizeSources(request.sources, targetPath).flatMap(({ path }) => {
      const file = getGraphMarkdownFile(this.app, path);
      if (file) return [{ path, file }];
      result.skipped.push(path);
      return [];
    });
    const readProperties = this.getReadProperties(request);
    type Source = (typeof sources)[number];
    const write = async (file: TFile, filePath: string, entries: Source[]) => {
      // Publish callback results only after processFrontMatter has completed successfully.
      const added: string[] = [];
      const alreadyPresent: string[] = [];
      const skipped: string[] = [];
      try {
        await queueGraphDocumentMutation(this.app, filePath, async () => {
          const identitiesMatch = () => getGraphMarkdownFile(this.app, targetPath) === target
            && getGraphMarkdownFile(this.app, filePath) === file;
          if (!identitiesMatch()) {
            throw new Error("The destination note changed. Paste again to review it.");
          }
          await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            added.length = alreadyPresent.length = skipped.length = 0;
            if (!identitiesMatch()) {
              throw new Error("The destination note changed. Paste again to review it.");
            }
            const key = this.findFrontmatterPropertyKey(frontmatter, property) ?? property;
            const references: string[] = [];
            for (const entry of entries) {
              if (getGraphMarkdownFile(this.app, entry.path) !== entry.file) {
                skipped.push(entry.path);
                continue;
              }
              const referenceFile = incoming ? target : entry.file;
              const referencePath = incoming ? targetPath : entry.path;
              if (this.findMatchingPropertyKeys(frontmatter, readProperties, referencePath, filePath).length) {
                alreadyPresent.push(entry.path);
                continue;
              }
              references.push(this.toMarkdownLinkReference(referenceFile, filePath));
              added.push(entry.path);
            }
            if (references.length) {
              this.appendFrontmatterLinks(frontmatter, key, references, request.origin === "clipboard-batch");
            }
          });
        });
      } catch (error) {
        if (!request.origin) throw error;
        const reason = error instanceof Error ? error.message : String(error);
        result.failed.push(...entries.map(({ path }) => ({ path, filePath, reason })));
        return;
      }
      result.added.push(...added);
      result.alreadyPresent.push(...alreadyPresent);
      result.skipped.push(...skipped, ...alreadyPresent);
      if (added.length) result.changedFilePaths.push(filePath);
    };
    if (incoming) {
      for (const source of sources) {
        if (getGraphMarkdownFile(this.app, source.path) !== source.file) result.skipped.push(source.path);
        else await write(source.file, source.path, [source]);
      }
    } else if (sources.length) {
      await write(target, targetPath, sources);
    }
    return result;
  }

  private async applyBadgeLinkToggle(
    request: GraphLinkBadgeDropMutationRequest
  ): Promise<GraphLinkBadgeDropMutationResult> {
    if (request.discoveryDirection === "incoming") {
      return this.applyIncomingBadgeLinkToggle(request);
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

        const readProperties = this.getReadProperties(request);
        const matchingPropertyKeys = request.semantic === "lens"
          ? this.findMatchingPropertyKeys(frontmatter, readProperties, sourceFile.path, targetFile.path)
          : (this.frontmatterValueContainsLink(frontmatter[propertyKey], sourceFile.path, targetFile.path)
            ? [propertyKey]
            : []);
        const exists = matchingPropertyKeys.length > 0;
        if (exists) {
          for (const matchingPropertyKey of matchingPropertyKeys) {
            this.removeFrontmatterLinkValue(frontmatter, matchingPropertyKey, sourceFile.path, targetFile.path);
          }
          result.removed.push(sourceFile.path);
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

  private async applyIncomingBadgeLinkToggle(
    request: GraphLinkBadgeDropMutationRequest
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
          this.removeFrontmatterLinkValue(frontmatter, propertyKey, parentFile.path, childFile.path);
          result.removed.push(child.path);
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

  private normalizeSources(sources: readonly GraphLinkMutationNodeRef[], targetPath: string): GraphLinkMutationNodeRef[] {
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

  private getReadProperties(request: GraphLinkBadgeDropMutationRequest): string[] {
    const properties = [request.property, ...(request.readProperties ?? [])]
      .map((property) => String(property ?? "").trim())
      .filter(Boolean);
    const seen = new Set<string>();
    return properties.filter((property) => {
      const normalized = this.normalizeProperty(property);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  }

  private findMatchingPropertyKeys(
    frontmatter: Record<string, unknown>,
    properties: string[],
    targetPath: string,
    sourcePath: string
  ): string[] {
    const names = new Set(properties.map((property) => this.normalizeProperty(property)));
    return Object.keys(frontmatter).filter((key) => names.has(this.normalizeProperty(key))
      && this.frontmatterValueContainsLink(frontmatter[key], targetPath, sourcePath));
  }

  private addFrontmatterLinkValue(
    frontmatter: Record<string, unknown>,
    propertyKey: string,
    reference: string,
    targetPath: string,
    sourcePath: string,
  ): void {
    if (this.frontmatterValueContainsLink(frontmatter[propertyKey], targetPath, sourcePath)) return;
    this.appendFrontmatterLinks(frontmatter, propertyKey, [reference], false);
  }

  private appendFrontmatterLinks(
    frontmatter: Record<string, unknown>,
    key: string,
    references: string[],
    preserveEmpty: boolean
  ): void {
    const current = Object.prototype.hasOwnProperty.call(frontmatter, key) ? frontmatter[key] : undefined;
    const entries = Array.isArray(current) ? current
      : current === undefined || (!preserveEmpty && (current === null || current === "")) ? [] : [current];
    Object.defineProperty(frontmatter, key, {
      value: [...entries, ...references], enumerable: true, configurable: true, writable: true
    });
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
    return graphPropertyContainsNote(this.app, value, targetPath, sourcePath);
  }

  private normalizeProperty(property: string): string {
    return String(property ?? "").trim().toLowerCase();
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- Re-enable dynamic-data lint rules after this module. */
