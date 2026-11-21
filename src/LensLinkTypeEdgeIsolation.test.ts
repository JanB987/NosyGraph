import { describe, expect, it, vi } from "vitest";
import { TFile, type App } from "obsidian";
import { GraphEngine, type GraphUpdateOptions } from "./GraphEngine";
import { O3LinkType } from "./O3LinkType";
import { resolveVisibleRelationshipDefinitions, resolveVisibleRelationshipSelector } from "./graph-application/GraphRelationshipEdgePolicy";

vi.mock("obsidian", () => ({ TFile: class {}, TFolder: class {}, Component: class {}, Menu: class {}, Notice: class {} }));

function fixture() {
  const files = ["A", "B", "C"].map((basename) => Object.assign(new TFile(), { basename, path: basename + ".md", extension: "md" }));
  const [a, b, c] = files;
  const frontmatter: Record<string, unknown> = { Scope: ["[[B]]", "[[C]]"] };
  const app = {
    vault: {
      getMarkdownFiles: () => files,
      getAbstractFileByPath: (path: string) => files.find((file) => file.path === path)
    },
    metadataCache: {
      getFileCache: (file: TFile) => ({ frontmatter: file === a ? frontmatter : {} }),
      getFirstLinkpathDest: (path: string) => files.find((file) => file.path === path || file.basename === path)
    }
  } as unknown as App;
  const definition = (name: string, type: string, distance: number, force: number) => new O3LinkType(
    Object.assign(new TFile(), { basename: name, path: "Types/" + name + ".md" }),
    { property: "scope", linkType: type, linkDistance: distance, linkForce: force, linkLineColor: "#198cd6" }
  );
  const lens = definition("Lens", "Lens", 75, 0.6);
  lens.linkLineColor = "#ec7123";
  const force = definition("Force", "Force Based", 222, 0.11);
  const engine = new GraphEngine({} as HTMLElement, app, {
    initialSettings: {
      repulsionStrength: 1, centerStrength: 1, nodeRadius: 6, nodeConnectionSizeMultiplier: 0,
      nearRestVelocityThreshold: 0.05, restVelocityThreshold: 0.02, textFadeThreshold: 0.5
    }
  });
  Object.assign(engine, {
    canvas: { width: 800, height: 600, getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    startSimulation: vi.fn(), renderBadges: vi.fn(), updateMenuCounter: vi.fn(),
    freezeExistingNodesForTopologyUpdate: vi.fn(), centerViewportOnGravityCenter: vi.fn(), reheatSimulation: vi.fn()
  });
  const update = (active: O3LinkType[], visible: string[] = [], overlay: string[] = [], options: GraphUpdateOptions = {}) => {
    engine.setActiveLinkTypes(active);
    engine.setSelectedLinkTypes(["scope"]);
    engine.updateGraph(files, { visibleLinkTypes: visible, overlayLinkTypes: overlay, ...options });
  };
  return { engine, a, b, c, lens, force, files, frontmatter, update, edges: () => engine["edges"] };
}

describe("Lens LinkType edge isolation in the production engine", () => {
  it("keeps three graph roots and a target-only Lens with zero relationship edges or physics input edges", () => {
    const { engine, a, b, c, lens, update, edges } = fixture();
    update([lens], [lens.definitionId, "scope"], [lens.definitionId, "scope"]);
    expect(engine.getNodeCount()).toBe(3);
    expect(edges()).toEqual([]);
    expect(engine.getLegacyGraphReadState().edges).toEqual([]);
    expect(engine.getLegacyPhysicsReadState().settings.activeLinkTypes).toEqual([]);
    expect(engine.captureArchitecturePhysicsInput().input.graph.edges).toEqual([]);
    expect(engine["getNodeConnectionCount"](engine["nodeMap"].get(a.path)!)).toBe(0);
    const definition = engine.getLensEmbeddedGraphDefinition(a.path, lens.definitionId)!;
    expect(engine.expandEmbeddedGraph(a.path, definition)).toBe(true);
    expect(engine.getEmbeddedGraphSnapshots(definition.graphPath).map(({ path }) => path)).toEqual([b.path, c.path]);
    expect(edges()).toEqual([]);
  });

  it.each([false, true])("preserves Force edge provenance and spring parameters in either registration order (%s)", (lensFirst) => {
    const { engine, a, b, c, lens, force, update, edges } = fixture();
    update(lensFirst ? [lens, force] : [force, lens]);
    expect(edges().map(({ from, to }) => [from, to])).toEqual([[a.path, b.path], [a.path, c.path]]);
    expect(engine["getEdgePhysics"](edges()[0])).toEqual({ preferredDistance: 222, strength: 0.11 });
    expect(engine["getEdgeVisualConfig"](edges()[0]).color).toBe("#198cd6");
    expect(edges()[0]).toHaveProperty("definitionId", force.definitionId);
  });

  it("blocks explicit Lens selectors and a raw Lens-only selector with an inactive Force in the registry", () => {
    const { engine, lens, force, a, b, update, edges } = fixture();
    const registry = [force, lens];
    const explicit = resolveVisibleRelationshipSelector("[[Scope Lens|scope]]", registry, () => lens.definitionId);
    expect(resolveVisibleRelationshipDefinitions([explicit, "scope"], registry, [lens])).toEqual([lens]);
    update([lens, force], [explicit], [explicit], {
      edgeLinkTypeDefinitions: [lens], visibleLinkTypeDefinitions: [lens],
      overlayLinkTypeDefinitions: [lens], knownLinkTypeDefinitions: registry
    });
    expect(edges()).toEqual([]);
    update([lens], ["scope"], ["scope"], { knownLinkTypeDefinitions: registry });
    expect(engine.addEdge(a.path, b.path, { type: "scope" })).toBe(false);
    expect(engine.addEdge(a.path, b.path, { type: "scope", definitionId: lens.definitionId })).toBe(false);
    expect(edges()).toEqual([]);
  });

  it("refreshes ordinary, visible and overlay edges after metadata and drops stale Lens replay", () => {
    const { engine, a, b, c, lens, force, frontmatter, update, edges } = fixture();
    update([lens], ["scope"], ["scope"]);
    engine["expandedByBadge"].set(engine["badgeKey"](a.path, "scope"), new Set([b.path]));
    engine["rebuildEdges"]();
    engine.toggleExpansion(a, lens.definitionId);
    expect(engine.collectSelectedRelationshipEdges(a)).toEqual([]);
    engine["syncVisibleLinkTypeEdgesAfterBadgeMutation"](a.path, "scope", "outgoing", { added: [b.path], removed: [], skipped: [] });
    engine.refreshMetadataRelationshipEdges(a);
    expect(edges()).toEqual([]);

    update([lens, force], [force.definitionId], [], { edgeLinkTypeDefinitions: [lens], visibleLinkTypeDefinitions: [force] });
    frontmatter.Scope = ["[[C]]"];
    engine.refreshMetadataRelationshipEdges(a);
    expect(edges()).toEqual([expect.objectContaining({ to: c.path, mode: "visible", definitionId: force.definitionId })]);
    update([lens, force], [], [force.definitionId], { edgeLinkTypeDefinitions: [lens] });
    frontmatter.Scope = ["[[B]]"];
    engine.refreshMetadataRelationshipEdges(a);
    expect(edges()).toEqual([expect.objectContaining({ to: b.path, mode: "overlay", definitionId: force.definitionId })]);
    update([lens, force], [], [], { edgeLinkTypeDefinitions: [lens, force] });
    frontmatter.Scope = ["[[C]]"];
    engine.refreshMetadataRelationshipEdges(a);
    expect(edges()).toEqual([expect.objectContaining({ from: a.path, to: c.path, definitionId: force.definitionId })]);
  });

  it("classifies raw legacy properties, multi-read aliases and semantic changes independently", () => {
    const { engine, a, b, c, lens, force, frontmatter, update, edges } = fixture();
    lens.properties = ["scope", "deliverables"];
    frontmatter.Scope = ["[[B]]"];
    frontmatter.Deliverables = ["[[C]]"];
    frontmatter.legacy = ["[[C]]"];
    update([lens, force], ["deliverables", "legacy"]);
    expect(edges()).toEqual([
      expect.objectContaining({ from: a.path, to: b.path, definitionId: force.definitionId }),
      expect.objectContaining({ from: a.path, to: c.path, type: "legacy", mode: "visible" })
    ]);
    const direction = new O3LinkType(lens.file, {
      property: "scope", linkType: "Direction Based", linkDirection: "left", linkXAxis: 250, linkYAxis: 48
    });
    update([direction], [], [], { knownLinkTypeDefinitions: [direction] });
    expect(edges()).toEqual([expect.objectContaining({ to: b.path, definitionId: direction.definitionId })]);
    expect(engine["getDefinitionDirectionConfig"](engine["getEdgeDefinition"](edges()[0])!)).toEqual({
      direction: "left", cx: 250, cy: 48
    });
    update([lens], [], [], { knownLinkTypeDefinitions: [lens] });
    expect(edges()).toEqual([]);
  });

  it("preserves an enabled Parent expansion without giving the Lens a relationship edge", () => {
    const { engine, a, lens, force, update, edges } = fixture();
    const parent = new O3LinkType(force.file, { property: "scope", linkType: "Parent" });
    update([lens, parent]);
    expect(edges()).toEqual([]);
    expect(engine.expandParentLinks(a.path, lens.definitionId)).toBe(false);
    expect(engine.expandParentLinks(a.path, "scope")).toBe(true);
    expect(edges()).toHaveLength(2);
    expect(edges().every(({ relationship, definitionId }) => relationship === "parent"
      && definitionId === parent.definitionId)).toBe(true);
  });

  it("reconciles stale embedded edges in their own scope while keeping an authorized edge on the same note paths", () => {
    const { engine, a, b, c, lens, force, update, edges } = fixture();
    update([lens, force], [], [], { knownLinkTypeDefinitions: [lens, force] });
    const root = (path: string) => ({
      path, nodeId: path, x: 30, y: 30, pinned: true, origin: { kind: "root" as const }, badges: {}
    });
    const olderDefinition = {
      graphPath: "Saved.md", ancestry: [], color: "#778899", linkForce: 0.02,
      linkTypes: [lens], visibleLinkTypes: ["scope"],
      snapshots: [
        { ...root(a.path), badges: { scope: "expanded" as const } },
        { ...root(b.path), origin: { kind: "expansion" as const, sourceNodeId: a.path, linkType: "scope" } }
      ]
    };
    expect(engine.expandEmbeddedGraph(c.path, olderDefinition)).toBe(true);
    const [oldContainer] = engine["embeddedGraphContainers"].values();
    const [oldA, oldB] = oldContainer.memberIds;
    expect(edges()).toHaveLength(2);
    engine["edges"].push({ from: oldA, to: oldB, type: "scope" });
    engine.refreshEmbeddedVisibleLinkTypeEdgesForSourcePath(a.path, ["scope"]);
    expect(edges()).toHaveLength(2);
    engine["edges"].push({ from: oldA, to: oldB, type: "scope" });

    expect(engine.expandEmbeddedGraph(oldB, {
      ...olderDefinition, graphPath: "Ordinary.md", linkTypes: [force], visibleLinkTypes: [force.definitionId],
      snapshots: [root(a.path), root(b.path)]
    })).toBe(true);
    const ordinary = [...engine["embeddedGraphContainers"].values()].find(({ graphPath }) => graphPath === "Ordinary.md")!;
    const [innerA, innerB] = ordinary.memberIds;
    engine["rebuildEdges"]();
    expect(engine["nodeMap"].get(oldB)?.isPinned).toBe(true);
    expect(edges().some(({ from, to }) => from === oldA && to === oldB)).toBe(false);
    expect(edges()).toContainEqual(expect.objectContaining({ from: innerA, to: innerB, definitionId: force.definitionId }));
    expect(edges()).toContainEqual(expect.objectContaining({ from: a.path, to: b.path, definitionId: force.definitionId }));
  });
});
