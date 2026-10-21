import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => {
  class TFile {}
  return {
    TFile,
    parseYaml: (content: string) => JSON.parse(content)
  };
});

import { TFile, type App } from "obsidian";
import { ObsidianBaseViewFilterResolver } from "./ObsidianBaseViewFilterResolver";

function file(path: string, extension: string, frontmatter: Record<string, unknown> = {}): TFile {
  return Object.assign(new TFile(), {
    path,
    name: path.split("/").pop() ?? path,
    basename: (path.split("/").pop() ?? path).replace(/\.[^.]+$/i, ""),
    extension,
    frontmatter
  });
}

async function resolveFilterResult(filter: unknown, includeAssets = false, emptyVault = false, fixtureNotes?: TFile[], definition?: Record<string, unknown>) {
  const base = file("Filters/graph.base", "base");
  const notes = fixtureNotes ?? [
    file("Demo/Characters/Person A.md", "md", { related: ["[[Demo/Characters/Person A.md|Person]]"] }),
    file("Archive/Characters/Person A.md", "md"),
    file("Demo/Locations/Place.md", "md")
  ];
  if (includeAssets) notes.push(file("Demo/_assets/Image.md", "md"));
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => path === base.path ? base : null,
      getFiles: () => [base, ...notes],
      getMarkdownFiles: () => emptyVault ? [] : notes,
      read: async () => JSON.stringify(definition ?? { views: [{ name: "Test", filters: filter }] })
    },
    metadataCache: {
      getFirstLinkpathDest: () => base,
      getFileCache: (candidate: TFile) => ({
        frontmatter: (candidate as TFile & { frontmatter?: Record<string, unknown> }).frontmatter ?? {}
      })
    }
  } as unknown as App;
  const result = await new ObsidianBaseViewFilterResolver(app).resolve("[[Filters/graph.base#Test]]", null);
  expect(result.source).toBe("base-yaml");
  return result;
}

async function resolveFilter(filter: unknown): Promise<string[]> {
  const result = await resolveFilterResult(filter);
  return result.files.map((candidate) => candidate.path);
}

