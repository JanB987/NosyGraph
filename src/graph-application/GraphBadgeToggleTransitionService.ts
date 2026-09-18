import type { GraphChangeSet } from "../graph-domain/GraphChangeSet";
import {
  createGraphCollapseChangeSet,
  type GraphCollapseChangeSetResult
} from "./GraphCollapseChangeSet";
import type { GraphBadgeTogglePlan } from "./GraphBadgeTogglePlan";
import type {
  GraphExpansionTransitionCreator,
  GraphExpansionTransitionResult
} from "./GraphExpansionTransitionService";
import type { GraphQueries } from "./GraphQueries";

type ExpansionTransitionFailure = Extract<
  GraphExpansionTransitionResult,
  { ok: false }
>;
type CollapseTransitionFailure = Extract<
  GraphCollapseChangeSetResult,
  { ok: false }
>;

export type GraphBadgeToggleTransitionResult =
  | {
      ok: true;
      effect: "expand" | "collapse";
      changeSet: GraphChangeSet;
    }
  | {
      ok: false;
      branch: "plan";
      failure: { reason: "unsupported-action" | "unsupported-semantic" };
    }
  | {
      ok: false;
      branch: "expand";
      failure: ExpansionTransitionFailure;
    }
  | {
      ok: false;
      branch: "collapse";
      failure: CollapseTransitionFailure;
    };

export interface GraphBadgeToggleTransitionCreator {
  create(plan: GraphBadgeTogglePlan): Promise<GraphBadgeToggleTransitionResult>;
}

/** Routes a planned badge toggle into one host-neutral atomic transition. */
export class GraphBadgeToggleTransitionService
  implements GraphBadgeToggleTransitionCreator {
  constructor(
    private readonly queries: GraphQueries,
    private readonly expansionTransitions: GraphExpansionTransitionCreator
  ) {}

  async create(plan: GraphBadgeTogglePlan): Promise<GraphBadgeToggleTransitionResult> {
    if (plan.kind === "unsupported") {
      return {
        ok: false,
        branch: "plan",
        failure: { reason: plan.reason }
      };
    }
    if (plan.kind === "collapse") {
      const collapse = createGraphCollapseChangeSet(plan, this.queries.getSnapshot());
      return collapse.ok
        ? { ok: true, effect: "collapse", changeSet: collapse.changeSet }
        : { ok: false, branch: "collapse", failure: collapse };
    }

    const expansion = await this.expansionTransitions.create(plan);
    return expansion.ok
      ? { ok: true, effect: "expand", changeSet: expansion.changeSet }
      : { ok: false, branch: "expand", failure: expansion };
  }
}
