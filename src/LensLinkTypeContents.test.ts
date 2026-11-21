import { describe, expect, it, vi } from "vitest";
import { TFile, type App } from "obsidian";
import { GraphEngine } from "./GraphEngine";
import { BasesGraphView } from "./GraphView";
import { O3GraphState, type O3GraphRuntimeNodeSnapshot } from "./O3GraphState";
import { O3LinkType } from "./O3LinkType";

vi.mock("obsidian", () => ({
  TFile: class {}, TFolder: class {}, Component: class {}, Menu: class {},
  Modal: class {}, FileView: class {}, Notice: class {}
}));

function file(name: string): TFile {
  return Object.assign(new TFile(), { path: name + ".md", basename: name.split("/").pop(), extension: "md" });
}

function snapshot(name: string, origin: O3GraphRuntimeNodeSnapshot["origin"] = { kind: "root" }): O3GraphRuntimeNodeSnapshot {
  const path = name + ".md";
  return { nodeId: path, path, x: 13, y: 29, pinned: true, origin, badges: {} };
}

function expansion(source: string, linkType: string): O3GraphRuntimeNodeSnapshot["origin"] {
  return { kind: "expansion", sourceNodeId: source + ".md", linkType };
}

function fixture() {
  const files = new Map(["Graph", "A", "B", "C", "Extra", "Explicit", "Obsolete", "Nested", "Types/Scope viewport", "Types/Nested", "Types/Relation"]
    .map((name) => [name + ".md", file(name)]));
  const frontmatter = {
    SCOPE: ["[[B|label]]", "[[A]]", "[[Missing]]"],
    deliverables: ["[[B]]", "[[C]]"],
    "scope-lens": ["[[Extra]]"],
    unrelated: ["[[Extra]]"]
  };
  const properties = new Map<string, Record<string, unknown>>([
    ["A.md", frontmatter],
    ["B.md", { related: ["[[C]]", "[[A]]", "[[Explicit]]"], nested: ["[[Nested]]"] }]
  ]);
  const app = {
    vault: { getAbstractFileByPath: (path: string) => files.get(path) ?? null },
    metadataCache: {
      getFileCache: (note: TFile) => ({ frontmatter: properties.get(note.path) }),
      getFirstLinkpathDest: (path: string) => files.get(path) ?? files.get(path + ".md") ?? null
    }
  } as unknown as App;
  const graph = files.get("Graph.md")!;
  const engine = new GraphEngine({} as HTMLElement, app, {
    initialSettings: {
      repulsionStrength: 1, centerStrength: 1, nodeRadius: 6, nodeConnectionSizeMultiplier: 0,
      nearRestVelocityThreshold: 0.05, restVelocityThreshold: 0.02, textFadeThreshold: 0.5
    },
    getMembershipOwnerPath: () => graph.path
  });
  const linkType = new O3LinkType(files.get("Types/Scope viewport.md")!, {
    key: "scope-lens", properties: [" SCOPE ", "deliverables"], linkType: "lens"
  });
  const nestedType = new O3LinkType(files.get("Types/Nested.md")!, { property: "nested", linkType: "lens" });
  const relation = new O3LinkType(files.get("Types/Relation.md")!, { property: "related" });
  const outer = { id: "a-instance", sourcePath: "A.md", label: "A", x: 100, y: 80, vx: 0, vy: 0, mass: 1, isBase: true, depth: 0 };
  const runtime = {
    nodeMap: engine["nodeMap"],
    nodes: engine["nodes"],
    containers: engine["embeddedGraphContainers"]
  };
  runtime.nodeMap.set(outer.id, outer);
  runtime.nodes.push(outer);
  Object.assign(engine, {
    activeNodeBadgeLinkTypes: [linkType, nestedType, relation],
    visibleNodeBadgeLinkTypes: [nestedType, relation],
    visibleLinkTypes: new Set(["related"]),
    requestRender: vi.fn()
  });
  // Unrelated active definitions can alias another field into a real read key.
  engine["activeLinkTypeExpansionPropertiesByProperty"].set("scope", ["scope", "unrelated"]);
  vi.spyOn(engine, "reheatSimulation").mockImplementation(() => {});
  function definition() { return engine.getLensEmbeddedGraphDefinition(outer.id, linkType.definitionId)!; }
  function snapshots() { return engine.getEmbeddedGraphSnapshots(definition().graphPath); }
  return { engine, runtime, graph, outer, linkType, nestedType, relation, frontmatter, definition, snapshots, files, properties };
}

