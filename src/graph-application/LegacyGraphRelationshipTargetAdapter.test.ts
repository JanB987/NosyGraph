import { describe, expect, it } from "vitest";
import { LegacyGraphRelationshipTargetAdapter } from "./LegacyGraphRelationshipTargetAdapter";

interface TestSource {
  path: string;
}

interface TestLinkType {
  id: string;
}

function createAdapter(options: { source?: TestSource; linkType?: TestLinkType } = {}) {
  const source = options.source ?? { path: "A.md" };
  const linkType = options.linkType ?? { id: "parts" };
  return new LegacyGraphRelationshipTargetAdapter<TestSource, TestLinkType>({
    getSource: (noteId) => noteId === source.path ? source : undefined,
    getLinkType: (linkTypeId) => linkTypeId === linkType.id ? linkType : undefined,
    resolveTargets: () => [
      { path: "B.md", label: "B", missing: false },
      { path: "B.md", label: "duplicate", missing: false },
      { path: "Missing.md", label: "Missing", missing: true },
      { path: "A.md", label: "self", missing: false },
      { path: "", label: "empty", missing: false }
    ]
  });
}

describe("LegacyGraphRelationshipTargetAdapter", () => {
  it("returns unique canonical targets and preserves missing notes", async () => {
    const adapter = createAdapter();

    expect(await adapter.readTargets({
      sourceNoteId: "A.md", linkTypeId: "parts", contextId: "graph:root"
    }))
      .toEqual([
        { noteId: "B.md", label: "B", missing: false },
        { noteId: "Missing.md", label: "Missing", missing: true }
      ]);
  });

  it("uses the note and link-type identities to resolve legacy inputs", async () => {
    const adapter = createAdapter();

    expect(await adapter.readTargets({
      sourceNoteId: "other.md", linkTypeId: "parts", contextId: "graph:root"
    }))
      .toEqual([]);
    expect(await adapter.readTargets({
      sourceNoteId: "A.md", linkTypeId: "other", contextId: "graph:root"
    }))
      .toEqual([]);
  });

  it("supports asynchronous host lookups", async () => {
    const adapter = new LegacyGraphRelationshipTargetAdapter<TestSource, TestLinkType>({
      getSource: async () => ({ path: "A.md" }),
      getLinkType: async () => ({ id: "parts" }),
      resolveTargets: async () => [{ path: "B.md", label: "", missing: false }]
    });

    expect(await adapter.readTargets({
      sourceNoteId: "A.md", linkTypeId: "parts", contextId: "embedded:project"
    }))
      .toEqual([{ noteId: "B.md", label: "B.md", missing: false }]);
  });
});
