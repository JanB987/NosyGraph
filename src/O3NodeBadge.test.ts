import { describe, expect, it, vi } from "vitest";
import { TFile, getIcon } from "obsidian";
import { GraphEngine } from "./GraphEngine";
import { BasesGraphView } from "./GraphView";
import { O3LinkType } from "./O3LinkType";
import { normalizeLinkTypePropertyKeys } from "./NoteTypePropertyKeys";
import { O3NodeBadge, resolveO3NodeBadgeIntent } from "./O3NodeBadge";

vi.mock("obsidian", () => ({
  TFile: class {},
  TFolder: class {},
  FileView: class {},
  Modal: class {},
  Component: class {},
  Menu: class {},
  Notice: class {},
  parseYaml: (text: string) => JSON.parse(text),
  stringifyYaml: (value: unknown) => JSON.stringify(value),
  getIcon: (name: string) => ["scan-search", "telescope", "x"].includes(name) ? { svg: name } : null
}));

const base = {
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false
};

describe("O3NodeBadge modifier characterization", () => {
  it("toggles for an ordinary click and Ctrl/Cmd+Shift", () => {
    expect(resolveO3NodeBadgeIntent(base)).toBe("toggle-badge");
    expect(resolveO3NodeBadgeIntent({ ...base, ctrlKey: true, shiftKey: true }))
      .toBe("toggle-badge");
    expect(resolveO3NodeBadgeIntent({ ...base, metaKey: true, shiftKey: true }))
      .toBe("toggle-badge");
  });

  it("opens link input for Alt with any other modifier", () => {
    expect(resolveO3NodeBadgeIntent({ ...base, altKey: true }))
      .toBe("open-badge-input");
    expect(resolveO3NodeBadgeIntent({
      ...base,
      altKey: true,
      ctrlKey: true,
      metaKey: true,
      shiftKey: true
    })).toBe("open-badge-input");
  });

  it("expands a chain for Ctrl or Cmd without Shift", () => {
    expect(resolveO3NodeBadgeIntent({ ...base, ctrlKey: true }))
      .toBe("expand-badge-chain");
    expect(resolveO3NodeBadgeIntent({ ...base, metaKey: true }))
      .toBe("expand-badge-chain");
  });

  it("gives Alt precedence over Ctrl/Cmd chain expansion", () => {
    expect(resolveO3NodeBadgeIntent({ ...base, altKey: true, ctrlKey: true }))
      .toBe("open-badge-input");
    expect(resolveO3NodeBadgeIntent({ ...base, altKey: true, metaKey: true }))
      .toBe("open-badge-input");
  });
});

class BadgeElement {
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly css = new Map<string, string>();
  readonly classes = new Set<string>();
  readonly children: unknown[] = [];
  readonly listeners = new Map<string, (event: MouseEvent) => void>();
  readonly style = { setProperty: (key: string, value: string) => this.css.set(key, value) };
  readonly classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
    contains: (name: string) => this.classes.has(name),
    toggle: (name: string, enabled: boolean) => enabled ? this.classes.add(name) : this.classes.delete(name)
  };
  title = "";
  private text = "";

  get textContent() { return this.text; }
  set textContent(text: string) {
    this.replaceChildren();
    this.text = text;
  }
  replaceChildren(...children: unknown[]) {
    this.text = "";
    this.children.splice(0, this.children.length, ...children);
  }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  addClass(name: string) { this.classList.add(name); }
  addEventListener(name: string, listener: (event: MouseEvent) => void) { this.listeners.set(name, listener); }
  createDiv() { return this.createSpan(); }
  createSpan(options: { cls?: string | string[]; text?: string } = {}) {
    const span = new BadgeElement();
    for (const name of Array.isArray(options.cls) ? options.cls : [options.cls]) {
      if (name) span.addClass(name);
    }
    if (options.text) span.textContent = options.text;
    this.children.push(span);
    return span;
  }
  querySelector(selector: string) {
    return this.children.find((child): child is BadgeElement =>
      child instanceof BadgeElement && child.classes.has(selector.slice(1))
    );
  }
}

function lensFile(name: string): TFile {
  return Object.assign(new TFile(), { path: `LinkTypes/${name}.md`, basename: name, extension: "md" });
}

function lensDefinition(file: TFile, linkTypeIcon?: string): O3LinkType {
  return new O3LinkType(file, { property: "parts", linkType: "lens", linkTypeIcon });
}

