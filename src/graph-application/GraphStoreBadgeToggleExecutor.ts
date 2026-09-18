import type {
  GraphBadgeToggleExecutionResult,
  GraphBadgeToggleExecutor
} from "./GraphBadgeToggleExecutor";
import type { GraphBadgeTogglePlan } from "./GraphBadgeTogglePlan";
import type { GraphBadgeToggleTransitionCreator } from "./GraphBadgeToggleTransitionService";
import type { GraphStore } from "./GraphStore";

/** Applies a calculated badge transition to GraphStore if its source state is current. */
export class GraphStoreBadgeToggleExecutor implements GraphBadgeToggleExecutor {
  constructor(
    private readonly store: GraphStore,
    private readonly transitions: GraphBadgeToggleTransitionCreator
  ) {}

  async execute(plan: GraphBadgeTogglePlan): Promise<GraphBadgeToggleExecutionResult> {
    if (plan.kind === "unsupported") {
      return { status: "rejected", badgeId: plan.badgeId, reason: "unsupported-plan" };
    }

    const expectedRevision = this.store.getRevision();
    const transition = await this.transitions.create(plan);
    if (!transition.ok) {
      return { status: "rejected", badgeId: plan.badgeId, reason: "transition-failed" };
    }

    const application = this.store.applyChangeSet(
      transition.changeSet,
      expectedRevision
    );
    if (!application.applied) {
      return {
        status: "rejected",
        badgeId: plan.badgeId,
        reason: application.reason === "revision-mismatch"
          ? "stale-transition"
          : "store-rejected"
      };
    }

    return {
      status: "applied",
      badgeId: plan.badgeId,
      expansionId: plan.expansionId,
      effect: transition.effect
    };
  }
}
