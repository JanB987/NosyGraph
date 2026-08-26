/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- NosyGraph parses Obsidian frontmatter, Bases data, and persisted graph JSON whose shapes are validated at runtime. */
import { App, MarkdownRenderChild, Notice, parseYaml, Plugin, PluginSettingTab, Setting, TFile, TFolder, WorkspaceLeaf, type MenuItem } from "obsidian";
import { BASES_GRAPH_VIEW, BasesGraphView } from "./GraphView";
import { GraphEngine, type EmbeddedGraphDefinition, type GraphLineStyle } from "./GraphEngine";
import { O3GraphState, type O3GraphRuntimeNodeSnapshot, type O3GraphRuntimeState } from "./O3GraphState";
import { O3GraphStateStore } from "./O3GraphStateStore";
import { O3LinkType } from "./O3LinkType";
import { ObsidianGraphLinkInputHandler } from "./ObsidianGraphLinkInputHandler";
import { ObsidianGraphLinkMutationHandler } from "./ObsidianGraphLinkMutationHandler";
import { ObsidianGraphNodeOpenHandler } from "./ObsidianGraphNodeOpenHandler";
import { ObsidianGraphRootInputHandler } from "./ObsidianGraphRootInputHandler";
import { ObsidianGraphRootPropertyMutationHandler } from "./ObsidianGraphRootPropertyMutationHandler";
import { ExportGraphImageModal } from "./ExportGraphImageModal";
import { setStyle } from "./domStyle";
import {
  DEFAULT_GRAPH_PROPERTY_KEYS,
  type GraphPropertyKeys,
  normalizeGraphPropertyKeys,
  hasFrontmatterProperty,
  readFrontmatterProperty,
  readFrontmatterPropertyByKey
} from "./GraphPropertyKeys";
import {
  DEFAULT_NOTE_TYPE_IDENTIFIERS,
  type NoteTypeIdentifier,
  type NoteTypeIdentifierSettings,
  frontmatterMatchesIdentifier,
  identifierFrontmatterValue,
  normalizeNoteTypeIdentifiers
} from "./NoteTypeIdentifier";
import {
  DEFAULT_GROUP_PROPERTY_KEYS,
  DEFAULT_LINK_TYPE_PROPERTY_KEYS,
  type GroupPropertyKeys,
  type LinkTypePropertyKeys,
  normalizeGroupPropertyKeys,
  normalizeLinkTypePropertyKeys
} from "./NoteTypePropertyKeys";
import { NONE_LINK_TYPE } from "./linkResolver";

interface BasesGraphPluginSettings {
  defaultNodeDragHoldDurationMs: number;
  defaultNodeLimit: number;
  defaultSourceLimit: number;
  defaultRootNodeProperties: string[];
  defaultActiveGroups: string[];
  defaultVisibleLinkTypes: string[];
  defaultAutoExpandDroppedLinkTypes: boolean;
  linkTypeFolder: string;
  rootNodeRingColor: string;
  activeNodeRingColor: string;
  nearestActiveLinkedNodeIndicatorEnabled: boolean;
  nearestActiveLinkedNodeIndicatorColor: string;
  nearestActiveLinkedNodeIndicatorOpacityPercent: number;
  nearestActiveLinkedNodeMaxHops: number;
  nearestActiveLinkedNodeMaxVisited: number;
  showAllLinkTypeBadgesKey: string;
  freezeGraphKey: string;
  subnodeOpacityPercent: number;
  iconOpacityPercent: number;
  graphPropertyKeys: GraphPropertyKeys;
  noteTypeIdentifiers: NoteTypeIdentifierSettings;
  linkTypePropertyKeys: LinkTypePropertyKeys;
  groupPropertyKeys: GroupPropertyKeys;
}

const DEFAULT_SETTINGS: BasesGraphPluginSettings = {
  defaultNodeDragHoldDurationMs: 180,
  defaultNodeLimit: 200,
  defaultSourceLimit: 5000,
  defaultRootNodeProperties: [],
  defaultActiveGroups: [],
  defaultVisibleLinkTypes: [],
  defaultAutoExpandDroppedLinkTypes: true,
  linkTypeFolder: "O3/LinkTypes",
  rootNodeRingColor: "#6eaaff",
  activeNodeRingColor: "#ff6b6b",
  nearestActiveLinkedNodeIndicatorEnabled: true,
  nearestActiveLinkedNodeIndicatorColor: "#7aa2ff",
  nearestActiveLinkedNodeIndicatorOpacityPercent: 45,
  nearestActiveLinkedNodeMaxHops: 8,
  nearestActiveLinkedNodeMaxVisited: 1000,
  showAllLinkTypeBadgesKey: "b",
  freezeGraphKey: "f",
  subnodeOpacityPercent: 78,
  iconOpacityPercent: 100,
  graphPropertyKeys: { ...DEFAULT_GRAPH_PROPERTY_KEYS },
  noteTypeIdentifiers: normalizeNoteTypeIdentifiers(DEFAULT_NOTE_TYPE_IDENTIFIERS),
  linkTypePropertyKeys: normalizeLinkTypePropertyKeys(DEFAULT_LINK_TYPE_PROPERTY_KEYS),
  groupPropertyKeys: normalizeGroupPropertyKeys(DEFAULT_GROUP_PROPERTY_KEYS)
};

export default class BasesGraphPlugin extends Plugin {
  settings: BasesGraphPluginSettings = { ...DEFAULT_SETTINGS };
  private markdownGraphSwitchActions = new Map<WorkspaceLeaf, HTMLElement>();

