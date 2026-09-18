import type { GraphChangeSet } from "../graph-domain/GraphChangeSet";
import type { NoteId } from "../graph-domain/graph-identifiers";
import {
  createGraphExpansionChangeSet,
  type GraphBadgeExpandPlan,
  type GraphExpansionChangeSetFailureReason
} from "./GraphExpansionChangeSet";
import type {
  GraphExpansionTargetMaterializationResult,
  GraphExpansionTargetMaterializer
} from "./GraphExpansionTargetMaterializer";
import type { GraphQueries } from "./GraphQueries";

type MaterializationFailure = Extract<
  GraphExpansionTargetMaterializationResult,
  { ok: false }
>;

export type GraphExpansionTransitionResult =
  | { ok: true; changeSet: GraphChangeSet }
  | {
      ok: false;
      stage: "state";
      reason: "badge-not-found" | "parent-expansion-not-found";
    }
  | {
      ok: false;
      stage: "materialization";
      reason: MaterializationFailure["reason"];
      targetNoteId?: NoteId;
    }
  | {
      ok: false;
      stage: "change-set";
      reason: GraphExpansionChangeSetFailureReason;
      targetNoteId?: NoteId;
    };

export interface GraphExpansionTransitionCreator {
  create(plan: GraphBadgeExpandPlan): Promise<GraphExpansionTransitionResult>;
}

/** Composes materialization and atomic change calculation for one expansion. */
export class GraphExpansionTransitionService
  implements GraphExpansionTransitionCreator {
  constructor(
    private readonly queries: GraphQueries,
    private readonly materializer: GraphExpansionTargetMaterializer
  ) {}

  async create(plan: GraphBadgeExpandPlan): Promise<GraphExpansionTransitionResult> {
    const badge = this.queries.getBadge(plan.badgeId);
    if (!badge) {
      return { ok: false, stage: "state", reason: "badge-not-found" };
    }
    if (
      plan.parentExpansionId !== null
      && !this.queries.getExpansion(plan.parentExpansionId)
    ) {
      return { ok: false, stage: "state", reason: "parent-expansion-not-found" };
    }

    const materialized = await this.materializer.materialize(plan, badge);
    if (!materialized.ok) {
      return {
        ok: false,
        stage: "materialization",
        reason: materialized.reason,
        ...(materialized.targetNoteId !== undefined
          ? { targetNoteId: materialized.targetNoteId }
          : {})
      };
    }

    // Note reads are asynchronous, so use fresh state for final validation.
    const currentBadge = this.queries.getBadge(plan.badgeId);
    if (!currentBadge) {
      return { ok: false, stage: "state", reason: "badge-not-found" };
    }
    const parentExpansion = plan.parentExpansionId !== null
      ? this.queries.getExpansion(plan.parentExpansionId)
      : undefined;
    if (plan.parentExpansionId !== null && !parentExpansion) {
      return { ok: false, stage: "state", reason: "parent-expansion-not-found" };
    }

    const changeSet = createGraphExpansionChangeSet({
      plan,
      badge: currentBadge,
      targets: materialized.targets,
      ...(parentExpansion ? { parentExpansion } : {})
    });
    if (!changeSet.ok) {
      return {
        ok: false,
        stage: "change-set",
        reason: changeSet.reason,
        ...(changeSet.targetNoteId !== undefined
          ? { targetNoteId: changeSet.targetNoteId }
          : {})
      };
    }
    return { ok: true, changeSet: changeSet.changeSet };
  }
}
