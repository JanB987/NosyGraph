# GraphNote

## Purpose

`GraphNote` is a host-neutral representation of a Markdown note. It is separate from [GraphNodeInstance](GraphNodeInstance.md).

Current implementation: [`src/graph-domain/GraphNote.ts`](../../src/graph-domain/GraphNote.ts)

## Core data

```ts
interface GraphNote {
  id: NoteId;
  path: string;
  name: string;
  availability: "available" | "missing";
  properties: Readonly<Record<string, unknown>>;
  icon?: GraphIcon;
  configuredSize?: number;
}
```

## Repository contract

```ts
interface NoteRepository {
  getNote(id: NoteId): Promise<GraphNote | undefined>;
  getNoteByPath(path: string): Promise<GraphNote | undefined>;
  getNotes(ids: readonly NoteId[]): Promise<readonly GraphNote[]>;
  getAllNotes(): Promise<readonly GraphNote[]>;
  getOutgoingLinks(noteId: NoteId, property: string): Promise<readonly NoteId[]>;
  getIncomingLinks(noteId: NoteId, property: string): Promise<readonly NoteId[]>;
}
```

The Obsidian implementation belongs in [Obsidian adapters](ObsidianAdapters.md).

`availability` keeps unresolved wiki-link targets in the host-neutral model without pretending that an Obsidian file exists. Missing notes still have a stable ID, path, and display name, but their properties are empty until a file is created.

## Why note and node stay separate

A single note may appear as a root, a duplicate expansion node, and nodes in multiple lenses. Note metadata is shared; position, selection, ownership, and viewport context belong to each node instance.
