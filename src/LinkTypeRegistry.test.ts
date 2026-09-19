import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => {
  class TFile {}
  return {
    TFile,
    parseYaml: () => ({})
  };
});

import { TFile, type App } from "obsidian";
import { LinkTypeRegistry } from "./LinkTypeRegistry";

interface FixtureDefinition {
  file: TFile;
  frontmatter: Record<string, unknown>;
}

function definition(path: string, property: string, valid = true): FixtureDefinition {
  const file = Object.assign(new TFile(), {
    path,
    name: path.split("/").pop() ?? path,
    basename: (path.split("/").pop() ?? path).replace(/\.md$/i, ""),
    extension: "md"
  });
  return {
    file,
    frontmatter: {
      type: valid ? ["[[Graph Link]]"] : ["[[Ordinary Note]]"],
      key: property,
      property
    }
  };
}

describe("LinkTypeRegistry explicit graph references", () => {
  let inFolder: FixtureDefinition;
  let referenced: FixtureDefinition;
  let invalid: FixtureDefinition;
  let registry: LinkTypeRegistry;

  beforeEach(() => {
    inFolder = definition("O3/LinkTypes/Client.md", "client");
    referenced = definition("System/LinkTypes/Parts.md", "parts");
    invalid = definition("System/LinkTypes/Not a LinkType.md", "ignored", false);
    const records = new Map(
      [inFolder, referenced, invalid].map((entry) => [entry.file.path, entry])
    );
    const app = {
      vault: {
        getFiles: () => [inFolder.file, referenced.file, invalid.file],
        cachedRead: async () => ""
      },
      metadataCache: {
        getFileCache: (file: TFile) => ({
          frontmatter: records.get(file.path)?.frontmatter
        })
      }
    } as unknown as App;
    registry = new LinkTypeRegistry(
      app,
      "O3/LinkTypes",
      { linkType: { property: "type", value: "Graph Link" } }
    );
  });

  it("keeps folder discovery scoped while accepting a valid explicitly referenced definition", async () => {
    await registry.load();
    expect(registry.getAll().map((linkType) => linkType.file.path)).toEqual([
      "O3/LinkTypes/Client.md"
    ]);

    await registry.loadReferencedFiles([referenced.file, invalid.file]);

    expect(registry.getAll().map((linkType) => linkType.file.path)).toEqual([
      "O3/LinkTypes/Client.md",
      "System/LinkTypes/Parts.md"
    ]);
    expect(registry.getByProperty("parts")?.file.path).toBe("System/LinkTypes/Parts.md");
  });

  it("does not duplicate a referenced definition across repeated graph hydration", async () => {
    await registry.load();
    await registry.loadReferencedFiles([referenced.file]);
    await registry.loadReferencedFiles([referenced.file]);

    expect(registry.getAll().filter((linkType) => linkType.file.path === referenced.file.path))
      .toHaveLength(1);
  });
});
