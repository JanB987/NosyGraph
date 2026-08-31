import type { GraphNote } from "../graph-domain/GraphNote";
import type { NoteId } from "../graph-domain/graph-identifiers";
import type { GraphExpansionNoteReader } from "./GraphExpansionTargetMaterializer";

export interface ObsidianGraphExpansionNoteAdapterOptions<TFile> {
  getFile(noteId: NoteId): TFile | undefined;
  getPath(file: TFile): string;
  getName(file: TFile): string;
  getProperties(file: TFile): Readonly<Record<string, unknown>> | undefined;
  getConfiguredSize?(properties: Readonly<Record<string, unknown>>): number | undefined;
  getIcon?(properties: Readonly<Record<string, unknown>>): string | undefined;
}

/** Converts Obsidian vault and metadata-cache reads into host-neutral GraphNote values. */
export class ObsidianGraphExpansionNoteAdapter<TFile>
  implements GraphExpansionNoteReader {
  constructor(
    private readonly options: ObsidianGraphExpansionNoteAdapterOptions<TFile>
  ) {}

  async readNote(noteId: NoteId): Promise<GraphNote | undefined> {
    const normalizedId = String(noteId ?? "").trim();
    if (!normalizedId) return undefined;

    const file = this.options.getFile(normalizedId);
    if (!file) {
      return {
        id: normalizedId,
        path: normalizedId,
        name: noteNameFromPath(normalizedId),
        availability: "missing",
        properties: {}
      };
    }

    const path = String(this.options.getPath(file) ?? "").trim();
    if (!path) return undefined;
    const properties = this.options.getProperties(file) ?? {};
    const configuredSize = this.options.getConfiguredSize?.(properties);
    const icon = this.options.getIcon?.(properties);
    return {
      id: path,
      path,
      name: String(this.options.getName(file) ?? "").trim() || noteNameFromPath(path),
      availability: "available",
      properties: { ...properties },
      ...(configuredSize !== undefined ? { configuredSize } : {}),
      ...(icon !== undefined ? { icon } : {})
    };
  }
}

function noteNameFromPath(path: string): string {
  const filename = path.split("/").pop() ?? path;
  return filename.toLowerCase().endsWith(".md") ? filename.slice(0, -3) : filename;
}
