import { describe, expect, it } from "vitest";
import type { GraphBadge } from "../graph-domain/GraphBadge";
import { LegacyBadgeCommandAdapter } from "./LegacyBadgeCommandAdapter";

interface TestNode {
  id: string;
  sourcePath: string;
}

interface TestFile {
  path: string;
}

interface TestLinkType {
  property: string;
}

const badge: GraphBadge = {
  id: "A.md::parts",
  nodeId: "A.md",
  linkTypeId: "parts",
  contextId: "graph:root",
  label: "Parts",
  color: "#4488cc",
  state: "collapsed",
  semantic: "link",
  hasRelationships: true,
  duplicateNodes: false
};

function setup(overrides: {
  node?: TestNode;
  file?: TestFile;
  linkTypes?: TestLinkType[];
} = {}) {
  const calls: string[] = [];
  const node = overrides.node ?? { id: "A.md", sourcePath: "A.md" };
  const file = overrides.file ?? { path: "A.md" };
  const linkTypes = overrides.linkTypes ?? [{ property: " Parts " }];
  const adapter = new LegacyBadgeCommandAdapter<TestNode, TestFile, TestLinkType>({
    getNode: (nodeId) => nodeId === node.id ? node : undefined,
    getFile: (sourcePath) => sourcePath === file.path ? file : undefined,
    getLinkTypes: () => linkTypes,
    normalizeLinkType: (value) => value.trim().toLowerCase(),
    toggle: (target) => { calls.push(`toggle:${target.node.id}:${target.linkType.property}`); },
    openInput: (target) => { calls.push(`input:${target.file.path}`); },
    expandChain: async (target) => { calls.push(`chain:${target.linkType.property}`); }
  });
  return { adapter, calls };
}

describe("LegacyBadgeCommandAdapter", () => {
  it("resolves live legacy objects for every badge operation", async () => {
    const { adapter, calls } = setup();

    await adapter.toggleBadge(badge);
    await adapter.openBadgeInput(badge);
    await adapter.expandBadgeChain(badge);

    expect(calls).toEqual([
      "toggle:A.md: Parts ",
      "input:A.md",
      "chain: Parts "
    ]);
  });

  it("does nothing when the node cannot be resolved", async () => {
    const { adapter, calls } = setup({ node: { id: "other", sourcePath: "other.md" } });

    await adapter.toggleBadge(badge);

    expect(calls).toEqual([]);
  });

  it("does nothing when the file or link type cannot be resolved", async () => {
    const missingFile = setup({ file: { path: "other.md" } });
    const missingLinkType = setup({ linkTypes: [{ property: "unrelated" }] });

    await missingFile.adapter.openBadgeInput(badge);
    await missingLinkType.adapter.expandBadgeChain(badge);

    expect(missingFile.calls).toEqual([]);
    expect(missingLinkType.calls).toEqual([]);
  });
});
