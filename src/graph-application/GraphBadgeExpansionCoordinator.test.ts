import { describe, expect, it } from "vitest";
import { GraphBadgeExpansionCoordinator, type GraphBadgeExpansionNode } from "./GraphBadgeExpansionCoordinator";
import type { O3LinkType } from "../O3LinkType";

interface File { path: string }
const link = (property: string, semantic: O3LinkType["semantic"] = "link"): O3LinkType => ({ property, semantic } as O3LinkType);

function setup(node: GraphBadgeExpansionNode) {
  const calls: string[] = [];
  const coordinator = new GraphBadgeExpansionCoordinator<GraphBadgeExpansionNode, File>({
    getSourcePath: (file) => file.path,
    getNode: (id) => id === node.id ? node : undefined,
    expandEmbedded: (_node, type) => calls.push(`embedded:${type.property}`),
    expandParent: (_node, property) => calls.push(`parent:${property}`),
    toggleLinkType: (_file, property, sourceNodeId) => calls.push(`toggle:${property}:${sourceNodeId ?? ""}`)
  }, (value) => value.trim().toLowerCase());
  return { coordinator, calls };
}

describe("GraphBadgeExpansionCoordinator", () => {
  it("routes normal link expansion through the runtime port", () => {
    const { coordinator, calls } = setup({ id: "A.md", sourcePath: "A.md" });
    coordinator.expandFromNode({ path: "A.md" }, link("Related"), "A.md");
    expect(calls).toEqual(["toggle:related:A.md"]);
  });

  it("routes parent expansion separately", () => {
    const { coordinator, calls } = setup({ id: "A.md", sourcePath: "A.md" });
    coordinator.expandFromNode({ path: "A.md" }, link("Parent", "parent"), "A.md");
    expect(calls).toEqual(["parent:parent"]);
  });

  it("routes embedded nodes to the embedded runtime path", () => {
    const { coordinator, calls } = setup({ id: "embedded:A", sourcePath: "A.md", stateOwnerPath: "Graph.md", embeddedInstanceId: "instance" });
    coordinator.expandFromNode({ path: "A.md" }, link("Related"), "embedded:A");
    expect(calls).toEqual(["embedded:Related"]);
  });
});