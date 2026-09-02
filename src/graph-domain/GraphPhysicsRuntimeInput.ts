import type { GraphPhysicsConstraintState } from "./GraphPhysicsConstraints";
import type { GraphPhysicsContainerState } from "./GraphPhysicsContainers";
import type { GraphPhysicsInput } from "./GraphPhysicsInput";
import type { GraphPhysicsSettings } from "./GraphPhysicsSettings";

/** Complete input for one host-neutral physics runtime update. */
export interface GraphPhysicsRuntimeInput {
  graph: GraphPhysicsInput;
  settings: GraphPhysicsSettings;
  constraints: GraphPhysicsConstraintState;
  containers: GraphPhysicsContainerState;
}
