import type { GraphContextId, ContainerId, NodeInstanceId } from "./graph-identifiers";
import type { GraphLens, GraphRectangle } from "./GraphLens";

export type GraphContainerKind = "parent" | "embedded";

/**
 * Detached spatial ownership. A lens may reference the same origin and context,
 * but its viewport state remains a separate GraphLens record.
 */
export interface GraphContainer {
  id: ContainerId;
  kind: GraphContainerKind;
  contextId: GraphContextId;
  originNodeId: NodeInstanceId;
  memberNodeIds: readonly NodeInstanceId[];
  parentContainerIds: readonly ContainerId[];
  bounds: Readonly<GraphRectangle>;
  locked: boolean;
  lensId?: GraphLens["id"];
}
