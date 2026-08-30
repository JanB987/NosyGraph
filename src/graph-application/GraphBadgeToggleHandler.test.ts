import { describe, expect, it } from "vitest";
import type { GraphBadgeRequest } from "./GraphBadgeRequest";
import type { GraphBadgeToggleExecutor } from "./GraphBadgeToggleExecutor";
import { GraphBadgeToggleHandler } from "./GraphBadgeToggleHandler";
import type { GraphBadgeTogglePlan } from "./GraphBadgeTogglePlan";
import type { GraphBadgeTogglePlanner } from "./GraphBadgeToggleService";

const request: GraphBadgeRequest = {
  action: "toggle-badge",
  badgeId: "A.md::parts",
  nodeId: "A.md",
  noteId: "A.md",
  linkTypeId: "parts",
  contextId: "graph:root",
  semantic: "link"
};

const expandPlan: GraphBadgeTogglePlan = {
  kind: "expand",
  badgeId: "A.md::parts",
  expansionId: "A.md::parts",
  sourceNodeId: "A.md",
  sourceNoteId: "A.md",
  linkTypeId: "parts",
  contextId: "graph:root",
  targetNoteIds: ["B.md"],
  parentExpansionId: null
};

describe("GraphBadgeToggleHandler", () => {
  it("passes the exact plan from planner to executor", async () => {
    const executed: GraphBadgeTogglePlan[] = [];
    const planner: GraphBadgeTogglePlanner = { plan: async () => expandPlan };
    const executor: GraphBadgeToggleExecutor = {
      execute: async (plan) => {
        executed.push(plan);
        return {
          status: "applied",
          badgeId: plan.badgeId,
          expansionId: "A.md::parts",
          effect: "expand"
        };
      }
    };
    const handler = new GraphBadgeToggleHandler(planner, executor);

    expect(await handler.handle(request)).toEqual({
      status: "applied",
      badgeId: "A.md::parts",
      expansionId: "A.md::parts",
      effect: "expand"
    });
    expect(executed).toEqual([expandPlan]);
  });

  it("returns unavailable plans without calling the executor", async () => {
    let executions = 0;
    const planner: GraphBadgeTogglePlanner = {
      plan: async () => ({
        kind: "unavailable",
        badgeId: "A.md::parts",
        reason: "request-outdated"
      })
    };
    const executor: GraphBadgeToggleExecutor = {
      execute: async () => {
        executions++;
        return { status: "rejected", badgeId: "A.md::parts", reason: "target-not-found" };
      }
    };
    const handler = new GraphBadgeToggleHandler(planner, executor);

    expect(await handler.handle(request)).toEqual({
      status: "unavailable",
      badgeId: "A.md::parts",
      reason: "request-outdated"
    });
    expect(executions).toBe(0);
  });

  it("lets the executor explicitly reject unsupported plans", async () => {
    const unsupported: GraphBadgeTogglePlan = {
      kind: "unsupported",
      badgeId: "A.md::parts",
      reason: "unsupported-semantic"
    };
    const planner: GraphBadgeTogglePlanner = { plan: async () => unsupported };
    const executor: GraphBadgeToggleExecutor = {
      execute: async (plan) => ({
        status: "rejected",
        badgeId: plan.badgeId,
        reason: "unsupported-plan"
      })
    };
    const handler = new GraphBadgeToggleHandler(planner, executor);

    expect(await handler.handle({ ...request, semantic: "parent" })).toEqual({
      status: "rejected",
      badgeId: "A.md::parts",
      reason: "unsupported-plan"
    });
  });
});