describe("Lens LinkType viewport contents", () => {
  it("materializes only the resolved targets from configured properties and keeps the outer anchor", () => {
    const { engine, runtime, outer, linkType, definition, snapshots } = fixture();
    const fresh = definition();
    expect(linkType.property).toBe("scope-lens");
    expect(fresh.snapshots.map(({ path, origin, relationshipProperties }) => [path, origin, relationshipProperties])).toEqual([
      ["B.md", { kind: "root" }, ["scope", "deliverables"]],
      ["C.md", { kind: "root" }, ["deliverables"]]
    ]);
    expect(engine.expandEmbeddedGraph(outer.id, fresh)).toBe(true);
    const [lens] = runtime.containers.values();
    expect(lens).toMatchObject({ origin: outer.id, originSourcePath: outer.sourcePath, linkTypeId: linkType.definitionId });
    expect(runtime.nodeMap.get(outer.id)).toBe(outer);
    expect([...lens.memberIds].map((id) => runtime.nodeMap.get(id)?.sourcePath)).toEqual(["B.md", "C.md"]);
    expect(snapshots().map(({ origin }) => origin)).toEqual([{ kind: "root" }, { kind: "root" }]);
    const [b, c] = [...lens.memberIds];
    expect(engine["getBadgeMembershipContext"](runtime.nodeMap.get(b)!, "B.md")).toMatchObject({
      ownerPath: outer.sourcePath, definitionId: linkType.definitionId, provenance: ["scope", "deliverables"]
    });
    expect(engine["edges"]).toEqual([expect.objectContaining({ from: b, to: c, type: "related", mode: "visible" })]);
  });

  it("captures the real note, canonical definition, and read union through nested Lens viewports", () => {
    const { engine, runtime, outer, definition, linkType, nestedType, relation } = fixture();
    engine.expandEmbeddedGraph(outer.id, definition());
    const [lens] = runtime.containers.values();
    const [b, c] = [...lens.memberIds];
    engine["toggleEmbeddedNodeExpansion"](runtime.nodeMap.get(b)!, relation, false);
    const nested = engine.getLensEmbeddedGraphDefinition(b, nestedType.definitionId)!;
    engine.expandEmbeddedGraph(b, nested);
    const childLens = [...runtime.containers.values()][1];
    const [member] = [...childLens.memberIds];
    const expanded = [...lens.memberIds].find(id => runtime.nodeMap.get(id)?.sourcePath === "Explicit.md")!;
    engine["graphController"].replaceSelection([b, c, member, expanded]);
    const selection = engine.getSelectedNodeCutRefs();
    expect(selection).toHaveLength(4);
    expect(selection.find(({ nodeId }) => nodeId === b)).toMatchObject({
      path: "B.md", contextId: lens.key,
      origin: { kind: "lens-membership", ownerPath: "A.md", provenance: ["scope", "deliverables"],
        definition: { definitionId: linkType.definitionId, readProperties: ["scope", "deliverables"] } }
    });
    expect(selection.find(({ nodeId }) => nodeId === c)?.origin.kind).toBe("lens-membership");
    expect(selection.find(({ nodeId }) => nodeId === member)).toMatchObject({ origin: {
      kind: "lens-membership", ownerPath: "B.md", definition: { definitionId: nestedType.definitionId }
    } });
    expect(selection.find(({ nodeId }) => nodeId === expanded)).toMatchObject({ path: "Explicit.md", origin: {
      kind: "relationship-expansion", owners: [{ sourcePath: "B.md", definition: { definitionId: relation.definitionId } }]
    } });
  });

  it("cuts an expansion with independent owners in place and prevents stale saved branches from reopening", () => {
    const { engine, runtime, outer, definition, relation, properties, files, snapshots } = fixture();
    properties.set("C.md", { related: ["[[Explicit]]"] });
    engine.expandEmbeddedGraph(outer.id, definition());
    const [lens] = runtime.containers.values();
    const [b, c] = [...lens.memberIds];
    engine["toggleEmbeddedNodeExpansion"](runtime.nodeMap.get(b)!, relation, false);
    engine["toggleEmbeddedNodeExpansion"](runtime.nodeMap.get(c)!, relation, false);
    const selected = [...lens.memberIds].find(id => runtime.nodeMap.get(id)?.sourcePath === "Explicit.md")!;
    engine["graphController"].replaceSelection([selected]);
    expect(engine.getSelectedNodeCutRefs()[0].origin).toMatchObject({
      kind: "relationship-expansion", owners: [{ sourcePath: "B.md" }, { sourcePath: "C.md" }]
    });
    const saved = snapshots();
    const cBefore = saved.find(({ path }) => path === "C.md");
    vi.spyOn(engine, "refreshMetadataRelationshipEdges").mockImplementation(() => {});
    vi.spyOn(engine as unknown as { rebuildEdges(): void }, "rebuildEdges").mockImplementation(() => {});
    properties.set("B.md", { related: ["[[C]]", "[[A]]"], nested: ["[[Nested]]"] });
    expect(engine.reconcileAfterPropertyCut([{ file: files.get("B.md")!, frontmatter: properties.get("B.md")!,
      properties: new Set(["related"]), rootMembership: false }])).toBe(true);
    expect(runtime.nodeMap.has(selected)).toBe(true);
    expect(engine.getSelectedNodeCutRefs()[0].origin).toMatchObject({
      kind: "relationship-expansion", owners: [{ sourcePath: "C.md" }]
    });
    properties.set("C.md", { related: [] });
    expect(engine.reconcileAfterPropertyCut([{ file: files.get("C.md")!, frontmatter: properties.get("C.md")!,
      properties: new Set(["related"]), rootMembership: false }])).toBe(true);
    expect(runtime.nodeMap.has(selected)).toBe(false);
    expect(engine.getSelectedNodeCutRefs()).toEqual([]);
    expect(snapshots().find(({ path }) => path === "C.md")).toEqual(cBefore);
    engine.collapseEmbeddedGraph(outer.id, definition().graphPath);
    expect(engine.expandEmbeddedGraph(outer.id, { ...definition(), snapshots: saved })).toBe(true);
    expect(snapshots().map(({ path }) => path)).not.toContain("Explicit.md");
  });

  it("refreshes to zero and back to one direct member with finite transforms", () => {
    const { engine, runtime, outer, frontmatter, definition, snapshots } = fixture();
    expect(engine.expandEmbeddedGraph(outer.id, definition())).toBe(true);
    frontmatter.SCOPE = [];
    frontmatter.deliverables = [];
    expect(engine.refreshOpenLensDefinitionsForSourcePath("A.md")).toBe(true);
    expect(snapshots()).toEqual([]);
    let [lens] = runtime.containers.values();
    engine["fitEmbeddedContainerViewToLens"](lens);
    expect(Object.values(engine["getEmbeddedContainerRenderTransform"](lens)).every(Number.isFinite)).toBe(true);
    frontmatter.SCOPE = ["[[C]]"];
    expect(engine.refreshOpenLensDefinitionsForSourcePath("A.md")).toBe(true);
    expect(snapshots().map(({ path }) => path)).toEqual(["C.md"]);
    [lens] = runtime.containers.values();
    engine["fitEmbeddedContainerViewToLens"](lens);
    expect(Object.values(engine["getEmbeddedContainerRenderTransform"](lens)).every(Number.isFinite)).toBe(true);
  });

  it("uses the legacy property only when the read-property list is absent", () => {
    const { linkType, definition, frontmatter } = fixture();
    frontmatter.SCOPE = ["[[B]]"];
    Object.assign(linkType, { properties: undefined, property: "scope" });
    expect(definition().snapshots.map(({ path }) => path)).toEqual(["B.md"]);
    Object.assign(linkType, { properties: [] });
    expect(definition().snapshots).toEqual([]);
  });

  it("migrates a saved Lens, preserving genuine expansions and pruning source-clone branches", async () => {
    const { engine, runtime, graph, outer, linkType, nestedType, relation, frontmatter, definition, snapshots } = fixture();
    const state = new O3GraphState(graph);
    const graphPath = definition().graphPath;
    const saved = [
      { ...snapshot("A"), badges: { "scope-lens": "expanded", related: "expanded" } as const },
      { ...snapshot("B", expansion("A", "scope-lens")), badges: { related: "expanded" } as const, relationshipProperties: ["scope"] },
      { ...snapshot("C", expansion("A", "scope-lens")), relationshipProperties: ["deliverables"] },
      snapshot("Explicit", expansion("B", "related")),
      snapshot("Obsolete", expansion("A", "related"))
    ];
    const parent = { originNodeId: outer.id, graphPath, expanded: true, linkTypeId: linkType.definitionId };
    state.setEmbeddedGraphExpansion(outer.id, graphPath, true, { lensWidth: 460, viewZoom: 0.75 }, [], linkType.definitionId);
    state.setEmbeddedGraphSnapshots(outer.id, graphPath, saved);
    const nestedPath = engine["lensRuntimeGraphPath"](nestedType.definitionId);
    for (const name of ["A.md", "B.md"]) {
      state.setEmbeddedGraphExpansion(name, nestedPath, true, { lensWidth: 380 }, [parent], nestedType.definitionId);
      state.setEmbeddedGraphSnapshots(name, nestedPath, [
        snapshot(name.slice(0, -3)),
        { ...snapshot("Nested", { kind: "expansion", sourceNodeId: name, linkType: "nested" }), relationshipProperties: ["nested"] }
      ], [parent]);
    }
    const reloaded = new O3GraphState(graph);
    reloaded.loadFromContent("```o3graph\n" + JSON.stringify(state.toPersistedState()) + "\n```");
    const view = Object.assign(Object.create(BasesGraphView.prototype), { graphState: reloaded, engine, file: graph });
    await view.restoreEmbeddedGraphExpansions();

    expect(snapshots()).toEqual([
      expect.objectContaining({ path: "B.md", origin: { kind: "root" }, pinned: true, x: 13, y: 29,
        badges: expect.objectContaining({ related: "expanded" }), relationshipProperties: ["scope", "deliverables"] }),
      expect.objectContaining({ path: "C.md", origin: { kind: "root" } }),
      expect.objectContaining({ path: "Explicit.md", origin: expansion("B", "related") })
    ]);
    const [lens, child] = runtime.containers.values();
    expect(lens).toMatchObject({ lensWidth: 460, viewZoom: 0.75 });
    expect(child).toMatchObject({ originSourcePath: "B.md", graphPath: nestedPath, lensWidth: 380 });
    expect(engine.getEmbeddedGraphSnapshots(nestedPath)).toEqual([
      expect.objectContaining({ path: "Nested.md", origin: { kind: "root" }, pinned: true })
    ]);
    const persisted = engine.getEmbeddedGraphPersistenceSnapshot(lens.key)!;
    expect(persisted.ownerGraphPath).toBe(graph.path);
    expect(reloaded.setEmbeddedGraphSnapshots(outer.id, graphPath, persisted.snapshots)).toBe(true);
    expect(reloaded.listExpandedEmbeddedGraphs()[0].embeddedGraphs?.map(({ originNodeId }) => originNodeId)).toEqual(["B.md"]);

    const b = runtime.nodeMap.get(child.origin)!;
    engine["toggleEmbeddedNodeExpansion"](b, relation, false);
    engine["toggleEmbeddedNodeExpansion"](b, relation, false);
    engine.refreshOpenLensDefinitionsForSourcePath("A.md");
    expect(snapshots()).toContainEqual(expect.objectContaining({ path: "A.md", origin: expansion("B", "related") }));
    engine["toggleEmbeddedNodeExpansion"](runtime.nodeMap.get(b.id)!, relation, false);
    expect(snapshots().map(({ path }) => path)).toEqual(["B.md", "C.md"]);
    expect(runtime.containers.has(child.key)).toBe(true);
    frontmatter.SCOPE = [];
    frontmatter.deliverables = ["[[C]]"];
    engine.refreshOpenLensDefinitionsForSourcePath("A.md");
    expect(snapshots().map(({ path }) => path)).toEqual(["C.md"]);
    expect(runtime.containers.size).toBe(1);
  });
});
