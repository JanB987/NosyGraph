/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- NosyGraph parses Obsidian frontmatter, Bases data, and persisted graph JSON whose shapes are validated at runtime. */
import { App, FileView, Menu, Modal, Notice, WorkspaceLeaf, type ViewStateResult, parsePropertyId, parseYaml, stringifyYaml, TFile, TFolder } from "obsidian";
import { setStyle } from "./domStyle";
import {
  DIRECTION_GRAPH_LAYOUT_ID,
  FORCE_GRAPH_LAYOUT_ID,
  GraphEngine,
  type GraphImageExportArea,
  type GraphLineStyle,
  type GraphLayoutOption,
  type EmbeddedGraphDefinition,
  type LinkTypeMenuSize,
  type GraphSimulationSettings,
  type LinkTypePhysicsConfig,
  type ActiveLinkedVisibleNodeCandidate,
  type GroupingRule as EngineGroupingRule
} from "./GraphEngine";
import { O3GraphDependencyWatcher } from "./O3GraphDependencyWatcher";
import { O3GraphState, type O3GraphEmbeddedGraphState, type O3GraphEmbeddedLensState, type O3GraphRuntimeNodeSnapshot } from "./O3GraphState";
import { O3GraphDocumentStore, type O3GraphDocumentWriteReason } from "./O3GraphDocumentStore";
import { ObsidianGraphLinkInputHandler } from "./ObsidianGraphLinkInputHandler";
import { ObsidianGraphLinkMutationHandler } from "./ObsidianGraphLinkMutationHandler";
import { ObsidianGraphNodeOpenHandler } from "./ObsidianGraphNodeOpenHandler";
import { ObsidianGraphRootInputHandler } from "./ObsidianGraphRootInputHandler";
import { ObsidianGraphRootPropertyMutationHandler } from "./ObsidianGraphRootPropertyMutationHandler";
import { ObsidianBaseViewFilterResolver, type BaseViewFilterResult } from "./ObsidianBaseViewFilterResolver";
import type { ExpandedNodeState, GraphViewState } from "./GraphState";
import { O3GraphGroup } from "./O3GraphGroup";
import { O3LinkType } from "./O3LinkType";
import { LinkTypeRegistry } from "./LinkTypeRegistry";
import { CreateLinkTypeModal, type CreateLinkTypePayload } from "./CreateLinkTypeModal";
import type { GraphEvent } from "./GraphEvents";
import { GraphModel, type GraphEdge } from "./GraphModel";
import { extractInternalLinkCandidates, NONE_LINK_TYPE, resolveWikiLinkArray } from "./linkResolver";
import { StateManager } from "./StateManager";
import {
  DEFAULT_GRAPH_PROPERTY_KEYS,
  type GraphPropertyKeys,
  normalizeGraphPropertyKeys,
  readFrontmatterProperty,
  readFrontmatterPropertyByKey,
  writeFrontmatterProperty,
  hasFrontmatterProperty
} from "./GraphPropertyKeys";
import {
  DEFAULT_NOTE_TYPE_IDENTIFIERS,
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

export const BASES_GRAPH_VIEW = "nosygraph-view";
const DEFAULT_GRAPH_SETTINGS: GraphSimulationSettings = {
  repulsionStrength: 4000,
  centerStrength: 0,
  nodeRadius: 6,
  nodeConnectionSizeMultiplier: 1,
  nearRestVelocityThreshold: 0.08,
  restVelocityThreshold: 0.015,
  textFadeThreshold: 97
};
const DEFAULT_LAYOUT_ID = FORCE_GRAPH_LAYOUT_ID;
const DEFAULT_NODE_DRAG_HOLD_DURATION_MS = 180;
const DEFAULT_LINK_TYPE_MENU_SIZE: LinkTypeMenuSize = { width: 260, height: 360 };

export interface GraphImageExportRequest {
  area: GraphImageExportArea;
  outputPath: string;
  backgroundColor?: string | null;
}

interface GroupRule {
  property: string;
  operator: "equals" | "contains" | "exists";
  value?: string;
  color: string;
  colorExplicit?: boolean;
  icon?: string;
  iconSourcePath?: string;
}

export class BasesGraphView extends FileView {

  private engine: GraphEngine;
  private initialized = false;
  private isInitializing = false;
  private errorEl: HTMLDivElement | null = null;
  private viewContainer: HTMLElement;
  private shellContainer: HTMLElement | null = null;
  private rootControlsEl: HTMLElement | null = null;
  private rootInputEl: HTMLInputElement | null = null;
  private rootListEl: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private filePath: string | null = null;
  private isFileMode = false;
  private fileModeRootFiles: TFile[] = [];
  private fileModeFilterFiles: TFile[] = [];
  private fileModeActiveLinkTypeFiles: TFile[] = [];
  private fileModeActiveOverlayLinkTypeFiles: TFile[] = [];
  private fileModeActiveGroupFiles: TFile[] = [];
  private connectedBaseFilterResult: BaseViewFilterResult | null = null;
  private lastConnectedBaseFilterMessage: string | null = null;
  private graphState: O3GraphState | null = null;
  private graphDocumentStore: O3GraphDocumentStore | null = null;
  private embeddedGraphStates = new Map<string, O3GraphState>();
  private embeddedGraphDocumentStores = new Map<string, O3GraphDocumentStore>();
  private linkTypeRegistry: Map<string, O3LinkType> = new Map();
  private globalLinkTypeRegistry: LinkTypeRegistry;
  private baseViewFilterResolver: ObsidianBaseViewFilterResolver;
  private activeLinkTypes: O3LinkType[] = [];
  private activeOverlayLinkTypes: O3LinkType[] = [];
  private visibleLinkTypes: string[] = [];
  private availableLinkTypes: O3LinkType[] = [];
  private discoveredProperties: string[] = [];
  private sourceLinkProperties: string[] = [];
  private activeRootNodeProperties: string[] = [];
  private currentGraphFiles: TFile[] = [];
  private groupRegistry: Map<string, O3GraphGroup> = new Map();
  private activeGroups: O3GraphGroup[] = [];
  private dependencyWatcher = new O3GraphDependencyWatcher();
  // GraphModel will later support incremental updates
  // (node metadata updates, edge updates, grouping updates)
  // to avoid full rebuildGraph() calls.
  private graphModel = new GraphModel();
  private configData: Record<string, unknown> = {};
  private config = {
    get: (key: string) => this.configData[key],
    set: (key: string, value: unknown) => {
      this.configData[key] = value;
      this.persistConfigStore();
    }
  };
  private selectedLinkTypes: string[] = [];
  private linkTypeSemantics: Record<string, "link" | "parent"> = {};
  private linkTypePhysics: Record<string, LinkTypePhysicsConfig> = {};
  private groupingRules: GroupRule[] = [];
  private availableGroupingProperties: string[] = [];
  private nodeMetadataCache = new Map<string, Record<string, unknown>>();
  private pendingMetadataDiffSnapshots = new Map<string, Record<string, unknown>>();
  private nodeLinkCache = new Map<string, string[]>();
  private activeRelevantProperties: Set<string> = new Set();
  private expandedParents: ExpandedNodeState[] = [];
  private viewStateModel: GraphViewState = StateManager.createDefaultState();
  private graphStateWriteSkippedForEmptySnapshot = false;
  private graphSettings: GraphSimulationSettings;
  private layoutId = DEFAULT_LAYOUT_ID;
  private linkTypeMenuSize: LinkTypeMenuSize = { ...DEFAULT_LINK_TYPE_MENU_SIZE };
  private nodeDragHoldDurationMs = DEFAULT_NODE_DRAG_HOLD_DURATION_MS;
  private hideNodesWithoutSelectedLinkTypes = false;
  private nodeLimit = 200;
  private persistenceKey: string | null;
  private linkTypePersistTimer: number | null = null;
  private lastPersistedLinkTypeSignature = "";
  private lastPersistedLinkTypeSemanticsSignature = "";
  private lastPersistedLinkTypePhysicsSignature = "";
  private lastPersistedExpandedParentsSignature = "";
  private lastPersistedGraphSettingsSignature = "";
  private lastPersistedHideNodesSignature = "";
  private hasRuntimeLinkTypeChanges = false;
  private hasRuntimeLinkTypeSemanticChanges = false;
  private hasRuntimeLinkTypePhysicsChanges = false;
  private hasRuntimeExpandedParentChanges = false;
  private hasRuntimeGraphSettingsChanges = false;
  private hasRuntimeHideNodesSettingChanges = false;
  private hasHydratedPersistedState = false;
  private viewportPersistTimer: number | null = null;
  private viewportPersistDelayMs = 250;
  private suppressGraphFileReloadUntil = 0;
  private suppressEmbeddedGraphReloadUntil = new Map<string, number>();
  private suppressMutationMetadataUntil = new Map<string, number>();
  private embeddedGraphRefreshTimers = new Map<string, number>();
  private graphTruthReconciliationTimer: number | null = null;
  private isHydratingGraphRuntime = false;
  private isClosingOrUnloadingGraphView = false;
  private hasCompletedInitialGraphRuntimeHydration = false;
  private hasRegisteredMarkdownSwitchAction = false;
  private debugEnabled = false;
  private sourceDebugEnabled = true;
  private metadataDebounceTimers = new Map<string, number>();
  private metadataDebounceDelay = 200;
  private hasMigratedLegacyLinkTypeMode = false;
  private pendingReloadAfterInitialize = false;
  private graphHydrationTimer: number | null = null;
  private graphHydrationToken = 0;
  private readonly graphStartupHydrationDelayMs = 450;
  private graphOpenRetryTimer: number | null = null;
  private graphOpenRetryCount = 0;
  private headerMenuTarget: HTMLElement | null = null;
  private onHeaderMenuClickBound = (event: MouseEvent) => this.onHeaderMenuClick(event);
  private onHeaderMenuContextMenuBound = (event: MouseEvent) => this.onHeaderMenuClick(event);
  private onBeforeUnloadBound = () => {
    this.isClosingOrUnloadingGraphView = true;
    this.cancelPendingViewportStateWrite();
    this.persistLinkTypesToConfig(true);
    this.persistLinkTypeSemanticsToConfig(true);
    this.persistLinkTypePhysicsToConfig(true);
    this.persistExpandedParentsToConfig(true);
    this.persistGraphSettingsToConfig(true);
  };
  private onSwitchToMarkdownActionBound = () => {
    void this.switchToMarkdownView();
  };
  private onGraphDragOverBound = (event: DragEvent) => this.onGraphDragOver(event);
  private onGraphDropBound = (event: DragEvent) => {
    void this.onGraphDrop(event);
  };

  constructor(
    leaf: WorkspaceLeaf,
    private defaultNodeDragHoldDurationMs = DEFAULT_NODE_DRAG_HOLD_DURATION_MS,
    private defaultNodeLimit = 200,
    private defaultSourceLimit = 5000,
    private defaultRootNodeProperties: string[] = [],
    private defaultActiveGroups: string[] = [],
    private defaultVisibleLinkTypes: string[] = [],
    private defaultAutoExpandDroppedLinkTypes = true,
    private linkTypeFolder = "O3/LinkTypes",
    private rootNodeRingColor = "#6eaaff",
    private activeNodeRingColor = "#ff6b6b",
    private nearestActiveLinkedNodeIndicatorEnabled = true,
    private nearestActiveLinkedNodeIndicatorColor = "#7aa2ff",
    private nearestActiveLinkedNodeIndicatorOpacityPercent = 45,
    private nearestActiveLinkedNodeMaxHops = 8,
    private nearestActiveLinkedNodeMaxVisited = 1000,
    private showAllLinkTypeBadgesKey = "b",
    private freezeGraphKey = "f",
    private subnodeOpacityPercent = 78,
    private iconOpacityPercent = 100,
    private graphPropertyKeys: GraphPropertyKeys = DEFAULT_GRAPH_PROPERTY_KEYS,
    private noteTypeIdentifiers: NoteTypeIdentifierSettings = DEFAULT_NOTE_TYPE_IDENTIFIERS,
    private linkTypePropertyKeys: LinkTypePropertyKeys = DEFAULT_LINK_TYPE_PROPERTY_KEYS,
    private groupPropertyKeys: GroupPropertyKeys = DEFAULT_GROUP_PROPERTY_KEYS,
    private onGraphNodeLinksCopied?: (paths: string[], clipboardText: string) => void
  ) {
    super(leaf);
    this.graphPropertyKeys = normalizeGraphPropertyKeys(this.graphPropertyKeys);
    this.noteTypeIdentifiers = normalizeNoteTypeIdentifiers(this.noteTypeIdentifiers);
    this.linkTypePropertyKeys = normalizeLinkTypePropertyKeys(this.linkTypePropertyKeys);
    this.groupPropertyKeys = normalizeGroupPropertyKeys(this.groupPropertyKeys);
    // Mark this as a navigable file-backed view so workspace file context follows this leaf.
    this.navigation = true;
    this.viewContainer = this.containerEl.createDiv();
    this.loadConfigStore();
    this.persistenceKey = this.resolvePersistenceKey();
    this.viewStateModel = StateManager.cloneState(this.readAllPersistedGraphState());
    this.selectedLinkTypes = [...this.viewStateModel.activeLinkTypes];
    this.layoutId = this.normalizeLayoutId(this.viewStateModel.graphSettings?.layoutId);
    this.linkTypeSemantics = this.buildLinkTypeSemanticsFromConfig(this.viewStateModel.linkTypeConfig);
    this.linkTypePhysics = this.buildLinkTypePhysicsFromConfig(this.viewStateModel.linkTypeConfig);
    this.expandedParents = this.normalizeExpandedParentsState(this.viewStateModel.expandedParents);
    this.lastPersistedLinkTypeSignature = this.buildLinkTypeSignature(this.selectedLinkTypes);
    this.lastPersistedLinkTypeSemanticsSignature = this.buildLinkTypeConfigSignature(this.viewStateModel.linkTypeConfig);
    this.lastPersistedLinkTypePhysicsSignature = this.buildLinkTypeConfigSignature(this.viewStateModel.linkTypeConfig);
    this.lastPersistedExpandedParentsSignature = this.buildExpandedParentsSignature(this.expandedParents);
    this.updateRelevantProperties();
    this.debug("constructor:init", {
      persistenceKey: this.persistenceKey,
      selectedLinkTypes: this.selectedLinkTypes,
      selectedSignature: this.lastPersistedLinkTypeSignature
    });
    this.graphSettings = this.readGraphSettingsFromConfig();
    this.nodeDragHoldDurationMs = this.readNodeDragHoldDurationFromConfig();
    this.layoutId = this.readLayoutIdFromConfig();
    this.hideNodesWithoutSelectedLinkTypes = this.readHideNodesWithoutSelectedLinkTypesFromConfig();
    this.lastPersistedGraphSettingsSignature = this.buildGraphSettingsSignature(this.graphSettings);
    this.lastPersistedHideNodesSignature = this.buildHideNodesSignature(this.hideNodesWithoutSelectedLinkTypes);
    this.globalLinkTypeRegistry = new LinkTypeRegistry(this.app, this.linkTypeFolder, this.noteTypeIdentifiers, this.linkTypePropertyKeys);
    this.baseViewFilterResolver = new ObsidianBaseViewFilterResolver(this.app);

    this.engine = new GraphEngine(this.viewContainer, this.app, {
      hoverParent: this,
      hoverSourcePath: () => this.file?.path ?? "",
      initialSelectedLinkTypes: this.selectedLinkTypes,
      onSelectedLinkTypesChange: (types) => {
        if (this.isFileMode) {
          this.selectedLinkTypes = [];
          this.viewStateModel = { ...this.viewStateModel, activeLinkTypes: [] };
          this.debug("onSelectedLinkTypesChange:file-mode-ignored", {
            requested: types
          });
          return;
        }
        const prev = [...this.selectedLinkTypes];
      this.selectedLinkTypes = [...types];
      this.viewStateModel = { ...this.viewStateModel, activeLinkTypes: [...this.selectedLinkTypes] };
      this.updateRelevantProperties();
      this.hasRuntimeLinkTypeChanges = true;
      this.debug("onSelectedLinkTypesChange", {
        prev,
        next: this.selectedLinkTypes
        });
        this.persistLinkTypesToConfig();
        this.persistStateToLocalStorage();
      },
      onLinkTypeSemanticsChange: (semantics) => {
        this.linkTypeSemantics = this.normalizeLinkTypeSemanticsRecord(semantics);
        this.syncLinkTypeConfigFromLegacyMaps();
        this.hasRuntimeLinkTypeSemanticChanges = true;
        this.persistStateToLocalStorage();
        this.persistLinkTypeSemanticsToConfig();
        this.engine.refreshBadges();
      },
      onLinkTypePhysicsChange: (physics) => {
        this.linkTypePhysics = this.normalizeLinkTypePhysicsRecord(physics);
        this.syncLinkTypeConfigFromLegacyMaps();
        this.hasRuntimeLinkTypePhysicsChanges = true;
        this.persistStateToLocalStorage();
        this.persistLinkTypePhysicsToConfig();
      },
      initialGroupingRules: this.groupingRules,
      initialGroupingProperties: this.availableGroupingProperties,
      onGroupingRulesChange: (rules: EngineGroupingRule[]) => {
        this.groupingRules = this.normalizeGroupingRules(rules);
        this.updateRelevantProperties();
        this.persistStateToLocalStorage();
      },
      groupingEvaluator: (nodePath) => this.evaluateGrouping(nodePath),
      groupingStyleEvaluator: (nodePath) => this.evaluateGroupingStyle(nodePath),
      onParentExpansionRequested: (payload) => {
        const sourceOrigin = String(payload.sourcePath ?? "").trim() || String(payload.sourceNodeId ?? "").trim();
        const runtimeOrigin = String(payload.sourceNodeId ?? "").trim() || sourceOrigin;
        const ownerGraphPath = String(payload.ownerGraphPath ?? "").trim();
        if (this.engine.isParentExpansionActive(runtimeOrigin, payload.parentLinkType)) {
          this.engine.collapseParentLinks(runtimeOrigin, payload.parentLinkType);
          if (!ownerGraphPath) {
            this.setExpandedParentVisibility(sourceOrigin, payload.parentLinkType, false);
          }
        } else {
          this.engine.lockNode(runtimeOrigin);
          const expanded = this.engine.expandParentLinks(runtimeOrigin, payload.parentLinkType);
          if (!ownerGraphPath) {
            this.setExpandedParentVisibility(sourceOrigin, payload.parentLinkType, expanded);
          }
          if (expanded) {
            if (!ownerGraphPath) {
              this.restoreSubtreeExpansion(sourceOrigin, payload.parentLinkType);
            }
            this.engine.reheatSimulation(0.15, "parent expansion");
          }
          this.engine.scheduleUnlock(runtimeOrigin);
        }
        if (ownerGraphPath) {
          void this.persistEmbeddedGraphRuntime(ownerGraphPath, payload.ownerInstanceId);
        } else {
          void this.writeGraphState("badge-expansion");
        }
        this.debug("onParentExpansionRequested", payload);
      },
      initialSettings: this.graphSettings,
      initialLayoutId: this.layoutId,
      layoutOptions: this.getLayoutOptions(),
      onLayoutChange: (layoutId) => {
        const normalized = this.normalizeLayoutId(layoutId);
        if (normalized === this.layoutId) return;
        this.layoutId = normalized;
        this.hasRuntimeGraphSettingsChanges = true;
        this.persistGraphSettingsToConfig();
      },
      nodeDragHoldDurationMs: this.nodeDragHoldDurationMs,
      initialHideNodesWithoutSelectedLinkTypes: this.hideNodesWithoutSelectedLinkTypes,
      onHideNodesWithoutSelectedLinkTypesChange: (enabled) => {
        this.hideNodesWithoutSelectedLinkTypes = Boolean(enabled);
        this.hasRuntimeHideNodesSettingChanges = true;
        this.persistGraphSettingsToConfig();
      },
      onSettingsChange: (settings) => {
        void this.handleGraphSettingsChanged(settings);
      },
      onGraphLinkBadgeDrop: async (request) => {
        return new ObsidianGraphLinkMutationHandler(this.app).applyBadgeDrop(request);
      },
      shouldAutoExpandDroppedLinkTypes: () => this.shouldAutoExpandDroppedLinkTypes(),
      onGraphLinkInputRequested: async (request) => {
        const result = await new ObsidianGraphLinkInputHandler(this.app).requestLinkInput(request);
        const ownerPath = String(request.graphCapableOwnerPath ?? this.file?.path ?? "").trim();
        const selectedFiles = (result.selected ?? [])
          .map((path) => this.app.vault.getAbstractFileByPath(path))
          .filter((file): file is TFile => file instanceof TFile);
        const ownerFile = this.app.vault.getAbstractFileByPath(ownerPath);
        if (ownerFile instanceof TFile && selectedFiles.length > 0) {
          const rootResult = await new ObsidianGraphRootPropertyMutationHandler(this.app).addFilesToReferenceProperty({
            ownerPath: ownerFile.path,
            referencePath: request.target.path,
            files: selectedFiles,
            propertyNames: this.getRootNodePropertyNamesForFile(ownerFile)
          });
          if (rootResult.added > 0) {
            this.embeddedGraphStates.delete(ownerFile.path);
            this.embeddedGraphDocumentStores.delete(ownerFile.path);
            window.setTimeout(() => { void this.reloadFromFile(); }, 0);
          }
        }
        return result;
      },
      onNodeOpen: (request) => {
        return new ObsidianGraphNodeOpenHandler(this.app).openNode(request);
      },
      onCopySelectedNodeLinks: () => {
        return this.copySelectedNodeLinksToClipboard();
      },
      onAddRootNodeRequested: (context) => {
        return this.requestRootNodeInput(context?.ownerPath ?? null);
      },
      isGraphNote: (path) => this.isGraphNotePath(path),
      onEmbeddedGraphExpansionRequested: (payload) => {
        return this.loadEmbeddedGraphDefinition(payload.graphPath, payload.ancestry);
      },
      onEmbeddedGraphExpansionChanged: (originNodeId, graphPath, expanded, ownerGraphPath, lens, parentChain) => {
        void this.handleEmbeddedGraphExpansionChanged(
          originNodeId,
          graphPath,
          expanded,
          ownerGraphPath,
          lens,
          parentChain
        );
      },
      onEmbeddedNodePositionChanged: (payload) => {
        return this.persistEmbeddedGraphRuntime(payload.ownerGraphPath, payload.instanceId);
      },
      onEmbeddedGraphRuntimeChanged: (ownerGraphPath, instanceId) => {
        return this.persistEmbeddedGraphRuntime(ownerGraphPath, instanceId);
      },
      onGraphRuntimeChanged: () => {
        return this.writeGraphState("badge-expansion");
      },
      onEmbeddedRootRemoveRequested: (payload) => {
        return this.removeEmbeddedRootNode(payload.ownerGraphPath, payload.sourcePath);
      },
      onBadgeExpansionToggled: (sourceNodeId, sourcePath, linkType, expanded, expansionId, parentExpansionId) => {
        if (!this.graphState) return;
        const changed = this.graphState.setExpansionStatus(
          sourceNodeId,
          sourcePath,
          linkType,
          expanded,
          parentExpansionId
        );
        if (!changed) return;
        void this.writeGraphState("badge-expansion");
      },
      disableDefaultLinkTypeList: true,
      initialLinkTypeMenuSize: this.linkTypeMenuSize,
      onLinkTypeMenuSizeChange: (size) => {
        this.handleLinkTypeMenuSizeChanged(size);
      },
      initialRootNodeRingColor: this.rootNodeRingColor,
      initialActiveNodeRingColor: this.activeNodeRingColor,
      initialNearestActiveLinkedNodeEnabled: this.nearestActiveLinkedNodeIndicatorEnabled,
      initialNearestActiveLinkedNodeColor: this.nearestActiveLinkedNodeIndicatorColor,
      initialNearestActiveLinkedNodeOpacityPercent: this.nearestActiveLinkedNodeIndicatorOpacityPercent,
      nearestActiveLinkedNodeEvaluator: (activePath, candidates) => this.findNearestActiveLinkedVisibleNode(activePath, candidates),
      initialShowAllLinkTypeBadgesKey: this.showAllLinkTypeBadgesKey,
      initialFreezeGraphKey: this.freezeGraphKey,
      initialSubnodeOpacityPercent: this.subnodeOpacityPercent,
      initialIconOpacityPercent: this.iconOpacityPercent,
      graphPropertyKeys: this.graphPropertyKeys,
      renderLinkTypeMenuExtras: (container) => {
        this.renderLinkTypeMenuSections(container);
      }
    });
    this.engine.onNodePositionChanged = (path, x, y) => {
      void this.handleNodePositionChanged(path, x, y);
    };
    this.engine.onViewportChanged = (viewport, options) => {
      this.handleViewportChanged(viewport, options);
    };
  }

  setRootNodeRingColor(color: string): void {
    const normalized = String(color ?? "").trim();
    if (!normalized) return;
    this.rootNodeRingColor = normalized;
    this.engine.setRootNodeRingColor(normalized);
  }

  setActiveNodeRingColor(color: string): void {
    const normalized = String(color ?? "").trim();
    if (!normalized) return;
    this.activeNodeRingColor = normalized;
    this.engine.setActiveNodeRingColor(normalized);
  }

  setNearestActiveLinkedNodeIndicator(settings: {
    enabled?: boolean;
    color?: string;
    opacityPercent?: number;
    maxHops?: number;
    maxVisited?: number;
  }): void {
    if (typeof settings.enabled === "boolean") {
      this.nearestActiveLinkedNodeIndicatorEnabled = settings.enabled;
    }
    const color = String(settings.color ?? "").trim();
    if (color) {
      this.nearestActiveLinkedNodeIndicatorColor = color;
    }
    const opacity = Number(settings.opacityPercent);
    if (Number.isFinite(opacity)) {
      this.nearestActiveLinkedNodeIndicatorOpacityPercent = Math.max(0, Math.min(100, Math.round(opacity)));
    }
    const maxHops = Number(settings.maxHops);
    if (Number.isFinite(maxHops)) {
      this.nearestActiveLinkedNodeMaxHops = Math.max(1, Math.min(32, Math.round(maxHops)));
    }
    const maxVisited = Number(settings.maxVisited);
    if (Number.isFinite(maxVisited)) {
      this.nearestActiveLinkedNodeMaxVisited = Math.max(50, Math.min(10000, Math.round(maxVisited)));
    }
    this.engine.setNearestActiveLinkedNodeIndicator({
      enabled: this.nearestActiveLinkedNodeIndicatorEnabled,
      color: this.nearestActiveLinkedNodeIndicatorColor,
      opacityPercent: this.nearestActiveLinkedNodeIndicatorOpacityPercent
    });
  }

  setShowAllLinkTypeBadgesKey(key: string): void {
    const normalized = String(key ?? "").trim().toLowerCase();
    if (!normalized) return;
    this.showAllLinkTypeBadgesKey = normalized;
    this.engine.setShowAllLinkTypeBadgesKey(normalized);
  }

  setFreezeGraphKey(key: string): void {
    const normalized = String(key ?? "").trim().toLowerCase();
    if (!normalized) return;
    this.freezeGraphKey = normalized;
    this.engine.setFreezeGraphKey(normalized);
  }

  setGraphPropertyKeys(keys: Partial<GraphPropertyKeys>): void {
    this.graphPropertyKeys = normalizeGraphPropertyKeys(keys);
    this.engine.setGraphPropertyKeys(this.graphPropertyKeys);
    this.updateRelevantProperties();
    if (this.file && this.graphDocumentStore) {
      this.graphDocumentStore = new O3GraphDocumentStore(this.app, this.file, this.graphPropertyKeys);
    }
  }

  setGraphCapableNoteDefaults(
    rootNodeProperties: string[],
    activeGroups: string[],
    visibleLinkTypes: string[]
  ): void {
    this.defaultRootNodeProperties = Array.from(new Set((rootNodeProperties ?? []).map((value) => String(value ?? "").trim()).filter(Boolean)));
    this.defaultActiveGroups = Array.from(new Set((activeGroups ?? []).map((value) => String(value ?? "").trim()).filter(Boolean)));
    this.defaultVisibleLinkTypes = Array.from(new Set((visibleLinkTypes ?? []).map((value) => String(value ?? "").trim()).filter(Boolean)));
    this.updateRelevantProperties();
    if (this.file) {
      void this.reloadFromFile();
    }
  }

  setDefaultAutoExpandDroppedLinkTypes(enabled: boolean): void {
    this.defaultAutoExpandDroppedLinkTypes = Boolean(enabled);
  }

  setNoteTypeIdentifiers(identifiers: Partial<NoteTypeIdentifierSettings>): void {
    this.noteTypeIdentifiers = normalizeNoteTypeIdentifiers(identifiers);
    this.globalLinkTypeRegistry.setIdentifiers(this.noteTypeIdentifiers);
    void this.reloadFromFile();
  }

  setNoteTypePropertyKeys(
    linkTypeKeys: Partial<LinkTypePropertyKeys>,
    groupKeys: Partial<GroupPropertyKeys>
  ): void {
    this.linkTypePropertyKeys = normalizeLinkTypePropertyKeys(linkTypeKeys);
    this.groupPropertyKeys = normalizeGroupPropertyKeys(groupKeys);
    this.globalLinkTypeRegistry.setPropertyKeys(this.linkTypePropertyKeys);
    void this.reloadFromFile();
  }

  setSubnodeOpacityPercent(percent: number): void {
    const parsed = Number(percent);
    this.subnodeOpacityPercent = Number.isFinite(parsed)
      ? Math.max(0, Math.min(100, Math.round(parsed)))
      : 78;
    this.engine.setSubnodeOpacityPercent(this.subnodeOpacityPercent);
  }

  setIconOpacityPercent(percent: number): void {
    const parsed = Number(percent);
    this.iconOpacityPercent = Number.isFinite(parsed)
      ? Math.max(0, Math.min(100, Math.round(parsed)))
      : 100;
    this.engine.setIconOpacityPercent(this.iconOpacityPercent);
  }

  async copySelectedNodeLinksToClipboard(): Promise<number> {
    const paths = this.engine.getSelectedNodePaths();
    const links = paths
      .map((path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
          return this.app.fileManager.generateMarkdownLink(file, this.file?.path ?? "");
        }
        return `[[${String(path ?? "").replace(/\.md$/i, "")}]]`;
      })
      .filter((link) => link.trim().length > 0);
    if (links.length === 0) {
      new Notice("No graph nodes selected.");
      return 0;
    }
    const clipboardText = links.join("\n");
    await navigator.clipboard.writeText(clipboardText);
    this.onGraphNodeLinksCopied?.(paths, clipboardText);
    new Notice(links.length === 1 ? "Copied graph node link." : `Copied ${links.length} graph node links.`);
    return links.length;
  }

  refreshAfterExternalFrontmatterMutation(filePath: string): void {
    const normalizedPath = String(filePath ?? "").trim();
    if (!normalizedPath || (!this.file || this.file.path !== normalizedPath) && !this.embeddedGraphStates.has(normalizedPath)) {
      return;
    }
    window.setTimeout(() => { void this.reloadFromFile(); }, 0);
  }

  selectAllGraphNodes(): number {
    return this.engine.selectAllNodes();
  }

  getViewType(): string {
    return BASES_GRAPH_VIEW;
  }

  getDisplayText(): string {
    return this.file?.basename ?? super.getDisplayText();
  }

  getIcon(): string {
    return "share-2";
  }

  canAcceptExtension(extension: string): boolean {
    return String(extension ?? "").trim().toLowerCase() === "md";
  }

  getState() {
    const baseState = (super.getState?.() ?? {}) as Record<string, unknown>;
    const boundFilePath = this.file?.path ?? this.filePath ?? null;
    return {
      ...baseState,
      file: boundFilePath
    };
  }

  getFile(): TFile | null {
    return this.file;
  }

  async setState(state: unknown, result: ViewStateResult) {
    const inputState = state && typeof state === "object"
      ? state as Record<string, unknown>
      : {};
    const nextFilePath = String(inputState.file ?? inputState.filePath ?? "").trim();
    const previousFilePath = this.file?.path ?? this.filePath ?? "";
    const resolvedFilePath = nextFilePath || previousFilePath;
    const normalizedState = {
      ...inputState,
      ...(resolvedFilePath ? { file: resolvedFilePath } : {})
    };

    const previousLoadedPath = this.file?.path ?? "";
    await super.setState(normalizedState, result);
    const loadedByBaseFileView = Boolean(resolvedFilePath && this.file?.path === resolvedFilePath && previousLoadedPath !== this.file.path);
    this.filePath = resolvedFilePath || null;
    if (resolvedFilePath) {
      const abstractFile = this.app.vault.getAbstractFileByPath(resolvedFilePath);
      this.file = abstractFile instanceof TFile ? abstractFile : null;
    } else {
      this.file = null;
    }

    this.refreshLeafHeader();

    if (this.file && !loadedByBaseFileView) {
      if (this.initialized) {
        this.scheduleGraphHydration("set-state");
      } else {
        this.pendingReloadAfterInitialize = true;
      }
    }
  }

  async onLoadFile(file: TFile): Promise<void> {
    this.file = file;
    this.filePath = file.path;
    this.refreshLeafHeader();
    if (this.initialized) {
      this.scheduleGraphHydration("load-file");
    } else {
      this.pendingReloadAfterInitialize = true;
    }
  }

  async onUnloadFile(file: TFile): Promise<void> {
    if (this.file?.path === file.path) {
      this.isClosingOrUnloadingGraphView = true;
      this.cancelPendingViewportStateWrite();
      this.filePath = file.path;
    }
  }

  async onRename(file: TFile): Promise<void> {
    if (!this.file || this.file.path !== file.path) return;
    this.file = file;
    this.filePath = file.path;
    this.refreshLeafHeader();
    if (this.initialized) {
      this.scheduleGraphHydration("rename", 150);
    }
  }

  async onOpen(): Promise<void> {
    this.isClosingOrUnloadingGraphView = false;
    if (!this.hasRegisteredMarkdownSwitchAction) {
      this.addAction("document", "Open as Markdown", this.onSwitchToMarkdownActionBound);
      this.hasRegisteredMarkdownSwitchAction = true;
    }
    await this.loadLinkTypeRegistry();
    this.mountViewShell();
    this.installHeaderFileMenuHandlers();
    this.attachResizeObserver();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        this.initializeGraphAfterLayout();
      });
    });
  }

  async onClose(): Promise<void> {
    this.isClosingOrUnloadingGraphView = true;
    for (const timer of this.metadataDebounceTimers.values()) {
      window.clearTimeout(timer);
    }
    this.metadataDebounceTimers.clear();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.viewportPersistTimer !== null) {
      window.clearTimeout(this.viewportPersistTimer);
      this.viewportPersistTimer = null;
    }
    if (this.graphOpenRetryTimer !== null) {
      window.clearTimeout(this.graphOpenRetryTimer);
      this.graphOpenRetryTimer = null;
    }
    if (this.graphTruthReconciliationTimer !== null) {
      window.clearTimeout(this.graphTruthReconciliationTimer);
      this.graphTruthReconciliationTimer = null;
    }
    this.viewContainer.removeEventListener("dragover", this.onGraphDragOverBound);
    this.viewContainer.removeEventListener("drop", this.onGraphDropBound);
    this.uninstallHeaderFileMenuHandlers();
  }

  onDataUpdated() {
    this.rebuildGraph();
  }

  private rebuildGraph(explicitFiles?: TFile[]): void {

    if (!this.initialized) return;

    try {
      this.debug("onDataUpdated:start", {
        persistenceKey: this.persistenceKey,
        hasRuntimeLinkTypeChanges: this.hasRuntimeLinkTypeChanges,
        rootNodesCount: this.viewStateModel.rootNodes.length
      });
      if (!this.isFileMode) {
        this.tryHydratePersistedState();
      }
      if (this.isFileMode) {
        const activeProperties = this.activeLinkTypes
          .map((lt) => String(lt.property ?? "").trim().toLowerCase())
          .filter(Boolean);
        this.selectedLinkTypes = [...activeProperties];
        this.engine.setSelectedLinkTypes(activeProperties);
      }
      this.engine.setActiveLinkTypes(this.getAllRuntimeLinkTypeDefinitions());
      this.updateRelevantProperties();
      const graphFiles = this.isFileMode
        ? [...(explicitFiles ?? this.currentGraphFiles)]
        : this.resolveRootNodeFiles();
      const linkTypeSourceFiles = graphFiles;
      this.refreshGroupingMetadataCache(graphFiles);
      this.refreshNodeLinkCache(graphFiles);
      this.engine.setGroupingPropertyOptions(this.availableGroupingProperties);

      const modelNodes = graphFiles.map((file) => ({
        id: file.path,
        path: file.path,
        metadata: this.nodeMetadataCache.get(file.path) ?? {}
      }));
      this.graphModel.setNodes(modelNodes);
      // GraphModel will later support incremental updates
      // (node metadata updates, edge updates, grouping updates)
      // to avoid full rebuildGraph() calls.
      // Edges are still derived inside GraphEngine for now.
      this.graphModel.setEdges([]);

      const labels = this.buildNodeLabelsFromFiles(graphFiles);
      const modelData = this.graphModel.getNodes();
      const visibleLinkTypeDefinitions = this.getVisibleLinkTypeDefinitions();
      this.engine.updateGraph(graphFiles, {
        labels,
        linkTypeSourceFiles,
        rootFilePaths: this.isFileMode ? this.fileModeRootFiles.map((file) => file.path) : graphFiles.map((file) => file.path),
        filterFilePaths: this.isFileMode ? this.fileModeFilterFiles.map((file) => file.path) : [],
        filterId: this.connectedBaseFilterResult?.filterId ?? null,
        overlayLinkTypes: this.activeOverlayLinkTypes.map((lt) => String(lt.property ?? "").trim().toLowerCase()).filter(Boolean),
        visibleLinkTypes: this.visibleLinkTypes,
        visibleLinkTypeDefinitions: visibleLinkTypeDefinitions,
        visibleLinkTypeLineStyle: this.readGraphLineStyleFromFrontmatter("visibleLinkTypeLineStyle", "dashed"),
        discoveredLinkLineStyle: this.readGraphLineStyleFromFrontmatter("discoveredLinkLineStyle", "normal"),
        graphBackgroundColor: this.readGraphBackgroundColorFromFrontmatter(),
        showNodeIcons: this.readGraphBooleanFromFrontmatter("showNodeIcons", true),
        disableLinkTypeDiscovery: this.isFileMode,
        graphState: this.graphState?.state ?? null,
        debugMeta: {
          graphModelNodesCount: modelData.length,
          graphFilesCount: graphFiles.length,
          rootNodesCount: this.viewStateModel.rootNodes.length,
          filteredNodesCount: this.fileModeFilterFiles.length,
          overlayLinkTypesCount: this.activeOverlayLinkTypes.length,
          visibleLinkTypesCount: this.visibleLinkTypes.length,
          connectedBaseFilter: this.connectedBaseFilterResult?.filterId ?? null,
          connectedBaseFilterSource: this.connectedBaseFilterResult?.source ?? "none"
        }
      });
      this.engine.setGroupingRules(this.groupingRules);
      this.replayPersistedBadgeExpansions();
      this.highlightActiveNode(this.app.workspace.getActiveFile()?.path ?? null);
      this.replayExpandedParents();
      this.engine.reconcileEmbeddedGraphContainersAfterTopologyUpdate();
      this.scheduleNoteTruthReconciliation();
      this.debug("onDataUpdated:end", {
        fileCount: graphFiles.length,
        selectedLinkTypes: this.selectedLinkTypes
      });
    } catch (error) {
      this.renderError(this.viewContainer, error);
    }
  }

  onunload() {
    this.isClosingOrUnloadingGraphView = true;
    this.debug("onunload", {
      selectedLinkTypes: this.selectedLinkTypes
    });
    this.persistLinkTypesToConfig(true);
    this.persistStateToLocalStorage();
    this.persistLinkTypeSemanticsToConfig(true);
    this.persistLinkTypePhysicsToConfig(true);
    this.persistExpandedParentsToConfig(true);
    this.persistGraphSettingsToConfig(true);
    this.cancelPendingViewportStateWrite();
    window.removeEventListener("beforeunload", this.onBeforeUnloadBound);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    for (const timer of this.metadataDebounceTimers.values()) {
      window.clearTimeout(timer);
    }
    this.metadataDebounceTimers.clear();
    for (const timer of this.embeddedGraphRefreshTimers.values()) {
      window.clearTimeout(timer);
    }
    this.embeddedGraphRefreshTimers.clear();
    if (this.graphHydrationTimer !== null) {
      window.clearTimeout(this.graphHydrationTimer);
      this.graphHydrationTimer = null;
    }
    if (this.graphTruthReconciliationTimer !== null) {
      window.clearTimeout(this.graphTruthReconciliationTimer);
      this.graphTruthReconciliationTimer = null;
    }
    this.graphHydrationToken += 1;
    this.engine.destroy();
  }

  private highlightActiveNode(path: string | null): void {
    this.engine.updateNodeHighlightOnly(path);
  }

  private initializeGraph(): void {
    if (this.isInitializing || this.initialized) return;
    this.isInitializing = true;

    try {
      this.engine.init();
      this.registerLifecycleEventHandlers();
      this.highlightActiveNode(this.app.workspace.getActiveFile()?.path ?? null);
      window.addEventListener("beforeunload", this.onBeforeUnloadBound);
      this.initialized = true;
    } catch (error) {
      this.renderError(this.viewContainer, error);
    } finally {
      this.isInitializing = false;
    }
  }

  private initializeGraphAfterLayout(): void {
    if (!this.viewContainer.isConnected) return;

    const width = this.viewContainer.clientWidth;
    const height = this.viewContainer.clientHeight;
    if (!width || !height) {
      window.requestAnimationFrame(() => this.initializeGraphAfterLayout());
      return;
    }

    this.initializeGraph();
    this.engine.initializeSize();
    if (this.file) {
      this.scheduleGraphHydration("initialize");
      return;
    }
    this.rebuildGraph();
  }

  private scheduleGraphHydration(reason: string, delayMs = this.graphStartupHydrationDelayMs): void {
    if (!this.file) return;
    this.pendingReloadAfterInitialize = true;
    this.hasCompletedInitialGraphRuntimeHydration = false;
    if (this.graphHydrationTimer !== null) {
      window.clearTimeout(this.graphHydrationTimer);
    }
    const token = ++this.graphHydrationToken;
    this.graphHydrationTimer = window.setTimeout(() => {
      this.graphHydrationTimer = null;
      void this.runDeferredGraphHydration(token, reason);
    }, Math.max(0, delayMs));
  }

  private async runDeferredGraphHydration(token: number, _reason: string): Promise<void> {
    try {
      if (!this.file) return;
      if (!this.initialized) {
        this.pendingReloadAfterInitialize = true;
        return;
      }

      await this.waitForWorkspaceLayoutReady();
      if (!this.isCurrentGraphHydration(token)) return;

      await this.waitForGraphViewLayout(token);
      if (!this.isCurrentGraphHydration(token)) return;

      await this.waitForGraphFileMetadata(token);
      if (!this.isCurrentGraphHydration(token)) return;

      await this.delay(250);
      if (!this.isCurrentGraphHydration(token)) return;

      this.pendingReloadAfterInitialize = false;
      await this.reloadFromFile();
    } catch (error) {
      this.renderError(this.viewContainer, error);
    }
  }

  private isCurrentGraphHydration(token: number): boolean {
    return token === this.graphHydrationToken && Boolean(this.file);
  }

  private waitForWorkspaceLayoutReady(): Promise<void> {
    return new Promise((resolve) => {
      this.app.workspace.onLayoutReady(() => resolve());
    });
  }

  private async waitForGraphViewLayout(token: number): Promise<void> {
    for (let attempt = 0; attempt < 30; attempt++) {
      if (!this.isCurrentGraphHydration(token)) return;
      await this.nextAnimationFrame();
      await this.nextAnimationFrame();
      if (this.viewContainer.isConnected && this.viewContainer.clientWidth > 0 && this.viewContainer.clientHeight > 0) {
        this.engine.initializeSize();
        return;
      }
    }
  }

  private async waitForGraphFileMetadata(token: number): Promise<void> {
    const file = this.file;
    if (!file) return;
    if (this.app.metadataCache.getFileCache(file)) return;

    await new Promise<void>((resolve) => {
      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        window.clearTimeout(timeout);
        this.app.metadataCache.offref(ref);
        resolve();
      };
      const timeout = window.setTimeout(finish, 1500);
      const ref = this.app.metadataCache.on("resolved", () => {
        if (!this.isCurrentGraphHydration(token)) {
          finish();
          return;
        }
        if (this.file && this.app.metadataCache.getFileCache(this.file)) {
          finish();
        }
      });
    });
  }

  private nextAnimationFrame(): Promise<void> {
    return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms)));
  }

  private attachResizeObserver(): void {
    if (this.resizeObserver || typeof ResizeObserver === "undefined") return;

    this.resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      if (rect.width <= 0 || rect.height <= 0) return;
      if (!this.initialized) return;
      this.engine.handleResize(rect.width, rect.height);
    });

    this.resizeObserver.observe(this.viewContainer);
  }

  private async reloadFromFileWhenReady(): Promise<void> {
    // O3 mode temporarily disabled until file-backed refactor
    if (!this.file) return;

    await new Promise<void>((resolve) => {
      this.app.workspace.onLayoutReady(() => resolve());
    });

    await new Promise<void>((resolve) => {
      if (!this.file) {
        resolve();
        return;
      }

      if (this.app.metadataCache.getFileCache(this.file)) {
        resolve();
        return;
      }

      const ref = this.app.metadataCache.on("resolved", () => {
        this.app.metadataCache.offref(ref);
        resolve();
      });
    });

    await this.reloadFromFile();
  }

  private async loadLinkTypeRegistry(): Promise<void> {
    this.linkTypeRegistry.clear();
    await this.globalLinkTypeRegistry.load();
    if (!this.hasMigratedLegacyLinkTypeMode) {
      await this.migrateLegacyLinkTypesToForceBased();
      await this.globalLinkTypeRegistry.load();
      this.hasMigratedLegacyLinkTypeMode = true;
    }
    for (const linkType of this.globalLinkTypeRegistry.getAll()) {
      this.linkTypeRegistry.set(linkType.file.path, linkType);
    }

  }

  private async migrateLegacyLinkTypesToForceBased(): Promise<void> {
    const linkTypes = this.globalLinkTypeRegistry.getAll();
    for (const linkType of linkTypes) {
      const file = linkType.file;
      if (!(file instanceof TFile)) continue;

      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter as Record<string, unknown> | undefined;
      if (!frontmatterMatchesIdentifier(fm, this.noteTypeIdentifiers.linkType)) continue;
      const configuredMode = fm ? this.readLinkTypeFrontmatterProperty(fm, "linkType") : undefined;
      if (typeof configuredMode === "string" && configuredMode.trim().length > 0) continue;

      try {
        const content = await this.app.vault.read(file);
        const { frontmatter, body, hasFrontmatter, eol } = this.parseFrontmatter(content);
        this.writeLinkTypeFrontmatterProperty(frontmatter, "linkType", "Force Based");
        if (!Number.isFinite(Number(this.readLinkTypeFrontmatterProperty(frontmatter, "linkForce")))) {
          this.writeLinkTypeFrontmatterProperty(frontmatter, "linkForce", 0.01);
        }
        if (!Number.isFinite(Number(this.readLinkTypeFrontmatterProperty(frontmatter, "linkDistance")))) {
          this.writeLinkTypeFrontmatterProperty(frontmatter, "linkDistance", 120);
        }
        this.deleteLinkTypeFrontmatterProperty(frontmatter, "linkDirection");
        this.deleteLinkTypeFrontmatterProperty(frontmatter, "linkYAxis");
        this.deleteLinkTypeFrontmatterProperty(frontmatter, "linkXAxis");
        const updated = this.serializeFrontmatter(frontmatter, body, { hasFrontmatter, eol });
        if (updated !== content) {
          await this.app.vault.modify(file, updated);
        }
      } catch (error) {
        console.error("[GraphView] Failed to migrate legacy LinkType:", file.path, error);
      }
    }
  }

  private loadGroupRegistry(graphFiles: TFile[] = this.currentGraphFiles, activeGroupValues?: unknown) {
    this.groupRegistry.clear();
    const configuredGroupFolder = this.normalizeFolderPath(String(this.config?.get("groupFolder") ?? ""));
    const discoveredFiles = configuredGroupFolder
      ? this.app.vault
          .getFiles()
          .filter((file) => file instanceof TFile && file.extension === "md")
          .filter((file) => this.isPathInFolder(file.path, configuredGroupFolder))
      : [...graphFiles];
    const files = this.mergeGraphFiles(
      discoveredFiles,
      resolveWikiLinkArray(this.app, activeGroupValues ?? [])
    );

    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (!fm) continue;

      if (frontmatterMatchesIdentifier(fm as Record<string, unknown>, this.noteTypeIdentifiers.group)) {
        const group = new O3GraphGroup(file, fm, this.groupPropertyKeys);
        this.groupRegistry.set(file.path, group);
      }
    }

  }

  private async loadGraphFile(): Promise<Record<string, unknown>> {
    if (!this.file) return {};

    const fm = await this.readGraphFrontmatterFromDisk(this.file);
    this.isFileMode = this.isGraphFrontmatterExpandable(this.file, fm);

    if (this.isFileMode) {
      const documentStore = new O3GraphDocumentStore(this.app, this.file, this.graphPropertyKeys);
      this.graphDocumentStore = documentStore;
      documentStore.beginHydration();
      try {
        this.graphState = await documentStore.readState({ cached: false });
        this.graphSettings = documentStore.readSimulationSettings(this.graphSettings);
        this.engine.setSimulationSettings(this.graphSettings);
        this.linkTypeMenuSize = this.readLinkTypeMenuSizeFromGraphState(this.graphState.state);
      } finally {
        documentStore.endHydration();
      }
    } else {
      this.graphState = null;
      this.graphDocumentStore = null;
      this.linkTypeMenuSize = { ...DEFAULT_LINK_TYPE_MENU_SIZE };
    }
    this.engine.setLinkTypeMenuSize(this.linkTypeMenuSize);

    return fm;
  }

  private isGraphNotePath(pathRaw: string): boolean {
    const path = String(pathRaw ?? "").trim();
    if (!path) return false;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return false;
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    return this.isGraphFrontmatterExpandable(file, (frontmatter ?? {}) as Record<string, unknown>);
  }

  private isGraphFrontmatterExpandable(file: TFile, frontmatter: Record<string, unknown>): boolean {
    if (frontmatterMatchesIdentifier(frontmatter, this.noteTypeIdentifiers.graph)) return true;

    const hasConfiguredProperties = hasFrontmatterProperty(frontmatter, this.graphPropertyKeys, "rootNodeProperties");
    const defaultPropertyNames = this.defaultRootNodeProperties
      .map((property) => String(property ?? "").trim())
      .filter(Boolean);
    const propertyNames = hasConfiguredProperties
      ? this.collectRootNodePropertyNames(
          readFrontmatterPropertyByKey(frontmatter, this.graphPropertyKeys, "rootNodeProperties")
        )
      : defaultPropertyNames;
    if (propertyNames.length === 0) return false;

    for (const propertyName of propertyNames) {
      const property = String(propertyName ?? "").trim();
      if (!property) continue;
      if (property.toLowerCase() === NONE_LINK_TYPE.toLowerCase()) {
        if (this.resolveBodyLinkFiles(file).length > 0) return true;
        continue;
      }
      if (resolveWikiLinkArray(this.app, readFrontmatterProperty(frontmatter, property)).length > 0) {
        return true;
      }
    }
    return false;
  }

  private async isPersistentGraphNotePath(pathRaw: string): Promise<boolean> {
    const path = String(pathRaw ?? "").trim();
    if (!path) return false;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return false;
    const frontmatter = await this.readGraphFrontmatterFromDisk(file);
    return frontmatterMatchesIdentifier(frontmatter, this.noteTypeIdentifiers.graph);
  }

  private async loadEmbeddedGraphDefinition(
    graphPathRaw: string,
    ancestryRaw: string[]
  ): Promise<EmbeddedGraphDefinition | null> {
    const graphPath = String(graphPathRaw ?? "").trim();
    const ancestry = Array.from(new Set(
      [
        ...(ancestryRaw ?? []),
        this.file?.path ?? ""
      ].map((path) => String(path ?? "").trim()).filter(Boolean)
    ));
    if (!graphPath || ancestry.includes(graphPath)) return null;
    const file = this.app.vault.getAbstractFileByPath(graphPath);
    if (!(file instanceof TFile)) return null;
    const frontmatter = await this.readGraphFrontmatterFromDisk(file);
    if (!this.isGraphFrontmatterExpandable(file, frontmatter)) return null;

    let state = this.embeddedGraphStates.get(graphPath);
    let store = this.embeddedGraphDocumentStores.get(graphPath);
    if (!state || !store) {
      store = new O3GraphDocumentStore(this.app, file, this.graphPropertyKeys);
      store.beginHydration();
      try {
        state = await store.readState({ cached: false });
      } finally {
        store.endHydration();
      }
      this.embeddedGraphStates.set(graphPath, state);
      this.embeddedGraphDocumentStores.set(graphPath, store);
    }

    const colorRaw = readFrontmatterPropertyByKey(frontmatter, this.graphPropertyKeys, "graphContainerColor")
      ?? frontmatter.graphContainerColor;
    const forceValue = readFrontmatterPropertyByKey(frontmatter, this.graphPropertyKeys, "graphContainerLinkForce")
      ?? frontmatter.graphContainerLinkForce;
    const forceRaw = Number(forceValue);
    const hasExplicitContainerColor = this.hasNonEmptyGraphValue(colorRaw);
    const groupColor = hasExplicitContainerColor ? null : this.evaluateGrouping(graphPath);
    const containerColor = hasExplicitContainerColor
      ? (String(colorRaw ?? "#6e96dc").trim() || "#6e96dc")
      : (String(groupColor ?? "#6e96dc").trim() || "#6e96dc");
    const containerColorSource = hasExplicitContainerColor
      ? "explicit" as const
      : (groupColor ? "group" as const : "default" as const);
    const embeddedLinkTypes = await this.resolveActiveLinkTypesFromYaml(frontmatter);
    const embeddedVisibleLinkTypes = this.resolveVisibleLinkTypesFromYamlWithDefaults(frontmatter);
    const embeddedVisibleLinkTypeDefinitions = this.getVisibleLinkTypeDefinitionsForProperties(embeddedVisibleLinkTypes);
    let snapshots = state.toRuntimeNodeSnapshots();
    if (snapshots.length === 0) {
      const rootResolution = this.resolveRootNodeFilesFromGraphFrontmatter(frontmatter);
      const rootTargets = this.resolveRootNodeTargetsFromGraphFrontmatter(frontmatter, file, rootResolution);
      snapshots = rootTargets.map((rootTarget, index) => {
        const pinned = state.state.pinned?.[rootTarget.path];
        const x = Number(pinned?.x);
        const y = Number(pinned?.y);
        return {
          nodeId: rootTarget.path,
          path: rootTarget.path,
          x: Number.isFinite(x) ? x : (index % 4) * 100,
          y: Number.isFinite(y) ? y : Math.floor(index / 4) * 100,
          pinned: Boolean(pinned),
          origin: { kind: "root" as const },
          badges: {}
        };
      });
    }
    snapshots = this.normalizeEmbeddedSnapshots(snapshots, embeddedLinkTypes);
    return {
      graphPath,
      color: containerColor,
      colorSource: containerColorSource,
      linkForce: Number.isFinite(forceRaw) ? Math.max(0, Math.min(1, forceRaw)) : 0.015,
      snapshots,
      ancestry,
      linkTypes: embeddedLinkTypes,
      visibleLinkTypes: embeddedVisibleLinkTypes,
      visibleLinkTypeDefinitions: embeddedVisibleLinkTypeDefinitions,
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

  private normalizeEmbeddedSnapshots(
    snapshots: O3GraphRuntimeNodeSnapshot[],
    linkTypes: O3LinkType[]
  ): O3GraphRuntimeNodeSnapshot[] {
    const duplicateEnabled = new Set(
      linkTypes
        .filter((linkType) => linkType.linkDuplicateNodes === true)
        .map((linkType) => String(linkType.property ?? "").trim().toLowerCase())
        .filter(Boolean)
    );
    const canonicalByPath = new Map<string, O3GraphRuntimeNodeSnapshot>();
    const remappedNodeIds = new Map<string, string>();
    const kept: O3GraphRuntimeNodeSnapshot[] = [];

    const ordered = [...snapshots].sort((a, b) => {
      const rank = (snapshot: O3GraphRuntimeNodeSnapshot): number =>
        snapshot.origin.kind === "root" ? 0 : snapshot.origin.kind === "filter" ? 1 : 2;
      return rank(a) - rank(b);
    });

    for (const snapshot of ordered) {
      const duplicateAllowed = snapshot.origin.kind === "expansion"
        && duplicateEnabled.has(String(snapshot.origin.linkType ?? "").trim().toLowerCase());
      if (duplicateAllowed) {
        kept.push(snapshot);
        continue;
      }
      const canonical = canonicalByPath.get(snapshot.path);
      if (canonical) {
        remappedNodeIds.set(snapshot.nodeId, canonical.nodeId);
        continue;
      }
      canonicalByPath.set(snapshot.path, snapshot);
      kept.push(snapshot);
    }

    const normalized = kept.map((snapshot) => {
      if (snapshot.origin.kind !== "expansion") return snapshot;
      const sourceNodeId = remappedNodeIds.get(snapshot.origin.sourceNodeId)
        ?? snapshot.origin.sourceNodeId;
      return {
        ...snapshot,
        origin: {
          ...snapshot.origin,
          sourceNodeId,
          ...(duplicateEnabled.has(String(snapshot.origin.linkType ?? "").trim().toLowerCase())
            ? {}
            : { duplicate: false })
        }
      };
    });

    const snapshotById = new Map(normalized.map((snapshot) => [snapshot.nodeId, snapshot]));
    const visibleIds = new Set(
      normalized
        .filter((snapshot) => snapshot.origin.kind === "root" || snapshot.origin.kind === "filter")
        .map((snapshot) => snapshot.nodeId)
    );
    let changed = true;
    while (changed) {
      changed = false;
      for (const snapshot of normalized) {
        if (visibleIds.has(snapshot.nodeId) || snapshot.origin.kind !== "expansion") continue;
        const source = snapshotById.get(snapshot.origin.sourceNodeId);
        if (!source || !visibleIds.has(source.nodeId)) continue;
        const linkType = String(snapshot.origin.linkType ?? "").trim().toLowerCase();
        if (source.badges?.[linkType] !== "expanded") continue;
        visibleIds.add(snapshot.nodeId);
        changed = true;
      }
    }

    return normalized.filter((snapshot) => visibleIds.has(snapshot.nodeId));
  }

  private async handleEmbeddedGraphExpansionChanged(
    originNodeId: string,
    graphPath: string,
    expanded: boolean,
    ownerGraphPath?: string,
    lens?: O3GraphEmbeddedLensState,
    parentChain: O3GraphEmbeddedGraphState[] = []
  ): Promise<void> {
    if (this.isClosingOrUnloadingGraphView) return;
    if (this.isHydratingGraphRuntime) return;
    const ownerPath = String(ownerGraphPath ?? this.file?.path ?? "").trim();
    if (!ownerPath) return;
    const ownerState = ownerPath === this.file?.path
      ? this.graphState
      : this.embeddedGraphStates.get(ownerPath);
    const ownerStore = ownerPath === this.file?.path
      ? this.graphDocumentStore
      : this.embeddedGraphDocumentStores.get(ownerPath);
    if (!ownerState || !ownerStore) return;
    const ownerIsPersistentGraphNote = await this.isPersistentGraphNotePath(ownerPath);
    if (!ownerIsPersistentGraphNote && !ownerState.loadedFromGraphStateBlock) return;
    if (!ownerState.setEmbeddedGraphExpansion(originNodeId, graphPath, expanded, lens, parentChain)) return;
    if (ownerPath !== this.file?.path) {
      this.suppressEmbeddedGraphReloadUntil.set(ownerPath, Date.now() + 2000);
    } else {
      this.suppressGraphFileReloadUntil = Date.now() + 2000;
    }
    const wrote = await ownerStore.writeState(ownerState, { reason: "lens-state" });
    if (wrote && ownerPath === this.file?.path) {
      this.suppressGraphFileReloadUntil = Date.now() + 1500;
    } else if (wrote) {
      this.suppressEmbeddedGraphReloadUntil.set(ownerPath, Date.now() + 1500);
    }
  }

  private async persistEmbeddedGraphRuntime(graphPathRaw: string, instanceId?: string): Promise<void> {
    if (this.isClosingOrUnloadingGraphView) return;
    if (this.isHydratingGraphRuntime) return;
    const graphPath = String(graphPathRaw ?? "").trim();
    if (!graphPath) return;
    const state = this.embeddedGraphStates.get(graphPath);
    const store = this.embeddedGraphDocumentStores.get(graphPath);
    if (!state || !store) return;
    const ownerIsPersistentGraphNote = await this.isPersistentGraphNotePath(graphPath);
    if (!ownerIsPersistentGraphNote && !state.loadedFromGraphStateBlock) return;
    const snapshots = instanceId
      ? this.engine.getEmbeddedGraphSnapshotsForInstance(instanceId)
      : this.engine.getEmbeddedGraphSnapshots(graphPath);
    if (snapshots.length === 0) return;
    state.migrateToCurrentLayout(snapshots);
    this.suppressEmbeddedGraphReloadUntil.set(graphPath, Date.now() + 2000);
    const wrote = await store.writeState(state, { reason: "node-position" });
    if (wrote) {
      this.suppressEmbeddedGraphReloadUntil.set(graphPath, Date.now() + 1500);
    }
  }

  private async readGraphFrontmatterFromDisk(file: TFile): Promise<Record<string, unknown>> {
    try {
      const content = await this.app.vault.read(file);
      return this.parseFrontmatter(content).frontmatter;
    } catch (error) {
      console.error("[GraphView] Failed to read graph frontmatter from disk:", file.path, error);
      const cache = this.app.metadataCache.getFileCache(file);
      return (cache?.frontmatter ?? {}) as Record<string, unknown>;
    }
  }

  private async resolveActiveLinkTypesFromYaml(frontmatter: Record<string, unknown>): Promise<O3LinkType[]> {
    return this.resolveLinkTypesFromGraphYamlValue(
      readFrontmatterPropertyByKey(frontmatter, this.graphPropertyKeys, "activeLinkTypes") ?? []
    );
  }

  private async resolveActiveOverlayLinkTypesFromYaml(frontmatter: Record<string, unknown>): Promise<O3LinkType[]> {
    return this.resolveLinkTypesFromGraphYamlValue(
      readFrontmatterPropertyByKey(frontmatter, this.graphPropertyKeys, "activeOverlayLinkTypes") ?? []
    );
  }

  private resolveVisibleLinkTypesFromYaml(frontmatter: Record<string, unknown>): string[] {
    const rawValue = readFrontmatterPropertyByKey(frontmatter, this.graphPropertyKeys, "visibleLinkTypes") ?? [];
    const out: string[] = [];
    const seen = new Set<string>();
    const registry = this.globalLinkTypeRegistry.getAll();
    const add = (raw: unknown): void => {
      if (raw == null) return;
      if (Array.isArray(raw)) {
        for (const item of raw) add(item);
        return;
      }
      if (typeof raw === "object") {
        const obj = raw as Record<string, unknown>;
        for (const key of ["property", "key", "name", "value", "path", "link"]) {
          if (obj[key] !== undefined) {
            add(obj[key]);
            return;
          }
        }
        return;
      }
      const text = String(raw ?? "").trim();
      if (!text) return;
      const parts = this.splitGraphLinkTypeListText(text);
      for (const part of parts) {
        const property = this.resolveVisibleLinkTypeProperty(part, registry);
        const normalized = String(property ?? "").trim().toLowerCase();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        out.push(normalized);
      }
    };
    add(rawValue);
    return out;
  }

  private splitGraphLinkTypeListText(textRaw: string): string[] {
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

  private resolveVisibleLinkTypesFromYamlWithDefaults(frontmatter: Record<string, unknown>): string[] {
    if (hasFrontmatterProperty(frontmatter, this.graphPropertyKeys, "visibleLinkTypes")) {
      return this.resolveVisibleLinkTypesFromYaml(frontmatter);
    }
    return this.resolveVisibleLinkTypesFromYaml({
      [this.graphPropertyKeys.visibleLinkTypes]: this.defaultVisibleLinkTypes
    });
  }

  private readActiveGroupsValueWithDefaults(frontmatter: Record<string, unknown>): unknown {
    if (hasFrontmatterProperty(frontmatter, this.graphPropertyKeys, "activeGroups")) {
      return readFrontmatterPropertyByKey(frontmatter, this.graphPropertyKeys, "activeGroups") ?? [];
    }
    return this.defaultActiveGroups;
  }

  private shouldAutoExpandDroppedLinkTypes(): boolean {
    if (!this.file) return this.defaultAutoExpandDroppedLinkTypes;
    const frontmatter = this.app.metadataCache.getFileCache(this.file)?.frontmatter;
    const raw = readFrontmatterPropertyByKey(frontmatter, this.graphPropertyKeys, "autoExpandDroppedLinkTypes");
    if (raw === undefined || raw === null || raw === "") return this.defaultAutoExpandDroppedLinkTypes;
    if (typeof raw === "boolean") return raw;
    if (typeof raw === "number") return raw !== 0;
    const normalized = String(raw).trim().toLowerCase();
    if (!normalized) return this.defaultAutoExpandDroppedLinkTypes;
    return !["false", "no", "off", "0"].includes(normalized);
  }

  private readGraphLineStyleFromFrontmatter(
    key: "visibleLinkTypeLineStyle" | "discoveredLinkLineStyle",
    fallback: GraphLineStyle
  ): GraphLineStyle {
    if (!this.file) return fallback;
    const frontmatter = this.app.metadataCache.getFileCache(this.file)?.frontmatter;
    const raw = readFrontmatterPropertyByKey(frontmatter, this.graphPropertyKeys, key);
    const normalized = String(raw ?? "").trim().toLowerCase();
    if (["dash", "dashed"].includes(normalized)) return "dashed";
    if (["normal", "solid", "line"].includes(normalized)) return "normal";
    return fallback;
  }

  private readGraphBackgroundColorFromFrontmatter(): string | null {
    if (!this.file) return null;
    const frontmatter = this.app.metadataCache.getFileCache(this.file)?.frontmatter;
    const raw = readFrontmatterPropertyByKey(frontmatter, this.graphPropertyKeys, "graphBackgroundColor");
    const value = String(raw ?? "").trim();
    return value || null;
  }

  private readGraphBooleanFromFrontmatter(key: "showNodeIcons", fallback: boolean): boolean {
    if (!this.file) return fallback;
    const frontmatter = this.app.metadataCache.getFileCache(this.file)?.frontmatter;
    const raw = readFrontmatterPropertyByKey(frontmatter, this.graphPropertyKeys, key);
    if (raw === undefined || raw === null || raw === "") return fallback;
    if (typeof raw === "boolean") return raw;
    if (typeof raw === "number") return raw !== 0;
    const normalized = String(raw).trim().toLowerCase();
    if (!normalized) return fallback;
    return !["false", "no", "off", "0"].includes(normalized);
  }

  private resolveVisibleLinkTypeProperty(rawValue: string, registry: O3LinkType[]): string {
    const raw = String(rawValue ?? "").trim();
    if (!raw) return "";
    const linkMatch = raw.match(/^\[\[([^|\]#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]$/);
    if (linkMatch) {
      const linkPath = String(linkMatch[1] ?? "").trim();
      const file = this.app.metadataCache.getFirstLinkpathDest(linkPath, this.file?.path ?? "")
        ?? this.app.metadataCache.getFirstLinkpathDest(linkPath, "");
      const matched = registry.find((linkType) => String(linkType.file?.path ?? "").trim() === file?.path);
      if (matched?.property) return String(matched.property).trim();
      return linkPath;
    }

    const normalized = raw.toLowerCase();
    const matched = registry.find((linkType) =>
      String(linkType.property ?? "").trim().toLowerCase() === normalized
      || (linkType.properties ?? []).some((property) => String(property ?? "").trim().toLowerCase() === normalized)
      || String(linkType.key ?? "").trim().toLowerCase() === normalized
      || String(linkType.file?.path ?? "").trim().toLowerCase() === normalized
      || String(linkType.file?.basename ?? "").trim().toLowerCase() === normalized
    );
    return String(matched?.property ?? raw).trim();
  }

  private getVisibleLinkTypeDefinitions(): O3LinkType[] {
    return this.getVisibleLinkTypeDefinitionsForProperties(this.visibleLinkTypes);
  }

  private getVisibleLinkTypeDefinitionsForProperties(properties: string[]): O3LinkType[] {
    const visibleLinkTypeSet = new Set(
      (properties ?? [])
        .map((property) => String(property ?? "").trim().toLowerCase())
        .filter(Boolean)
    );
    return this.globalLinkTypeRegistry
      .getAll()
      .filter((linkType) => {
        const identities = [
          String(linkType.property ?? "").trim().toLowerCase(),
          ...(linkType.properties ?? []).map((property) => String(property ?? "").trim().toLowerCase())
        ].filter(Boolean);
        return identities.some((identity) => visibleLinkTypeSet.has(identity));
      });
  }

  private getAllRuntimeLinkTypeDefinitions(): O3LinkType[] {
    const seen = new Set<string>();
    const out: O3LinkType[] = [];
    for (const linkType of [
      ...this.activeLinkTypes,
      ...this.activeOverlayLinkTypes,
      ...this.getVisibleLinkTypeDefinitions()
    ]) {
      const identity = String(linkType.file?.path ?? linkType.property ?? linkType.key ?? "").trim().toLowerCase();
      if (!identity || seen.has(identity)) continue;
      seen.add(identity);
      out.push(linkType);
    }
    return out;
  }

  private async resolveLinkTypesFromGraphYamlValue(value: unknown): Promise<O3LinkType[]> {
    const out: O3LinkType[] = [];
    const registryByPath = new Map(
      this.globalLinkTypeRegistry.getAll().map((linkType) => [String(linkType.file?.path ?? "").trim(), linkType] as const)
    );
    const resolvedFiles = resolveWikiLinkArray(this.app, value);
    for (const file of resolvedFiles) {
      const path = String(file.path ?? "").trim();
      if (!path) continue;
      const linkType = this.linkTypeRegistry.get(path) ?? registryByPath.get(path);
      if (linkType) {
        out.push(linkType);
      }
    }
    return out;
  }

  private resolveRootNodeFilesFromGraphFrontmatter(frontmatter: Record<string, unknown>): {
    files: TFile[];
    rawValues: unknown[];
    usesConfiguredProperties: boolean;
    propertyNames: string[];
  } {
    const hasConfiguredProperties = hasFrontmatterProperty(frontmatter, this.graphPropertyKeys, "rootNodeProperties");
    const defaultPropertyNames = this.defaultRootNodeProperties
      .map((property) => String(property ?? "").trim())
      .filter(Boolean);
    const usesConfiguredProperties = hasConfiguredProperties || defaultPropertyNames.length > 0;
    const propertyNames = hasConfiguredProperties
      ? this.collectRootNodePropertyNames(
          readFrontmatterPropertyByKey(frontmatter, this.graphPropertyKeys, "rootNodeProperties")
        )
      : (defaultPropertyNames.length > 0 ? defaultPropertyNames : [this.graphPropertyKeys.rootNodes]);
    const rawValues: unknown[] = [];
    const files: TFile[] = [];
    const seen = new Set<string>();

    for (const propertyName of propertyNames) {
      const property = String(propertyName ?? "").trim();
      if (!property) continue;
      const rawValue = hasConfiguredProperties || defaultPropertyNames.length > 0
        ? readFrontmatterProperty(frontmatter, property)
        : readFrontmatterPropertyByKey(frontmatter, this.graphPropertyKeys, "rootNodes");
      rawValues.push(rawValue);
      if (property.toLowerCase() === NONE_LINK_TYPE.toLowerCase()) {
        for (const file of this.resolveBodyLinkFiles(this.file)) {
          if (seen.has(file.path)) continue;
          seen.add(file.path);
          files.push(file);
        }
        continue;
      }
      for (const file of resolveWikiLinkArray(this.app, rawValue)) {
        if (seen.has(file.path)) continue;
        seen.add(file.path);
        files.push(file);
      }
    }

    return {
      files,
      rawValues,
      usesConfiguredProperties,
      propertyNames
    };
  }

  private getRootNodePropertyNamesForFile(file: TFile): string[] {
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    if (hasFrontmatterProperty(frontmatter, this.graphPropertyKeys, "rootNodeProperties")) {
      return this.collectRootNodePropertyNames(
        readFrontmatterPropertyByKey(frontmatter, this.graphPropertyKeys, "rootNodeProperties")
      );
    }
    return this.defaultRootNodeProperties
      .map((property) => String(property ?? "").trim())
      .filter(Boolean);
  }

  private resolveRootNodeTargetsFromGraphFrontmatter(
    frontmatter: Record<string, unknown>,
    sourceFile: TFile,
    resolved?: ReturnType<GraphView["resolveRootNodeFilesFromGraphFrontmatter"]>
  ): Array<{ path: string; label: string }> {
    const rootResolution = resolved ?? this.resolveRootNodeFilesFromGraphFrontmatter(frontmatter);
    const out: Array<{ path: string; label: string }> = [];
    const seen = new Set<string>();
    const add = (pathRaw: string, labelRaw?: string): void => {
      const path = String(pathRaw ?? "").trim();
      if (!path || seen.has(path)) return;
      seen.add(path);
      out.push({ path, label: String(labelRaw ?? "").trim() || this.labelFromPath(path) });
    };
    for (const file of rootResolution.files) {
      add(file.path, file.basename);
    }
    for (const rawValue of rootResolution.rawValues) {
      for (const candidate of extractInternalLinkCandidates(rawValue)) {
        const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(candidate, sourceFile.path);
        if (resolvedFile instanceof TFile) {
          add(resolvedFile.path, resolvedFile.basename);
          continue;
        }
        const missingPath = this.normalizeMissingGraphLinkPath(candidate);
        if (missingPath) add(missingPath);
      }
    }
    return out;
  }

  private normalizeMissingGraphLinkPath(rawPath: string): string {
    const path = String(rawPath ?? "")
      .split("|")[0]
      ?.split("#")[0]
      ?.replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .trim() ?? "";
    if (!path) return "";
    return /\.md$/i.test(path) ? path : `${path}.md`;
  }

  private labelFromPath(pathRaw: string): string {
    const path = String(pathRaw ?? "").trim();
    return path.split("/").pop()?.replace(/\.md$/i, "") || path;
  }

  private collectRootNodePropertyNames(value: unknown): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (raw: unknown): void => {
      if (raw == null) return;
      if (Array.isArray(raw)) {
        for (const item of raw) add(item);
        return;
      }
      if (typeof raw === "object") {
        const obj = raw as Record<string, unknown>;
        for (const key of ["property", "name", "key", "value", "path", "link"]) {
          if (obj[key] !== undefined) {
            add(obj[key]);
            return;
          }
        }
        return;
      }
      const property = String(raw ?? "").trim();
      const parts = property.split(/[\s,;]+/).map((part) => part.trim()).filter(Boolean);
      for (const part of parts.length > 0 ? parts : [property]) {
        const normalized = part.toLowerCase();
        if (!part || seen.has(normalized)) continue;
        seen.add(normalized);
        out.push(part);
      }
    };
    add(value);
    return out;
  }

  private resolveBodyLinkFiles(sourceFile: TFile | null): TFile[] {
    if (!(sourceFile instanceof TFile)) return [];
    const cache = this.app.metadataCache.getFileCache(sourceFile);
    const links = Array.isArray(cache?.links) ? cache.links : [];
    const files: TFile[] = [];
    const seen = new Set<string>();
    for (const link of links) {
      const linkText = String((link as Record<string, unknown>).link ?? "").trim();
      if (!linkText) continue;
      const file = this.app.metadataCache.getFirstLinkpathDest(linkText, sourceFile.path);
      if (!(file instanceof TFile) || seen.has(file.path)) continue;
      seen.add(file.path);
      files.push(file);
    }
    return files;
  }

  private readLayoutIdFromGraphFrontmatter(frontmatter: Record<string, unknown>): string | null {
    const layoutRaw = readFrontmatterPropertyByKey(frontmatter, this.graphPropertyKeys, "graphLayout")
      ?? frontmatter?.layoutEngine
      ?? frontmatter?.layout;
    const normalized = String(layoutRaw ?? "").trim().toLowerCase();
    if (!normalized) return null;
    return this.normalizeLayoutId(normalized);
  }

  private async reloadFromFile(): Promise<void> {
    if (!this.file) {
      if (this.debugEnabled) {
        console.warn("reloadFromFile called but no file bound.");
      }
      return;
    }
    if (!this.initialized) {
      this.pendingReloadAfterInitialize = true;
      return;
    }

    if (!this.file) {
      if (this.debugEnabled) {
        console.warn("GraphView has no file bound to it.");
      }
    }

    await this.loadLinkTypeRegistry();
    const fm = await this.loadGraphFile();
    const fileModeGraphSettings = this.isFileMode ? { ...this.graphSettings } : null;
    const resolvedRootNodes = this.resolveRootNodeFilesFromGraphFrontmatter(fm);
    this.fileModeRootFiles = resolvedRootNodes.files;
    this.activeRootNodeProperties = resolvedRootNodes.usesConfiguredProperties
      ? resolvedRootNodes.propertyNames.map((property) => String(property ?? "").trim()).filter(Boolean)
      : [];
    if (
      this.isFileMode
      && this.fileModeRootFiles.length === 0
      && resolvedRootNodes.rawValues.some((value) => this.hasNonEmptyGraphValue(value))
      && this.scheduleGraphOpenRetry("rootNodes unresolved")
    ) {
      return;
    }
    this.graphOpenRetryCount = 0;
    this.connectedBaseFilterResult = this.isFileMode
      ? await this.baseViewFilterResolver.resolve(readFrontmatterPropertyByKey(fm, this.graphPropertyKeys, "connectedBaseFilter"), this.file)
      : null;
    this.reportConnectedBaseFilterResult(readFrontmatterPropertyByKey(fm, this.graphPropertyKeys, "connectedBaseFilter"));
    this.fileModeFilterFiles = this.connectedBaseFilterResult?.files ?? [];
    this.fileModeActiveLinkTypeFiles = resolveWikiLinkArray(this.app, readFrontmatterPropertyByKey(fm, this.graphPropertyKeys, "activeLinkTypes"));
    this.fileModeActiveOverlayLinkTypeFiles = resolveWikiLinkArray(this.app, readFrontmatterPropertyByKey(fm, this.graphPropertyKeys, "activeOverlayLinkTypes"));
    this.fileModeActiveGroupFiles = resolveWikiLinkArray(this.app, this.readActiveGroupsValueWithDefaults(fm));
    this.currentGraphFiles = this.isFileMode
      ? this.mergeGraphFiles(this.fileModeRootFiles, this.fileModeFilterFiles)
      : this.resolveRootNodeFiles();
    if (this.isFileMode && this.currentGraphFiles.length === 0) {
      const snapshotFiles = this.resolveGraphStateSnapshotFiles();
      if (snapshotFiles.length > 0) {
        this.currentGraphFiles = snapshotFiles;
        if (this.fileModeRootFiles.length === 0 && this.fileModeFilterFiles.length === 0) {
          this.fileModeRootFiles = snapshotFiles.filter((file) =>
            this.graphState?.toRuntimeNodeSnapshots().some((snapshot) =>
              snapshot.path === file.path && snapshot.origin.kind === "root"
            )
          );
        }
      }
    }
    if (this.isFileMode && this.graphState && this.graphDocumentStore && this.currentGraphFiles.length > 0) {
      const pruned = this.graphState.pruneToCorePaths(this.currentGraphFiles.map((file) => file.path));
      if (pruned) {
        this.suppressGraphFileReloadUntil = Date.now() + 1500;
      }
    }
    const rawActiveGroups = this.readActiveGroupsValueWithDefaults(fm);
    this.loadGroupRegistry(this.currentGraphFiles, rawActiveGroups);

    this.activeLinkTypes = await this.resolveActiveLinkTypesFromYaml(fm);
    this.activeOverlayLinkTypes = await this.resolveActiveOverlayLinkTypesFromYaml(fm);
    this.visibleLinkTypes = this.resolveVisibleLinkTypesFromYamlWithDefaults(fm);
    const visibleLinkTypeDefinitions = this.getVisibleLinkTypeDefinitions();
    const activePathSet = new Set(
      [...this.activeLinkTypes, ...this.activeOverlayLinkTypes, ...visibleLinkTypeDefinitions]
        .map((lt) => String(lt.file?.path ?? "").trim())
        .filter(Boolean)
    );
    this.sourceLinkProperties = this.discoverSourceLinkProperties(fm);
    this.availableLinkTypes = this.globalLinkTypeRegistry
      .getAll()
      .filter((lt) => !activePathSet.has(String(lt.file?.path ?? "").trim()))
      .sort((a, b) => String(a.key ?? "").localeCompare(String(b.key ?? "")));
    this.discoveredProperties = Array.from(this.discoverLinkableProperties()).sort((a, b) => a.localeCompare(b));
    this.activeGroups = [];

    const resolvedGroupFiles = resolveWikiLinkArray(this.app, rawActiveGroups);
    for (const file of resolvedGroupFiles) {
      const group = this.groupRegistry.get(file.path);
      if (group) {
        this.activeGroups.push(group);
      }
    }

    const rootNodes = this.fileModeRootFiles.map((file) => this.toRootNodeLinkpath(file));
    const activeLinkTypes = this.activeLinkTypes.map((lt) => String(lt.property ?? "").trim().toLowerCase()).filter(Boolean);
    const hasYamlActiveLinkTypes = hasFrontmatterProperty(fm, this.graphPropertyKeys, "activeLinkTypes");
    const persistedState = StateManager.cloneState(this.readAllPersistedGraphState());
    const frontmatterLayoutId = this.readLayoutIdFromGraphFrontmatter(fm);

    const nextState = this.isFileMode
      ? StateManager.cloneState({
        rootNodes,
        activeLinkTypes,
        ...(frontmatterLayoutId
          ? {
              graphSettings: {
                layoutId: frontmatterLayoutId
              }
            }
          : {})
      })
      : StateManager.cloneState({
        ...persistedState,
        rootNodes: persistedState.rootNodes.length > 0 ? persistedState.rootNodes : rootNodes,
        activeLinkTypes: hasYamlActiveLinkTypes ? activeLinkTypes : persistedState.activeLinkTypes,
        ...(frontmatterLayoutId
          ? {
              graphSettings: {
                ...persistedState.graphSettings,
                layoutId: frontmatterLayoutId
              }
            }
          : {})
      });

    this.viewStateModel = nextState;
    this.selectedLinkTypes = [...nextState.activeLinkTypes];
    if (this.isFileMode && !hasYamlActiveLinkTypes) {
      this.selectedLinkTypes = [];
    }
    this.linkTypeSemantics = this.buildLinkTypeSemanticsFromConfig(nextState.linkTypeConfig);
    for (const linkType of this.activeLinkTypes) {
      const property = String(linkType.property ?? "").trim().toLowerCase();
      if (property && linkType.semantic === "parent") {
        this.linkTypeSemantics[property] = "parent";
      }
    }
    this.linkTypePhysics = this.buildLinkTypePhysicsFromConfig(nextState.linkTypeConfig);
    this.expandedParents = this.normalizeExpandedParentsState(nextState.expandedParents);
    const activeGroupRules = this.normalizeActiveGroupRules();
    const usesActiveGroupSource = this.isFileMode
      || hasFrontmatterProperty(fm, this.graphPropertyKeys, "activeGroups")
      || this.defaultActiveGroups.length > 0;
    this.groupingRules = usesActiveGroupSource
      ? activeGroupRules
      : this.normalizeGroupingRules(nextState.groupingRules);
    this.graphSettings = fileModeGraphSettings ?? {
      repulsionStrength: nextState.graphSettings.repulsionStrength,
      centerStrength: nextState.graphSettings.centerStrength,
      nodeRadius: nextState.graphSettings.nodeRadius,
      nodeConnectionSizeMultiplier: nextState.graphSettings.nodeConnectionSizeMultiplier,
      nearRestVelocityThreshold: nextState.graphSettings.nearRestVelocityThreshold,
      restVelocityThreshold: nextState.graphSettings.restVelocityThreshold,
      textFadeThreshold: nextState.graphSettings.textFadeThreshold
    };
    this.layoutId = this.normalizeLayoutId(nextState.graphSettings.layoutId);
    this.hideNodesWithoutSelectedLinkTypes = Boolean(nextState.graphSettings.hideNodesWithoutSelectedLinkTypes);
    this.updateRelevantProperties();
    this.dependencyWatcher.updateDependencies({
      graphFile: this.file,
      linkTypeFiles: this.globalLinkTypeRegistry.getAll().map((lt) => lt.file),
      groupFiles: this.activeGroups.map((g) => g.file),
      baseFilterFiles: this.connectedBaseFilterResult?.baseFile ? [this.connectedBaseFilterResult.baseFile] : [],
      nodeFiles: this.currentGraphFiles,
      linkTypeFolder: this.linkTypeFolder,
      watchedProperties: [
        ...this.activeLinkTypes.map((lt) => String(lt.property ?? "").trim().toLowerCase()),
        ...this.activeOverlayLinkTypes.map((lt) => String(lt.property ?? "").trim().toLowerCase()),
        ...this.visibleLinkTypes,
        ...this.activeGroups.map((g) => String(g.property ?? "").trim()),
        this.graphPropertyKeys.rootNodeProperties,
        this.graphPropertyKeys.graphBackgroundColor,
        DEFAULT_GRAPH_PROPERTY_KEYS.rootNodeProperties
      ].filter(Boolean),
      metadataCache: this.app.metadataCache
    });
    this.renderLinkTypeMenu();
    this.hasCompletedInitialGraphRuntimeHydration = false;
    this.isHydratingGraphRuntime = true;
    let hydrationSucceeded = false;
    try {
      this.engine.clearEmbeddedGraphRuntime();
      await this.buildGraph();
      await this.restoreEmbeddedGraphExpansions();

      if (this.initialized) {
        const activeProperties = this.isFileMode
          ? this.activeLinkTypes.map((lt) => String(lt.property ?? "").trim().toLowerCase()).filter(Boolean)
          : this.selectedLinkTypes;
        this.selectedLinkTypes = [...activeProperties];
        this.engine.setSelectedLinkTypes(activeProperties);
        this.engine.setAllLinkTypeSemantics(this.linkTypeSemantics);
        this.engine.setLinkTypePhysics(this.linkTypePhysics);
        this.engine.setGroupingRules(this.groupingRules);
        this.engine.setSimulationSettings(this.graphSettings);
        this.engine.setLayout(this.layoutId);
        this.engine.setHideNodesWithoutSelectedLinkTypes(this.hideNodesWithoutSelectedLinkTypes);
        if (!this.isFileMode) {
          this.onDataUpdated();
        }
      }
      hydrationSucceeded = true;
    } finally {
      this.isHydratingGraphRuntime = false;
      this.hasCompletedInitialGraphRuntimeHydration = hydrationSucceeded;
    }
    if (hydrationSucceeded) {
      this.scheduleNoteTruthReconciliation(0);
    }
  }

  private async restoreEmbeddedGraphExpansions(): Promise<void> {
    if (!this.graphState) return;
    for (const entry of this.graphState.listExpandedEmbeddedGraphs()) {
      if (!this.engine.isEmbeddedGraphExpanded(entry.originNodeId, entry.graphPath)) {
        const definition = await this.loadEmbeddedGraphDefinition(entry.graphPath, []);
        if (definition) {
          this.engine.expandEmbeddedGraph(entry.originNodeId, {
            ...definition,
            lens: entry.lens ?? definition.lens,
            embeddedGraphs: entry.embeddedGraphs ?? definition.embeddedGraphs
          });
        }
      }
      if (entry.lens) {
        this.engine.applyEmbeddedGraphLensState(entry.originNodeId, entry.graphPath, entry.lens);
      }
    }
  }

  private hasNonEmptyGraphValue(value: unknown): boolean {
    if (value == null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.some((item) => this.hasNonEmptyGraphValue(item));
    if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
    return true;
  }

  private scheduleGraphOpenRetry(reason: string): boolean {
    if (!this.initialized || !this.file) return false;
    if (this.graphOpenRetryTimer !== null) return true;
    if (this.graphOpenRetryCount >= 5) {
      console.warn("[GraphView] Graph links still unresolved after retries; rendering current state.", {
        reason,
        file: this.file.path
      });
      this.graphOpenRetryCount = 0;
      return false;
    }
    this.graphOpenRetryCount += 1;
    console.warn("[GraphView] Deferring graph render while graph links resolve:", {
      reason,
      file: this.file.path,
      attempt: this.graphOpenRetryCount
    });
    this.graphOpenRetryTimer = window.setTimeout(() => {
      this.graphOpenRetryTimer = null;
      void this.reloadFromFile().catch((error) => this.renderError(this.viewContainer, error));
    }, 750);
    return true;
  }

  private mountViewShell(): void {
    const host = this.contentEl;
    host.empty();

    const shell = host.createDiv();
    setStyle(shell, "display", "grid");
    setStyle(shell, "gridTemplateRows", "1fr");
    setStyle(shell, "height", "100%");

    setStyle(this.viewContainer, "position", "relative");
    setStyle(this.viewContainer, "minHeight", "260px");
    setStyle(this.viewContainer, "height", "100%");
    this.viewContainer.removeEventListener("dragover", this.onGraphDragOverBound);
    this.viewContainer.removeEventListener("drop", this.onGraphDropBound);
    this.viewContainer.addEventListener("dragover", this.onGraphDragOverBound);
    this.viewContainer.addEventListener("drop", this.onGraphDropBound);
    shell.appendChild(this.viewContainer);
    this.shellContainer = shell;
  }

  private renderRootControls(): void {
    const container = this.rootControlsEl;
    if (!container) return;
    container.empty();

    const title = container.createDiv({ text: "Root Nodes" });
    setStyle(title, "fontWeight", "600");

    const row = container.createDiv();
    setStyle(row, "display", "flex");
    setStyle(row, "gap", "8px");

    const input = row.createEl("input", {
      type: "text",
      placeholder: "Type a note name or linkpath"
    });
    setStyle(input, "flex", "1");
    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        void this.addRootNodeFromInput();
      }
    });

    const button = row.createEl("button", { text: "Add Root" });
    button.addEventListener("click", () => {
      void this.addRootNodeFromInput();
    });

    const list = container.createDiv();
    setStyle(list, "display", "grid");
    setStyle(list, "gap", "4px");
    this.rootInputEl = input;
    this.rootListEl = list;

    this.renderRootNodeList();
    this.renderLinkTypeMenuSections(container);
  }

  private renderLinkTypeMenuSections(container: HTMLElement): void {
    const panel = container.createDiv();
    setStyle(panel, "display", "grid");
    setStyle(panel, "gap", "8px");

    const headerRow = panel.createDiv();
    setStyle(headerRow, "display", "flex");
    setStyle(headerRow, "justifyContent", "space-between");
    setStyle(headerRow, "alignItems", "center");
    const title = headerRow.createDiv({ text: "LinkTypes" });
    setStyle(title, "fontWeight", "600");
    const createButton = headerRow.createEl("button", { text: "Create New" });
    createButton.addEventListener("click", () => {
      this.openCreateLinkTypeModal();
    });

    const selectedByPath = new Set(
      this.activeLinkTypes
        .map((linkType) => String(linkType.file?.path ?? "").trim())
        .filter(Boolean)
    );
    const overlaySelectedByPath = new Set(
      this.activeOverlayLinkTypes
        .map((linkType) => String(linkType.file?.path ?? "").trim())
        .filter(Boolean)
    );
    const visibleSelectedByPath = new Set(
      this.getVisibleLinkTypeDefinitions()
        .map((linkType) => String(linkType.file?.path ?? "").trim())
        .filter(Boolean)
    );

    this.renderSourceLinkPropertySection(panel);

    const allRegistry = this.globalLinkTypeRegistry
      .getAll()
      .filter((linkType) => String(linkType.property ?? "").trim().length > 0);

    const selected = allRegistry
      .filter((linkType) => selectedByPath.has(String(linkType.file?.path ?? "").trim()))
      .sort((a, b) => {
        const propertyCompare = String(a.property ?? "").localeCompare(String(b.property ?? ""));
        if (propertyCompare !== 0) return propertyCompare;
        return String(a.key ?? "").localeCompare(String(b.key ?? ""));
      });
    const unselected = allRegistry
      .filter((linkType) => !selectedByPath.has(String(linkType.file?.path ?? "").trim()))
      .sort((a, b) => {
        const propertyCompare = String(a.property ?? "").localeCompare(String(b.property ?? ""));
        if (propertyCompare !== 0) return propertyCompare;
        return String(a.key ?? "").localeCompare(String(b.key ?? ""));
      });

    if (selected.length === 0 && unselected.length === 0) {
      const empty = panel.createDiv({ text: "No link types found." });
      setStyle(empty, "opacity", "0.7");
      setStyle(empty, "fontSize", "12px");
      return;
    }

    const renderLinkTypeRow = (
      host: HTMLElement,
      linkType: O3LinkType,
      options: { showPropertyColumn: boolean }
    ) => {
      const property = String(linkType.property ?? "").trim().toLowerCase();
      const active = selectedByPath.has(String(linkType.file?.path ?? "").trim());
      const overlayActive = overlaySelectedByPath.has(String(linkType.file?.path ?? "").trim());
      const visibleActive = visibleSelectedByPath.has(String(linkType.file?.path ?? "").trim());

      const row = host.createDiv();
      setStyle(row, "display", "grid");
      setStyle(row, "gridTemplateColumns", options.showPropertyColumn ? "auto auto auto 1fr 1fr" : "auto auto auto 1fr");
      setStyle(row, "gap", "8px");
      setStyle(row, "alignItems", "center");
      setStyle(row, "padding", "4px 0");
      setStyle(row, "borderBottom", "1px solid var(--background-modifier-border-hover)");

      const checkbox = row.createEl("input", { type: "checkbox" });
      checkbox.checked = active;
      checkbox.title = "Use as expansion badge LinkType";
      checkbox.addEventListener("change", () => {
        checkbox.disabled = true;
        const task = checkbox.checked
          ? this.activateLinkType(linkType)
          : this.deactivateLinkType(linkType);
        void task.finally(() => {
          checkbox.disabled = false;
        });
      });

      const overlayCheckbox = row.createEl("input", { type: "checkbox" });
      overlayCheckbox.checked = overlayActive;
      overlayCheckbox.title = "Use as overlay LinkType between core nodes";
      overlayCheckbox.addEventListener("change", () => {
        overlayCheckbox.disabled = true;
        const task = overlayCheckbox.checked
          ? this.activateOverlayLinkType(linkType)
          : this.deactivateOverlayLinkType(linkType);
        void task.finally(() => {
          overlayCheckbox.disabled = false;
        });
      });

      const visibleCheckbox = row.createEl("input", { type: "checkbox" });
      visibleCheckbox.checked = visibleActive;
      visibleCheckbox.title = "Show dashed visible-only edges between already visible nodes";
      visibleCheckbox.addEventListener("change", () => {
        visibleCheckbox.disabled = true;
        const task = visibleCheckbox.checked
          ? this.activateVisibleLinkType(linkType)
          : this.deactivateVisibleLinkType(linkType);
        void task.finally(() => {
          visibleCheckbox.disabled = false;
        });
      });

      const labelCell = row.createDiv();
      setStyle(labelCell, "display", "flex");
      setStyle(labelCell, "alignItems", "center");
      setStyle(labelCell, "gap", "4px");

      const labelButton = labelCell.createEl("button", { text: String(linkType.key ?? "").trim() || property });
      setStyle(labelButton, "fontSize", "12px");
      setStyle(labelButton, "textAlign", "left");
      setStyle(labelButton, "justifySelf", "start");
      setStyle(labelButton, "padding", "2px 4px");
      labelButton.addEventListener("click", () => {
        this.openEditLinkTypeModal(linkType);
      });

      const openFileButton = labelCell.createEl("button", { text: "↗" });
      setStyle(openFileButton, "fontSize", "11px");
      setStyle(openFileButton, "padding", "1px 4px");
      openFileButton.title = "Open LinkType note";
      openFileButton.addEventListener("click", () => {
        void this.openLinkTypeFile(linkType);
      });

      if (options.showPropertyColumn) {
        const propertyEl = row.createDiv({ text: property });
        setStyle(propertyEl, "fontSize", "12px");
        setStyle(propertyEl, "opacity", "0.8");
      }
    };

    if (selected.length > 0) {
      const selectedHeader = panel.createDiv({ text: "Expansion active" });
      setStyle(selectedHeader, "fontSize", "11px");
      setStyle(selectedHeader, "fontWeight", "600");
      setStyle(selectedHeader, "opacity", "0.8");
      setStyle(selectedHeader, "textTransform", "uppercase");
      setStyle(selectedHeader, "letterSpacing", "0.03em");

      const selectedList = panel.createDiv();
      setStyle(selectedList, "display", "grid");
      setStyle(selectedList, "gap", "4px");
      for (const linkType of selected) {
        renderLinkTypeRow(selectedList, linkType, { showPropertyColumn: true });
      }
    }

    if (unselected.length > 0) {
      const unselectedHeader = panel.createDiv({ text: "Expansion inactive (grouped by property)" });
      setStyle(unselectedHeader, "fontSize", "11px");
      setStyle(unselectedHeader, "fontWeight", "600");
      setStyle(unselectedHeader, "opacity", "0.8");
      setStyle(unselectedHeader, "textTransform", "uppercase");
      setStyle(unselectedHeader, "letterSpacing", "0.03em");

      const grouped = new Map<string, O3LinkType[]>();
      for (const linkType of unselected) {
        const property = String(linkType.property ?? "").trim().toLowerCase();
        if (!property) continue;
        const list = grouped.get(property) ?? [];
        list.push(linkType);
        grouped.set(property, list);
      }

      const properties = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));
      for (const property of properties) {
        const propertyHeader = panel.createDiv({ text: property });
        setStyle(propertyHeader, "fontSize", "12px");
        setStyle(propertyHeader, "fontWeight", "600");
        setStyle(propertyHeader, "paddingTop", "4px");
        setStyle(propertyHeader, "opacity", "0.9");

        const groupList = panel.createDiv();
        setStyle(groupList, "display", "grid");
        setStyle(groupList, "gap", "4px");
        const groupItems = grouped.get(property) ?? [];
        for (const linkType of groupItems) {
          renderLinkTypeRow(groupList, linkType, { showPropertyColumn: false });
        }
      }
    }
  }

  private renderSourceLinkPropertySection(panel: HTMLElement): void {
    const section = panel.createDiv();
    setStyle(section, "display", "grid");
    setStyle(section, "gap", "4px");
    setStyle(section, "paddingBottom", "8px");
    setStyle(section, "borderBottom", "1px solid var(--background-modifier-border)");

    const header = section.createDiv({ text: "Source links" });
    setStyle(header, "fontSize", "11px");
    setStyle(header, "fontWeight", "600");
    setStyle(header, "opacity", "0.8");
    setStyle(header, "textTransform", "uppercase");
    setStyle(header, "letterSpacing", "0.03em");

    const active = new Set(this.activeRootNodeProperties.map((property) => String(property ?? "").trim().toLowerCase()));
    const properties = Array.from(new Set(this.sourceLinkProperties.map((property) => String(property ?? "").trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
    if (properties.length === 0) {
      const empty = section.createDiv({ text: "No source links found in this note." });
      setStyle(empty, "fontSize", "12px");
      setStyle(empty, "opacity", "0.7");
      return;
    }

    for (const property of properties) {
      const normalized = property.toLowerCase();
      const row = section.createDiv();
      setStyle(row, "display", "grid");
      setStyle(row, "gridTemplateColumns", "auto 1fr");
      setStyle(row, "gap", "8px");
      setStyle(row, "alignItems", "center");
      const checkbox = row.createEl("input", { type: "checkbox" });
      checkbox.checked = active.has(normalized);
      checkbox.title = "Use links from this source property as graph root nodes";
      checkbox.addEventListener("change", () => {
        checkbox.disabled = true;
        const task = checkbox.checked
          ? this.addRootNodeProperty(property)
          : this.removeRootNodeProperty(property);
        void task.finally(() => {
          checkbox.disabled = false;
        });
      });
      const label = row.createDiv({ text: property });
      setStyle(label, "fontSize", "12px");
      setStyle(label, "opacity", property === NONE_LINK_TYPE ? "0.78" : "0.9");
    }
  }

  private openCreateLinkTypeModal(): void {
    const propertyOptions = this.discoveredProperties
      .map((item) => String(item ?? "").trim().toLowerCase())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    if (propertyOptions.length === 0) {
      new Notice("No graph node properties available to create a LinkType.");
      return;
    }

    const modal = new CreateLinkTypeModal(this.app, {
      propertyOptions,
      title: "Create LinkType",
      submitLabel: "Create",
      initialLinkType: "Force Based",
      onSubmit: (payload) => {
        void this.createAndActivateLinkType(payload);
      }
    });
    modal.open();
  }

  private openEditLinkTypeModal(linkType: O3LinkType): void {
    const currentProperty = String(linkType.property ?? "").trim().toLowerCase();
    const propertyOptions = Array.from(new Set([
      ...this.discoveredProperties.map((item) => String(item ?? "").trim().toLowerCase()).filter(Boolean),
      ...this.globalLinkTypeRegistry.getAll().map((item) => String(item.property ?? "").trim().toLowerCase()).filter(Boolean),
      currentProperty
    ])).sort((a, b) => a.localeCompare(b));
    if (propertyOptions.length === 0) {
      new Notice("No properties available.");
      return;
    }

    const modal = new CreateLinkTypeModal(this.app, {
      propertyOptions,
      initialProperty: currentProperty,
      initialLabel: String(linkType.key ?? "").trim(),
      initialLinkType: linkType.semantic === "parent"
        ? "parent"
        : linkType.linkType === "Direction Based"
          ? "Direction Based"
          : "Force Based",
      initialDirection: String(linkType.direction ?? "").trim().toLowerCase() as "incoming" | "outgoing" | "both",
      initialLinkDiscoveryDirection: linkType.linkDiscoveryDirection,
      initialRecursive: Boolean(linkType.recursive),
      initialLinkDiscovery: linkType.linkDiscovery !== false,
      initialLinkDuplicateNodes: linkType.linkDuplicateNodes === true,
      initialLinkForce: Number(linkType.linkForce),
      initialLinkDistance: Number(linkType.linkDistance),
      initialLinkDirection: String(linkType.linkDirection ?? "right"),
      initialLinkYAxis: Number(linkType.linkYAxis),
      initialLinkXAxis: Number(linkType.linkXAxis),
      title: "Edit LinkType",
      submitLabel: "Save",
      openFileLabel: "Open File",
      onOpenFile: () => {
        void this.openLinkTypeFile(linkType);
      },
      onSubmit: (payload) => {
        void this.updateExistingLinkType(linkType, payload);
      }
    });
    modal.open();
  }

  private async openLinkTypeFile(linkType: O3LinkType): Promise<void> {
    const file = linkType.file;
    if (!(file instanceof TFile)) {
      new Notice("LinkType file not found.");
      return;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { active: true });
  }

  private async createAndActivateLinkType(payload: CreateLinkTypePayload): Promise<void> {
    const canonical = String(payload.property ?? "").trim().toLowerCase();
    const normalizedLabel = String(payload.label ?? "").trim();
    const linkTypeMode = payload.linkType === "Direction Based"
      ? "Direction Based"
      : payload.linkType === "parent"
        ? "parent"
        : "Force Based";
    const direction = payload.direction === "incoming" || payload.direction === "both"
      ? payload.direction
      : "outgoing";
    const linkDiscoveryDirection = payload.linkDiscoveryDirection === "incoming" || payload.linkDiscoveryDirection === "both"
      ? payload.linkDiscoveryDirection
      : "outgoing";
    const recursive = Boolean(payload.recursive);
    const linkDuplicateNodes = payload.linkDuplicateNodes === true;
    const linkDiscovery = linkDuplicateNodes ? false : (payload.linkDiscovery === false ? false : true);
    const linkForce = Number(payload.linkForce);
    const linkDistance = Number(payload.linkDistance);
    const linkDirectionRaw = String(payload.linkDirection ?? "right").trim().toLowerCase();
    const linkDirection = (
      linkDirectionRaw === "left" || linkDirectionRaw === "up" || linkDirectionRaw === "down"
    ) ? linkDirectionRaw : "right";
    const linkYAxis = Number(payload.linkYAxis);
    const linkXAxis = Number(payload.linkXAxis);
    if (!canonical || !normalizedLabel) {
      new Notice("LinkType property and label are required.");
      return;
    }
    if (
      (linkTypeMode !== "Direction Based" && (!Number.isFinite(linkForce) || !Number.isFinite(linkDistance)))
      || (linkTypeMode === "Direction Based" && (!Number.isFinite(linkYAxis) || !Number.isFinite(linkXAxis)))
    ) {
      new Notice("Please provide valid numeric link-type parameters.");
      return;
    }

    const filePath = `${this.linkTypeFolder}/LinkType - ${normalizedLabel}.md`;
    const existingFile = this.app.vault.getAbstractFileByPath(filePath);
    if (!existingFile) {
      const content = [
        "---",
        `${this.noteTypeIdentifiers.linkType.property}: ${this.formatIdentifierFrontmatterValue(this.noteTypeIdentifiers.linkType)}`,
        `${this.linkTypePropertyKeys.key}: ${normalizedLabel}`,
        `${this.linkTypePropertyKeys.property}: ${canonical}`,
        `${this.linkTypePropertyKeys.linkType}: ${linkTypeMode}`,
        `${this.linkTypePropertyKeys.direction}: ${direction}`,
        `${this.linkTypePropertyKeys.linkDiscoveryDirection}: ${linkDiscoveryDirection}`,
        `${this.linkTypePropertyKeys.recursive}: ${recursive ? "true" : "false"}`,
        `${this.linkTypePropertyKeys.linkDiscovery}: ${linkDiscovery ? "true" : "false"}`,
        `${this.linkTypePropertyKeys.linkDuplicateNodes}: ${linkDuplicateNodes ? "true" : "false"}`,
        ...(linkTypeMode !== "Direction Based"
          ? [
              `${this.linkTypePropertyKeys.linkForce}: ${linkForce}`,
              `${this.linkTypePropertyKeys.linkDistance}: ${linkDistance}`
            ]
          : [
              `${this.linkTypePropertyKeys.linkDirection}: ${linkDirection}`,
              `${this.linkTypePropertyKeys.linkYAxis}: ${linkYAxis}`,
              `${this.linkTypePropertyKeys.linkXAxis}: ${linkXAxis}`
            ]),
        "---",
        ""
      ].join("\n");

      try {
        await this.ensureLinkTypeFolderExists();
        await this.app.vault.create(filePath, content);
      } catch (error) {
        console.error("[GraphView] Failed to create LinkType file:", error);
        new Notice("Failed to create LinkType file.");
        return;
      }
    } else {
      new Notice("LinkType file already exists");
    }

    await this.loadLinkTypeRegistry();
    const linkType = this.globalLinkTypeRegistry
      .getAll()
      .find((item) => String(item.file?.path ?? "").trim() === filePath);
    if (!linkType) {
      new Notice("Created LinkType could not be loaded.");
      return;
    }

    await this.activateLinkType(linkType);
  }

  private async ensureLinkTypeFolderExists(): Promise<void> {
    const normalized = String(this.linkTypeFolder ?? "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/")
      .replace(/^\/+|\/+$/g, "");
    if (!normalized) return;

    const segments = normalized.split("/").filter(Boolean);
    let currentPath = "";
    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const existing = this.app.vault.getAbstractFileByPath(currentPath);
      if (!existing) {
        try {
          await this.app.vault.createFolder(currentPath);
        } catch (error) {
          const message = String(
            error && typeof error === "object" && "message" in error
              ? (error as { message?: unknown }).message
              : ""
          ).toLowerCase();
          if (message.includes("already exists")) {
            continue;
          }
          throw error;
        }
      }
    }
  }

  private async updateExistingLinkType(linkType: O3LinkType, payload: CreateLinkTypePayload): Promise<void> {
    const canonical = String(payload.property ?? "").trim().toLowerCase();
    const normalizedLabel = String(payload.label ?? "").trim();
    const linkTypeMode = payload.linkType === "Direction Based"
      ? "Direction Based"
      : payload.linkType === "parent"
        ? "parent"
        : "Force Based";
    const direction = payload.direction === "incoming" || payload.direction === "both"
      ? payload.direction
      : "outgoing";
    const linkDiscoveryDirection = payload.linkDiscoveryDirection === "incoming" || payload.linkDiscoveryDirection === "both"
      ? payload.linkDiscoveryDirection
      : "outgoing";
    const recursive = Boolean(payload.recursive);
    const linkDuplicateNodes = payload.linkDuplicateNodes === true;
    const linkDiscovery = linkDuplicateNodes ? false : (payload.linkDiscovery === false ? false : true);
    const linkForce = Number(payload.linkForce);
    const linkDistance = Number(payload.linkDistance);
    const linkDirectionRaw = String(payload.linkDirection ?? "right").trim().toLowerCase();
    const linkDirection = (
      linkDirectionRaw === "left" || linkDirectionRaw === "up" || linkDirectionRaw === "down"
    ) ? linkDirectionRaw : "right";
    const linkYAxis = Number(payload.linkYAxis);
    const linkXAxis = Number(payload.linkXAxis);
    if (!canonical || !normalizedLabel) {
      new Notice("LinkType property and label are required.");
      return;
    }
    if (
      (linkTypeMode !== "Direction Based" && (!Number.isFinite(linkForce) || !Number.isFinite(linkDistance)))
      || (linkTypeMode === "Direction Based" && (!Number.isFinite(linkYAxis) || !Number.isFinite(linkXAxis)))
    ) {
      new Notice("Please provide valid numeric link-type parameters.");
      return;
    }

    const filePath = String(linkType.file?.path ?? "").trim();
    if (!filePath) {
      new Notice("LinkType file not found.");
      return;
    }

    const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
    if (!(abstractFile instanceof TFile)) {
      new Notice("LinkType file not found.");
      return;
    }

    let content: string;
    try {
      content = await this.app.vault.read(abstractFile);
    } catch (error) {
      console.error("[GraphView] Failed to read LinkType file:", error);
      new Notice("Failed to read LinkType file.");
      return;
    }

    const { frontmatter, body, hasFrontmatter, eol } = this.parseFrontmatter(content);
    this.writeLinkTypeFrontmatterProperty(frontmatter, "key", normalizedLabel);
    this.writeLinkTypeFrontmatterProperty(frontmatter, "property", canonical);
    this.writeLinkTypeFrontmatterProperty(frontmatter, "linkType", linkTypeMode);
    this.writeLinkTypeFrontmatterProperty(frontmatter, "direction", direction);
    this.writeLinkTypeFrontmatterProperty(frontmatter, "linkDiscoveryDirection", linkDiscoveryDirection);
    this.writeLinkTypeFrontmatterProperty(frontmatter, "recursive", recursive);
    this.writeLinkTypeFrontmatterProperty(frontmatter, "linkDiscovery", linkDiscovery);
    this.writeLinkTypeFrontmatterProperty(frontmatter, "linkDuplicateNodes", linkDuplicateNodes);
    if (linkTypeMode !== "Direction Based") {
      this.writeLinkTypeFrontmatterProperty(frontmatter, "linkForce", linkForce);
      this.writeLinkTypeFrontmatterProperty(frontmatter, "linkDistance", linkDistance);
      this.deleteLinkTypeFrontmatterProperty(frontmatter, "linkDirection");
      this.deleteLinkTypeFrontmatterProperty(frontmatter, "linkYAxis");
      this.deleteLinkTypeFrontmatterProperty(frontmatter, "linkXAxis");
    } else {
      this.writeLinkTypeFrontmatterProperty(frontmatter, "linkDirection", linkDirection);
      this.writeLinkTypeFrontmatterProperty(frontmatter, "linkYAxis", linkYAxis);
      this.writeLinkTypeFrontmatterProperty(frontmatter, "linkXAxis", linkXAxis);
      this.deleteLinkTypeFrontmatterProperty(frontmatter, "linkForce");
      this.deleteLinkTypeFrontmatterProperty(frontmatter, "linkDistance");
    }

    const updatedContent = this.serializeFrontmatter(frontmatter, body, {
      hasFrontmatter,
      eol
    });

    try {
      await this.app.vault.modify(abstractFile, updatedContent);
      await this.loadLinkTypeRegistry();
      await this.reloadFromFile();
    } catch (error) {
      console.error("[GraphView] Failed to update LinkType:", error);
      new Notice("Failed to update LinkType.");
    }
  }

  private async activateLinkType(linkType: O3LinkType): Promise<void> {
    await this.writeLinkTypeToGraphYaml(linkType);
  }

  private async deactivateLinkType(linkType: O3LinkType): Promise<void> {
    if (!this.file?.path) {
      new Notice("No graph file is currently open.");
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(this.file.path);
    if (!(file instanceof TFile)) {
      new Notice("Graph file not found.");
      return;
    }

    let content: string;
    try {
      content = await this.app.vault.read(file);
    } catch (error) {
      console.error("[GraphView] Failed to read graph file:", error);
      new Notice("Failed to read graph file.");
      return;
    }

    const { frontmatter, body, hasFrontmatter, eol } = this.parseFrontmatter(content);
    const rawActiveValue = readFrontmatterPropertyByKey(frontmatter, this.graphPropertyKeys, "activeLinkTypes");
    const rawActive = Array.isArray(rawActiveValue)
      ? rawActiveValue
      : [];
    const nextActive: string[] = [];

    for (const item of rawActive) {
      const text = String(item ?? "").trim();
      if (!text) continue;

      const unwrapped = text.replace(/^\[\[/, "").replace(/\]\]$/, "").trim();
      const linkpath = unwrapped.split("|")[0]?.trim() ?? "";
      const resolved = this.app.metadataCache.getFirstLinkpathDest(linkpath, file.path)
        ?? this.app.metadataCache.getFirstLinkpathDest(text, file.path);

      const matchesByPath = resolved?.path === linkType.file.path;
      const matchesByName = linkpath.length > 0 && (
        linkpath === linkType.file.basename
        || linkpath === linkType.file.path
      );
      const matchesByLabel = text === `[[LinkType - ${String(linkType.key ?? "").trim()}]]`;

      if (matchesByPath || matchesByName || matchesByLabel) {
        continue;
      }
      nextActive.push(text);
    }

    const changed = nextActive.length !== rawActive.length;
    if (!changed) {
      await this.reloadFromFile();
      return;
    }

    writeFrontmatterProperty(frontmatter, this.graphPropertyKeys, "activeLinkTypes", nextActive);
    const updatedContent = this.serializeFrontmatter(frontmatter, body, {
      hasFrontmatter,
      eol
    });

    try {
      await this.app.vault.modify(file, updatedContent);
      await this.reloadFromFile();
    } catch (error) {
      console.error("[GraphView] Failed to deactivate LinkType:", error);
      new Notice("Failed to deactivate LinkType.");
    }
  }

  private async activateOverlayLinkType(linkType: O3LinkType): Promise<void> {
    await this.addLinkTypeToGraphYamlList(linkType, "activeOverlayLinkTypes");
  }

  private async deactivateOverlayLinkType(linkType: O3LinkType): Promise<void> {
    await this.removeLinkTypeFromGraphYamlList(linkType, "activeOverlayLinkTypes");
  }

  private async activateVisibleLinkType(linkType: O3LinkType): Promise<void> {
    await this.addLinkTypeToGraphYamlList(linkType, "visibleLinkTypes");
  }

  private async deactivateVisibleLinkType(linkType: O3LinkType): Promise<void> {
    await this.removeLinkTypeFromGraphYamlList(linkType, "visibleLinkTypes");
  }

  private async addLinkTypeToGraphYamlList(
    linkType: O3LinkType,
    propertyKey: "activeOverlayLinkTypes" | "visibleLinkTypes"
  ): Promise<void> {
    const file = this.file?.path ? this.app.vault.getAbstractFileByPath(this.file.path) : null;
    if (!(file instanceof TFile)) {
      new Notice("Graph file not found.");
      return;
    }

    const content = await this.app.vault.read(file);
    const { frontmatter, body, hasFrontmatter, eol } = this.parseFrontmatter(content);
    const wikilink = `[[${String(linkType.file?.basename ?? "").trim()}]]`;
    const rawValue = readFrontmatterPropertyByKey(frontmatter, this.graphPropertyKeys, propertyKey);
    const rawList = Array.isArray(rawValue) ? rawValue : [];
    const activeList = rawList.map((item) => String(item ?? "").trim()).filter(Boolean);
    const alreadyActive = activeList.some((entry) => this.graphYamlLinkTypeEntryMatches(entry, linkType, file));
    if (!alreadyActive) {
      writeFrontmatterProperty(frontmatter, this.graphPropertyKeys, propertyKey, [...activeList, wikilink]);
      const updatedContent = this.serializeFrontmatter(frontmatter, body, { hasFrontmatter, eol });
      await this.app.vault.modify(file, updatedContent);
    }
    await this.reloadFromFile();
  }

  private async removeLinkTypeFromGraphYamlList(
    linkType: O3LinkType,
    propertyKey: "activeOverlayLinkTypes" | "visibleLinkTypes"
  ): Promise<void> {
    const file = this.file?.path ? this.app.vault.getAbstractFileByPath(this.file.path) : null;
    if (!(file instanceof TFile)) {
      new Notice("Graph file not found.");
      return;
    }

    const content = await this.app.vault.read(file);
    const { frontmatter, body, hasFrontmatter, eol } = this.parseFrontmatter(content);
    const rawValue = readFrontmatterPropertyByKey(frontmatter, this.graphPropertyKeys, propertyKey);
    const rawList = Array.isArray(rawValue) ? rawValue : [];
    const next = rawList
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .filter((entry) => !this.graphYamlLinkTypeEntryMatches(entry, linkType, file));
    if (next.length !== rawList.length) {
      writeFrontmatterProperty(frontmatter, this.graphPropertyKeys, propertyKey, next);
      const updatedContent = this.serializeFrontmatter(frontmatter, body, { hasFrontmatter, eol });
      await this.app.vault.modify(file, updatedContent);
    }
    await this.reloadFromFile();
  }

  private async addRootNodeProperty(propertyName: string): Promise<void> {
    await this.updateRootNodePropertyList(propertyName, true);
  }

  private async removeRootNodeProperty(propertyName: string): Promise<void> {
    await this.updateRootNodePropertyList(propertyName, false);
  }

  private async updateRootNodePropertyList(propertyNameRaw: string, active: boolean): Promise<void> {
    const propertyName = String(propertyNameRaw ?? "").trim();
    if (!propertyName) return;
    const file = this.file?.path ? this.app.vault.getAbstractFileByPath(this.file.path) : null;
    if (!(file instanceof TFile)) {
      new Notice("Graph file not found.");
      return;
    }

    const content = await this.app.vault.read(file);
    const { frontmatter, body, hasFrontmatter, eol } = this.parseFrontmatter(content);
    const rawValue = readFrontmatterPropertyByKey(frontmatter, this.graphPropertyKeys, "rootNodeProperties");
    const rawList = Array.isArray(rawValue)
      ? rawValue.map((item) => String(item ?? "").trim()).filter(Boolean)
      : (typeof rawValue === "string" && rawValue.trim() ? [rawValue.trim()] : []);
    const normalized = propertyName.toLowerCase();
    const current = rawList.filter((item) => item.toLowerCase() !== normalized);
    const next = active ? [...current, propertyName] : current;
    if (next.length === rawList.length && next.every((item, index) => item === rawList[index])) {
      await this.reloadFromFile();
      return;
    }
    writeFrontmatterProperty(frontmatter, this.graphPropertyKeys, "rootNodeProperties", next);
    const updatedContent = this.serializeFrontmatter(frontmatter, body, { hasFrontmatter, eol });
    await this.app.vault.modify(file, updatedContent);
    await this.reloadFromFile();
  }

  private graphYamlLinkTypeEntryMatches(entry: string, linkType: O3LinkType, graphFile: TFile): boolean {
    const text = String(entry ?? "").trim();
    if (!text) return false;
    const unwrapped = text.replace(/^\[\[/, "").replace(/\]\]$/, "").trim();
    const linkpath = unwrapped.split("|")[0]?.trim() ?? "";
    const resolved = this.app.metadataCache.getFirstLinkpathDest(linkpath, graphFile.path)
      ?? this.app.metadataCache.getFirstLinkpathDest(text, graphFile.path);
    return resolved?.path === linkType.file.path
      || linkpath === linkType.file.basename
      || linkpath === linkType.file.path;
  }

  private async writeLinkTypeToGraphYaml(linkType: O3LinkType): Promise<void> {
    if (!this.file?.path) {
      new Notice("No graph file is currently open.");
      return;
    }

    const graphPath = this.file.path;
    const file = this.app.vault.getAbstractFileByPath(graphPath);
    if (!file || !(file instanceof TFile)) {
      new Notice("Graph file not found.");
      return;
    }

    let content: string;

    try {
      content = await this.app.vault.read(file);
    } catch (error) {
      console.error("[GraphView] Failed to read graph file:", error);
      new Notice("Failed to read graph file.");
      return;
    }

    const { frontmatter, body, hasFrontmatter, eol } = this.parseFrontmatter(content);
    const wikilink = `[[${String(linkType.file?.basename ?? "").trim()}]]`;
    const targetProperty = String(linkType.property ?? "").trim().toLowerCase();

    const rawActive = readFrontmatterPropertyByKey(frontmatter, this.graphPropertyKeys, "activeLinkTypes");
    const activeList = Array.isArray(rawActive)
      ? rawActive.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];
    const nextActive: string[] = [];
    let changed = false;

    for (const entry of activeList) {
      const text = String(entry ?? "").trim();
      if (!text) continue;

      const unwrapped = text.replace(/^\[\[/, "").replace(/\]\]$/, "").trim();
      const linkpath = unwrapped.split("|")[0]?.trim() ?? "";
      const resolved = this.app.metadataCache.getFirstLinkpathDest(linkpath, file.path)
        ?? this.app.metadataCache.getFirstLinkpathDest(text, file.path);

      const isTargetLinkType = resolved?.path === linkType.file.path
        || linkpath === linkType.file.basename
        || linkpath === linkType.file.path;
      if (isTargetLinkType) {
        changed = true;
        continue;
      }

      if (targetProperty && resolved) {
        const existing = this.linkTypeRegistry.get(resolved.path);
        const existingProperty = String(existing?.property ?? "").trim().toLowerCase();
        if (existingProperty && existingProperty === targetProperty) {
          changed = true;
          continue;
        }
      }

      nextActive.push(text);
    }

    if (!nextActive.includes(wikilink)) {
      nextActive.push(wikilink);
      changed = true;
    }
    if (!changed) {
      await this.reloadFromFile();
      return;
    }
    writeFrontmatterProperty(frontmatter, this.graphPropertyKeys, "activeLinkTypes", nextActive);

    const updatedContent = this.serializeFrontmatter(frontmatter, body, {
      hasFrontmatter,
      eol
    });

    try {
      await this.app.vault.modify(file, updatedContent);
      await this.reloadFromFile();
    } catch (error) {
      console.error("[GraphView] Failed to activate LinkType:", error);
      new Notice("Failed to activate LinkType.");
    }
  }

  private async updateLinkTypeFile(
    linkType: O3LinkType,
    updates: {
      linkType?: "Force Based" | "Direction Based" | "parent";
      direction?: string;
      recursive?: boolean;
      linkDiscovery?: boolean;
      linkDuplicateNodes?: boolean;
      linkForce?: number;
      linkDistance?: number;
      linkDirection?: string;
      linkYAxis?: number;
      linkXAxis?: number;
    }
  ): Promise<void> {
    const filePath = String(linkType.file?.path ?? "").trim();
    if (!filePath) {
      new Notice("LinkType file not found.");
      return;
    }

    const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
    if (!(abstractFile instanceof TFile)) {
      new Notice("LinkType file not found.");
      return;
    }

    let content: string;
    try {
      content = await this.app.vault.read(abstractFile);
    } catch (error) {
      console.error("[GraphView] Failed to read LinkType file:", error);
      new Notice("Failed to read LinkType file.");
      return;
    }

    const { frontmatter, body, hasFrontmatter, eol } = this.parseFrontmatter(content);
    const currentMode = String(this.readLinkTypeFrontmatterProperty(frontmatter, "linkType") ?? "").trim();
    const mode = updates.linkType === "Direction Based"
      ? "Direction Based"
      : updates.linkType === "parent"
        ? "parent"
        : updates.linkType === "Force Based"
          ? "Force Based"
          : currentMode.toLowerCase() === "parent"
            ? "parent"
            : currentMode === "Direction Based"
              ? "Direction Based"
              : "Force Based";
    this.writeLinkTypeFrontmatterProperty(frontmatter, "linkType", mode);

    const nextDirection = String(updates.direction ?? "").trim().toLowerCase();
    if (nextDirection === "outgoing" || nextDirection === "incoming" || nextDirection === "both") {
      this.writeLinkTypeFrontmatterProperty(frontmatter, "direction", nextDirection);
    }
    if (typeof updates.recursive === "boolean") {
      this.writeLinkTypeFrontmatterProperty(frontmatter, "recursive", updates.recursive);
    }
    const linkDuplicateNodes = typeof updates.linkDuplicateNodes === "boolean"
      ? updates.linkDuplicateNodes
      : (this.readLinkTypeFrontmatterProperty(frontmatter, "linkDuplicateNodes") === true);
    this.writeLinkTypeFrontmatterProperty(frontmatter, "linkDuplicateNodes", linkDuplicateNodes);
    if (typeof updates.linkDiscovery === "boolean") {
      this.writeLinkTypeFrontmatterProperty(frontmatter, "linkDiscovery", linkDuplicateNodes ? false : updates.linkDiscovery);
    } else if (typeof this.readLinkTypeFrontmatterProperty(frontmatter, "linkDiscovery") !== "boolean") {
      this.writeLinkTypeFrontmatterProperty(frontmatter, "linkDiscovery", linkDuplicateNodes ? false : true);
    } else if (linkDuplicateNodes) {
      this.writeLinkTypeFrontmatterProperty(frontmatter, "linkDiscovery", false);
    }
    if (mode !== "Direction Based") {
      if (Number.isFinite(Number(updates.linkForce))) {
        this.writeLinkTypeFrontmatterProperty(frontmatter, "linkForce", Number(updates.linkForce));
      } else if (!Number.isFinite(Number(this.readLinkTypeFrontmatterProperty(frontmatter, "linkForce")))) {
        this.writeLinkTypeFrontmatterProperty(frontmatter, "linkForce", 0.01);
      }
      if (Number.isFinite(Number(updates.linkDistance))) {
        this.writeLinkTypeFrontmatterProperty(frontmatter, "linkDistance", Number(updates.linkDistance));
      } else if (!Number.isFinite(Number(this.readLinkTypeFrontmatterProperty(frontmatter, "linkDistance")))) {
        this.writeLinkTypeFrontmatterProperty(frontmatter, "linkDistance", 120);
      }
      this.deleteLinkTypeFrontmatterProperty(frontmatter, "linkDirection");
      this.deleteLinkTypeFrontmatterProperty(frontmatter, "linkYAxis");
      this.deleteLinkTypeFrontmatterProperty(frontmatter, "linkXAxis");
    } else {
      if (typeof updates.linkDirection === "string" && updates.linkDirection.trim().length > 0) {
        const nextDirection = updates.linkDirection.trim().toLowerCase();
        this.writeLinkTypeFrontmatterProperty(frontmatter, "linkDirection", (
          nextDirection === "left" || nextDirection === "up" || nextDirection === "down"
        ) ? nextDirection : "right");
      } else if (typeof this.readLinkTypeFrontmatterProperty(frontmatter, "linkDirection") !== "string" || !String(this.readLinkTypeFrontmatterProperty(frontmatter, "linkDirection") ?? "").trim()) {
        this.writeLinkTypeFrontmatterProperty(frontmatter, "linkDirection", "right");
      }
      if (Number.isFinite(Number(updates.linkYAxis))) {
        this.writeLinkTypeFrontmatterProperty(frontmatter, "linkYAxis", Number(updates.linkYAxis));
      } else if (!Number.isFinite(Number(this.readLinkTypeFrontmatterProperty(frontmatter, "linkYAxis")))) {
        this.writeLinkTypeFrontmatterProperty(frontmatter, "linkYAxis", 1);
      }
      if (Number.isFinite(Number(updates.linkXAxis))) {
        this.writeLinkTypeFrontmatterProperty(frontmatter, "linkXAxis", Number(updates.linkXAxis));
      } else if (!Number.isFinite(Number(this.readLinkTypeFrontmatterProperty(frontmatter, "linkXAxis")))) {
        this.writeLinkTypeFrontmatterProperty(frontmatter, "linkXAxis", 0);
      }
      this.deleteLinkTypeFrontmatterProperty(frontmatter, "linkForce");
      this.deleteLinkTypeFrontmatterProperty(frontmatter, "linkDistance");
    }

    const updatedContent = this.serializeFrontmatter(frontmatter, body, {
      hasFrontmatter,
      eol
    });

    try {
      await this.app.vault.modify(abstractFile, updatedContent);
    } catch (error) {
      console.error("[GraphView] Failed to update LinkType file:", error);
      new Notice("Failed to update LinkType file.");
    }
  }

  private async buildGraph(): Promise<void> {
    if (!this.initialized) return;
    if (this.isFileMode) {
      this.rebuildGraph(this.currentGraphFiles);
      return;
    }
    this.rebuildGraph();
  }

  private mergeGraphFiles(...groups: TFile[][]): TFile[] {
    const out: TFile[] = [];
    const seen = new Set<string>();
    for (const group of groups) {
      for (const file of group) {
        if (!(file instanceof TFile)) continue;
        if (seen.has(file.path)) continue;
        seen.add(file.path);
        out.push(file);
      }
    }
    return out;
  }

  private resolveGraphStateSnapshotFiles(): TFile[] {
    const snapshots = this.graphState?.toRuntimeNodeSnapshots() ?? [];
    const files: TFile[] = [];
    const seen = new Set<string>();
    for (const snapshot of snapshots) {
      const path = String(snapshot?.path ?? "").trim();
      if (!path || seen.has(path)) continue;
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || file.extension !== "md") continue;
      seen.add(file.path);
      files.push(file);
    }
    return files;
  }

  private renderLinkTypeMenu(): void {
    this.engine.refreshLinkTypeMenu();
  }

  private readLinkTypeFrontmatterProperty(
    frontmatter: Record<string, unknown>,
    key: keyof LinkTypePropertyKeys
  ): unknown {
    const configured = String(this.linkTypePropertyKeys[key] ?? "").trim();
    const fallback = String(DEFAULT_LINK_TYPE_PROPERTY_KEYS[key] ?? "").trim();
    for (const property of [configured, fallback]) {
      if (property && Object.prototype.hasOwnProperty.call(frontmatter, property)) {
        return frontmatter[property];
      }
    }
    return undefined;
  }

  private writeLinkTypeFrontmatterProperty(
    frontmatter: Record<string, unknown>,
    key: keyof LinkTypePropertyKeys,
    value: unknown
  ): void {
    const configured = String(this.linkTypePropertyKeys[key] ?? "").trim();
    const fallback = String(DEFAULT_LINK_TYPE_PROPERTY_KEYS[key] ?? "").trim();
    const property = configured || fallback;
    if (!property) return;
    frontmatter[property] = value;
    if (fallback && fallback !== property && Object.prototype.hasOwnProperty.call(frontmatter, fallback)) {
      delete frontmatter[fallback];
    }
  }

  private deleteLinkTypeFrontmatterProperty(
    frontmatter: Record<string, unknown>,
    key: keyof LinkTypePropertyKeys
  ): void {
    const configured = String(this.linkTypePropertyKeys[key] ?? "").trim();
    const fallback = String(DEFAULT_LINK_TYPE_PROPERTY_KEYS[key] ?? "").trim();
    for (const property of new Set([configured, fallback])) {
      if (property) delete frontmatter[property];
    }
  }

  private parseFrontmatter(content: string): {
    frontmatter: Record<string, unknown>;
    body: string;
    hasFrontmatter: boolean;
    eol: string;
  } {
    const eol = content.includes("\r\n") ? "\r\n" : "\n";
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);

    if (!frontmatterMatch) {
      return {
        frontmatter: {},
        body: content,
        hasFrontmatter: false,
        eol
      };
    }

    const frontmatterBody = frontmatterMatch[1];
    const parsed = parseYaml(frontmatterBody);
    const frontmatter: Record<string, unknown> = (parsed && typeof parsed === "object")
      ? { ...(parsed as Record<string, unknown>) }
      : {};
    const body = content.slice(frontmatterMatch[0].length);

    return {
      frontmatter,
      body,
      hasFrontmatter: true,
      eol
    };
  }

  private serializeFrontmatter(
    frontmatter: Record<string, unknown>,
    body: string,
    options: { hasFrontmatter: boolean; eol: string }
  ): string {
    const { hasFrontmatter, eol } = options;
    const nextFrontmatterBody = stringifyYaml(frontmatter).trimEnd();
    const normalizedBody = body.startsWith("\n") || body.startsWith("\r\n")
      ? body.replace(/^\r?\n/, "")
      : body;

    if (hasFrontmatter) {
      return `---${eol}${nextFrontmatterBody}${eol}---${eol}${normalizedBody}`;
    }
    return `---${eol}${nextFrontmatterBody}${eol}---${eol}${body}`;
  }

  private discoverLinkableProperties(): Set<string> {
    const props = new Set<string>();

    for (const file of this.currentGraphFiles) {
      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = cache?.frontmatter;
      if (!frontmatter || typeof frontmatter !== "object") continue;

      for (const [rawKey, rawValue] of Object.entries(frontmatter)) {
        const key = String(rawKey ?? "").trim().toLowerCase();
        if (!key || key === "position") continue;
        if (
          (typeof rawValue === "string" && rawValue.includes("[[")) ||
          (Array.isArray(rawValue) &&
            rawValue.some(
              (v) => typeof v === "string" && v.includes("[[")
            ))
        ) {
          props.add(key);
        }
      }
    }

    return props;
  }

  private discoverSourceLinkProperties(frontmatter: Record<string, unknown>): string[] {
    const props = new Set<string>();
    for (const [rawKey, rawValue] of Object.entries(frontmatter ?? {})) {
      const key = String(rawKey ?? "").trim().toLowerCase();
      if (!key || key === "position") continue;
      if (extractInternalLinkCandidates(rawValue).length > 0) {
        props.add(key);
      }
    }
    if (this.resolveBodyLinkFiles(this.file).length > 0) {
      props.add(NONE_LINK_TYPE);
    }
    return Array.from(props).sort((a, b) => a.localeCompare(b));
  }

  private renderRootNodeList(): void {
    const list = this.rootListEl;
    if (!list) return;
    list.empty();

    if (this.viewStateModel.rootNodes.length === 0) {
      const empty = list.createDiv({ text: "No roots yet. Add a note to start." });
      setStyle(empty, "opacity", "0.7");
      setStyle(empty, "fontSize", "12px");
      return;
    }

    for (const root of this.viewStateModel.rootNodes) {
      const row = list.createDiv();
      setStyle(row, "display", "flex");
      setStyle(row, "alignItems", "center");
      setStyle(row, "justifyContent", "space-between");
      setStyle(row, "gap", "8px");

      row.createSpan({ text: root });
      const removeBtn = row.createEl("button", { text: "Remove" });
      removeBtn.addEventListener("click", () => {
        this.removeRootNode(root);
      });
    }
  }

  private async addRootNodeFromInput(): Promise<void> {
    const input = this.rootInputEl;
    if (!input) return;
    const raw = String(input.value ?? "").trim();
    if (!raw) return;

    const file = this.app.metadataCache.getFirstLinkpathDest(raw, "");
    if (!(file instanceof TFile)) return;

    await this.addRootFiles([file]);
    input.value = "";
  }

  private async requestRootNodeInput(ownerPath?: string | null): Promise<void> {
    const contextPath = String(ownerPath ?? "").trim();
    const sourcePath = contextPath || this.file?.path || "";
    const file = await new ObsidianGraphRootInputHandler(this.app).requestRootFile(sourcePath);
    if (!(file instanceof TFile)) return;
    if (contextPath) {
      const ownerFile = this.app.vault.getAbstractFileByPath(contextPath);
      if (ownerFile instanceof TFile) {
        const propertyNames = this.getRootNodePropertyNamesForFile(ownerFile);
        const result = await new ObsidianGraphRootPropertyMutationHandler(this.app).addFiles({
          ownerPath: ownerFile.path,
          files: [file],
          propertyNames
        });
        if (result.added > 0) {
          this.embeddedGraphStates.delete(ownerFile.path);
          this.embeddedGraphDocumentStores.delete(ownerFile.path);
          await this.reloadFromFile();
        } else if (propertyNames.length === 0) {
          new Notice("No root node property configured for this lens.");
        }
        return;
      }
    }
    await this.addRootFiles([file]);
  }

  private onGraphDragOver(event: DragEvent): void {
    if (!this.canAcceptGraphDrop(event.dataTransfer)) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  }

  private async onGraphDrop(event: DragEvent): Promise<void> {
    const files = this.resolveDroppedRootFiles(event.dataTransfer);
    if (files.length === 0) return;
    event.preventDefault();
    const embeddedGraphPath = this.engine.getEmbeddedGraphPathAtClientPosition(event.clientX, event.clientY);
    if (embeddedGraphPath) {
      const embeddedGraphFile = this.app.vault.getAbstractFileByPath(embeddedGraphPath);
      if (embeddedGraphFile instanceof TFile) {
        const added = await this.addRootFilesToGraphNoteFrontmatter(embeddedGraphFile, files);
        if (added > 0) {
          await this.synchronizeEmbeddedRootAdditions(embeddedGraphFile, files);
          this.embeddedGraphStates.delete(embeddedGraphPath);
          this.embeddedGraphDocumentStores.delete(embeddedGraphPath);
          await this.reloadFromFile();
        }
      }
      return;
    }
    await this.addRootFiles(files);
  }

  private canAcceptGraphDrop(dataTransfer: DataTransfer | null): boolean {
    if (!dataTransfer) return false;
    const types = Array.from(dataTransfer.types ?? []);
    return types.some((type) => [
      "application/x-o3-graph-node-paths",
      "text/markdown",
      "text/plain",
      "text/html",
      "Files"
    ].includes(type));
  }

  private resolveDroppedRootFiles(dataTransfer: DataTransfer | null): TFile[] {
    if (!dataTransfer) return [];
    const candidates: string[] = [];

    const graphPaths = dataTransfer.getData("application/x-o3-graph-node-paths");
    if (graphPaths) {
      try {
        const parsed = JSON.parse(graphPaths);
        if (Array.isArray(parsed)) {
          candidates.push(...parsed.map((value) => String(value ?? "")));
        }
      } catch {
        candidates.push(graphPaths);
      }
    }

    for (const type of ["text/markdown", "text/plain", "text/html", "text/uri-list"]) {
      const text = dataTransfer.getData(type);
      if (text) {
        candidates.push(...this.extractRootCandidatesFromDroppedText(text));
      }
    }

    for (const file of Array.from(dataTransfer.files ?? [])) {
      const candidate = file as File & { path?: string; webkitRelativePath?: string };
      candidates.push(candidate.path ?? candidate.webkitRelativePath ?? file.name);
    }

    const files: TFile[] = [];
    const seen = new Set<string>();
    for (const candidate of candidates) {
      const file = this.resolveDroppedRootCandidate(candidate);
      if (!(file instanceof TFile) || file.extension !== "md" || seen.has(file.path)) continue;
      seen.add(file.path);
      files.push(file);
    }
    return files;
  }

  private extractRootCandidatesFromDroppedText(text: string): string[] {
    const candidates: string[] = [];
    const raw = String(text ?? "");

    const wikiLinkRegex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
    for (const match of raw.matchAll(wikiLinkRegex)) {
      candidates.push(match[1]);
    }

    const markdownLinkRegex = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    for (const match of raw.matchAll(markdownLinkRegex)) {
      candidates.push(match[1]);
    }

    const hrefRegex = /href=["']([^"']+)["']/g;
    for (const match of raw.matchAll(hrefRegex)) {
      candidates.push(match[1]);
    }

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed) {
        candidates.push(trimmed);
      }
    }

    return candidates;
  }

  private resolveDroppedRootCandidate(rawCandidate: string): TFile | null {
    let candidate = String(rawCandidate ?? "").trim();
    if (!candidate) return null;

    candidate = candidate
      .replace(/^["']|["']$/g, "")
      .replace(/^obsidian:\/\/open\?/i, "");

    if (candidate.includes("vault=") || candidate.includes("file=")) {
      const params = new URLSearchParams(candidate);
      candidate = params.get("file") ?? params.get("path") ?? candidate;
    }

    try {
      candidate = decodeURIComponent(candidate);
    } catch {
      // Keep the raw candidate when it is not URI-encoded.
    }

    candidate = candidate
      .replace(/^file:\/\//i, "")
      .replace(/^\/+/, "")
      .replace(/\\/g, "/")
      .replace(/^<|>$/g, "");

    if (candidate.startsWith("[[") && candidate.endsWith("]]")) {
      candidate = candidate.slice(2, -2);
    }
    candidate = candidate.split("|")[0].split("#")[0].trim();
    if (!candidate) return null;

    const directPaths = [
      candidate,
      candidate.endsWith(".md") ? candidate : `${candidate}.md`
    ];
    for (const path of directPaths) {
      const abstractFile = this.app.vault.getAbstractFileByPath(path);
      if (abstractFile instanceof TFile) return abstractFile;
    }

    const sourcePath = this.file?.path ?? "";
    const linked = this.app.metadataCache.getFirstLinkpathDest(candidate.replace(/\.md$/i, ""), sourcePath);
    if (linked instanceof TFile) return linked;

    const lowerBase = candidate.replace(/\.md$/i, "").split("/").pop()?.toLowerCase();
    if (!lowerBase) return null;
    const matches = this.app.vault.getMarkdownFiles().filter((file) => file.basename.toLowerCase() === lowerBase);
    return matches.length === 1 ? matches[0] : null;
  }

  private async addRootFiles(files: TFile[]): Promise<void> {
    const uniqueFiles = files.filter((file, index, array) =>
      file instanceof TFile
      && file.extension === "md"
      && array.findIndex((candidate) => candidate.path === file.path) === index
    );
    if (uniqueFiles.length === 0) return;

    if (this.isFileMode && this.file instanceof TFile) {
      const added = await this.addRootFilesToGraphNoteFrontmatter(this.file, uniqueFiles);
      if (added > 0) {
        await this.reloadFromFile();
      }
      return;
    }

    const existing = new Set(this.viewStateModel.rootNodes);
    const next = [...this.viewStateModel.rootNodes];
    for (const file of uniqueFiles) {
      const root = this.toRootNodeLinkpath(file);
      if (!root || existing.has(root)) continue;
      existing.add(root);
      next.push(root);
    }
    if (next.length === this.viewStateModel.rootNodes.length) return;
    this.viewStateModel = {
      ...this.viewStateModel,
      rootNodes: next
    };
    this.renderRootNodeList();
    this.persistStateToLocalStorage();
    this.onDataUpdated();
  }

  private async addRootFilesToGraphNoteFrontmatter(graphFile: TFile, files: TFile[]): Promise<number> {
    const content = await this.app.vault.read(graphFile);
    const parsed = this.parseFrontmatter(content);
    const rawRootNodes = this.normalizeFrontmatterStringArray(
      readFrontmatterPropertyByKey(parsed.frontmatter, this.graphPropertyKeys, "rootNodes")
    );
    const existingPaths = new Set(resolveWikiLinkArray(this.app, rawRootNodes).map((file) => file.path));
    const nextRootNodes = [...rawRootNodes];
    let added = 0;

    for (const file of files) {
      if (existingPaths.has(file.path)) continue;
      const root = this.toRootNodeWikiLink(file);
      if (!root) continue;
      existingPaths.add(file.path);
      nextRootNodes.push(root);
      added += 1;
    }

    if (added === 0) return 0;
    writeFrontmatterProperty(parsed.frontmatter, this.graphPropertyKeys, "rootNodes", nextRootNodes);
    const updated = this.serializeFrontmatter(parsed.frontmatter, parsed.body, {
      hasFrontmatter: parsed.hasFrontmatter,
      eol: parsed.eol
    });
    if (updated !== content) {
      this.suppressGraphFileReloadUntil = Date.now() + 500;
      await this.app.vault.modify(graphFile, updated);
    }
    return added;
  }

  private async removeEmbeddedRootNode(graphPathRaw: string, sourcePathRaw: string): Promise<void> {
    const graphPath = String(graphPathRaw ?? "").trim();
    const sourcePath = String(sourcePathRaw ?? "").trim();
    const graphFile = this.app.vault.getAbstractFileByPath(graphPath);
    if (!(graphFile instanceof TFile) || !sourcePath) return;
    const content = await this.app.vault.read(graphFile);
    const parsed = this.parseFrontmatter(content);
    const rawRootNodes = this.normalizeFrontmatterStringArray(
      readFrontmatterPropertyByKey(parsed.frontmatter, this.graphPropertyKeys, "rootNodes")
    );
    const nextRootNodes = rawRootNodes.filter((value) => {
      const resolved = resolveWikiLinkArray(this.app, [value])[0];
      return resolved?.path !== sourcePath;
    });
    if (nextRootNodes.length === rawRootNodes.length) return;
    writeFrontmatterProperty(parsed.frontmatter, this.graphPropertyKeys, "rootNodes", nextRootNodes);
    const updated = this.serializeFrontmatter(parsed.frontmatter, parsed.body, {
      hasFrontmatter: parsed.hasFrontmatter,
      eol: parsed.eol
    });
    if (updated === content) return;
    await this.app.vault.modify(graphFile, updated);
    await this.synchronizeEmbeddedRootRemoval(graphFile, sourcePath);
    this.embeddedGraphStates.delete(graphPath);
    this.embeddedGraphDocumentStores.delete(graphPath);
    await this.reloadFromFile();
  }

  private async synchronizeEmbeddedRootAdditions(graphFile: TFile, files: TFile[]): Promise<void> {
    const store = new O3GraphDocumentStore(this.app, graphFile, this.graphPropertyKeys);
    store.beginHydration();
    let state: O3GraphState;
    try {
      state = await store.readState({ cached: false });
    } finally {
      store.endHydration();
    }
    let changed = false;
    for (const file of files) {
      changed = state.addVisibleRoot(file.path) || changed;
    }
    if (changed) {
      await store.writeState(state, { reason: "badge-expansion" });
    }
  }

  private async synchronizeEmbeddedRootRemoval(graphFile: TFile, sourcePath: string): Promise<void> {
    const store = new O3GraphDocumentStore(this.app, graphFile, this.graphPropertyKeys);
    store.beginHydration();
    let state: O3GraphState;
    try {
      state = await store.readState({ cached: false });
    } finally {
      store.endHydration();
    }
    if (state.removeVisibleRoot(sourcePath)) {
      await store.writeState(state, { reason: "badge-expansion" });
    }
  }

  private normalizeFrontmatterStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      const single = String(value ?? "").trim();
      return single ? [single] : [];
    }
    return value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
  }

  private removeRootNode(root: string): void {
    const next = this.viewStateModel.rootNodes.filter((item) => item !== root);
    if (next.length === this.viewStateModel.rootNodes.length) return;

    this.viewStateModel = {
      ...this.viewStateModel,
      rootNodes: next
    };
    this.renderRootNodeList();
    this.persistStateToLocalStorage();
    this.onDataUpdated();
  }

  private registerLifecycleEventHandlers(): void {
    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      this.handleFileOpen(file ?? null);
    }));

    this.registerEvent(this.app.workspace.on("active-leaf-change", (_leaf) => {
      const file = this.app.workspace.getActiveFile();
      this.highlightActiveNode(file?.path ?? null);
    }));

    this.registerEvent(this.app.workspace.on("layout-change", () => {
      // Intentionally no graph rebuild/replay/reheat on layout changes.
    }));

    this.registerEvent(this.app.metadataCache.on("changed", (file) => {
      if (!(file instanceof TFile)) return;
      this.engine.updateLinkDiscoveryIndexForFile(file);
      if (Date.now() < (this.suppressMutationMetadataUntil.get(file.path) ?? 0)) {
        return;
      }
      this.refreshVisibleNodeMetadataForFile(file, { preserveDiffSnapshot: true });
      if (this.shouldSuppressEmbeddedGraphReload(file)) {
        return;
      }
      if (this.embeddedGraphStates.has(file.path)) {
        this.scheduleEmbeddedGraphDocumentRefresh(file);
        return;
      }
      const refreshedEmbedded = this.engine.refreshEmbeddedRelationshipsForSourcePath(file.path);
      if (refreshedEmbedded && !this.engine.hasOuterVisibleNodeForSourcePath(file.path)) {
        return;
      }
      if (!this.isGraphRelevantFile(file)) {
        return;
      }
      this.scheduleMetadataProcessing(file);
    }));

    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (!(file instanceof TFile)) return;
      void this.handleVaultRename(file, oldPath);
    }));

    this.registerEvent(this.app.vault.on("create", (file) => {
      if (!(file instanceof TFile)) return;
      if (!this.file || file.extension !== "md") return;
      window.setTimeout(() => {
        if (!this.initialized) return;
        const currentFile = this.app.vault.getAbstractFileByPath(file.path);
        if (!(currentFile instanceof TFile)) return;
        this.engine.updateLinkDiscoveryIndexForFile(currentFile);
        if (this.isGraphRelevantFile(currentFile)) {
          this.scheduleMetadataProcessing(currentFile);
        }
      }, 300);
    }));

    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (!(file instanceof TFile)) return;
      void this.handleVaultDelete(file);
    }));

    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (!(file instanceof TFile)) return;
      if (!this.file) return;
      if (Date.now() < (this.suppressMutationMetadataUntil.get(file.path) ?? 0)) {
        return;
      }
      if (this.connectedBaseFilterResult?.baseFile?.path === file.path) {
        void this.handleConnectedBaseFilterModify(file);
        return;
      }
      if (this.embeddedGraphStates.has(file.path)) {
        if (this.shouldSuppressEmbeddedGraphReload(file)) {
          return;
        }
        this.refreshVisibleNodeMetadataForFile(file, { preserveDiffSnapshot: true });
        this.scheduleEmbeddedGraphDocumentRefresh(file);
        return;
      }
      if (this.engine.hasVisibleNodeForSourcePath(file.path)) {
        this.refreshVisibleNodeMetadataForFile(file, { preserveDiffSnapshot: true });
      }
      if (file.path !== this.file.path) return;
      this.handleVaultModify(file);
    }));
  }

  private handleFileOpen(file: TFile | null): void {
    if (!file) return;
    this.highlightActiveNode(file.path);
  }

  private async handleVaultRename(file: TFile, oldPathRaw: string): Promise<void> {
    const oldPath = String(oldPathRaw ?? "").trim();
    const newPath = String(file.path ?? "").trim();
    if (!oldPath || !newPath || oldPath === newPath) return;

    this.moveMapEntry(this.nodeMetadataCache, oldPath, newPath);
    this.moveMapEntry(this.nodeLinkCache, oldPath, newPath);
    this.moveMapEntry(this.embeddedGraphStates, oldPath, newPath);
    this.moveMapEntry(this.embeddedGraphDocumentStores, oldPath, newPath);
    this.moveMapEntry(this.suppressEmbeddedGraphReloadUntil, oldPath, newPath);

    const stateChanged = this.graphState?.renameNotePath(oldPath, newPath) === true;
    const rootNodesChanged = this.file
      ? await this.updateGraphRootNodesForRenamedPath(this.file, oldPath, file)
      : false;
    let embeddedStateChanged = false;
    for (const [graphPath, state] of this.embeddedGraphStates.entries()) {
      if (graphPath === this.file?.path) continue;
      const graphFile = this.app.vault.getAbstractFileByPath(graphPath);
      if (!(graphFile instanceof TFile)) continue;
      const changed = state.renameNotePath(oldPath, newPath);
      const rootsChanged = await this.updateGraphRootNodesForRenamedPath(graphFile, oldPath, file);
      if (!changed) {
        embeddedStateChanged = embeddedStateChanged || rootsChanged;
        continue;
      }
      const store = this.embeddedGraphDocumentStores.get(graphPath);
      if (!store) continue;
      try {
        this.suppressEmbeddedGraphReloadUntil.set(graphPath, Date.now() + 2000);
        const wrote = await store.writeState(state, { reason: "node-position" });
        if (wrote) {
          this.suppressEmbeddedGraphReloadUntil.set(graphPath, Date.now() + 1500);
        }
        embeddedStateChanged = true;
      } catch (error) {
        console.error("[GraphView] Failed to persist embedded graph-state rename migration:", error);
      }
    }
    const wasVisible = this.engine.hasNode(oldPath) || this.engine.hasVisibleNodeForSourcePath(oldPath);
    if (!stateChanged && !rootNodesChanged && !embeddedStateChanged && !wasVisible) return;

    if (stateChanged && this.graphDocumentStore && this.graphState?.loadedFromGraphStateBlock) {
      try {
        this.suppressGraphFileReloadUntil = Date.now() + 2000;
        await this.graphDocumentStore.writeState(this.graphState, { reason: "node-position" });
        this.suppressGraphFileReloadUntil = Date.now() + 1500;
      } catch (error) {
        console.error("[GraphView] Failed to persist graph-state rename migration:", error);
      }
    }

    this.scheduleGraphHydration("vault-rename", 150);
  }

  private async handleVaultDelete(file: TFile): Promise<void> {
    const path = String(file.path ?? "").trim();
    if (!path) return;

    const existingTimer = this.metadataDebounceTimers.get(path);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
      this.metadataDebounceTimers.delete(path);
    }

    const wasVisible = this.engine.hasNode(path) || this.engine.hasVisibleNodeForSourcePath(path);
    const wasRelevant = wasVisible
      || this.dependencyWatcher.isWatched(path)
      || this.embeddedGraphStates.has(path)
      || this.embeddedGraphDocumentStores.has(path);

    this.graphModel.removeNode(path);
    this.nodeMetadataCache.delete(path);
    this.nodeLinkCache.delete(path);
    this.embeddedGraphStates.delete(path);
    this.embeddedGraphDocumentStores.delete(path);
    this.suppressEmbeddedGraphReloadUntil.delete(path);
    this.suppressMutationMetadataUntil.delete(path);
    this.engine.removeNode(path);

    if (!wasRelevant) return;
    if (this.file?.path === path) return;

    if (wasVisible) {
      this.scheduleNoteTruthReconciliation(0);
      await this.writeGraphState("badge-expansion");
      return;
    }

    this.scheduleGraphHydration("vault-delete", 150);
  }

  private async updateGraphRootNodesForRenamedPath(graphFile: TFile, oldPath: string, newFile: TFile): Promise<boolean> {
    try {
      const content = await this.app.vault.read(graphFile);
      const parsed = this.parseFrontmatter(content);
      const rawRootNodes = this.normalizeFrontmatterStringArray(
        readFrontmatterPropertyByKey(parsed.frontmatter, this.graphPropertyKeys, "rootNodes")
      );
      if (rawRootNodes.length === 0) return false;
      let changed = false;
      const nextRootNodes = rawRootNodes.map((value) => {
        if (!this.rootNodeValueReferencesPath(value, oldPath)) return value;
        changed = true;
        return this.toRootNodeWikiLink(newFile);
      });
      if (!changed) return false;
      writeFrontmatterProperty(parsed.frontmatter, this.graphPropertyKeys, "rootNodes", nextRootNodes);
      const updated = this.serializeFrontmatter(parsed.frontmatter, parsed.body, {
        hasFrontmatter: parsed.hasFrontmatter,
        eol: parsed.eol
      });
      if (updated === content) return false;
      if (graphFile.path === this.file?.path) {
        this.suppressGraphFileReloadUntil = Date.now() + 1500;
      } else {
        this.suppressEmbeddedGraphReloadUntil.set(graphFile.path, Date.now() + 1500);
      }
      await this.app.vault.modify(graphFile, updated);
      return true;
    } catch (error) {
      console.error("[GraphView] Failed to update graph root node path after rename:", {
        graphFile: graphFile.path,
        oldPath,
        newPath: newFile.path,
        error
      });
      return false;
    }
  }

  private rootNodeValueReferencesPath(valueRaw: string, oldPathRaw: string): boolean {
    const oldPath = String(oldPathRaw ?? "").trim().replace(/\\/g, "/");
    if (!oldPath) return false;
    const oldLinkpath = oldPath.replace(/\.md$/i, "");
    const raw = String(valueRaw ?? "").trim().replace(/\\/g, "/");
    if (!raw) return false;
    const normalized = raw
      .replace(/^\[\[/, "")
      .replace(/\]\]$/, "")
      .split("|")[0]
      .split("#")[0]
      .trim()
      .replace(/\.md$/i, "");
    return normalized === oldLinkpath || normalized === oldPath;
  }

  private moveMapEntry<T>(map: Map<string, T>, oldPath: string, newPath: string): void {
    const value = map.get(oldPath);
    if (value === undefined) return;
    map.delete(oldPath);
    map.set(newPath, value);
  }

  private shouldSuppressEmbeddedGraphReload(file: TFile): boolean {
    return this.embeddedGraphStates.has(file.path)
      && Date.now() < (this.suppressEmbeddedGraphReloadUntil.get(file.path) ?? 0);
  }

  private suppressGraphMutationMetadata(request: {
    target: { path: string };
    sources: Array<{ path: string }>;
    discoveryDirection?: "incoming" | "outgoing" | "both";
  }, result?: { added?: string[]; removed?: string[]; skipped?: string[] } | void): void {
    const changedPaths = [
      ...(result?.added ?? []),
      ...(result?.removed ?? [])
    ].map((path) => String(path ?? "").trim()).filter(Boolean);
    if (changedPaths.length === 0) {
      if ((result?.skipped ?? []).length > 0) {
        console.warn("[GraphView] Badge-drop relationship mutation skipped; graph will remain source-of-truth driven by note YAML.", {
          target: request.target?.path,
          sources: request.sources?.map((source) => source.path) ?? [],
          skipped: result?.skipped ?? []
        });
      }
      return;
    }
    const until = Date.now() + 2000;
    const mutatedPaths = request.discoveryDirection === "incoming"
      ? changedPaths
      : [request.target?.path];
    for (const path of mutatedPaths) {
      const normalized = String(path ?? "").trim();
      if (normalized) {
        this.suppressMutationMetadataUntil.set(normalized, until);
      }
    }
  }

  private scheduleEmbeddedGraphDocumentRefresh(file: TFile): void {
    const existing = this.embeddedGraphRefreshTimers.get(file.path);
    if (existing !== undefined) {
      window.clearTimeout(existing);
    }
    this.embeddedGraphRefreshTimers.set(file.path, window.setTimeout(() => {
      this.embeddedGraphRefreshTimers.delete(file.path);
      void this.refreshEmbeddedGraphDocument(file);
    }, 250));
  }

  private async refreshEmbeddedGraphDocument(file: TFile): Promise<void> {
    const instances = this.engine.getEmbeddedGraphInstances(file.path);
    if (instances.length === 0) return;
    const previousState = this.embeddedGraphStates.get(file.path);
    const previousStore = this.embeddedGraphDocumentStores.get(file.path);
    this.embeddedGraphStates.delete(file.path);
    this.embeddedGraphDocumentStores.delete(file.path);

    for (const instance of instances) {
      const definition = await this.loadEmbeddedGraphDefinition(file.path, instance.ancestry);
      if (!definition) {
        if (previousState) this.embeddedGraphStates.set(file.path, previousState);
        if (previousStore) this.embeddedGraphDocumentStores.set(file.path, previousStore);
        continue;
      }
      const replaced = this.engine.replaceEmbeddedGraphInstance(instance.originNodeId, definition);
      if (!replaced && previousState) {
        this.embeddedGraphStates.set(file.path, previousState);
        if (previousStore) this.embeddedGraphDocumentStores.set(file.path, previousStore);
      }
    }
  }

  private async handleConnectedBaseFilterModify(file: TFile): Promise<void> {
    if (!this.connectedBaseFilterResult?.baseFile || this.connectedBaseFilterResult.baseFile.path !== file.path) {
      return;
    }
    const filterFilesChanged = await this.refreshConnectedBaseFilterFiles();
    if (filterFilesChanged) {
      this.rebuildGraph(this.currentGraphFiles);
    }
  }

  private isGraphRelevantFile(file: TFile): boolean {
    const path = file.path;

    if (this.file && path === this.file.path) {
      return true;
    }

    if (this.isFileMode && this.connectedBaseFilterResult?.filterId && file.extension === "md") {
      return true;
    }

    if (this.engine.hasNode(path) || this.engine.hasVisibleNodeForSourcePath(path)) {
      return true;
    }

    if (this.dependencyWatcher && this.dependencyWatcher.isWatched(path)) {
      return true;
    }

    return false;
  }

  private scheduleMetadataProcessing(file: TFile): void {
    const path = file.path;
    const existing = this.metadataDebounceTimers.get(path);
    if (existing !== undefined) {
      window.clearTimeout(existing);
    }

    const timer = window.setTimeout(() => {
      this.metadataDebounceTimers.delete(path);
      void this.processMetadataChange(file);
    }, this.metadataDebounceDelay);

    this.metadataDebounceTimers.set(path, timer);
  }

  private async processMetadataChange(file: TFile | null): Promise<void> {
    if (!file) return;
    if (!this.initialized) return;
    const isGraphConfigFile = (
      (this.file && file.path === this.file.path)
      || this.isLinkTypeDefinitionFile(file.path)
      || this.activeGroups.some((group) => group.file.path === file.path)
      || this.connectedBaseFilterResult?.baseFile?.path === file.path
    );
    if (
      this.isFileMode
      && this.connectedBaseFilterResult?.filterId
      && !isGraphConfigFile
      && file.extension === "md"
    ) {
      const filterFilesChanged = await this.refreshConnectedBaseFilterFiles();
      if (filterFilesChanged) {
        this.rebuildGraph(this.currentGraphFiles);
        return;
      }
      if (!this.engine.hasNode(file.path) && !this.engine.hasVisibleNodeForSourcePath(file.path)) {
        return;
      }
    }
    if (!isGraphConfigFile && !this.engine.hasNode(file.path) && !this.engine.hasVisibleNodeForSourcePath(file.path)) {
      this.pendingMetadataDiffSnapshots.delete(file.path);
      return;
    }
    if (!this.isRelevantMetadataChangeFile(file)) {
      this.pendingMetadataDiffSnapshots.delete(file.path);
      return;
    }

    const events = this.dependencyWatcher.emitGraphEvents(file, this.app.metadataCache);
    for (const event of events) {
      try {
        await this.handleGraphEvent(event);
      } catch (error) {
        if (this.debugEnabled) {
          console.warn("Graph event failed, rebuilding graph", error);
        }
        this.rebuildGraph();
      }
    }
  }

  private isRelevantMetadataChangeFile(file: TFile): boolean {
    if (this.file && file.path === this.file.path) return true;
    if (this.isLinkTypeDefinitionFile(file.path)) return true;
    if (this.activeGroups.some((group) => group.file.path === file.path)) return true;
    if (this.connectedBaseFilterResult?.baseFile?.path === file.path) return true;
    if (this.isFileMode && this.connectedBaseFilterResult?.filterId && file.extension === "md") return true;
    return this.engine.hasNode(file.path) || this.engine.hasVisibleNodeForSourcePath(file.path);
  }

  private async handleGraphEvent(event: GraphEvent): Promise<void> {
    switch (event.type) {
      case "NODE_METADATA_CHANGED": {
        const abstractFile = this.app.vault.getAbstractFileByPath(event.path);
        if (!(abstractFile instanceof TFile)) {
          this.graphModel.removeNode(event.path);
          this.nodeMetadataCache.delete(event.path);
          this.pendingMetadataDiffSnapshots.delete(event.path);
          this.engine.removeNode(event.path);
          return;
        }
        if (!this.engine.hasNode(event.path) && !this.engine.hasVisibleNodeForSourcePath(event.path)) {
          this.pendingMetadataDiffSnapshots.delete(event.path);
          return;
        }
        const previousMetadata = this.pendingMetadataDiffSnapshots.get(event.path)
          ?? this.nodeMetadataCache.get(event.path)
          ?? {};
        const previousLinks = this.nodeLinkCache.get(event.path) ?? [];
        const nextLinks = this.extractNodeLinks(abstractFile);
        const linksChanged = JSON.stringify(previousLinks) !== JSON.stringify(nextLinks);
        const nextMetadata = this.readNodeMetadataForGrouping(abstractFile);
        const changedProps = this.diffMetadataPropertyKeys(previousMetadata, nextMetadata);
        const outerVisibleLinksChanged = this.engine.refreshVisibleLinkTypeEdgesForSourcePath(
          event.path,
          changedProps
        );
        const embeddedVisibleLinksChanged = this.engine.refreshEmbeddedVisibleLinkTypeEdgesForSourcePath(
          event.path,
          changedProps
        );
        const isRelevant = changedProps.some(prop =>
          this.activeRelevantProperties.has(prop) || this.activeRelevantProperties.has(prop.toLowerCase())
        ) || linksChanged || outerVisibleLinksChanged || embeddedVisibleLinksChanged;
        this.nodeLinkCache.set(event.path, nextLinks);
        if (!isRelevant) {
          this.nodeMetadataCache.set(event.path, nextMetadata);
          this.pendingMetadataDiffSnapshots.delete(event.path);
          return;
        }
        const visibleLinkTypeChanged = this.visibleLinkTypes.length > 0 && changedProps.some((prop) =>
          this.visibleLinkTypes.includes(String(prop ?? "").trim().toLowerCase())
        );
        if (visibleLinkTypeChanged && (outerVisibleLinksChanged || embeddedVisibleLinksChanged)) {
          this.nodeLinkCache.set(event.path, nextLinks);
          this.nodeMetadataCache.set(event.path, nextMetadata);
          this.pendingMetadataDiffSnapshots.delete(event.path);
          this.scheduleNoteTruthReconciliation();
          return;
        }
        if (this.activeOverlayLinkTypes.length > 0 && this.isCoreGraphNodePath(event.path)) {
          this.nodeLinkCache.set(event.path, nextLinks);
          this.nodeMetadataCache.set(event.path, nextMetadata);
          this.pendingMetadataDiffSnapshots.delete(event.path);
          this.rebuildGraph(this.currentGraphFiles);
          return;
        }
        this.handleRelevantMetadataChange(abstractFile, nextMetadata);
        return;
      }
      case "NODE_REMOVED": {
        this.graphModel.removeNode(event.path);
        this.nodeMetadataCache.delete(event.path);
        this.pendingMetadataDiffSnapshots.delete(event.path);
        this.nodeLinkCache.delete(event.path);
        this.engine.removeNode(event.path);
        return;
      }
      case "LINKTYPE_CHANGED": {
        await this.loadLinkTypeRegistry();
        this.rebuildGraph();
        return;
      }
      case "GROUP_CHANGED": {
        const fm = (this.file ? this.app.metadataCache.getFileCache(this.file)?.frontmatter : {}) as Record<string, unknown> | undefined;
        const rawActiveGroups = this.readActiveGroupsValueWithDefaults(fm ?? {});
        this.loadGroupRegistry(this.currentGraphFiles, rawActiveGroups);
        this.activeGroups = [];
        for (const file of resolveWikiLinkArray(this.app, rawActiveGroups)) {
          const group = this.groupRegistry.get(file.path);
          if (group) {
            this.activeGroups.push(group);
          }
        }
        this.groupingRules = this.normalizeActiveGroupRules();
        this.engine.setGroupingRules(this.groupingRules);
        this.updateRelevantProperties();
        this.rebuildGraph();
        return;
      }
      case "BASE_FILTER_CHANGED": {
        const filterFilesChanged = await this.refreshConnectedBaseFilterFiles();
        if (filterFilesChanged) {
          this.rebuildGraph(this.currentGraphFiles);
        }
        return;
      }
      case "GRAPH_FILE_CHANGED": {
        if (!this.file) return;
        if (event.path !== this.file.path) return;
        if (this.shouldSuppressGraphFileReload(this.file)) return;
        await this.reloadFromFile();
        return;
      }
    }
  }

  private async refreshConnectedBaseFilterFiles(): Promise<boolean> {
    if (!this.isFileMode || !this.file) return false;
    const beforeSignature = this.buildFilePathSignature(this.fileModeFilterFiles);
    const fm = (this.app.metadataCache.getFileCache(this.file)?.frontmatter ?? {}) as Record<string, unknown>;
    const connectedBaseFilter = readFrontmatterPropertyByKey(fm, this.graphPropertyKeys, "connectedBaseFilter");
    this.connectedBaseFilterResult = await this.baseViewFilterResolver.resolve(connectedBaseFilter, this.file);
    this.reportConnectedBaseFilterResult(connectedBaseFilter);
    this.fileModeFilterFiles = this.connectedBaseFilterResult.files;
    this.currentGraphFiles = this.mergeGraphFiles(this.fileModeRootFiles, this.fileModeFilterFiles);
    this.dependencyWatcher.updateDependencies({
      graphFile: this.file,
      linkTypeFiles: this.globalLinkTypeRegistry.getAll().map((lt) => lt.file),
      groupFiles: this.activeGroups.map((g) => g.file),
      baseFilterFiles: this.connectedBaseFilterResult.baseFile ? [this.connectedBaseFilterResult.baseFile] : [],
      nodeFiles: this.currentGraphFiles,
      linkTypeFolder: this.linkTypeFolder,
      watchedProperties: [
        ...this.activeLinkTypes.map((lt) => String(lt.property ?? "").trim().toLowerCase()),
        ...this.activeOverlayLinkTypes.map((lt) => String(lt.property ?? "").trim().toLowerCase()),
        ...this.visibleLinkTypes,
        ...this.activeGroups.map((g) => String(g.property ?? "").trim()),
        this.graphPropertyKeys.rootNodeProperties,
        this.graphPropertyKeys.graphBackgroundColor,
        DEFAULT_GRAPH_PROPERTY_KEYS.rootNodeProperties
      ].filter(Boolean),
      metadataCache: this.app.metadataCache
    });
    const afterSignature = this.buildFilePathSignature(this.fileModeFilterFiles);
    return beforeSignature !== afterSignature;
  }

  private buildFilePathSignature(files: TFile[]): string {
    return files
      .map((file) => String(file?.path ?? "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .join("\n");
  }

  private reportConnectedBaseFilterResult(rawValue: unknown): void {
    const result = this.connectedBaseFilterResult;
    if (!result || rawValue === undefined || rawValue === null || rawValue === "") {
      this.lastConnectedBaseFilterMessage = null;
      return;
    }

    let message: string | null = null;
    if (result.status === "base-unresolved" || result.status === "view-unresolved") {
      message = result.message ?? "Connected Base filter could not be resolved.";
    } else if (result.status === "resolved" && result.files.length === 0) {
      message = `Connected Base filter resolved "${result.filterId ?? result.baseFile?.path ?? "unknown"}" but matched 0 notes.`;
    }

    if (!message) {
      this.lastConnectedBaseFilterMessage = null;
      return;
    }

    const signature = `${result.filterId ?? ""}|${message}`;
    if (signature === this.lastConnectedBaseFilterMessage) return;
    this.lastConnectedBaseFilterMessage = signature;
    console.warn("[GraphView] Connected Base filter issue", {
      rawValue,
      filterId: result.filterId,
      baseFile: result.baseFile?.path ?? null,
      viewName: result.viewName,
      source: result.source,
      status: result.status,
      files: result.files.length,
      filterPreview: result.filterPreview,
      message
    });
    new Notice(message);
  }

  private isCoreGraphNodePath(path: string): boolean {
    const normalized = String(path ?? "").trim();
    if (!normalized) return false;
    return this.fileModeRootFiles.some((file) => file.path === normalized)
      || this.fileModeFilterFiles.some((file) => file.path === normalized);
  }

  private async handleNodePositionChanged(path: string, x?: number, y?: number): Promise<void> {
    if (!this.graphState) return;

    const normalizedPath = String(path ?? "").trim();
    if (!normalizedPath) {
      return;
    }

    if (x === undefined || y === undefined) {
      if (!(normalizedPath in this.graphState.state.pinned)) {
        return;
      }
      delete this.graphState.state.pinned[normalizedPath];
      await this.writeGraphState("node-position");
      return;
    }

    const nextX = Number(x);
    const nextY = Number(y);
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
      return;
    }

    const current = this.graphState.state.pinned[normalizedPath];
    if (current && current.x === nextX && current.y === nextY) {
      return;
    }

    this.graphState.state.pinned[normalizedPath] = { x: nextX, y: nextY };
    await this.writeGraphState("node-position");
  }

  private handleViewportChanged(
    viewport: { x: number; y: number; zoom: number },
    options?: { isFinal?: boolean }
  ): void {
    if (!this.graphState) return;
    const changed = this.updateGraphStateViewport(viewport);
    if (!changed) return;
    this.scheduleViewportStateWrite(options?.isFinal === true);
  }

  private updateGraphStateViewport(viewport: { x: number; y: number; zoom: number }): boolean {
    if (!this.graphState) return false;

    const zoom = Number(viewport.zoom);
    const x = Number(viewport.x);
    const y = Number(viewport.y);
    if (!Number.isFinite(zoom) || !Number.isFinite(x) || !Number.isFinite(y)) {
      return false;
    }

    const clampedZoom = Math.max(0.1, Math.min(5, zoom));
    const current = this.graphState.state.viewport;
    if (
      current
      && current.zoom === clampedZoom
      && current.x === x
      && current.y === y
    ) {
      return false;
    }

    this.graphState.state.viewport = {
      zoom: clampedZoom,
      x,
      y
    };
    return true;
  }

  private scheduleNoteTruthReconciliation(delayMs = 250): void {
    if (!this.isFileMode) return;
    if (!this.file || !this.graphState || !this.graphDocumentStore) return;
    if (this.isClosingOrUnloadingGraphView || this.isHydratingGraphRuntime) return;
    if (!this.hasCompletedInitialGraphRuntimeHydration) return;
    if (this.graphTruthReconciliationTimer !== null) {
      window.clearTimeout(this.graphTruthReconciliationTimer);
    }
    this.graphTruthReconciliationTimer = window.setTimeout(() => {
      this.graphTruthReconciliationTimer = null;
      void this.writeGraphState("note-truth-reconciliation");
    }, Math.max(0, delayMs));
  }

  private normalizeLinkTypeMenuSize(raw: unknown): LinkTypeMenuSize {
    const obj = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const width = Number(obj.width);
    const height = Number(obj.height);
    return {
      width: Number.isFinite(width) ? Math.max(220, Math.min(900, Math.round(width))) : DEFAULT_LINK_TYPE_MENU_SIZE.width,
      height: Number.isFinite(height) ? Math.max(180, Math.min(900, Math.round(height))) : DEFAULT_LINK_TYPE_MENU_SIZE.height
    };
  }

  private readLinkTypeMenuSizeFromGraphState(state: { linkTypeMenu?: unknown } | null | undefined): LinkTypeMenuSize {
    return this.normalizeLinkTypeMenuSize(state?.linkTypeMenu);
  }

  private handleLinkTypeMenuSizeChanged(size: LinkTypeMenuSize): void {
    const normalized = this.normalizeLinkTypeMenuSize(size);
    this.linkTypeMenuSize = normalized;
    if (!this.graphState) return;

    const current = this.normalizeLinkTypeMenuSize(this.graphState.state.linkTypeMenu);
    if (current.width === normalized.width && current.height === normalized.height) {
      return;
    }

    this.graphState.state.linkTypeMenu = {
      width: normalized.width,
      height: normalized.height
    };
    void this.writeGraphState("link-type-menu");
  }

  private async handleGraphSettingsChanged(settings: GraphSimulationSettings): Promise<void> {
    if (this.isClosingOrUnloadingGraphView) return;
    this.graphSettings = { ...settings };
    this.hasRuntimeGraphSettingsChanges = true;

    if (this.isFileMode && this.graphDocumentStore && this.file && await this.isPersistentGraphNotePath(this.file.path)) {
      try {
        await this.graphDocumentStore.writeSimulationSettings(this.graphSettings, { reason: "graph-settings" });
        if (this.file) {
          this.suppressGraphFileReloadUntil = Date.now() + 1500;
        }
      } catch (e) {
        console.error("Failed to write graph simulation settings:", e);
      }
      return;
    }

    this.persistGraphSettingsToConfig();
  }

  private scheduleViewportStateWrite(immediate = false): void {
    if (this.viewportPersistTimer !== null) {
      window.clearTimeout(this.viewportPersistTimer);
      this.viewportPersistTimer = null;
    }

    if (immediate) {
      void this.writeGraphState("viewport");
      return;
    }

    this.viewportPersistTimer = window.setTimeout(() => {
      this.viewportPersistTimer = null;
      void this.writeGraphState("viewport");
    }, this.viewportPersistDelayMs);
  }

  private flushPendingViewportStateWrite(): void {
    if (this.viewportPersistTimer !== null) {
      window.clearTimeout(this.viewportPersistTimer);
      this.viewportPersistTimer = null;
    }
    if (this.graphState && this.canWriteGraphState("viewport")) {
      void this.writeGraphState("viewport");
    }
  }

  private cancelPendingViewportStateWrite(): void {
    if (this.viewportPersistTimer !== null) {
      window.clearTimeout(this.viewportPersistTimer);
      this.viewportPersistTimer = null;
    }
  }

  async migrateGraphStateToCurrentLayout(): Promise<boolean> {
    if (this.isClosingOrUnloadingGraphView) return false;
    if (!this.engine) {
      return false;
    }
    if ((!this.graphState || !this.graphDocumentStore) && this.file) {
      this.graphDocumentStore = new O3GraphDocumentStore(this.app, this.file, this.graphPropertyKeys);
      this.graphState = await this.graphDocumentStore.readState({ cached: false });
    }
    if (!this.graphState || !this.graphDocumentStore) return false;
    this.graphState.migrateToCurrentLayout(this.engine.getRuntimeNodeSnapshots());
    this.suppressGraphFileReloadUntil = Date.now() + 2000;
    const wrote = await this.graphDocumentStore.writeState(this.graphState, { reason: "manual-migration" });
    if (wrote) {
      this.suppressGraphFileReloadUntil = Date.now() + 1500;
    }
    return wrote;
  }

  async clearGraphData(): Promise<boolean> {
    if (this.isClosingOrUnloadingGraphView) return false;
    if (!this.file) return false;

    const store = this.graphDocumentStore ?? new O3GraphDocumentStore(this.app, this.file, this.graphPropertyKeys);
    store.beginHydration();
    try {
      await store.readState({ cached: false });
    } finally {
      store.endHydration();
    }

    const clearedState = new O3GraphState(this.file);
    clearedState.loadedFromGraphStateBlock = true;
    this.suppressGraphFileReloadUntil = Date.now() + 2000;
    const wrote = await store.writeState(clearedState, { reason: "clear-graph-data" });
    this.graphDocumentStore = store;
    this.graphState = clearedState;
    if (wrote) {
      this.suppressGraphFileReloadUntil = Date.now() + 1500;
    }
    await this.reloadFromFile();
    return wrote;
  }

  getDefaultGraphImageExportPath(): string {
    const basename = this.file?.basename
      ? this.sanitizeExportFileName(this.file.basename)
      : "Graph Export";
    return `Exports/${basename}.png`;
  }

  getGraphImageExportBackgroundColor(): string | null {
    return this.readGraphBackgroundColorFromFrontmatter();
  }

  async exportGraphAsImage(request: GraphImageExportRequest): Promise<string> {
    if (this.isClosingOrUnloadingGraphView) {
      throw new Error("Graph view is closing.");
    }
    const outputPath = this.normalizeExportOutputPath(request.outputPath);
    await this.ensureVaultFolderForPath(outputPath);
    const blob = await this.engine.exportImage({
      area: request.area,
      backgroundColor: request.backgroundColor,
      padding: 48
    });
    const data = await blob.arrayBuffer();
    const existing = this.app.vault.getAbstractFileByPath(outputPath);
    if (existing instanceof TFolder) {
      throw new Error(`Export target is a folder: ${outputPath}`);
    }
    if (existing instanceof TFile) {
      await this.app.vault.modifyBinary(existing, data);
    } else {
      await this.app.vault.createBinary(outputPath, data);
    }
    return outputPath;
  }

  private normalizeExportOutputPath(rawPath: string): string {
    const fallback = this.getDefaultGraphImageExportPath();
    let path = String(rawPath ?? "").trim() || fallback;
    path = path.replace(/\\/g, "/").replace(/^\/+/, "");
    path = path.replace(/\/{2,}/g, "/");
    if (!/\.png$/i.test(path)) {
      path = `${path.replace(/\.[^/.]+$/, "")}.png`;
    }
    return path;
  }

  private async ensureVaultFolderForPath(path: string): Promise<void> {
    const parts = String(path ?? "").split("/").filter(Boolean);
    parts.pop();
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFolder) continue;
      if (existing) {
        throw new Error(`Cannot create export folder because a file already exists at ${current}`);
      }
      await this.app.vault.createFolder(current);
    }
  }

  private sanitizeExportFileName(name: string): string {
    return String(name ?? "Graph Export")
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .trim() || "Graph Export";
  }

  private async writeGraphState(reason: O3GraphDocumentWriteReason): Promise<void> {
    if (this.isClosingOrUnloadingGraphView) return;
    if (this.isHydratingGraphRuntime) return;
    if (!this.graphState || !this.graphDocumentStore) return;
    if (
      this.file
      && !await this.isPersistentGraphNotePath(this.file.path)
      && !this.graphState.loadedFromGraphStateBlock
    ) {
      return;
    }
    if (!this.canWriteGraphState(reason)) return;
    try {
      if (this.engine) {
        const snapshots = this.engine.getRuntimeNodeSnapshots();
        if (!this.shouldWriteGraphStateSnapshots(snapshots)) {
          return;
        }
        this.graphState.migrateToCurrentLayout(snapshots);
      } else {
        this.graphState.migrateToCurrentLayout();
      }
      this.suppressGraphFileReloadUntil = Date.now() + 2000;
      const wrote = await this.graphDocumentStore.writeState(this.graphState, { reason });
      if (wrote) {
        this.suppressGraphFileReloadUntil = Date.now() + 1500;
      }
    } catch (e) {
      console.error("Failed to write graph state:", e);
    }
  }

  private canWriteGraphState(reason: O3GraphDocumentWriteReason): boolean {
    if (!this.graphState || !this.graphDocumentStore) return false;
    if (reason === "manual-migration") return true;
    if (!this.hasCompletedInitialGraphRuntimeHydration) {
      if (this.debugEnabled) {
        console.warn("[GraphView] Blocked graph-state write before initial runtime hydration completed.", {
          graphFile: this.file?.path ?? null,
          reason
        });
      }
      return false;
    }
    if (!this.graphState.loadedFromGraphStateBlock && reason !== "badge-expansion" && reason !== "lens-state") {
      console.warn("[GraphView] Blocked automatic graph-state write because no readable o3graph block was loaded.", {
        graphFile: this.file?.path ?? null,
        reason
      });
      return false;
    }
    return true;
  }

  private shouldWriteGraphStateSnapshots(snapshots: O3GraphRuntimeNodeSnapshot[]): boolean {
    if (!Array.isArray(snapshots)) return false;
    if (snapshots.length > 0) {
      if (this.isFileMode && !this.snapshotsContainConfiguredCoreNodes(snapshots)) {
        return false;
      }
      this.graphStateWriteSkippedForEmptySnapshot = false;
      return true;
    }

    const existingNodeCount = Object.keys(this.graphState?.state.nodes ?? {}).length;
    const configuredRootCount = this.isFileMode
      ? this.fileModeRootFiles.length
      : this.viewStateModel.rootNodes.length;
    const configuredFilterCount = this.isFileMode ? this.fileModeFilterFiles.length : 0;
    const currentGraphFileCount = this.currentGraphFiles.length;

    const riskyEmptyWrite = existingNodeCount > 0
      || configuredRootCount > 0
      || configuredFilterCount > 0
      || currentGraphFileCount > 0;
    if (!riskyEmptyWrite) {
      return true;
    }

    if (!this.graphStateWriteSkippedForEmptySnapshot || this.debugEnabled) {
      console.warn("[GraphView] Skipped empty graph-state write to protect graph note data.", {
        existingNodeCount,
        configuredRootCount,
        configuredFilterCount,
        currentGraphFileCount
      });
    }
    this.graphStateWriteSkippedForEmptySnapshot = true;
    return false;
  }

  private snapshotsContainConfiguredCoreNodes(snapshots: O3GraphRuntimeNodeSnapshot[]): boolean {
    const requiredPaths = new Set(
      [...this.fileModeRootFiles, ...this.fileModeFilterFiles]
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

    console.warn("[GraphView] Skipped graph-state write because runtime snapshots are missing configured core nodes.", {
      graphFile: this.file?.path ?? null,
      missing,
      snapshotCount: snapshots.length,
      requiredCoreCount: requiredPaths.size
    });
    return false;
  }

  private shouldSuppressGraphFileReload(file: TFile): boolean {
    if (!this.file) return false;
    if (file.path !== this.file.path) return false;
    return Date.now() < this.suppressGraphFileReloadUntil;
  }

  private async switchToMarkdownView(): Promise<void> {
    const target = this.file ?? this.app.workspace.getActiveFile();
    if (!(target instanceof TFile)) {
      new Notice("No file bound to this graph view.");
      return;
    }
    await this.leaf.setViewState({
      type: "markdown",
      state: {
        file: target.path
      },
      active: true
    }, false);
  }

  private handleVaultModify(file: TFile | null): void {
    if (!file) return;
    if (!this.initialized) return;
    if (this.isLinkTypeDefinitionFile(file.path)) {
      if (this.file) {
        void this.reloadFromFile();
      }
      return;
    }
    if (!this.engine.hasNode(file.path)) return;
    if (this.selectedLinkTypes.includes(NONE_LINK_TYPE)) {
      this.handleRelevantMetadataChange(file, this.nodeMetadataCache.get(file.path) ?? this.readNodeMetadataForGrouping(file));
      return;
    }
    this.updateCachedLinkTypes(file.path);
  }

  private isLinkTypeDefinitionFile(path: string): boolean {
    const filePath = String(path ?? "").trim();
    if (!filePath) return false;
    const folder = String(this.linkTypeFolder ?? "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!folder) return false;
    const normalizedFilePath = filePath.replace(/\\/g, "/");
    return normalizedFilePath.startsWith(`${folder}/`);
  }

  private updateCachedLinkTypes(filePath: string): void {
    const normalizedPath = String(filePath ?? "").trim();
    if (!normalizedPath) return;
    const abstractFile = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (!(abstractFile instanceof TFile)) return;

    this.nodeMetadataCache.set(normalizedPath, this.readNodeMetadataForGrouping(abstractFile));
    this.engine.updateNode(normalizedPath, this.nodeMetadataCache.get(normalizedPath) ?? {});
    this.debug("updateCachedLinkTypes:visible-node-colors-only", { filePath: normalizedPath });
  }

  private refreshVisibleNodeMetadataForFile(
    file: TFile,
    options: { preserveDiffSnapshot?: boolean } = {}
  ): boolean {
    const normalizedPath = String(file?.path ?? "").trim();
    if (!normalizedPath) return false;
    if (!this.engine.hasNode(normalizedPath) && !this.engine.hasVisibleNodeForSourcePath(normalizedPath)) {
      return false;
    }

    const previousMetadata = this.nodeMetadataCache.get(normalizedPath) ?? {};
    const nextMetadata = this.readNodeMetadataForGrouping(file);
    const changedProperties = this.diffMetadataPropertyKeys(previousMetadata, nextMetadata);
    const changed = changedProperties.length > 0;
    if (options.preserveDiffSnapshot && changed && !this.pendingMetadataDiffSnapshots.has(normalizedPath)) {
      this.pendingMetadataDiffSnapshots.set(normalizedPath, previousMetadata);
    }
    this.nodeMetadataCache.set(normalizedPath, nextMetadata);

    try {
      this.graphModel.updateNodeMetadata(normalizedPath, nextMetadata);
      if (!this.graphModel.getNode(normalizedPath)) {
        this.graphModel.addNode({
          id: normalizedPath,
          path: normalizedPath,
          metadata: nextMetadata
        });
      }
      this.engine.updateNode(normalizedPath, nextMetadata);
    } catch (error) {
      if (this.debugEnabled) {
        console.warn("[GraphView] Failed to refresh visible node metadata", {
          path: normalizedPath,
          error
        });
      }
    }

    return changed;
  }

  private updateRelevantProperties(): void {
    const props = new Set<string>();

    for (const linkType of this.selectedLinkTypes) {
      props.add(String(linkType ?? "").trim());
    }

    for (const linkType of this.activeOverlayLinkTypes) {
      const property = String(linkType?.property ?? "").trim().toLowerCase();
      if (property) props.add(property);
    }

    for (const linkType of this.visibleLinkTypes) {
      const property = String(linkType ?? "").trim().toLowerCase();
      if (property) props.add(property);
    }

    for (const expansion of this.expandedParents) {
      for (const linkType of Object.keys(expansion?.linkTypes ?? {})) {
        const normalized = String(linkType ?? "").trim();
        if (normalized) props.add(normalized);
      }
    }

    for (const rule of this.groupingRules) {
      const property = String(rule?.property ?? "").trim();
      if (property) props.add(property);
    }

    props.add(this.graphPropertyKeys.graphIcon);
    props.add(DEFAULT_GRAPH_PROPERTY_KEYS.graphIcon);
    props.add(this.graphPropertyKeys.nodeIndividualSize);
    props.add(DEFAULT_GRAPH_PROPERTY_KEYS.nodeIndividualSize);
    props.add(this.graphPropertyKeys.rootNodeProperties);
    props.add(DEFAULT_GRAPH_PROPERTY_KEYS.rootNodeProperties);
    props.add(this.graphPropertyKeys.graphBackgroundColor);
    props.add(DEFAULT_GRAPH_PROPERTY_KEYS.graphBackgroundColor);

    this.activeRelevantProperties = props;
    this.debug("updateRelevantProperties", {
      count: props.size,
      sample: Array.from(props).slice(0, 20)
    });
  }

  private diffMetadataPropertyKeys(
    previousMetadata: Record<string, unknown>,
    nextMetadata: Record<string, unknown>
  ): string[] {
    const keys = new Set<string>([
      ...Object.keys(previousMetadata ?? {}),
      ...Object.keys(nextMetadata ?? {})
    ]);
    const changed: string[] = [];
    for (const key of keys) {
      const before = previousMetadata?.[key];
      const after = nextMetadata?.[key];
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        changed.push(key);
      }
    }
    return changed;
  }

  private handleRelevantMetadataChange(file: TFile, frontmatter: Record<string, unknown>): void {
    const path = file.path;
    const previousMetadata = this.pendingMetadataDiffSnapshots.get(path)
      ?? this.nodeMetadataCache.get(path)
      ?? {};
    if (JSON.stringify(previousMetadata) === JSON.stringify(frontmatter)) {
      this.pendingMetadataDiffSnapshots.delete(path);
      return;
    }
    const changedProperties = this.diffMetadataPropertyKeys(previousMetadata, frontmatter);
    this.pendingMetadataDiffSnapshots.delete(path);
    this.nodeMetadataCache.set(path, frontmatter);

    try {
      this.graphModel.updateNodeMetadata(path, frontmatter);
      if (!this.graphModel.getNode(path)) {
        this.graphModel.addNode({
          id: path,
          path,
          metadata: frontmatter
        });
      }

      const edges = this.computeEdgesForNode(file);
      this.graphModel.updateEdgesForNode(path, edges);

      this.engine.updateNode(path, frontmatter);
      this.engine.updateEdges(path, edges);
      const refreshedVisibleExpansions = this.engine.refreshOuterRelationshipsForSourcePath(
        path,
        changedProperties
      );
      if (!refreshedVisibleExpansions) {
        this.engine.refreshExpandedParentLinksForOrigin(path);
      }

      this.debug("handleRelevantMetadataChange", {
        path,
        edgesCount: edges.length
      });
      this.scheduleNoteTruthReconciliation();
    } catch (error) {
      if (this.debugEnabled) {
        console.warn("Incremental update failed, rebuilding graph", error);
      }
      this.rebuildGraph();
    }
  }

  private computeEdgesForNode(file: TFile): GraphEdge[] {
    const duplicateModeActive = this.selectedLinkTypes.some((linkType) => {
      const normalizedLinkType = String(linkType ?? "").trim().toLowerCase();
      if (!normalizedLinkType || normalizedLinkType === NONE_LINK_TYPE) return false;
      const cfg = this.activeLinkTypes.find((item) =>
        String(item.property ?? "").trim().toLowerCase() === normalizedLinkType
      );
      return cfg?.linkDuplicateNodes === true;
    });
    if (duplicateModeActive) {
      throw new Error("Incremental edge updates are not supported when duplicate link mode is active.");
    }

    const sourcePath = file.path;
    const frontmatter = this.nodeMetadataCache.get(sourcePath) ?? this.readNodeMetadataForGrouping(file);
    const frontmatterByType = this.collectFrontmatterLinksByTypeForMetadata(file, frontmatter);
    const discoveryByProperty = new Map<string, boolean>(
      this.activeLinkTypes.map((item) => [
        String(item.property ?? "").trim().toLowerCase(),
        item.linkDiscovery !== false
      ])
    );
    const edges: GraphEdge[] = [];
    const seen = new Set<string>();

    for (const linkType of this.selectedLinkTypes) {
      const normalizedLinkType = String(linkType ?? "").trim();
      if (!normalizedLinkType) continue;
      if ((this.viewStateModel.linkTypeConfig[normalizedLinkType]?.semantic ?? "normal") === "parent") continue;

      if (normalizedLinkType === NONE_LINK_TYPE) {
        const noneTargets = this.collectNoneTypeTargetsForFile(file, frontmatterByType);
        for (const targetPath of noneTargets) {
          if (!this.engine.hasNode(targetPath)) continue;
          const id = this.buildGraphEdgeId(sourcePath, targetPath, NONE_LINK_TYPE);
          if (seen.has(id)) continue;
          seen.add(id);
          edges.push({ id, source: sourcePath, target: targetPath, type: NONE_LINK_TYPE });
        }
        continue;
      }

      const discoveryEnabled = discoveryByProperty.get(normalizedLinkType) !== false;
      if (!discoveryEnabled && !this.engine.isBadgeExpansionActive(sourcePath, normalizedLinkType)) {
        continue;
      }

      const targets = frontmatterByType.get(normalizedLinkType);
      if (!targets || targets.size === 0) continue;
      for (const targetPath of targets) {
        if (!this.engine.hasNode(targetPath)) continue;
        const id = this.buildGraphEdgeId(sourcePath, targetPath, normalizedLinkType);
        if (seen.has(id)) continue;
        seen.add(id);
        edges.push({ id, source: sourcePath, target: targetPath, type: normalizedLinkType });
      }
    }

    return edges;
  }

  private buildGraphEdgeId(sourcePath: string, targetPath: string, type: string): string {
    return `${sourcePath}::${targetPath}::${type}`;
  }

  private formatIdentifierFrontmatterValue(identifier: NoteTypeIdentifierSettings[keyof NoteTypeIdentifierSettings]): string {
    const value = identifierFrontmatterValue(identifier);
    if (typeof value === "boolean") return value ? "true" : "false";
    return JSON.stringify(String(value ?? ""));
  }

  private collectFrontmatterLinksByTypeForMetadata(
    file: TFile,
    frontmatter: Record<string, unknown>
  ): Map<string, Set<string>> {
    const byType = new Map<string, Set<string>>();
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatterLinks = Array.isArray(cache?.frontmatterLinks) ? cache.frontmatterLinks : [];

    if (frontmatterLinks.length > 0) {
      for (const link of frontmatterLinks) {
        const rawKey = String((link as Record<string, unknown>).key ?? "").trim();
        const linkText = String((link as Record<string, unknown>).link ?? "").trim();
        if (!rawKey || !linkText) continue;
        const target = this.app.metadataCache.getFirstLinkpathDest(linkText, file.path);
        if (!target) continue;
        const baseKey = rawKey.split(/[.[\]]/)[0]?.toLowerCase();
        if (!baseKey) continue;
        if (!byType.has(baseKey)) byType.set(baseKey, new Set<string>());
        byType.get(baseKey)!.add(target.path);
      }
    }

    for (const [key, value] of Object.entries(frontmatter ?? {})) {
      if (key === "position") continue;
      const candidates = extractInternalLinkCandidates(value);
      if (candidates.length === 0) continue;
      const normalizedKey = String(key ?? "").trim().toLowerCase();
      if (!normalizedKey) continue;
      for (const candidate of candidates) {
        const target = this.app.metadataCache.getFirstLinkpathDest(candidate, file.path);
        if (!target) continue;
        if (!byType.has(normalizedKey)) byType.set(normalizedKey, new Set<string>());
        byType.get(normalizedKey)!.add(target.path);
      }
    }

    this.applyActiveLinkTypePropertyAliasesForMetadata(byType);
    return byType;
  }

  private applyActiveLinkTypePropertyAliasesForMetadata(byType: Map<string, Set<string>>): void {
    for (const linkType of this.activeLinkTypes) {
      const primary = String(linkType.property ?? "").trim().toLowerCase();
      const properties = Array.from(new Set([
        primary,
        ...(linkType.properties ?? []).map((item) => String(item ?? "").trim().toLowerCase())
      ].filter(Boolean)));
      if (!primary || properties.length <= 1) continue;
      let primaryTargets = byType.get(primary);
      for (const property of properties) {
        if (property === primary) continue;
        const targets = byType.get(property);
        if (!targets || targets.size === 0) continue;
        if (!primaryTargets) {
          primaryTargets = new Set<string>();
          byType.set(primary, primaryTargets);
        }
        for (const target of targets) {
          primaryTargets.add(target);
        }
      }
    }
  }

  private collectNoneTypeTargetsForFile(
    file: TFile,
    frontmatterByType: Map<string, Set<string>>
  ): Set<string> {
    const out = new Set<string>();
    const cache = this.app.metadataCache.getFileCache(file);
    const links = cache?.links ?? [];

    const frontmatterTargets = new Set<string>();
    for (const targets of frontmatterByType.values()) {
      for (const targetPath of targets) {
        frontmatterTargets.add(targetPath);
      }
    }

    for (const link of links) {
      const target = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
      if (!target) continue;
      if (frontmatterTargets.has(target.path)) continue;
      out.add(target.path);
    }
    return out;
  }

  getViewState(): unknown {
    this.syncViewStateModelFromRuntime();
    const boundFilePath = this.file?.path ?? this.filePath ?? null;
    const graphState = {
      file: boundFilePath,
      rootNodes: [...this.viewStateModel.rootNodes],
      activeLinkTypes: [...this.selectedLinkTypes],
      linkTypeConfig: this.cloneLinkTypeConfigState(this.viewStateModel.linkTypeConfig),
      expandedParents: this.expandedParents.map(item => ({ origin: item.origin, linkTypes: { ...item.linkTypes } })),
      groupingRules: this.groupingRules.map(rule => ({ ...rule })),
      graphSettings: {
        ...this.graphSettings,
        layoutId: this.layoutId,
        hideNodesWithoutSelectedLinkTypes: this.hideNodesWithoutSelectedLinkTypes
      }
    };

    const baseViewState = (super.getViewState?.() ?? {}) as Record<string, unknown>;
    const baseInnerState = (
      baseViewState.state && typeof baseViewState.state === "object"
        ? (baseViewState.state as Record<string, unknown>)
        : {}
    );
    const mergedInnerState = {
      ...baseInnerState,
      ...StateManager.serializeState(graphState)
    };
    return {
      ...baseViewState,
      state: mergedInnerState
    };
  }

  async setViewState(state: unknown, ...rest: unknown[]): Promise<void> {
    const payload = this.unwrapLeafViewStatePayload(state);
    await super.setViewState(state, ...rest);
    this.applyFileBindingFromState(payload);
    this.refreshLeafHeader();

    const cloned = StateManager.cloneState(payload);
    this.viewStateModel = cloned;

    this.selectedLinkTypes = this.normalizeStoredLinkTypeArray(cloned.activeLinkTypes ?? []);
    if ((cloned.activeLinkTypes ?? []).length > 0) {
      this.hasRuntimeLinkTypeChanges = true;
    }

    this.linkTypeSemantics = this.buildLinkTypeSemanticsFromConfig(cloned.linkTypeConfig ?? {});
    this.linkTypePhysics = this.buildLinkTypePhysicsFromConfig(cloned.linkTypeConfig ?? {});
    if (Object.keys(cloned.linkTypeConfig ?? {}).length > 0) {
      this.hasRuntimeLinkTypeSemanticChanges = true;
      this.hasRuntimeLinkTypePhysicsChanges = true;
    }

    this.groupingRules = this.normalizeGroupingRules(cloned.groupingRules ?? []);
    this.expandedParents = this.normalizeExpandedParentsState(cloned.expandedParents ?? []);

    const nextSettings = cloned.graphSettings ?? {};
    const nextLayoutId = this.normalizeLayoutId(nextSettings.layoutId);
    this.graphSettings = {
      repulsionStrength: Number.isFinite(Number(nextSettings.repulsionStrength))
        ? Number(nextSettings.repulsionStrength)
        : this.graphSettings.repulsionStrength,
      centerStrength: Number.isFinite(Number(nextSettings.centerStrength))
        ? Number(nextSettings.centerStrength)
        : this.graphSettings.centerStrength,
      nodeRadius: Number.isFinite(Number(nextSettings.nodeRadius))
        ? Number(nextSettings.nodeRadius)
        : this.graphSettings.nodeRadius,
      nodeConnectionSizeMultiplier: Number.isFinite(Number(nextSettings.nodeConnectionSizeMultiplier))
        ? Number(nextSettings.nodeConnectionSizeMultiplier)
        : this.graphSettings.nodeConnectionSizeMultiplier,
      nearRestVelocityThreshold: Number.isFinite(Number(nextSettings.nearRestVelocityThreshold))
        ? Number(nextSettings.nearRestVelocityThreshold)
        : this.graphSettings.nearRestVelocityThreshold,
      restVelocityThreshold: Number.isFinite(Number(nextSettings.restVelocityThreshold))
        ? Number(nextSettings.restVelocityThreshold)
        : this.graphSettings.restVelocityThreshold,
      textFadeThreshold: Number.isFinite(Number(nextSettings.textFadeThreshold))
        ? Math.max(0, Math.min(100, Number(nextSettings.textFadeThreshold)))
        : this.graphSettings.textFadeThreshold
    };
    this.layoutId = nextLayoutId;
    if (typeof nextSettings.hideNodesWithoutSelectedLinkTypes === "boolean") {
      this.hideNodesWithoutSelectedLinkTypes = nextSettings.hideNodesWithoutSelectedLinkTypes;
      this.hasRuntimeHideNodesSettingChanges = true;
    }
    if (
      nextSettings.layoutId !== undefined ||
      nextSettings.repulsionStrength !== undefined ||
      nextSettings.centerStrength !== undefined ||
      nextSettings.nodeRadius !== undefined ||
      nextSettings.nodeConnectionSizeMultiplier !== undefined ||
      nextSettings.nearRestVelocityThreshold !== undefined ||
      nextSettings.restVelocityThreshold !== undefined ||
      nextSettings.textFadeThreshold !== undefined
    ) {
      this.hasRuntimeGraphSettingsChanges = true;
    }

    this.updateRelevantProperties();
    if (this.expandedParents.length > 0) {
      this.hasRuntimeExpandedParentChanges = true;
    }

    if (this.initialized) {
      this.engine.setSelectedLinkTypes(this.selectedLinkTypes);
      this.engine.setAllLinkTypeSemantics(this.linkTypeSemantics);
      this.engine.setLinkTypePhysics(this.linkTypePhysics);
      this.engine.setGroupingRules(this.groupingRules);
      this.engine.setSimulationSettings(this.graphSettings);
      this.engine.setLayout(this.layoutId);
      this.engine.setHideNodesWithoutSelectedLinkTypes(this.hideNodesWithoutSelectedLinkTypes);
      this.replayExpandedParents();
      this.onDataUpdated();
    }
  }

  private unwrapLeafViewStatePayload(state: unknown): unknown {
    if (!state || typeof state !== "object") return state;
    const obj = state as Record<string, unknown>;
    if (obj.state && typeof obj.state === "object") {
      return obj.state;
    }
    return state;
  }

  private applyFileBindingFromState(state: unknown): void {
    if (!state || typeof state !== "object") return;
    const obj = state as Record<string, unknown>;
    const filePath = String(obj.file ?? obj.filePath ?? "").trim();
    if (!filePath) return;
    const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
    if (abstractFile instanceof TFile) {
      this.file = abstractFile;
      this.filePath = abstractFile.path;
    }
  }

  private refreshLeafHeader(): void {
    const leaf = this.leaf as unknown as { updateHeader?: () => void };
    if (typeof leaf.updateHeader === "function") {
      leaf.updateHeader();
    }
    window.requestAnimationFrame(() => this.installHeaderFileMenuHandlers());
  }

  private installHeaderFileMenuHandlers(): void {
    const target = this.resolveHeaderFileMenuTarget();
    if (!target || target === this.headerMenuTarget) return;
    this.uninstallHeaderFileMenuHandlers();
    this.headerMenuTarget = target;
    setStyle(target, "cursor", "pointer");
    target.title = this.file ? `File menu: ${this.file.path}` : "File menu";
    target.addEventListener("click", this.onHeaderMenuClickBound);
    target.addEventListener("contextmenu", this.onHeaderMenuContextMenuBound);
  }

  private uninstallHeaderFileMenuHandlers(): void {
    if (!this.headerMenuTarget) return;
    this.headerMenuTarget.removeEventListener("click", this.onHeaderMenuClickBound);
    this.headerMenuTarget.removeEventListener("contextmenu", this.onHeaderMenuContextMenuBound);
    this.headerMenuTarget = null;
  }

  private resolveHeaderFileMenuTarget(): HTMLElement | null {
    const leafEl = this.containerEl.closest(".workspace-leaf");
    const target = leafEl?.querySelector<HTMLElement>(".view-header-title-container, .view-header-title");
    return target ?? null;
  }

  private onHeaderMenuClick(event: MouseEvent): void {
    if (!this.file) return;
    event.preventDefault();
    event.stopPropagation();
    const menu = new Menu();
    const file = this.file;
    menu.addItem((item) => {
      item
        .setTitle("Rename graph note")
        .setIcon("pencil")
        .onClick(() => {
          void this.renameGraphNoteFromHeader(file);
        });
    });
    menu.addItem((item) => {
      item
        .setTitle("Open as Markdown")
        .setIcon("document")
        .onClick(() => {
          void this.switchToMarkdownView();
        });
    });
    menu.showAtMouseEvent(event);
  }

  private async renameGraphNoteFromHeader(file: TFile): Promise<void> {
    const currentName = file.basename;
    const nextNameRaw = await RenameGraphNoteModal.prompt(this.app, currentName);
    if (nextNameRaw === null) return;
    const nextName = String(nextNameRaw ?? "").trim();
    if (!nextName || nextName === currentName) return;
    if (/[\\/:*?"<>|]/.test(nextName)) {
      new Notice("File name contains invalid characters.");
      return;
    }
    const folderPath = file.parent?.path && file.parent.path !== "/" ? file.parent.path : "";
    const nextPath = `${folderPath ? `${folderPath}/` : ""}${nextName}.md`;
    if (nextPath === file.path) return;
    if (this.app.vault.getAbstractFileByPath(nextPath)) {
      new Notice("A file with that name already exists.");
      return;
    }
    try {
      await this.app.fileManager.renameFile(file, nextPath);
      this.file = file;
      this.filePath = file.path;
      this.refreshLeafHeader();
    } catch (error) {
      console.error("[GraphView] Failed to rename graph note:", error);
      new Notice("Failed to rename graph note.");
    }
  }

  private buildNodeLabels(entries: Array<Record<string, unknown>>): Map<string, string> {
    const labels = new Map<string, string>();
    const labelPropId = this.getPropertyId("labelProp");

    for (const entry of entries) {
      const file = entry?.file as TFile | undefined;
      if (!file) continue;

      let label = file.basename ?? file.name;
      if (labelPropId && typeof entry?.getValue === "function") {
        const value = entry.getValue(labelPropId);
        const text = value?.toString?.().trim?.() ?? "";
        if (text.length > 0) {
          label = text;
        }
      }

      labels.set(file.path, label);
    }

    return labels;
  }

  private buildNodeLabelsFromFiles(files: TFile[]): Map<string, string> {
    const labels = new Map<string, string>();
    for (const file of files) {
      labels.set(file.path, file.basename ?? file.name);
    }
    return labels;
  }

  private resolveRootNodeFiles(): TFile[] {
    const files: TFile[] = [];
    const seen = new Set<string>();

    for (const origin of this.viewStateModel.rootNodes ?? []) {
      const normalizedOrigin = String(origin ?? "").trim();
      if (!normalizedOrigin) continue;
      const file = this.app.metadataCache.getFirstLinkpathDest(normalizedOrigin, "");
      if (!(file instanceof TFile)) continue;
      if (seen.has(file.path)) continue;
      seen.add(file.path);
      files.push(file);
    }

    return files;
  }

  private toRootNodeLinkpath(file: TFile): string {
    const path = String(file?.path ?? "").trim();
    if (!path) return "";
    return path.replace(/\.md$/i, "");
  }

  private toRootNodeWikiLink(file: TFile): string {
    const linkpath = this.toRootNodeLinkpath(file);
    return linkpath ? `[[${linkpath}]]` : "";
  }

  private selectBestLinkTypeSource(entries: Array<Record<string, unknown>>): {
    source: string;
    files: TFile[];
    candidateCounts: Record<string, number>;
  } {
    return {
      source: "rootNodes",
      files: this.resolveRootNodeFiles(),
      candidateCounts: {
        rootNodes: this.viewStateModel.rootNodes.length
      }
    };
  }

  private extractFilesFromUnknown(raw: unknown): TFile[] {
    const items = this.toListLike(raw);
    if (!items) return [];
    const out: TFile[] = [];
    const seen = new Set<string>();

    for (const item of items) {
      let maybeFile: unknown = item;
      if (item && typeof item === "object" && "file" in (item as Record<string, unknown>)) {
        maybeFile = (item as Record<string, unknown>).file;
      }

      if (!maybeFile || typeof maybeFile !== "object") continue;
      const path = String((maybeFile as Record<string, unknown>).path ?? "").trim();
      if (!path || seen.has(path)) continue;
      const resolved = this.app.vault.getAbstractFileByPath(path);
      if (!(resolved instanceof TFile)) continue;
      seen.add(path);
      out.push(resolved);
    }

    return out;
  }

  private mergeFilesByPath(...groups: TFile[][]): TFile[] {
    const out: TFile[] = [];
    const seen = new Set<string>();

    for (const group of groups) {
      for (const file of group) {
        const path = String(file?.path ?? "").trim();
        if (!path || seen.has(path)) continue;
        seen.add(path);
        out.push(file);
      }
    }

    return out;
  }

  private toListLike(raw: unknown): unknown[] | null {
    if (raw == null) return null;
    if (Array.isArray(raw)) return raw;

    if (raw instanceof Set) {
      return Array.from(raw.values());
    }
    if (raw instanceof Map) {
      return Array.from(raw.values());
    }

    if (typeof raw === "object") {
      const maybeObj = raw as Record<string, unknown>;

      const toArray = maybeObj.toArray;
      if (typeof toArray === "function") {
        try {
          const arr = (toArray as () => unknown).call(raw);
          if (Array.isArray(arr)) return arr;
        } catch {
          // ignore
        }
      }

      const values = maybeObj.values;
      if (typeof values === "function") {
        try {
          const iterator = (values as () => unknown).call(raw);
          if (iterator && typeof iterator === "object" && Symbol.iterator in (iterator as object)) {
            return Array.from(iterator as Iterable<unknown>);
          }
        } catch {
          // ignore
        }
      }

      if (Symbol.iterator in maybeObj && typeof maybeObj[Symbol.iterator] === "function") {
        try {
          return Array.from(raw as Iterable<unknown>);
        } catch {
          // ignore
        }
      }

      const length = Number((maybeObj as Record<string, unknown>).length);
      if (Number.isFinite(length) && length > 0) {
        const list: unknown[] = [];
        for (let i = 0; i < Math.min(length, 100000); i++) {
          if (!(i in maybeObj)) continue;
          list.push((maybeObj as Record<number, unknown>)[i]);
        }
        if (list.length > 0) return list;
      }
    }

    return null;
  }

  private collectDeepFileArrayCandidates(
    path: string,
    value: unknown,
    out: Map<string, TFile[]>,
    visited: WeakSet<object>,
    depth: number
  ) {
    if (depth > 10) return;
    if (value == null) return;

    const listLike = this.toListLike(value);
    if (listLike) {
      const files = this.extractFilesFromUnknown(listLike);
      if (files.length > 0) {
        out.set(path, files);
      }

      const maxInspect = Math.min(listLike.length, 200);
      for (let i = 0; i < maxInspect; i++) {
        this.collectDeepFileArrayCandidates(`${path}[${i}]`, listLike[i], out, visited, depth + 1);
      }
    }

    if (typeof value !== "object") return;
    if (visited.has(value as object)) return;
    visited.add(value as object);

    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      this.collectDeepFileArrayCandidates(`${path}.${key}`, nested, out, visited, depth + 1);
    }
  }

  private getPropertyId(optionKey: string): unknown | null {
    const raw = this.config?.get(optionKey);
    const key = String(raw ?? "").trim();
    if (!key) return null;

    try {
      return parsePropertyId(key);
    } catch {
      return null;
    }
  }

  private readStoredLinkTypes(): string[] {
    const raw = StateManager.cloneState(this.readAllPersistedGraphState()).activeLinkTypes;
    return this.normalizeStoredLinkTypeArray(raw);
  }

  private normalizeStoredLinkTypeArray(raw: unknown): string[] {
    const result = new Set<string>();
    this.collectStringValues(raw, result, new Set<unknown>());
    const list = Array.from(result);
    this.debug("readStoredLinkTypes", {
      result: list
    });
    return list;
  }

  private normalizeGroupingRules(raw: unknown): GroupRule[] {
    if (!Array.isArray(raw)) return [];
    const out: GroupRule[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      const property = String(obj.property ?? "").trim();
      if (!property) continue;
      const operator = obj.operator === "contains" || obj.operator === "exists"
        ? obj.operator
        : "equals";
      const color = String(obj.color ?? "#4caf50").trim() || "#4caf50";
      const colorExplicit = typeof obj.colorExplicit === "boolean"
        ? obj.colorExplicit
        : Object.prototype.hasOwnProperty.call(obj, "color");
      const value = String(obj.value ?? "").trim();
      const icon = String(obj.icon ?? "").trim();
      const iconSourcePath = String(obj.iconSourcePath ?? "").trim();
      out.push({
        property,
        operator,
        color,
        colorExplicit,
        ...(icon ? { icon } : {}),
        ...(iconSourcePath ? { iconSourcePath } : {}),
        ...(operator === "exists" ? {} : { value })
      });
    }
    return out;
  }

  private normalizeActiveGroupRules(): GroupRule[] {
    return this.normalizeGroupingRules(
      this.activeGroups.map((group) => ({
        property: group.property,
        operator: group.operator,
        ...(group.operator === "exists" ? {} : { value: String(group.value ?? "") }),
        color: group.color,
        colorExplicit: group.colorExplicit,
        ...(group.icon ? { icon: group.icon, iconSourcePath: group.file.path } : {})
      }))
    );
  }

  private refreshGroupingMetadataCache(files: TFile[]): void {
    const next = new Map<string, Record<string, unknown>>();
    const propertySet = new Set<string>();

    for (const file of files) {
      const metadata = this.readNodeMetadataForGrouping(file);
      next.set(file.path, metadata);
      for (const key of Object.keys(metadata)) {
        propertySet.add(key);
      }
    }

    this.nodeMetadataCache = next;
    this.pendingMetadataDiffSnapshots.clear();
    this.availableGroupingProperties = Array.from(propertySet).sort((a, b) => a.localeCompare(b));
  }

  private refreshNodeLinkCache(files: TFile[]): void {
    const next = new Map<string, string[]>();
    for (const file of files) {
      next.set(file.path, this.extractNodeLinks(file));
    }
    this.nodeLinkCache = next;
  }

  private findNearestActiveLinkedVisibleNode(
    activePathRaw: string,
    candidates: ActiveLinkedVisibleNodeCandidate[]
  ): string | null {
    if (!this.nearestActiveLinkedNodeIndicatorEnabled) return null;
    const activePath = String(activePathRaw ?? "").trim();
    if (!activePath || !Array.isArray(candidates) || candidates.length === 0) return null;
    const visibleCandidatesByPath = new Map<string, Array<{ candidate: ActiveLinkedVisibleNodeCandidate; index: number }>>();
    candidates.forEach((candidate, index) => {
      const candidatePath = String(candidate.path ?? "").trim();
      const candidateId = String(candidate.id ?? "").trim();
      if (!candidatePath || !candidateId || candidatePath === activePath) return;
      const list = visibleCandidatesByPath.get(candidatePath) ?? [];
      list.push({ candidate, index });
      visibleCandidatesByPath.set(candidatePath, list);
    });
    if (visibleCandidatesByPath.size === 0) return null;

    const maxHops = Math.max(1, Math.min(32, Math.round(Number(this.nearestActiveLinkedNodeMaxHops) || 8)));
    const maxVisited = Math.max(50, Math.min(10000, Math.round(Number(this.nearestActiveLinkedNodeMaxVisited) || 1000)));
    const visited = new Set<string>([activePath]);
    const queue: Array<{ path: string; depth: number }> = [{ path: activePath, depth: 0 }];
    let cursor = 0;
    let bestDepth = Number.POSITIVE_INFINITY;
    const scored: Array<{ candidate: ActiveLinkedVisibleNodeCandidate; score: number[] }> = [];
    const incomingLinksByTarget = this.buildIncomingLinksByTarget();

    while (cursor < queue.length && visited.size <= maxVisited) {
      const current = queue[cursor++];
      if (current.depth >= bestDepth || current.depth >= maxHops) continue;
      const nextDepth = current.depth + 1;
      const neighbors = this.getLinkedNeighborPaths(current.path, incomingLinksByTarget);
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        const visibleMatches = visibleCandidatesByPath.get(neighbor);
        if (visibleMatches?.length) {
          bestDepth = nextDepth;
          for (const { candidate, index } of visibleMatches) {
            scored.push({
              candidate,
              score: [
                nextDepth,
                candidate.isCore ? 0 : 1,
                Math.max(0, Number(candidate.depth ?? 0)),
                index
              ]
            });
          }
          continue;
        }
        if (nextDepth < maxHops && visited.size < maxVisited) {
          queue.push({ path: neighbor, depth: nextDepth });
        }
      }
    }
    scored.sort((a, b) => {
      for (let i = 0; i < a.score.length; i++) {
        const diff = a.score[i] - b.score[i];
        if (diff !== 0) return diff;
      }
      return 0;
    });
    return scored[0]?.candidate.id ?? null;
  }

  private getLinkedNeighborPaths(pathRaw: string, incomingLinksByTarget: Map<string, string[]>): string[] {
    const path = String(pathRaw ?? "").trim();
    if (!path) return [];
    const out = new Set<string>();
    for (const target of this.getRootNodePropertyNeighborPaths(path)) {
      if (target !== path) out.add(target);
    }
    for (const target of this.getOutgoingLinkPaths(path)) {
      if (target !== path) out.add(target);
    }
    for (const source of incomingLinksByTarget.get(path) ?? []) {
      if (source !== path) out.add(source);
    }
    return Array.from(out);
  }

  private getRootNodePropertyNeighborPaths(pathRaw: string): string[] {
    const path = String(pathRaw ?? "").trim();
    if (!path) return [];
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return [];
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = (cache?.frontmatter ?? {}) as Record<string, unknown>;
    const propertyNames = this.getRootNodePropertyNamesForFrontmatter(frontmatter);
    if (propertyNames.length === 0) return [];

    const out: string[] = [];
    const seen = new Set<string>();
    const add = (targetPath: string): void => {
      const normalized = String(targetPath ?? "").trim();
      if (!normalized || normalized === path || seen.has(normalized)) return;
      seen.add(normalized);
      out.push(normalized);
    };
    const frontmatterByType = this.collectFrontmatterLinksByTypeForMetadata(file, frontmatter);
    for (const propertyName of propertyNames) {
      const property = String(propertyName ?? "").trim();
      if (!property) continue;
      if (property.toLowerCase() === NONE_LINK_TYPE.toLowerCase()) {
        for (const bodyLink of this.resolveBodyLinkFiles(file)) {
          add(bodyLink.path);
        }
        continue;
      }
      const normalizedProperty = property.toLowerCase();
      for (const targetPath of frontmatterByType.get(normalizedProperty) ?? []) {
        add(targetPath);
      }
    }
    return out;
  }

  private getRootNodePropertyNamesForFrontmatter(frontmatter: Record<string, unknown>): string[] {
    if (hasFrontmatterProperty(frontmatter, this.graphPropertyKeys, "rootNodeProperties")) {
      return this.collectRootNodePropertyNames(
        readFrontmatterPropertyByKey(frontmatter, this.graphPropertyKeys, "rootNodeProperties")
      );
    }
    return this.defaultRootNodeProperties
      .map((property) => String(property ?? "").trim())
      .filter(Boolean);
  }

  private getOutgoingLinkPaths(pathRaw: string): string[] {
    const path = String(pathRaw ?? "").trim();
    if (!path) return [];
    const resolvedLinks = (this.app.metadataCache as unknown as { resolvedLinks?: Record<string, Record<string, number>> }).resolvedLinks;
    const resolved = resolvedLinks?.[path];
    if (resolved && typeof resolved === "object") {
      return Object.keys(resolved).filter(Boolean);
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? this.getCachedNodeLinks(file) : [];
  }

  private buildIncomingLinksByTarget(): Map<string, string[]> {
    const out = new Map<string, string[]>();
    const resolvedLinks = (this.app.metadataCache as unknown as { resolvedLinks?: Record<string, Record<string, number>> }).resolvedLinks;
    if (!resolvedLinks || typeof resolvedLinks !== "object") return out;
    for (const [source, targets] of Object.entries(resolvedLinks)) {
      if (!source || !targets || typeof targets !== "object") continue;
      for (const target of Object.keys(targets)) {
        if (!target) continue;
        const incoming = out.get(target) ?? [];
        incoming.push(source);
        out.set(target, incoming);
      }
    }
    return out;
  }

  private getCachedNodeLinks(file: TFile): string[] {
    const existing = this.nodeLinkCache.get(file.path);
    if (existing) return existing;
    const links = this.extractNodeLinks(file);
    this.nodeLinkCache.set(file.path, links);
    return links;
  }

  private extractNodeLinks(file: TFile): string[] {
    const cache = this.app.metadataCache.getFileCache(file);
    const links = Array.isArray(cache?.links) ? cache.links : [];
    const frontmatterLinks = Array.isArray(cache?.frontmatterLinks) ? cache.frontmatterLinks : [];
    const out: string[] = [];
    for (const link of links) {
      const target = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
      if (!target) continue;
      out.push(target.path);
    }
    for (const link of frontmatterLinks) {
      const linkText = String((link as Record<string, unknown>).link ?? "").trim();
      if (!linkText) continue;
      const target = this.app.metadataCache.getFirstLinkpathDest(linkText, file.path);
      if (!target) continue;
      out.push(target.path);
    }
    return out;
  }

  private normalizeFolderPath(raw: string): string {
    return String(raw ?? "").trim().replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
  }

  private isPathInFolder(filePath: string, folderPath: string): boolean {
    const normalizedFilePath = String(filePath ?? "").trim().replace(/\\/g, "/");
    const normalizedFolderPath = this.normalizeFolderPath(folderPath);
    if (!normalizedFilePath || !normalizedFolderPath) return false;
    return normalizedFilePath.startsWith(`${normalizedFolderPath}/`);
  }

  private readNodeMetadataForGrouping(file: TFile): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    if (frontmatter && typeof frontmatter === "object") {
      for (const [key, value] of Object.entries(frontmatter)) {
        if (key === "position") continue;
        out[key] = value;
      }
    }
    return out;
  }

  private evaluateGrouping(nodePath: string): string | null {
    return this.evaluateGroupingStyle(nodePath)?.color ?? null;
  }

  private evaluateGroupingStyle(nodePath: string): { color?: string; icon?: string; iconSourcePath?: string } | null {
    const normalizedPath = String(nodePath ?? "").trim();
    if (!normalizedPath) return null;
    let metadata = this.nodeMetadataCache.get(normalizedPath);
    if (!metadata) {
      const abstractFile = this.app.vault.getAbstractFileByPath(normalizedPath);
      if (abstractFile instanceof TFile) {
        metadata = this.readNodeMetadataForGrouping(abstractFile);
        this.nodeMetadataCache.set(normalizedPath, metadata);
      }
    }
    if (!metadata) return null;

    let color: string | undefined;
    let icon: string | undefined;
    let iconSourcePath: string | undefined;

    for (const rule of this.groupingRules) {
      const rawValue = this.readFrontmatterValueCaseInsensitive(metadata, rule.property);
      let matches = false;
      if (rule.operator === "exists") {
        matches = rawValue !== undefined && rawValue !== null && !(typeof rawValue === "string" && rawValue.trim() === "");
      } else {
        const expected = String(rule.value ?? "");
        if (!expected) continue;
        matches = rule.operator === "equals"
          ? this.matchesGroupingEquals(rawValue, expected)
          : this.matchesGroupingContains(rawValue, expected);
      }
      if (!matches) continue;

      if (color === undefined && rule.colorExplicit) {
        color = rule.color;
      }
      if (icon === undefined && rule.icon) {
        icon = rule.icon;
        iconSourcePath = rule.iconSourcePath;
      }
      if (color !== undefined && icon !== undefined) break;
    }

    if (color === undefined && icon === undefined) return null;
    return {
      ...(color !== undefined ? { color } : {}),
      ...(icon !== undefined ? { icon, iconSourcePath } : {})
    };
  }

  private readFrontmatterValueCaseInsensitive(frontmatter: Record<string, unknown>, property: string): unknown {
    const target = String(property ?? "").trim().toLowerCase();
    if (!target) return undefined;
    for (const [key, value] of Object.entries(frontmatter ?? {})) {
      if (String(key ?? "").trim().toLowerCase() === target) {
        return value;
      }
    }
    return undefined;
  }

  private matchesGroupingEquals(rawValue: unknown, expected: string): boolean {
    if (Array.isArray(rawValue)) {
      return rawValue.some(item => String(item ?? "") === expected);
    }
    return String(rawValue ?? "") === expected;
  }

  private matchesGroupingContains(rawValue: unknown, expected: string): boolean {
    if (Array.isArray(rawValue)) {
      return rawValue.some(item => String(item ?? "").includes(expected));
    }
    return String(rawValue ?? "").includes(expected);
  }

  private readAllPersistedGraphState(): unknown {
    const raw = this.readLocalStorageValue("graphState") ?? this.config?.get("graphState");
    if (raw && typeof raw === "object") {
      return raw;
    }
    return {
      rootNodes: this.readLocalStorageValue("rootNodes") ?? [],
      linkTypeFilter: this.readLocalStorageValue("linkTypeFilter") ?? this.config?.get("linkTypeFilter"),
      linkTypeSemantics: this.readLocalStorageValue("linkTypeSemantics") ?? this.config?.get("linkTypeSemantics"),
      linkTypePhysics: this.readLocalStorageValue("linkTypePhysics") ?? this.config?.get("linkTypePhysics"),
      expandedParents: this.readLocalStorageValue("expandedParents") ?? this.config?.get("expandedParents"),
      groupingRules: this.config?.get("groupingRules"),
      graphSettings: this.config?.get("graphSettings"),
      layoutId: this.config?.get("layoutId"),
      repulsionStrength: this.config?.get("repulsionStrength"),
      centerStrength: this.config?.get("centerStrength"),
      nodeRadius: this.config?.get("nodeRadius"),
      nodeConnectionSizeMultiplier: this.config?.get("nodeConnectionSizeMultiplier"),
      nearRestVelocityThreshold: this.config?.get("nearRestVelocityThreshold"),
      restVelocityThreshold: this.config?.get("restVelocityThreshold"),
      textFadeThreshold: this.config?.get("textFadeThreshold"),
      hideNodesWithoutSelectedLinkTypes: this.config?.get("hideNodesWithoutSelectedLinkTypes")
    };
  }

  private buildLinkTypeSemanticsFromConfig(
    config: GraphViewState["linkTypeConfig"]
  ): Record<string, "link" | "parent"> {
    const out: Record<string, "link" | "parent"> = {};
    for (const [type, entry] of Object.entries(config ?? {})) {
      const normalizedType = String(type ?? "").trim();
      if (!normalizedType) continue;
      out[normalizedType] = entry?.semantic === "parent" ? "parent" : "link";
    }
    return out;
  }

  private buildLinkTypePhysicsFromConfig(
    config: GraphViewState["linkTypeConfig"]
  ): Record<string, LinkTypePhysicsConfig> {
    const out: Record<string, LinkTypePhysicsConfig> = {};
    for (const [type, entry] of Object.entries(config ?? {})) {
      const normalizedType = String(type ?? "").trim();
      if (!normalizedType) continue;
      if (!entry?.physics) continue;
      const strength = Number(entry.physics.strength);
      const distance = Number(entry.physics.distance);
      const patch: LinkTypePhysicsConfig = {};
      if (Number.isFinite(strength)) patch.strength = strength;
      if (Number.isFinite(distance)) patch.preferredDistance = distance;
      if (patch.strength !== undefined || patch.preferredDistance !== undefined) {
        out[normalizedType] = patch;
      }
    }
    return out;
  }

  private syncLinkTypeConfigFromLegacyMaps(): void {
    const next = this.cloneLinkTypeConfigState(this.viewStateModel.linkTypeConfig);

    for (const [type, role] of Object.entries(this.linkTypeSemantics)) {
      const normalizedType = String(type ?? "").trim();
      if (!normalizedType) continue;
      next[normalizedType] = {
        ...(next[normalizedType] ?? { semantic: "normal" }),
        semantic: role === "parent" ? "parent" : "normal"
      };
    }

    for (const [type, physics] of Object.entries(this.linkTypePhysics)) {
      const normalizedType = String(type ?? "").trim();
      if (!normalizedType) continue;
      const strength = Number(physics?.strength);
      const distance = Number(physics?.preferredDistance);
      if (!Number.isFinite(strength) && !Number.isFinite(distance)) continue;
      const existing = next[normalizedType] ?? { semantic: "normal" as const };
      next[normalizedType] = {
        ...existing,
        physics: {
          strength: Number.isFinite(strength) ? strength : (existing.physics?.strength ?? 0),
          distance: Number.isFinite(distance) ? distance : (existing.physics?.distance ?? 0)
        }
      };
    }

    this.viewStateModel = {
      ...this.viewStateModel,
      linkTypeConfig: next
    };
  }

  private cloneLinkTypeConfigState(
    config: GraphViewState["linkTypeConfig"]
  ): GraphViewState["linkTypeConfig"] {
    const out: GraphViewState["linkTypeConfig"] = {};
    for (const [type, entry] of Object.entries(config ?? {})) {
      const normalizedType = String(type ?? "").trim();
      if (!normalizedType || !entry) continue;
      out[normalizedType] = {
        semantic: entry.semantic === "parent" ? "parent" : "normal",
        ...(entry.physics ? { physics: { ...entry.physics } } : {})
      };
    }
    return out;
  }

  private syncViewStateModelFromRuntime(): void {
    this.syncLinkTypeConfigFromLegacyMaps();
    this.viewStateModel = {
      ...this.viewStateModel,
      activeLinkTypes: [...this.selectedLinkTypes],
      expandedParents: this.expandedParents.map((e) => ({ origin: e.origin, linkTypes: { ...e.linkTypes } })),
      groupingRules: this.groupingRules
        .filter((rule) => rule.operator === "equals" || rule.operator === "contains")
        .map((rule) => ({
          property: rule.property,
          operator: rule.operator,
          value: String(rule.value ?? ""),
          color: rule.color,
          colorExplicit: rule.colorExplicit,
          ...(rule.icon ? { icon: rule.icon, iconSourcePath: rule.iconSourcePath } : {})
        })),
      graphSettings: {
        ...this.graphSettings,
        layoutId: this.layoutId,
        hideNodesWithoutSelectedLinkTypes: this.hideNodesWithoutSelectedLinkTypes
      }
    };
  }

  private normalizeLinkTypeSemanticsRecord(raw: unknown): Record<string, "link" | "parent"> {
    const out: Record<string, "link" | "parent"> = {};
    if (!raw || typeof raw !== "object") {
      return out;
    }

    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const type = String(key ?? "").trim();
      if (!type) continue;
      const role = value === "parent" ? "parent" : "link";
      if (role === "parent") {
        out[type] = role;
      }
    }

    return out;
  }

  private normalizeLinkTypePhysicsRecord(raw: unknown): Record<string, LinkTypePhysicsConfig> {
    const out: Record<string, LinkTypePhysicsConfig> = {};
    if (!raw || typeof raw !== "object") {
      return out;
    }

    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const type = String(key ?? "").trim();
      if (!type) continue;
      if (!value || typeof value !== "object") continue;

      const obj = value as Record<string, unknown>;
      const preferredDistance = Number(obj.preferredDistance);
      const strength = Number(obj.strength);
      const normalized: LinkTypePhysicsConfig = {};
      if (Number.isFinite(preferredDistance)) {
        normalized.preferredDistance = preferredDistance;
      }
      if (Number.isFinite(strength)) {
        normalized.strength = strength;
      }

      if (
        Number.isFinite(normalized.preferredDistance) ||
        Number.isFinite(normalized.strength)
      ) {
        out[type] = normalized;
      }
    }

    return out;
  }

  private normalizeExpandedParentsState(
    raw: unknown
  ): ExpandedNodeState[] {
    if (!Array.isArray(raw)) return [];

    const byOrigin = new Map<string, Record<string, boolean>>();

    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const origin = String((item as Record<string, unknown>).origin ?? "").trim();
      if (!origin) continue;

      const obj = item as Record<string, unknown>;
      const current = byOrigin.get(origin) ?? {};

      if ("linkType" in obj) {
        const linkType = String(obj.linkType ?? "").trim();
        if (!linkType) continue;
        const isVisibleRaw = obj.isVisible;
        const isVisible = typeof isVisibleRaw === "boolean" ? isVisibleRaw : true;
        current[linkType] = Boolean(current[linkType]) || isVisible;
        byOrigin.set(origin, current);
        continue;
      }

      const rawLinkTypes = (obj.linkTypes && typeof obj.linkTypes === "object")
        ? (obj.linkTypes as Record<string, unknown>)
        : {};
      for (const [rawType, rawVisible] of Object.entries(rawLinkTypes)) {
        const linkType = String(rawType ?? "").trim();
        if (!linkType) continue;
        current[linkType] = Boolean(current[linkType]) || Boolean(rawVisible);
      }
      if (Object.keys(current).length > 0) {
        byOrigin.set(origin, current);
      }
    }

    return Array.from(byOrigin.entries())
      .map(([origin, linkTypes]) => ({ origin, linkTypes: { ...linkTypes } }))
      .sort((a, b) => a.origin.localeCompare(b.origin));
  }

  private setExpandedParentVisibility(origin: string, linkType: string, isVisible: boolean): void {
    const normalizedOrigin = String(origin ?? "").trim();
    const normalizedLinkType = String(linkType ?? "").trim();
    if (!normalizedOrigin || !normalizedLinkType) return;

    let changed = false;
    const next = this.expandedParents.map((item) => {
      if (item.origin !== normalizedOrigin) return item;
      const currentVisible = Boolean(item.linkTypes?.[normalizedLinkType]);
      if (currentVisible === isVisible) return item;
      changed = true;
      return {
        origin: item.origin,
        linkTypes: {
          ...(item.linkTypes ?? {}),
          [normalizedLinkType]: isVisible
        }
      };
    });

    if (!next.some((item) => item.origin === normalizedOrigin)) {
      next.push({
        origin: normalizedOrigin,
        linkTypes: {
          [normalizedLinkType]: isVisible
        }
      });
      changed = true;
    }

    if (!changed) return;
    this.expandedParents = this.normalizeExpandedParentsState(next);
    this.viewStateModel = { ...this.viewStateModel, expandedParents: this.expandedParents.map((e) => ({ origin: e.origin, linkTypes: { ...e.linkTypes } })) };
    this.updateRelevantProperties();
    this.hasRuntimeExpandedParentChanges = true;
    this.persistStateToLocalStorage();
  }

  private removeExpandedParentMemory(origin: string, linkType: string): void {
    const normalizedOrigin = String(origin ?? "").trim();
    const normalizedLinkType = String(linkType ?? "").trim();
    if (!normalizedOrigin || !normalizedLinkType) return;

    let changed = false;
    const next = this.expandedParents
      .map((item) => {
        if (item.origin !== normalizedOrigin) return item;
        if (!(normalizedLinkType in (item.linkTypes ?? {}))) return item;
        const linkTypes = { ...(item.linkTypes ?? {}) };
        delete linkTypes[normalizedLinkType];
        changed = true;
        return { origin: item.origin, linkTypes };
      })
      .filter((item) => Object.keys(item.linkTypes ?? {}).length > 0);

    if (!changed) return;
    this.expandedParents = this.normalizeExpandedParentsState(next);
    this.viewStateModel = { ...this.viewStateModel, expandedParents: this.expandedParents.map((e) => ({ origin: e.origin, linkTypes: { ...e.linkTypes } })) };
    this.updateRelevantProperties();
    this.hasRuntimeExpandedParentChanges = true;
    this.persistStateToLocalStorage();
  }

  private removeExpandedParentMemoryEntries(entries: Array<{ origin: string; linkType: string }>): void {
    const toRemove = new Set(
      entries.map((item) => `${String(item.origin ?? "").trim()}::${String(item.linkType ?? "").trim()}`)
    );
    if (toRemove.size === 0) return;

    let changed = false;
    const next = this.expandedParents
      .map((item) => {
        const linkTypes: Record<string, boolean> = {};
        for (const [type, visible] of Object.entries(item.linkTypes ?? {})) {
          if (toRemove.has(`${item.origin}::${type}`)) {
            changed = true;
            continue;
          }
          linkTypes[type] = Boolean(visible);
        }
        return { origin: item.origin, linkTypes };
      })
      .filter((item) => Object.keys(item.linkTypes).length > 0);
    if (!changed) return;
    this.expandedParents = this.normalizeExpandedParentsState(next);
    this.viewStateModel = { ...this.viewStateModel, expandedParents: this.expandedParents.map((e) => ({ origin: e.origin, linkTypes: { ...e.linkTypes } })) };
    this.updateRelevantProperties();
    this.hasRuntimeExpandedParentChanges = true;
    this.persistStateToLocalStorage();
  }

  private isExpandedParent(origin: string, linkType: string): boolean {
    const normalizedOrigin = String(origin ?? "").trim();
    const normalizedLinkType = String(linkType ?? "").trim();
    if (!normalizedOrigin || !normalizedLinkType) return false;
    const nodeExpansion = this.expandedParents.find(item => item.origin === normalizedOrigin);
    return Boolean(nodeExpansion?.linkTypes?.[normalizedLinkType]);
  }

  private restoreSubtreeExpansion(origin: string, linkType: string, visited = new Set<string>()): boolean {
    const normalizedOrigin = String(origin ?? "").trim();
    const normalizedLinkType = String(linkType ?? "").trim();
    if (!normalizedOrigin || !normalizedLinkType) return false;

    const key = `${normalizedOrigin}::${normalizedLinkType}`;
    if (visited.has(key)) return true;
    visited.add(key);

    if (!this.engine.hasNode(normalizedOrigin)) {
      // The node can be temporarily hidden when an ancestor expansion is collapsed.
      // Keep persisted subtree memory so it can be restored once the ancestor is expanded again.
      return false;
    }

    const expanded = this.engine.expandParentLinks(normalizedOrigin, normalizedLinkType);
    if (!expanded) {
      // Keep memory on replay failure; explicit user collapse is handled by setExpandedParentVisibility(false).
      return false;
    }

    const childTargets = this.engine.getParentLinkTargets(normalizedOrigin, normalizedLinkType);
    for (const childOrigin of childTargets) {
      const childEntries = this.flattenExpandedParents(this.expandedParents).filter(item =>
        item.origin === childOrigin && item.isVisible
      );
      for (const childEntry of childEntries) {
        this.restoreSubtreeExpansion(childEntry.origin, childEntry.linkType, visited);
      }
    }

    return true;
  }

  private replayExpandedParents(): void {
    if (!this.initialized) return;
    if (this.expandedParents.length === 0) return;

    const next = this.normalizeExpandedParentsState(this.expandedParents);
    const beforeSig = this.buildExpandedParentsSignature(this.expandedParents);
    this.expandedParents = next;
    this.viewStateModel = { ...this.viewStateModel, expandedParents: this.expandedParents.map((e) => ({ origin: e.origin, linkTypes: { ...e.linkTypes } })) };
    this.updateRelevantProperties();

    const visibleEntries = this.flattenExpandedParents(this.expandedParents).filter(item => item.isVisible);
    const visibleSet = new Set(visibleEntries.map(item => `${item.origin}::${item.linkType}`));
    const childOriginSet = new Set<string>(visibleEntries.map(item => item.origin));

    for (const item of visibleEntries) {
      const hasVisibleParentInMemory = this.flattenExpandedParents(this.expandedParents).some(parentEntry => {
        if (!parentEntry.isVisible) return false;
        if (parentEntry.origin === item.origin && parentEntry.linkType === item.linkType) return false;
        const targets = this.engine.getParentLinkTargets(parentEntry.origin, parentEntry.linkType);
        return targets.includes(item.origin);
      });

      if (hasVisibleParentInMemory) continue;
      this.restoreSubtreeExpansion(item.origin, item.linkType);
    }

    // Clean visible entries whose origins no longer exist in the rendered graph and are not reachable as child origins.
    for (const item of visibleEntries) {
      if (this.engine.hasNode(item.origin)) continue;
      if (childOriginSet.has(item.origin)) continue;
      visibleSet.delete(`${item.origin}::${item.linkType}`);
      this.removeExpandedParentMemory(item.origin, item.linkType);
    }

    const afterSig = this.buildExpandedParentsSignature(this.expandedParents);
    if (beforeSig !== afterSig) {
      this.hasRuntimeExpandedParentChanges = true;
      this.persistStateToLocalStorage();
      this.persistExpandedParentsToConfig();
    }
  }

  private replayPersistedBadgeExpansions(): void {
    if (!this.graphState) return;
    const expandedEntries = this.graphState.listExpandedGraphEntries();
    const pending = expandedEntries.map((e) => ({
      sourceNodeId: e.sourceNodeId,
      sourcePath: e.sourcePath,
      linkType: e.linkType,
      id: e.id
    }));

    // Source-driven replay: as parent badges expand, their child sources become visible on later passes.
    let remaining = pending;
    const maxPasses = Math.max(1, pending.length);
    const replayed = new Set<string>();
    for (let pass = 0; pass < maxPasses && remaining.length > 0; pass++) {
      let progressed = false;
      const nextRemaining: typeof pending = [];
      for (const item of remaining) {
        const sourceNodeId = String(item.sourceNodeId ?? "").trim();
        const sourcePath = String(item.sourcePath ?? "").trim();
        const linkType = String(item.linkType ?? "").trim();
        const runtimeSourceNodeId = this.engine.hasNode(sourceNodeId)
          ? sourceNodeId
          : this.engine.getVisibleNodeIdForSourcePath(sourcePath);
        if (!runtimeSourceNodeId) {
          nextRemaining.push(item);
          continue;
        }
        const replayKey = `${runtimeSourceNodeId}::${linkType}`;
        if (replayed.has(replayKey)) continue;
        const activeLinkType = this.activeLinkTypes.find((candidate) =>
          String(candidate.property ?? "").trim().toLowerCase() === linkType.toLowerCase()
        );
        if (activeLinkType?.semantic === "parent") {
          const expanded = this.engine.expandParentLinks(runtimeSourceNodeId, linkType);
          if (!expanded) {
            nextRemaining.push(item);
            continue;
          }
          this.setExpandedParentVisibility(sourcePath, linkType, true);
        } else {
          this.engine.toggleExpansion(sourcePath, linkType, {
            persist: false,
            sourceNodeId: runtimeSourceNodeId
          });
        }
        replayed.add(item.id);
        replayed.add(replayKey);
        progressed = true;
      }
      remaining = nextRemaining;
      if (!progressed) break;
    }
  }

  private collectStringValues(raw: unknown, out: Set<string>, visited: Set<unknown>) {
    if (raw == null) return;
    if (visited.has(raw)) return;
    if (typeof raw === "object") {
      visited.add(raw);
    }

    if (typeof raw === "string") {
      for (const part of raw.split(/[,\n;]+/)) {
        const text = part.trim();
        if (text.length > 0) {
          out.add(text);
        }
      }
      return;
    }

    if (Array.isArray(raw)) {
      for (const item of raw) {
        this.collectStringValues(item, out, visited);
      }
      return;
    }

    if (raw instanceof Set) {
      for (const item of raw.values()) {
        this.collectStringValues(item, out, visited);
      }
      return;
    }

    if (typeof raw === "object") {
      const obj = raw as Record<string, unknown>;

      if (typeof obj.value === "string") {
        const v = obj.value.trim();
        if (v.length > 0) {
          out.add(v);
        }
      }

      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === "boolean" && value) {
          out.add(key);
        }
      }

      if (Array.isArray(obj.selected)) {
        this.collectStringValues(obj.selected, out, visited);
      }
      if (Array.isArray(obj.values)) {
        this.collectStringValues(obj.values, out, visited);
      }
      if (Array.isArray(obj.options)) {
        this.collectStringValues(obj.options, out, visited);
      }
    }
  }

  private flattenExpandedParents(
    expandedParents: ExpandedNodeState[]
  ): Array<{ origin: string; linkType: string; isVisible: boolean }> {
    const out: Array<{ origin: string; linkType: string; isVisible: boolean }> = [];
    for (const entry of expandedParents ?? []) {
      const origin = String(entry?.origin ?? "").trim();
      if (!origin) continue;
      for (const [linkTypeRaw, isVisibleRaw] of Object.entries(entry.linkTypes ?? {})) {
        const linkType = String(linkTypeRaw ?? "").trim();
        if (!linkType) continue;
        out.push({ origin, linkType, isVisible: Boolean(isVisibleRaw) });
      }
    }
    return out;
  }

  private renderError(container: HTMLElement, error: unknown) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error("[BasesGraphView] runtime error", error);

    if (!this.errorEl) {
      this.errorEl = container.createDiv();
      setStyle(this.errorEl, "position", "absolute");
      setStyle(this.errorEl, "inset", "8px");
      setStyle(this.errorEl, "zIndex", "10");
      setStyle(this.errorEl, "padding", "10px");
      setStyle(this.errorEl, "border", "1px solid var(--background-modifier-error)");
      setStyle(this.errorEl, "background", "var(--background-primary)");
      setStyle(this.errorEl, "color", "var(--text-error)");
      setStyle(this.errorEl, "fontFamily", "var(--font-monospace)");
      setStyle(this.errorEl, "fontSize", "12px");
      setStyle(this.errorEl, "whiteSpace", "pre-wrap");
      setStyle(this.errorEl, "pointerEvents", "auto");
    }

    this.errorEl.setText(`Graph View error:\n${message}`);
  }

  private readGraphSettingsFromConfig(): GraphSimulationSettings {
    const persistedState = StateManager.cloneState(this.readAllPersistedGraphState());
    const repulsionRaw = this.config?.get("repulsionStrength");
    const gravityRaw = this.config?.get("centerStrength");
    const nodeRadiusRaw = this.config?.get("nodeRadius");
    const nodeConnectionSizeMultiplierRaw = this.config?.get("nodeConnectionSizeMultiplier");
    const nearRestVelocityRaw = this.config?.get("nearRestVelocityThreshold");
    const restVelocityRaw = this.config?.get("restVelocityThreshold");
    const textFadeThresholdRaw = this.config?.get("textFadeThreshold");

    // Backward-compatibility: migrate older object-based key if present.
    const legacyRaw = this.config?.get("graphSettings");
    const legacy = legacyRaw && typeof legacyRaw === "object"
      ? legacyRaw as Record<string, unknown>
      : null;

    const repulsion = Number(
      persistedState.graphSettings?.repulsionStrength
      ?? repulsionRaw
      ?? legacy?.repulsionStrength
      ?? DEFAULT_GRAPH_SETTINGS.repulsionStrength
    );
    const gravity = Number(
      persistedState.graphSettings?.centerStrength
      ?? gravityRaw
      ?? legacy?.centerStrength
      ?? DEFAULT_GRAPH_SETTINGS.centerStrength
    );
    const nodeRadius = Number(
      persistedState.graphSettings?.nodeRadius
      ?? nodeRadiusRaw
      ?? legacy?.nodeRadius
      ?? DEFAULT_GRAPH_SETTINGS.nodeRadius
    );
    const nodeConnectionSizeMultiplier = Number(
      persistedState.graphSettings?.nodeConnectionSizeMultiplier
      ?? nodeConnectionSizeMultiplierRaw
      ?? legacy?.nodeConnectionSizeMultiplier
      ?? DEFAULT_GRAPH_SETTINGS.nodeConnectionSizeMultiplier
    );
    const nearRestVelocityThreshold = Number(
      persistedState.graphSettings?.nearRestVelocityThreshold
      ?? nearRestVelocityRaw
      ?? legacy?.nearRestVelocityThreshold
      ?? DEFAULT_GRAPH_SETTINGS.nearRestVelocityThreshold
    );
    const restVelocityThreshold = Number(
      persistedState.graphSettings?.restVelocityThreshold
      ?? restVelocityRaw
      ?? legacy?.restVelocityThreshold
      ?? DEFAULT_GRAPH_SETTINGS.restVelocityThreshold
    );
    const textFadeThreshold = Number(
      persistedState.graphSettings?.textFadeThreshold
      ?? textFadeThresholdRaw
      ?? legacy?.textFadeThreshold
      ?? DEFAULT_GRAPH_SETTINGS.textFadeThreshold
    );

    return {
      repulsionStrength: Number.isFinite(repulsion) ? repulsion : DEFAULT_GRAPH_SETTINGS.repulsionStrength,
      centerStrength: Number.isFinite(gravity) ? gravity : DEFAULT_GRAPH_SETTINGS.centerStrength,
      nodeRadius: Number.isFinite(nodeRadius) ? nodeRadius : DEFAULT_GRAPH_SETTINGS.nodeRadius,
      nodeConnectionSizeMultiplier: Number.isFinite(nodeConnectionSizeMultiplier)
        ? nodeConnectionSizeMultiplier
        : DEFAULT_GRAPH_SETTINGS.nodeConnectionSizeMultiplier,
      nearRestVelocityThreshold: Number.isFinite(nearRestVelocityThreshold)
        ? nearRestVelocityThreshold
        : DEFAULT_GRAPH_SETTINGS.nearRestVelocityThreshold,
      restVelocityThreshold: Number.isFinite(restVelocityThreshold)
        ? restVelocityThreshold
        : DEFAULT_GRAPH_SETTINGS.restVelocityThreshold,
      textFadeThreshold: Number.isFinite(textFadeThreshold)
        ? Math.max(0, Math.min(100, textFadeThreshold))
        : DEFAULT_GRAPH_SETTINGS.textFadeThreshold
    };
  }

  private readLayoutIdFromConfig(): string {
    const persistedState = StateManager.cloneState(this.readAllPersistedGraphState());
    return this.normalizeLayoutId(persistedState.graphSettings?.layoutId);
  }

  private normalizeLayoutId(layoutId: unknown): string {
    const normalized = String(layoutId ?? "").trim().toLowerCase();
    return normalized || DEFAULT_LAYOUT_ID;
  }

  private getLayoutOptions(): GraphLayoutOption[] {
    return [
      { id: FORCE_GRAPH_LAYOUT_ID, label: "Force layout", enabled: true },
      { id: DIRECTION_GRAPH_LAYOUT_ID, label: "Direction layout", enabled: false }
    ];
  }

  private readNodeDragHoldDurationFromConfig(): number {
    const raw = this.config?.get("nodeDragHoldDurationMs");
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      return Math.max(0, Math.round(this.defaultNodeDragHoldDurationMs));
    }
    return Math.max(0, Math.round(value));
  }

  private readHideNodesWithoutSelectedLinkTypesFromConfig(): boolean {
    const persistedState = StateManager.cloneState(this.readAllPersistedGraphState());
    if (typeof persistedState.graphSettings?.hideNodesWithoutSelectedLinkTypes === "boolean") {
      return persistedState.graphSettings.hideNodesWithoutSelectedLinkTypes;
    }
    const raw = this.config?.get("hideNodesWithoutSelectedLinkTypes");
    if (typeof raw === "boolean") {
      return raw;
    }

    const legacyRaw = this.config?.get("graphSettings");
    if (legacyRaw && typeof legacyRaw === "object") {
      const legacy = legacyRaw as Record<string, unknown>;
      if (typeof legacy.hideNodesWithoutSelectedLinkTypes === "boolean") {
        return legacy.hideNodesWithoutSelectedLinkTypes;
      }
    }

    return false;
  }

  private readNodeLimitFromConfig(): number {
    const resultsLimit = Number(this.config?.get("limit"));
    if (Number.isFinite(resultsLimit)) {
      return Math.max(1, Math.round(resultsLimit));
    }

    const legacyNodeLimit = Number(this.config?.get("nodeLimit"));
    if (Number.isFinite(legacyNodeLimit)) {
      return Math.max(1, Math.round(legacyNodeLimit));
    }

    return Math.max(1, Math.round(this.defaultNodeLimit));
  }

  private migrateLegacyNodeLimitSetting() {
    if (!this.config) return;
    const resultsLimit = Number(this.config.get("limit"));
    if (Number.isFinite(resultsLimit)) return;

    const legacyNodeLimit = Number(this.config.get("nodeLimit"));
    if (!Number.isFinite(legacyNodeLimit)) return;

    this.config.set("limit", Math.max(1, Math.round(legacyNodeLimit)));
  }

  private ensureDefaultResultsLimit() {
    if (!this.config) return;

    const current = Number(this.config.get("limit"));
    const defaultLimit = Math.max(1, Math.round(this.defaultNodeLimit));

    // Only seed the built-in Results limit if the Base View has no explicit value yet.
    if (!Number.isFinite(current)) {
      this.config.set("limit", defaultLimit);
      this.debugSource("ensureDefaultResultsLimit:set", {
        previousLimit: null,
        nextLimit: defaultLimit
      });
    }
  }

  private persistStateToLocalStorage() {
    const key = this.resolvePersistenceKey();
    this.persistenceKey = key;
    this.syncViewStateModelFromRuntime();

    try {
      this.app.saveLocalStorage(this.storageKey(key, "graphState"), JSON.stringify(StateManager.serializeState(this.viewStateModel)));

      this.debug("persistStateToLocalStorage", {
        key,
        activeLinkTypes: this.viewStateModel.activeLinkTypes,
        linkTypeConfigKeys: Object.keys(this.viewStateModel.linkTypeConfig ?? {}),
        expandedParentsCount: this.expandedParents.length,
        rootNodesCount: this.viewStateModel.rootNodes.length
      });
    } catch {
      // Ignore vault-scoped storage failures for link-type runtime state.
    }
  }

  private readLocalStorageValue(suffix: string): unknown | null {
    const scopedKey = this.persistenceKey ?? this.resolvePersistenceKey();

    try {
      const raw = this.app.loadLocalStorage(this.storageKey(scopedKey, suffix));
      if (!raw) return null;
      this.debug("readLocalStorageValue:hit", {
        suffix,
        scope: scopedKey
      });
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private storageKey(scopeKey: string, suffix: string): string {
    return `nosygraph:${scopeKey}:${suffix}`;
  }

  private configStorageKey(): string {
    return this.storageKey(this.resolveViewKey(), "config");
  }

  private loadConfigStore(): void {
    try {
      const raw = this.app.loadLocalStorage(this.configStorageKey());
      if (!raw) {
        this.configData = {};
        return;
      }
      const parsed = JSON.parse(raw);
      this.configData = parsed && typeof parsed === "object"
        ? { ...(parsed as Record<string, unknown>) }
        : {};
    } catch {
      this.configData = {};
    }
  }

  private persistConfigStore(): void {
    try {
      this.app.saveLocalStorage(this.configStorageKey(), JSON.stringify(this.configData));
    } catch {
      // Ignore vault-scoped storage failures for config state.
    }
  }

  private resolvePersistenceKey(): string {
    return this.resolveViewKey();
  }

  private resolveViewKey(): string {
    return BASES_GRAPH_VIEW;
  }

  private persistLinkTypesToConfig(immediate = false) {
    if (!this.config) return;
    this.syncViewStateModelFromRuntime();

    // Writing to base config during active interaction can trigger view refreshes.
    // Keep runtime changes in vault-scoped storage and persist to config only on unload.
    if (!immediate) {
      if (this.linkTypePersistTimer !== null) {
        window.clearTimeout(this.linkTypePersistTimer);
        this.linkTypePersistTimer = null;
      }
      this.debug("persistLinkTypesToConfig:defer-until-unload", {
        signature: this.buildLinkTypeSignature(this.selectedLinkTypes)
      });
      return;
    }

    const signature = this.buildLinkTypeSignature(this.selectedLinkTypes);
    if (signature === this.lastPersistedLinkTypeSignature) {
      this.debug("persistLinkTypesToConfig:skip-unchanged", {
        immediate,
        signature
      });
      return;
    }

    this.config?.set("graphState", StateManager.serializeState(this.viewStateModel));
    this.lastPersistedLinkTypeSignature = signature;
    this.debug("persistLinkTypesToConfig:write", {
      immediate,
      signature,
      selectedLinkTypes: this.selectedLinkTypes
    });
  }

  private persistLinkTypeSemanticsToConfig(immediate = false) {
    if (!this.config) return;
    this.syncViewStateModelFromRuntime();

    if (!immediate) {
      return;
    }

    const signature = this.buildLinkTypeConfigSignature(this.viewStateModel.linkTypeConfig);
    if (signature === this.lastPersistedLinkTypeSemanticsSignature) {
      return;
    }

    this.config.set("graphState", StateManager.serializeState(this.viewStateModel));
    this.lastPersistedLinkTypeSemanticsSignature = signature;
    this.hasRuntimeLinkTypeSemanticChanges = false;
    this.debug("persistLinkTypeSemanticsToConfig:write", {
      immediate,
      signature,
      linkTypeConfigKeys: Object.keys(this.viewStateModel.linkTypeConfig ?? {})
    });
  }

  private persistLinkTypePhysicsToConfig(immediate = false) {
    if (!this.config) return;
    this.syncViewStateModelFromRuntime();

    if (!immediate) {
      return;
    }

    const signature = this.buildLinkTypeConfigSignature(this.viewStateModel.linkTypeConfig);
    if (signature === this.lastPersistedLinkTypePhysicsSignature) {
      return;
    }

    this.config.set("graphState", StateManager.serializeState(this.viewStateModel));
    this.lastPersistedLinkTypePhysicsSignature = signature;
    this.hasRuntimeLinkTypePhysicsChanges = false;
    this.debug("persistLinkTypePhysicsToConfig:write", {
      immediate,
      signature,
      keys: Object.keys(this.viewStateModel.linkTypeConfig ?? {})
    });
  }

  private persistExpandedParentsToConfig(immediate = false) {
    if (!this.config) return;
    this.syncViewStateModelFromRuntime();

    if (!immediate) {
      return;
    }

    const signature = this.buildExpandedParentsSignature(this.expandedParents);
    if (signature === this.lastPersistedExpandedParentsSignature) {
      return;
    }

    this.config.set("graphState", StateManager.serializeState(this.viewStateModel));
    this.lastPersistedExpandedParentsSignature = signature;
    this.hasRuntimeExpandedParentChanges = false;
    this.debug("persistExpandedParentsToConfig:write", {
      immediate,
      signature,
      count: this.expandedParents.length
    });
  }

  private persistGraphSettingsToConfig(immediate = false) {
    if (!this.config) return;
    this.syncViewStateModelFromRuntime();

    if (!immediate) {
      // Writing base config during active slider interaction can refresh the view.
      // Keep runtime state and persist only on unload.
      return;
    }

    const graphSignature = this.buildGraphSettingsSignature(this.graphSettings);
    const hideNodesSignature = this.buildHideNodesSignature(this.hideNodesWithoutSelectedLinkTypes);
    if (
      graphSignature === this.lastPersistedGraphSettingsSignature &&
      hideNodesSignature === this.lastPersistedHideNodesSignature
    ) {
      return;
    }

    this.config.set("graphState", StateManager.serializeState(this.viewStateModel));
    this.lastPersistedGraphSettingsSignature = graphSignature;
    this.lastPersistedHideNodesSignature = hideNodesSignature;
    this.hasRuntimeGraphSettingsChanges = false;
    this.hasRuntimeHideNodesSettingChanges = false;
    this.debug("persistGraphSettingsToConfig:write", {
      graphSignature,
      hideNodesSignature,
      graphSettings: this.graphSettings,
      hideNodesWithoutSelectedLinkTypes: this.hideNodesWithoutSelectedLinkTypes
    });
  }

  private buildGraphSettingsSignature(settings: GraphSimulationSettings): string {
    return [
      settings.repulsionStrength,
      settings.centerStrength,
      settings.nodeRadius,
      settings.nodeConnectionSizeMultiplier,
      settings.nearRestVelocityThreshold,
      settings.restVelocityThreshold,
      settings.textFadeThreshold,
      this.normalizeLayoutId(this.layoutId)
    ].join("|");
  }

  private buildHideNodesSignature(enabled: boolean): string {
    return enabled ? "1" : "0";
  }

  private buildLinkTypeSignature(types: string[]): string {
    const uniq = new Set<string>();
    for (const type of types) {
      const t = String(type ?? "").trim();
      if (t.length > 0) {
        uniq.add(t);
      }
    }
    return Array.from(uniq).sort((a, b) => a.localeCompare(b)).join("|");
  }

  private buildLinkTypeSemanticsSignature(
    semantics: Record<string, "link" | "parent">
  ): string {
    return Object.entries(this.normalizeLinkTypeSemanticsRecord(semantics))
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([type, role]) => `${type}:${role}`)
      .join("|");
  }

  private buildLinkTypePhysicsSignature(
    physics: Record<string, LinkTypePhysicsConfig>
  ): string {
    return Object.entries(this.normalizeLinkTypePhysicsRecord(physics))
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([type, config]) => [
        type,
        Number.isFinite(config.preferredDistance) ? config.preferredDistance : "",
        Number.isFinite(config.strength) ? config.strength : ""
      ].join(":"))
      .join("|");
  }

  private buildExpandedParentsSignature(
    expandedParents: ExpandedNodeState[]
  ): string {
    return this.flattenExpandedParents(this.normalizeExpandedParentsState(expandedParents))
      .sort((a, b) => `${a.origin}::${a.linkType}`.localeCompare(`${b.origin}::${b.linkType}`))
      .map(item => `${item.origin}::${item.linkType}:${item.isVisible ? "1" : "0"}`)
      .join("|");
  }

  private buildLinkTypeConfigSignature(
    config: GraphViewState["linkTypeConfig"]
  ): string {
    return Object.entries(this.cloneLinkTypeConfigState(config))
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([type, entry]) => [
        type,
        entry.semantic,
        Number.isFinite(Number(entry.physics?.strength)) ? Number(entry.physics?.strength) : "",
        Number.isFinite(Number(entry.physics?.distance)) ? Number(entry.physics?.distance) : ""
      ].join(":"))
      .join("|");
  }

  private tryHydratePersistedState() {
    const key = this.resolvePersistenceKey();
    if (!this.hasHydratedPersistedState && key) {
      this.persistenceKey = key;
    }

    if (this.hasHydratedPersistedState) {
      if (!key && this.persistenceKey) {
        this.debug("tryHydratePersistedState:skip-missing-key", {
          key,
          currentPersistenceKey: this.persistenceKey
        });
        return;
      }
    }

    if (key) {
      this.persistenceKey = key;
    }
    this.debug("tryHydratePersistedState:key-changed", {
      key,
      hasRuntimeLinkTypeChanges: this.hasRuntimeLinkTypeChanges
    });

    const persistedState = StateManager.cloneState(this.readAllPersistedGraphState());
    const persistedSettings = this.readGraphSettingsFromConfig();
    const persistedLayoutId = this.readLayoutIdFromConfig();
    const nodeDragHoldDurationMs = this.readNodeDragHoldDurationFromConfig();
    const hideNodesWithoutSelectedLinkTypes = this.readHideNodesWithoutSelectedLinkTypesFromConfig();
    const nodeLimit = this.readNodeLimitFromConfig();

    if (!this.hasRuntimeLinkTypeChanges) {
      this.selectedLinkTypes = [...persistedState.activeLinkTypes];
      this.viewStateModel = { ...this.viewStateModel, activeLinkTypes: [...this.selectedLinkTypes] };
    }
    if (!this.hasRuntimeLinkTypeSemanticChanges) {
      this.linkTypeSemantics = this.buildLinkTypeSemanticsFromConfig(persistedState.linkTypeConfig);
    }
    if (!this.hasRuntimeLinkTypePhysicsChanges) {
      this.linkTypePhysics = this.buildLinkTypePhysicsFromConfig(persistedState.linkTypeConfig);
    }
    if (!this.hasRuntimeLinkTypeSemanticChanges || !this.hasRuntimeLinkTypePhysicsChanges) {
      this.viewStateModel = {
        ...this.viewStateModel,
        linkTypeConfig: this.cloneLinkTypeConfigState(persistedState.linkTypeConfig)
      };
    }
    if (!this.hasRuntimeExpandedParentChanges) {
      this.expandedParents = this.normalizeExpandedParentsState(persistedState.expandedParents);
      this.viewStateModel = {
        ...this.viewStateModel,
        expandedParents: this.expandedParents.map((e) => ({ origin: e.origin, linkTypes: { ...e.linkTypes } }))
      };
    }
    this.updateRelevantProperties();
    if (!this.hasRuntimeGraphSettingsChanges && !this.isFileMode) {
      this.graphSettings = { ...persistedSettings };
      this.layoutId = this.normalizeLayoutId(persistedLayoutId);
    }

    if (!this.hasRuntimeLinkTypeChanges) {
      this.debug("tryHydratePersistedState:apply-persisted-types", {
        persistedTypes: persistedState.activeLinkTypes
      });
      this.engine.setSelectedLinkTypes(this.selectedLinkTypes);
    } else {
      // Keep interactive state stable when persistence scope changes mid-session.
      this.debug("tryHydratePersistedState:keep-runtime-types", {
        selectedLinkTypes: this.selectedLinkTypes,
        persistedTypes: persistedState.activeLinkTypes
      });
      this.persistStateToLocalStorage();
      this.persistLinkTypesToConfig();
    }
    if (!this.hasRuntimeLinkTypeSemanticChanges) {
      this.engine.setAllLinkTypeSemantics(this.linkTypeSemantics);
    } else {
      this.persistStateToLocalStorage();
      this.persistLinkTypeSemanticsToConfig();
    }
    if (!this.hasRuntimeLinkTypePhysicsChanges) {
      this.engine.setLinkTypePhysics(this.linkTypePhysics);
    } else {
      this.persistStateToLocalStorage();
      this.persistLinkTypePhysicsToConfig();
    }
    if (this.hasRuntimeExpandedParentChanges) {
      this.persistStateToLocalStorage();
      this.persistExpandedParentsToConfig();
    }
    if (!this.hasRuntimeGraphSettingsChanges) {
      this.engine.setSimulationSettings(this.graphSettings);
      this.engine.setLayout(this.layoutId);
    } else {
      // Keep live slider state stable if persistence scope shifts mid-session.
      this.persistGraphSettingsToConfig();
    }
    if (!this.hasRuntimeHideNodesSettingChanges) {
      this.hideNodesWithoutSelectedLinkTypes = hideNodesWithoutSelectedLinkTypes;
      this.engine.setHideNodesWithoutSelectedLinkTypes(this.hideNodesWithoutSelectedLinkTypes);
    } else {
      this.persistGraphSettingsToConfig();
    }
    this.nodeDragHoldDurationMs = nodeDragHoldDurationMs;
    this.nodeLimit = nodeLimit;
    this.engine.setNodeDragHoldDurationMs(this.nodeDragHoldDurationMs);
    this.lastPersistedLinkTypeSemanticsSignature = this.buildLinkTypeConfigSignature(this.viewStateModel.linkTypeConfig);
    this.lastPersistedLinkTypePhysicsSignature = this.buildLinkTypeConfigSignature(this.viewStateModel.linkTypeConfig);
    this.lastPersistedExpandedParentsSignature = this.buildExpandedParentsSignature(this.expandedParents);
    this.lastPersistedGraphSettingsSignature = this.buildGraphSettingsSignature(this.graphSettings);
    this.lastPersistedHideNodesSignature = this.buildHideNodesSignature(this.hideNodesWithoutSelectedLinkTypes);
    this.hasHydratedPersistedState = true;
  }

  private debug(event: string, payload?: Record<string, unknown>) {
    if (!this.debugEnabled) return;
    void event;
    void payload;
  }

  private debugSource(event: string, payload?: Record<string, unknown>) {
    if (!this.sourceDebugEnabled) return;
    void event;
    void payload;
  }
}