  async onload() {
    await this.loadPluginSettings();
    this.addSettingTab(new BasesGraphSettingTab(this.app, this));
    this.triggerStyleSettingsReparse();

    this.registerView(
      BASES_GRAPH_VIEW,
      (leaf: WorkspaceLeaf) =>
        new BasesGraphView(
          leaf,
          this.settings.defaultNodeDragHoldDurationMs,
          this.settings.defaultNodeLimit,
          this.settings.defaultSourceLimit,
          this.settings.defaultRootNodeProperties,
          this.settings.defaultActiveGroups,
          this.settings.defaultVisibleLinkTypes,
          this.settings.defaultAutoExpandDroppedLinkTypes,
          this.settings.linkTypeFolder,
          this.settings.rootNodeRingColor,
          this.settings.activeNodeRingColor,
          this.settings.nearestActiveLinkedNodeIndicatorEnabled,
          this.settings.nearestActiveLinkedNodeIndicatorColor,
          this.settings.nearestActiveLinkedNodeIndicatorOpacityPercent,
          this.settings.nearestActiveLinkedNodeMaxHops,
          this.settings.nearestActiveLinkedNodeMaxVisited,
          this.settings.showAllLinkTypeBadgesKey,
          this.settings.freezeGraphKey,
          this.settings.subnodeOpacityPercent,
          this.settings.iconOpacityPercent,
          this.settings.graphPropertyKeys,
          this.settings.noteTypeIdentifiers,
          this.settings.linkTypePropertyKeys,
          this.settings.groupPropertyKeys
        )
    );
    this.addCommand({
      id: "open-graph",
      name: "Open Graph",
      callback: async () => {
        const leaf = this.app.workspace.getMostRecentLeaf();
        const file = this.resolveActiveFileForLeaf(leaf);
        if (!leaf || !file) {
          new Notice("No active file to open as graph.");
          return;
        }
        await this.openFileInGraphView(file, leaf);
      }
    });

    this.addCommand({
      id: "create-new-graph-note",
      name: "Create new graph note",
      callback: async () => {
        await this.createNewGraphNoteFromTemplate();
      }
    });

    this.addCommand({
      id: "migrate-current-graph-note-data",
      name: "Migrate current graph note data",
      callback: async () => {
        const view = this.findActiveGraphView();
        if (!view) {
          new Notice("Open a graph note in graph view before migrating graph data.");
          return;
        }
        const wrote = await view.migrateGraphStateToCurrentLayout();
        new Notice(wrote ? "Graph data migrated." : "Graph data already current or unavailable.");
      }
    });

    this.addCommand({
      id: "clear-current-graph-data",
      name: "Clear Graph Data",
      callback: async () => {
        const view = this.findActiveGraphView();
        if (!view) {
          new Notice("Open a graph note in graph view before clearing graph data.");
          return;
        }
        const wrote = await view.clearGraphData();
        new Notice(wrote ? "Graph data cleared and rebuilt from frontmatter." : "Graph data could not be cleared.");
      }
    });

    this.addCommand({
      id: "export-current-graph-as-image",
      name: "Export Graph as Image",
      checkCallback: (checking: boolean) => {
        const view = this.findActiveGraphView();
        if (!view) return false;
        if (!checking) {
          new ExportGraphImageModal(this.app, {
            defaultOutputPath: view.getDefaultGraphImageExportPath(),
            defaultBackgroundColor: view.getGraphImageExportBackgroundColor(),
            onSubmit: async (request) => {
              try {
                const path = await view.exportGraphAsImage(request);
                new Notice(`Graph image exported to ${path}`);
              } catch (error) {
                console.error("Failed to export graph image:", error);
                new Notice(`Graph image export failed: ${String(error instanceof Error ? error.message : error)}`);
              }
            }
          }).open();
        }
        return true;
      }
    });

    this.addCommand({
      id: "copy-selected-graph-node-links-from-focused-graph",
      name: "Copy selected graph node links",
      checkCallback: (checking: boolean) => {
        const view = this.findFocusedGraphView();
        if (!view) return false;
        if (!checking) {
          void view.copySelectedNodeLinksToClipboard();
        }
        return true;
      }
    });

    this.addCommand({
      id: "select-all-graph-nodes-from-focused-graph",
      name: "Select all graph nodes",
      checkCallback: (checking: boolean) => {
        const view = this.findFocusedGraphView();
        if (!view) return false;
        if (!checking) {
          const count = view.selectAllGraphNodes();
          new Notice(count === 1 ? "Selected 1 graph node." : `Selected ${count} graph nodes.`);
        }
        return true;
      }
    });

    this.addCommand({
      id: "open-current-file-as-graph",
      name: "Open current file as graph (current tab)",
      callback: async () => {
        const leaf = this.app.workspace.getMostRecentLeaf();
        const file = this.resolveActiveFileForLeaf(leaf);
        if (!leaf || !file) {
          new Notice("No active file to open as graph.");
          return;
        }
        await this.openFileInGraphView(file, leaf);
      }
    });

    this.addCommand({
      id: "open-current-file-as-markdown",
      name: "Open current file as markdown (current tab)",
      callback: async () => {
        const leaf = this.app.workspace.getMostRecentLeaf();
        const file = this.resolveActiveFileForLeaf(leaf);
        if (!leaf || !file) {
          new Notice("No active file to open as markdown.");
          return;
        }
        await this.openFileInMarkdownView(file, leaf);
      }
    });

    this.addCommand({
      id: "toggle-graph-markdown-view",
      name: "Toggle graph/markdown view (current tab)",
      callback: async () => {
        const leaf = this.app.workspace.getMostRecentLeaf();
        const file = this.resolveActiveFileForLeaf(leaf);
        if (!leaf || !file) {
          new Notice("No active file to toggle view.");
          return;
        }
        if (leaf.view.getViewType() === BASES_GRAPH_VIEW) {
          await this.openFileInMarkdownView(file, leaf);
          return;
        }
        await this.openFileInGraphView(file, leaf);
      }
    });

    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
      this.syncMarkdownGraphSwitchAction(leaf ?? null);
    }));

    this.registerEvent(this.app.workspace.on("file-open", () => {
      this.syncMarkdownGraphSwitchAction(this.app.workspace.getMostRecentLeaf());
    }));

    this.registerEvent(this.app.metadataCache.on("changed", (file) => {
      const leaf = this.app.workspace.getMostRecentLeaf();
      if (!leaf || !(file instanceof TFile)) return;
      const leafFile = this.resolveLeafFile(leaf);
      if (!leafFile || leafFile.path !== file.path) return;
      this.syncMarkdownGraphSwitchAction(leaf);
    }));

    this.registerEvent(this.app.workspace.on("file-menu", (menu, file, _source, sourceLeaf) => {
      if (!(file instanceof TFile)) return;
      if (file.extension !== "md") return;
      menu.addItem((item: MenuItem) => {
        item
          .setTitle("Open as NosyGraph")
          .setIcon("share-2")
          .onClick(async () => {
            if (!await this.isGraphFile(file)) {
              new Notice("This note is not recognized as a NosyGraph-capable note.");
              return;
            }
            const leaf = sourceLeaf ?? this.resolveCurrentLeafForFile(file);
            await this.openFileInGraphView(file, leaf);
          });
      });
    }));

    this.registerMarkdownPostProcessor(async (el, ctx) => {
      const sourcePath = String(ctx.sourcePath ?? "").trim();
      if (!sourcePath) return;
      const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
      if (!(sourceFile instanceof TFile)) return;
      const isGraphTarget = await this.isGraphEmbedTargetFile(sourceFile);
      if (!isGraphTarget) return;

      const embedContent = el.closest(".markdown-embed-content");
      if (!this.isHTMLElement(embedContent)) return;
      if (!this.isGraphViewEmbedRequest(embedContent)) return;
      if (embedContent.dataset.o3GraphEmbedMounted === "1") return;
      embedContent.dataset.o3GraphEmbedMounted = "1";

      const child = new O3GraphEmbedRenderChild(
        embedContent,
        this.app,
        sourceFile,
        this.settings
      );
      ctx.addChild(child);
    });
  }

  private isGraphViewEmbedRequest(embedContent: HTMLElement): boolean {
    const embed = embedContent.closest(".markdown-embed");
    if (!this.isHTMLElement(embed)) return false;

    const candidates: string[] = [];
    const add = (value: unknown): void => {
      const text = String(value ?? "").trim();
      if (text) candidates.push(text);
    };

    add(embed.getAttribute("src"));
    add(embed.getAttribute("data-src"));
    add(embed.getAttribute("data-href"));
    add(embed.dataset?.src);
    add(embed.dataset?.href);

    for (const link of Array.from(embed.querySelectorAll("a.internal-link, .markdown-embed-link"))) {
      if (!this.isHTMLElement(link)) continue;
      add(link.getAttribute("href"));
      add(link.getAttribute("data-href"));
      add(link.getAttribute("aria-label"));
      add(link.getAttribute("title"));
      add(link.dataset?.href);
    }

    return candidates.some((candidate) => this.hasGraphViewSubpath(candidate));
  }

  private hasGraphViewSubpath(valueRaw: string): boolean {
    const value = String(valueRaw ?? "").trim();
    if (!value) return false;
    const marker = value.match(/#([^|\]\n\r]*)/);
    if (!marker) return false;
    const subpath = decodeURIComponent(String(marker[1] ?? ""))
      .trim()
      .replace(/^#+/, "")
      .toLowerCase()
      .replace(/[\s_-]+/g, "");
    return subpath === "graphview" || subpath === "o3graph" || subpath === "o3graphview";
  }

  private isHTMLElement(value: unknown): value is HTMLElement {
    if (!value || typeof value !== "object") return false;
    const ownerDocument = "ownerDocument" in value
      ? (value as { ownerDocument?: Document | null }).ownerDocument
      : null;
    const ownerWindow = ownerDocument?.defaultView ?? window;
    return value instanceof ownerWindow.HTMLElement;
  }

  private isMouseEvent(value: unknown, contextEl: HTMLElement): value is MouseEvent {
    const ownerWindow = contextEl.ownerDocument.defaultView ?? window;
    return value instanceof ownerWindow.MouseEvent;
  }

  private triggerStyleSettingsReparse(): void {
    const trigger = () => this.app.workspace.trigger("parse-style-settings");
    this.app.workspace.onLayoutReady(() => {
      trigger();
      window.setTimeout(trigger, 250);
      window.setTimeout(trigger, 1000);
    });
  }

  private findActiveGraphView(): BasesGraphView | null {
    const recentView = this.app.workspace.getMostRecentLeaf()?.view;
    if (recentView instanceof BasesGraphView) {
      return recentView;
    }
    if (
      recentView
      && typeof (recentView as { getViewType?: unknown }).getViewType === "function"
      && recentView.getViewType() === BASES_GRAPH_VIEW
      && typeof (recentView as { migrateGraphStateToCurrentLayout?: unknown }).migrateGraphStateToCurrentLayout === "function"
    ) {
      return recentView as BasesGraphView;
    }
    for (const leaf of this.app.workspace.getLeavesOfType(BASES_GRAPH_VIEW)) {
      const view = leaf.view;
      if (view instanceof BasesGraphView) {
        return view;
      }
      if (typeof (view as { migrateGraphStateToCurrentLayout?: unknown }).migrateGraphStateToCurrentLayout === "function") {
        return view as BasesGraphView;
      }
    }
    return null;
  }

  private findFocusedGraphView(): BasesGraphView | null {
    const recentView = this.app.workspace.getMostRecentLeaf()?.view;
    if (recentView instanceof BasesGraphView) {
      return recentView;
    }
    if (
      recentView
      && typeof (recentView as { getViewType?: unknown }).getViewType === "function"
      && recentView.getViewType() === BASES_GRAPH_VIEW
      && typeof (recentView as { copySelectedNodeLinksToClipboard?: unknown }).copySelectedNodeLinksToClipboard === "function"
    ) {
      return recentView as BasesGraphView;
    }
    return null;
  }

  async onunload() {
    for (const action of this.markdownGraphSwitchActions.values()) {
      action.remove();
    }
    this.markdownGraphSwitchActions.clear();
  }

  private async loadPluginSettings() {
    const raw = await this.loadData();
    const merged = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
    const n = Number(merged.defaultNodeDragHoldDurationMs);
    this.settings.defaultNodeDragHoldDurationMs = Number.isFinite(n)
      ? Math.max(0, Math.round(n))
      : DEFAULT_SETTINGS.defaultNodeDragHoldDurationMs;
    const limit = Number(merged.defaultNodeLimit);
    this.settings.defaultNodeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.round(limit))
      : DEFAULT_SETTINGS.defaultNodeLimit;
    const sourceLimit = Number(merged.defaultSourceLimit);
    this.settings.defaultSourceLimit = Number.isFinite(sourceLimit)
      ? Math.max(1, Math.round(sourceLimit))
      : DEFAULT_SETTINGS.defaultSourceLimit;
    this.settings.defaultRootNodeProperties = this.normalizeRootNodePropertySettingArray(merged.defaultRootNodeProperties);
    this.settings.defaultActiveGroups = this.normalizeSettingStringArray(merged.defaultActiveGroups);
    this.settings.defaultVisibleLinkTypes = this.normalizeVisibleLinkTypeSettingArray(merged.defaultVisibleLinkTypes);
    this.settings.defaultAutoExpandDroppedLinkTypes = merged.defaultAutoExpandDroppedLinkTypes !== false;
    const linkTypeFolder = this.normalizeFolderPath(merged.linkTypeFolder);
    this.settings.linkTypeFolder = linkTypeFolder || DEFAULT_SETTINGS.linkTypeFolder;
    const rootNodeRingColor = String(merged.rootNodeRingColor ?? "").trim();
    this.settings.rootNodeRingColor = rootNodeRingColor || DEFAULT_SETTINGS.rootNodeRingColor;
    const activeNodeRingColor = String(merged.activeNodeRingColor ?? "").trim();
    this.settings.activeNodeRingColor = activeNodeRingColor || DEFAULT_SETTINGS.activeNodeRingColor;
    this.settings.nearestActiveLinkedNodeIndicatorEnabled = merged.nearestActiveLinkedNodeIndicatorEnabled !== false;
    const nearestActiveLinkedNodeIndicatorColor = String(merged.nearestActiveLinkedNodeIndicatorColor ?? "").trim();
    this.settings.nearestActiveLinkedNodeIndicatorColor = nearestActiveLinkedNodeIndicatorColor || DEFAULT_SETTINGS.nearestActiveLinkedNodeIndicatorColor;
    const nearestActiveLinkedNodeIndicatorOpacityPercent = Number(merged.nearestActiveLinkedNodeIndicatorOpacityPercent);
    this.settings.nearestActiveLinkedNodeIndicatorOpacityPercent = Number.isFinite(nearestActiveLinkedNodeIndicatorOpacityPercent)
      ? Math.max(0, Math.min(100, Math.round(nearestActiveLinkedNodeIndicatorOpacityPercent)))
      : DEFAULT_SETTINGS.nearestActiveLinkedNodeIndicatorOpacityPercent;
    const nearestActiveLinkedNodeMaxHops = Number(merged.nearestActiveLinkedNodeMaxHops);
    this.settings.nearestActiveLinkedNodeMaxHops = Number.isFinite(nearestActiveLinkedNodeMaxHops)
      ? Math.max(1, Math.min(32, Math.round(nearestActiveLinkedNodeMaxHops)))
      : DEFAULT_SETTINGS.nearestActiveLinkedNodeMaxHops;
    const nearestActiveLinkedNodeMaxVisited = Number(merged.nearestActiveLinkedNodeMaxVisited);
    this.settings.nearestActiveLinkedNodeMaxVisited = Number.isFinite(nearestActiveLinkedNodeMaxVisited)
      ? Math.max(50, Math.min(10000, Math.round(nearestActiveLinkedNodeMaxVisited)))
      : DEFAULT_SETTINGS.nearestActiveLinkedNodeMaxVisited;
    const showAllLinkTypeBadgesKey = String(merged.showAllLinkTypeBadgesKey ?? "").trim().toLowerCase();
    this.settings.showAllLinkTypeBadgesKey = showAllLinkTypeBadgesKey || DEFAULT_SETTINGS.showAllLinkTypeBadgesKey;
    const freezeGraphKey = String(merged.freezeGraphKey ?? "").trim().toLowerCase();
    this.settings.freezeGraphKey = freezeGraphKey || DEFAULT_SETTINGS.freezeGraphKey;
    const subnodeOpacityPercent = Number(merged.subnodeOpacityPercent);
    this.settings.subnodeOpacityPercent = Number.isFinite(subnodeOpacityPercent)
      ? Math.max(0, Math.min(100, Math.round(subnodeOpacityPercent)))
      : DEFAULT_SETTINGS.subnodeOpacityPercent;
    const iconOpacityPercent = Number(merged.iconOpacityPercent);
    this.settings.iconOpacityPercent = Number.isFinite(iconOpacityPercent)
      ? Math.max(0, Math.min(100, Math.round(iconOpacityPercent)))
      : DEFAULT_SETTINGS.iconOpacityPercent;
    this.settings.graphPropertyKeys = normalizeGraphPropertyKeys(merged.graphPropertyKeys);
    this.settings.noteTypeIdentifiers = normalizeNoteTypeIdentifiers(merged.noteTypeIdentifiers);
    this.settings.linkTypePropertyKeys = normalizeLinkTypePropertyKeys(merged.linkTypePropertyKeys);
    this.settings.groupPropertyKeys = normalizeGroupPropertyKeys(merged.groupPropertyKeys);
  }

  async savePluginSettings() {
    await this.saveData(this.settings);
  }

  normalizeSettingStringArray(raw: unknown): string[] {
    const values = typeof raw === "string"
      ? raw.split(/[\n,]+/)
      : Array.isArray(raw)
        ? raw
        : [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of values) {
      const value = String(item ?? "").trim();
      const normalized = value.toLowerCase();
      if (!value || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(value);
    }
    return out;
  }

  normalizeRootNodePropertySettingArray(raw: unknown): string[] {
    const values = typeof raw === "string"
      ? raw.split(/[\s,;]+/)
      : Array.isArray(raw)
        ? raw.flatMap((item) => String(item ?? "").split(/[\s,;]+/))
        : [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of values) {
      const value = String(item ?? "").trim();
      const normalized = value.toLowerCase();
      if (!value || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(value);
    }
    return out;
  }

  normalizeVisibleLinkTypeSettingArray(raw: unknown): string[] {
    const rawValues = typeof raw === "string"
      ? [raw]
      : Array.isArray(raw)
        ? raw
        : [];
    const values = rawValues.flatMap((item) => this.splitSettingListTextPreservingWikiLinks(String(item ?? "")));
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of values) {
      const value = String(item ?? "").trim();
      const normalized = value.toLowerCase();
      if (!value || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(value);
    }
    return out;
  }

  private splitSettingListTextPreservingWikiLinks(textRaw: string): string[] {
    const text = String(textRaw ?? "").trim();
    if (!text) return [];
    const out: string[] = [];
    const wikiLinkPattern = /\[\[[^\]]+\]\]/g;
    let cursor = 0;
    const addPlain = (plain: string): void => {
      for (const part of plain.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean)) {
        out.push(part);
      }
    };
    for (const match of text.matchAll(wikiLinkPattern)) {
      const index = match.index ?? 0;
      addPlain(text.slice(cursor, index));
      out.push(match[0]);
      cursor = index + match[0].length;
    }
    addPlain(text.slice(cursor));
    return out;
  }

  applyGraphCapableNoteDefaultsToOpenViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(BASES_GRAPH_VIEW)) {
      const view = leaf.view;
      if (view instanceof BasesGraphView) {
        view.setGraphCapableNoteDefaults(
          this.settings.defaultRootNodeProperties,
          this.settings.defaultActiveGroups,
          this.settings.defaultVisibleLinkTypes
        );
      }
    }
  }

  applyDefaultAutoExpandDroppedLinkTypesToOpenViews(): void {
    const enabled = this.settings.defaultAutoExpandDroppedLinkTypes;
    for (const leaf of this.app.workspace.getLeavesOfType(BASES_GRAPH_VIEW)) {
      const view = leaf.view;
      if (view instanceof BasesGraphView) {
        view.setDefaultAutoExpandDroppedLinkTypes(enabled);
      }
    }
  }

  applyRootNodeRingColorToOpenViews(): void {
    const color = this.settings.rootNodeRingColor;
    for (const leaf of this.app.workspace.getLeavesOfType(BASES_GRAPH_VIEW)) {
      const view = leaf.view;
      if (view instanceof BasesGraphView) {
        view.setRootNodeRingColor(color);
      }
    }
  }

  applyActiveNodeRingColorToOpenViews(): void {
    const color = this.settings.activeNodeRingColor;
    for (const leaf of this.app.workspace.getLeavesOfType(BASES_GRAPH_VIEW)) {
      const view = leaf.view;
      if (view instanceof BasesGraphView) {
        view.setActiveNodeRingColor(color);
      }
    }
  }

  applyNearestActiveLinkedNodeIndicatorToOpenViews(): void {
    const settings = {
      enabled: this.settings.nearestActiveLinkedNodeIndicatorEnabled,
      color: this.settings.nearestActiveLinkedNodeIndicatorColor,
      opacityPercent: this.settings.nearestActiveLinkedNodeIndicatorOpacityPercent,
      maxHops: this.settings.nearestActiveLinkedNodeMaxHops,
      maxVisited: this.settings.nearestActiveLinkedNodeMaxVisited
    };
    for (const leaf of this.app.workspace.getLeavesOfType(BASES_GRAPH_VIEW)) {
      const view = leaf.view;
      if (view instanceof BasesGraphView) {
        view.setNearestActiveLinkedNodeIndicator(settings);
      }
    }
  }

  applyShowAllLinkTypeBadgesKeyToOpenViews(): void {
    const key = this.settings.showAllLinkTypeBadgesKey;
    for (const leaf of this.app.workspace.getLeavesOfType(BASES_GRAPH_VIEW)) {
      const view = leaf.view;
      if (view instanceof BasesGraphView) {
        view.setShowAllLinkTypeBadgesKey(key);
      }
    }
  }

  applyFreezeGraphKeyToOpenViews(): void {
    const key = this.settings.freezeGraphKey;
    for (const leaf of this.app.workspace.getLeavesOfType(BASES_GRAPH_VIEW)) {
      const view = leaf.view;
      if (view instanceof BasesGraphView) {
        view.setFreezeGraphKey(key);
      }
    }
  }

  applyGraphPropertyKeysToOpenViews(): void {
    const keys = this.settings.graphPropertyKeys;
    for (const leaf of this.app.workspace.getLeavesOfType(BASES_GRAPH_VIEW)) {
      const view = leaf.view;
      if (view instanceof BasesGraphView) {
        view.setGraphPropertyKeys(keys);
      }
    }
  }

  applyNoteTypeIdentifiersToOpenViews(): void {
    const identifiers = this.settings.noteTypeIdentifiers;
    for (const leaf of this.app.workspace.getLeavesOfType(BASES_GRAPH_VIEW)) {
      const view = leaf.view;
      if (view instanceof BasesGraphView) {
        view.setNoteTypeIdentifiers(identifiers);
      }
    }
  }

  applyNoteTypePropertyKeysToOpenViews(): void {
    const linkTypeKeys = this.settings.linkTypePropertyKeys;
    const groupKeys = this.settings.groupPropertyKeys;
    for (const leaf of this.app.workspace.getLeavesOfType(BASES_GRAPH_VIEW)) {
      const view = leaf.view;
      if (view instanceof BasesGraphView) {
        view.setNoteTypePropertyKeys(linkTypeKeys, groupKeys);
      }
    }
  }

  applySubnodeOpacityToOpenViews(): void {
    const opacity = this.settings.subnodeOpacityPercent;
    for (const leaf of this.app.workspace.getLeavesOfType(BASES_GRAPH_VIEW)) {
      const view = leaf.view;
      if (view instanceof BasesGraphView) {
        view.setSubnodeOpacityPercent(opacity);
      }
    }
  }

  applyIconOpacityToOpenViews(): void {
    const opacity = this.settings.iconOpacityPercent;
    for (const leaf of this.app.workspace.getLeavesOfType(BASES_GRAPH_VIEW)) {
      const view = leaf.view;
      if (view instanceof BasesGraphView) {
        view.setIconOpacityPercent(opacity);
      }
    }
  }

  private normalizeFolderPath(raw: unknown): string {
    return String(raw ?? "").trim().replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
  }

  private isValidVaultFolderPath(path: string): boolean {
    if (!path) return false;
    if (path.includes("\\")) return false;
    if (path.includes(":")) return false;
    if (/[<>|"?*]/.test(path)) return false;
    if (path.startsWith(".") || path.includes("/.") || path.includes("../")) return false;
    return true;
  }

  async updateLinkTypeFolder(rawPath: string): Promise<boolean> {
    const normalized = this.normalizeFolderPath(rawPath);
    if (!this.isValidVaultFolderPath(normalized)) {
      return false;
    }
    if (normalized === this.settings.linkTypeFolder) {
      return true;
    }
    this.settings.linkTypeFolder = normalized;
    await this.savePluginSettings();
    return true;
  }

  private resolveLeafFile(leaf: WorkspaceLeaf | null): TFile | null {
    if (!leaf) return null;
    const viewFile = this.readLeafViewFile(leaf);
    if (viewFile instanceof TFile) {
      return viewFile;
    }
    const state = this.readLeafState(leaf);
    const path = String(state?.file ?? state?.filePath ?? "").trim();
    if (!path) return null;
    const abstractFile = this.app.vault.getAbstractFileByPath(path);
    return abstractFile instanceof TFile ? abstractFile : null;
  }

  private resolveActiveFileForLeaf(leaf: WorkspaceLeaf | null): TFile | null {
    const leafFile = this.resolveLeafFile(leaf);
    if (leafFile instanceof TFile) {
      return leafFile;
    }
    const activeFile = this.app.workspace.getActiveFile();
    return activeFile instanceof TFile ? activeFile : null;
  }

  private readLeafViewFile(leaf: WorkspaceLeaf): TFile | null {
    const view = leaf.view as unknown as { file?: unknown; getFile?: () => unknown };
    if (typeof view?.getFile === "function") {
      const file = view.getFile();
      if (file instanceof TFile) return file;
    }
    if (view?.file instanceof TFile) {
      return view.file;
    }
    return null;
  }

  private readLeafState(leaf: WorkspaceLeaf): Record<string, unknown> | null {
    const view = leaf.view as unknown as { getState?: () => unknown };
    if (typeof view?.getState !== "function") return null;
    const raw = view.getState();
    if (!raw || typeof raw !== "object") return null;
    return raw as Record<string, unknown>;
  }

  private async openFileInGraphView(file: TFile, leaf: WorkspaceLeaf): Promise<void> {
    try {
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
      await leaf.setViewState({
        type: BASES_GRAPH_VIEW,
        state: { file: file.path },
        active: true
      }, false);
    } catch (error) {
      console.error("[BasesGraphPlugin] Failed to open graph view:", {
        file: file.path,
        viewType: BASES_GRAPH_VIEW,
        error
      });
      new Notice("Failed to open NosyGraph view. See console for details.");
    }
  }

  private async openFileInMarkdownView(file: TFile, leaf: WorkspaceLeaf): Promise<void> {
    await leaf.setViewState({
      type: "markdown",
      state: { file: file.path },
      active: true
    }, false);
  }

  private async createNewGraphNoteFromTemplate(): Promise<void> {
    const folderPath = this.resolvePreferredNewNoteFolderPath();
    const filePath = this.buildUniqueNotePath(folderPath, "Graph Note");
    const content = [
      "---",
      `${this.settings.noteTypeIdentifiers.graph.property}: ${this.formatIdentifierFrontmatterValue(this.settings.noteTypeIdentifiers.graph)}`,
      `${this.settings.graphPropertyKeys.rootNodes}: []`,
      `${this.settings.graphPropertyKeys.activeLinkTypes}: []`,
      `${this.settings.graphPropertyKeys.visibleLinkTypeLineStyle}: dashed`,
      `${this.settings.graphPropertyKeys.discoveredLinkLineStyle}: normal`,
      `${this.settings.graphPropertyKeys.autoExpandDroppedLinkTypes}: ${this.settings.defaultAutoExpandDroppedLinkTypes ? "true" : "false"}`,
      `${this.settings.graphPropertyKeys.graphForceGravity}: 0`,
      `${this.settings.graphPropertyKeys.graphForceRepellent}: 4000`,
      `${this.settings.graphPropertyKeys.graphNodeSize}: 6`,
      `${this.settings.graphPropertyKeys.graphNodeConnectionSizeMultiplier}: 1`,
      `${this.settings.graphPropertyKeys.graphVelocityNearRestThreshold}: 0.08`,
      `${this.settings.graphPropertyKeys.graphVelocityRestThreshold}: 0.015`,
      `${this.settings.graphPropertyKeys.showNodeIcons}: true`,
      "---",
      "",
      "# Graph Note",
      ""
    ].join("\n");

    try {
      const file = await this.app.vault.create(filePath, content);
      const leaf = this.resolveCurrentLeafForFile(file);
      await this.openFileInGraphView(file, leaf);
      new Notice(`Created graph note: ${file.basename}`);
    } catch (error) {
      console.error("[BasesGraphPlugin] Failed to create graph note:", error);
      new Notice("Failed to create graph note.");
    }
  }

  private resolvePreferredNewNoteFolderPath(): string {
    const activeFile = this.app.workspace.getActiveFile();
    const folder = activeFile?.parent;
    if (folder instanceof TFolder) {
      return folder.path;
    }
    return "";
  }

  private buildUniqueNotePath(folderPath: string, baseName: string): string {
    const folder = String(folderPath ?? "").trim().replace(/^\/+|\/+$/g, "");
    const safeBaseName = String(baseName ?? "").trim() || "Graph Note";
    let index = 0;
    while (index < 10000) {
      const suffix = index === 0 ? "" : ` ${index + 1}`;
      const fileName = `${safeBaseName}${suffix}.md`;
      const candidate = folder ? `${folder}/${fileName}` : fileName;
      const existing = this.app.vault.getAbstractFileByPath(candidate);
      if (!existing) {
        return candidate;
      }
      index += 1;
    }
    return `${folder ? `${folder}/` : ""}${safeBaseName} ${Date.now()}.md`;
  }

  private async isGraphEmbedTargetFile(file: TFile): Promise<boolean> {
    if (await this.isGraphFile(file)) return true;
    try {
      const content = await this.app.vault.cachedRead(file);
      return /```o3graph[\s\S]*?```/im.test(content);
    } catch {
      return false;
    }
  }

  private isRecognizedGraphFile(file: TFile): boolean {
    return file.extension === "md";
  }

  private async isGraphFile(file: TFile): Promise<boolean> {
    if (file.extension === "md") return true;
    if (this.isRecognizedGraphFile(file)) return true;
    try {
      const content = await this.app.vault.cachedRead(file);
      if (/```o3graph[\s\S]*?```/im.test(content)) return true;
      return this.isGraphCapableFrontmatter(this.parseFrontmatterFromContent(content));
    } catch (error) {
      console.warn("[BasesGraphPlugin] Failed to inspect graph note:", {
        file: file.path,
        error
      });
      return false;
    }
  }

  private parseFrontmatterFromContent(content: string): Record<string, unknown> {
    const match = String(content ?? "").match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!match) return {};
    try {
      const parsed = parseYaml(match[1] ?? "");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }

  private formatIdentifierFrontmatterValue(identifier: NoteTypeIdentifier): string {
    const value = identifierFrontmatterValue(identifier);
    if (typeof value === "boolean") return value ? "true" : "false";
    return JSON.stringify(String(value ?? ""));
  }

  private syncMarkdownGraphSwitchAction(leaf: WorkspaceLeaf | null): void {
    if (!leaf) return;

    const previous = this.markdownGraphSwitchActions.get(leaf);
    if (previous) {
      previous.remove();
      this.markdownGraphSwitchActions.delete(leaf);
    }

    if (leaf.view.getViewType() !== "markdown") return;

    const file = this.resolveLeafFile(leaf);
    if (!(file instanceof TFile)) return;
    if (file.extension !== "md") return;

    const view = leaf.view as unknown as {
      addAction?: (icon: string, title: string, callback: () => void) => HTMLElement;
    };
    if (typeof view.addAction !== "function") return;

    const openGraphAction = async (targetLeaf: WorkspaceLeaf): Promise<void> => {
      if (!await this.isGraphFile(file)) {
        new Notice("This note is not recognized as a NosyGraph-capable note.");
        return;
      }
      await this.openFileInGraphView(file, targetLeaf);
    };
    let suppressPrimaryGraphActionUntil = 0;
    const suppressPrimaryGraphAction = (): void => {
      suppressPrimaryGraphActionUntil = Date.now() + 750;
    };
    const actionEl = view.addAction("share-2", "Open as NosyGraph", () => {
      if (Date.now() < suppressPrimaryGraphActionUntil) return;
      void openGraphAction(leaf);
    });
    actionEl.addEventListener("click", (event) => {
      if (!this.isMouseEvent(event, actionEl)) return;
      if (!this.shouldOpenGraphActionInNewTab(event)) return;
      suppressPrimaryGraphAction();
      event.preventDefault();
      event.stopImmediatePropagation();
      void openGraphAction(this.app.workspace.getLeaf("tab"));
    }, true);
    actionEl.addEventListener("auxclick", (event) => {
      if (event.button !== 1) return;
      suppressPrimaryGraphAction();
      event.preventDefault();
      event.stopImmediatePropagation();
      void openGraphAction(this.app.workspace.getLeaf("tab"));
    });
    actionEl.addEventListener("mousedown", (event) => {
      if (event.button !== 1) return;
      suppressPrimaryGraphAction();
      event.preventDefault();
      event.stopImmediatePropagation();
    });
    this.markdownGraphSwitchActions.set(leaf, actionEl);

    void this.isGraphFile(file).then((recognized) => {
      if (recognized) return;
      if (this.markdownGraphSwitchActions.get(leaf) !== actionEl) return;
      actionEl.remove();
      this.markdownGraphSwitchActions.delete(leaf);
    });
  }

  private isGraphCapableFrontmatter(frontmatter: Record<string, unknown>): boolean {
    return frontmatterMatchesIdentifier(frontmatter, this.settings.noteTypeIdentifiers.graph)
      || hasFrontmatterProperty(frontmatter, this.settings.graphPropertyKeys, "rootNodeProperties");
  }

  private resolveCurrentLeafForFile(file: TFile): WorkspaceLeaf {
    const recent = this.app.workspace.getMostRecentLeaf();
    if (recent && this.resolveLeafFile(recent)?.path === file.path) {
      return recent;
    }

    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      if (this.resolveLeafFile(leaf)?.path === file.path) {
        return leaf;
      }
    }

    for (const leaf of this.app.workspace.getLeavesOfType(BASES_GRAPH_VIEW)) {
      if (this.resolveLeafFile(leaf)?.path === file.path) {
        return leaf;
      }
    }

    return recent ?? this.app.workspace.getLeaf(false);
  }

  private shouldOpenGraphActionInNewTab(event: MouseEvent): boolean {
    return event.button === 1 || event.ctrlKey || event.metaKey;
  }
}

