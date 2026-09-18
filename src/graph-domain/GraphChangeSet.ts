import type { GraphBadge } from "./GraphBadge";
import type { GraphEdge } from "./GraphEdge";
import type { GraphExpansion } from "./GraphExpansion";
import type { GraphLens } from "./GraphLens";
import type { GraphNodeInstance } from "./GraphNodeInstance";
import type { GraphNote } from "./GraphNote";
import type {
  BadgeId,
  EdgeId,
  ExpansionId,
  LensId,
  NodeInstanceId,
  NoteId
} from "./graph-identifiers";

export type GraphChangeCause =
  | { kind: "badge-expand"; badgeId: BadgeId; expansionId: ExpansionId }
  | { kind: "badge-collapse"; badgeId: BadgeId; expansionId: ExpansionId };

export interface GraphEntityChanges<TEntity, TId> {
  upsert: readonly TEntity[];
  removeIds: readonly TId[];
}

/** Atomic, host-neutral changes to the durable graph snapshot collections. */
export interface GraphChangeSet {
  cause: GraphChangeCause;
  notes: GraphEntityChanges<GraphNote, NoteId>;
  nodes: GraphEntityChanges<GraphNodeInstance, NodeInstanceId>;
  edges: GraphEntityChanges<GraphEdge, EdgeId>;
  badges: GraphEntityChanges<GraphBadge, BadgeId>;
  expansions: GraphEntityChanges<GraphExpansion, ExpansionId>;
  lenses: GraphEntityChanges<GraphLens, LensId>;
}

export function createEmptyGraphChangeSet(cause: GraphChangeCause): GraphChangeSet {
  return {
    cause: { ...cause },
    notes: { upsert: [], removeIds: [] },
    nodes: { upsert: [], removeIds: [] },
    edges: { upsert: [], removeIds: [] },
    badges: { upsert: [], removeIds: [] },
    expansions: { upsert: [], removeIds: [] },
    lenses: { upsert: [], removeIds: [] }
  };
}

export function countGraphChanges(changeSet: GraphChangeSet): number {
  return [
    changeSet.notes,
    changeSet.nodes,
    changeSet.edges,
    changeSet.badges,
    changeSet.expansions,
    changeSet.lenses
  ].reduce(
    (count, changes) => count + changes.upsert.length + changes.removeIds.length,
    0
  );
}

export function hasGraphChanges(changeSet: GraphChangeSet): boolean {
  return countGraphChanges(changeSet) > 0;
}
