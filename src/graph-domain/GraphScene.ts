import type { GraphContainer } from "./GraphContainer";
import type { GraphGroup } from "./GraphGroup";
import type { GraphLens } from "./GraphLens";

export interface GraphSceneSnapshot {
  lenses: readonly GraphLens[];
  groups: readonly GraphGroup[];
  containers: readonly GraphContainer[];
}
