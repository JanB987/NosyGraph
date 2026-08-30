import type { LinkTypeId, NoteId } from "../graph-domain/graph-identifiers";

export interface GraphRelationshipTargetQuery {
  sourceNoteId: NoteId;
  linkTypeId: LinkTypeId;
}

/** One canonical relationship target, including unresolved note links. */
export interface GraphRelationshipTarget {
  noteId: NoteId;
  label: string;
  missing: boolean;
}

/** Host-neutral input boundary used by badge expansion planning. */
export interface GraphRelationshipTargetReader {
  readTargets(query: GraphRelationshipTargetQuery): Promise<readonly GraphRelationshipTarget[]>;
}
