import type {
  GraphPhysicsConstraintProjectionResult,
  GraphTransientPhysicsConstraintInput
} from "./GraphPhysicsConstraintProjector";
import { GraphPhysicsConstraintProjector } from "./GraphPhysicsConstraintProjector";
import type { GraphPhysicsContainerProjectionResult } from "./GraphPhysicsContainerProjector";
import { GraphPhysicsContainerProjector } from "./GraphPhysicsContainerProjector";
import type { GraphPhysicsInputProjectionResult } from "./GraphPhysicsInputProjector";
import { GraphPhysicsInputProjector } from "./GraphPhysicsInputProjector";
import type { GraphPhysicsContainerState } from "../graph-domain/GraphPhysicsContainers";
import type { GraphPhysicsRuntimeInput } from "../graph-domain/GraphPhysicsRuntimeInput";
import {
  normalizeGraphPhysicsSettings,
  type GraphPhysicsSettingsInput
} from "../graph-domain/GraphPhysicsSettings";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";

export interface GraphPhysicsRuntimeInputRequest {
  snapshot: GraphSnapshot;
  structuralRevision: number;
  frameSequence: number;
  settings?: GraphPhysicsSettingsInput;
  transientConstraints: GraphTransientPhysicsConstraintInput;
  containers: GraphPhysicsContainerState;
}

export interface GraphPhysicsRuntimeInputCompositionResult {
  input: GraphPhysicsRuntimeInput;
  diagnostics: {
    graph: GraphPhysicsInputProjectionResult["diagnostics"];
    constraints: GraphPhysicsConstraintProjectionResult["diagnostics"];
    containers: GraphPhysicsContainerProjectionResult["diagnostics"];
  };
}

/** Composes all detached inputs required for one physics runtime update. */
export class GraphPhysicsRuntimeInputComposer {
  constructor(
    private readonly graphProjector = new GraphPhysicsInputProjector(),
    private readonly constraintProjector = new GraphPhysicsConstraintProjector(),
    private readonly containerProjector = new GraphPhysicsContainerProjector()
  ) {}

  compose(
    request: GraphPhysicsRuntimeInputRequest
  ): GraphPhysicsRuntimeInputCompositionResult {
    const graph = this.graphProjector.project(
      request.snapshot,
      request.structuralRevision,
      request.frameSequence
    );
    const constraints = this.constraintProjector.project(
      request.snapshot,
      request.transientConstraints
    );
    const containers = this.containerProjector.project(
      request.snapshot,
      request.containers
    );

    return {
      input: {
        graph: graph.input,
        settings: normalizeGraphPhysicsSettings(request.settings),
        constraints: constraints.state,
        containers: containers.state
      },
      diagnostics: {
        graph: graph.diagnostics,
        constraints: constraints.diagnostics,
        containers: containers.diagnostics
      }
    };
  }
}
