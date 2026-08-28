import type {
  EdgeId,
  ExpansionId,
  GraphContextId,
  LinkTypeId,
  NodeInstanceId,
  NoteId
} from "./graph-identifiers";

/** Runtime ownership created by expanding one node badge. */
export interface GraphExpansion {
  id: ExpansionId;
  sourceNodeId: NodeInstanceId;
  sourceNoteId: NoteId;
  linkTypeId: LinkTypeId;
  contextId: GraphContextId;
  createdNodeIds: readonly NodeInstanceId[];
  createdEdgeIds: readonly EdgeId[];
  childExpansionIds: readonly ExpansionId[];
}

