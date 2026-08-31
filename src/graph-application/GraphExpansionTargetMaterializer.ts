import type { GraphBadge } from "../graph-domain/GraphBadge";
import type { GraphEdge, GraphEdgeOrigin } from "../graph-domain/GraphEdge";
import type { GraphNodeInstance, GraphPoint } from "../graph-domain/GraphNodeInstance";
import type { GraphNote } from "../graph-domain/GraphNote";
import type {
  GraphContextId,
  LinkTypeId,
  NodeInstanceId,
  NoteId
} from "../graph-domain/graph-identifiers";
import type {
  GraphBadgeExpandPlan,
  MaterializedGraphExpansionTarget
} from "./GraphExpansionChangeSet";
import type { GraphQueries } from "./GraphQueries";

/** Reads a note without exposing an Obsidian file or metadata-cache object. */
export interface GraphExpansionNoteReader {
  readNote(noteId: NoteId): Promise<GraphNote | undefined>;
}

export interface GraphExpansionNodePlacementInput {
  sourceNode: GraphNodeInstance;
  targetNote: GraphNote;
  siblingIndex: number;
  nodeRadius: number;
  preferredDistance: number;
}

/** Allows layout or physics policy to choose the initial position of a new node. */
export interface GraphExpansionNodePlacer {
  place(input: GraphExpansionNodePlacementInput): GraphPoint;
}

export interface GraphExpansionTargetMaterializerOptions {
  defaultNodeRadius?: number;
  preferredDistance?: number;
  edgeOrigin?: GraphEdgeOrigin;
}

export type GraphExpansionTargetMaterializationResult =
  | { ok: true; targets: readonly MaterializedGraphExpansionTarget[] }
  | {
      ok: false;
      reason:
        | "badge-outdated"
        | "source-node-not-found"
        | "target-note-unavailable"
        | "target-note-outdated";
      targetNoteId?: NoteId;
    };

export interface GraphExpansionTargetMaterializer {
  materialize(
    plan: GraphBadgeExpandPlan,
    badge: GraphBadge
  ): Promise<GraphExpansionTargetMaterializationResult>;
}

/** Golden-angle placement mirroring the current expansion's radial starting layout. */
export class RadialGraphExpansionNodePlacer implements GraphExpansionNodePlacer {
  place(input: GraphExpansionNodePlacementInput): GraphPoint {
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const angle = -Math.PI / 2 + input.siblingIndex * goldenAngle;
    const distance = Math.max(
      input.nodeRadius * 4,
      input.preferredDistance * 0.75
    );
    return {
      x: input.sourceNode.position.x + Math.cos(angle) * distance,
      y: input.sourceNode.position.y + Math.sin(angle) * distance
    };
  }
}

/**
 * Turns target note IDs into complete graph entities without mutating graph state.
 * Host note reads and initial node placement are supplied through narrow ports.
 */