describe("ObsidianBaseViewFilterResolver", () => {
  describe("not filter groups", () => {
    const a = 'a == true';
    const b = 'b == true';
    const notes = () => [
      file("Neither.md", "md", { a: false, b: false }),
      file("A only.md", "md", { a: true, b: false }),
      file("B only.md", "md", { a: false, b: true }),
      file("Both.md", "md", { a: true, b: true })
    ];

    it("excludes assets and Rumor Board independently, including notes matching both", async () => {
      const result = await resolveFilterResult({ and: [{ not: [
        'file.inFolder("Demo/_assets")', 'file.name == "Rumor Board"'
      ] }] }, false, false, [
        file("Demo/Person.md", "md"), file("Demo/_assets/Image.md", "md"),
        file("Demo/Rumor Board.md", "md"), file("Demo/_assets/Rumor Board.md", "md")
      ]);
      expect(result.files.map((candidate) => candidate.path)).toEqual(["Demo/Person.md"]);
    });

    it.each([
      [{ not: [a, b] }, ["Neither.md"]],
      [{ not: [] }, ["Neither.md", "A only.md", "B only.md", "Both.md"]],
      [{ not: [a] }, ["Neither.md", "B only.md"]],
      [{ not: a }, ["Neither.md", "B only.md"]],
      [{ not: [{ and: [a, b] }] }, ["Neither.md", "A only.md", "B only.md"]],
      [{ or: [{ not: [a, b] }, { and: [a, b] }] }, ["Neither.md", "Both.md"]]
    ])("evaluates none-of semantics while preserving nested groups: %j", async (filter, expected) => {
      const result = await resolveFilterResult(filter, false, false, notes());
      expect(result.files.map((candidate) => candidate.path)).toEqual(expected);
    });

    it("validates every not child before evaluating matches", async () => {
      const result = await resolveFilterResult({ not: [true, 'unsupportedFunction()'] });
      expect(result.status).toBe("filter-unsupported");
      expect(result.files).toEqual([]);
      expect(result.message).toContain("unsupportedFunction()");
    });
  });

  describe("global and view filter composition", () => {
    const globalFilter = { and: ['file.inFolder("Demo")'] };
    const viewFilter = { and: ['file.name != "Excluded"'] };
    const notes = () => [
      file("Outside/Other.md", "md"), file("Demo/Excluded.md", "md"),
      file("Demo/Included.md", "md"), file("Demo/Second.md", "md")
    ];
    const resolve = (baseFields: Record<string, unknown>, viewFields: Record<string, unknown>) =>
      resolveFilterResult(undefined, false, false, notes(), {
        ...baseFields, views: [{ name: "Test", ...viewFields }]
      });

    it("ANDs global and view filters and previews the effective filter", async () => {
      const result = await resolve({ filters: globalFilter }, { filters: viewFilter });
      expect(result.files.map((candidate) => candidate.path)).toEqual(["Demo/Included.md", "Demo/Second.md"]);
      expect(result.filterPreview).toEqual({ and: [globalFilter, viewFilter] });
    });

    it("applies the view limit after evaluating both scopes", async () => {
      const result = await resolve({ filters: globalFilter }, { filters: viewFilter, limit: 1 });
      expect(result.files.map((candidate) => candidate.path)).toEqual(["Demo/Included.md"]);
    });

    it("also combines the legacy singular filter fields", async () => {
      const result = await resolve({ filter: globalFilter }, { filter: viewFilter });
      expect(result.files.map((candidate) => candidate.path)).toEqual(["Demo/Included.md", "Demo/Second.md"]);
    });

    it.each([
      [{ filters: globalFilter }, {}, ["Demo/Excluded.md", "Demo/Included.md", "Demo/Second.md"]],
      [{}, { filters: viewFilter }, ["Outside/Other.md", "Demo/Included.md", "Demo/Second.md"]],
      [{}, {}, ["Outside/Other.md", "Demo/Excluded.md", "Demo/Included.md", "Demo/Second.md"]],
      [{ filters: false }, { filters: true }, []],
      [{ filters: true }, { filters: false }, []]
    ])("preserves single-scope, absent, and boolean filters: %j / %j", async (baseFields, viewFields, expected) => {
      const result = await resolve(baseFields as Record<string, unknown>, viewFields as Record<string, unknown>);
      expect(result.files.map((candidate) => candidate.path)).toEqual(expected);
    });

    it("reports unsupported global syntax even if the view has its own filter", async () => {
      const result = await resolve({ filters: 'unsupportedFunction()' }, { filters: viewFilter });
      expect(result.status).toBe("filter-unsupported");
      expect(result.message).toContain("unsupportedFunction()");
      expect(result.files).toEqual([]);
    });
  });

  it("returns the seven task results from the reported db test Base filter", async () => {
    const expected = [
      "Start file/• Welcome.md",
      "System/Templates/TEMPL • Task - V1.md",
      "• task 123.md", "• task 3.md", "• task 2.md", "• task 4.md", "• task 5.md"
    ];
    const notes = [...expected, "Test Files/• task 1.md"].map((path) =>
      file(path, "md", { type: ["[[tpTask]]"] })
    );
    notes.push(file("Unrelated.md", "md", { type: ["[[Other]]"] }));
    const result = await resolveFilterResult({ and: [
      'type.contains(link("tpTask"))',
      '!file.path.contains("test files")'
    ] }, false, false, notes);
    expect(result.status).toBe("resolved");
    expect(result.files.map((candidate) => candidate.path)).toEqual(expected);
  });

  it.each([
    '!file.path.contains("Demo/_assets/")',
    '! file.path.contains("Demo/_assets/")',
    '!(file.path.contains("Demo/_assets/"))',
    '((!file.path.contains("Demo/_assets/")))',
    '!!!file.path.contains("Demo/_assets/")',
    { not: 'file.path.contains("Demo/_assets/")' },
    { and: ['file.path.contains("Demo/")', '!file.path.contains("Demo/_assets/")'] }
  ])("excludes assets with negation: %j", async (filter) => {
    const result = await resolveFilterResult(filter, true);
    expect(result.status).toBe("resolved");
    const expected = typeof filter === "object" && "and" in filter
      ? ["Demo/Characters/Person A.md", "Demo/Locations/Place.md"]
      : ["Demo/Characters/Person A.md", "Archive/Characters/Person A.md", "Demo/Locations/Place.md"];
    expect(result.files.map((candidate) => candidate.path)).toEqual(expected);
  });

  it("supports double negation and keeps != distinct from unary !", async () => {
    expect(await resolveFilter('!!file.path.contains("Demo/Characters/")')).toEqual(["Demo/Characters/Person A.md"]);
    expect(await resolveFilter('!(file.path != "Demo/Characters/Person A.md")')).toEqual(["Demo/Characters/Person A.md"]);
  });

  it("handles quoted punctuation without treating it as boolean syntax", async () => {
    expect(await resolveFilter('!file.path.contains("!(&&||)")')).toHaveLength(3);
    expect(await resolveFilter('!file.path.contains("escaped \\\" quote")')).toHaveLength(3);
  });

  it("reports unsupported syntax even with no Markdown files to evaluate", async () => {
    const result = await resolveFilterResult('!unsupportedFunction()', false, true);
    expect(result.status).toBe("filter-unsupported");
    expect(result.message).toContain("unsupportedFunction()");
  });

  it("supports negation of existing folder, tag, and link predicates", async () => {
    expect(await resolveFilter('!file.inFolder("Demo/")')).toEqual(["Archive/Characters/Person A.md"]);
    expect(await resolveFilter('!file.hasTag("missing")')).toHaveLength(3);
    expect(await resolveFilter('!related.contains(link("Person A"))')).toEqual([
      "Archive/Characters/Person A.md", "Demo/Locations/Place.md"
    ]);
  });

  it.each([
    '!file.path.unknown("Demo/")',
    '!file.path.contains(unsupportedFunction())',
    '!related.contains(link(unsupportedFunction()))',
    '!file.path.contains("Demo/", "Archive/")',
    '!(file.path.contains("Demo/")',
    '!',
    '!file.path.contains("Demo/") && file.path.contains("Characters/")',
    { or: ['file.path.contains("Demo/")', '!unsupportedFunction()'] },
    { field: "file.path", operator: "unknown", value: "Demo/" }
  ])("reports unsupported expressions rather than silently matching: %j", async (filter) => {
    const result = await resolveFilterResult(filter, true);
    expect(result.status).toBe("filter-unsupported");
    expect(result.message).toMatch(/unsupported|invalid/i);
    expect(result.files).toEqual([]);
    expect(result.filterPreview).toEqual(filter);
  });

  it.each([
    'file.path.contains("Demo/Characters/")',
    'file.path.icontains("demo/characters/")',
    'file.path == "Demo/Characters/Person A.md"',
    'file.path.startsWith("Demo/Characters/")',
    'file.path.endsWith("Characters/Person A.md")',
    { field: "file.path", operator: "contains", value: "Demo/Characters/" },
    { field: "file.path", operator: "==", value: "Demo/Characters/Person A.md" }
  ])("compares full paths for %j", async (filter) => {
    const expected = typeof filter === "string" && filter.includes("endsWith")
      ? ["Demo/Characters/Person A.md", "Archive/Characters/Person A.md"]
      : ["Demo/Characters/Person A.md"];
    expect(await resolveFilter(filter)).toEqual(expected);
  });

  it.each([
    'file.path != "Demo/Characters/Person A.md"',
    'file.path does-not-contain "Demo/Characters/"',
    { field: "file.path", operator: "not-contains", value: "Demo/Characters/" }
  ])("keeps same-name files in other directories for %j", async (filter) => {
    expect(await resolveFilter(filter)).toEqual(["Archive/Characters/Person A.md", "Demo/Locations/Place.md"]);
  });

  it("preserves the extension for path comparisons", async () => {
    expect(await resolveFilter('file.path.contains(".md")')).toHaveLength(3);
    expect(await resolveFilter('file.path == "Demo/Characters/Person A"')).toEqual([]);
    expect(await resolveFilter('file.path == "Person A.md"')).toEqual([]);
  });

  it("preserves directories when comparing file.folder", async () => {
    expect(await resolveFilter('file.folder == "Demo/Characters"')).toEqual(["Demo/Characters/Person A.md"]);
    expect(await resolveFilter('file.folder.contains("Demo/")')).toEqual([
      "Demo/Characters/Person A.md", "Demo/Locations/Place.md"
    ]);
  });

  it("retains existing wiki-link normalization for note properties", async () => {
    expect(await resolveFilter('related.contains(link("Person A"))')).toEqual(["Demo/Characters/Person A.md"]);
  });

  it("uses the current linked view definition instead of a stale internal API result", async () => {
    const base = file("Filters/graph.base", "base");
    const previousGraphNode = file("Previous Graph Node.md", "md", { status: "closed" });
    const currentGraphNode = file("Current Graph Node.md", "md", { status: "open" });
    const graphNote = file("Current Graph.md", "md");
    const files = [base, previousGraphNode, currentGraphNode, graphNote];
    const app = {
      vault: {
        getAbstractFileByPath: (path: string) => files.find((candidate) => candidate.path === path) ?? null,
        getFiles: () => files,
        getMarkdownFiles: () => files.filter((candidate) => candidate.extension === "md"),
        read: async () => JSON.stringify({
          views: [
            { name: "Open", filters: { field: "status", operator: "==", value: "open" } }
          ]
        })
      },
      metadataCache: {
        getFirstLinkpathDest: (linkPath: string) => files.find((candidate) =>
          candidate.path === linkPath || candidate.path.replace(/\.[^.]+$/i, "") === linkPath
        ) ?? null,
        getFileCache: (candidate: TFile) => ({
          frontmatter: (candidate as TFile & { frontmatter?: Record<string, unknown> }).frontmatter ?? {}
        })
      },
      internalPlugins: {
        plugins: {
          bases: {
            instance: {
              getViewResults: vi.fn(async () => [previousGraphNode])
            }
          }
        }
      }
    } as unknown as App;

    const result = await new ObsidianBaseViewFilterResolver(app).resolve(
      "[[Filters/graph.base#Open]]",
      graphNote
    );

    expect(result.source).toBe("base-yaml");
    expect(result.files.map((candidate) => candidate.path)).toEqual(["Current Graph Node.md"]);
  });
});