class RenameGraphNoteModal extends Modal {
  private inputEl: HTMLInputElement | null = null;
  private submitted = false;

  static prompt(app: App, currentName: string): Promise<string | null> {
    return new Promise((resolve) => {
      new RenameGraphNoteModal(app, currentName, resolve).open();
    });
  }

  constructor(
    app: App,
    private readonly currentName: string,
    private readonly resolveValue: (value: string | null) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Rename graph note");
    this.contentEl.empty();
    this.inputEl = this.contentEl.createEl("input", {
      type: "text",
      value: this.currentName
    });
    this.inputEl.addClass("o3-graph-modal-input");
    this.inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.submit();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        this.close();
      }
    });

    const buttonRow = this.contentEl.createDiv({ cls: "modal-button-container" });
    const cancelButton = buttonRow.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => this.close());
    const submitButton = buttonRow.createEl("button", { text: "Rename" });
    submitButton.addClass("mod-cta");
    submitButton.addEventListener("click", () => this.submit());
    this.inputEl.focus();
    this.inputEl.select();
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.submitted) {
      this.resolveValue(null);
    }
  }

  private submit(): void {
    this.submitted = true;
    this.resolveValue(this.inputEl?.value ?? "");
    this.close();
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- Re-enable dynamic-data lint rules after this module. */
