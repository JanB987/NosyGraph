import type {
  EdgeId,
  ExpansionId,
  GraphContextId,
  LinkTypeId,
  NodeInstanceId,
  NoteId
} from "./graph-identifiers";

/** Runtime ownership claimed by expanding one node badge. */
export interface GraphExpansion {
  id: ExpansionId;
  sourceNodeId: NodeInstanceId;
  sourceNoteId: NoteId;
  linkTypeId: LinkTypeId;
  contextId: GraphContextId;
  ownedNodeIds: readonly NodeInstanceId[];
  ownedEdgeIds: readonly EdgeId[];
  childExpansionIds: readonly ExpansionId[];
}
