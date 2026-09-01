import { describe, expect, it } from "vitest";
import { ObsidianGraphExpansionNoteAdapter } from "./ObsidianGraphExpansionNoteAdapter";

interface TestFile {
  path: string;
  basename: string;
  frontmatter?: Readonly<Record<string, unknown>>;
}

function adapter(files: readonly TestFile[]) {
  return new ObsidianGraphExpansionNoteAdapter<TestFile>({
    getFile: (noteId) => files.find((file) => file.path === noteId),
    getPath: (file) => file.path,
    getName: (file) => file.basename,
    getProperties: (file) => file.frontmatter,
    getConfiguredSize: (properties) => Number(properties.size) || undefined,
    getIcon: (properties) => typeof properties.icon === "string"
      ? properties.icon
      : undefined
  });
}

describe("ObsidianGraphExpansionNoteAdapter", () => {
  it("converts a vault file and cached frontmatter into a GraphNote", async () => {
    const reader = adapter([{
      path: "Folder/Target.md",
      basename: "Target",
      frontmatter: { size: 24, icon: "🔎", kind: "example" }
    }]);

    await expect(reader.readNote("Folder/Target.md")).resolves.toEqual({
      id: "Folder/Target.md",
      path: "Folder/Target.md",
      name: "Target",
      availability: "available",
      properties: { size: 24, icon: "🔎", kind: "example" },
      configuredSize: 24,
      icon: "🔎"
    });
  });

  it("represents an unresolved vault path as a missing note", async () => {
    const reader = adapter([]);

    await expect(reader.readNote("Folder/Missing.md")).resolves.toEqual({
      id: "Folder/Missing.md",
      path: "Folder/Missing.md",
      name: "Missing",
      availability: "missing",
      properties: {}
    });
  });

  it("shares synchronous snapshot conversion and preserves a missing fallback name", () => {
    const reader = adapter([]);

    expect(reader.readNoteNow("Folder/Missing.md", "Display name")).toEqual({
      id: "Folder/Missing.md",
      path: "Folder/Missing.md",
      name: "Display name",
      availability: "missing",
      properties: {}
    });
  });

  it("rejects an empty identity", async () => {
    await expect(adapter([]).readNote("  ")).resolves.toBeUndefined();
  });
});