class O3GraphEmbedRenderChild extends MarkdownRenderChild {
  private engine: GraphEngine | null = null;
  private hostEl: HTMLDivElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private graphFilesForRender: TFile[] = [];
  private labelsForRender = new Map<string, string>();
  private visibleLinkTypeLineStyleForRender: GraphLineStyle = "dashed";
  private discoveredLinkLineStyleForRender: GraphLineStyle = "normal";
  private runtimeStateForRender: O3GraphRuntimeState | null = null;
  private graphStateModel: O3GraphState | null = null;
  private graphStateStore: O3GraphStateStore | null = null;
  private suppressGraphFileReloadUntil = 0;
  private viewportPersistTimer: number | null = null;

  constructor(
    containerEl: HTMLElement,
    private appRef: App,
    private graphFile: TFile,
    private settings: BasesGraphPluginSettings
  ) {
    super(containerEl);
  }

  onload(): void {
    this.registerEvent(this.appRef.vault.on("modify", (file) => {
      if (!(file instanceof TFile)) return;
      if (file.path !== this.graphFile.path) return;
      if (Date.now() < this.suppressGraphFileReloadUntil) return;
      void this.mountAsync();
    }));
    void this.mountAsync();
  }

  onunload(): void {
    if (this.viewportPersistTimer !== null) {
      window.clearTimeout(this.viewportPersistTimer);
      this.viewportPersistTimer = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.engine?.destroy();
    this.engine = null;
    this.hostEl = null;
  }

  private async mountAsync(): Promise<void> {
    if (this.viewportPersistTimer !== null) {
      window.clearTimeout(this.viewportPersistTimer);
      this.viewportPersistTimer = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.engine?.destroy();
    this.engine = null;

    this.containerEl.empty();

    const host = this.containerEl.createDiv({ cls: "o3-graph-transclusion" });
    setStyle(host, "position", "relative");
    setStyle(host, "display", "block");
    setStyle(host, "width", "100%");
    setStyle(host, "minWidth", "280px");
    setStyle(host, "height", "420px");
    setStyle(host, "minHeight", "320px");
    setStyle(host, "border", "1px solid var(--background-modifier-border)");
    setStyle(host, "borderRadius", "8px");
    setStyle(host, "overflow", "hidden");
    setStyle(host, "background", "var(--background-secondary)");
    this.hostEl = host;

    this.graphStateModel = await this.readGraphStateModelForEmbed();
    this.runtimeStateForRender = this.graphStateModel?.state ?? null;
    const persisted = this.readPersistedGraphViewState();
    const persistedGraphSettings = this.readPersistedGraphSettings(persisted);

    const initialSettings = {
      repulsionStrength: persistedGraphSettings.repulsionStrength,
      centerStrength: persistedGraphSettings.centerStrength,
      nodeRadius: persistedGraphSettings.nodeRadius,
      nodeConnectionSizeMultiplier: persistedGraphSettings.nodeConnectionSizeMultiplier,
      nearRestVelocityThreshold: persistedGraphSettings.nearRestVelocityThreshold,
      restVelocityThreshold: persistedGraphSettings.restVelocityThreshold,
      textFadeThreshold: persistedGraphSettings.textFadeThreshold
    };
    const engine = new GraphEngine(host, this.appRef, {
      initialSettings,
      initialLayoutId: persistedGraphSettings.layoutId,
      nodeDragHoldDurationMs: this.settings.defaultNodeDragHoldDurationMs,
      disableDefaultLinkTypeList: false,
      initialRootNodeRingColor: this.settings.rootNodeRingColor,
      initialActiveNodeRingColor: this.settings.activeNodeRingColor,
      initialShowAllLinkTypeBadgesKey: this.settings.showAllLinkTypeBadgesKey,
      initialSubnodeOpacityPercent: this.settings.subnodeOpacityPercent,
      initialIconOpacityPercent: this.settings.iconOpacityPercent,
      graphPropertyKeys: this.settings.graphPropertyKeys,
      initialLinkTypeMenuSize: this.runtimeStateForRender?.linkTypeMenu,
      onLinkTypeMenuSizeChange: (size) => {
        this.handleLinkTypeMenuSizeChanged(size);
      },
      onSettingsChange: (settings) => {
        void this.handleSimulationSettingsChanged(settings);
      },
      onGraphLinkBadgeDrop: (request) => {
        return new ObsidianGraphLinkMutationHandler(this.appRef).applyBadgeDrop(request);
      },
      shouldAutoExpandDroppedLinkTypes: () => this.shouldAutoExpandDroppedLinkTypes(),
      onGraphLinkInputRequested: (request) => {
        return new ObsidianGraphLinkInputHandler(this.appRef).requestLinkInput(request);
      },
      onNodeOpen: (request) => {
        return new ObsidianGraphNodeOpenHandler(this.appRef).openNode(request);
      },
      onAddRootNodeRequested: (context) => {
        return this.requestRootNodeInput(context?.ownerPath ?? null);
      },
      isGraphNote: (path) => this.isLensExpandablePath(path),
      onEmbeddedGraphExpansionRequested: (payload) => {
        return this.loadEmbeddedGraphDefinition(payload.graphPath, payload.ancestry);
      },
      onBadgeExpansionToggled: (sourceNodeId, sourcePath, linkType, expanded, _expansionId, parentExpansionId) => {
        if (!this.graphStateModel) return;
        const changed = this.graphStateModel.setExpansionStatus(
          sourceNodeId,
          sourcePath,
          linkType,
          expanded,
          parentExpansionId
        );
        if (!changed) return;
      }
    });
    this.engine = engine;
    engine.init();
    engine.onNodePositionChanged = (path, x, y) => {
      void this.handleNodePositionChanged(path, x, y);
    };
    engine.onViewportChanged = (viewport, options) => {
      this.handleViewportChanged(viewport, options);
    };

    this.resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      engine.handleResize(rect.width, rect.height, { reheat: false });
    });
    this.resizeObserver.observe(host);

    const fm = this.readFrontmatter(this.graphFile);
    const rootsFromFrontmatter = this.resolveRootNodeFilesFromGraphFrontmatter(fm);
    const roots = rootsFromFrontmatter.length > 0
      ? rootsFromFrontmatter
      : this.resolveFilesFromGraphValue(persisted.rootNodes);
    const graphFiles = (roots.length > 0 ? roots : [this.graphFile])
      .slice(0, Math.max(1, Math.round(this.settings.defaultSourceLimit)));

    const activeLinkTypes = this.resolveActiveLinkTypesFromFrontmatter(fm);
    const activePropertiesFromDefinitions = activeLinkTypes
      .map((lt) => String(lt.property ?? "").trim().toLowerCase())
      .filter(Boolean);
    const visibleLinkTypes = this.normalizeStringArray(
      hasFrontmatterProperty(fm, this.settings.graphPropertyKeys, "visibleLinkTypes")
        ? readFrontmatterPropertyByKey(fm, this.settings.graphPropertyKeys, "visibleLinkTypes") ?? []
        : this.settings.defaultVisibleLinkTypes
    );
    const visibleLinkTypeDefinitions = this.resolveVisibleLinkTypeDefinitions(visibleLinkTypes);
    const visibleLinkTypeLineStyle = this.readGraphLineStyle(fm, "visibleLinkTypeLineStyle", "dashed");
    const discoveredLinkLineStyle = this.readGraphLineStyle(fm, "discoveredLinkLineStyle", "normal");
    const showNodeIcons = this.readGraphBoolean(fm, "showNodeIcons", true);
    this.visibleLinkTypeLineStyleForRender = visibleLinkTypeLineStyle;
    this.discoveredLinkLineStyleForRender = discoveredLinkLineStyle;
    const persistedSelectedTypes = this.normalizeStringArray(persisted.activeLinkTypes);
    const selectedTypes = activePropertiesFromDefinitions.length > 0
      ? activePropertiesFromDefinitions
      : persistedSelectedTypes;

    const labels = new Map<string, string>();
    for (const file of graphFiles) {
      labels.set(file.path, file.basename ?? file.name);
    }
    this.graphFilesForRender = [...graphFiles];
    this.labelsForRender = new Map(labels);
    engine.setActiveLinkTypes(activeLinkTypes);
    engine.setSelectedLinkTypes(selectedTypes);
    engine.setHideNodesWithoutSelectedLinkTypes(persistedGraphSettings.hideNodesWithoutSelectedLinkTypes);
    engine.updateGraph(graphFiles, {
      labels,
      linkTypeSourceFiles: graphFiles,
      nodeLimit: Math.max(1, Math.round(this.settings.defaultNodeLimit)),
      visibleLinkTypes,
      visibleLinkTypeDefinitions,
      visibleLinkTypeLineStyle,
      discoveredLinkLineStyle,
      showNodeIcons,
      disableLinkTypeDiscovery: false,
      graphState: this.runtimeStateForRender,
      debugMeta: {
        graphEmbed: true,
        graphNote: this.graphFile.path
      }
    });
    this.replayPersistedBadgeExpansions();

    this.ensureInitialEmbedViewport(0);
  }

