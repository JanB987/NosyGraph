import type { GraphContainer } from "../graph-domain/GraphContainer";
import type { GraphGroup } from "../graph-domain/GraphGroup";
import type { GraphLens } from "../graph-domain/GraphLens";
import type { ContainerId, GroupId, LensId } from "../graph-domain/graph-identifiers";

export type GraphSceneCommand =
  | { type: "create-lens"; lens: GraphLens }
  | { type: "update-lens"; lens: GraphLens }
  | { type: "remove-lens"; lensId: LensId }
  | { type: "create-group"; group: GraphGroup }
  | { type: "update-group"; group: GraphGroup }
  | { type: "remove-group"; groupId: GroupId }
  | { type: "create-container"; container: GraphContainer }
  | { type: "update-container"; container: GraphContainer }
  | { type: "remove-container"; containerId: ContainerId };

export type GraphSceneCommandFailureReason =
  | "scene-port-unavailable"
  | "invalid-id"
  | "duplicate-id"
  | "not-found"
  | "invalid-value"
  | "invalid-container-reference"
  | "container-cycle";

export interface GraphSceneCommandResult {
  handled: boolean;
  command: GraphSceneCommand["type"];
  changed?: boolean;
  revision?: number;
  reason?: GraphSceneCommandFailureReason;
}

export interface GraphSceneCommandPort {
  executeScene(command: GraphSceneCommand): GraphSceneCommandResult | Promise<GraphSceneCommandResult>;
}
