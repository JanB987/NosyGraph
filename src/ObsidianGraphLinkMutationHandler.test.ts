import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => {
  class TFile {}
  return { TFile };
});

import { TFile } from "obsidian";
import { ObsidianGraphLinkMutationHandler } from "./ObsidianGraphLinkMutationHandler";

function file(path: string): TFile {
  return Object.assign(new TFile(), { path, name: path, basename: path.replace(/\.md$/i, "") });
}

function appFixture(frontmatter: Record<string, unknown>) {
  const parent = file("Parent.md");
  const child = file("Child.md");
  const files = new Map([[parent.path, parent], [child.path, child]]);
  return {
    parent,
    child,
    app: {
      vault: {
        getAbstractFileByPath: (path: string) => files.get(path) ?? null
      },
      metadataCache: {
        getFirstLinkpathDest: (candidate: string) => candidate === "Child" ? child : undefined
      },
      fileManager: {
        generateMarkdownLink: (target: TFile) => `[[${target.basename}]]`,
        processFrontMatter: async (_target: TFile, callback: (value: Record<string, unknown>) => void) => {
          callback(frontmatter);
        }
      }
    }
  };
}

describe("ObsidianGraphLinkMutationHandler Lens mutations", () => {
  it("removes a Lens target from every matching read property", async () => {
    const frontmatter: Record<string, unknown> = {
      status: ["[[Child]]"],
      tags: ["[[Child]]"]
    };
    const fixture = appFixture(frontmatter);
    const handler = new ObsidianGraphLinkMutationHandler(fixture.app as never);

    const result = await handler.applyBadgeDrop({
      target: { nodeId: "Parent.md", path: "Parent.md" },
      sources: [{ nodeId: "Child.md", path: "Child.md" }],
      property: "status",
      readProperties: ["status", "tags"],
      semantic: "lens",
      discoveryDirection: "outgoing"
    });

    expect(result).toEqual({ added: [], removed: ["Child.md"], skipped: [] });
    expect(frontmatter.status).toBeUndefined();
    expect(frontmatter.tags).toBeUndefined();
  });

  it("adds a new Lens target through its write property when no read property matches", async () => {
    const frontmatter: Record<string, unknown> = { tags: ["[[Other]]"] };
    const fixture = appFixture(frontmatter);
    const handler = new ObsidianGraphLinkMutationHandler(fixture.app as never);

    const result = await handler.applyBadgeDrop({
      target: { nodeId: "Parent.md", path: "Parent.md" },
      sources: [{ nodeId: "Child.md", path: "Child.md" }],
      property: "status",
      readProperties: ["status", "tags"],
      semantic: "lens",
      discoveryDirection: "outgoing"
    });

    expect(result).toEqual({ added: ["Child.md"], removed: [], skipped: [] });
    expect(frontmatter.status).toEqual(["[[Child]]"]);
  });
});