export class DefaultGraphExpansionTargetMaterializer
implements GraphExpansionTargetMaterializer {
  private readonly defaultNodeRadius: number;
  private readonly preferredDistance: number;
  private readonly edgeOrigin: GraphEdgeOrigin;

  constructor(
    private readonly queries: GraphQueries,
    private readonly noteReader: GraphExpansionNoteReader,
    private readonly nodePlacer: GraphExpansionNodePlacer = new RadialGraphExpansionNodePlacer(),
    options: GraphExpansionTargetMaterializerOptions = {}
  ) {
    this.defaultNodeRadius = positiveNumber(options.defaultNodeRadius, 20);
    this.preferredDistance = positiveNumber(options.preferredDistance, 120);
    this.edgeOrigin = options.edgeOrigin ?? "discovered";
  }

  async materialize(
    plan: GraphBadgeExpandPlan,
    badge: GraphBadge
  ): Promise<GraphExpansionTargetMaterializationResult> {
    if (!badgeMatchesPlan(badge, plan)) {
      return { ok: false, reason: "badge-outdated" };
    }
    const sourceNode = this.queries.getNodeInstance(plan.sourceNodeId);
    if (
      !sourceNode
      || sourceNode.noteId !== plan.sourceNoteId
      || sourceNode.contextId !== plan.contextId
    ) {
      return { ok: false, reason: "source-node-not-found" };
    }

    const existingEdges = this.queries.getEdges();
    const existingSiblingCount = existingEdges.filter((edge) =>
      edge.fromNodeId === plan.sourceNodeId
      && edge.linkTypeId === plan.linkTypeId
      && edge.contextId === plan.contextId
    ).length;
    const targets: MaterializedGraphExpansionTarget[] = [];
    let createdNodeCount = 0;

    for (const targetNoteId of plan.targetNoteIds) {
      const note = this.queries.getNote(targetNoteId)
        ?? await this.noteReader.readNote(targetNoteId);
      if (!note) {
        return { ok: false, reason: "target-note-unavailable", targetNoteId };
      }
      if (note.id !== targetNoteId) {
        return { ok: false, reason: "target-note-outdated", targetNoteId };
      }

      const existingNode = this.findReusableNode(plan, badge, note.id, existingEdges);
      const node = existingNode ?? this.createNode(
        plan,
        badge,
        note,
        sourceNode,
        existingSiblingCount + createdNodeCount
      );
      if (!existingNode) createdNodeCount += 1;
      const existingEdge = existingEdges.find((edge) =>
        edge.fromNodeId === plan.sourceNodeId
        && edge.toNodeId === node.id
        && edge.linkTypeId === plan.linkTypeId
        && edge.contextId === plan.contextId
      );
      const edge = existingEdge ?? createGraphExpansionEdge(plan, node.id, this.edgeOrigin);
      targets.push({ note, node, edge });
    }

    return { ok: true, targets };
  }

  private findReusableNode(
    plan: GraphBadgeExpandPlan,
    badge: GraphBadge,
    noteId: NoteId,
    existingEdges: readonly GraphEdge[]
  ): GraphNodeInstance | undefined {
    const candidates = this.queries.getNodeInstancesForNote(noteId)
      .filter((node) => node.contextId === plan.contextId);
    const nodesById = new Map(candidates.map((node) => [node.id, node]));
    const semanticTarget = existingEdges
      .filter((edge) =>
        edge.fromNodeId === plan.sourceNodeId
        && edge.linkTypeId === plan.linkTypeId
        && edge.contextId === plan.contextId
      )
      .map((edge) => nodesById.get(edge.toNodeId))
      .find((node): node is GraphNodeInstance => node !== undefined);
    if (semanticTarget) return semanticTarget;

    if (badge.duplicateNodes) {
      return nodesById.get(createDuplicateGraphNodeId(
        plan.sourceNodeId,
        noteId,
        plan.linkTypeId
      ));
    }

    return [...candidates].sort((left, right) => {
      const leftDirect = left.id === noteId ? 0 : 1;
      const rightDirect = right.id === noteId ? 0 : 1;
      if (leftDirect !== rightDirect) return leftDirect - rightDirect;
      const leftRoot = left.origin.kind === "root" ? 0 : 1;
      const rightRoot = right.origin.kind === "root" ? 0 : 1;
      return leftRoot - rightRoot || left.id.localeCompare(right.id);
    })[0];
  }

  private createNode(
    plan: GraphBadgeExpandPlan,
    badge: GraphBadge,
    note: GraphNote,
    sourceNode: GraphNodeInstance,
    siblingIndex: number
  ): GraphNodeInstance {
    const radius = positiveNumber(note.configuredSize, this.defaultNodeRadius);
    const id = badge.duplicateNodes
      ? createDuplicateGraphNodeId(plan.sourceNodeId, note.id, plan.linkTypeId)
      : createContextGraphNodeId(note.id, plan.contextId);
    return {
      id,
      noteId: note.id,
      contextId: plan.contextId,
      position: this.nodePlacer.place({
        sourceNode,
        targetNote: note,
        siblingIndex,
        nodeRadius: radius,
        preferredDistance: this.preferredDistance
      }),
      velocity: { x: 0, y: 0 },
      radius,
      pinned: false,
      selected: false,
      origin: {
        kind: "badge-expansion",
        expansionId: plan.expansionId,
        sourceNodeId: plan.sourceNodeId
      }
    };
  }
}

export function createDuplicateGraphNodeId(
  sourceNodeId: NodeInstanceId,
  targetNoteId: NoteId,
  linkTypeId: LinkTypeId
): NodeInstanceId {
  return `__o3dup__::${encodeURIComponent(targetNoteId)}::${encodeURIComponent(sourceNodeId)}::${encodeURIComponent(linkTypeId)}`;
}

export function createContextGraphNodeId(
  noteId: NoteId,
  contextId: GraphContextId
): NodeInstanceId {
  if (contextId === "graph:root") return noteId;
  if (contextId.startsWith("embedded:")) {
    return `__o3embed__::${encodeURIComponent(contextId.slice("embedded:".length))}::${encodeURIComponent(noteId)}`;
  }
  return `__o3context__::${encodeURIComponent(contextId)}::${encodeURIComponent(noteId)}`;
}

export function createGraphExpansionEdge(
  plan: GraphBadgeExpandPlan,
  targetNodeId: NodeInstanceId,
  origin: GraphEdgeOrigin = "discovered"
): GraphEdge {
  return {
    id: `edge::${plan.sourceNodeId}::${targetNodeId}::${plan.linkTypeId}::${plan.linkTypeId}`,
    fromNodeId: plan.sourceNodeId,
    toNodeId: targetNodeId,
    linkTypeId: plan.linkTypeId,
    contextId: plan.contextId,
    origin
  };
}

function badgeMatchesPlan(badge: GraphBadge, plan: GraphBadgeExpandPlan): boolean {
  return badge.id === plan.badgeId
    && badge.nodeId === plan.sourceNodeId
    && badge.linkTypeId === plan.linkTypeId
    && badge.contextId === plan.contextId
    && badge.semantic === "link"
    && badge.state === "collapsed"
    && badge.expansionId === undefined;
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
}
