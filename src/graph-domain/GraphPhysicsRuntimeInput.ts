import type { GraphPhysicsConstraintState } from "./GraphPhysicsConstraints";
import type { GraphPhysicsContainerState } from "./GraphPhysicsContainers";
import type { GraphPhysicsInput } from "./GraphPhysicsInput";
import type { GraphPhysicsSettings } from "./GraphPhysicsSettings";
import type { GraphPhysicsAnchoringState } from "./GraphPhysicsAnchoringState";

/** Complete input for one host-neutral physics runtime update. */
export interface GraphPhysicsRuntimeInput {
  graph: GraphPhysicsInput;
  settings: GraphPhysicsSettings;
  constraints: GraphPhysicsConstraintState;
  containers: GraphPhysicsContainerState;
  /** Explicit container seed for staged stepping; legacy shadow capture does not yet supply it. */
  anchoring?: GraphPhysicsAnchoringState;
}
