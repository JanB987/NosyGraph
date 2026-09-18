import type { GraphBadge } from "../graph-domain/GraphBadge";
import type { GraphEdge, GraphEdgeOrigin } from "../graph-domain/GraphEdge";
import type { GraphExpansion } from "../graph-domain/GraphExpansion";
import type { GraphLens } from "../graph-domain/GraphLens";
import type { GraphNodeInstance } from "../graph-domain/GraphNodeInstance";
import type { GraphNote } from "../graph-domain/GraphNote";
import type { GraphSnapshot, GraphSnapshotSource } from "../graph-domain/GraphSnapshot";
import type { GraphContextId, NodeInstanceId } from "../graph-domain/graph-identifiers";

export const ROOT_GRAPH_CONTEXT_ID: GraphContextId = "graph:root";

/** A copied node record exposed by the legacy engine during migration. */
export interface LegacyGraphReadNode extends GraphNodeInstance {
  noteName: string;
}

/** A copied expansion record exposed by the legacy engine during migration. */
export type LegacyGraphReadExpansion = GraphExpansion;

export type LegacyGraphReadBadge = GraphBadge;

export type LegacyGraphReadEdge = GraphEdge;

export type LegacyGraphReadLens = GraphLens;

export interface LegacyGraphReadState {
  nodes: readonly LegacyGraphReadNode[];
  badges: readonly LegacyGraphReadBadge[];
  edges: readonly LegacyGraphReadEdge[];
  expansions: readonly LegacyGraphReadExpansion[];
  lenses: readonly LegacyGraphReadLens[];
}

export interface LegacyGraphReadSource {
  getLegacyGraphReadState(): LegacyGraphReadState;
}

export interface LegacyGraphNoteReader {
  readNote(path: string, fallbackName: string): GraphNote;
}

export interface LegacyGraphEdgeIdentityInput {
  legacyId: string;
  badgeExpansionId: string;
  ownedByBadgeExpansion: boolean;
  relationship?: "parent";
  mode?: "overlay" | "visible";
}

/** Preserves special legacy edges and normalizes edges owned by badge expansion. */
export function resolveLegacyGraphEdgeIdentity(
  input: LegacyGraphEdgeIdentityInput
): { id: string; origin: GraphEdgeOrigin } {
  if (input.relationship === "parent") {
    return { id: input.legacyId, origin: "parent" };
  }
  if (input.mode === "overlay") {
    return { id: input.legacyId, origin: "overlay" };
  }
  if (input.mode === "visible") {
    return { id: input.legacyId, origin: "visible" };
  }
  if (input.ownedByBadgeExpansion) {
    return { id: input.badgeExpansionId, origin: "badge-expansion" };
  }
  return { id: input.legacyId, origin: "discovered" };
}

/**
 * Temporary bridge from the active GraphEngine to the new immutable snapshot.
 * It can be deleted after GraphStore becomes the runtime state owner.
 */
export class LegacyGraphSnapshotAdapter implements GraphSnapshotSource {
  constructor(
    private readonly source: LegacyGraphReadSource,
    private readonly noteReader: LegacyGraphNoteReader
  ) {}

  getSnapshot(): GraphSnapshot {
    const legacy = this.source.getLegacyGraphReadState();
    const notes = this.readUniqueNotes(legacy.nodes);
    const nodes = legacy.nodes.map((node) => this.copyNode(node));
    const badges = legacy.badges.map((badge) => ({ ...badge }));
    const edges = legacy.edges.map((edge) => ({ ...edge }));
    const expansions = legacy.expansions.map((expansion) => this.copyExpansion(expansion));
    const lenses = legacy.lenses.map((lens) => ({
      ...lens,
      bounds: { ...lens.bounds },
      viewport: { ...lens.viewport }
    }));

    return { nodes, notes, badges, edges, expansions, lenses };
  }

  private readUniqueNotes(nodes: readonly LegacyGraphReadNode[]): GraphNote[] {
    const result: GraphNote[] = [];
    const namesByNoteId = new Map<string, string>();

    for (const node of nodes) {
      if (!namesByNoteId.has(node.noteId)) namesByNoteId.set(node.noteId, node.noteName);
    }

    for (const [noteId, fallbackName] of namesByNoteId) {
      result.push(this.noteReader.readNote(noteId, fallbackName));
    }

    return result;
  }

  private copyNode(node: LegacyGraphReadNode): GraphNodeInstance {
    return {
      id: node.id,
      noteId: node.noteId,
      contextId: node.contextId,
      position: { ...node.position },
      velocity: { ...node.velocity },
      radius: node.radius,
      pinned: node.pinned,
      selected: node.selected,
      origin: { ...node.origin }
    };
  }

  private copyExpansion(expansion: LegacyGraphReadExpansion): GraphExpansion {
    return {
      ...expansion,
      ownedNodeIds: [...expansion.ownedNodeIds],
      ownedEdgeIds: [...expansion.ownedEdgeIds],
      childExpansionIds: [...expansion.childExpansionIds]
    };
  }
}

export function contextIdForLegacyNode(
  embeddedInstanceId: string | undefined
): GraphContextId {
  const normalized = String(embeddedInstanceId ?? "").trim();
  return normalized ? `embedded:${normalized}` : ROOT_GRAPH_CONTEXT_ID;
}

export function uniqueExistingNodeIds(
  ids: Iterable<NodeInstanceId>,
  existingIds: ReadonlySet<NodeInstanceId>
): NodeInstanceId[] {
  return Array.from(new Set(ids)).filter((id) => existingIds.has(id));
}
