import { describe, expect, it } from "vitest";
import type { GraphBadgeTogglePlan } from "./GraphBadgeTogglePlan";
import { LegacyGraphBadgeToggleExecutor } from "./LegacyGraphBadgeToggleExecutor";

interface TestNode {
  id: string;
  sourcePath: string;
}

interface TestFile {
  path: string;
}

interface TestLinkType {
  property: string;
}

const expandPlan: GraphBadgeTogglePlan = {
  kind: "expand",
  badgeId: "instance:A::parts",
  expansionId: "instance:A::parts",
  sourceNodeId: "instance:A",
  sourceNoteId: "A.md",
  linkTypeId: "parts",
  contextId: "graph:root",
  targetNoteIds: ["B.md"],
  parentExpansionId: null
};

const collapsePlan: GraphBadgeTogglePlan = {
  kind: "collapse",
  badgeId: "instance:A::parts",
  expansionId: "instance:A::parts",
  sourceNodeId: "instance:A",
  sourceNoteId: "A.md",
  linkTypeId: "parts",
  contextId: "graph:root"
};

function setup(initiallyExpanded: boolean) {
  let expanded = initiallyExpanded;
  const calls: string[] = [];
  const node: TestNode = { id: "instance:A", sourcePath: "A.md" };
  const file: TestFile = { path: "A.md" };
  const linkType: TestLinkType = { property: " Parts " };
  const executor = new LegacyGraphBadgeToggleExecutor<TestNode, TestFile, TestLinkType>({
    getNode: (nodeId) => nodeId === node.id ? node : undefined,
    getFile: (sourcePath) => sourcePath === file.path ? file : undefined,
    getLinkTypes: () => [linkType],
    normalizeLinkType: (value) => value.trim().toLowerCase(),
    isExpanded: () => expanded,
    toggle: (target) => {
      calls.push(`${target.node.id}:${target.file.path}:${target.linkType.property}`);
      expanded = !expanded;
    }
  });
  return { executor, calls, isExpanded: () => expanded };
}

describe("LegacyGraphBadgeToggleExecutor", () => {
  it("applies an expansion plan through resolved legacy objects", async () => {
    const { executor, calls, isExpanded } = setup(false);

    expect(await executor.execute(expandPlan)).toEqual({
      status: "applied",
      badgeId: "instance:A::parts",
      expansionId: "instance:A::parts",
      effect: "expand"
    });
    expect(calls).toEqual(["instance:A:A.md: Parts "]);
    expect(isExpanded()).toBe(true);
  });

  it("applies a collapse plan through the same legacy toggle", async () => {
    const { executor, calls, isExpanded } = setup(true);

    expect(await executor.execute(collapsePlan)).toMatchObject({
      status: "applied",
      effect: "collapse"
    });
    expect(calls).toHaveLength(1);
    expect(isExpanded()).toBe(false);
  });

  it("does not invert state when a plan is already applied", async () => {
    const expanded = setup(true);
    const collapsed = setup(false);

    expect(await expanded.executor.execute(expandPlan)).toMatchObject({
      status: "unchanged",
      reason: "already-expanded"
    });
    expect(await collapsed.executor.execute(collapsePlan)).toMatchObject({
      status: "unchanged",
      reason: "already-collapsed"
    });
    expect(expanded.calls).toEqual([]);
    expect(collapsed.calls).toEqual([]);
  });

  it("rejects unsupported plans and unresolved legacy targets", async () => {
    const { executor, calls } = setup(false);
    const unsupported: GraphBadgeTogglePlan = {
      kind: "unsupported",
      badgeId: "instance:A::parts",
      reason: "unsupported-action"
    };

    expect(await executor.execute(unsupported)).toEqual({
      status: "rejected",
      badgeId: "instance:A::parts",
      reason: "unsupported-plan"
    });
    expect(await executor.execute({ ...expandPlan, sourceNoteId: "other.md" })).toEqual({
      status: "rejected",
      badgeId: "instance:A::parts",
      reason: "target-not-found"
    });
    expect(calls).toEqual([]);
  });
});