it("keeps the lens styling and modifier intents when an override renders as SVG", () => {
  const anchor = new BadgeElement();
  const onIntent = vi.fn();
  new O3NodeBadge(anchor as unknown as HTMLElement, lensDefinition(lensFile("Scope"), "telescope"), onIntent, getIcon)
    .render();
  const badge = anchor.querySelector(".o3-node-badge")!;
  const icon = badge.querySelector(".o3-node-badge-icon")!;
  expect(icon.children).toEqual([{ svg: "telescope" }]);
  expect(icon.attributes.get("aria-hidden")).toBe("true");
  expect(badge.classes.has("o3-node-badge--lens")).toBe(true);
  expect(badge.querySelector(".o3-node-badge-label")?.textContent).toBe("Scope");
  const event = { ...base, preventDefault: vi.fn(), stopPropagation: vi.fn() };
  badge.listeners.get("mousedown")?.(event as unknown as MouseEvent);
  badge.listeners.get("mousedown")?.({ ...event, altKey: true } as unknown as MouseEvent);
  expect(onIntent.mock.calls.map(([intent]) => intent)).toEqual(["toggle-badge", "open-badge-input"]);
});

it("refreshes root and nested badges by definition ID without rebuilding either graph", () => {
  const scopeFile = lensFile("Scope");
  const scope = lensDefinition(scopeFile, "telescope");
  const nestedScope = lensDefinition(scopeFile, "telescope");
  const other = lensDefinition(lensFile("Other"), "★");
  const owner = { id: "A.md", sourcePath: "A.md" };
  const nested = { id: "instance::A.md", sourcePath: "A.md", embeddedInstanceId: "nested" };
  const lens = { linkTypes: [nestedScope, other], viewZoom: 0.75, left: 42 };
  const rootBadge = new BadgeElement();
  const nestedBadge = new BadgeElement();
  const otherBadge = new BadgeElement();
  const placements = new Map([[owner.id, { x: 7, y: 3 }]]);
  const pendingInput = new Map([[owner.id, { query: "pending" }]]);
  const engine = Object.assign(Object.create(GraphEngine.prototype), {
    activeNodeBadgeLinkTypes: [other, scope],
    visibleNodeBadgeLinkTypes: [],
    embeddedGraphContainers: new Map([["nested", lens]]),
    nodeMap: new Map([[owner.id, owner], [nested.id, nested]]),
    graphStore: { isNodeSelected: () => true },
    activeLinkTypeVisualByProperty: new Map(),
    badgeOverlay: { querySelectorAll: () => [rootBadge, nestedBadge, otherBadge] },
    hasBadgeYamlLinks: (_path: string, linkType: string) => linkType === scope.definitionId,
    getSourcePathForNodeId: () => "A.md",
    isParentExpansionActive: (_nodeId: string, linkType: string) => linkType === scope.definitionId,
    directionLockedNodeTargets: placements,
    pendingBadgeClipboardRefreshes: pendingInput,
    directionLayoutDirty: false,
    camera: { x: 25, y: 30, zoom: 0.5 },
    badgeFarViewThreshold: 0.75,
    requestRender: vi.fn(),
    reheatSimulation: vi.fn()
  });

  engine.setBadgeButtonVisualState(rootBadge, owner.id, scope.definitionId);
  engine.setBadgeButtonVisualState(nestedBadge, nested.id, scope.definitionId);
  engine.setBadgeButtonVisualState(otherBadge, nested.id, other.definitionId);
  const rootIcon = rootBadge.querySelector(".o3-node-badge-icon")!;
  const nestedIcon = nestedBadge.querySelector(".o3-node-badge-icon")!;
  const otherIcon = otherBadge.querySelector(".o3-node-badge-icon")!;
  expect(rootIcon.children).toEqual([{ svg: "telescope" }]);
  expect(nestedIcon.children).toEqual([{ svg: "telescope" }]);
  expect(nestedIcon.children[0]).not.toBe(rootIcon.children[0]);
  expect(otherIcon.textContent).toBe("★");
  expect(otherBadge.dataset.o3BadgePopulated).toBe("false");
  expect(otherBadge.classes.has("o3-node-badge--empty")).toBe(true);
  expect(otherBadge.querySelector(".o3-node-badge-label")?.textContent).toMatch(/^\+ /);

  const label = nestedBadge.querySelector(".o3-node-badge-label")?.textContent;
  const title = nestedBadge.title;
  const markup = "<svg onload='hello'>a very long text value</svg>";
  expect(engine.refreshLinkTypeBadgeIcon(lensDefinition(scopeFile, `text:${markup}`))).toBe(true);
  expect(scope.linkTypeIcon).toBe(`text:${markup}`);
  expect(nestedScope.linkTypeIcon).toBe(scope.linkTypeIcon);
  expect(rootIcon.textContent).toBe(markup);
  expect(rootIcon.children).toHaveLength(0);
  expect(nestedIcon.textContent).toBe(markup);
  expect(nestedIcon.css.get("max-width")).toBe("12px");
  expect(nestedIcon.css.get("overflow")).toBe("hidden");
  expect(nestedIcon.css.get("white-space")).toBe("nowrap");
  expect(otherIcon.textContent).toBe("★");
  expect(nestedBadge.querySelector(".o3-node-badge-label")?.textContent).toBe(label);
  expect(nestedBadge.title).toBe(title);
  expect(nestedBadge.dataset.o3BadgeCompact).toBe("true");
  expect(nestedBadge.classes.has("o3-node-badge--lens")).toBe(true);
  expect(nestedBadge.classes.has("o3-node-badge--expanded")).toBe(true);

  expect(engine.refreshLinkTypeBadgeIcon(lensDefinition(scopeFile, "x"))).toBe(true);
  expect(nestedIcon.children).toEqual([{ svg: "x" }]);
  expect(nestedIcon.textContent).toBe("");
  expect(nestedIcon.css.get("max-width")).toBe("");
  expect(engine.refreshLinkTypeBadgeIcon(lensDefinition(scopeFile))).toBe(true);
  expect(rootIcon.children).toEqual([{ svg: "scan-search" }]);
  const restoredIcon = rootIcon.children[0];
  expect(engine.refreshLinkTypeBadgeIcon(lensDefinition(scopeFile, " "))).toBe(true);
  expect(rootIcon.children[0]).toBe(restoredIcon);
  expect(engine.embeddedGraphContainers.get("nested")).toBe(lens);
  expect(engine.camera).toEqual({ x: 25, y: 30, zoom: 0.5 });
  expect(engine.directionLockedNodeTargets).toBe(placements);
  expect(placements.has(owner.id)).toBe(true);
  expect(engine.pendingBadgeClipboardRefreshes).toBe(pendingInput);
  expect(engine.directionLayoutDirty).toBe(false);
  expect(engine.requestRender).not.toHaveBeenCalled();
  expect(engine.reheatSimulation).not.toHaveBeenCalled();
});

