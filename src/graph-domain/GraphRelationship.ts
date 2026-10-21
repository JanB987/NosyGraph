import type { LinkTypeId, NoteId } from "./graph-identifiers";

export type GraphRelationshipDirection = "outgoing" | "incoming";

/** Property-level evidence explaining how a relationship was resolved. */
export interface GraphRelationshipProvenance {
  property: string;
  direction: GraphRelationshipDirection;
}

/** A host-neutral relationship between two notes. */
export interface GraphRelationship {
  sourceNoteId: NoteId;
  targetNoteId: NoteId;
  linkTypeId: LinkTypeId;
  direction: GraphRelationshipDirection;
  provenance: readonly GraphRelationshipProvenance[];
}
