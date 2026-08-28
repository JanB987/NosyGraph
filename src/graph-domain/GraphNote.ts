import type { NoteId } from "./graph-identifiers";

/** A Markdown note without Obsidian-specific TFile or metadata-cache types. */
export interface GraphNote {
  id: NoteId;
  path: string;
  name: string;
  properties: Readonly<Record<string, unknown>>;
  icon?: string;
  configuredSize?: number;
}