  private resolveActiveLinkTypesFromFrontmatter(frontmatter: Record<string, unknown>): O3LinkType[] {
    const files = this.resolveFilesFromGraphValue(
      readFrontmatterPropertyByKey(frontmatter, this.settings.graphPropertyKeys, "activeLinkTypes") ?? []
    );
    const out: O3LinkType[] = [];
    for (const file of files) {
      const fm = this.readFrontmatter(file);
      if (!frontmatterMatchesIdentifier(fm, this.settings.noteTypeIdentifiers.linkType)) continue;
      out.push(new O3LinkType(file, fm, this.settings.linkTypePropertyKeys));
    }
    return out;
  }

  private resolveVisibleLinkTypeDefinitions(values: string[]): O3LinkType[] {
    const candidates = this.collectLinkTypeDefinitions();
    const out: O3LinkType[] = [];
    const seen = new Set<string>();
    for (const valueRaw of values ?? []) {
      const value = String(valueRaw ?? "").trim();
      if (!value) continue;
      const linkedFile = this.resolveFilesFromGraphValue([value])[0];
      const normalized = value
        .replace(/^\[\[/, "")
        .replace(/\]\]$/, "")
        .split("|")[0]
        .split("#")[0]
        .trim()
        .toLowerCase();
      const matched = candidates.find((linkType) => {
        const identities = [
          String(linkType.property ?? "").trim().toLowerCase(),
          ...(linkType.properties ?? []).map((property) => String(property ?? "").trim().toLowerCase()),
          String(linkType.key ?? "").trim().toLowerCase(),
          String(linkType.file?.path ?? "").trim().toLowerCase(),
          String(linkType.file?.basename ?? "").trim().toLowerCase()
        ].filter(Boolean);
        return (linkedFile && linkType.file.path === linkedFile.path)
          || identities.includes(normalized);
      });
      if (!matched) continue;
      const property = String(matched.property ?? "").trim().toLowerCase();
      if (!property || seen.has(property)) continue;
      seen.add(property);
      out.push(matched);
    }
    return out;
  }

