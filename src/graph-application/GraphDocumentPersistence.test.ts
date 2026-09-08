import { describe, expect, it } from "vitest";
import type { GraphDocument } from "../graph-domain/GraphDocument";
import { GraphDocumentPersistence } from "./GraphDocumentPersistence";
import { ObsidianGraphDocumentRepository } from "./ObsidianGraphDocumentRepository";

function documentFixture(): GraphDocument {
  return {
    id: "graph:root",
    path: "Graphs/Root.md",
    configuration: {
      values: {
        roots: ["A.md"],
        activeLinkTypes: ["parts"],
        settings: { layoutId: "force" }
      }
    },
    runtime: {
      version: 1,
      snapshot: {
        notes: [
          { id: "A.md", path: "A.md", name: "A", availability: "available", properties: {} },
          { id: "B.md", path: "B.md", name: "B", availability: "available", properties: {} }
        ],
        nodes: [
          {
            id: "node:A",
            noteId: "A.md",
            contextId: "graph:root",
            position: { x: 10, y: 20 },
            velocity: { x: 0, y: 0 },
            radius: 20,
            pinned: true,
            selected: true,
            origin: { kind: "root" }
          },
          {
            id: "node:B",
            noteId: "B.md",
            contextId: "graph:root",
            position: { x: 50, y: 60 },
            velocity: { x: 1, y: 2 },
            radius: 20,
            pinned: false,
            selected: false,
            origin: { kind: "badge-expansion", expansionId: "exp:A:parts", sourceNodeId: "node:A" }
          }
        ],
        badges: [{
          id: "node:A::parts",
          nodeId: "node:A",
          linkTypeId: "parts",
          contextId: "graph:root",
          label: "Parts",
          color: "#4488cc",
          state: "expanded",
          semantic: "link",
          hasRelationships: true,
          duplicateNodes: false,
          expansionId: "exp:A:parts"
        }],
        edges: [{
          id: "edge:A:B",
          fromNodeId: "node:A",
          toNodeId: "node:B",
          linkTypeId: "parts",
          contextId: "graph:root",
          origin: "badge-expansion"
        }],
        expansions: [{
          id: "exp:A:parts",
          sourceNodeId: "node:A",
          sourceNoteId: "A.md",
          linkTypeId: "parts",
          contextId: "graph:root",
          ownedNodeIds: ["node:B"],
          ownedEdgeIds: ["edge:A:B"],
          childExpansionIds: []
        }],
        lenses: [{
          id: "lens:B",
          sourceNodeId: "node:B",
          documentId: "graph:embedded",
          contextId: "embedded:B",
          bounds: { left: 1, top: 2, right: 101, bottom: 102 },
          viewport: { x: 4, y: 5, zoom: 1.25 },
          locked: false,
          maximized: false
        }]
      },
      scene: {
        lenses: [{
          id: "lens:B",
          sourceNodeId: "node:B",
          documentId: "graph:embedded",
          contextId: "embedded:B",
          bounds: { left: 1, top: 2, right: 101, bottom: 102 },
          viewport: { x: 4, y: 5, zoom: 1.25 },
          locked: false,
          maximized: false
        }],
        groups: [{
          id: "group:status",
          label: "Status",
          property: "status",
          operator: "equals",
          value: "open",
          color: "#55aa77",
          priority: 1
        }],
        containers: [{
          id: "container:root",
          kind: "parent",
          contextId: "graph:root",
          originNodeId: "node:A",
          memberNodeIds: ["node:A", "node:B"],
          parentContainerIds: [],
          bounds: { left: 0, top: 0, right: 200, bottom: 200 },
          locked: false,
          lensId: "lens:B"
        }]
      },
      layout: {
        layoutId: "force",
        viewport: { x: 12, y: 14, zoom: 0.85 }
      }
    }
  };
}

