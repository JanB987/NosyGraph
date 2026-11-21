import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => {
  class TFile {}
  return { TFile };
});

import { TFile } from "obsidian";
import { ObsidianGraphLinkMutationHandler } from "./ObsidianGraphLinkMutationHandler";

function file(path: string): TFile {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return Object.assign(new TFile(), { path, name, basename: name.replace(/\.md$/i, ""), extension: "md" });
}

function appFixture(frontmatter: Record<string, unknown>) {
  const parent = file("Parent.md");
  const child = file("Child.md");
  const files = new Map([[parent.path, parent], [child.path, child]]);
  return {
    parent,
    child,
    files,
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

describe("add-only badge link mutations", () => {
  it.each(["link", "parent", "lens"] as const)("uses the actual write property and equivalent read properties for %s", async (semantic) => {
    const frontmatter = { RELATED: 12, Legacy: ["untouched", "[[Child#Section|Alias]]"], unrelated: "value" };
    const f = appFixture(frontmatter);
    const added = file("Extra, (2).md");
    f.files.set(added.path, added);
    const write = vi.spyOn(f.app.fileManager, "processFrontMatter");
    const handler = new ObsidianGraphLinkMutationHandler(f.app as never);
    const request = {
      target: { nodeId: "two", path: f.parent.path },
      sources: [f.child, added, f.parent, added].map(({ path }) => ({ nodeId: path, path })),
      property: "related", readProperties: ["legacy", "related"], discoveryDirection: "both",
      definitionId: "Definitions/Label, not a YAML key.md", semantic, origin: "clipboard-batch"
    } as const;
    const result = await handler.applyBadgeLinkAdd(request);
    expect(write).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      added: [added.path], alreadyPresent: [f.child.path], removed: [], skipped: [f.parent.path, f.child.path],
      changedFilePaths: [f.parent.path], failed: []
    });
    expect(frontmatter).toEqual({ RELATED: [12, "[[Extra, (2)]]"], Legacy: ["untouched", "[[Child#Section|Alias]]"], unrelated: "value" });
    f.app.metadataCache.getFirstLinkpathDest = (candidate) => f.files.get(`${candidate}.md`);
    const repeated = await handler.applyBadgeLinkAdd(request);
    expect(repeated).toMatchObject({ added: [], removed: [], alreadyPresent: [f.child.path, added.path], changedFilePaths: [] });
    expect(frontmatter.RELATED).toEqual([12, "[[Extra, (2)]]"]);
  });

  it("reads inside each incoming write, keeps concurrent edits and isolates a rejected file", async () => {
    const f = appFixture({});
    const good = file("Folder/A.md"), failed = file("Folder/B.md"), duplicate = file("Folder/C.md");
    for (const entry of [good, failed, duplicate]) f.files.set(entry.path, entry);
    const frontmatterByPath = new Map<string, Record<string, unknown>>([
      [good.path, { Related: ["value", false] }], [duplicate.path, { Legacy: "[Parent](../Parent.md#Heading)" }]
    ]);
    const generate = vi.spyOn(f.app.fileManager, "generateMarkdownLink").mockReturnValue("[Parent](../Parent.md)");
    const process = vi.spyOn(f.app.fileManager, "processFrontMatter").mockImplementation(async (target, callback) => {
      if (target === failed) throw new Error("Read-only");
      const current = frontmatterByPath.get(target.path)!;
      if (target === good) (current.Related as unknown[]).push("concurrent edit");
      callback(current);
    });
    const result = await new ObsidianGraphLinkMutationHandler(f.app as never).applyBadgeLinkAdd({
      target: { nodeId: "parent", path: f.parent.path },
      sources: [good, failed, duplicate].map(({ path }) => ({ nodeId: path, path })),
      property: "related", readProperties: ["legacy"], discoveryDirection: "incoming", origin: "clipboard-batch"
    });
    expect(process.mock.calls.map(([target]) => target.path)).toEqual([good.path, failed.path, duplicate.path]);
    expect(generate).toHaveBeenCalledExactlyOnceWith(f.parent, good.path);
    expect(frontmatterByPath.get(good.path)).toEqual({ Related: ["value", false, "concurrent edit", "[Parent](../Parent.md)"] });
    expect(frontmatterByPath.get(duplicate.path)).toEqual({ Legacy: "[Parent](../Parent.md#Heading)" });
    expect(result).toMatchObject({
      added: [good.path], alreadyPresent: [duplicate.path], changedFilePaths: [good.path],
      failed: [{ path: failed.path, filePath: failed.path, reason: "Read-only" }]
    });
  });

  it("shares encoded path matching with property paste and badge drag/drop", async () => {
    const target = file("A #one%20(2).md");
    const reference = "[A](./A%20%23one%2520(2).md#Heading)";
    const frontmatter = { RELATED: [0, reference, { preserve: true }] };
    const f = appFixture(frontmatter);
    f.files.set(target.path, target);
    const handler = new ObsidianGraphLinkMutationHandler(f.app as never);
    const request = {
      target: { nodeId: f.parent.path, path: f.parent.path }, sources: [{ nodeId: target.path, path: target.path }],
      property: "related", discoveryDirection: "outgoing"
    } as const;
    await expect(handler.applyBadgeLinkAdd(request)).resolves.toMatchObject({ added: [], skipped: [target.path] });
    expect(frontmatter.RELATED).toEqual([0, reference, { preserve: true }]);
    await expect(handler.applyBadgeDrop(request)).resolves.toMatchObject({ removed: [target.path] });
    expect(frontmatter.RELATED).toEqual([0, { preserve: true }]);
  });
});
