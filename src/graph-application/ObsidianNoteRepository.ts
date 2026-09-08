import type { GraphNote } from "../graph-domain/GraphNote";
import type { NoteId } from "../graph-domain/graph-identifiers";
import { extractInternalLinkCandidates } from "../linkResolver";

export interface GraphNoteRepository {
  getNote(id: NoteId): Promise<GraphNote | undefined>;
  getAllNotes(): Promise<readonly GraphNote[]>;
  getOutgoingLinks(noteId: NoteId, property: string): Promise<readonly NoteId[]>;
  getIncomingLinks(noteId: NoteId, property: string): Promise<readonly NoteId[]>;
}

export interface ObsidianNoteRepositoryOptions<TFile> {
  listMarkdownFiles(): readonly TFile[] | Promise<readonly TFile[]>;
  getFile(path: string): TFile | undefined | Promise<TFile | undefined>;
  getPath(file: TFile): string;
  getName?(file: TFile): string | undefined;
  getProperties(file: TFile): Readonly<Record<string, unknown>> | undefined | Promise<Readonly<Record<string, unknown>> | undefined>;
  resolveLink(candidate: string, sourcePath: string): string | undefined | Promise<string | undefined>;
}

/** Converts vault and metadata-cache reads into detached graph notes and links. */
export class ObsidianNoteRepository<TFile> implements GraphNoteRepository {
  constructor(private readonly options: ObsidianNoteRepositoryOptions<TFile>) {}

  async getNote(id: NoteId): Promise<GraphNote | undefined> {
    const normalizedId = normalizePath(id);
    if (!normalizedId) return undefined;
    const file = await this.options.getFile(normalizedId);
    if (!file) return undefined;
    const path = normalizePath(this.options.getPath(file));
    if (!path) return undefined;
    const properties = (await this.options.getProperties(file)) ?? {};
    const name = String(this.options.getName?.(file) ?? "").trim() || noteNameFromPath(path);
    return {
      id: path,
      path,
      name,
      availability: "available",
      properties: { ...properties }
    };
  }

  async getAllNotes(): Promise<readonly GraphNote[]> {
    const files = await this.options.listMarkdownFiles();
    const notes: GraphNote[] = [];
    for (const file of files) {
      const note = await this.getNote(this.options.getPath(file));
      if (note) notes.push(note);
    }
    return notes;
  }

  async getOutgoingLinks(noteId: NoteId, property: string): Promise<readonly NoteId[]> {
    const sourcePath = normalizePath(noteId);
    if (!sourcePath) return [];
    const source = await this.options.getFile(sourcePath);
    if (!source) return [];
    const properties = (await this.options.getProperties(source)) ?? {};
    const value = readProperty(properties, property);
    if (value === undefined) return [];

    const result: string[] = [];
    const seen = new Set<string>();
    for (const candidate of extractInternalLinkCandidates(value)) {
      const resolved = normalizePath(await this.options.resolveLink(candidate, sourcePath)) || normalizePath(candidate);
      if (!resolved || seen.has(resolved)) continue;
      seen.add(resolved);
      result.push(resolved);
    }
    return result;
  }

  async getIncomingLinks(noteId: NoteId, property: string): Promise<readonly NoteId[]> {
    const targetPath = normalizePath(noteId);
    if (!targetPath) return [];
    const files = await this.options.listMarkdownFiles();
    const result: string[] = [];
    const seen = new Set<string>();
    for (const file of files) {
      const sourcePath = normalizePath(this.options.getPath(file));
      if (!sourcePath || sourcePath === targetPath || seen.has(sourcePath)) continue;
      const outgoing = await this.getOutgoingLinks(sourcePath, property);
      if (outgoing.includes(targetPath)) {
        seen.add(sourcePath);
        result.push(sourcePath);
      }
    }
    return result;
  }
}

function readProperty(
  properties: Readonly<Record<string, unknown>>,
  property: string
): unknown {
  const normalized = String(property ?? "").trim().toLowerCase();
  if (!normalized) return undefined;
  const entry = Object.entries(properties).find(([key]) =>
    key.trim().toLowerCase() === normalized
  );
  return entry?.[1];
}

function normalizePath(value: unknown): string {
  return String(value ?? "").trim().replace(/\\/g, "/");
}

function noteNameFromPath(path: string): string {
  const filename = path.split("/").pop() ?? path;
  return filename.toLowerCase().endsWith(".md") ? filename.slice(0, -3) : filename;
}
