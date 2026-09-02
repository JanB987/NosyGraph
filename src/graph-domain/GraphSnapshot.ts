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

/** Creates a detached snapshot suitable for handing across application boundaries. */
export function copyGraphSnapshot(snapshot: GraphSnapshot): GraphSnapshot {
  return {
    notes: snapshot.notes.map((note) => ({
      ...note,
      properties: copyGraphRecord(note.properties)
    })),
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      velocity: { ...node.velocity },
      origin: { ...node.origin }
    })),
    edges: snapshot.edges.map((edge) => ({ ...edge })),
    badges: snapshot.badges.map((badge) => ({ ...badge })),
    expansions: snapshot.expansions.map((expansion) => ({
      ...expansion,
      ownedNodeIds: [...expansion.ownedNodeIds],
      ownedEdgeIds: [...expansion.ownedEdgeIds],
      childExpansionIds: [...expansion.childExpansionIds]
    })),
    lenses: snapshot.lenses.map((lens) => ({
      ...lens,
      bounds: { ...lens.bounds },
      viewport: { ...lens.viewport }
    }))
  };
}

function copyGraphRecord(
  record: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, copyGraphValue(value)])
  );
}

function copyGraphValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copyGraphValue);
  if (value && typeof value === "object") {
    return copyGraphRecord(value as Readonly<Record<string, unknown>>);
  }
  return value;
}