describe("GraphDocumentPersistence", () => {
  it("round-trips committed IDs, ownership, expansions, scene, and layout directly", () => {
    const persistence = new GraphDocumentPersistence();
    const original = documentFixture();
    const raw = persistence.serialize(original);
    const decoded = persistence.deserialize(raw);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    expect(decoded.document).toEqual(original);
    const restored = persistence.restore(decoded.document);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.store.getSnapshot()).toEqual(original.runtime.snapshot);
    expect(restored.sceneStore.getSnapshot()).toEqual(original.runtime.scene);
    expect(restored.document.runtime.layout).toEqual(original.runtime.layout);
  });

  it("detaches nested configuration and runtime values", () => {
    const persistence = new GraphDocumentPersistence();
    const original = documentFixture();
    const decoded = persistence.deserialize(persistence.serialize(original));
    if (!decoded.ok) throw new Error("expected decoded document");

    (original.configuration.values as Record<string, unknown>).settings = { layoutId: "changed" };
    (original.runtime.snapshot.nodes[0]!.position as { x: number; y: number }).x = 999;
    original.runtime.scene.groups[0]!.label = "Changed";
    expect(decoded.document.configuration.values.settings).toEqual({ layoutId: "force" });
    expect(decoded.document.runtime.snapshot.nodes[0]!.position.x).toBe(10);
    expect(decoded.document.runtime.scene.groups[0]!.label).toBe("Status");
  });

  it("rejects malformed JSON, invalid references, scenes, versions, and layouts", () => {
    const persistence = new GraphDocumentPersistence();
    expect(persistence.deserialize("{")).toEqual({ ok: false, reason: "invalid-json" });

    const invalid = documentFixture();
    invalid.runtime.snapshot.nodes[1]!.noteId = "Missing.md";
    const invalidResult = persistence.deserialize(JSON.stringify(invalid));
    expect(invalidResult.ok).toBe(false);
    expect(invalidResult).toMatchObject({ reason: "invalid-snapshot", failure: { reason: "missing-reference" } });

    const badVersion = JSON.parse(JSON.stringify(documentFixture())) as Record<string, unknown>;
    (badVersion.runtime as Record<string, unknown>).version = 99;
    expect(persistence.deserialize(JSON.stringify(badVersion))).toEqual({
      ok: false, reason: "unsupported-version"
    });

    const badLayout = JSON.parse(JSON.stringify(documentFixture())) as GraphDocument;
    badLayout.runtime.layout.viewport.zoom = 0;
    expect(persistence.deserialize(JSON.stringify(badLayout))).toEqual({
      ok: false, reason: "invalid-layout"
    });

    const badScene = documentFixture();
    badScene.runtime.scene.containers[0]!.lensId = "lens:missing";
    expect(persistence.deserialize(JSON.stringify(badScene))).toEqual({
      ok: false, reason: "invalid-scene"
    });

    const duplicateScene = documentFixture();
    duplicateScene.runtime.scene.groups = [
      duplicateScene.runtime.scene.groups[0]!,
      { ...duplicateScene.runtime.scene.groups[0]! }
    ];
    expect(persistence.deserialize(JSON.stringify(duplicateScene))).toEqual({
      ok: false, reason: "invalid-scene"
    });
  });

  it("saves and restores through the Obsidian repository without replaying commands", async () => {
    const files = new Map<string, string>();
    const repository = new ObsidianGraphDocumentRepository({
      read: async (path) => files.get(path),
      write: async (path, content) => { files.set(path, content); }
    });
    const original = documentFixture();
    await repository.save(original);
    const restored = await repository.loadAndRestore(original.path);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.store.getSnapshot().expansions[0]?.id).toBe("exp:A:parts");
    expect(restored.store.getSnapshot().nodes.map((node) => node.id)).toEqual(["node:A", "node:B"]);
    expect(restored.sceneStore.getSnapshot().containers[0]?.lensId).toBe("lens:B");
    expect(files.get(original.path)).toContain('"ownedNodeIds"');
  });
});
