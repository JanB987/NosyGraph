import { describe, expect, it } from "vitest";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import type { GraphBadgeRequest } from "./GraphBadgeRequest";
import { GraphBadgeToggleService } from "./GraphBadgeToggleService";
import { GraphQueries } from "./GraphQueries";
import type {
  GraphRelationshipTarget,
  GraphRelationshipTargetReader
} from "./GraphRelationshipTargetReader";

const request: GraphBadgeRequest = {
  action: "toggle-badge",
  badgeId: "instance:A::parts",
  nodeId: "instance:A",
  noteId: "A.md",
  linkTypeId: "parts",
  contextId: "graph:root",
  semantic: "link"
};

function snapshot(state: "collapsed" | "expanded" = "collapsed"): GraphSnapshot {
  return {
    notes: [{ id: "A.md", path: "A.md", name: "A", properties: {} }],
    nodes: [{
      id: "instance:A",
      noteId: "A.md",
      contextId: "graph:root",
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      radius: 20,
      pinned: false,
      selected: false,
      origin: { kind: "root" }
    }],
    badges: [{
      id: "instance:A::parts",
      nodeId: "instance:A",
      linkTypeId: "parts",
      contextId: "graph:root",
      label: "Parts",
      color: "#4488cc",
      state,
      semantic: "link",
      hasRelationships: true,
      duplicateNodes: false,
      ...(state === "expanded" ? { expansionId: "instance:A::parts" } : {})
    }],
    edges: [],
    expansions: [],
    lenses: []
  };
}

function setup(
  graphSnapshot = snapshot(),
  targets: readonly GraphRelationshipTarget[] = [
    { noteId: "B.md", label: "B", missing: false }
  ]
) {
  const reads: string[] = [];
  const reader: GraphRelationshipTargetReader = {
    readTargets: async (query) => {
      reads.push(`${query.sourceNoteId}:${query.linkTypeId}:${query.contextId}`);
      return targets;
    }
  };
  const service = new GraphBadgeToggleService(
    new GraphQueries({ getSnapshot: () => graphSnapshot }),
    reader
  );
  return { service, reads };
}

describe("GraphBadgeToggleService", () => {
  it("reads targets and creates a complete expansion plan", async () => {
    const { service, reads } = setup();

    expect(await service.plan(request)).toEqual({
      kind: "expand",
      badgeId: "instance:A::parts",
      expansionId: "instance:A::parts",
      sourceNodeId: "instance:A",
      sourceNoteId: "A.md",
      linkTypeId: "parts",
      contextId: "graph:root",
      targetNoteIds: ["B.md"],
      parentExpansionId: null
    });
    expect(reads).toEqual(["A.md:parts:graph:root"]);
  });

  it("does not read relationships when planning collapse", async () => {
    const { service, reads } = setup(snapshot("expanded"));

    expect(await service.plan(request)).toMatchObject({
      kind: "collapse",
      expansionId: "instance:A::parts"
    });
    expect(reads).toEqual([]);
  });

  it("derives nested expansion ownership from the source node", async () => {
    const base = snapshot();
    const nested: GraphSnapshot = {
      ...base,
      nodes: [{
        ...base.nodes[0]!,
        origin: {
          kind: "badge-expansion",
          expansionId: "root::related",
          sourceNodeId: "root"
        }
      }]
    };
    const { service } = setup(nested);

    expect(await service.plan(request)).toMatchObject({
      kind: "expand",
      parentExpansionId: "root::related"
    });
  });

  it("does not read relationships for unsupported actions", async () => {
    const { service, reads } = setup();

    expect(await service.plan({ ...request, action: "open-badge-input" })).toEqual({
      kind: "unsupported",
      badgeId: "instance:A::parts",
      reason: "unsupported-action"
    });
    expect(reads).toEqual([]);
  });

  it("reports missing live state and stale request identities", async () => {
    const missingBadge = snapshot();
    missingBadge.badges = [];
    const missingNode = snapshot();
    missingNode.nodes = [];
    const normal = setup();

    expect(await setup(missingBadge).service.plan(request)).toEqual({
      kind: "unavailable",
      badgeId: "instance:A::parts",
      reason: "badge-not-found"
    });
    expect(await setup(missingNode).service.plan(request)).toEqual({
      kind: "unavailable",
      badgeId: "instance:A::parts",
      reason: "node-not-found"
    });
    expect(await normal.service.plan({ ...request, noteId: "other.md" })).toEqual({
      kind: "unavailable",
      badgeId: "instance:A::parts",
      reason: "request-outdated"
    });
    expect(normal.reads).toEqual([]);
  });
});
