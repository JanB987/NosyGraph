import { describe, expect, it } from "vitest";
import type { GraphExpansionBadgeReadInput } from "./GraphExpansionTargetMaterializer";
import { LegacyGraphExpansionBadgeAdapter } from "./LegacyGraphExpansionBadgeAdapter";

const input: GraphExpansionBadgeReadInput = {
  targetNote: {
    id: "B.md",
    path: "B.md",
    name: "B",
    availability: "available",
    properties: {}
  },
  targetNode: {
    id: "instance:B",
    noteId: "B.md",
    contextId: "embedded:lens-1",
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    radius: 20,
    pinned: false,
    selected: false,
    origin: {
      kind: "badge-expansion",
      expansionId: "A::parts",
      sourceNodeId: "A"
    }
  }
};

describe("LegacyGraphExpansionBadgeAdapter", () => {
  it("creates collapsed badges from host-neutral definitions", async () => {
    const adapter = new LegacyGraphExpansionBadgeAdapter({
      getDefinitions: () => [
        {
          linkTypeId: "parts",
          label: "Parts",
          color: "#4488cc",
          semantic: "link",
          duplicateNodes: true
        },
        {
          linkTypeId: "parent",
          label: "Parent",
          color: "#cc8844",
          semantic: "parent",
          duplicateNodes: false
        }
      ],
      hasRelationships: (noteId, linkTypeId) =>
        noteId === "B.md" && linkTypeId === "parts"
    });

    await expect(adapter.readBadges(input)).resolves.toEqual([
      {
        id: "instance:B::parts",
        nodeId: "instance:B",
        linkTypeId: "parts",
        contextId: "embedded:lens-1",
        label: "Parts",
        color: "#4488cc",
        state: "collapsed",
        semantic: "link",
        hasRelationships: true,
        duplicateNodes: true
      },
      {
        id: "instance:B::parent",
        nodeId: "instance:B",
        linkTypeId: "parent",
        contextId: "embedded:lens-1",
        label: "Parent",
        color: "#cc8844",
        state: "collapsed",
        semantic: "parent",
        hasRelationships: false,
        duplicateNodes: false
      }
    ]);
  });

  it("deduplicates definitions and ignores empty LinkType identities", async () => {
    const adapter = new LegacyGraphExpansionBadgeAdapter({
      getDefinitions: () => [
        {
          linkTypeId: "parts",
          label: "Parts",
          color: "#4488cc",
          semantic: "link",
          duplicateNodes: false
        },
        {
          linkTypeId: "parts",
          label: "Duplicate",
          color: "#000000",
          semantic: "link",
          duplicateNodes: false
        },
        {
          linkTypeId: " ",
          label: "Empty",
          color: "#000000",
          semantic: "link",
          duplicateNodes: false
        }
      ],
      hasRelationships: () => false
    });

    await expect(adapter.readBadges(input)).resolves.toHaveLength(1);
  });
});
