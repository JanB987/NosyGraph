import { describe, expect, it } from "vitest";
import type { GraphBadge } from "../graph-domain/GraphBadge";
import type { GraphNodeInstance } from "../graph-domain/GraphNodeInstance";
import { createGraphBadgeRequest } from "./GraphBadgeRequest";

const badge: GraphBadge = {
  id: "instance:A::parts",
  nodeId: "instance:A",
  linkTypeId: "parts",
  contextId: "lens:project",
  label: "Parts",
  color: "#4488cc",
  state: "collapsed",
  semantic: "link",
  hasRelationships: true,
  duplicateNodes: true
};

const node: GraphNodeInstance = {
  id: "instance:A",
  noteId: "A.md",
  contextId: "lens:project",
  position: { x: 0, y: 0 },
  velocity: { x: 0, y: 0 },
  radius: 20,
  pinned: false,
  selected: false,
  origin: { kind: "root" }
};

describe("createGraphBadgeRequest", () => {
  it("keeps runtime node and source note identities separate", () => {
    expect(createGraphBadgeRequest("toggle-badge", badge, node)).toEqual({
      action: "toggle-badge",
      badgeId: "instance:A::parts",
      nodeId: "instance:A",
      noteId: "A.md",
      linkTypeId: "parts",
      contextId: "lens:project",
      semantic: "link"
    });
  });

  it("rejects a node that does not own the badge", () => {
    expect(createGraphBadgeRequest("toggle-badge", badge, { ...node, id: "instance:B" }))
      .toBeUndefined();
  });
});
