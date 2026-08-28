# GraphNote

## Purpose

`GraphNote` is a host-neutral representation of a Markdown note. It is separate from [GraphNodeInstance](GraphNodeInstance.md).

## Core data

```ts
interface GraphNote {
  id: NoteId;
  path: string;
  name: string;
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

## Why note and node stay separate

A single note may appear as a root, a duplicate expansion node, and nodes in multiple lenses. Note metadata is shared; position, selection, ownership, and viewport context belong to each node instance.

