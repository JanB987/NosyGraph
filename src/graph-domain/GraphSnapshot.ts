import type { GraphBadge } from "./GraphBadge";
import type { GraphEdge } from "./GraphEdge";
import type { GraphExpansion } from "./GraphExpansion";
import type { GraphLens } from "./GraphLens";
import type { GraphNodeInstance } from "./GraphNodeInstance";
import type { GraphNote } from "./GraphNote";

/** Immutable read model consumed by queries, rendering, and future tests. */
export interface GraphSnapshot {
  nodes: readonly GraphNodeInstance[];
  notes: readonly GraphNote[];
  badges: readonly GraphBadge[];
  edges: readonly GraphEdge[];
  expansions: readonly GraphExpansion[];
  lenses: readonly GraphLens[];
}

/** Implemented by GraphStore later; easy to adapt to the current engine now. */
export interface GraphSnapshotSource {
  getSnapshot(): GraphSnapshot;
}
