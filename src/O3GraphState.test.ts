import type { TFile } from "obsidian";
import { describe, expect, it } from "vitest";
import { O3GraphState } from "./O3GraphState";

function graphFile(): TFile {
  return {
    path: "Graph.md",
    name: "Graph.md",
    basename: "Graph"
  } as TFile;
}

describe("O3GraphState lens and badge baseline characterization", () => {
  it("restores property-keyed badge expansion state from version 2 JSON", () => {
    const state = new O3GraphState(graphFile());
    state.loadFromContent([
      "```o3graph",
      JSON.stringify({
        version: 2,
        notes: { file_1: { path: "A.md" } },
        nodes: {
          node_1: {
            runtimeId: "A.md",
            noteId: "file_1",
            x: 10,
            y: 20,
            pinned: false,
            origin: { kind: "root" },
            badges: { parts: "expanded", parents: "collapsed" }
          }
        }
      }),
      "```"
    ].join("\n"));

    expect(state.toRuntimeNodeSnapshots()).toEqual([{
      nodeId: "A.md",
      path: "A.md",
      x: 10,
      y: 20,
      pinned: false,
      origin: { kind: "root" },
      badges: { parts: "expanded", parents: "collapsed" }
    }]);
  });

  it("stores independent definition-keyed Lens entries for one origin node", () => {
    const state = new O3GraphState(graphFile());

    expect(state.setEmbeddedGraphExpansion("A.md", "__nosygraph_lens__/Lens%20A", true, {
      lensWidth: 320,
      lensHeight: 220
    }, [], "LinkTypes/Lens A.md")).toBe(true);
    expect(state.setEmbeddedGraphExpansion("A.md", "__nosygraph_lens__/Lens%20B", true, {
      lensWidth: 480,
      lensHeight: 300
    }, [], "LinkTypes/Lens B.md")).toBe(true);

    expect(state.listExpandedEmbeddedGraphs()).toEqual([{
      originNodeId: "A.md",
      graphPath: "__nosygraph_lens__/Lens%20A",
      expanded: true,
      linkTypeId: "LinkTypes/Lens A.md",
      lens: {
        lensWidth: 320,
        lensHeight: 220
      }
    }, {
      originNodeId: "A.md",
      graphPath: "__nosygraph_lens__/Lens%20B",
      expanded: true,
      linkTypeId: "LinkTypes/Lens B.md",
      lens: {
        lensWidth: 480,
        lensHeight: 300
      }
    }]);
  });

  it("updates persisted Lens definition identities when the LinkType note moves", () => {
    const state = new O3GraphState(graphFile());
    state.setEmbeddedGraphExpansion(
      "A.md",
      "__nosygraph_lens__/LinkTypes%2FLens",
      true,
      undefined,
      [],
      "LinkTypes/Lens.md"
    );

    expect(state.renameNotePath("LinkTypes/Lens.md", "LinkTypes/Renamed Lens.md")).toBe(true);
    expect(state.listExpandedEmbeddedGraphs()[0]?.linkTypeId).toBe("LinkTypes/Renamed Lens.md");
  });

  it("round-trips Lens target property provenance with runtime snapshots", () => {
    const state = new O3GraphState(graphFile());
    state.applyRuntimeNodeSnapshots([
      {
        nodeId: "A.md",
        path: "A.md",
        x: 0,
        y: 0,
        pinned: false,
        origin: { kind: "root" },
        badges: { "Lens.md": "expanded" }
      },
      {
        nodeId: "B.md",
        path: "B.md",
        x: 120,
        y: 0,
        pinned: false,
        origin: { kind: "expansion", sourceNodeId: "A.md", linkType: "Lens.md" },
        badges: {},
        relationshipProperties: ["parts", "deliverables", "parts"]
      }
    ]);

    expect(state.toRuntimeNodeSnapshots().find((snapshot) => snapshot.path === "B.md")?.relationshipProperties)
      .toEqual(["parts", "deliverables"]);
  });

  it("stores graph-capable Lens runtime snapshots in the owning graph entry", () => {
    const state = new O3GraphState(graphFile());
    state.setEmbeddedGraphExpansion("Lens target.md", "Lens target.md", true, {
      lensWidth: 420,
      viewZoom: 1.25
    });
    expect(state.setEmbeddedGraphSnapshots("Lens target.md", "Lens target.md", [{
      nodeId: "Root.md",
      path: "Root.md",
      x: 12,
      y: 34,
      pinned: true,
      origin: { kind: "root" },
      badges: { parts: "expanded" }
    }])).toBe(true);

    const persisted = state.toPersistedState();
    const restored = new O3GraphState(graphFile());
    restored.loadFromContent(`\`\`\`o3graph\n${JSON.stringify(persisted)}\n\`\`\``);

    expect(restored.listExpandedEmbeddedGraphs()[0]).toMatchObject({
      originNodeId: "Lens target.md",
      graphPath: "Lens target.md",
      snapshots: [{
        nodeId: "Root.md",
        path: "Root.md",
        x: 12,
        y: 34,
        pinned: true,
        origin: { kind: "root" },
        badges: { parts: "expanded" }
      }]
    });
  });

  it("keeps Lens runtime snapshots when geometry changes", () => {
    const state = new O3GraphState(graphFile());
    state.setEmbeddedGraphExpansion("Lens target.md", "Lens target.md", true);
    state.setEmbeddedGraphSnapshots("Lens target.md", "Lens target.md", [{
      nodeId: "Root.md",
      path: "Root.md",
      x: 10,
      y: 20,
      pinned: false,
      origin: { kind: "root" },
      badges: {}
    }]);

    state.setEmbeddedGraphExpansion("Lens target.md", "Lens target.md", true, {
      lensWidth: 500
    });

    expect(state.listExpandedEmbeddedGraphs()[0]?.snapshots).toHaveLength(1);
    expect(state.listExpandedEmbeddedGraphs()[0]?.lens?.lensWidth).toBe(500);
  });

  it("stores nested Lens snapshots under the original graph entry", () => {
    const state = new O3GraphState(graphFile());
    const parent = {
      originNodeId: "Parent.md",
      graphPath: "Parent definition.md",
      expanded: true
    };
    state.setEmbeddedGraphExpansion(parent.originNodeId, parent.graphPath, true);
    state.setEmbeddedGraphExpansion(
      "Child.md",
      "Child definition.md",
      true,
      undefined,
      [parent]
    );

    expect(state.setEmbeddedGraphSnapshots(
      "Child.md",
      "Child definition.md",
      [{
        nodeId: "Nested root.md",
        path: "Nested root.md",
        x: 1,
        y: 2,
        pinned: false,
        origin: { kind: "root" },
        badges: {}
      }],
      [parent]
    )).toBe(true);

    expect(state.listExpandedEmbeddedGraphs()[0]?.embeddedGraphs?.[0]?.snapshots?.[0]?.path)
      .toBe("Nested root.md");
  });

});
