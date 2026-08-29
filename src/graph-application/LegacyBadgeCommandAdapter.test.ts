import { describe, expect, it } from "vitest";
import type { GraphBadgeAction, GraphBadgeRequest } from "./GraphBadgeRequest";
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

const request: GraphBadgeRequest = {
  action: "toggle-badge",
  badgeId: "A.md::parts",
  nodeId: "A.md",
  noteId: "A.md",
  linkTypeId: "parts",
  contextId: "graph:root",
  semantic: "link"
};

function withAction(action: GraphBadgeAction): GraphBadgeRequest {
  return { ...request, action };
}

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

    await adapter.executeBadge(withAction("toggle-badge"));
    await adapter.executeBadge(withAction("open-badge-input"));
    await adapter.executeBadge(withAction("expand-badge-chain"));

    expect(calls).toEqual([
      "toggle:A.md: Parts ",
      "input:A.md",
      "chain: Parts "
    ]);
  });

  it("does nothing when the node cannot be resolved", async () => {
    const { adapter, calls } = setup({ node: { id: "other", sourcePath: "other.md" } });

    await adapter.executeBadge(request);

    expect(calls).toEqual([]);
  });

  it("does nothing when the file or link type cannot be resolved", async () => {
    const missingFile = setup({ file: { path: "other.md" } });
    const missingLinkType = setup({ linkTypes: [{ property: "unrelated" }] });

    await missingFile.adapter.executeBadge(withAction("open-badge-input"));
    await missingLinkType.adapter.executeBadge(withAction("expand-badge-chain"));

    expect(missingFile.calls).toEqual([]);
    expect(missingLinkType.calls).toEqual([]);
  });
});
