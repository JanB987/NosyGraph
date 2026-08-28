import type { GraphExpansion } from "./GraphExpansion";
import type { GraphNodeInstance } from "./GraphNodeInstance";
import type { GraphNote } from "./GraphNote";

/** Immutable read model consumed by queries, rendering, and future tests. */
export interface GraphSnapshot {
  nodes: readonly GraphNodeInstance[];
  notes: readonly GraphNote[];
  expansions: readonly GraphExpansion[];
}

/** Implemented by GraphStore later; easy to adapt to the current engine now. */
export interface GraphSnapshotSource {
  getSnapshot(): GraphSnapshot;
}

