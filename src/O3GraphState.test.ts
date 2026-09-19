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

  it("currently stores one embedded lens entry per origin node and graph path", () => {
    const state = new O3GraphState(graphFile());

    expect(state.setEmbeddedGraphExpansion("A.md", "Embedded.md", true, {
      lensWidth: 320,
      lensHeight: 220
    })).toBe(true);
    expect(state.setEmbeddedGraphExpansion("A.md", "Embedded.md", true, {
      lensWidth: 480,
      lensHeight: 300
    })).toBe(true);

    expect(state.listExpandedEmbeddedGraphs()).toEqual([{
      originNodeId: "A.md",
      graphPath: "Embedded.md",
      expanded: true,
      lens: {
        lensWidth: 480,
        lensHeight: 300
      }
    }]);
  });
});
