import { describe, expect, it } from "vitest";
import type { GraphNodeInstance } from "./GraphNodeInstance";
import {
  countGraphChanges,
  createEmptyGraphChangeSet,
  hasGraphChanges
} from "./GraphChangeSet";

const node: GraphNodeInstance = {
  id: "A.md",
  noteId: "A.md",
  contextId: "graph:root",
  position: { x: 0, y: 0 },
  velocity: { x: 0, y: 0 },
  radius: 20,
  pinned: false,
  selected: false,
  origin: { kind: "root" }
};

describe("GraphChangeSet", () => {
  it("creates an empty atomic change for a stable badge expansion", () => {
    const changeSet = createEmptyGraphChangeSet({
      kind: "badge-expand",
      badgeId: "A.md::parts",
      expansionId: "A.md::parts"
    });

    expect(changeSet.cause).toEqual({
      kind: "badge-expand",
      badgeId: "A.md::parts",
      expansionId: "A.md::parts"
    });
    expect(countGraphChanges(changeSet)).toBe(0);
    expect(hasGraphChanges(changeSet)).toBe(false);
  });

  it("counts upserts and removals across snapshot categories", () => {
    const empty = createEmptyGraphChangeSet({
      kind: "badge-collapse",
      badgeId: "A.md::parts",
      expansionId: "A.md::parts"
    });
    const changeSet = {
      ...empty,
      nodes: { upsert: [node], removeIds: ["B.md"] },
      edges: { upsert: [], removeIds: ["A.md::B.md::parts"] },
      expansions: { upsert: [], removeIds: ["A.md::parts"] }
    };

    expect(countGraphChanges(changeSet)).toBe(4);
    expect(hasGraphChanges(changeSet)).toBe(true);
  });

  it("creates independent collection objects for each change set", () => {
    const cause = {
      kind: "badge-expand" as const,
      badgeId: "A.md::parts",
      expansionId: "A.md::parts"
    };
    const first = createEmptyGraphChangeSet(cause);
    const second = createEmptyGraphChangeSet(cause);

    expect(first.nodes).not.toBe(second.nodes);
    expect(first.nodes.upsert).not.toBe(second.nodes.upsert);
    expect(first.cause).not.toBe(cause);
  });
});
