import type { GraphBadge } from "../graph-domain/GraphBadge";
import {
  createEmptyGraphChangeSet,
  type GraphChangeSet
} from "../graph-domain/GraphChangeSet";
import type { GraphEdge } from "../graph-domain/GraphEdge";
import type { GraphExpansion } from "../graph-domain/GraphExpansion";
import type { GraphNodeInstance } from "../graph-domain/GraphNodeInstance";
import type { GraphNote } from "../graph-domain/GraphNote";
import type { NoteId } from "../graph-domain/graph-identifiers";
import type { GraphBadgeTogglePlan } from "./GraphBadgeTogglePlan";

export type GraphBadgeExpandPlan = Extract<GraphBadgeTogglePlan, { kind: "expand" }>;

/** Domain entities prepared for one relationship target before graph mutation. */
export interface MaterializedGraphExpansionTarget {
  note: GraphNote;
  node: GraphNodeInstance;
  edge: GraphEdge;
  badges: readonly GraphBadge[];
}

export interface GraphExpansionChangeSetInput {
  plan: GraphBadgeExpandPlan;
  badge: GraphBadge;
  targets: readonly MaterializedGraphExpansionTarget[];
  parentExpansion?: GraphExpansion;
}

export type GraphExpansionChangeSetFailureReason =
  | "badge-outdated"
  | "parent-expansion-outdated"
  | "target-set-mismatch"
  | "target-outdated"
  | "duplicate-node-id"
  | "duplicate-edge-id"
  | "duplicate-badge-id";

export type GraphExpansionChangeSetResult =
  | { ok: true; changeSet: GraphChangeSet }
  | {
      ok: false;
      reason: GraphExpansionChangeSetFailureReason;
      targetNoteId?: NoteId;
    };

/**
 * Creates the durable state transition for a materialized badge expansion.
 * This function validates identities and has no store, host, or rendering effects.
 */
export function createGraphExpansionChangeSet(
  input: GraphExpansionChangeSetInput
): GraphExpansionChangeSetResult {
  const { plan, badge } = input;
  if (
    badge.id !== plan.badgeId
    || badge.nodeId !== plan.sourceNodeId
    || badge.linkTypeId !== plan.linkTypeId
    || badge.contextId !== plan.contextId
    || badge.semantic !== "link"
    || badge.state !== "collapsed"
    || badge.expansionId !== undefined
  ) {
    return { ok: false, reason: "badge-outdated" };
  }

  if (
    (plan.parentExpansionId === null && input.parentExpansion !== undefined)
    || (plan.parentExpansionId !== null
      && (input.parentExpansion?.id !== plan.parentExpansionId
        || input.parentExpansion.contextId !== plan.contextId
        || !input.parentExpansion.ownedNodeIds.includes(plan.sourceNodeId)))
  ) {
    return { ok: false, reason: "parent-expansion-outdated" };
  }

  const targetByNoteId = new Map<NoteId, MaterializedGraphExpansionTarget>();
  for (const target of input.targets) {
    if (targetByNoteId.has(target.note.id)) {
      return {
        ok: false,
        reason: "target-set-mismatch",
        targetNoteId: target.note.id
      };
    }
    targetByNoteId.set(target.note.id, target);
  }
  if (
    targetByNoteId.size !== plan.targetNoteIds.length
    || plan.targetNoteIds.some((noteId) => !targetByNoteId.has(noteId))
  ) {
    return { ok: false, reason: "target-set-mismatch" };
  }

  const orderedTargets: MaterializedGraphExpansionTarget[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const badgeIds = new Set<string>([badge.id]);
  for (const targetNoteId of plan.targetNoteIds) {
    const target = targetByNoteId.get(targetNoteId)!;
    if (
      target.node.noteId !== targetNoteId
      || target.node.contextId !== plan.contextId
      || target.edge.fromNodeId !== plan.sourceNodeId
      || target.edge.toNodeId !== target.node.id
      || target.edge.linkTypeId !== plan.linkTypeId
      || target.edge.contextId !== plan.contextId
    ) {
      return { ok: false, reason: "target-outdated", targetNoteId };
    }
    if (nodeIds.has(target.node.id)) {
      return { ok: false, reason: "duplicate-node-id", targetNoteId };
    }
    if (edgeIds.has(target.edge.id)) {
      return { ok: false, reason: "duplicate-edge-id", targetNoteId };
    }
    nodeIds.add(target.node.id);
    edgeIds.add(target.edge.id);
    for (const targetBadge of target.badges) {
      if (
        targetBadge.nodeId !== target.node.id
        || targetBadge.contextId !== plan.contextId
        || targetBadge.state !== "collapsed"
        || targetBadge.expansionId !== undefined
      ) {
        return { ok: false, reason: "target-outdated", targetNoteId };
      }
      if (badgeIds.has(targetBadge.id)) {
        return { ok: false, reason: "duplicate-badge-id", targetNoteId };
      }
      badgeIds.add(targetBadge.id);
    }
    orderedTargets.push(target);
  }

  const expansion: GraphExpansion = {
    id: plan.expansionId,
    sourceNodeId: plan.sourceNodeId,
    sourceNoteId: plan.sourceNoteId,
    linkTypeId: plan.linkTypeId,
    contextId: plan.contextId,
    ownedNodeIds: orderedTargets.map((target) => target.node.id),
    ownedEdgeIds: orderedTargets.map((target) => target.edge.id),
    childExpansionIds: []
  };
  const expansionUpserts = input.parentExpansion
    ? [{
        ...input.parentExpansion,
        childExpansionIds: Array.from(new Set([
          ...input.parentExpansion.childExpansionIds,
          plan.expansionId
        ]))
      }, expansion]
    : [expansion];
  const empty = createEmptyGraphChangeSet({
    kind: "badge-expand",
    badgeId: plan.badgeId,
    expansionId: plan.expansionId
  });

  return {
    ok: true,
    changeSet: {
      ...empty,
      notes: { upsert: orderedTargets.map((target) => target.note), removeIds: [] },
      nodes: { upsert: orderedTargets.map((target) => target.node), removeIds: [] },
      edges: { upsert: orderedTargets.map((target) => target.edge), removeIds: [] },
      badges: {
        upsert: [
          { ...badge, state: "expanded", expansionId: plan.expansionId },
          ...orderedTargets.flatMap((target) => target.badges)
        ],
        removeIds: []
      },
      expansions: { upsert: expansionUpserts, removeIds: [] }
    }
  };
}
