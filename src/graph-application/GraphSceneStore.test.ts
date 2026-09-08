import { describe, expect, it } from "vitest";
import type { GraphContainer } from "../graph-domain/GraphContainer";
import type { GraphGroup } from "../graph-domain/GraphGroup";
import type { GraphLens } from "../graph-domain/GraphLens";
import { GraphSceneStore } from "./GraphSceneStore";

const lens: GraphLens = {
  id: "lens:A",
  sourceNodeId: "A",
  documentId: "graph:A",
  contextId: "embedded:A",
  bounds: { left: 0, top: 0, right: 120, bottom: 80 },
  viewport: { x: 0, y: 0, zoom: 1 },
  locked: false,
  maximized: false
};

const group: GraphGroup = {
  id: "group:status",
  label: "Status",
  property: "status",
  operator: "equals",
  value: "open",
  color: "#4488cc",
  priority: 1
};

const container: GraphContainer = {
  id: "container:A",
  kind: "embedded",
  contextId: "embedded:A",
  originNodeId: "A",
  memberNodeIds: ["B", "C"],
  parentContainerIds: [],
  bounds: { left: 0, top: 0, right: 100, bottom: 100 },
  locked: false,
  lensId: "lens:A"
};

describe("GraphSceneStore", () => {
  it("creates, updates, and removes lenses, groups, and containers", () => {
    const store = new GraphSceneStore();

    for (const command of [
      { type: "create-lens", lens },
      { type: "create-group", group },
      { type: "create-container", container }
    ] as const) {
      expect(store.executeScene(command)).toMatchObject({
        handled: true,
        changed: true,
        revision: expect.any(Number)
      });
    }
    expect(store.getSnapshot()).toEqual({
      lenses: [lens],
      groups: [group],
      containers: [container]
    });

    const updatedLens = { ...lens, viewport: { x: 4, y: 8, zoom: 1.5 } };
    const updatedGroup = { ...group, color: "#cc8844", priority: 2 };
    const updatedContainer = {
      ...container,
      bounds: { left: -10, top: -5, right: 110, bottom: 105 },
      locked: true
    };
    expect(store.executeScene({ type: "update-lens", lens: updatedLens }).changed).toBe(true);
    expect(store.executeScene({ type: "update-group", group: updatedGroup }).changed).toBe(true);
    expect(store.executeScene({ type: "update-container", container: updatedContainer }).changed).toBe(true);

    expect(store.executeScene({ type: "remove-container", containerId: container.id }).handled).toBe(true);
    expect(store.executeScene({ type: "remove-lens", lensId: lens.id }).handled).toBe(true);
    expect(store.executeScene({ type: "remove-group", groupId: group.id }).handled).toBe(true);
    expect(store.getSnapshot()).toEqual({ lenses: [], groups: [], containers: [] });
  });

  it("returns detached snapshots and rejects duplicate or missing updates", () => {
    const store = new GraphSceneStore({ lenses: [lens], groups: [group], containers: [] });

    const snapshot = store.getSnapshot();
    (snapshot.lenses[0]!.viewport as { x: number }).x = 99;
    expect(store.getSnapshot().lenses[0]!.viewport.x).toBe(0);

    expect(store.executeScene({ type: "create-lens", lens }))
      .toMatchObject({ handled: false, reason: "duplicate-id" });
    expect(store.executeScene({ type: "update-group", group: { ...group, id: "missing" } }))
      .toMatchObject({ handled: false, reason: "not-found" });
    expect(store.executeScene({ type: "remove-container", containerId: "missing" }))
      .toMatchObject({ handled: false, reason: "not-found" });
  });

  it("rejects invalid container references and cycles", () => {
    const store = new GraphSceneStore();

    expect(store.executeScene({
      type: "create-container",
      container: { ...container, parentContainerIds: ["missing"] }
    })).toMatchObject({ handled: false, reason: "invalid-container-reference" });

    const parent = { ...container, id: "parent", lensId: undefined };
    const child = { ...container, id: "child", parentContainerIds: ["parent"], lensId: undefined };
    expect(store.executeScene({ type: "create-container", container: parent }).handled).toBe(true);
    expect(store.executeScene({ type: "create-container", container: child }).handled).toBe(true);
    expect(store.executeScene({
      type: "update-container",
      container: { ...parent, parentContainerIds: ["child"] }
    })).toMatchObject({ handled: false, reason: "container-cycle" });
  });

  it("rejects malformed scene records", () => {
    const store = new GraphSceneStore();

    expect(store.executeScene({
      type: "create-lens",
      lens: { ...lens, id: "", viewport: { x: 0, y: 0, zoom: 0 } }
    })).toMatchObject({ handled: false, reason: "invalid-value" });
    expect(store.executeScene({
      type: "create-group",
      group: { ...group, property: "", priority: Number.NaN }
    })).toMatchObject({ handled: false, reason: "invalid-value" });
    expect(store.executeScene({
      type: "create-container",
      container: { ...container, memberNodeIds: ["B", "B"] }
    })).toMatchObject({ handled: false, reason: "invalid-value" });
  });
});