it("lets a mixed metadata edit proceed through the normal definition reload", () => {
  const file = lensFile("Scope");
  const initial = new O3LinkType(file, {
    property: "parts", linkType: "lens", linkTypeIcon: "telescope", parts: ["[[Old note]]"]
  });
  const next = new O3LinkType(file, {
    property: "parts", linkType: "lens", linkTypeIcon: "★", parts: ["[[New note]]"]
  });
  const engine = Object.assign(Object.create(GraphEngine.prototype), {
    activeNodeBadgeLinkTypes: [initial],
    visibleNodeBadgeLinkTypes: [],
    embeddedGraphContainers: new Map()
  });

  expect(engine.refreshLinkTypeBadgeIcon(next)).toBe(false);
  expect(initial.linkTypeIcon).toBe("★");
});

it.each([
  { propertyKey: "linkTypeIcon", value: "👩🏽‍🔬", mappedKey: undefined },
  { propertyKey: "BADGEGLYPH", value: "telescoppe", mappedKey: "badgeGlyph" }
])("preserves $propertyKey when saving an unrelated field through the modal", async ({ propertyKey, value, mappedKey }) => {
  const file = lensFile("Scope");
  const keys = normalizeLinkTypePropertyKeys({ linkTypeIcon: mappedKey });
  const frontmatter = { property: "parts", linkType: "lens", [propertyKey]: value };
  let markdown = `---\n${JSON.stringify(frontmatter)}\n---\nKeep the body.`;
  const reloadFromFile = vi.fn(async () => {});
  const view = Object.assign(Object.create(BasesGraphView.prototype), {
    linkTypePropertyKeys: keys,
    loadLinkTypeRegistry: async () => {},
    reloadFromFile,
    app: {
      vault: {
        getAbstractFileByPath: () => file,
        read: async () => markdown,
        modify: async (_file: TFile, content: string) => { markdown = content; }
      }
    }
  });
  await view.updateExistingLinkType(new O3LinkType(file, frontmatter, keys), {
    property: "parts", label: "Renamed scope", linkType: "lens"
  });

  const updated = JSON.parse(markdown.split("\n")[1]);
  expect(updated).toMatchObject({ key: "Renamed scope", [propertyKey]: value });
  expect(new O3LinkType(file, updated, keys).linkTypeIcon).toBe(value);
  expect(markdown).toContain("Keep the body.");
  expect(reloadFromFile).toHaveBeenCalledTimes(1);
});
