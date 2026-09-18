import type { BadgeId, ExpansionId } from "../graph-domain/graph-identifiers";
import type { GraphBadgeTogglePlan } from "./GraphBadgeTogglePlan";

export type GraphBadgeToggleExecutionResult =
  | {
      status: "applied";
      badgeId: BadgeId;
      expansionId: ExpansionId;
      effect: "expand" | "collapse";
    }
  | {
      status: "unchanged";
      badgeId: BadgeId;
      expansionId: ExpansionId;
      reason: "already-expanded" | "already-collapsed";
    }
  | {
      status: "rejected";
      badgeId: BadgeId;
      reason:
        | "unsupported-plan"
        | "target-not-found"
        | "transition-failed"
        | "stale-transition"
        | "store-rejected";
    };

/** Applies a previously validated toggle plan. */
export interface GraphBadgeToggleExecutor {
  execute(plan: GraphBadgeTogglePlan): Promise<GraphBadgeToggleExecutionResult>;
}
