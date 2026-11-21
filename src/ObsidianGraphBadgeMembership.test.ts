import { describe, expect, it, vi } from "vitest";
import { TFile, type App } from "obsidian";
import { planGraphBadgeMembership } from "./ObsidianGraphBadgeMembership";
import { DEFAULT_GRAPH_PROPERTY_KEYS } from "./GraphPropertyKeys";
import { DEFAULT_LINK_TYPE_PROPERTY_KEYS } from "./NoteTypePropertyKeys";

vi.mock("obsidian", () => ({ TFile: class {}, Modal: class {} }));

function file(path: string): TFile {
  const name = path.split("/").at(-1)!;
  return Object.assign(new TFile(), { path, name, basename: name.slice(0, -3), extension: "md" });
}

function fixture() {
  const owner = file("Project/A.md");
  const member = file("Project/B.md");
  const sibling = file("Other/B.md");
  const added = file("Project/C.md");
  const definition = file("Definitions/Scope.md");
  const files = new Map([owner, member, sibling, added, definition].map((note) => [note.path, note]));
  const initial = {
    scope: ["[member](./B.md#part)", 10, false],
    Deliverables: "[someone else](../Other/B.md)"
  };
  const frontmatters = new Map<string, Record<string, unknown>>([
    [owner.path, initial],
    [definition.path, { linkType: "lens", properties: ["scope", "deliverables"], writeProperty: "deliverables" }]
  ]);
  const process = vi.fn(async (note: TFile, callback: (frontmatter: Record<string, unknown>) => void) => {
    const next = { ...frontmatters.get(note.path) };
    callback(next);
    frontmatters.set(note.path, next);
  });
  const generate = vi.fn((note: TFile, _sourcePath: string) => `[${note.basename}](./${note.name})`);
  const app = {
    vault: { getAbstractFileByPath: (path: string) => files.get(path) },
    metadataCache: {
      getFileCache: (note: TFile) => ({ frontmatter: frontmatters.get(note.path) }),
      getFirstLinkpathDest: (path: string) => files.get(path) ?? files.get(`${path}.md`)
    },
    fileManager: { processFrontMatter: process, generateMarkdownLink: generate }
  } as unknown as App;
  const config = {
    graphPropertyKeys: DEFAULT_GRAPH_PROPERTY_KEYS,
    defaultRootNodeProperties: [] as string[],
    linkTypePropertyKeys: DEFAULT_LINK_TYPE_PROPERTY_KEYS
  };
  return { owner, member, added, definition, app, config, files, frontmatters, process, generate };
}

describe("badge membership destinations", () => {
  it("uses the enclosing Lens read property and appends once alongside a relative parent reference", async () => {
    const f = fixture();
    const planner = planGraphBadgeMembership(f.app, {
      kind: "lens", ownerPath: f.owner.path, referencePath: f.member.path, instanceId: "nested",
      definitionId: f.definition.path, readProperties: ["scope", "deliverables"], provenance: ["scope"]
    }, () => f.config);
    expect(planner.destinations()).toEqual([{
      ownerPath: f.owner.path, referencePath: f.member.path, property: "scope", lensDefinitionId: f.definition.path
    }]);
    expect(f.process).not.toHaveBeenCalled();
    const [destination] = planner.destinations();
    const entry = { path: f.added.path, file: f.added };
    await expect(planner.append(destination, [entry, entry])).resolves.toMatchObject({
      changedFilePaths: [f.owner.path], items: [{ path: entry.path, status: "added" }]
    });
    await expect(planner.append(destination, [entry])).resolves.toMatchObject({
      changedFilePaths: [], items: [{ status: "already-present" }]
    });
    expect(f.generate).toHaveBeenCalledExactlyOnceWith(f.added, f.owner.path);
    expect(f.frontmatters.get(f.owner.path)).toEqual({
      scope: ["[member](./B.md#part)", 10, false, "[C](./C.md)"], Deliverables: "[someone else](../Other/B.md)"
    });
  });

  it("honors defaults, remapped and canonical roots, casing, and explicit body-only membership", () => {
    const f = fixture();
    const reference = "[B](./B.md)";
    f.config.graphPropertyKeys = { ...f.config.graphPropertyKeys, rootNodes: "mapped" };
    f.frontmatters.set(f.owner.path, { Mapped: reference, RootNodes: reference, Scope: reference, "None-type links": reference });
    const planner = planGraphBadgeMembership(f.app, { kind: "note", ownerPath: f.owner.path, referencePath: f.member.path }, () => f.config);
    expect(planner.destinations().map(({ property }) => property)).toEqual(["Mapped", "RootNodes"]);
    f.config.defaultRootNodeProperties = ["scope", "None-type links"];
    expect(planner.destinations().map(({ property }) => property)).toEqual(["Scope"]);
    f.frontmatters.set(f.owner.path, { rootNodeProperties: ["None-type links"], Scope: reference, "None-type links": reference });
    expect(planner.destinations()).toEqual([]);
  });

  it("rejects a replaced owner and a note replaced before its queued callback", async () => {
    const f = fixture();
    f.frontmatters.set(f.owner.path, { rootNodes: "[B](./B.md)" });
    const context = { kind: "note", ownerPath: f.owner.path, referencePath: f.member.path } as const;
    const planner = planGraphBadgeMembership(f.app, context, () => f.config);
    const [destination] = planner.destinations();
    const entry = { path: f.added.path, file: f.added };
    f.files.set(f.added.path, file(f.added.path));
    await expect(planner.append(destination, [entry])).resolves.toMatchObject({ changedFilePaths: [], items: [{ status: "stale" }] });
    f.files.set(f.owner.path, file(f.owner.path));
    await expect(planner.append(destination, [entry])).resolves.toMatchObject({ changedFilePaths: [], items: [{ status: "stale" }] });
    expect(f.process).toHaveBeenCalledOnce();
    expect(f.generate).not.toHaveBeenCalled();
  });
});
