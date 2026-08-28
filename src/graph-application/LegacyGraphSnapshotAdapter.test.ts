import { describe, expect, it } from "vitest";
import {
  LegacyGraphSnapshotAdapter,
  ROOT_GRAPH_CONTEXT_ID,
  type LegacyGraphReadState
} from "./LegacyGraphSnapshotAdapter";

describe("LegacyGraphSnapshotAdapter", () => {
  it("deduplicates notes and returns detached runtime collections", () => {
    const legacy: LegacyGraphReadState = {
      nodes: [
        {
          id: "A.md",
          noteId: "A.md",
          noteName: "A",
          contextId: ROOT_GRAPH_CONTEXT_ID,
          position: { x: 1, y: 2 },
          velocity: { x: 3, y: 4 },
          radius: 20,
          pinned: false,
          selected: true,
          origin: { kind: "root" }
        },
        {
          id: "duplicate:A.md",
          noteId: "A.md",
          noteName: "A",
          contextId: "embedded:lens-1",
          position: { x: 5, y: 6 },
          velocity: { x: 0, y: 0 },
          radius: 15,
          pinned: false,
          selected: false,
          origin: {
            kind: "embedded-graph",
            lensId: "lens-1",
            sourceNodeId: "B.md"
          }
        }
      ],
      expansions: []
    };
    let readCount = 0;
    const adapter = new LegacyGraphSnapshotAdapter(
      { getLegacyGraphReadState: () => legacy },
      {
        readNote: (path, fallbackName) => {
          readCount += 1;
          return { id: path, path, name: fallbackName, properties: { status: "active" } };
        }
      }
    );

    const snapshot = adapter.getSnapshot();

    expect(snapshot.notes).toEqual([
      { id: "A.md", path: "A.md", name: "A", properties: { status: "active" } }
    ]);
    expect(readCount).toBe(1);
    expect(snapshot.nodes).toHaveLength(2);
    expect(snapshot.nodes[0]).not.toBe(legacy.nodes[0]);
    expect(snapshot.nodes[0].position).not.toBe(legacy.nodes[0].position);
  });
});

