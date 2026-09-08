import { describe, expect, it } from "vitest";
import {
  GraphLegacyExpansionService,
  type GraphLegacyExpansionNode,
  type GraphLegacyExpansionTarget
} from "./GraphLegacyExpansionService";

type FakeFile = { path: string };

interface TestNode extends GraphLegacyExpansionNode {
  sourcePath: string;
}

const target = (path: string): GraphLegacyExpansionTarget => ({
  path,
  label: path,
  missing: false
});

function createHarness(targetsBySource: Record<string, readonly GraphLegacyExpansionTarget[]>) {
  const expandedByBadge = new Map<string, Set<string>>();
  const expansionNodes = new Map<string, Set<string>>();
  const nodeOwners = new Map<string, Set<string>>();
  const expansionParent = new Map<string, string | null>();
  const nodes = new Map<string, TestNode>();
  const currentFiles = new Set<string>(["root.md"]);
  const toggles: string[] = [];
  const service = new GraphLegacyExpansionService<TestNode, FakeFile>({
    expandedByBadge,
    expansionNodes,
    nodeOwners,
    expansionParent,
    rootFilePaths: new Set(["root.md"]),
    getFile: (source) => typeof source === "string" ? { path: source } : source,
    getSourcePath: (file) => file.path,
    resolveTargets: (file) => targetsBySource[file.path] ?? [],
    getNode: (nodeId) => nodes.get(nodeId),
    ensureTarget: (candidate, sourceNodeId) => {
      const id = candidate.path;
      if (!nodes.has(id)) nodes.set(id, { id, sourcePath: id });
      return id;
    },
    isVisibleLinkType: () => false,
    isDuplicateNodesEnabled: () => false,
    addCurrentFile: (path) => currentFiles.add(path),
    removeCurrentFileIfUnowned: (path) => currentFiles.delete(path),
    getHoveredExpansionKey: () => null,
    clearHoveredExpansion: () => undefined,
    refreshHoveredHighlightNodes: () => undefined,
    reconcileCurrentFilesFromVisibleState: () => undefined,
    getCurrentFiles: () => Array.from(currentFiles, (path) => ({ path })),
    setLastFiles: () => undefined,
    rebuildEdges: () => undefined,
    onToggle: (event) => toggles.push(`${event.expansionId}:${event.expanded}`)
  });
  return { service, expandedByBadge, expansionNodes, nodeOwners, expansionParent, currentFiles, toggles };
}

describe("GraphLegacyExpansionService", () => {
  it("tracks ownership and emits a normal expansion event", () => {
    const harness = createHarness({ "root.md": [target("child.md")] });
    harness.service.toggle("root.md", "related");

    expect(harness.expandedByBadge.get("root.md::related")).toEqual(new Set(["child.md"]));
    expect(harness.nodeOwners.get("child.md")).toEqual(new Set(["root.md::related"]));
    expect(harness.toggles).toEqual(["root.md::related:true"]);
  });

  it("collapses nested expansion subtrees in one operation", () => {
    const harness = createHarness({
      "root.md": [target("child.md")],
      "child.md": [target("grandchild.md")]
    });
    harness.service.toggle("root.md", "related");
    harness.service.toggle("child.md", "related");
    harness.service.toggle("root.md", "related");

    expect(harness.expandedByBadge.size).toBe(0);
    expect(harness.expansionNodes.size).toBe(0);
    expect(harness.nodeOwners.size).toBe(0);
    expect(harness.currentFiles).toEqual(new Set(["root.md"]));
    expect(harness.toggles).toEqual([
      "root.md::related:true",
      "child.md::related:true",
      "root.md::related:false"
    ]);
  });
});