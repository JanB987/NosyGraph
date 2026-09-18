import type { GraphBadge } from "../graph-domain/GraphBadge";
import {
  createEmptyGraphChangeSet,
  type GraphChangeSet
} from "../graph-domain/GraphChangeSet";
import type { GraphExpansion } from "../graph-domain/GraphExpansion";
import type { GraphNodeInstance } from "../graph-domain/GraphNodeInstance";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import type {
  EdgeId,
  ExpansionId,
  NodeInstanceId,
  NoteId
} from "../graph-domain/graph-identifiers";
import type { GraphBadgeTogglePlan } from "./GraphBadgeTogglePlan";

export type GraphBadgeCollapsePlan = Extract<GraphBadgeTogglePlan, { kind: "collapse" }>;

export type GraphCollapseChangeSetFailureReason =
  | "badge-not-found"
  | "badge-outdated"
  | "expansion-not-found"
  | "expansion-outdated"
  | "expansion-tree-outdated"
  | "owned-entity-not-found"
  | "ownership-conflict";

export type GraphCollapseChangeSetResult =
  | { ok: true; changeSet: GraphChangeSet }
  | {
      ok: false;
      reason: GraphCollapseChangeSetFailureReason;
      entityId?: string;
    };

/** Calculates a complete subtree collapse without mutating the supplied snapshot. */
export function createGraphCollapseChangeSet(
  plan: GraphBadgeCollapsePlan,
  snapshot: GraphSnapshot
): GraphCollapseChangeSetResult {
  const badge = snapshot.badges.find((candidate) => candidate.id === plan.badgeId);
  if (!badge) return { ok: false, reason: "badge-not-found" };
  if (!badgeMatchesPlan(badge, plan)) {
    return { ok: false, reason: "badge-outdated", entityId: badge.id };
  }

  const expansionById = new Map(snapshot.expansions.map((item) => [item.id, item]));
  const expansion = expansionById.get(plan.expansionId);
  if (!expansion) return { ok: false, reason: "expansion-not-found" };
  if (!expansionMatchesPlan(expansion, plan)) {
    return { ok: false, reason: "expansion-outdated", entityId: expansion.id };
  }

  const subtreeResult = collectExpansionSubtree(plan.expansionId, expansionById);
  if (!subtreeResult.ok) return subtreeResult;
  const removedExpansionIds = subtreeResult.ids;
  const removedExpansions = snapshot.expansions.filter((item) =>
    removedExpansionIds.has(item.id)
  );
  const remainingExpansions = snapshot.expansions.filter((item) =>
    !removedExpansionIds.has(item.id)
  );
  const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const edgesById = new Map(snapshot.edges.map((edge) => [edge.id, edge]));

  const candidateNodeIds = new Set<NodeInstanceId>();
  const candidateEdgeIds = new Set<EdgeId>();
  for (const item of removedExpansions) {
    for (const nodeId of item.ownedNodeIds) {
      if (!nodesById.has(nodeId)) {
        return { ok: false, reason: "owned-entity-not-found", entityId: nodeId };
      }
      candidateNodeIds.add(nodeId);
    }
    for (const edgeId of item.ownedEdgeIds) {
      if (!edgesById.has(edgeId)) {
        return { ok: false, reason: "owned-entity-not-found", entityId: edgeId };
      }
      candidateEdgeIds.add(edgeId);
    }
  }

  const remainingNodeOwners = indexNodeOwners(remainingExpansions);
  const remainingEdgeOwners = indexEdgeOwners(remainingExpansions);
  const removedEdgeIds = new Set(
    snapshot.edges
      .filter((edge) =>
        candidateEdgeIds.has(edge.id)
        && edge.origin === "badge-expansion"
        && !remainingEdgeOwners.has(edge.id)
      )
      .map((edge) => edge.id)
  );
  const removedNodeIds = new Set<NodeInstanceId>();
  const rehomedNodes: GraphNodeInstance[] = [];
  for (const node of snapshot.nodes) {
    if (!candidateNodeIds.has(node.id)) continue;
    const owners = remainingNodeOwners.get(node.id) ?? [];
    if (node.origin.kind !== "badge-expansion") continue;
    if (owners.length === 0) {
      removedNodeIds.add(node.id);
      continue;
    }
    if (removedExpansionIds.has(node.origin.expansionId)) {
      const owner = owners[0]!;
      rehomedNodes.push({
        ...node,
        origin: {
          kind: "badge-expansion",
          expansionId: owner.id,
          sourceNodeId: owner.sourceNodeId
        }
      });
    }
  }

  for (const edge of snapshot.edges) {
    if (removedEdgeIds.has(edge.id)) continue;
    if (removedNodeIds.has(edge.fromNodeId) || removedNodeIds.has(edge.toNodeId)) {
      return { ok: false, reason: "ownership-conflict", entityId: edge.id };
    }
  }
  for (const item of remainingExpansions) {
    if (removedNodeIds.has(item.sourceNodeId)) {
      return { ok: false, reason: "ownership-conflict", entityId: item.id };
    }
  }
  for (const lens of snapshot.lenses) {
    if (removedNodeIds.has(lens.sourceNodeId)) {
      return { ok: false, reason: "ownership-conflict", entityId: lens.id };
    }
  }

  const remainingNodeIds = new Set(
    snapshot.nodes
      .filter((node) => !removedNodeIds.has(node.id))
      .map((node) => node.id)
  );
  const remainingNoteIds = new Set<NoteId>(
    snapshot.nodes
      .filter((node) => remainingNodeIds.has(node.id))
      .map((node) => node.noteId)
  );
  const removedNoteIds = snapshot.notes
    .filter((note) => !remainingNoteIds.has(note.id))
    .filter((note) => snapshot.nodes.some((node) =>
      removedNodeIds.has(node.id) && node.noteId === note.id
    ))
    .map((note) => note.id);

  const badgeUpserts: GraphBadge[] = [];
  const removedBadgeIds: string[] = [];
  for (const currentBadge of snapshot.badges) {
    if (removedNodeIds.has(currentBadge.nodeId)) {
      removedBadgeIds.push(currentBadge.id);
      continue;
    }
    if (
      currentBadge.id === plan.badgeId
      || (currentBadge.expansionId !== undefined
        && removedExpansionIds.has(currentBadge.expansionId))
    ) {
      badgeUpserts.push(collapseBadge(currentBadge));
    }
  }

  const expansionUpserts = remainingExpansions.flatMap((item) => {
    const childExpansionIds = item.childExpansionIds.filter((childId) =>
      !removedExpansionIds.has(childId)
    );
    return childExpansionIds.length === item.childExpansionIds.length
      ? []
      : [{ ...item, childExpansionIds }];
  });
  const empty = createEmptyGraphChangeSet({
    kind: "badge-collapse",
    badgeId: plan.badgeId,
    expansionId: plan.expansionId
  });
  return {
    ok: true,
    changeSet: {
      ...empty,
      notes: { upsert: [], removeIds: removedNoteIds },
      nodes: { upsert: rehomedNodes, removeIds: Array.from(removedNodeIds) },
      edges: { upsert: [], removeIds: Array.from(removedEdgeIds) },
      badges: { upsert: badgeUpserts, removeIds: removedBadgeIds },
      expansions: {
        upsert: expansionUpserts,
        removeIds: snapshot.expansions
          .filter((item) => removedExpansionIds.has(item.id))
          .map((item) => item.id)
      }
    }
  };
}

