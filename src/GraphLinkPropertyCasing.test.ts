import { describe, expect, it, vi } from "vitest";
import { TFile, type App } from "obsidian";

vi.mock("obsidian", () => ({ TFile: class {}, Component: class {}, Menu: class {} }));

import { GraphEngine } from "./GraphEngine";
import { O3LinkType } from "./O3LinkType";

function fixture(cachedLinksOnly = false, configuredProperty: string | string[] = "affiliations") {
  const person = Object.assign(new TFile(), { path: "Person A.md", basename: "Person A" });
  const organization = Object.assign(new TFile(), { path: "Organization A.md", basename: "Organization A" });
  const definitionFile = Object.assign(new TFile(), { path: "LinkTypes/Affiliations.md", basename: "Affiliations" });
  const definition = new O3LinkType(definitionFile, {
    property: configuredProperty, key: "Affiliations", linkType: "Force Based",
    LinkDiscoveryDirection: "both", linkDuplicateNodes: false
  });
  const records = new Map<string, { frontmatter: Record<string, unknown>; frontmatterLinks: Array<{ key: string; link: string }> }>([
    [person.path, cachedLinksOnly
      ? { frontmatter: {}, frontmatterLinks: [{ key: "Affiliations.0", link: "Organization A" }] }
      : { frontmatter: { Affiliations: ["[[Organization A]]"] }, frontmatterLinks: [] }],
    [organization.path, { frontmatter: {}, frontmatterLinks: [] }]
  ]);
  const files = [person, organization];
  const app = {
    vault: {
      getMarkdownFiles: () => files,
      getAbstractFileByPath: (path: string) => files.find((file) => file.path === path)
    },
    metadataCache: {
      getFileCache: (file: TFile) => records.get(file.path),
      getFirstLinkpathDest: (path: string) => files.find((file) => file.path === path || file.basename === path)
    }
  } as unknown as App;
  const engine = Object.assign(Object.create(GraphEngine.prototype), {
    app, lastLabels: new Map(),
    activeLinkTypeExpansionPropertiesByProperty: new Map([[definition.property, definition.properties]]),
    activeLinkTypeDiscoveryDirectionByProperty: new Map([[definition.property, definition.linkDiscoveryDirection]]),
    activeLinkTypeDuplicateNodesByProperty: new Map([[definition.property, false]]),
    duplicateNodeSourceById: new Map(),
    visibleLinkTypes: new Set([definition.property]), edges: [],
    nodeMap: new Map(files.map((file) => [file.path, { id: file.path, sourcePath: file.path }]))
  });
  engine.linkResolver = engine.createLinkResolver();
  return { engine, records, person, organization, definition, files };
}

describe("live graph LinkType property casing", () => {
  it.each([false, true])("renders the visible Affiliations edge with cached-links-only=%s", (cachedOnly) => {
    const { engine, files, definition } = fixture(cachedOnly);
    engine.addVisibleLinkTypeEdges(new Set(), files);
    expect(engine.edges).toEqual([
      { from: "Person A.md", to: "Organization A.md", type: "affiliations", mode: "visible" }
    ]);
    expect(definition.definitionId).toBe("LinkTypes/Affiliations.md");
    expect(engine.normalizeLinkType(definition.definitionId)).toBe("LinkTypes/Affiliations.md");
  });

  it.each(["affiliations", "AFFILIATIONS", " Affiliations "])("resolves outgoing and incoming links for configured property %s", (property) => {
    const { engine, person, organization, definition } = fixture(false, property);
    expect(engine.linkResolver.resolveLinkedTargets(person, definition).map((target: { path: string }) => target.path)).toEqual([organization.path]);
    expect(engine.linkResolver.resolveLinkedTargets(organization, definition).map((target: { path: string }) => target.path)).toEqual([person.path]);
  });

  it("refreshes the incoming index after a case-only YAML rename and after deletion", () => {
    const { engine, records, person, organization, definition } = fixture();
    const incoming = () => engine.linkResolver.resolveLinkedTargets(organization, definition).map((target: { path: string }) => target.path);
    expect(incoming()).toEqual([person.path]);
    records.set(person.path, { frontmatter: { AFFILIATIONS: ["[[Organization A]]"] }, frontmatterLinks: [] });
    engine.linkResolver.updateLinkDiscoveryIndexForFile(person);
    expect(incoming()).toEqual([person.path]);
    records.set(person.path, { frontmatter: {}, frontmatterLinks: [] });
    engine.linkResolver.updateLinkDiscoveryIndexForFile(person);
    expect(incoming()).toEqual([]);
  });

  it("resolves mixed-case additional read properties through their primary alias", () => {
    const { engine, records, person, organization, definition } = fixture(false, ["affiliations", "memberships"]);
    records.set(person.path, { frontmatter: { Memberships: ["[[Organization A]]"] }, frontmatterLinks: [] });
    expect(engine.linkResolver.resolveLinkedTargets(person, definition).map((target: { path: string }) => target.path)).toEqual([organization.path]);
    expect(engine.linkResolver.resolveLinkedTargets(organization, definition).map((target: { path: string }) => target.path)).toEqual([person.path]);
  });

  it("merges differently cased YAML keys without duplicating targets or rewriting metadata", () => {
    const { engine, records, person, organization, definition } = fixture();
    const metadata = { frontmatter: {
      Affiliations: ["[[Organization A]]"], affiliations: ["[[Organization A]]"]
    }, frontmatterLinks: [{ key: "AFFILIATIONS[0]", link: "Organization A" }] };
    records.set(person.path, metadata);
    expect(engine.linkResolver.resolveLinkedTargets(person, definition).map((target: { path: string }) => target.path)).toEqual([organization.path]);
    expect(Object.keys(metadata.frontmatter)).toEqual(["Affiliations", "affiliations"]);
    expect(definition.key).toBe("Affiliations");
  });
});
