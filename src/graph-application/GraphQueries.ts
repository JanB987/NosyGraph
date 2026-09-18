import type { GraphBadge } from "../graph-domain/GraphBadge";
import type { GraphEdge } from "../graph-domain/GraphEdge";
import type { GraphExpansion } from "../graph-domain/GraphExpansion";
import type { GraphLens } from "../graph-domain/GraphLens";
import type { GraphNodeInstance } from "../graph-domain/GraphNodeInstance";
import type { GraphNote } from "../graph-domain/GraphNote";
import type { GraphSnapshot, GraphSnapshotSource } from "../graph-domain/GraphSnapshot";
import type {
  BadgeId,
  ExpansionId,
  GraphContextId,
  LinkTypeId,
  LensId,
  NodeInstanceId,
  NoteId
} from "../graph-domain/graph-identifiers";

/**
 * Read-only questions about the current graph.
 *
 * Every method returns a new array so callers cannot mutate snapshot
 * collections accidentally.
 */
export class GraphQueries {
  constructor(private readonly source: GraphSnapshotSource) {}

  getSnapshot(): GraphSnapshot {
    return this.source.getSnapshot();
  }

  getAllNodeInstances(): readonly GraphNodeInstance[] {
    return [...this.snapshot().nodes];
  }

  getNodeInstance(nodeId: NodeInstanceId): GraphNodeInstance | undefined {
    return this.snapshot().nodes.find((node) => node.id === nodeId);
  }

  getVisibleNodeInstances(contextId?: GraphContextId): readonly GraphNodeInstance[] {
    const nodes = this.snapshot().nodes;
    return contextId === undefined
      ? [...nodes]
      : nodes.filter((node) => node.contextId === contextId);
  }

  getUniqueVisibleNotes(contextId?: GraphContextId): readonly GraphNote[] {
    const snapshot = this.snapshot();
    const notesById = new Map(snapshot.notes.map((note) => [note.id, note]));
    const result: GraphNote[] = [];
    const seen = new Set<NoteId>();

    for (const node of snapshot.nodes) {
      if (contextId !== undefined && node.contextId !== contextId) continue;
      if (seen.has(node.noteId)) continue;
      const note = notesById.get(node.noteId);
      if (!note) continue;
      seen.add(node.noteId);
      result.push(note);
    }

    return result;
  }

  getNote(noteId: NoteId): GraphNote | undefined {
    return this.snapshot().notes.find((note) => note.id === noteId);
  }

  getNodeInstancesForNote(noteId: NoteId): readonly GraphNodeInstance[] {
    return this.snapshot().nodes.filter((node) => node.noteId === noteId);
  }

  getSelectedNodes(): readonly GraphNodeInstance[] {
    return this.snapshot().nodes.filter((node) => node.selected);
  }

  getRootNodes(): readonly GraphNodeInstance[] {
    return this.snapshot().nodes.filter((node) => node.origin.kind === "root");
  }

  getBadges(): readonly GraphBadge[] {
    return [...this.snapshot().badges];
  }

  getBadge(badgeId: BadgeId): GraphBadge | undefined {
    return this.snapshot().badges.find((badge) => badge.id === badgeId);
  }

  getBadgesForNode(nodeId: NodeInstanceId): readonly GraphBadge[] {
    return this.snapshot().badges.filter((badge) => badge.nodeId === nodeId);
  }

  getEdges(): readonly GraphEdge[] {
    return [...this.snapshot().edges];
  }

  getEdgesForNode(nodeId: NodeInstanceId): readonly GraphEdge[] {
    return this.snapshot().edges.filter((edge) =>
      edge.fromNodeId === nodeId || edge.toNodeId === nodeId
    );
  }

  getLenses(): readonly GraphLens[] {
    return [...this.snapshot().lenses];
  }

  getLens(lensId: LensId): GraphLens | undefined {
    return this.snapshot().lenses.find((lens) => lens.id === lensId);
  }

  getLensNodes(lensId: LensId): readonly GraphNodeInstance[] {
    const snapshot = this.snapshot();
    const lens = snapshot.lenses.find((candidate) => candidate.id === lensId);
    if (!lens) return [];
    return snapshot.nodes.filter((node) => node.contextId === lens.contextId);
  }

  getExpansion(expansionId: ExpansionId): GraphExpansion | undefined {
    return this.snapshot().expansions.find((expansion) => expansion.id === expansionId);
  }

  getNodesForExpansion(expansionId: ExpansionId): readonly GraphNodeInstance[] {
    const snapshot = this.snapshot();
    const expansion = snapshot.expansions.find((candidate) => candidate.id === expansionId);
    if (!expansion) return [];
    return this.nodesByIds(snapshot, expansion.ownedNodeIds);
  }

  getNodesForBadge(
    sourceNodeId: NodeInstanceId,
    linkTypeId: LinkTypeId
  ): readonly GraphNodeInstance[] {
    const snapshot = this.snapshot();
    const nodeIds = new Set<NodeInstanceId>();

    for (const expansion of snapshot.expansions) {
      if (expansion.sourceNodeId !== sourceNodeId || expansion.linkTypeId !== linkTypeId) continue;
      for (const nodeId of expansion.ownedNodeIds) nodeIds.add(nodeId);
    }

    return this.nodesByIds(snapshot, nodeIds);
  }

  private snapshot(): GraphSnapshot {
    return this.source.getSnapshot();
  }

  private nodesByIds(
    snapshot: GraphSnapshot,
    ids: Iterable<NodeInstanceId>
  ): readonly GraphNodeInstance[] {
    const wanted = new Set(ids);
    return snapshot.nodes.filter((node) => wanted.has(node.id));
  }
}