  private collectLinkTypeDefinitions(): O3LinkType[] {
    const configuredFolder = this.normalizeFolderPath(this.settings.linkTypeFolder);
    const files = this.appRef.vault
      .getMarkdownFiles()
      .filter((file) => !configuredFolder || file.path.startsWith(`${configuredFolder}/`) || file.path === configuredFolder);
    const out: O3LinkType[] = [];
    for (const file of files) {
      const fm = this.readFrontmatter(file);
      if (!frontmatterMatchesIdentifier(fm, this.settings.noteTypeIdentifiers.linkType)) continue;
      out.push(new O3LinkType(file, fm, this.settings.linkTypePropertyKeys));
    }
    return out;
  }

  private resolveRootNodeFilesFromGraphFrontmatter(frontmatter: Record<string, unknown>): TFile[] {
    const hasConfiguredProperties = hasFrontmatterProperty(frontmatter, this.settings.graphPropertyKeys, "rootNodeProperties");
    const defaultPropertyNames = this.settings.defaultRootNodeProperties
      .map((property) => String(property ?? "").trim())
      .filter(Boolean);
    const usesConfiguredProperties = hasConfiguredProperties || defaultPropertyNames.length > 0;
    if (!usesConfiguredProperties) {
      return this.resolveFilesFromGraphValue(
        readFrontmatterPropertyByKey(frontmatter, this.settings.graphPropertyKeys, "rootNodes")
      );
    }

    const files: TFile[] = [];
    const seen = new Set<string>();
    const propertyNames = hasConfiguredProperties
      ? this.collectRootNodePropertyNames(
          readFrontmatterPropertyByKey(frontmatter, this.settings.graphPropertyKeys, "rootNodeProperties")
        )
      : defaultPropertyNames;
    for (const propertyName of propertyNames) {
      if (String(propertyName ?? "").trim().toLowerCase() === NONE_LINK_TYPE.toLowerCase()) {
        for (const file of this.resolveBodyLinkFiles(this.graphFile)) {
          if (seen.has(file.path)) continue;
          seen.add(file.path);
          files.push(file);
        }
        continue;
      }
      const value = readFrontmatterProperty(frontmatter, propertyName);
      for (const file of this.resolveFilesFromGraphValue(value)) {
        if (seen.has(file.path)) continue;
        seen.add(file.path);
        files.push(file);
      }
    }
    return files;
  }

  private resolveBodyLinkFiles(sourceFile: TFile): TFile[] {
    const cache = this.appRef.metadataCache.getFileCache(sourceFile);
    const links = Array.isArray(cache?.links) ? cache.links : [];
    const files: TFile[] = [];
    const seen = new Set<string>();
    for (const link of links) {
      const linkText = String((link as Record<string, unknown>).link ?? "").trim();
      if (!linkText) continue;
      const file = this.appRef.metadataCache.getFirstLinkpathDest(linkText, sourceFile.path);
      if (!(file instanceof TFile) || seen.has(file.path)) continue;
      seen.add(file.path);
      files.push(file);
    }
    return files;
  }

  private isLensExpandablePath(pathRaw: string): boolean {
    const path = String(pathRaw ?? "").trim();
    if (!path) return false;
    const file = this.appRef.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return false;
    const frontmatter = this.readFrontmatter(file);
    if (frontmatterMatchesIdentifier(frontmatter, this.settings.noteTypeIdentifiers.graph)) return true;

    const hasConfiguredProperties = hasFrontmatterProperty(frontmatter, this.settings.graphPropertyKeys, "rootNodeProperties");
    const propertyNames = hasConfiguredProperties
      ? this.collectRootNodePropertyNames(
          readFrontmatterPropertyByKey(frontmatter, this.settings.graphPropertyKeys, "rootNodeProperties")
        )
      : this.settings.defaultRootNodeProperties
          .map((property) => String(property ?? "").trim())
          .filter(Boolean);
    if (propertyNames.length === 0) return false;

    for (const propertyName of propertyNames) {
      const property = String(propertyName ?? "").trim();
      if (!property) continue;
      if (property.toLowerCase() === NONE_LINK_TYPE.toLowerCase()) {
        if (this.resolveBodyLinkFiles(file).length > 0) return true;
        continue;
      }
      if (this.resolveFilesFromGraphValue(readFrontmatterProperty(frontmatter, property)).length > 0) {
        return true;
      }
    }
    return false;
  }

  private async loadEmbeddedGraphDefinition(
    graphPathRaw: string,
    ancestryRaw: string[]
  ): Promise<EmbeddedGraphDefinition | null> {
    const graphPath = String(graphPathRaw ?? "").trim();
    const ancestry = Array.from(new Set(
      [
        ...(ancestryRaw ?? []),
        this.graphFile.path
      ].map((path) => String(path ?? "").trim()).filter(Boolean)
    ));
    if (!graphPath || ancestry.includes(graphPath)) return null;
    const file = this.appRef.vault.getAbstractFileByPath(graphPath);
    if (!(file instanceof TFile)) return null;
    const frontmatter = this.readFrontmatter(file);
    if (!this.isLensExpandablePath(file.path)) return null;

    const store = new O3GraphStateStore(this.appRef, file, this.settings.graphPropertyKeys);
    const state = await store.read();
    const colorRaw = readFrontmatterPropertyByKey(frontmatter, this.settings.graphPropertyKeys, "graphContainerColor");
    const forceRaw = Number(readFrontmatterPropertyByKey(frontmatter, this.settings.graphPropertyKeys, "graphContainerLinkForce"));
    const activeLinkTypes = this.resolveActiveLinkTypesFromFrontmatter(frontmatter);
    const visibleLinkTypes = this.normalizeStringArray(
      hasFrontmatterProperty(frontmatter, this.settings.graphPropertyKeys, "visibleLinkTypes")
        ? readFrontmatterPropertyByKey(frontmatter, this.settings.graphPropertyKeys, "visibleLinkTypes") ?? []
        : this.settings.defaultVisibleLinkTypes
    );
    let snapshots = state.toRuntimeNodeSnapshots();
    if (snapshots.length === 0) {
      const roots = this.resolveRootNodeFilesForFile(file, frontmatter);
      snapshots = roots.map((root, index) => ({
        nodeId: root.path,
        path: root.path,
        x: (index % 4) * 100,
        y: Math.floor(index / 4) * 100,
        pinned: false,
        origin: { kind: "root" as const },
        badges: {}
      }));
    }
    return {
      graphPath,
      color: String(colorRaw ?? "").trim() || "#6e96dc",
      colorSource: String(colorRaw ?? "").trim() ? "explicit" : "default",
      linkForce: Number.isFinite(forceRaw) ? Math.max(0, Math.min(1, forceRaw)) : 0.015,
      snapshots,
      ancestry,
      linkTypes: activeLinkTypes,
      visibleLinkTypes,
      visibleLinkTypeDefinitions: this.resolveVisibleLinkTypeDefinitions(visibleLinkTypes),
      embeddedGraphs: state.listExpandedEmbeddedGraphs().map((entry) => ({
        originNodeId: entry.originNodeId,
        graphPath: entry.graphPath,
        ...(entry.lens ? { lens: entry.lens } : {}),
        ...(entry.embeddedGraphs && entry.embeddedGraphs.length > 0
          ? { embeddedGraphs: entry.embeddedGraphs }
          : {})
      }))
    };
  }

  private resolveRootNodeFilesForFile(file: TFile, frontmatter: Record<string, unknown>): TFile[] {
    const hasConfiguredProperties = hasFrontmatterProperty(frontmatter, this.settings.graphPropertyKeys, "rootNodeProperties");
    const propertyNames = hasConfiguredProperties
      ? this.collectRootNodePropertyNames(
          readFrontmatterPropertyByKey(frontmatter, this.settings.graphPropertyKeys, "rootNodeProperties")
        )
      : this.settings.defaultRootNodeProperties
          .map((property) => String(property ?? "").trim())
          .filter(Boolean);
    const files: TFile[] = [];
    const seen = new Set<string>();
    for (const propertyName of propertyNames) {
      const property = String(propertyName ?? "").trim();
      if (!property) continue;
      const linked = property.toLowerCase() === NONE_LINK_TYPE.toLowerCase()
        ? this.resolveBodyLinkFiles(file)
        : this.resolveFilesFromGraphValue(readFrontmatterProperty(frontmatter, property));
      for (const linkedFile of linked) {
        if (seen.has(linkedFile.path)) continue;
        seen.add(linkedFile.path);
        files.push(linkedFile);
      }
    }
    return files;
  }

  private async requestRootNodeInput(ownerPath?: string | null): Promise<void> {
    const contextPath = String(ownerPath ?? "").trim();
    const ownerFile = this.appRef.vault.getAbstractFileByPath(contextPath || this.graphFile.path);
    if (!(ownerFile instanceof TFile)) return;
    const file = await new ObsidianGraphRootInputHandler(this.appRef).requestRootFile(ownerFile.path);
    if (!(file instanceof TFile)) return;
    const propertyNames = this.getRootNodePropertyNamesForFile(ownerFile);
    const result = await new ObsidianGraphRootPropertyMutationHandler(this.appRef).addFiles({
      ownerPath: ownerFile.path,
      files: [file],
      propertyNames
    });
    if (result.added > 0) {
      await this.reloadFromFile();
    } else if (propertyNames.length === 0) {
      new Notice("No root node property configured for this graph view.");
    }
  }

  private getRootNodePropertyNamesForFile(file: TFile): string[] {
    const frontmatter = this.appRef.metadataCache.getFileCache(file)?.frontmatter ?? {};
    if (hasFrontmatterProperty(frontmatter, this.settings.graphPropertyKeys, "rootNodeProperties")) {
      return this.collectRootNodePropertyNames(
        readFrontmatterPropertyByKey(frontmatter, this.settings.graphPropertyKeys, "rootNodeProperties")
      );
    }
    return this.settings.defaultRootNodeProperties
      .map((property) => String(property ?? "").trim())
      .filter(Boolean);
  }

