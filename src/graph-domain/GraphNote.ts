import type { NoteId } from "./graph-identifiers";

export type GraphNoteAvailability = "available" | "missing";

/** A Markdown note without Obsidian-specific TFile or metadata-cache types. */
export interface GraphNote {
  id: NoteId;
  path: string;
  name: string;
  availability: GraphNoteAvailability;
  properties: Readonly<Record<string, unknown>>;
  icon?: string;
  configuredSize?: number;
}
