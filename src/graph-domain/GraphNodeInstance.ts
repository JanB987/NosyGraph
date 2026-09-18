import type {
  ExpansionId,
  GraphContextId,
  LensId,
  NodeInstanceId,
  NoteId
} from "./graph-identifiers";

export interface GraphPoint {
  x: number;
  y: number;
}

export interface GraphVector {
  x: number;
  y: number;
}

/** Explains why this particular visual instance exists. */
export type GraphNodeOrigin =
  | { kind: "root" }
  | { kind: "filter"; filterId: string }
  | {
      kind: "badge-expansion";
      expansionId: ExpansionId;
      sourceNodeId: NodeInstanceId;
    }
  | {
      kind: "embedded-graph";
      lensId: LensId;
      sourceNodeId: NodeInstanceId;
    };

/**
 * One runtime visualization of a note.
 * Multiple instances may intentionally refer to the same GraphNote.
 */
export interface GraphNodeInstance {
  id: NodeInstanceId;
  noteId: NoteId;
  contextId: GraphContextId;
  position: Readonly<GraphPoint>;
  velocity: Readonly<GraphVector>;
  radius: number;
  pinned: boolean;
  selected: boolean;
  origin: Readonly<GraphNodeOrigin>;
}

