import type { BadgeId } from "../graph-domain/graph-identifiers";
import type { GraphBadgeRequest } from "./GraphBadgeRequest";
import type {
  GraphBadgeToggleExecutionResult,
  GraphBadgeToggleExecutor
} from "./GraphBadgeToggleExecutor";
import type {
  GraphBadgeTogglePlanner,
  GraphBadgeToggleUnavailable
} from "./GraphBadgeToggleService";

export interface GraphBadgeToggleHandlerUnavailable {
  status: "unavailable";
  badgeId: BadgeId;
  reason: GraphBadgeToggleUnavailable["reason"];
}

export type GraphBadgeToggleHandlerResult =
  | GraphBadgeToggleExecutionResult
  | GraphBadgeToggleHandlerUnavailable;

/** Joins toggle planning and execution behind one application operation. */
export class GraphBadgeToggleHandler {
  constructor(
    private readonly planner: GraphBadgeTogglePlanner,
    private readonly executor: GraphBadgeToggleExecutor
  ) {}

  async handle(request: GraphBadgeRequest): Promise<GraphBadgeToggleHandlerResult> {
    const plan = await this.planner.plan(request);
    if (plan.kind === "unavailable") {
      return {
        status: "unavailable",
        badgeId: plan.badgeId,
        reason: plan.reason
      };
    }
    return this.executor.execute(plan);
  }
}