function collectExpansionSubtree(
  rootId: ExpansionId,
  expansionById: ReadonlyMap<ExpansionId, GraphExpansion>
): { ok: true; ids: ReadonlySet<ExpansionId> } | {
  ok: false;
  reason: "expansion-tree-outdated";
  entityId: string;
} {
  const ids = new Set<ExpansionId>();
  const visiting = new Set<ExpansionId>();
  const visit = (id: ExpansionId): ExpansionId | null => {
    if (visiting.has(id)) return id;
    if (ids.has(id)) return null;
    const expansion = expansionById.get(id);
    if (!expansion) return id;
    visiting.add(id);
    for (const childId of expansion.childExpansionIds) {
      const invalidId = visit(childId);
      if (invalidId) return invalidId;
    }
    visiting.delete(id);
    ids.add(id);
    return null;
  };
  const invalidId = visit(rootId);
  return invalidId
    ? { ok: false, reason: "expansion-tree-outdated", entityId: invalidId }
    : { ok: true, ids };
}

function indexNodeOwners(
  expansions: readonly GraphExpansion[]
): Map<NodeInstanceId, GraphExpansion[]> {
  const result = new Map<NodeInstanceId, GraphExpansion[]>();
  for (const expansion of expansions) {
    for (const nodeId of expansion.ownedNodeIds) {
      const owners = result.get(nodeId) ?? [];
      owners.push(expansion);
      owners.sort((left, right) => left.id.localeCompare(right.id));
      result.set(nodeId, owners);
    }
  }
  return result;
}

function indexEdgeOwners(
  expansions: readonly GraphExpansion[]
): Set<EdgeId> {
  return new Set(expansions.flatMap((item) => [...item.ownedEdgeIds]));
}

function badgeMatchesPlan(badge: GraphBadge, plan: GraphBadgeCollapsePlan): boolean {
  return badge.nodeId === plan.sourceNodeId
    && badge.linkTypeId === plan.linkTypeId
    && badge.contextId === plan.contextId
    && badge.semantic === "link"
    && badge.state === "expanded"
    && badge.expansionId === plan.expansionId;
}

function expansionMatchesPlan(
  expansion: GraphExpansion,
  plan: GraphBadgeCollapsePlan
): boolean {
  return expansion.sourceNodeId === plan.sourceNodeId
    && expansion.sourceNoteId === plan.sourceNoteId
    && expansion.linkTypeId === plan.linkTypeId
    && expansion.contextId === plan.contextId;
}

function collapseBadge(badge: GraphBadge): GraphBadge {
  const { expansionId: _expansionId, ...rest } = badge;
  return { ...rest, state: "collapsed" };
}
