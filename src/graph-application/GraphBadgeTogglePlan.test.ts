import { describe, expect, it } from "vitest";
import type { GraphBadgeRequest } from "./GraphBadgeRequest";
import { planGraphBadgeToggle } from "./GraphBadgeTogglePlan";

const request: GraphBadgeRequest = {
  action: "toggle-badge",
  badgeId: "instance:A::parts",
  nodeId: "instance:A",
  noteId: "A.md",
  linkTypeId: "parts",
  contextId: "lens:project",
  semantic: "link"
};

describe("planGraphBadgeToggle", () => {
  it("plans an expansion and preserves separate node, note, and context identities", () => {
    expect(planGraphBadgeToggle({
      request,
      badgeState: "collapsed",
      targetNoteIds: ["B.md", "B.md", "C.md"],
      parentExpansionId: "root::related"
    })).toEqual({
      kind: "expand",
      badgeId: "instance:A::parts",
      expansionId: "instance:A::parts",
      sourceNodeId: "instance:A",
      sourceNoteId: "A.md",
      linkTypeId: "parts",
      contextId: "lens:project",
      targetNoteIds: ["B.md", "C.md"],
      parentExpansionId: "root::related"
    });
  });

  it("plans an expansion even when no relationship targets exist", () => {
    expect(planGraphBadgeToggle({
      request,
      badgeState: "collapsed",
      targetNoteIds: [],
      parentExpansionId: null
    })).toMatchObject({ kind: "expand", targetNoteIds: [] });
  });

  it("plans collapse by the stable expansion identity", () => {
    expect(planGraphBadgeToggle({
      request,
      badgeState: "expanded",
      targetNoteIds: ["ignored.md"],
      parentExpansionId: null
    })).toEqual({
      kind: "collapse",
      badgeId: "instance:A::parts",
      expansionId: "instance:A::parts",
      sourceNodeId: "instance:A",
      contextId: "lens:project"
    });
  });

  it("keeps parent and non-toggle behavior outside the normal toggle planner", () => {
    expect(planGraphBadgeToggle({
      request: { ...request, semantic: "parent" },
      badgeState: "collapsed",
      targetNoteIds: [],
      parentExpansionId: null
    })).toEqual({
      kind: "unsupported",
      badgeId: "instance:A::parts",
      reason: "unsupported-semantic"
    });
    expect(planGraphBadgeToggle({
      request: { ...request, action: "open-badge-input" },
      badgeState: "collapsed",
      targetNoteIds: [],
      parentExpansionId: null
    })).toEqual({
      kind: "unsupported",
      badgeId: "instance:A::parts",
      reason: "unsupported-action"
    });
  });
});