  private collectRootNodePropertyNames(raw: unknown): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (value: unknown): void => {
      if (value == null) return;
      if (Array.isArray(value)) {
        for (const item of value) add(item);
        return;
      }
      const text = String(value ?? "").trim();
      const parts = text.split(/[\s,;]+/).map((part) => part.trim()).filter(Boolean);
      for (const part of parts.length > 0 ? parts : [text]) {
        const normalized = part.toLowerCase();
        if (!part || seen.has(normalized)) continue;
        seen.add(normalized);
        out.push(part);
      }
    };
    add(raw);
    return out;
  }

  private resolveFilesFromGraphValue(raw: unknown): TFile[] {
    const rawValues: string[] = [];
    if (typeof raw === "string") {
      rawValues.push(...raw.split(",").map((v) => v.trim()).filter(Boolean));
    } else if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item !== "string") continue;
        const value = item.trim();
        if (!value) continue;
        rawValues.push(value);
      }
    }

    const out: TFile[] = [];
    const seen = new Set<string>();
    for (const value of rawValues) {
      const match = value.match(/^\[\[([^|\]]+)/);
      const linkPath = (match ? match[1] : value).trim();
      if (!linkPath) continue;
      const file = this.appRef.metadataCache.getFirstLinkpathDest(linkPath, this.graphFile.path);
      if (!(file instanceof TFile)) continue;
      if (seen.has(file.path)) continue;
      seen.add(file.path);
      out.push(file);
    }
    return out;
  }

  private normalizeStringArray(raw: unknown): string[] {
    const values = typeof raw === "string"
      ? this.splitSettingListTextPreservingWikiLinks(raw)
      : Array.isArray(raw)
        ? raw.flatMap((item) => this.splitSettingListTextPreservingWikiLinks(String(item ?? "")))
        : [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of values) {
      const value = String(item ?? "").trim().toLowerCase();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      out.push(value);
    }
    return out;
  }

  private readGraphLineStyle(
    frontmatter: Record<string, unknown>,
    key: "visibleLinkTypeLineStyle" | "discoveredLinkLineStyle",
    fallback: GraphLineStyle
  ): GraphLineStyle {
    const raw = readFrontmatterPropertyByKey(frontmatter, this.settings.graphPropertyKeys, key);
    const normalized = String(raw ?? "").trim().toLowerCase();
    if (["dash", "dashed"].includes(normalized)) return "dashed";
    if (["normal", "solid", "line"].includes(normalized)) return "normal";
    return fallback;
  }

  private readGraphBoolean(
    frontmatter: Record<string, unknown>,
    key: "showNodeIcons",
    fallback: boolean
  ): boolean {
    const raw = readFrontmatterPropertyByKey(frontmatter, this.settings.graphPropertyKeys, key);
    if (raw === undefined || raw === null || raw === "") return fallback;
    if (typeof raw === "boolean") return raw;
    if (typeof raw === "number") return raw !== 0;
    const normalized = String(raw).trim().toLowerCase();
    if (!normalized) return fallback;
    return !["false", "no", "off", "0"].includes(normalized);
  }

  private shouldAutoExpandDroppedLinkTypes(): boolean {
    const frontmatter = this.readFrontmatter(this.graphFile);
    const raw = readFrontmatterPropertyByKey(
      frontmatter,
      this.settings.graphPropertyKeys,
      "autoExpandDroppedLinkTypes"
    );
    if (raw === undefined || raw === null || raw === "") {
      return this.settings.defaultAutoExpandDroppedLinkTypes;
    }
    if (typeof raw === "boolean") return raw;
    if (typeof raw === "number") return raw !== 0;
    const normalized = String(raw).trim().toLowerCase();
    if (!normalized) return this.settings.defaultAutoExpandDroppedLinkTypes;
    return !["false", "no", "off", "0"].includes(normalized);
  }

  private readPersistedGraphViewState(): Record<string, unknown> {
    const scopeKey = BASES_GRAPH_VIEW;
    const storageKey = `nosygraph:${scopeKey}:graphState`;
    try {
      const raw = this.app.loadLocalStorage(storageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  private readPersistedGraphSettings(rawState: Record<string, unknown>): {
    repulsionStrength: number;
    centerStrength: number;
    nodeRadius: number;
    nodeConnectionSizeMultiplier: number;
    nearRestVelocityThreshold: number;
    restVelocityThreshold: number;
    textFadeThreshold: number;
    layoutId: string;
    hideNodesWithoutSelectedLinkTypes: boolean;
  } {
    const graphSettings = (
      rawState?.graphSettings && typeof rawState.graphSettings === "object"
        ? (rawState.graphSettings as Record<string, unknown>)
        : {}
    );

    const repulsionStrength = Number(graphSettings.repulsionStrength);
    const centerStrength = Number(graphSettings.centerStrength);
    const nodeRadius = Number(graphSettings.nodeRadius);
    const nodeConnectionSizeMultiplier = Number(graphSettings.nodeConnectionSizeMultiplier);
    const nearRestVelocityThreshold = Number(graphSettings.nearRestVelocityThreshold);
    const restVelocityThreshold = Number(graphSettings.restVelocityThreshold);
    const textFadeThreshold = Number(graphSettings.textFadeThreshold);
    const layoutId = String(graphSettings.layoutId ?? "force").trim().toLowerCase() || "force";
    const hideNodesWithoutSelectedLinkTypes = graphSettings.hideNodesWithoutSelectedLinkTypes === true;

    const defaults = {
      repulsionStrength: Number.isFinite(repulsionStrength) ? repulsionStrength : 4000,
      centerStrength: Number.isFinite(centerStrength) ? centerStrength : 0,
      nodeRadius: Number.isFinite(nodeRadius) ? nodeRadius : 6,
      nodeConnectionSizeMultiplier: Number.isFinite(nodeConnectionSizeMultiplier) ? nodeConnectionSizeMultiplier : 1,
      nearRestVelocityThreshold: Number.isFinite(nearRestVelocityThreshold) ? nearRestVelocityThreshold : 0.08,
      restVelocityThreshold: Number.isFinite(restVelocityThreshold) ? restVelocityThreshold : 0.015,
      textFadeThreshold: Number.isFinite(textFadeThreshold) ? Math.max(0, Math.min(100, textFadeThreshold)) : 97
    };

    const graphNoteSettings = this.graphStateStore?.readSimulationSettings(defaults) ?? defaults;
    return {
      repulsionStrength: graphNoteSettings.repulsionStrength,
      centerStrength: graphNoteSettings.centerStrength,
      nodeRadius: graphNoteSettings.nodeRadius,
      nodeConnectionSizeMultiplier: graphNoteSettings.nodeConnectionSizeMultiplier,
      nearRestVelocityThreshold: graphNoteSettings.nearRestVelocityThreshold,
      restVelocityThreshold: graphNoteSettings.restVelocityThreshold,
      textFadeThreshold: graphNoteSettings.textFadeThreshold,
      layoutId,
      hideNodesWithoutSelectedLinkTypes
    };
  }

  private async handleSimulationSettingsChanged(settings: {
    repulsionStrength: number;
    centerStrength: number;
    nodeRadius: number;
    nodeConnectionSizeMultiplier: number;
    nearRestVelocityThreshold: number;
    restVelocityThreshold: number;
    textFadeThreshold: number;
  }): Promise<void> {
    void settings;
    // Embedded graph renders are read-only. Persisting from markdown transclusions
    // can overwrite graph notes during startup before roots/filters are hydrated.
  }

  private ensureInitialEmbedViewport(attempt: number): void {
    if (!this.engine || !this.hostEl) return;
    const rect = this.hostEl.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (width < 40 || height < 40) {
      if (attempt >= 20) return;
      window.setTimeout(() => this.ensureInitialEmbedViewport(attempt + 1), 60);
      return;
    }

    this.engine.handleResize(width, height, { reheat: false });
    if (!this.runtimeStateForRender?.viewport) {
      this.engine.centerViewportOnGravityCenter({ zoom: 1, emit: false });
    }
    this.engine.reheatSimulation(0.2, "graph embed initial fit");
    const nodeCount = this.engine.getNodeCount();

    if (nodeCount === 0 && this.graphFilesForRender.length > 0) {
      // Fallback: render base files without selected-type filtering to guarantee visible roots.
      this.engine.setSelectedLinkTypes([]);
      this.engine.updateGraph(this.graphFilesForRender, {
        labels: this.labelsForRender,
        linkTypeSourceFiles: this.graphFilesForRender,
        nodeLimit: Math.max(1, Math.round(this.settings.defaultNodeLimit)),
        visibleLinkTypes,
        visibleLinkTypeDefinitions: this.resolveVisibleLinkTypeDefinitions(visibleLinkTypes),
        visibleLinkTypeLineStyle: this.visibleLinkTypeLineStyleForRender,
        discoveredLinkLineStyle: this.discoveredLinkLineStyleForRender,
        showNodeIcons: this.readGraphBoolean(this.readFrontmatter(this.graphFile), "showNodeIcons", true),
        disableLinkTypeDiscovery: false,
        graphState: this.runtimeStateForRender,
        debugMeta: {
          graphEmbed: true,
          graphNote: this.graphFile.path,
          fallback: "empty-node-retry"
        }
      });
      this.replayPersistedBadgeExpansions();
      if (!this.runtimeStateForRender?.viewport) {
        this.engine.centerViewportOnGravityCenter({ zoom: 1, emit: false });
      }
      this.engine.reheatSimulation(0.2, "graph embed fallback fit");
    }
  }

  private async readGraphRuntimeStateForEmbed(): Promise<O3GraphRuntimeState | null> {
    const model = await this.readGraphStateModelForEmbed();
    return model?.state ?? null;
  }

  private async readGraphStateModelForEmbed(): Promise<O3GraphState | null> {
    try {
      this.graphStateStore = new O3GraphStateStore(this.appRef, this.graphFile, this.settings.graphPropertyKeys);
      return await this.graphStateStore.read();
    } catch {
      return null;
    }
  }

  private async handleNodePositionChanged(path: string, x?: number, y?: number): Promise<void> {
    void path;
    void x;
    void y;
    // Embedded graph renders are read-only.
  }

  private handleViewportChanged(
    viewport: { x: number; y: number; zoom: number },
    options?: { isFinal?: boolean }
  ): void {
    void viewport;
    void options;
    // Embedded graph renders are read-only.
  }

  private handleLinkTypeMenuSizeChanged(size: { width: number; height: number }): void {
    void size;
    // Embedded graph renders are read-only.
  }

  private scheduleViewportStateWrite(immediate = false): void {
    if (this.viewportPersistTimer !== null) {
      window.clearTimeout(this.viewportPersistTimer);
      this.viewportPersistTimer = null;
    }
    if (immediate) {
      void this.writeGraphState();
      return;
    }
    this.viewportPersistTimer = window.setTimeout(() => {
      this.viewportPersistTimer = null;
      void this.writeGraphState();
    }, 250);
  }

  private async writeGraphState(): Promise<void> {
    // Embedded graph renders are intentionally read-only. The canonical writer is
    // the dedicated graph view, where startup and core-node resolution can be
    // guarded more reliably.
  }

  private shouldWriteGraphStateSnapshots(snapshots: O3GraphRuntimeNodeSnapshot[]): boolean {
    if (!Array.isArray(snapshots)) return false;
    const existingNodeCount = Object.keys(this.graphStateModel?.state.nodes ?? {}).length;
    if (snapshots.length === 0) {
      if (existingNodeCount > 0 || this.graphFilesForRender.length > 0) {
        console.warn("[GraphEmbed] Skipped empty graph-state write to protect graph note data.", {
          graphFile: this.graphFile.path,
          existingNodeCount,
          configuredGraphFiles: this.graphFilesForRender.length
        });
        return false;
      }
      return true;
    }

    const requiredPaths = new Set(
      this.graphFilesForRender
        .map((file) => String(file.path ?? "").trim())
        .filter(Boolean)
    );
    if (requiredPaths.size === 0) return true;
    const snapshotPaths = new Set(
      snapshots
        .map((snapshot) => String(snapshot.path ?? "").trim())
        .filter(Boolean)
    );
    const missing = Array.from(requiredPaths).filter((path) => !snapshotPaths.has(path));
    if (missing.length === 0) return true;
    console.warn("[GraphEmbed] Skipped graph-state write because runtime snapshots are missing configured graph files.", {
      graphFile: this.graphFile.path,
      missing,
      snapshotCount: snapshots.length
    });
    return false;
  }

  private replayPersistedBadgeExpansions(): void {
    if (!this.engine) return;
    if (!this.graphStateModel) return;
    const expandedEntries = this.graphStateModel.listExpandedGraphEntries();
    const pending = expandedEntries
      .map((e) => ({
        id: String(e.id ?? "").trim(),
        sourceNodeId: String(e.sourceNodeId ?? "").trim(),
        sourcePath: String(e.sourcePath ?? "").trim(),
        linkType: String(e.linkType ?? "").trim().toLowerCase(),
        parentId: this.graphStateModel?.getExpansionParentId(String(e.id ?? "").trim()) ?? null
      }))
      .filter((e) => e.id && e.sourceNodeId && e.sourcePath && e.linkType);
    if (pending.length === 0) return;

    let remaining = pending;
    const maxPasses = Math.max(1, pending.length);
    const replayed = new Set<string>();
    for (let pass = 0; pass < maxPasses && remaining.length > 0; pass++) {
      let progressed = false;
      const nextRemaining: typeof pending = [];
      for (const item of remaining) {
        if (!this.engine.hasNode(item.sourceNodeId)) {
          nextRemaining.push(item);
          continue;
        }
        if (item.parentId && !replayed.has(item.parentId)) {
          nextRemaining.push(item);
          continue;
        }
        this.engine.toggleExpansion(item.sourcePath, item.linkType, {
          persist: false,
          sourceNodeId: item.sourceNodeId
        });
        replayed.add(item.id);
        progressed = true;
      }
      remaining = nextRemaining;
      if (!progressed) break;
    }
  }

  private readFrontmatter(file: TFile): Record<string, unknown> {
    const cache = this.appRef.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (!fm || typeof fm !== "object") return {};
    return fm as Record<string, unknown>;
  }
}

class BasesGraphSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: BasesGraphPlugin) {
    super(app, plugin);
  }

  getSettingDefinitions(): unknown[] {
    return [];
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Default node drag hold duration (ms)")
      .setDesc("Default hold duration before drag lock engages for graph nodes.")
      .addText((text) => {
        text
          .setPlaceholder("180")
          .setValue(String(this.plugin.settings.defaultNodeDragHoldDurationMs))
          .onChange(async (value) => {
            const parsed = Number(value);
            this.plugin.settings.defaultNodeDragHoldDurationMs = Number.isFinite(parsed)
              ? Math.max(0, Math.round(parsed))
              : DEFAULT_SETTINGS.defaultNodeDragHoldDurationMs;
            await this.plugin.savePluginSettings();
          });
      });

    new Setting(containerEl)
      .setName("LinkType folder")
      .setDesc("Vault folder used as the global O3 LinkType registry.")
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.linkTypeFolder)
          .setValue(this.plugin.settings.linkTypeFolder)
          .onChange(async (value) => {
            const accepted = await this.plugin.updateLinkTypeFolder(value);
            if (!accepted) {
              new Notice("Invalid LinkType folder path.");
              text.setValue(this.plugin.settings.linkTypeFolder);
            }
          });
      });

    new Setting(containerEl)
      .setName("Root node ring color")
      .setDesc("Color of the circle around root nodes in graph view.")
      .addColorPicker((picker) => {
        picker
          .setValue(this.plugin.settings.rootNodeRingColor)
          .onChange(async (value) => {
            const next = String(value ?? "").trim();
            this.plugin.settings.rootNodeRingColor = next || DEFAULT_SETTINGS.rootNodeRingColor;
            this.plugin.applyRootNodeRingColorToOpenViews();
            await this.plugin.savePluginSettings();
          });
      });

    new Setting(containerEl)
      .setName("Active node ring color")
      .setDesc("Color of the outer indicator around the graph node whose note is currently active.")
      .addColorPicker((picker) => {
        picker
          .setValue(this.plugin.settings.activeNodeRingColor)
          .onChange(async (value) => {
            const next = String(value ?? "").trim();
            this.plugin.settings.activeNodeRingColor = next || DEFAULT_SETTINGS.activeNodeRingColor;
            this.plugin.applyActiveNodeRingColorToOpenViews();
            await this.plugin.savePluginSettings();
          });
      });

    new Setting(containerEl)
      .setName("Nearest active linked node indicator")
      .setDesc("Show a faint marker on the closest visible node found through the active note's link chain.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.nearestActiveLinkedNodeIndicatorEnabled)
          .onChange(async (value) => {
            this.plugin.settings.nearestActiveLinkedNodeIndicatorEnabled = Boolean(value);
            this.plugin.applyNearestActiveLinkedNodeIndicatorToOpenViews();
            await this.plugin.savePluginSettings();
          });
      });

    new Setting(containerEl)
      .setName("Nearest active linked node color")
      .setDesc("Color of the faint marker for the closest visible linked node.")
      .addColorPicker((picker) => {
        picker
          .setValue(this.plugin.settings.nearestActiveLinkedNodeIndicatorColor)
          .onChange(async (value) => {
            const next = String(value ?? "").trim();
            this.plugin.settings.nearestActiveLinkedNodeIndicatorColor = next || DEFAULT_SETTINGS.nearestActiveLinkedNodeIndicatorColor;
            this.plugin.applyNearestActiveLinkedNodeIndicatorToOpenViews();
            await this.plugin.savePluginSettings();
          });
      });

    new Setting(containerEl)
      .setName("Nearest active linked node opacity")
      .setDesc("Opacity of the faint marker for the closest visible linked node.")
      .addSlider((slider) => {
        slider
          .setLimits(0, 100, 1)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.nearestActiveLinkedNodeIndicatorOpacityPercent)
          .onChange(async (value) => {
            this.plugin.settings.nearestActiveLinkedNodeIndicatorOpacityPercent = Math.max(0, Math.min(100, Math.round(Number(value))));
            this.plugin.applyNearestActiveLinkedNodeIndicatorToOpenViews();
            await this.plugin.savePluginSettings();
          });
      });

    new Setting(containerEl)
      .setName("Nearest active linked node max hops")
      .setDesc("Maximum link-chain distance checked when the active note is not visible.")
      .addText((text) => {
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.nearestActiveLinkedNodeMaxHops))
          .setValue(String(this.plugin.settings.nearestActiveLinkedNodeMaxHops))
          .onChange(async (value) => {
            const n = Number(value);
            this.plugin.settings.nearestActiveLinkedNodeMaxHops = Number.isFinite(n)
              ? Math.max(1, Math.min(32, Math.round(n)))
              : DEFAULT_SETTINGS.nearestActiveLinkedNodeMaxHops;
            this.plugin.applyNearestActiveLinkedNodeIndicatorToOpenViews();
            await this.plugin.savePluginSettings();
          });
      });

    new Setting(containerEl)
      .setName("Nearest active linked node max checked notes")
      .setDesc("Maximum number of notes checked per nearest-linked-node search.")
      .addText((text) => {
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.nearestActiveLinkedNodeMaxVisited))
          .setValue(String(this.plugin.settings.nearestActiveLinkedNodeMaxVisited))
          .onChange(async (value) => {
            const n = Number(value);
            this.plugin.settings.nearestActiveLinkedNodeMaxVisited = Number.isFinite(n)
              ? Math.max(50, Math.min(10000, Math.round(n)))
              : DEFAULT_SETTINGS.nearestActiveLinkedNodeMaxVisited;
            this.plugin.applyNearestActiveLinkedNodeIndicatorToOpenViews();
            await this.plugin.savePluginSettings();
          });
      });

    new Setting(containerEl)
      .setName("Show all LinkType badges key")
      .setDesc("Hold this key while a graph is focused to show all LinkType badges on visible nodes.")
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.showAllLinkTypeBadgesKey)
          .setValue(this.plugin.settings.showAllLinkTypeBadgesKey)
          .onChange(async (value) => {
            const next = String(value ?? "").trim().toLowerCase();
            this.plugin.settings.showAllLinkTypeBadgesKey = next || DEFAULT_SETTINGS.showAllLinkTypeBadgesKey;
            this.plugin.applyShowAllLinkTypeBadgesKeyToOpenViews();
            await this.plugin.savePluginSettings();
          });
      });

    new Setting(containerEl)
      .setName("Freeze graph key")
      .setDesc("Hold this key while a graph is focused to freeze node and container movement.")
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.freezeGraphKey)
          .setValue(this.plugin.settings.freezeGraphKey)
          .onChange(async (value) => {
            const next = String(value ?? "").trim().toLowerCase();
            this.plugin.settings.freezeGraphKey = next || DEFAULT_SETTINGS.freezeGraphKey;
            this.plugin.applyFreezeGraphKeyToOpenViews();
            await this.plugin.savePluginSettings();
          });
      });

    new Setting(containerEl)
      .setName("Subnode opacity")
      .setDesc("Opacity for nodes created by badge expansion. 100% is fully opaque.")
      .addSlider((slider) => {
        slider
          .setLimits(0, 100, 1)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.subnodeOpacityPercent)
          .onChange(async (value) => {
            this.plugin.settings.subnodeOpacityPercent = Math.max(0, Math.min(100, Math.round(Number(value))));
            this.plugin.applySubnodeOpacityToOpenViews();
            await this.plugin.savePluginSettings();
          });
      });

    new Setting(containerEl)
      .setName("Icon opacity")
      .setDesc("Opacity for graph node icons. The node's group-colored backing disc remains opaque.")
      .addSlider((slider) => {
        slider
          .setLimits(0, 100, 1)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.iconOpacityPercent)
          .onChange(async (value) => {
            this.plugin.settings.iconOpacityPercent = Math.max(0, Math.min(100, Math.round(Number(value))));
            this.plugin.applyIconOpacityToOpenViews();
            await this.plugin.savePluginSettings();
          });
      });

    new Setting(containerEl).setName("Graph-capable note defaults").setHeading();
    containerEl.createEl("p", {
      text: "Defaults used when a graph-capable note does not define the matching frontmatter property. These settings are not written to the note automatically.",
      cls: "setting-item-description"
    });
    this.addDefaultStringListSetting(
      containerEl,
      "Default root node properties",
      "Property names whose links become root nodes when the note has no rootNodeProperties property. Separate names with spaces, commas, semicolons, or new lines. Use None-type links for regular body links.",
      "defaultRootNodeProperties"
    );
    this.addDefaultStringListSetting(
      containerEl,
      "Default active groups",
      "Group note links or paths applied when the note has no activeGroups property.",
      "defaultActiveGroups"
    );
    this.addDefaultStringListSetting(
      containerEl,
      "Default visible LinkTypes",
      "LinkType note links, paths, keys, or properties applied when the note has no visibleLinkTypes property. Plain keys/properties can be separated with spaces, commas, semicolons, or new lines; wiki links with spaces stay intact.",
      "defaultVisibleLinkTypes"
    );
    new Setting(containerEl)
      .setName("Auto-expand dropped LinkTypes by default")
      .setDesc("Default behavior when a graph note does not define autoExpandDroppedLinkTypes. If enabled, dropping a node onto a badge expands/refreshes that badge after the YAML mutation. If disabled, only visible LinkType edges refresh.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.defaultAutoExpandDroppedLinkTypes)
          .onChange(async (value) => {
            this.plugin.settings.defaultAutoExpandDroppedLinkTypes = Boolean(value);
            this.plugin.applyDefaultAutoExpandDroppedLinkTypesToOpenViews();
            await this.plugin.savePluginSettings();
          });
      });

    new Setting(containerEl).setName("Note class identifiers").setHeading();
    containerEl.createEl("p", {
      text: "Configure which YAML property/value marks graph notes, LinkType notes, and group notes. Value matching ignores capitalization and may match inside arrays or wiki links.",
      cls: "setting-item-description"
    });
    this.addNoteTypeIdentifierSetting(containerEl, "Graph notes", "Notes that should open as NosyGraph graph notes.", "graph");
    this.addNoteTypeIdentifierSetting(containerEl, "LinkType notes", "Notes that define graph link types.", "linkType");
    this.addNoteTypeIdentifierSetting(containerEl, "Group notes", "Notes that define graph groups.", "group");

    new Setting(containerEl).setName("Graph note properties").setHeading();
    containerEl.createEl("p", {
      text: "Configure which YAML property names the plugin uses for graph notes and graph node notes. Existing default names remain readable as fallback; new writes use these configured names.",
      cls: "setting-item-description"
    });

    this.addGraphPropertySetting(
      containerEl,
      "Graph marker",
      "Boolean property that marks a note as a NosyGraph graph note.",
      "graphMarker"
    );
    this.addGraphPropertySetting(containerEl, "Root nodes", "Graph-note list of root node links.", "rootNodes");
    this.addGraphPropertySetting(containerEl, "Root node properties", "Graph-note list of property names whose linked notes become root nodes.", "rootNodeProperties");
    this.addGraphPropertySetting(containerEl, "Expansion LinkTypes", "Graph-note list of active expansion LinkType notes.", "activeLinkTypes");
    this.addGraphPropertySetting(containerEl, "Overlay LinkTypes", "Graph-note list of active overlay LinkType notes.", "activeOverlayLinkTypes");
    this.addGraphPropertySetting(containerEl, "Visible LinkTypes", "Graph-note list of LinkType properties/keys whose edges are shown only between already visible nodes.", "visibleLinkTypes");
    this.addGraphPropertySetting(containerEl, "Visible LinkType line style", "Graph-note property whose value controls visible/default visible LinkType edges: dashed or normal.", "visibleLinkTypeLineStyle");
    this.addGraphPropertySetting(containerEl, "Discovered link line style", "Graph-note property whose value controls discovered/active link edges: dashed or normal.", "discoveredLinkLineStyle");
    this.addGraphPropertySetting(containerEl, "Auto-expand dropped LinkTypes", "Graph-note boolean that controls whether dropping a node onto a badge automatically expands that badge after the YAML mutation.", "autoExpandDroppedLinkTypes");
    this.addGraphPropertySetting(containerEl, "Groups", "Graph-note list of active group notes.", "activeGroups");
    this.addGraphPropertySetting(containerEl, "Filters", "Graph-note list of active filter notes reserved for filter-based sources.", "activeFilters");
    this.addGraphPropertySetting(containerEl, "Connected Base filter", "Graph-note Base view link used as a filter source.", "connectedBaseFilter");
    this.addGraphPropertySetting(containerEl, "Gravity", "Graph-note force gravity setting.", "graphForceGravity");
    this.addGraphPropertySetting(containerEl, "Repellent", "Graph-note force repellent setting.", "graphForceRepellent");
    this.addGraphPropertySetting(containerEl, "Default node size", "Graph-note default node radius setting.", "graphNodeSize");
    this.addGraphPropertySetting(containerEl, "Connection size multiplier", "Graph-note node size multiplier per connection.", "graphNodeConnectionSizeMultiplier");
    this.addGraphPropertySetting(containerEl, "Near-rest velocity", "Graph-note velocity threshold for slow frame cadence.", "graphVelocityNearRestThreshold");
    this.addGraphPropertySetting(containerEl, "Rest velocity", "Graph-note velocity threshold for resting frame cadence.", "graphVelocityRestThreshold");
    this.addGraphPropertySetting(containerEl, "Text fade threshold", "Graph-note node-label visibility threshold.", "graphTextFadeThreshold");
    this.addGraphPropertySetting(containerEl, "Graph background color", "Graph-note canvas background color property, such as #F7AA34.", "graphBackgroundColor");
    this.addGraphPropertySetting(containerEl, "Layout", "Graph-note layout property.", "graphLayout");
    this.addGraphPropertySetting(containerEl, "Embedded container color", "Graph-note color used when this graph is embedded in another graph.", "graphContainerColor");
    this.addGraphPropertySetting(containerEl, "Embedded container force", "Graph-note centering force used when this graph is embedded in another graph.", "graphContainerLinkForce");
    this.addGraphPropertySetting(containerEl, "Show node icons", "Graph-note boolean that controls whether node and group icons/images are rendered.", "showNodeIcons");
    this.addGraphPropertySetting(containerEl, "Individual node size", "Node-note property that overrides a single node size.", "nodeIndividualSize");
    this.addGraphPropertySetting(containerEl, "Node icon", "Node-note property that stores an emoji/text icon or image link/path.", "graphIcon");

    new Setting(containerEl).setName("LinkType note properties").setHeading();
    containerEl.createEl("p", {
      text: "Configure which YAML property names LinkType notes use. Existing default names remain readable as fallback; new LinkType writes use these configured names.",
      cls: "setting-item-description"
    });
    this.addLinkTypePropertySetting(containerEl, "Label", "Display label/key of the LinkType.", "key");
    this.addLinkTypePropertySetting(containerEl, "Linked property", "YAML property or property list this LinkType reads on regular notes.", "property");
    this.addLinkTypePropertySetting(containerEl, "Link type", "Force Based, Direction Based, or parent container behavior.", "linkType");
    this.addLinkTypePropertySetting(containerEl, "Relationship direction", "Outgoing, incoming, or both for YAML relationship reads.", "direction");
    this.addLinkTypePropertySetting(containerEl, "Discovery direction", "Outgoing reads the current note; incoming finds notes whose configured property points to it.", "linkDiscoveryDirection");
    this.addLinkTypePropertySetting(containerEl, "Arrow direction", "Pointer direction used by rendered link arrows.", "pointerDirection");
    this.addLinkTypePropertySetting(containerEl, "Badge color", "Primary color used for the LinkType badge.", "color");
    this.addLinkTypePropertySetting(containerEl, "Line color", "Rendered link line color.", "linkLineColor");
    this.addLinkTypePropertySetting(containerEl, "Line thickness", "Rendered link line thickness.", "linkLineThickness");
    this.addLinkTypePropertySetting(containerEl, "Recursive", "Whether this LinkType should recurse through matching relationships.", "recursive");
    this.addLinkTypePropertySetting(containerEl, "Link force", "Force-based link strength.", "linkForce");
    this.addLinkTypePropertySetting(containerEl, "Link distance", "Force-based target link distance.", "linkDistance");
    this.addLinkTypePropertySetting(containerEl, "Direction axis", "Direction-based preferred axis direction.", "linkDirection");
    this.addLinkTypePropertySetting(containerEl, "Y axis weight", "Direction-based Y axis weight.", "linkYAxis");
    this.addLinkTypePropertySetting(containerEl, "X axis weight", "Direction-based X axis weight.", "linkXAxis");
    this.addLinkTypePropertySetting(containerEl, "Discovery", "Whether this LinkType can discover linked notes.", "linkDiscovery");
    this.addLinkTypePropertySetting(containerEl, "Duplicate nodes", "Whether this LinkType creates duplicate expansion nodes.", "linkDuplicateNodes");

    new Setting(containerEl).setName("Group note properties").setHeading();
    containerEl.createEl("p", {
      text: "Configure which YAML property names group notes use. Existing default names remain readable as fallback.",
      cls: "setting-item-description"
    });
    this.addGroupPropertySetting(containerEl, "Grouped property", "YAML property evaluated by the group rule.", "property");
    this.addGroupPropertySetting(containerEl, "Operator", "Group matching operator, such as equals, contains, or exists.", "operator");
    this.addGroupPropertySetting(containerEl, "Value", "Group matching value.", "value");
    this.addGroupPropertySetting(containerEl, "Color", "Group color applied to matching nodes.", "color");
    this.addGroupPropertySetting(containerEl, "Icon", "Group icon property used for matching graph nodes.", "icon");
  }

  private addGraphPropertySetting(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    key: keyof GraphPropertyKeys
  ): void {
    new Setting(containerEl)
      .setName(name)
      .setDesc(desc)
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_GRAPH_PROPERTY_KEYS[key])
          .setValue(this.plugin.settings.graphPropertyKeys[key])
          .onChange(async (value) => {
            const next = String(value ?? "").trim();
            this.plugin.settings.graphPropertyKeys = normalizeGraphPropertyKeys({
              ...this.plugin.settings.graphPropertyKeys,
              [key]: next || DEFAULT_GRAPH_PROPERTY_KEYS[key]
            });
            this.plugin.applyGraphPropertyKeysToOpenViews();
            await this.plugin.savePluginSettings();
          });
      });
  }

  private addDefaultStringListSetting(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    key: "defaultRootNodeProperties" | "defaultActiveGroups" | "defaultVisibleLinkTypes"
  ): void {
    new Setting(containerEl)
      .setName(name)
      .setDesc(desc)
      .addTextArea((text) => {
        text
          .setPlaceholder(key === "defaultActiveGroups"
            ? "One value per line or comma-separated"
            : "Separate plain values with spaces, commas, semicolons, or new lines")
          .setValue(this.plugin.settings[key].join("\n"))
          .onChange(async (value) => {
            this.plugin.settings[key] = key === "defaultRootNodeProperties"
              ? this.plugin.normalizeRootNodePropertySettingArray(value)
              : key === "defaultVisibleLinkTypes"
                ? this.plugin.normalizeVisibleLinkTypeSettingArray(value)
              : this.plugin.normalizeSettingStringArray(value);
            this.plugin.applyGraphCapableNoteDefaultsToOpenViews();
            await this.plugin.savePluginSettings();
          });
        text.inputEl.rows = 3;
        setStyle(text.inputEl, "width", "100%");
      });
  }

  private addLinkTypePropertySetting(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    key: keyof LinkTypePropertyKeys
  ): void {
    new Setting(containerEl)
      .setName(name)
      .setDesc(desc)
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_LINK_TYPE_PROPERTY_KEYS[key])
          .setValue(this.plugin.settings.linkTypePropertyKeys[key])
          .onChange(async (value) => {
            const next = String(value ?? "").trim();
            this.plugin.settings.linkTypePropertyKeys = normalizeLinkTypePropertyKeys({
              ...this.plugin.settings.linkTypePropertyKeys,
              [key]: next || DEFAULT_LINK_TYPE_PROPERTY_KEYS[key]
            });
            this.plugin.applyNoteTypePropertyKeysToOpenViews();
            await this.plugin.savePluginSettings();
          });
      });
  }

  private addGroupPropertySetting(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    key: keyof GroupPropertyKeys
  ): void {
    new Setting(containerEl)
      .setName(name)
      .setDesc(desc)
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_GROUP_PROPERTY_KEYS[key])
          .setValue(this.plugin.settings.groupPropertyKeys[key])
          .onChange(async (value) => {
            const next = String(value ?? "").trim();
            this.plugin.settings.groupPropertyKeys = normalizeGroupPropertyKeys({
              ...this.plugin.settings.groupPropertyKeys,
              [key]: next || DEFAULT_GROUP_PROPERTY_KEYS[key]
            });
            this.plugin.applyNoteTypePropertyKeysToOpenViews();
            await this.plugin.savePluginSettings();
          });
      });
  }

  private addNoteTypeIdentifierSetting(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    key: keyof NoteTypeIdentifierSettings
  ): void {
    const defaults = DEFAULT_NOTE_TYPE_IDENTIFIERS[key];
    new Setting(containerEl)
      .setName(name)
      .setDesc(desc)
      .addText((text) => {
        text
          .setPlaceholder(defaults.property)
          .setValue(this.plugin.settings.noteTypeIdentifiers[key].property)
          .onChange(async (value) => {
            const current = this.plugin.settings.noteTypeIdentifiers[key];
            this.plugin.settings.noteTypeIdentifiers = normalizeNoteTypeIdentifiers({
              ...this.plugin.settings.noteTypeIdentifiers,
              [key]: {
                ...current,
                property: String(value ?? "").trim() || defaults.property
              }
            });
            this.plugin.applyNoteTypeIdentifiersToOpenViews();
            await this.plugin.savePluginSettings();
          });
      })
      .addText((text) => {
        text
          .setPlaceholder(defaults.value)
          .setValue(this.plugin.settings.noteTypeIdentifiers[key].value)
          .onChange(async (value) => {
            const current = this.plugin.settings.noteTypeIdentifiers[key];
            this.plugin.settings.noteTypeIdentifiers = normalizeNoteTypeIdentifiers({
              ...this.plugin.settings.noteTypeIdentifiers,
              [key]: {
                ...current,
                value: String(value ?? "").trim() || defaults.value
              }
            });
            this.plugin.applyNoteTypeIdentifiersToOpenViews();
            await this.plugin.savePluginSettings();
          });
      });
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- Re-enable dynamic-data lint rules after this module. */
