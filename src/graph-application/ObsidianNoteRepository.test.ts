import { describe, expect, it } from "vitest";
import { ObsidianNoteRepository } from "./ObsidianNoteRepository";
import { ObsidianRelationshipTargetReader } from "./ObsidianRelationshipTargetReader";
import { ObsidianNoteWriter } from "./ObsidianNoteWriter";

interface File {
  path: string;
  basename: string;
  frontmatter: Record<string, unknown>;
}

function fixture() {
  const files: File[] = [
    { path: "A.md", basename: "A", frontmatter: { Related: ["[[B]]", "[[Missing]]"] } },
    { path: "B.md", basename: "B", frontmatter: { related: "[[A]]" } },
    { path: "C.md", basename: "C", frontmatter: {} }
  ];
  const resolve = (candidate: string) => {
    const name = candidate.replace(/\.md$/i, "").toLowerCase();
    return files.find((file) => file.path.toLowerCase() === (name.endsWith(".md") ? name : `${name}.md`).toLowerCase())?.path;
  };
  const repository = new ObsidianNoteRepository<File>({
    listMarkdownFiles: () => files,
    getFile: (path) => files.find((file) => file.path === path),
    getPath: (file) => file.path,
    getName: (file) => file.basename,
    getProperties: (file) => file.frontmatter,
    resolveLink: (candidate) => resolve(candidate)
  });
  return { files, repository, resolve };
}

describe("ObsidianNoteRepository", () => {
  it("reads detached notes and preserves unresolved outgoing paths", async () => {
    const { repository } = fixture();
    await expect(repository.getNote("A.md")).resolves.toMatchObject({
      id: "A.md", path: "A.md", name: "A", availability: "available"
    });
    await expect(repository.getOutgoingLinks("A.md", "related")).resolves.toEqual(["B.md", "Missing"]);
  });

  it("derives incoming links from the same resolved relationship boundary", async () => {
    const { repository } = fixture();
    await expect(repository.getIncomingLinks("A.md", "related")).resolves.toEqual(["B.md"]);
  });

  it("keeps repository output detached from host records", async () => {
    const { files, repository } = fixture();
    const note = await repository.getNote("A.md");
    files[0].frontmatter.Related = ["[[C]]"];
    expect(note?.properties.Related).toEqual(["[[B]]", "[[Missing]]"]);
  });
});

describe("ObsidianRelationshipTargetReader", () => {
  it("combines configured directions and marks missing targets", async () => {
    const { repository } = fixture();
    const reader = new ObsidianRelationshipTargetReader({
      notes: repository,
      getRelationshipType: () => ({ property: "related", direction: "both" })
    });
    await expect(reader.readTargets({
      sourceNoteId: "A.md", linkTypeId: "related", contextId: "graph:root"
    })).resolves.toEqual([
      { noteId: "B.md", label: "B", missing: false },
      { noteId: "Missing", label: "Missing", missing: true }
    ]);
  });
});

describe("ObsidianNoteWriter", () => {
  it("adds, deduplicates, removes, and updates frontmatter through one host gateway", async () => {
    const { files, resolve } = fixture();
    const writer = new ObsidianNoteWriter<File>({
      getFile: (path) => files.find((file) => file.path === path),
      getPath: (file) => file.path,
      getName: (file) => file.basename,
      processFrontMatter: async (file, mutate) => mutate(file.frontmatter),
      resolveLink: (candidate) => resolve(candidate)
    });
    await writer.addRelationship({ sourceNoteId: "A.md", targetNoteId: "B.md", property: "related" });
    expect(files[0].frontmatter.Related).toEqual(["[[B]]", "[[Missing]]"]);
    await writer.addRelationship({ sourceNoteId: "A.md", targetNoteId: "C.md", property: "related" });
    expect(files[0].frontmatter.Related).toEqual(["[[B]]", "[[Missing]]", "[[C]]"]);
    await writer.removeRelationship({ sourceNoteId: "A.md", targetNoteId: "B.md", property: "related" });
    expect(files[0].frontmatter.Related).toEqual(["[[Missing]]", "[[C]]"]);
    await writer.updateFrontmatter("A.md", { set: { Title: "A note" }, remove: ["missing"] });
    expect(files[0].frontmatter).toEqual({ Related: ["[[Missing]]", "[[C]]"], Title: "A note" });
  });
});
