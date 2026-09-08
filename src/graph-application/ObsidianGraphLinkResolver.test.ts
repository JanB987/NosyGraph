import type { App, TFile } from "obsidian";
import { describe, expect, it } from "vitest";
import { ObsidianGraphLinkResolver } from "./ObsidianGraphLinkResolver";
import type { O3LinkType } from "../O3LinkType";

interface FixtureFile {
  file: TFile;
  frontmatter: Record<string, unknown>;
}

function fixture() {
  const createFile = (path: string, frontmatter: Record<string, unknown>): FixtureFile => {
    const file = Object.assign({}, {
      path,
      basename: path.replace(/\.md$/i, ""),
      name: path.split("/").pop() ?? path
    }) as TFile;
    return { file, frontmatter };
  };

  const records = [
    createFile("A.md", { Related: ["[[B]]", "[[Missing]]"], Parts: "[[C]]" }),
    createFile("B.md", { related: "[[A]]" }),
    createFile("C.md", {})
  ];
  const byPath = new Map(records.map((record) => [record.file.path, record]));
  const resolve = (candidate: string): TFile | undefined => {
    const normalized = candidate.replace(/^\[\[|\]\]$/g, "").split("|")[0]?.split("#")[0]?.trim() ?? "";
    const path = normalized.toLowerCase().endsWith(".md") ? normalized : `${normalized}.md`;
    return records.find((record) => record.file.path.toLowerCase() === path.toLowerCase())?.file;
  };
  const app = {
    vault: {
      getMarkdownFiles: () => records.map((record) => record.file),
      getAbstractFileByPath: (path: string) => byPath.get(path)?.file
    },
    metadataCache: {
      getFileCache: (file: TFile) => byPath.get(file.path)
        ? { frontmatter: byPath.get(file.path)!.frontmatter }
        : undefined,
      getFirstLinkpathDest: (candidate: string) => resolve(candidate)
    }
  } as unknown as App;
  const resolver = new ObsidianGraphLinkResolver(app, {
    isFile: (value): value is TFile => typeof value === "object" && value !== null && "path" in value,
    getLabels: () => new Map([["B.md", "Bee"], ["C.md", "See"]]),
    getExpansionPropertyAliases: () => new Map([["related", ["related", "parts"]]]),
    getDiscoveryDirections: () => new Map([["related", "outgoing"]])
  });
  return { records, resolver };
}

const linkType = (direction?: O3LinkType["linkDiscoveryDirection"]): O3LinkType => ({
  property: "related",
  linkDiscoveryDirection: direction ?? "outgoing"
} as O3LinkType);

describe("ObsidianGraphLinkResolver", () => {
  it("collects YAML links by property, resolves aliases, and preserves missing links", () => {
    const { records, resolver } = fixture();
    const byType = resolver.collectFrontmatterLinksByType(records[0]!.file);
    expect(byType.get("related")).toEqual(new Set(["B.md", "Missing.md", "C.md"]));
  });

  it("resolves outgoing targets with labels and missing status", () => {
    const { records, resolver } = fixture();
    expect(resolver.resolveLinkedTargets(records[0]!.file, linkType())).toEqual([
      { path: "B.md", label: "Bee", file: records[1]!.file, missing: false },
      { path: "Missing.md", label: "Missing", file: null, missing: true },
      { path: "C.md", label: "See", file: records[2]!.file, missing: false }
    ]);
  });

  it("supports incoming target discovery through its own index", () => {
    const { records, resolver } = fixture();
    expect(resolver.resolveLinkedTargets(records[0]!.file, linkType("incoming"))).toEqual([
      { path: "B.md", label: "Bee", file: records[1]!.file, missing: false }
    ]);
  });
});