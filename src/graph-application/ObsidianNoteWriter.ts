/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- Obsidian frontmatter mutation is a runtime-shaped host boundary isolated by this adapter. */
import type { NoteId } from "../graph-domain/graph-identifiers";
import { extractInternalLinkCandidates } from "../linkResolver";

export interface GraphRelationshipCommand {
  sourceNoteId: NoteId;
  targetNoteId: NoteId;
  property: string;
}

export interface GraphFrontmatterChanges {
  set?: Readonly<Record<string, unknown>>;
  remove?: readonly string[];
}

export interface GraphNoteWriter {
  addRelationship(command: GraphRelationshipCommand): Promise<void>;
  removeRelationship(command: GraphRelationshipCommand): Promise<void>;
  updateFrontmatter(path: NoteId, changes: GraphFrontmatterChanges): Promise<void>;
}

export interface ObsidianNoteWriterOptions<TFile> {
  getFile(path: string): TFile | undefined | Promise<TFile | undefined>;
  getPath(file: TFile): string;
  getName?(file: TFile): string | undefined;
  processFrontMatter(
    file: TFile,
    mutate: (frontmatter: Record<string, unknown>) => void
  ): Promise<void>;
  resolveLink(candidate: string, sourcePath: string): string | undefined;
  generateMarkdownLink?(target: TFile, sourcePath: string): string;
}

/** Isolates frontmatter relationship and property mutations from the application layer. */
export class ObsidianNoteWriter<TFile> implements GraphNoteWriter {
  constructor(private readonly options: ObsidianNoteWriterOptions<TFile>) {}

  async addRelationship(command: GraphRelationshipCommand): Promise<void> {
    await this.mutateRelationship(command, "add");
  }

  async removeRelationship(command: GraphRelationshipCommand): Promise<void> {
    await this.mutateRelationship(command, "remove");
  }

  async updateFrontmatter(path: NoteId, changes: GraphFrontmatterChanges): Promise<void> {
    const file = await this.options.getFile(normalizePath(path));
    if (!file) return;
    await this.options.processFrontMatter(file, (frontmatter) => {
      for (const key of changes.remove ?? []) {
        const existing = findKey(frontmatter, key);
        if (existing) delete frontmatter[existing];
      }
      for (const [key, value] of Object.entries(changes.set ?? {})) {
        const existing = findKey(frontmatter, key);
        frontmatter[existing ?? key] = value;
      }
    });
  }

  private async mutateRelationship(
    command: GraphRelationshipCommand,
    mode: "add" | "remove"
  ): Promise<void> {
    const property = String(command.property ?? "").trim();
    const sourcePath = normalizePath(command.sourceNoteId);
    const targetPath = normalizePath(command.targetNoteId);
    if (!property || !sourcePath || !targetPath || sourcePath === targetPath) return;

    const source = await this.options.getFile(sourcePath);
    const target = await this.options.getFile(targetPath);
    if (!source || !target) return;

    await this.options.processFrontMatter(source, (frontmatter) => {
      const propertyKey = findKey(frontmatter, property) ?? property;
      const current = frontmatter[propertyKey];
      const values = Array.isArray(current) ? [...current] : current == null || current === "" ? [] : [current];
      const exists = values.some((value) => this.valueResolvesTo(value, targetPath, sourcePath));
      if (mode === "add") {
        if (!exists) {
          const reference = this.options.generateMarkdownLink?.(target, sourcePath)
            ?? `[[${noteName(this.options.getPath(target))}]]`;
          frontmatter[propertyKey] = [...values, reference];
        }
        return;
      }
      const next = values.filter((value) => !this.valueResolvesTo(value, targetPath, sourcePath));
      if (next.length > 0) frontmatter[propertyKey] = next;
      else delete frontmatter[propertyKey];
    });
  }

  private valueResolvesTo(value: unknown, targetPath: string, sourcePath: string): boolean {
    return extractInternalLinkCandidates(value).some((candidate) =>
      normalizePath(this.options.resolveLink(candidate, sourcePath)) === targetPath
    );
  }
}

function findKey(values: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const normalized = String(key ?? "").trim().toLowerCase();
  if (!normalized) return undefined;
  return Object.keys(values).find((candidate) => candidate.trim().toLowerCase() === normalized);
}

function normalizePath(value: unknown): string {
  return String(value ?? "").trim().replace(/\\/g, "/");
}

function noteName(path: string): string {
  const filename = path.split("/").pop() ?? path;
  return filename.replace(/\.md$/i, "");
}

/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- Re-enable host-boundary lint rules after this adapter. */
