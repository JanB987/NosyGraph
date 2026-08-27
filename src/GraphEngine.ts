/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- NosyGraph parses Obsidian frontmatter, Bases data, and persisted graph JSON whose shapes are validated at runtime. */
import { App, Component, EventRef, Menu, TFile } from "obsidian";
import { extractInternalLinkCandidates, NONE_LINK_TYPE } from "./linkResolver";
import { type GraphPropertyKeys, normalizeGraphPropertyKeys, readFrontmatterPropertyByKey } from "./GraphPropertyKeys";
import type { GraphEdge as ModelGraphEdge } from "./GraphModel";
import type { O3GraphEmbeddedGraphState, O3GraphEmbeddedLensState, O3GraphNodeOrigin, O3GraphRuntimeNodeSnapshot, O3GraphRuntimeState } from "./O3GraphState";
import type { O3LinkType } from "./O3LinkType";
import { O3NodeBadge } from "./O3NodeBadge";
import { setStyle } from "./domStyle";

interface GraphNode {
  id: string;
  sourcePath: string;
  label: string;
  x: number;
  y: number;
  fx?: number;
  fy?: number;
  vx: number;
  vy: number;
  mass: number;
  isBase: boolean;
  depth: number;
  isPinned?: boolean;
  repositioningPin?: boolean;
  pinButton?: HTMLButtonElement | null;
  lensButton?: HTMLButtonElement | null;
  isLocked?: boolean;
  lockX?: number;
  lockY?: number;
  expandedVia?: Array<{
    type: "parent";
    linkType: string;
    origin: string;
  }>;
  stateOwnerPath?: string;
  embeddedInstanceId?: string;
  embeddedSourceNodeId?: string;
  embeddedRoot?: boolean;
  embeddedOrigin?: O3GraphNodeOrigin;
  embeddedAncestry?: string[];
  isMissingFile?: boolean;
}

type GraphNodeExpansionRef = NonNullable<GraphNode["expandedVia"]>[number];
export type GraphLineStyle = "normal" | "dashed";

interface Edge {
  from: string;
  to: string;
  type: string;
  linkType?: string;
  relationship?: "parent";
  mode?: "overlay" | "visible";
  origin?: string;
}

interface FrontmatterLinkEntry {
  key?: string;
  link?: string;
}

interface GraphLinkTarget {
  path: string;
  label: string;
  file: TFile | null;
  missing: boolean;
}

interface BadgeDropTarget {
  nodeId: string;
  linkType: string;
}

interface BadgeExpansionRuntimeEvent {
  sourceNodeId: string;
  sourcePath: string;
  linkType: string;
  expanded: boolean;
  expansionId: string;
  parentExpansionId: string | null;
}

interface ParentContainerState {
  key: string;
  origin: string;
  linkType: string;
  memberIds: Set<string>;
  left: number;
  top: number;
  right: number;
  bottom: number;
  color: string;
  lastOriginX: number;
  lastOriginY: number;
  anchorDirectionX: number;
  anchorDirectionY: number;
  anchorVelocityX: number;
  anchorVelocityY: number;
  collisionPressureX: number;
  collisionPressureY: number;
}

export interface EmbeddedGraphDefinition {
  graphPath: string;
  color: string;
  colorSource?: "explicit" | "group" | "default";
  linkForce: number;
  snapshots: O3GraphRuntimeNodeSnapshot[];
  ancestry: string[];
  lens?: O3GraphEmbeddedLensState;
  embeddedGraphs?: O3GraphEmbeddedGraphState[];
  linkTypes: O3LinkType[];
  visibleLinkTypes?: string[];
  visibleLinkTypeDefinitions?: O3LinkType[];
}

interface EmbeddedGraphContainerState {
  key: string;
  origin: string;
  originSourcePath: string;
  graphPath: string;
  memberIds: Set<string>;
  interactionLocked?: boolean;
  color: string;
  colorSource: "explicit" | "group" | "default";
  linkForce: number;
  sourceCenterX: number;
  sourceCenterY: number;
  viewportWidth: number;
  viewportHeight: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  ancestry: string[];
  linkTypes: O3LinkType[];
  lastOriginX: number;
  lastOriginY: number;
  anchorDirectionX: number;
  anchorDirectionY: number;
  anchorVelocityX: number;
  anchorVelocityY: number;
  collisionPressureX: number;
  collisionPressureY: number;
  visibleLinkTypes: string[];
  visibleLinkTypeDefinitions: O3LinkType[];
  viewZoom?: number;
  viewPanX?: number;
  viewPanY?: number;
  lensWidth: number;
  lensHeight: number;
  lensOffsetX: number;
  lensOffsetY: number;
  lensUserPositioned?: boolean;
  lensMaximized?: boolean;
  lensRestoreWidth?: number;
  lensRestoreHeight?: number;
  lensRestoreOffsetX?: number;
  lensRestoreOffsetY?: number;
  lensRestoreUserPositioned?: boolean;
}

type GraphIconRender =
  | { kind: "text"; text: string; replaceNodeBody?: boolean }
  | { kind: "image"; file: TFile; replaceNodeBody?: boolean };

interface GraphIconImageCacheEntry {
  status: "loading" | "loaded" | "error";
  image: HTMLImageElement;
}

export interface GraphLinkMutationNodeRef {
  nodeId: string;
  path: string;
}

export interface GraphLinkBadgeDropMutationRequest {
  target: GraphLinkMutationNodeRef;
  sources: GraphLinkMutationNodeRef[];
  property: string;
  discoveryDirection: "incoming" | "outgoing" | "both";
}

export interface GraphLinkBadgeDropMutationResult {
  added: string[];
  removed: string[];
  skipped: string[];
  selected?: string[];
}

export interface GraphBadgeLinkInputRequest {
  target: GraphLinkMutationNodeRef;
  property: string;
  discoveryDirection: "incoming" | "outgoing" | "both";
  graphCapableOwnerPath?: string;
}

export interface GraphNodeOpenRequest {
  nodeId: string;
  path: string;
  newTab?: boolean;
}

interface MarqueeSelection {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface VisibleLinkTypeEdgeContext {
  sourceNodeIds: string[];
  sourcePathByNodeId: Map<string, string>;
  targetNodeIdsByPath: Map<string, string[]>;
  visibleLinkTypes: string[];
}

export interface GraphUpdateOptions {
  labels?: Map<string, string>;
  linkTypeSourceFiles?: TFile[];
  rootFilePaths?: string[];
  filterFilePaths?: string[];
  filterId?: string | null;
  overlayLinkTypes?: string[];
  visibleLinkTypes?: string[];
  visibleLinkTypeDefinitions?: O3LinkType[];
  visibleLinkTypeLineStyle?: GraphLineStyle;
  discoveredLinkLineStyle?: GraphLineStyle;
  graphBackgroundColor?: string | null;
  showNodeIcons?: boolean;
  nodeLimit?: number;
  disableLinkTypeDiscovery?: boolean;
  graphState?: O3GraphRuntimeState | null;
  debugMeta?: Record<string, unknown>;
}

export type GraphImageExportArea = "current-viewport" | "fit-to-content";

export interface GraphImageExportOptions {
  area: GraphImageExportArea;
  backgroundColor?: string | null;
  padding?: number;
}

export interface GraphEngineMenuOptions {
  hoverParent?: Component;
  hoverSourcePath?: () => string;
  initialSelectedLinkTypes?: string[];
  onSelectedLinkTypesChange?: (types: string[]) => void;
  onLinkTypeSemanticsChange?: (semantics: Record<string, "link" | "parent">) => void;
  onLinkTypePhysicsChange?: (physics: Record<string, { preferredDistance?: number; strength?: number }>) => void;
  onParentExpansionRequested?: (payload: {
    sourceNodeId: string;
    sourcePath: string;
    sourceLabel: string;
    parentLinkType: string;
    ownerGraphPath?: string;
    ownerInstanceId?: string;
    ownerNodeId?: string;
  }) => void;
  initialSettings: GraphSimulationSettings;
  initialLayoutId?: string;
  layoutOptions?: GraphLayoutOption[];
  onLayoutChange?: (layoutId: string) => void;
  nodeDragHoldDurationMs?: number;
  initialHideNodesWithoutSelectedLinkTypes?: boolean;
  onHideNodesWithoutSelectedLinkTypesChange?: (enabled: boolean) => void;
  onSettingsChange?: (settings: GraphSimulationSettings) => void;
  onBadgeExpansionToggled?: (
    sourceNodeId: string,
    sourcePath: string,
    linkType: string,
    expanded: boolean,
    expansionId: string,
    parentExpansionId: string | null
  ) => void;
  onGraphLinkBadgeDrop?: (
    request: GraphLinkBadgeDropMutationRequest
  ) => Promise<GraphLinkBadgeDropMutationResult | void> | GraphLinkBadgeDropMutationResult | void;
  shouldAutoExpandDroppedLinkTypes?: () => boolean;
  onGraphLinkInputRequested?: (
    request: GraphBadgeLinkInputRequest
  ) => Promise<GraphLinkBadgeDropMutationResult | void> | GraphLinkBadgeDropMutationResult | void;
  onNodeOpen?: (request: GraphNodeOpenRequest) => Promise<void> | void;
  initialGroupingRules?: GroupingRule[];
  initialGroupingProperties?: string[];
  onGroupingRulesChange?: (rules: GroupingRule[]) => void;
  groupingEvaluator?: (nodePath: string) => string | null;
  groupingStyleEvaluator?: (nodePath: string) => { color?: string; icon?: string; iconSourcePath?: string } | null;
  renderLinkTypeMenuExtras?: (container: HTMLElement) => void;
  disableDefaultLinkTypeList?: boolean;
  initialLinkTypeMenuSize?: LinkTypeMenuSize;
  onLinkTypeMenuSizeChange?: (size: LinkTypeMenuSize) => void;
  initialRootNodeRingColor?: string;
  initialActiveNodeRingColor?: string;
  initialNearestActiveLinkedNodeEnabled?: boolean;
  initialNearestActiveLinkedNodeColor?: string;
  initialNearestActiveLinkedNodeOpacityPercent?: number;
  nearestActiveLinkedNodeEvaluator?: (
    activePath: string,
    candidates: ActiveLinkedVisibleNodeCandidate[]
  ) => string | null;
  initialShowAllLinkTypeBadgesKey?: string;
  initialFreezeGraphKey?: string;
  onCopySelectedNodeLinks?: () => Promise<void> | void;
  onAddRootNodeRequested?: (context?: { ownerPath?: string | null }) => Promise<void> | void;
  isGraphNote?: (path: string) => boolean;
  onEmbeddedGraphExpansionRequested?: (payload: {
    originNodeId: string;
    graphPath: string;
    ancestry: string[];
  }) => Promise<EmbeddedGraphDefinition | null> | EmbeddedGraphDefinition | null;
  onEmbeddedGraphExpansionChanged?: (
    originNodeId: string,
    graphPath: string,
    expanded: boolean,
    ownerGraphPath?: string,
    lens?: O3GraphEmbeddedLensState,
    parentChain?: O3GraphEmbeddedGraphState[]
  ) => void;
  onEmbeddedNodePositionChanged?: (payload: {
    ownerGraphPath: string;
    instanceId: string;
    sourceNodeId: string;
    x?: number;
    y?: number;
    pinned: boolean;
  }) => Promise<void> | void;
  onEmbeddedGraphRuntimeChanged?: (ownerGraphPath: string, instanceId?: string) => Promise<void> | void;
  onGraphRuntimeChanged?: () => Promise<void> | void;
  onEmbeddedRootRemoveRequested?: (payload: {
    ownerGraphPath: string;
    sourcePath: string;
  }) => Promise<void> | void;
  graphPropertyKeys?: Partial<GraphPropertyKeys>;
  initialSubnodeOpacityPercent?: number;
  initialIconOpacityPercent?: number;
}

export interface ActiveLinkedVisibleNodeCandidate {
  id: string;
  path: string;
  isCore: boolean;
  depth: number;
  x: number;
  y: number;
}

export interface GraphSimulationSettings {
  repulsionStrength: number;
  centerStrength: number;
  nodeRadius: number;
  nodeConnectionSizeMultiplier: number;
  nearRestVelocityThreshold: number;
  restVelocityThreshold: number;
  textFadeThreshold: number;
}

export const FORCE_GRAPH_LAYOUT_ID = "force";
export const DIRECTION_GRAPH_LAYOUT_ID = "direction";

export interface GraphLayoutOption {
  id: string;
  label: string;
  enabled?: boolean;
}

export interface LinkTypeMenuSize {
  width: number;
  height: number;
}

export interface LinkTypePhysicsConfig {
  preferredDistance?: number;
  strength?: number;
}

export interface GroupingRule {
  property: string;
  operator: "equals" | "contains" | "exists";
  value?: string;
  color: string;
  colorExplicit?: boolean;
  icon?: string;
  iconSourcePath?: string;
}

type DirectionPlacement = "right" | "left" | "up" | "down";
type LinkPointerDirection = "outgoing" | "incoming" | "none";

interface LinkTypeVisualConfig {
  color?: string;
  thickness?: number;
  pointerDirection: LinkPointerDirection;
}

type SettingKey = keyof GraphSimulationSettings;

export class GraphEngine {
  onNodePositionChanged?: (path: string, x?: number, y?: number) => void;
  onViewportChanged?: (
    viewport: { x: number; y: number; zoom: number },
    options?: { isFinal?: boolean }
  ) => void;

  private container: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;

  private menuButton!: HTMLButtonElement;
  private fitButton!: HTMLButtonElement;
  private menuCount!: HTMLSpanElement;
  private menuPanel!: HTMLDivElement;
  private menuSearch!: HTMLInputElement;
  private menuList!: HTMLDivElement;
  private settingsButton!: HTMLButtonElement;
  private settingsPanel!: HTMLDivElement;
  private parentOverlay!: HTMLDivElement;
  private badgeOverlay!: HTMLDivElement;
  private menuOpen = false;
  private settingsOpen = false;
  private menuSearchTerm = "";
  private settingControls: Partial<Record<SettingKey, {
    slider: HTMLInputElement;
    valueText: HTMLSpanElement;
    formatter: (value: number) => string;
  }>> = {};

  private nodes: GraphNode[] = [];
  private edges: Edge[] = [];
  private nodeMap = new Map<string, GraphNode>();
  private availableLinkTypes = new Set<string>();
  private selectedLinkTypes = new Set<string>();
  private linkTypeSemantics: Map<string, "link" | "parent"> = new Map();
  private linkTypePhysics = new Map<string, LinkTypePhysicsConfig>();
  private parentLinkTypeCache = new Map<string, string[]>();
  private nodeParentBadgeTypes = new Map<string, string[]>();
  private nodeBadgeButtons = new Map<string, HTMLButtonElement>();
  private nodePinButtons = new Map<string, HTMLButtonElement>();
  private nodeLensButtons = new Map<string, HTMLButtonElement>();
  private nodeConnectionCountCache = new Map<string, number>();
  private nodeConnectionCountsDirty = true;
  private badgeExpansionRefreshTimers = new Map<string, number>();
  private badgeYamlLinkPresenceCache = new Map<string, boolean>();
  private badgesDirty = true;
  private activeNodeBadgeLinkTypes: O3LinkType[] = [];
  private visibleNodeBadgeLinkTypes: O3LinkType[] = [];
  private activeLinkTypePhysicsByProperty = new Map<string, { preferredDistance?: number; strength?: number }>();
  private activeLinkTypeDirectionByProperty = new Map<string, { direction: DirectionPlacement; cx: number; cy: number }>();
  private activeLinkTypeDiscoveryByProperty = new Map<string, boolean>();
  private activeLinkTypeDiscoveryDirectionByProperty = new Map<string, "incoming" | "outgoing" | "both">();
  private activeLinkTypeDuplicateNodesByProperty = new Map<string, boolean>();
  private activeLinkTypeVisualByProperty = new Map<string, LinkTypeVisualConfig>();
  private activeLinkTypeExpansionPropertiesByProperty = new Map<string, string[]>();
  private activeLinkTypeWritePropertyByProperty = new Map<string, string>();
  private incomingLinksByProperty = new Map<string, Map<string, Set<string>>>();
  private incomingLinksBySource = new Map<string, Map<string, Set<string>>>();
  private incomingLinkIndexReady = false;
  private recentGraphLinkMutationTargets = new Map<string, Map<string, number>>();
  private readonly recentGraphLinkMutationTargetTtlMs = 10000;
  private parentContainers = new Map<string, ParentContainerState>();
  private embeddedGraphContainers = new Map<string, EmbeddedGraphContainerState>();
  private lockedEmbeddedGraphContainerKeys = new Set<string>();
  private isReconcilingGraphTopology = false;
  private duplicateNodeSourceById = new Map<string, string>();
  private duplicateNodeIdsBySourcePath = new Map<string, Set<string>>();
  private directionLockedNodeTargets = new Map<string, { x: number; y: number }>();
  private directionLayoutDirty = true;
  private currentFiles = new Set<string>();
  private rootFilePaths = new Set<string>();
  private filterFilePaths = new Set<string>();
  private currentFilterId: string | null = null;
  private overlayLinkTypes = new Set<string>();
  private visibleLinkTypes = new Set<string>();
  private visibleLinkTypeLineStyle: GraphLineStyle = "dashed";
  private discoveredLinkLineStyle: GraphLineStyle = "normal";
  private expandedByBadge: Map<string, Set<string>> = new Map();
  // ExpansionKey = `${sourceFile}::${linkTypeName}`
  private expansionNodes = new Map<string, Set<string>>();
  private nodeOwners = new Map<string, Set<string>>();
  // childExpansionKey -> parentExpansionKey (or null)
  private expansionParent = new Map<string, string | null>();
  private hoveredExpansionKey: string | null = null;
  private hoveredHighlightNodes: Set<string> | null = null;
  private hoveredDuplicateNodeIds: Set<string> | null = null;
  private dragBadgeRevealNodeId: string | null = null;

  private lastFiles: TFile[] = [];
  private lastLinkTypeSourceFiles: TFile[] = [];
  private lastNodeLimit = Number.POSITIVE_INFINITY;
  private lastDisableLinkTypeDiscovery = false;
  private lastTopologySignature = "";
  private topologyUpdateFrozenNodeIds = new Set<string>();
  private lastKnownNodePositions = new Map<string, { x: number; y: number }>();
  private activeLinkTypeSignature = "";
  private linkTypePhysicsSignature = "";
  private graphState: O3GraphRuntimeState | null = null;
  private lastDebugMeta: Record<string, unknown> = {};
  private lastLabels = new Map<string, string>();
  private expandedParentRequests = new Map<string, { origin: string; linkType: string }>();
  private baseNodeIds = new Set<string>();
  private collapsePreviewNodeIds = new Set<string>();
  private nodeUnlockTimers = new Map<string, number>();
  private lastFocalNodeId: string | null = null;
  private isAltPressed = false;
  private selectedNodeIds = new Set<string>();
  private pinnedNodePaths = new Set<string>();
  private altDragFrozenNodeIds = new Set<string>();

  private animationFrame: number | null = null;
  private settledFrameCount = 0;
  private lastAnimationFrameAt = 0;
  private activeNodePath: string | null = null;

  // -------------------
  // Camera
  // -------------------
  private camera = { x: 0, y: 0, zoom: 1 };
  private hasRestoredViewportFromState = false;
  private hasInitializedGravityCenteredViewport = false;
  private suppressViewportChangedEvents = false;
  private lastEmittedViewport: { x: number; y: number; zoom: number } | null = null;
  private isPanning = false;
  private panningEmbeddedContainer: EmbeddedGraphContainerState | null = null;
  private movingGraphLens: EmbeddedGraphContainerState | null = null;
  private resizingGraphLens: EmbeddedGraphContainerState | null = null;
  private pendingEmbeddedLensClickNodeId: string | null = null;
  private embeddedPanStart = { x: 0, y: 0 };
  private lensMoveStart = { x: 0, y: 0 };
  private lensResizeStart = {
    width: 0,
    height: 0,
    offsetX: 0,
    offsetY: 0,
    edgeX: 0,
    edgeY: 0,
    viewportCenterX: 0,
    viewportCenterY: 0
  };
  private marqueeSelection: MarqueeSelection | null = null;
  private panStart = { x: 0, y: 0 };
  private cameraStart = { x: 0, y: 0 };
  private didPan = false;
  private mouseDownScreen = { x: 0, y: 0 };
  private pressedNode: GraphNode | null = null;
  private draggedNode: GraphNode | null = null;
  private draggedNodeOriginPositions = new Map<string, { x: number; y: number }>();
  private repositioningPinnedNodeIds = new Set<string>();
  private isDraggingNode = false;
  private nativeGraphDragActive = false;
  private nativeGraphDropHandled = false;
  private lastNativeDragClient: { x: number; y: number } | null = null;
  private transparentDragImage: HTMLElement | null = null;
  private dragHoldTimer: number | null = null;
  private dragHoldDurationMs = 180;
  private dragPointerClient = { x: 0, y: 0 };
  private hideNodesWithoutSelectedLinkTypes = false;
  private activeLayoutId = FORCE_GRAPH_LAYOUT_ID;
  private layoutOptions: GraphLayoutOption[] = [
    { id: FORCE_GRAPH_LAYOUT_ID, label: "Force layout", enabled: true }
  ];
  private groupingRules: GroupingRule[] = [];
  private groupingPropertyOptions: string[] = [];
  private nodeFillColors = new Map<string, string | null>();
  private graphIconImageCache = new Map<string, GraphIconImageCacheEntry>();
  private graphPropertyKeys: GraphPropertyKeys;
  private subnodeOpacity = 0.78;
  private iconOpacity = 1;
  private showNodeIcons = true;
  private graphBackgroundColor: string | null = null;
  private disableDefaultLinkTypeList = false;
  private menuPanelResizeObserver: ResizeObserver | null = null;
  private menuSizeEmitTimer: number | null = null;
  private suppressMenuSizeChangedEvents = false;
  private hoverPreviewTargetEl: HTMLDivElement | null = null;
  private hoverPreviewTimer: number | null = null;
  private hoverPreviewNodeId: string | null = null;
  private hoverPreviewTriggeredNodeId: string | null = null;
  private readonly hoverPreviewDelayMs = 450;
  private rootNodeRingColor = "#6eaaff";
  private activeNodeRingColor = "#ff6b6b";
  private nearestActiveLinkedNodeEnabled = true;
  private nearestActiveLinkedNodeColor = "#7aa2ff";
  private nearestActiveLinkedNodeOpacityPercent = 45;
  private nearestActiveLinkedNodeId: string | null = null;
  private showAllLinkTypeBadgesKey = "b";
  private freezeGraphKey = "f";
  private showAllLinkTypeBadgesHeld = false;
  private simulationFrozenByHotkey = false;
  private suppressDomOverlayRender = false;

  // Node interaction uses a small movement threshold to separate click from drag.
  private clickDragThreshold = 5;
  private nodeRadius: number;
  private nodeConnectionSizeMultiplier: number;

  // -------------------
  // Physics
  // -------------------
  private repulsionStrength: number;
  private linkStrength = 0.01;
  private centerStrength: number;
  private nearRestVelocityThreshold: number;
  private restVelocityThreshold: number;
  private textFadeThreshold: number;
  private damping = 0.85;
  private linkDistance = 120;
  private debugEnabled = false;
  private lastSimulationReheat = 0;
  private readonly settleFrameCount = 24;
  private readonly activeFrameIntervalMs = 16;
  private readonly nearSettleFrameIntervalMs = 50;
  private lastSimulationMaxVelocity = Number.POSITIVE_INFINITY;

  private onWindowResize = () => this.handleResize(this.container.clientWidth, this.container.clientHeight);
  private styleSettingsObserver: MutationObserver | null = null;
  private styleSettingsRenderTimer: number | null = null;
  private styleSettingsCssChangeRef: EventRef | null = null;
  private onOutsideClick = (e: MouseEvent) => {
    const target = e.target as EventTarget | null;
    if (!this.isHTMLElement(target)) return;
    const parentOverlayVisible = !!this.parentOverlay && this.parentOverlay.style.display !== "none";
    if (!this.menuOpen && !this.settingsOpen && !parentOverlayVisible) return;
    if (!this.menuPanel || !this.settingsPanel || !this.menuButton || !this.settingsButton) return;
    if (this.menuPanel.contains(target) || this.menuButton.contains(target)) return;
    if (this.settingsPanel.contains(target) || this.settingsButton.contains(target)) return;
    if (this.parentOverlay?.contains(target)) return;
    this.menuOpen = false;
    this.settingsOpen = false;
    this.hideParentOverlay();
    this.syncPanelVisibility();
  };

  constructor(
    parent: HTMLElement,
    private app: App,
    private menuOptions: GraphEngineMenuOptions = {}
  ) {
    this.container = parent;
    this.graphPropertyKeys = normalizeGraphPropertyKeys(menuOptions.graphPropertyKeys);

    for (const type of menuOptions.initialSelectedLinkTypes ?? []) {
      const t = String(type ?? "").trim();
      if (t.length > 0) {
        this.selectedLinkTypes.add(t);
      }
    }

    const initial = menuOptions.initialSettings;
    this.repulsionStrength = this.readRequiredSetting("repulsionStrength", initial.repulsionStrength);
    this.centerStrength = this.readRequiredSetting("centerStrength", initial.centerStrength);
    this.nodeRadius = this.readRequiredSetting("nodeRadius", initial.nodeRadius);
    this.nodeConnectionSizeMultiplier = this.readRequiredSetting("nodeConnectionSizeMultiplier", initial.nodeConnectionSizeMultiplier);
    this.nearRestVelocityThreshold = this.readRequiredSetting("nearRestVelocityThreshold", initial.nearRestVelocityThreshold);
    this.restVelocityThreshold = this.readRequiredSetting("restVelocityThreshold", initial.restVelocityThreshold);
    this.textFadeThreshold = this.normalizeTextFadeThreshold(initial.textFadeThreshold);
    if (Number.isFinite(menuOptions.nodeDragHoldDurationMs)) {
      this.dragHoldDurationMs = Math.max(0, Number(menuOptions.nodeDragHoldDurationMs));
    }
    if (typeof menuOptions.initialHideNodesWithoutSelectedLinkTypes === "boolean") {
      this.hideNodesWithoutSelectedLinkTypes = menuOptions.initialHideNodesWithoutSelectedLinkTypes;
    }
    this.layoutOptions = this.normalizeLayoutOptions(menuOptions.layoutOptions);
    this.activeLayoutId = this.resolveInitialLayoutId(menuOptions.initialLayoutId);
    this.groupingRules = this.normalizeGroupingRules(menuOptions.initialGroupingRules ?? []);
    this.groupingPropertyOptions = this.normalizeGroupingPropertyOptions(menuOptions.initialGroupingProperties ?? []);
    this.disableDefaultLinkTypeList = menuOptions.disableDefaultLinkTypeList === true;
    if (typeof menuOptions.initialRootNodeRingColor === "string" && menuOptions.initialRootNodeRingColor.trim().length > 0) {
      this.rootNodeRingColor = menuOptions.initialRootNodeRingColor.trim();
    }
    if (typeof menuOptions.initialActiveNodeRingColor === "string" && menuOptions.initialActiveNodeRingColor.trim().length > 0) {
      this.activeNodeRingColor = menuOptions.initialActiveNodeRingColor.trim();
    }
    this.nearestActiveLinkedNodeEnabled = menuOptions.initialNearestActiveLinkedNodeEnabled !== false;
    if (typeof menuOptions.initialNearestActiveLinkedNodeColor === "string" && menuOptions.initialNearestActiveLinkedNodeColor.trim().length > 0) {
      this.nearestActiveLinkedNodeColor = menuOptions.initialNearestActiveLinkedNodeColor.trim();
    }
    const nearestOpacity = Number(menuOptions.initialNearestActiveLinkedNodeOpacityPercent);
    if (Number.isFinite(nearestOpacity)) {
      this.nearestActiveLinkedNodeOpacityPercent = Math.max(0, Math.min(100, Math.round(nearestOpacity)));
    }
    const badgeKey = this.normalizeKeyboardKey(menuOptions.initialShowAllLinkTypeBadgesKey);
    if (badgeKey) {
      this.showAllLinkTypeBadgesKey = badgeKey;
    }
    const freezeKey = this.normalizeKeyboardKey(menuOptions.initialFreezeGraphKey);
    if (freezeKey) {
      this.freezeGraphKey = freezeKey;
    }
    this.subnodeOpacity = this.normalizeOpacityPercent(menuOptions.initialSubnodeOpacityPercent, 78) / 100;
    this.iconOpacity = this.normalizeOpacityPercent(menuOptions.initialIconOpacityPercent, 100) / 100;
  }

  private readRequiredSetting(name: keyof GraphSimulationSettings, value: unknown): number {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n;
    }
    throw new Error(`[GraphEngine] Missing or invalid initial setting: ${name}`);
  }

  private normalizeLayoutId(layoutId: unknown): string {
    const normalized = String(layoutId ?? "").trim().toLowerCase();
    return normalized || FORCE_GRAPH_LAYOUT_ID;
  }

  private normalizeLayoutOptions(raw: GraphLayoutOption[] | undefined): GraphLayoutOption[] {
    const defaults: GraphLayoutOption[] = [
      { id: FORCE_GRAPH_LAYOUT_ID, label: "Force layout", enabled: true }
    ];
    if (!Array.isArray(raw) || raw.length === 0) {
      return defaults;
    }

    const out: GraphLayoutOption[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const id = this.normalizeLayoutId(item.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const label = String(item.label ?? "").trim() || id;
      out.push({
        id,
        label,
        enabled: item.enabled !== false
      });
    }

    if (!seen.has(FORCE_GRAPH_LAYOUT_ID)) {
      out.unshift({ id: FORCE_GRAPH_LAYOUT_ID, label: "Force layout", enabled: true });
    }

    return out.length > 0 ? out : defaults;
  }

  private resolveInitialLayoutId(layoutId: unknown): string {
    const requested = this.normalizeLayoutId(layoutId);
    const requestedOption = this.layoutOptions.find((option) => option.id === requested && option.enabled !== false);
    if (requestedOption) {
      return requestedOption.id;
    }
    return this.layoutOptions.find((option) => option.enabled !== false)?.id ?? FORCE_GRAPH_LAYOUT_ID;
  }

  private normalizeMenuSize(raw: Partial<LinkTypeMenuSize> | null | undefined): LinkTypeMenuSize {
    const width = Number(raw?.width);
    const height = Number(raw?.height);
    return {
      width: Number.isFinite(width) ? Math.max(220, Math.min(900, Math.round(width))) : 260,
      height: Number.isFinite(height) ? Math.max(180, Math.min(900, Math.round(height))) : 360
    };
  }

  private handleMenuPanelResized(): void {
    if (this.suppressMenuSizeChangedEvents) return;
    if (this.menuSizeEmitTimer !== null) {
      window.clearTimeout(this.menuSizeEmitTimer);
    }
    this.menuSizeEmitTimer = window.setTimeout(() => {
      this.menuSizeEmitTimer = null;
      this.menuOptions.onLinkTypeMenuSizeChange?.(this.getLinkTypeMenuSize());
    }, 180);
  }

  // =========================
  // INITIALIZATION
  // =========================

  init() {
    this.initCanvas();
    this.initMenus();
    this.observeStyleSettingsChanges();
    this.startSimulation();
  }

  destroy() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    if (this.dragHoldTimer !== null) {
      window.clearTimeout(this.dragHoldTimer);
      this.dragHoldTimer = null;
    }
    for (const timer of this.nodeUnlockTimers.values()) {
      window.clearTimeout(timer);
    }
    this.nodeUnlockTimers.clear();
    for (const timer of this.badgeExpansionRefreshTimers.values()) {
      window.clearTimeout(timer);
    }
    this.badgeExpansionRefreshTimers.clear();
    if (this.menuSizeEmitTimer !== null) {
      window.clearTimeout(this.menuSizeEmitTimer);
      this.menuSizeEmitTimer = null;
    }
    this.clearNodeHoverPreview();
    if (this.styleSettingsRenderTimer !== null) {
      window.clearTimeout(this.styleSettingsRenderTimer);
      this.styleSettingsRenderTimer = null;
    }
    this.styleSettingsObserver?.disconnect();
    this.styleSettingsObserver = null;
    if (this.styleSettingsCssChangeRef) {
      this.app.workspace.offref(this.styleSettingsCssChangeRef);
      this.styleSettingsCssChangeRef = null;
    }
    this.menuPanelResizeObserver?.disconnect();
    this.menuPanelResizeObserver = null;

    window.removeEventListener("resize", this.onWindowResize);
    document.removeEventListener("mousedown", this.onOutsideClick, true);

    this.canvas?.removeEventListener("wheel", this.onWheelBound);
    this.canvas?.removeEventListener("mousedown", this.onMouseDownBound);
    this.canvas?.removeEventListener("dblclick", this.onDoubleClickBound);
    this.canvas?.removeEventListener("contextmenu", this.onContextMenuBound);
    this.badgeOverlay?.removeEventListener("wheel", this.onWheelBound);
    this.badgeOverlay?.removeEventListener("mousedown", this.onMouseDownBound);
    this.badgeOverlay?.removeEventListener("dblclick", this.onDoubleClickBound);
    this.badgeOverlay?.removeEventListener("contextmenu", this.onContextMenuBound);
    this.badgeOverlay?.removeEventListener("dragstart", this.onNativeDragStartBound);
    this.badgeOverlay?.removeEventListener("dragover", this.onNativeDragOverBound);
    this.badgeOverlay?.removeEventListener("drop", this.onNativeDropBound);
    this.badgeOverlay?.removeEventListener("dragend", this.onNativeDragEndBound);
    window.removeEventListener("mousemove", this.onMouseMoveBound);
    window.removeEventListener("mouseup", this.onMouseUpBound);
    this.container?.removeEventListener("keydown", this.onContainerKeyDownBound);
    this.container?.removeEventListener("keyup", this.onContainerKeyUpBound);
    this.container?.removeEventListener("blur", this.onContainerBlurBound);

    this.menuPanel?.remove();
    this.menuButton?.remove();
    this.fitButton?.remove();
    this.settingsPanel?.remove();
    this.settingsButton?.remove();
    this.badgeOverlay?.remove();
    this.parentOverlay?.remove();
    this.hoverPreviewTargetEl?.remove();
    this.hoverPreviewTargetEl = null;
    this.canvas?.remove();
    this.transparentDragImage?.remove();
    this.transparentDragImage = null;

    for (const button of this.nodePinButtons.values()) {
      button.remove();
    }
    this.nodePinButtons.clear();
    for (const button of this.nodeLensButtons.values()) {
      button.remove();
    }
    this.nodeLensButtons.clear();
  }

  private observeStyleSettingsChanges(): void {
    if (this.styleSettingsObserver) return;
    const scheduleRender = () => {
      if (this.styleSettingsRenderTimer !== null) {
        window.clearTimeout(this.styleSettingsRenderTimer);
      }
      this.styleSettingsRenderTimer = window.setTimeout(() => {
        this.styleSettingsRenderTimer = null;
        this.requestRender();
      }, 50);
    };
    this.styleSettingsObserver = new MutationObserver(() => {
      scheduleRender();
    });
    this.styleSettingsObserver.observe(document.head, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true
    });
    this.styleSettingsObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "style"]
    });
    this.styleSettingsCssChangeRef = this.app.workspace.on("css-change", scheduleRender);
  }

  // =========================
  // CANVAS + UI
  // =========================

  private onWheelBound = (e: WheelEvent) => this.onWheel(e);
  private onMouseDownBound = (e: MouseEvent) => this.onMouseDown(e);
  private onMouseMoveBound = (e: MouseEvent) => this.onMouseMove(e);
  private onMouseUpBound = (e: MouseEvent) => this.onMouseUp(e);
  private onDoubleClickBound = (e: MouseEvent) => this.onDoubleClick(e);
  private onContextMenuBound = (e: MouseEvent) => this.onContextMenu(e);
  private onNativeDragStartBound = (e: DragEvent) => this.onNativeDragStart(e);
  private onNativeDragOverBound = (e: DragEvent) => this.onNativeDragOver(e);
  private onNativeDropBound = (e: DragEvent) => this.onNativeDrop(e);
  private onNativeDragEndBound = (e: DragEvent) => this.onNativeDragEnd(e);
  private onContainerKeyDownBound = (e: KeyboardEvent) => this.onContainerKeyDown(e);
  private onContainerKeyUpBound = (e: KeyboardEvent) => this.onContainerKeyUp(e);
  private onContainerBlurBound = () => this.onContainerBlur();

  private initCanvas() {
    this.container.empty();

    this.container.classList.add("o3-graph-view");
    setStyle(this.container, "position", "relative");
    setStyle(this.container, "overflow", "hidden");
    this.container.tabIndex = 0;

    this.canvas = this.container.createEl("canvas");
    setStyle(this.canvas, "position", "absolute");
    setStyle(this.canvas, "inset", "0");
    setStyle(this.canvas, "zIndex", "0");

    this.hoverPreviewTargetEl = this.container.createDiv();
    setStyle(this.hoverPreviewTargetEl, "position", "absolute");
    setStyle(this.hoverPreviewTargetEl, "width", "1px");
    setStyle(this.hoverPreviewTargetEl, "height", "1px");
    setStyle(this.hoverPreviewTargetEl, "pointerEvents", "none");
    setStyle(this.hoverPreviewTargetEl, "opacity", "0");
    setStyle(this.hoverPreviewTargetEl, "zIndex", "1");

    this.ctx = this.canvas.getContext("2d")!;
    this.initializeSize();

    window.addEventListener("resize", this.onWindowResize);
    document.addEventListener("mousedown", this.onOutsideClick, true);

    this.canvas.addEventListener("wheel", this.onWheelBound, { passive: false });
    this.canvas.addEventListener("mousedown", this.onMouseDownBound);
    this.canvas.addEventListener("dblclick", this.onDoubleClickBound);
    this.canvas.addEventListener("contextmenu", this.onContextMenuBound);
    window.addEventListener("mousemove", this.onMouseMoveBound);
    window.addEventListener("mouseup", this.onMouseUpBound);
    this.container.addEventListener("keydown", this.onContainerKeyDownBound);
    this.container.addEventListener("keyup", this.onContainerKeyUpBound);
    this.container.addEventListener("blur", this.onContainerBlurBound);
  }

  private onContainerKeyDown(e: KeyboardEvent): void {
    if (e.altKey) {
      this.isAltPressed = true;
      this.updateAltDragFreeze();
      if (this.dragPointerClient.x || this.dragPointerClient.y) {
        this.updateGraphLensCursor(this.dragPointerClient.x, this.dragPointerClient.y);
      }
    }
    if (this.isEditableKeyboardTarget(e.target)) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && this.normalizeKeyboardKey(e.key) === "c") {
      e.preventDefault();
      e.stopPropagation();
      void this.menuOptions.onCopySelectedNodeLinks?.();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && this.normalizeKeyboardKey(e.key) === "a") {
      e.preventDefault();
      e.stopPropagation();
      this.selectAllNodes();
      return;
    }
    if (this.normalizeKeyboardKey(e.key) === this.showAllLinkTypeBadgesKey) {
      if (this.showAllLinkTypeBadgesHeld) return;
      this.showAllLinkTypeBadgesHeld = true;
      this.badgesDirty = true;
      this.requestRender();
      return;
    }
    if (this.normalizeKeyboardKey(e.key) === this.freezeGraphKey) {
      if (this.simulationFrozenByHotkey) return;
      this.simulationFrozenByHotkey = true;
      this.requestRender();
    }
  }

  private onContainerKeyUp(e: KeyboardEvent): void {
    this.isAltPressed = false;
    this.updateAltDragFreeze();
    if (this.dragPointerClient.x || this.dragPointerClient.y) {
      this.updateGraphLensCursor(this.dragPointerClient.x, this.dragPointerClient.y);
    }
    if (this.normalizeKeyboardKey(e.key) === this.showAllLinkTypeBadgesKey) {
      this.showAllLinkTypeBadgesHeld = false;
      this.badgesDirty = true;
      this.requestRender();
      return;
    }
    if (this.normalizeKeyboardKey(e.key) === this.freezeGraphKey) {
      this.simulationFrozenByHotkey = false;
      this.requestRender();
    }
  }

  private onContainerBlur(): void {
    this.isAltPressed = false;
    this.showAllLinkTypeBadgesHeld = false;
    this.simulationFrozenByHotkey = false;
    this.updateAltDragFreeze();
    this.badgesDirty = true;
    this.requestRender();
  }

  initializeSize(): void {
    this.handleResize(this.container.clientWidth, this.container.clientHeight, { reheat: false });
  }

  handleResize(width: number, height: number, options?: { reheat?: boolean }): void {
    if (!this.canvas) return;
    const w = Math.floor(Number(width));
    const h = Math.floor(Number(height));
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;

    if (this.canvas.width === w && this.canvas.height === h) {
      return;
    }

    this.canvas.width = w;
    this.canvas.height = h;

    if (!this.graphState?.viewport && !this.hasInitializedGravityCenteredViewport) {
      this.centerViewportOnGravityCenter({ emit: false });
    }

    // Keep overlays in sync with the canvas coordinate space without rebuilding the graph.
    this.refreshBadges();
    this.safeDraw();
    if (options?.reheat !== false) {
      this.reheatSimulation(0.3, "resize");
    }
  }

  private initMenus() {
    const overlay = this.container.createDiv();
    setStyle(overlay, "position", "absolute");
    setStyle(overlay, "top", "8px");
    setStyle(overlay, "left", "8px");
    setStyle(overlay, "zIndex", "2");
    setStyle(overlay, "display", "block");

    const buttonRow = overlay.createDiv();
    setStyle(buttonRow, "display", "flex");
    setStyle(buttonRow, "gap", "8px");
    setStyle(buttonRow, "alignItems", "center");

    this.menuButton = buttonRow.createEl("button");
    this.menuButton.type = "button";
    this.menuButton.textContent = "Link Types ";
    setStyle(this.menuButton, "display", "flex");
    setStyle(this.menuButton, "alignItems", "center");
    setStyle(this.menuButton, "gap", "6px");
    setStyle(this.menuButton, "padding", "6px 10px");
    setStyle(this.menuButton, "cursor", "pointer");

    this.fitButton = this.container.createEl("button");
    this.fitButton.type = "button";
    this.fitButton.textContent = "⤢";
    this.fitButton.title = "Fit graph to content";
    setStyle(this.fitButton, "position", "absolute");
    setStyle(this.fitButton, "left", "8px");
    setStyle(this.fitButton, "bottom", "8px");
    setStyle(this.fitButton, "zIndex", "3");
    setStyle(this.fitButton, "display", "inline-flex");
    setStyle(this.fitButton, "alignItems", "center");
    setStyle(this.fitButton, "justifyContent", "center");
    setStyle(this.fitButton, "width", "30px");
    setStyle(this.fitButton, "height", "30px");
    setStyle(this.fitButton, "padding", "0");
    setStyle(this.fitButton, "cursor", "pointer");
    setStyle(this.fitButton, "fontSize", "16px");
    setStyle(this.fitButton, "lineHeight", "1");
    setStyle(this.fitButton, "borderRadius", "6px");

    this.menuCount = this.menuButton.createSpan();
    this.menuCount.textContent = "0";
    setStyle(this.menuCount, "minWidth", "18px");
    setStyle(this.menuCount, "height", "18px");
    setStyle(this.menuCount, "padding", "0 6px");
    setStyle(this.menuCount, "borderRadius", "999px");
    setStyle(this.menuCount, "background", "var(--interactive-accent, #6b8cff)");
    setStyle(this.menuCount, "color", "white");
    setStyle(this.menuCount, "fontSize", "11px");
    setStyle(this.menuCount, "lineHeight", "18px");
    setStyle(this.menuCount, "textAlign", "center");

    this.menuPanel = overlay.createDiv();
    setStyle(this.menuPanel, "display", "none");
    setStyle(this.menuPanel, "position", "absolute");
    setStyle(this.menuPanel, "top", "36px");
    setStyle(this.menuPanel, "left", "0");
    setStyle(this.menuPanel, "width", "260px");
    setStyle(this.menuPanel, "height", "360px");
    setStyle(this.menuPanel, "overflow", "hidden");
    setStyle(this.menuPanel, "resize", "both");
    setStyle(this.menuPanel, "minWidth", "220px");
    setStyle(this.menuPanel, "minHeight", "180px");
    setStyle(this.menuPanel, "maxWidth", "min(90vw, 900px)");
    setStyle(this.menuPanel, "maxHeight", "min(85vh, 900px)");
    setStyle(this.menuPanel, "display", "none");
    setStyle(this.menuPanel, "flexDirection", "column");
    setStyle(this.menuPanel, "padding", "8px");
    setStyle(this.menuPanel, "borderRadius", "8px");
    setStyle(this.menuPanel, "border", "1px solid var(--background-modifier-border)");
    setStyle(this.menuPanel, "background", "var(--background-primary)");
    setStyle(this.menuPanel, "boxShadow", "0 8px 24px rgba(0,0,0,0.2)");

    this.settingsButton = buttonRow.createEl("button");
    this.settingsButton.type = "button";
    this.settingsButton.textContent = "⚙";
    this.settingsButton.title = "Graph settings";
    setStyle(this.settingsButton, "display", "inline-flex");
    setStyle(this.settingsButton, "alignItems", "center");
    setStyle(this.settingsButton, "justifyContent", "center");
    setStyle(this.settingsButton, "width", "30px");
    setStyle(this.settingsButton, "height", "30px");
    setStyle(this.settingsButton, "padding", "0");
    setStyle(this.settingsButton, "fontSize", "16px");
    setStyle(this.settingsButton, "lineHeight", "1");
    setStyle(this.settingsButton, "borderRadius", "6px");
    setStyle(this.settingsButton, "cursor", "pointer");

    this.settingsPanel = overlay.createDiv();
    setStyle(this.settingsPanel, "display", "none");
    setStyle(this.settingsPanel, "position", "absolute");
    setStyle(this.settingsPanel, "top", "36px");
    setStyle(this.settingsPanel, "left", "0");
    setStyle(this.settingsPanel, "width", "280px");
    setStyle(this.settingsPanel, "padding", "10px");
    setStyle(this.settingsPanel, "borderRadius", "8px");
    setStyle(this.settingsPanel, "border", "1px solid var(--background-modifier-border)");
    setStyle(this.settingsPanel, "background", "var(--background-primary)");
    setStyle(this.settingsPanel, "boxShadow", "0 8px 24px rgba(0,0,0,0.2)");

    this.badgeOverlay = this.container.createDiv();
    setStyle(this.badgeOverlay, "position", "absolute");
    setStyle(this.badgeOverlay, "inset", "0");
    setStyle(this.badgeOverlay, "zIndex", "1");
    setStyle(this.badgeOverlay, "pointerEvents", "auto");
    this.badgeOverlay.draggable = false;
    this.badgeOverlay.addEventListener("wheel", this.onWheelBound, { passive: false });
    this.badgeOverlay.addEventListener("mousedown", this.onMouseDownBound);
    this.badgeOverlay.addEventListener("dblclick", this.onDoubleClickBound);
    this.badgeOverlay.addEventListener("contextmenu", this.onContextMenuBound);
    this.badgeOverlay.addEventListener("dragstart", this.onNativeDragStartBound);
    this.badgeOverlay.addEventListener("dragover", this.onNativeDragOverBound);
    this.badgeOverlay.addEventListener("drop", this.onNativeDropBound);
    this.badgeOverlay.addEventListener("dragend", this.onNativeDragEndBound);

    this.parentOverlay = this.container.createDiv();
    setStyle(this.parentOverlay, "position", "absolute");
    setStyle(this.parentOverlay, "display", "none");
    setStyle(this.parentOverlay, "zIndex", "4");
    setStyle(this.parentOverlay, "minWidth", "220px");
    setStyle(this.parentOverlay, "maxWidth", "300px");
    setStyle(this.parentOverlay, "padding", "8px");
    setStyle(this.parentOverlay, "borderRadius", "8px");
    setStyle(this.parentOverlay, "border", "1px solid var(--background-modifier-border)");
    setStyle(this.parentOverlay, "background", "var(--background-primary)");
    setStyle(this.parentOverlay, "boxShadow", "0 8px 24px rgba(0,0,0,0.2)");

    this.menuSearch = this.menuPanel.createEl("input");
    this.menuSearch.type = "text";
    this.menuSearch.placeholder = "Search link types...";
    setStyle(this.menuSearch, "width", "100%");
    setStyle(this.menuSearch, "marginBottom", "8px");
    setStyle(this.menuSearch, "display", this.disableDefaultLinkTypeList ? "none" : "block");

    this.menuList = this.menuPanel.createDiv();
    setStyle(this.menuList, "flex", "1");
    setStyle(this.menuList, "minHeight", "0");
    setStyle(this.menuList, "overflowY", "auto");

    this.menuButton.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      this.settingsOpen = false;
      this.menuOpen = !this.menuOpen;
      this.syncPanelVisibility();
      if (this.menuOpen) {
        this.renderLinkTypeMenu();
      }
    });

    this.settingsButton.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      this.menuOpen = false;
      this.settingsOpen = !this.settingsOpen;
      this.syncPanelVisibility();
    });

    this.menuSearch.addEventListener("input", () => {
      this.menuSearchTerm = this.menuSearch.value.toLowerCase().trim();
      this.renderLinkTypeMenu();
    });

    this.fitButton.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      this.fitToNodes({ padding: 48, maxZoom: 1.8 });
      this.reheatSimulation(0.2, "fit-to-content");
    });

    [this.menuPanel, this.menuButton, this.fitButton, this.settingsPanel, this.settingsButton, this.parentOverlay].forEach(el => {
      ["mousedown", "mouseup", "mousemove", "click", "wheel"].forEach(evt => {
        el.addEventListener(evt, (e) => e.stopPropagation());
      });
    });

    this.buildSettingsMenu();
    this.setLinkTypeMenuSize(this.menuOptions.initialLinkTypeMenuSize);
    if (typeof ResizeObserver !== "undefined") {
      this.menuPanelResizeObserver = new ResizeObserver(() => this.handleMenuPanelResized());
      this.menuPanelResizeObserver.observe(this.menuPanel);
    }
    this.syncPanelVisibility();
    this.updateMenuCounter();
  }

  private syncPanelVisibility() {
    setStyle(this.menuPanel, "display", this.menuOpen ? "flex" : "none");
    setStyle(this.settingsPanel, "display", this.settingsOpen ? "block" : "none");
  }

  // =========================
  // INCREMENTAL GRAPH UPDATE
  // =========================

  updateGraph(files: TFile[], options: GraphUpdateOptions = {}) {
    const previousGraphState = this.graphState;
    const embeddedBadgeKeys = new Set(
      Array.from(this.expandedByBadge.keys()).filter((badgeKey) => {
        const separator = badgeKey.lastIndexOf("::");
        const sourceNodeId = separator > 0 ? badgeKey.slice(0, separator) : "";
        return Boolean(sourceNodeId && this.nodeMap.get(sourceNodeId)?.stateOwnerPath);
      })
    );
    const preservedEmbeddedExpandedByBadge = new Map(
      Array.from(this.expandedByBadge.entries())
        .filter(([badgeKey]) => embeddedBadgeKeys.has(badgeKey))
        .map(([badgeKey, paths]) => [badgeKey, new Set(paths)])
    );
    const preservedEmbeddedExpansionNodes = new Map(
      Array.from(this.expansionNodes.entries())
        .filter(([badgeKey]) => embeddedBadgeKeys.has(badgeKey))
        .map(([badgeKey, nodeIds]) => [badgeKey, new Set(nodeIds)])
    );
    const preservedEmbeddedExpansionParents = new Map(
      Array.from(this.expansionParent.entries())
        .filter(([badgeKey]) => embeddedBadgeKeys.has(badgeKey))
    );
    this.lastFiles = files;
    this.lastLinkTypeSourceFiles = options.linkTypeSourceFiles ?? files;
    this.currentFiles = new Set(files.map((f) => f.path));
    this.badgeYamlLinkPresenceCache.clear();
    this.rootFilePaths = new Set((options.rootFilePaths ?? files.map((f) => f.path)).map((path) => String(path ?? "").trim()).filter(Boolean));
    this.filterFilePaths = new Set((options.filterFilePaths ?? []).map((path) => String(path ?? "").trim()).filter(Boolean));
    this.currentFilterId = String(options.filterId ?? "").trim() || null;
    this.overlayLinkTypes = new Set((options.overlayLinkTypes ?? []).map((type) => this.normalizeLinkType(type)).filter(Boolean));
    this.visibleLinkTypes = new Set((options.visibleLinkTypes ?? []).map((type) => this.normalizeLinkType(type).toLowerCase()).filter(Boolean));
    this.visibleLinkTypeLineStyle = this.normalizeGraphLineStyle(options.visibleLinkTypeLineStyle, "dashed");
    this.discoveredLinkLineStyle = this.normalizeGraphLineStyle(options.discoveredLinkLineStyle, "normal");
    this.graphBackgroundColor = this.normalizeCssColor(options.graphBackgroundColor);
    this.showNodeIcons = options.showNodeIcons !== false;
    this.visibleNodeBadgeLinkTypes = this.normalizeBadgeLinkTypeDefinitions(options.visibleLinkTypeDefinitions ?? []);
    for (const linkType of this.visibleNodeBadgeLinkTypes) {
      this.registerLinkTypeRuntimeConfig(linkType);
    }
    this.expandedByBadge.clear();
    this.expansionNodes.clear();
    this.nodeOwners.clear();
    this.expansionParent.clear();
    for (const [badgeKey, paths] of preservedEmbeddedExpandedByBadge) {
      this.expandedByBadge.set(badgeKey, paths);
    }
    for (const [badgeKey, nodeIds] of preservedEmbeddedExpansionNodes) {
      this.expansionNodes.set(badgeKey, nodeIds);
    }
    for (const [badgeKey, parentKey] of preservedEmbeddedExpansionParents) {
      this.expansionParent.set(badgeKey, parentKey);
    }
    this.hoveredExpansionKey = null;
    this.hoveredHighlightNodes = null;
    const limit = Number(options.nodeLimit);
    this.lastNodeLimit = Number.isFinite(limit) ? Math.max(1, Math.round(limit)) : Number.POSITIVE_INFINITY;
    this.lastDisableLinkTypeDiscovery = options.disableLinkTypeDiscovery === true;
    this.graphState = options.graphState ?? null;
    if (this.graphState !== previousGraphState) {
      this.hasRestoredViewportFromState = false;
      this.hasInitializedGravityCenteredViewport = false;
    }
    this.syncPinnedNodePathsFromGraphState();
    this.lastDebugMeta = options.debugMeta ?? {};
    this.lastLabels = options.labels ?? new Map<string, string>();
    this.parentLinkTypeCache.clear();
    this.directionLayoutDirty = true;

    this.isReconcilingGraphTopology = true;
    try {
      this.rebuildEdges(files, this.lastLinkTypeSourceFiles);
    } finally {
      this.isReconcilingGraphTopology = false;
    }
    if (this.graphState && !this.hasRestoredViewportFromState) {
      this.applyGraphViewportState();
    }
    if (!this.graphState?.viewport && !this.hasInitializedGravityCenteredViewport) {
      this.centerViewportOnGravityCenter({ emit: false });
    }
  }

  private syncPinnedNodePathsFromGraphState(): void {
    this.pinnedNodePaths.clear();
    const pinned = this.graphState?.pinned;
    if (!pinned) return;

    for (const [path, position] of Object.entries(pinned)) {
      const normalizedPath = String(path ?? "").trim();
      if (!normalizedPath) continue;
      const x = Number((position as { x?: unknown })?.x);
      const y = Number((position as { y?: unknown })?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      this.pinnedNodePaths.add(this.resolvePersistedNodeIdToRuntimeId(normalizedPath));
    }

    for (const [nodeId, nodeState] of Object.entries(this.graphState?.nodes ?? {})) {
      const normalizedNodeId = String(nodeId ?? "").trim();
      if (!normalizedNodeId || nodeState?.pinned !== true) continue;
      this.pinnedNodePaths.add(this.resolvePersistedNodeIdToRuntimeId(normalizedNodeId));
    }
  }

  private rebuildEdges(
    files: TFile[] = this.getCurrentFilesAsTFiles(),
    linkTypeSourceFiles: TFile[] = files
  ) {
    this.rememberCurrentNodePositions();
    const fileSet = new Set(files.map(f => f.path));
    const embeddedEdges = this.edges.filter((edge) => {
      const from = this.nodeMap.get(edge.from);
      const to = this.nodeMap.get(edge.to);
      return Boolean(
        from?.stateOwnerPath
        && to?.stateOwnerPath
        && from.embeddedInstanceId
        && from.embeddedInstanceId === to.embeddedInstanceId
      );
    });
    this.edges = [];
    this.nodeConnectionCountsDirty = true;
    this.duplicateNodeSourceById.clear();
    this.duplicateNodeIdsBySourcePath.clear();
    this.hoveredDuplicateNodeIds = null;
    // Preserve duplicate-instance identity across rebuild passes so nested duplicate expansions
    // can safely use duplicate parents as edge sources.
    for (const [nodeId, node] of this.nodeMap.entries()) {
      if (node.stateOwnerPath || node.embeddedInstanceId) continue;
      const sourcePath = String(node?.sourcePath ?? "").trim();
      if (!sourcePath) continue;
      if (sourcePath === String(nodeId ?? "").trim()) continue;
      this.duplicateNodeSourceById.set(nodeId, sourcePath);
      if (!this.duplicateNodeIdsBySourcePath.has(sourcePath)) {
        this.duplicateNodeIdsBySourcePath.set(sourcePath, new Set<string>());
      }
      this.duplicateNodeIdsBySourcePath.get(sourcePath)!.add(nodeId);
    }
    // Also seed from persisted expansion keys, which may reference duplicate parent
    // instances not currently present in nodeMap.
    for (const badgeKey of this.expandedByBadge.keys()) {
      const separator = badgeKey.lastIndexOf("::");
      if (separator < 0) continue;
      const sourceNodeId = badgeKey.slice(0, separator);
      if (this.nodeMap.get(sourceNodeId)?.stateOwnerPath) continue;
      const sourcePath = this.tryGetDuplicateSourcePathFromId(sourceNodeId);
      if (!sourcePath) continue;
      this.duplicateNodeSourceById.set(sourceNodeId, sourcePath);
      if (!this.duplicateNodeIdsBySourcePath.has(sourcePath)) {
        this.duplicateNodeIdsBySourcePath.set(sourcePath, new Set<string>());
      }
      this.duplicateNodeIdsBySourcePath.get(sourcePath)!.add(sourceNodeId);
    }

    const seen = new Set<string>();
    const discoveredTypes = this.lastDisableLinkTypeDiscovery
      ? new Set<string>()
      : this.collectDiscoveredTypes(linkTypeSourceFiles);
    const includeNoneType = this.selectedLinkTypes.has(NONE_LINK_TYPE);
    const selectedTypeSourceNodeIds = this.lastDisableLinkTypeDiscovery
      ? new Set<string>()
      : this.collectSelectedTypeSourceNodeIds(linkTypeSourceFiles);

    for (const file of files) {
      const frontmatterByType = this.collectFrontmatterLinksByType(file);

      for (const [type, targets] of frontmatterByType.entries()) {
        // Persistent graph-note views expand active LinkTypes per node through
        // expandedByBadge. Do not rediscover the same property globally during
        // an edge rebuild, otherwise one badge click appears to expand every
        // node that has links under that property.
        if (this.lastDisableLinkTypeDiscovery) continue;
        if (!this.selectedLinkTypes.has(type)) continue;
        if (this.getLinkTypeSemantic(type) === "parent") continue;
        const duplicateMode = this.isLinkDuplicateNodesEnabled(type);
        if (duplicateMode) continue;
        if (!this.isLinkDiscoveryEnabled(type)) continue;
        for (const targetPath of targets) {
          if (!fileSet.has(targetPath)) continue;
          this.pushEdge(seen, file.path, targetPath, type);
        }
      }

      if (!includeNoneType) continue;

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
        if (!fileSet.has(target.path)) continue;
        if (frontmatterTargets.has(target.path)) continue;
        this.pushEdge(seen, file.path, target.path, NONE_LINK_TYPE);
      }
    }

    // Runtime badge expansions must remain visible even when link-type menu filters are active.
    for (const [badgeKey, targetPaths] of this.expandedByBadge.entries()) {
      const separator = badgeKey.lastIndexOf("::");
      if (separator < 0) continue;
      const sourceNodeId = badgeKey.slice(0, separator);
      const linkType = badgeKey.slice(separator + 2);
      if (!sourceNodeId || !linkType) continue;
      if (this.nodeMap.get(sourceNodeId)?.stateOwnerPath) continue;
      if (this.getLinkTypeSemantic(linkType) === "parent") continue;
      const sourcePath = this.getSourcePathForNodeId(sourceNodeId);
      if (!sourcePath) continue;
      if (!fileSet.has(sourcePath)) continue;

      for (const targetPath of targetPaths) {
        const targetNodeId = this.isLinkDuplicateNodesEnabled(linkType)
          ? this.resolveRuntimeTargetNodeId(sourceNodeId, targetPath, linkType, {
              preferExistingVisibleTarget: this.visibleLinkTypes.has(this.normalizeLinkType(linkType))
            })
          : targetPath;
        if (!fileSet.has(targetPath) && !this.nodeMap.has(targetNodeId)) continue;
        if (this.isLinkDuplicateNodesEnabled(linkType)) {
          this.pushEdge(seen, sourceNodeId, targetNodeId, linkType);
        } else {
          this.pushEdge(seen, sourceNodeId, targetPath, linkType);
        }
      }
    }

    this.addOverlayEdges(seen, files);
    this.addVisibleLinkTypeEdges(seen, files);
    this.nodeConnectionCountsDirty = true;

    const visibleFiles = this.computeVisibleFiles(files, selectedTypeSourceNodeIds);
    const visibleIds = new Set(visibleFiles.map(file => file.path));
    this.baseNodeIds = new Set(visibleIds);
    this.edges = this.edges.filter(edge =>
      this.isNodeVisibleAfterFileFilter(edge.from, visibleIds)
      && this.isNodeVisibleAfterFileFilter(edge.to, visibleIds)
    );
    const previousNodeIds = new Set(this.nodes.map((node) => node.id));
    this.syncNodes(visibleFiles);
    this.syncDuplicateNodesFromEdges();
    this.edges.push(...embeddedEdges.filter((edge) =>
      this.nodeMap.has(edge.from) && this.nodeMap.has(edge.to)
    ));
    this.renderBadges();
    this.reapplyExpandedParentRequests();
    this.updateNodeColors();
    this.availableLinkTypes = discoveredTypes;
    this.directionLayoutDirty = true;
    this.badgesDirty = true;
    this.debug("rebuildEdges", {
      filesCount: files.length,
      linkTypeSourceFilesCount: linkTypeSourceFiles.length,
      nodeLimit: this.lastNodeLimit,
      selectedLinkTypes: Array.from(this.selectedLinkTypes).sort((a, b) => a.localeCompare(b)),
      discoveredTypesCount: discoveredTypes.size,
      discoveredTypesSample: Array.from(discoveredTypes).sort((a, b) => a.localeCompare(b)).slice(0, 30),
      visibleNodeCount: visibleFiles.length,
      edgesCount: this.edges.length,
      selectedTypeSourceNodeCount: selectedTypeSourceNodeIds.size,
      overlayLinkTypes: Array.from(this.overlayLinkTypes).sort((a, b) => a.localeCompare(b)),
      visibleLinkTypes: Array.from(this.visibleLinkTypes).sort((a, b) => a.localeCompare(b)),
      debugMeta: this.lastDebugMeta
    });
    this.normalizeSelectedTypes();
    this.updateMenuCounter();
    this.refreshNearestActiveLinkedNode();
    if (this.menuOpen) {
      this.renderLinkTypeMenu();
    }
    const topologySignature = this.buildTopologySignature();
    const topologyChanged = topologySignature !== this.lastTopologySignature;
    this.lastTopologySignature = topologySignature;
    if (topologyChanged) {
      this.freezeExistingNodesForTopologyUpdate(previousNodeIds);
      this.startSimulation();
    } else {
      this.requestRender();
    }
  }

  private getCurrentFilesAsTFiles(): TFile[] {
    const files: TFile[] = [];
    for (const path of this.currentFiles) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        files.push(file);
      }
    }
    return files;
  }

  private reconcileCurrentFilesFromVisibleState(): void {
    const next = new Set<string>();
    const expansionNodeIds = new Set<string>();
    const duplicateExpansionTargetPaths = new Set<string>();
    for (const [badgeKey, nodeIds] of this.expansionNodes.entries()) {
      for (const nodeId of nodeIds) expansionNodeIds.add(nodeId);
      const separator = badgeKey.lastIndexOf("::");
      const linkType = separator > 0 ? this.normalizeLinkType(badgeKey.slice(separator + 2)) : "";
      if (this.activeLinkTypeDuplicateNodesByProperty.get(linkType) !== true) continue;
      for (const targetPath of this.expandedByBadge.get(badgeKey) ?? []) {
        if (targetPath) duplicateExpansionTargetPaths.add(targetPath);
      }
    }
    // Remove stale canonical copies left by the old reconciliation behavior. The
    // badge-owned duplicate instances remain and are the only nodes that should
    // represent these targets while the badge is expanded.
    const staleCanonicalNodeIds = this.nodes
      .filter((node) =>
        !node.stateOwnerPath
        && duplicateExpansionTargetPaths.has(node.sourcePath)
        && !expansionNodeIds.has(node.id)
        && !this.rootFilePaths.has(node.sourcePath)
        && !this.filterFilePaths.has(node.sourcePath)
        && !(this.nodeOwners.get(node.id)?.size)
      )
      .map((node) => node.id);
    for (const nodeId of staleCanonicalNodeIds) {
      this.removeNodeById(nodeId);
    }
    for (const path of this.rootFilePaths) {
      if (path) next.add(path);
    }
    for (const path of this.filterFilePaths) {
      if (path) next.add(path);
    }
    for (const edge of this.edges) {
      if (edge.relationship !== "parent") continue;
      const sourcePath = this.getSourcePathForNodeId(edge.from);
      const targetPath = this.getSourcePathForNodeId(edge.to);
      if (sourcePath) next.add(sourcePath);
      if (targetPath) next.add(targetPath);
    }
    for (const [badgeKey, nodeIds] of this.expansionNodes.entries()) {
      const separator = badgeKey.lastIndexOf("::");
      const sourceNodeId = separator > 0 ? badgeKey.slice(0, separator) : "";
      const linkType = separator > 0 ? this.normalizeLinkType(badgeKey.slice(separator + 2)) : "";
      if (sourceNodeId && this.nodeMap.get(sourceNodeId)?.stateOwnerPath) continue;
      // Duplicate-node link types already own concrete runtime nodes per badge. Adding
      // their source paths to currentFiles also creates canonical/filter instances,
      // which makes the same relationship appear expanded from every root node.
      if (this.activeLinkTypeDuplicateNodesByProperty.get(linkType) === true) continue;
      for (const nodeId of nodeIds) {
        const sourcePath = this.getSourcePathForNodeId(nodeId);
        if (sourcePath) next.add(sourcePath);
      }
    }
    this.currentFiles = next;
  }

  private buildTopologySignature(): string {
    const nodePart = this.nodes
      .map((node) => node.id)
      .sort((a, b) => a.localeCompare(b))
      .join("\n");
    const edgePart = this.edges
      .map((edge) => [
        edge.from,
        edge.to,
        this.normalizeLinkType(edge.linkType ?? edge.type),
        edge.mode ?? ""
      ].join("::"))
      .sort((a, b) => a.localeCompare(b))
      .join("\n");
    return `${nodePart}\n---edges---\n${edgePart}`;
  }

  private freezeExistingNodesForTopologyUpdate(previousNodeIds: Set<string>): void {
    this.topologyUpdateFrozenNodeIds.clear();
    for (const node of this.nodes) {
      if (!previousNodeIds.has(node.id)) continue;
      node.vx = 0;
      node.vy = 0;
      this.topologyUpdateFrozenNodeIds.add(node.id);
    }
  }

  private clearTopologyUpdateFreeze(): void {
    if (this.topologyUpdateFrozenNodeIds.size === 0) return;
    for (const nodeId of this.topologyUpdateFrozenNodeIds) {
      const node = this.nodeMap.get(nodeId);
      if (!node) continue;
      node.vx = 0;
      node.vy = 0;
    }
    this.topologyUpdateFrozenNodeIds.clear();
  }

  private getCurrentNodeIdSet(): Set<string> {
    return new Set(this.nodes.map((node) => node.id));
  }

  private rememberNodePosition(node: GraphNode): void {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
    this.lastKnownNodePositions.set(node.id, { x: node.x, y: node.y });
  }

  private rememberCurrentNodePositions(): void {
    for (const node of this.nodes) {
      this.rememberNodePosition(node);
    }
  }

  private getRememberedNodePosition(nodeId: string): { x: number; y: number } | null {
    const normalizedNodeId = String(nodeId ?? "").trim();
    if (!normalizedNodeId) return null;
    const position = this.lastKnownNodePositions.get(normalizedNodeId);
    if (!position) return null;
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
    return { x: position.x, y: position.y };
  }

  private buildActiveLinkTypeSignature(linkTypes: O3LinkType[] | undefined): string {
    return (linkTypes ?? [])
      .filter((lt): lt is O3LinkType => Boolean(lt))
      .map((lt) => {
        const property = this.normalizeLinkType(String(lt.property ?? ""));
        if (!property) return "";
        const expansionProperties = this.getLinkTypeExpansionProperties(lt).join(",");
        return [
          property,
          expansionProperties,
          String(lt.linkType ?? ""),
          String(lt.linkDirection ?? ""),
          String(Number.isFinite(Number(lt.linkXAxis)) ? Number(lt.linkXAxis) : ""),
          String(Number.isFinite(Number(lt.linkYAxis)) ? Number(lt.linkYAxis) : ""),
          String(Number.isFinite(Number(lt.linkDistance)) ? Number(lt.linkDistance) : ""),
          String(Number.isFinite(Number(lt.linkForce)) ? Number(lt.linkForce) : ""),
          String(lt.linkLineColor ?? lt.color ?? ""),
          String(Number.isFinite(Number(lt.linkLineThickness)) ? Number(lt.linkLineThickness) : ""),
          String(lt.direction ?? ""),
          String(lt.linkDiscoveryDirection ?? "outgoing"),
          lt.linkDiscovery === false ? "discovery:false" : "discovery:true",
          lt.linkDuplicateNodes === true ? "duplicate:true" : "duplicate:false"
        ].join("\u001f");
      })
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .join("\u001e");
  }

  private buildLinkTypePhysicsSignature(configMap: Record<string, LinkTypePhysicsConfig> | undefined): string {
    if (!configMap || typeof configMap !== "object") return "";
    return Object.entries(configMap)
      .map(([type, rawConfig]) => {
        const normalizedType = this.normalizeLinkType(type);
        if (!normalizedType) return "";
        const normalized = this.normalizeLinkTypePhysicsConfig(rawConfig);
        return [
          normalizedType,
          Number.isFinite(normalized.preferredDistance) ? Number(normalized.preferredDistance) : "",
          Number.isFinite(normalized.strength) ? Number(normalized.strength) : ""
        ].join("\u001f");
      })
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .join("\u001e");
  }

  private buildSimulationSettingsSignature(): string {
    return [
      this.repulsionStrength,
      this.centerStrength,
      this.nodeRadius,
      this.nodeConnectionSizeMultiplier,
      this.nearRestVelocityThreshold,
      this.restVelocityThreshold,
      this.textFadeThreshold
    ].map((value) => String(Number.isFinite(Number(value)) ? Number(value) : "")).join("\u001f");
  }

  private collectFrontmatterLinksByType(file: TFile): Map<string, Set<string>> {
    const byType = new Map<string, Set<string>>();
    const cache = this.app.metadataCache.getFileCache(file);

    const addTarget = (rawKey: string, targetPath: string): void => {
      const normalizedKey = this.normalizeFrontmatterLinkTypeKey(rawKey);
      if (!normalizedKey) return;
      if (!byType.has(normalizedKey)) {
        byType.set(normalizedKey, new Set<string>());
      }
      byType.get(normalizedKey)!.add(targetPath);
    };

    const frontmatterLinks = this.getFrontmatterLinks(cache);
    if (frontmatterLinks.length > 0) {
      for (const link of frontmatterLinks) {
        const rawKey = String(link.key ?? "").trim();
        const linkText = String(link.link ?? "").trim();
        if (!rawKey || !linkText) continue;

        const target = this.resolveGraphLinkTarget(linkText, file.path);
        if (!target) continue;

        const baseKey = rawKey.split(/[.[\]]/)[0];
        addTarget(baseKey, target.path);
      }
    }

    const frontmatter = cache?.frontmatter;
    if (!frontmatter) {
      this.applyActiveLinkTypePropertyAliases(byType);
      return byType;
    }

    for (const [key, value] of Object.entries(frontmatter)) {
      if (String(key ?? "").trim().toLowerCase() === "position") continue;

      const candidates = extractInternalLinkCandidates(value);
      if (!candidates.length) continue;

      for (const candidate of candidates) {
        const target = this.resolveGraphLinkTarget(candidate, file.path);
        if (!target) continue;
        addTarget(key, target.path);
      }
    }

    this.applyActiveLinkTypePropertyAliases(byType);
    return byType;
  }

  private applyActiveLinkTypePropertyAliases(byType: Map<string, Set<string>>): void {
    if (this.activeLinkTypeExpansionPropertiesByProperty.size === 0) return;
    for (const [primaryProperty, expansionProperties] of this.activeLinkTypeExpansionPropertiesByProperty.entries()) {
      if (!primaryProperty || expansionProperties.length <= 1) continue;
      let primaryTargets = byType.get(primaryProperty);
      for (const property of expansionProperties) {
        if (property === primaryProperty) continue;
        const targets = byType.get(property);
        if (!targets || targets.size === 0) continue;
        if (!primaryTargets) {
          primaryTargets = new Set<string>();
          byType.set(primaryProperty, primaryTargets);
        }
        for (const target of targets) {
          primaryTargets.add(target);
        }
      }
    }
  }

  private resolveGraphLinkTarget(rawLinkText: string, sourcePath: string): GraphLinkTarget | null {
    const linkText = String(rawLinkText ?? "").trim();
    if (!linkText || /^(?:[a-z]+:)?\/\//i.test(linkText)) return null;
    const withoutAlias = linkText.split("|")[0]?.trim() ?? linkText;
    const withoutHeading = withoutAlias.split("#")[0]?.trim() ?? withoutAlias;
    const normalized = withoutHeading.replace(/\\/g, "/").trim();
    if (!normalized) return null;

    const resolved = this.app.metadataCache.getFirstLinkpathDest(normalized, sourcePath);
    if (resolved instanceof TFile) {
      return {
        path: resolved.path,
        label: this.lastLabels.get(resolved.path) ?? resolved.basename ?? resolved.name,
        file: resolved,
        missing: false
      };
    }

    const missingPath = this.normalizeMissingLinkPath(normalized);
    if (!missingPath) return null;
    return {
      path: missingPath,
      label: this.labelFromPath(missingPath),
      file: null,
      missing: true
    };
  }

  private normalizeMissingLinkPath(rawPath: string): string {
    const path = String(rawPath ?? "")
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .trim();
    if (!path) return "";
    return /\.md$/i.test(path) ? path : `${path}.md`;
  }

  private labelFromPath(pathRaw: string): string {
    const path = String(pathRaw ?? "").trim();
    return path.split("/").pop()?.replace(/\.md$/i, "") || path;
  }

  private collectDiscoveredTypes(files: TFile[]): Set<string> {
    const discoveredTypes = new Set<string>();
    for (const file of files) {
      for (const type of this.collectFrontmatterLinkTypeKeys(file)) {
        discoveredTypes.add(type);
      }

      const frontmatterByType = this.collectFrontmatterLinksByType(file);
      for (const [type, targets] of frontmatterByType.entries()) {
        if (targets.size > 0) {
          discoveredTypes.add(type);
        }
      }
    }
    return discoveredTypes;
  }

  private collectSelectedTypeSourceNodeIds(files: TFile[]): Set<string> {
    const sourceIds = new Set<string>();
    if (this.selectedLinkTypes.size === 0) {
      return sourceIds;
    }

    for (const file of files) {
      const frontmatterByType = this.collectFrontmatterLinksByType(file);
      let hasSelectedType = false;
      for (const [type, targets] of frontmatterByType.entries()) {
        if (!this.selectedLinkTypes.has(type)) continue;
        const duplicateMode = this.isLinkDuplicateNodesEnabled(type);
        if (duplicateMode) {
          if (this.isBadgeExpanded(file.path, type) && targets.size > 0) {
            hasSelectedType = true;
            break;
          }
          continue;
        }
        if (!this.isLinkDiscoveryEnabled(type)) continue;
        if (targets.size > 0) {
          hasSelectedType = true;
          break;
        }
      }

      if (!hasSelectedType && this.selectedLinkTypes.has(NONE_LINK_TYPE)) {
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
          hasSelectedType = true;
          break;
        }
      }

      if (hasSelectedType) {
        sourceIds.add(file.path);
      }
    }

    return sourceIds;
  }

  private collectFrontmatterLinkTypeKeys(file: TFile): Set<string> {
    const out = new Set<string>();
    const cache = this.app.metadataCache.getFileCache(file);

    const frontmatterLinks = this.getFrontmatterLinks(cache);
    for (const link of frontmatterLinks) {
      const rawKey = String(link.key ?? "").trim();
      if (!rawKey) continue;
      const baseKey = rawKey.split(/[.[\]]/)[0];
      const normalizedKey = this.normalizeFrontmatterLinkTypeKey(baseKey);
      if (normalizedKey) {
        out.add(normalizedKey);
      }
    }

    const frontmatter = cache?.frontmatter;
    if (!frontmatter) return out;

    for (const [key, value] of Object.entries(frontmatter)) {
      if (String(key ?? "").trim().toLowerCase() === "position") continue;
      const candidates = extractInternalLinkCandidates(value);
      if (candidates.length > 0) {
        const normalizedKey = this.normalizeFrontmatterLinkTypeKey(key);
        if (normalizedKey) out.add(normalizedKey);
      }
    }

    return out;
  }

  private normalizeFrontmatterLinkTypeKey(key: string): string {
    return String(key ?? "").trim().toLowerCase();
  }

  private getFrontmatterLinks(cache: unknown): FrontmatterLinkEntry[] {
    const record = cache && typeof cache === "object"
      ? cache as { frontmatterLinks?: unknown }
      : {};
    const links = record.frontmatterLinks;
    return Array.isArray(links) ? links : [];
  }

  private buildEdgeKey(from: string, to: string, type: string, linkType?: string): string {
    return `${from}::${to}::${type}::${linkType ?? ""}`;
  }

  private pushEdge(
    seen: Set<string>,
    from: string,
    to: string,
    type: string,
    options?: { linkType?: string; relationship?: "parent"; mode?: "overlay" | "visible" }
  ) {
    const key = `${options?.mode === "overlay" ? "overlay" : "edge"}::${this.buildEdgeKey(from, to, type, options?.linkType)}`;
    if (seen.has(key)) return;
    seen.add(key);
    this.edges.push({
      from,
      to,
      type,
      ...(options?.linkType ? { linkType: options.linkType } : {}),
      ...(options?.relationship ? { relationship: options.relationship } : {}),
      ...(options?.mode ? { mode: options.mode } : {})
    });
    this.nodeConnectionCountsDirty = true;
  }

  private hasSemanticEdge(from: string, to: string, linkType: string): boolean {
    const normalizedFrom = String(from ?? "").trim();
    const normalizedTo = String(to ?? "").trim();
    const normalizedType = this.normalizeLinkType(linkType);
    if (!normalizedFrom || !normalizedTo || !normalizedType) return false;
    const fromPath = this.getSourcePathForNodeId(normalizedFrom) || normalizedFrom;
    const toPath = this.getSourcePathForNodeId(normalizedTo) || normalizedTo;
    return this.edges.some((edge) =>
      (this.getSourcePathForNodeId(edge.from) || edge.from) === fromPath
      && (this.getSourcePathForNodeId(edge.to) || edge.to) === toPath
      && this.normalizeLinkType(edge.linkType ?? edge.type) === normalizedType
    );
  }

  private pushVisibleEdge(
    seen: Set<string>,
    from: string,
    to: string,
    linkType: string
  ): void {
    if (this.hasSemanticEdge(from, to, linkType)) return;
    this.pushEdge(seen, from, to, linkType, { mode: "visible" });
  }

  private removeVisibleSemanticEdges(from: string, to: string, linkType: string): void {
    const normalizedFrom = String(from ?? "").trim();
    const normalizedTo = String(to ?? "").trim();
    const normalizedType = this.normalizeLinkType(linkType);
    if (!normalizedFrom || !normalizedTo || !normalizedType) return;
    const fromPath = this.getSourcePathForNodeId(normalizedFrom) || normalizedFrom;
    const toPath = this.getSourcePathForNodeId(normalizedTo) || normalizedTo;
    const before = this.edges.length;
    this.edges = this.edges.filter((edge) => {
      if (edge.mode !== "visible") return true;
      return !(
        (this.getSourcePathForNodeId(edge.from) || edge.from) === fromPath
        && (this.getSourcePathForNodeId(edge.to) || edge.to) === toPath
        && this.normalizeLinkType(edge.linkType ?? edge.type) === normalizedType
      );
    });
    if (this.edges.length !== before) {
      this.nodeConnectionCountsDirty = true;
    }
  }

  private addOverlayEdges(seen: Set<string>, files: TFile[]): void {
    if (this.overlayLinkTypes.size === 0) return;
    const corePaths = new Set<string>([
      ...Array.from(this.rootFilePaths),
      ...Array.from(this.filterFilePaths)
    ]);
    if (corePaths.size === 0) return;

    for (const file of files) {
      if (!corePaths.has(file.path)) continue;
      const frontmatterByType = this.collectFrontmatterLinksByType(file);
      for (const linkType of this.overlayLinkTypes) {
        const targets = frontmatterByType.get(linkType);
        if (!targets) continue;
        for (const targetPath of targets) {
          if (!corePaths.has(targetPath)) continue;
          this.pushEdge(seen, file.path, targetPath, linkType, { mode: "overlay" });
        }
      }
    }
  }

  private addVisibleLinkTypeEdges(seen: Set<string>, files: TFile[]): void {
    if (this.visibleLinkTypes.size === 0) return;
    const context = this.buildVisibleLinkTypeEdgeContext(
      files.map((file) => file.path),
      Array.from(this.visibleLinkTypes)
    );
    this.addVisibleLinkTypeEdgesForContext(seen, context);
  }

  private addEmbeddedVisibleLinkTypeEdges(containerKey: string): void {
    const container = this.embeddedGraphContainers.get(containerKey);
    if (!container || container.visibleLinkTypes.length === 0 || container.memberIds.size === 0) return;

    const seen = new Set(
      this.edges.map((edge) =>
        `${edge.mode === "overlay" ? "overlay" : "edge"}::${this.buildEdgeKey(edge.from, edge.to, edge.type, edge.linkType)}`
      )
    );
    const context = this.buildVisibleLinkTypeEdgeContext(
      Array.from(container.memberIds),
      container.visibleLinkTypes
    );
    this.addVisibleLinkTypeEdgesForContext(seen, context);
  }

  private buildVisibleLinkTypeEdgeContext(
    sourceNodeIdsRaw: Iterable<string>,
    visibleLinkTypesRaw: Iterable<string>
  ): VisibleLinkTypeEdgeContext {
    const sourceNodeIds: string[] = [];
    const sourcePathByNodeId = new Map<string, string>();
    const targetNodeIdsByPath = new Map<string, string[]>();
    const visibleLinkTypes = Array.from(visibleLinkTypesRaw ?? [])
      .map((linkType) => this.normalizeLinkType(linkType))
      .filter(Boolean);

    for (const nodeIdRaw of sourceNodeIdsRaw ?? []) {
      const nodeId = String(nodeIdRaw ?? "").trim();
      if (!nodeId) continue;
      const sourcePath = this.getSourcePathForNodeId(nodeId) || nodeId;
      if (!sourcePath) continue;
      sourceNodeIds.push(nodeId);
      sourcePathByNodeId.set(nodeId, sourcePath);
      const runtimeIds = targetNodeIdsByPath.get(sourcePath) ?? [];
      runtimeIds.push(nodeId);
      targetNodeIdsByPath.set(sourcePath, runtimeIds);
    }

    return {
      sourceNodeIds,
      sourcePathByNodeId,
      targetNodeIdsByPath,
      visibleLinkTypes
    };
  }

  private addVisibleLinkTypeEdgesForContext(
    seen: Set<string>,
    context: VisibleLinkTypeEdgeContext
  ): void {
    if (context.visibleLinkTypes.length === 0 || context.sourceNodeIds.length === 0) return;
    for (const sourceNodeId of context.sourceNodeIds) {
      const sourcePath = context.sourcePathByNodeId.get(sourceNodeId);
      if (!sourcePath) continue;
      const file = this.app.vault.getAbstractFileByPath(sourcePath);
      if (!(file instanceof TFile)) continue;
      const frontmatterByType = this.collectFrontmatterLinksByType(file);
      for (const linkType of context.visibleLinkTypes) {
        const targets = frontmatterByType.get(linkType);
        if (!targets) continue;
        for (const targetPath of targets) {
          const targetNodeIds = context.targetNodeIdsByPath.get(targetPath) ?? [];
          for (const targetNodeId of targetNodeIds) {
            if (!this.isVisibleDuplicateEdgeOwnedBySource(sourceNodeId, targetNodeId, targetPath, linkType)) {
              continue;
            }
            this.pushVisibleEdge(seen, sourceNodeId, targetNodeId, linkType);
          }
        }
      }
    }
  }

  private isVisibleDuplicateEdgeOwnedBySource(
    sourceNodeId: string,
    targetNodeId: string,
    targetPath: string,
    linkType: string
  ): boolean {
    if (!this.isLinkDuplicateNodesEnabled(linkType)) return true;

    const sourceNode = this.nodeMap.get(sourceNodeId);
    const sourceIsDuplicate = Boolean(
      this.tryGetDuplicateSourcePathFromId(sourceNodeId)
      || sourceNode?.embeddedOrigin?.kind === "expansion" && sourceNode.embeddedOrigin.duplicate === true
    );
    if (sourceIsDuplicate && !this.expandedByBadge.has(this.badgeKey(sourceNodeId, this.normalizeLinkType(linkType)))) {
      return false;
    }

    const outerDuplicatePath = this.tryGetDuplicateSourcePathFromId(targetNodeId);
    if (outerDuplicatePath) {
      return targetNodeId === this.formatDuplicateNodeId(sourceNodeId, targetPath, linkType);
    }

    const targetNode = this.nodeMap.get(targetNodeId);
    if (targetNode?.embeddedOrigin?.kind !== "expansion" || targetNode.embeddedOrigin.duplicate !== true) {
      return true;
    }
    const expectedEmbeddedSourceId = sourceNode?.embeddedSourceNodeId ?? sourceNode?.sourcePath ?? sourceNodeId;
    return targetNode.embeddedOrigin.sourceNodeId === expectedEmbeddedSourceId
      && this.normalizeLinkType(targetNode.embeddedOrigin.linkType) === this.normalizeLinkType(linkType);
  }

  private syncVisibleLinkTypeEdgesAfterBadgeMutation(
    targetPathRaw: string,
    linkTypeRaw: string,
    discoveryDirection: "incoming" | "outgoing" | "both",
    result: GraphLinkBadgeDropMutationResult | void | undefined
  ): void {
    const targetPath = String(targetPathRaw ?? "").trim();
    const linkType = this.normalizeLinkType(linkTypeRaw).toLowerCase();
    if (!targetPath || !linkType || !result) return;

    const addedPaths = Array.from(new Set((result.added ?? []).map((path) => String(path ?? "").trim()).filter(Boolean)));
    const removedPaths = Array.from(new Set((result.removed ?? []).map((path) => String(path ?? "").trim()).filter(Boolean)));
    if (addedPaths.length === 0 && removedPaths.length === 0) return;

    const relationship = (path: string): { fromPath: string; toPath: string } =>
      discoveryDirection === "incoming"
        ? { fromPath: path, toPath: targetPath }
        : { fromPath: targetPath, toPath: path };

    let changed = false;
    for (const sourcePath of removedPaths) {
      const { fromPath, toPath } = relationship(sourcePath);
      changed = this.removeVisibleSemanticEdgesForPaths(fromPath, toPath, linkType) || changed;
    }

    const seen = new Set(
      this.edges.map((edge) =>
        `${edge.mode === "overlay" ? "overlay" : "edge"}::${this.buildEdgeKey(edge.from, edge.to, edge.type, edge.linkType)}`
      )
    );
    for (const sourcePath of addedPaths) {
      const { fromPath, toPath } = relationship(sourcePath);
      changed = this.pushVisibleSemanticEdgesForPaths(seen, fromPath, toPath, linkType) || changed;
    }

    if (!changed) {
      const affectedPaths = Array.from(new Set([targetPath, ...addedPaths, ...removedPaths]));
      for (const path of affectedPaths) {
        changed = this.refreshVisibleLinkTypeEdgesForSourcePath(path, [linkType]) || changed;
        changed = this.refreshEmbeddedVisibleLinkTypeEdgesForSourcePath(path, [linkType]) || changed;
      }
    }

    if (changed) {
      this.badgesDirty = true;
      this.requestRender();
    }
  }

  private pushVisibleSemanticEdgesForPaths(
    seen: Set<string>,
    fromPath: string,
    toPath: string,
    linkType: string
  ): boolean {
    let changed = false;
    for (const edgeScope of this.getVisibleEdgeScopesForLinkType(linkType)) {
      const fromNodeIds = edgeScope.nodeIdsByPath.get(fromPath) ?? [];
      const toNodeIds = edgeScope.nodeIdsByPath.get(toPath) ?? [];
      for (const fromNodeId of fromNodeIds) {
        for (const toNodeId of toNodeIds) {
          const before = this.edges.length;
          this.pushVisibleEdge(seen, fromNodeId, toNodeId, linkType);
          changed = this.edges.length !== before || changed;
        }
      }
    }
    if (changed) {
      this.nodeConnectionCountsDirty = true;
      this.reheatSimulation(0.08, "visible link mutation");
    }
    return changed;
  }

  private removeVisibleSemanticEdgesForPaths(fromPath: string, toPath: string, linkType: string): boolean {
    const normalizedFrom = String(fromPath ?? "").trim();
    const normalizedTo = String(toPath ?? "").trim();
    const normalizedType = this.normalizeLinkType(linkType);
    if (!normalizedFrom || !normalizedTo || !normalizedType) return false;
    const before = this.edges.length;
    this.edges = this.edges.filter((edge) => {
      if (edge.mode !== "visible") return true;
      return !(
        (this.getSourcePathForNodeId(edge.from) || edge.from) === normalizedFrom
        && (this.getSourcePathForNodeId(edge.to) || edge.to) === normalizedTo
        && this.normalizeLinkType(edge.linkType ?? edge.type) === normalizedType
      );
    });
    const changed = this.edges.length !== before;
    if (changed) {
      this.nodeConnectionCountsDirty = true;
      this.reheatSimulation(0.08, "visible link mutation");
    }
    return changed;
  }

  private getVisibleEdgeScopesForLinkType(linkType: string): Array<{ nodeIdsByPath: Map<string, string[]> }> {
    const normalizedType = this.normalizeLinkType(linkType).toLowerCase();
    if (!normalizedType) return [];
    const scopes: Array<{ nodeIdsByPath: Map<string, string[]> }> = [];
    if (this.visibleLinkTypes.has(normalizedType)) {
      scopes.push({
        nodeIdsByPath: this.buildNodeIdsBySourcePath(
          this.nodes.filter((node) => !node.stateOwnerPath).map((node) => node.id)
        )
      });
    }
    for (const container of this.embeddedGraphContainers.values()) {
      if (!container.visibleLinkTypes.includes(normalizedType)) continue;
      scopes.push({
        nodeIdsByPath: this.buildNodeIdsBySourcePath(Array.from(container.memberIds))
      });
    }
    return scopes;
  }

  private buildNodeIdsBySourcePath(nodeIds: string[]): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const nodeId of nodeIds) {
      const path = this.getSourcePathForNodeId(nodeId) || nodeId;
      if (!path) continue;
      const ids = out.get(path) ?? [];
      ids.push(nodeId);
      out.set(path, ids);
    }
    return out;
  }

  refreshVisibleLinkTypeEdgesForSourcePath(
    pathRaw: string,
    changedPropertiesRaw: string[] = []
  ): boolean {
    const path = String(pathRaw ?? "").trim();
    if (!path || this.visibleLinkTypes.size === 0) return false;
    const changedProperties = new Set(
      changedPropertiesRaw
        .map((property) => this.normalizeLinkType(property).toLowerCase())
        .filter(Boolean)
    );
    if (
      changedProperties.size > 0
      && !Array.from(this.visibleLinkTypes).some((linkType) => changedProperties.has(linkType))
    ) {
      return false;
    }
    const sourceNodeIds = this.nodes
      .filter((node) => !node.stateOwnerPath && node.sourcePath === path)
      .map((node) => node.id);
    if (sourceNodeIds.length === 0) return false;
    const sourceNodeIdSet = new Set(sourceNodeIds);
    this.edges = this.edges.filter((edge) =>
      !(edge.mode === "visible" && sourceNodeIdSet.has(edge.from))
    );
    const seen = new Set(
      this.edges.map((edge) =>
        `${edge.mode === "overlay" ? "overlay" : "edge"}::${this.buildEdgeKey(edge.from, edge.to, edge.type, edge.linkType)}`
      )
    );
    const context = this.buildVisibleLinkTypeEdgeContext(
      this.nodes
        .filter((node) => !node.stateOwnerPath)
        .map((node) => node.id),
      Array.from(this.visibleLinkTypes)
    );
    this.addVisibleLinkTypeEdgesForContext(seen, context);
    this.nodeConnectionCountsDirty = true;
    this.reheatSimulation(0.08, "visible link refresh");
    return true;
  }

  refreshEmbeddedVisibleLinkTypeEdgesForSourcePath(
    pathRaw: string,
    changedPropertiesRaw: string[] = []
  ): boolean {
    const path = String(pathRaw ?? "").trim();
    if (!path) return false;
    const changedProperties = new Set(
      changedPropertiesRaw
        .map((property) => this.normalizeLinkType(property).toLowerCase())
        .filter(Boolean)
    );
    let refreshed = false;
    for (const container of this.embeddedGraphContainers.values()) {
      if (container.visibleLinkTypes.length === 0) continue;
      if (
        changedProperties.size > 0
        && !container.visibleLinkTypes.some((linkType) => changedProperties.has(linkType))
      ) {
        continue;
      }
      const containsSource = Array.from(container.memberIds).some((nodeId) =>
        this.nodeMap.get(nodeId)?.sourcePath === path
      );
      if (!containsSource) continue;
      this.edges = this.edges.filter((edge) => {
        if (edge.mode !== "visible") return true;
        return !(container.memberIds.has(edge.from) && container.memberIds.has(edge.to));
      });
      this.addEmbeddedVisibleLinkTypeEdges(container.key);
      refreshed = true;
    }
    if (refreshed) {
      this.nodeConnectionCountsDirty = true;
      this.reheatSimulation(0.08, "embedded visible link refresh");
      this.requestRender();
    }
    return refreshed;
  }

  private normalizeLinkType(type: string): string {
    return String(type ?? "").trim();
  }

  private normalizeGraphLineStyle(raw: unknown, fallback: GraphLineStyle): GraphLineStyle {
    const value = String(raw ?? "").trim().toLowerCase();
    if (["dash", "dashed"].includes(value)) return "dashed";
    if (["normal", "solid", "line"].includes(value)) return "normal";
    return fallback;
  }

  private normalizeCssColor(raw: unknown): string | null {
    const value = String(raw ?? "").trim();
    if (!value) return null;
    if (typeof CSS !== "undefined" && typeof CSS.supports === "function") {
      return CSS.supports("color", value) ? value : null;
    }
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : null;
  }

  private getLinkTypeExpansionProperties(linkType: Pick<O3LinkType, "property"> & Partial<Pick<O3LinkType, "properties">>): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (raw: unknown): void => {
      const property = this.normalizeLinkType(String(raw ?? "").trim().toLowerCase());
      if (!property || seen.has(property)) return;
      seen.add(property);
      out.push(property);
    };
    add(linkType.property);
    for (const property of linkType.properties ?? []) {
      add(property);
    }
    return out;
  }

  private getLinkTypeWriteProperty(linkType: string): string {
    const normalized = this.normalizeLinkType(linkType);
    if (!normalized) return "";
    return this.activeLinkTypeWritePropertyByProperty.get(normalized) ?? normalized;
  }

  private normalizeLinkLineColor(color: unknown): string | undefined {
    const raw = String(color ?? "").trim();
    if (!raw) return undefined;
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw) ? raw : undefined;
  }

  private normalizeLinkLineThickness(thickness: unknown): number | undefined {
    const value = Number(thickness);
    if (!Number.isFinite(value) || value <= 0) return undefined;
    return this.clamp(value, 0.25, 16);
  }

  private normalizePointerDirection(direction: unknown): LinkPointerDirection {
    const raw = String(direction ?? "outgoing").trim().toLowerCase();
    if (raw === "incoming" || raw === "none") return raw;
    if (raw === "both") return "none";
    return "outgoing";
  }

  private getEdgeVisualConfig(edge: Edge): LinkTypeVisualConfig {
    const linkType = this.normalizeLinkType(edge.linkType ?? edge.type);
    return this.activeLinkTypeVisualByProperty.get(linkType) ?? {
      pointerDirection: edge.relationship === "parent" ? "outgoing" : "none"
    };
  }

  private getEdgeStrokeColor(edge: Edge, highlighted: boolean, alpha: number): string {
    if (highlighted) return "rgba(120, 200, 255, 0.9)";
    const visual = this.getEdgeVisualConfig(edge);
    if (visual.color) return visual.color;
    if (edge.mode === "overlay") return "rgba(150, 170, 190, 0.42)";
    if (edge.relationship === "parent") return `rgba(110, 150, 220, ${alpha.toFixed(3)})`;
    return "#444";
  }

  private getEdgeLineWidth(edge: Edge, highlighted: boolean): number {
    const visual = this.getEdgeVisualConfig(edge);
    const base = visual.thickness ?? (edge.relationship === "parent" ? 1.25 : 1);
    const renderScale = this.getEdgeEmbeddedRenderScale(edge);
    const scaled = Math.max(0.35, base * this.camera.zoom * renderScale);
    if (highlighted) return Math.max(scaled, 1.4);
    if (edge.relationship === "parent") return Math.max(0.7, scaled);
    return scaled;
  }

  private getEdgeEmbeddedRenderScale(edge: Edge): number {
    const from = this.nodeMap.get(edge.from);
    const to = this.nodeMap.get(edge.to);
    if (!from || !to) return 1;
    if (!from.embeddedInstanceId || from.embeddedInstanceId !== to.embeddedInstanceId) return 1;
    const container = this.embeddedGraphContainers.get(from.embeddedInstanceId);
    return container ? this.getEmbeddedContainerRenderTransform(container).scale : this.getEmbeddedNodeVisualScale(from);
  }

  private drawEdgeArrow(
    edge: Edge,
    sx1: number,
    sy1: number,
    sx2: number,
    sy2: number,
    color: string,
    lineWidth: number
  ): void {
    const visual = this.getEdgeVisualConfig(edge);
    if (visual.pointerDirection === "none") return;

    const fromNode = this.nodeMap.get(edge.from);
    const toNode = this.nodeMap.get(edge.to);
    if (!fromNode || !toNode) return;

    const targetNode = visual.pointerDirection === "incoming" ? fromNode : toNode;
    const targetX = visual.pointerDirection === "incoming" ? sx1 : sx2;
    const targetY = visual.pointerDirection === "incoming" ? sy1 : sy2;
    const sourceX = visual.pointerDirection === "incoming" ? sx2 : sx1;
    const sourceY = visual.pointerDirection === "incoming" ? sy2 : sy1;
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (!Number.isFinite(dist) || dist < 1) return;

    const targetRadius = this.getRenderedNodeRadius(targetNode) * this.camera.zoom;
    const renderScale = this.getEdgeEmbeddedRenderScale(edge);
    const strokeWidth = Number.isFinite(lineWidth) ? Math.max(0.35, lineWidth) : 1;
    const zoomScale = Math.max(0.25, Math.min(1.8, this.camera.zoom * renderScale));
    const arrowLength = Math.max(2.5, Math.min(40, strokeWidth * 4.2 + 8 * zoomScale));
    const arrowWidth = Math.max(1.8, Math.min(30, strokeWidth * 2.4 + 5 * zoomScale));
    const tipOffset = targetRadius + Math.max(1.2, strokeWidth * 0.85);
    if (dist <= tipOffset + arrowLength * 0.55) return;
    const tipX = targetX - (dx / dist) * tipOffset;
    const tipY = targetY - (dy / dist) * tipOffset;
    const angle = Math.atan2(dy, dx);

    this.ctx.save();
    this.ctx.translate(tipX, tipY);
    this.ctx.rotate(angle);
    this.ctx.fillStyle = color;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = Math.max(0.35, strokeWidth * 0.35);
    this.ctx.beginPath();
    this.ctx.moveTo(0, 0);
    this.ctx.lineTo(-arrowLength, -arrowWidth / 2);
    this.ctx.lineTo(-arrowLength, arrowWidth / 2);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.restore();
  }

  private normalizeGroupingRules(raw: GroupingRule[]): GroupingRule[] {
    if (!Array.isArray(raw)) return [];
    const out: GroupingRule[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const property = String(item.property ?? "").trim();
      const operator = item.operator === "contains" || item.operator === "exists" ? item.operator : "equals";
      const value = String(item.value ?? "").trim();
      const color = String(item.color ?? "#4caf50").trim() || "#4caf50";
      const icon = String(item.icon ?? "").trim();
      const iconSourcePath = String(item.iconSourcePath ?? "").trim();
      if (!property) continue;
      out.push({
        property,
        operator,
        ...(operator === "exists" ? {} : { value }),
        color,
        ...(typeof item.colorExplicit === "boolean" ? { colorExplicit: item.colorExplicit } : {}),
        ...(icon ? { icon } : {}),
        ...(iconSourcePath ? { iconSourcePath } : {})
      });
    }
    return out;
  }

  private normalizeGroupingPropertyOptions(raw: string[]): string[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of raw) {
      const value = String(item ?? "").trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      out.push(value);
    }
    return out.sort((a, b) => a.localeCompare(b));
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private badgeKey(nodeId: string, linkType: string): string {
    return `${nodeId}::${linkType}`;
  }

  private isBadgeExpanded(sourcePath: string, linkType: string): boolean {
    const source = String(sourcePath ?? "").trim();
    const type = String(linkType ?? "").trim().toLowerCase();
    if (!source || !type) return false;
    return this.expandedByBadge.has(this.badgeKey(source, type));
  }

  private setNodeBadgeVisualState(
    badge: HTMLElement,
    sourcePath: string,
    linkType: string,
    baseLabel: string,
    options: { hasYamlLinks: boolean; color?: string } = { hasYamlLinks: false }
  ): void {
    const label = String(baseLabel ?? "").trim();
    const expanded = this.isBadgeExpanded(sourcePath, linkType);
    const hasYamlLinks = options.hasYamlLinks === true;
    const baseColor = this.getBadgeBaseColor(linkType, options.color);
    const background = hasYamlLinks
      ? (expanded
        ? this.mixHexColors(baseColor, "#ffffff", 0.18)
        : this.mixHexColors(baseColor, "#000000", 0.28))
      : (expanded
        ? this.hexToRgba(this.mixHexColors(baseColor, "#ffffff", 0.12), 0.58)
        : this.hexToRgba(this.mixHexColors(baseColor, "#000000", 0.32), 0.42));
    const borderColor = hasYamlLinks || expanded
      ? (expanded
        ? this.mixHexColors(baseColor, "#ffffff", 0.05)
        : this.mixHexColors(baseColor, "#000000", 0.05))
      : this.hexToRgba(baseColor, 0.5);
    const symbol = expanded ? "-" : "+";
    badge.textContent = label ? `${symbol} ${label}` : symbol;
    badge.title = `${expanded ? "Collapse" : "Expand"} ${label || linkType}${hasYamlLinks ? "" : " (no YAML links)"}`;
    badge.setAttribute("aria-label", badge.title);
    badge.dataset.o3ExpansionState = expanded ? "expanded" : "collapsed";
    badge.dataset.o3BadgePopulated = hasYamlLinks ? "true" : "false";
    setStyle(badge, "background", background);
    setStyle(badge, "color", this.getBadgeTextColor(baseColor, hasYamlLinks || expanded ? 1 : 0.86));
    setStyle(badge, "border", `1px solid ${borderColor}`);
    setStyle(badge, "boxShadow", expanded
      ? (hasYamlLinks
        ? `0 0 0 1px ${this.hexToRgba(baseColor, 0.28)}, 0 2px 10px ${this.hexToRgba(baseColor, 0.32)}`
        : `0 0 0 1px ${this.hexToRgba(baseColor, 0.14)}, 0 2px 8px rgba(0,0,0,0.18)`)
      : `0 2px 8px rgba(0,0,0,0.25), inset 0 0 0 1px ${this.hexToRgba(baseColor, 0.12)}`);
    setStyle(badge, "opacity", hasYamlLinks ? "1" : "0.72");
    setStyle(badge, "display", "inline-flex");
    setStyle(badge, "alignItems", "center");
    setStyle(badge, "whiteSpace", "nowrap");
    setStyle(badge, "lineHeight", "1.2");
  }

  private hasBadgeYamlLinks(sourcePath: string, linkType: string): boolean {
    const path = String(sourcePath ?? "").trim();
    const normalizedType = this.normalizeLinkType(linkType);
    if (!path || !normalizedType) return false;
    const cacheKey = `${path}::${normalizedType}`;
    const cached = this.badgeYamlLinkPresenceCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return false;
    const hasLinks = this.resolveLinkedTargets(file, { property: normalizedType } as O3LinkType).length > 0;
    this.badgeYamlLinkPresenceCache.set(cacheKey, hasLinks);
    return hasLinks;
  }

  private normalizeBadgeColor(color: unknown): string {
    const raw = String(color ?? "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
    if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
      const r = raw[1];
      const g = raw[2];
      const b = raw[3];
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    return "#6e96dc";
  }

  private getBadgeBaseColor(linkType: string, fallbackColor?: string): string {
    const normalizedType = this.normalizeLinkType(linkType);
    const visualColor = normalizedType
      ? this.activeLinkTypeVisualByProperty.get(normalizedType)?.color
      : undefined;
    return this.normalizeBadgeColor(visualColor ?? fallbackColor);
  }

  private getBadgeTextColor(baseColor: string, alpha = 1): string {
    const rgb = this.hexToRgb(this.normalizeBadgeColor(baseColor));
    return this.getReadableTextColorForRgb(rgb, alpha);
  }

  private getReadableTextColor(color: string, alpha = 1): string {
    const rgb = this.parseCssRgb(color) ?? this.hexToRgb(this.normalizeBadgeColor(color));
    return this.getReadableTextColorForRgb(rgb, alpha);
  }

  private getReadableTextColorForRgb(rgb: { r: number; g: number; b: number }, alpha = 1): string {
    const channel = (value: number): number => {
      const normalized = value / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
    };
    const luminance = (0.2126 * channel(rgb.r)) + (0.7152 * channel(rgb.g)) + (0.0722 * channel(rgb.b));
    const textRgb = luminance > 0.58 ? { r: 18, g: 18, b: 18 } : { r: 255, g: 255, b: 255 };
    return alpha >= 1
      ? `rgb(${textRgb.r}, ${textRgb.g}, ${textRgb.b})`
      : `rgba(${textRgb.r}, ${textRgb.g}, ${textRgb.b}, ${this.clamp(alpha, 0, 1)})`;
  }

  private parseCssRgb(color: string): { r: number; g: number; b: number } | null {
    const trimmed = String(color ?? "").trim();
    const match = trimmed.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*[\d.]+)?\s*\)$/i);
    if (!match) return null;
    return {
      r: this.clamp(Math.round(Number(match[1])), 0, 255),
      g: this.clamp(Math.round(Number(match[2])), 0, 255),
      b: this.clamp(Math.round(Number(match[3])), 0, 255)
    };
  }

  private mixHexColors(left: string, right: string, amount: number): string {
    const leftRgb = this.hexToRgb(this.normalizeBadgeColor(left));
    const rightRgb = this.hexToRgb(this.normalizeBadgeColor(right));
    const ratio = this.clamp(amount, 0, 1);
    const mix = (a: number, b: number) => Math.round(a + ((b - a) * ratio));
    return `rgb(${mix(leftRgb.r, rightRgb.r)}, ${mix(leftRgb.g, rightRgb.g)}, ${mix(leftRgb.b, rightRgb.b)})`;
  }

  private hexToRgba(hex: string, alpha: number): string {
    const rgb = this.hexToRgb(this.normalizeBadgeColor(hex));
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${this.clamp(alpha, 0, 1)})`;
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const normalized = this.normalizeBadgeColor(hex).slice(1);
    return {
      r: Number.parseInt(normalized.slice(0, 2), 16),
      g: Number.parseInt(normalized.slice(2, 4), 16),
      b: Number.parseInt(normalized.slice(4, 6), 16)
    };
  }

  private getCssColorVariable(name: string, fallback: string): string {
    const value = getComputedStyle(this.container).getPropertyValue(name).trim();
    return value || fallback;
  }

  private getCssNumberVariable(name: string, fallback: number): number {
    const fromBody = Number.parseFloat(getComputedStyle(document.body).getPropertyValue(name).trim());
    if (Number.isFinite(fromBody)) {
      return fromBody > 1 && fromBody <= 100 ? fromBody / 100 : fromBody;
    }
    const fromContainer = Number.parseFloat(getComputedStyle(this.container).getPropertyValue(name).trim());
    if (Number.isFinite(fromContainer)) {
      return fromContainer > 1 && fromContainer <= 100 ? fromContainer / 100 : fromContainer;
    }
    return fallback;
  }

  private getGraphLensBodyOpacity(): number {
    return this.clamp(this.getCssNumberVariable("--o3-graph-lens-opacity", 0.9), 0, 1);
  }

  private fillGraphBackground(): void {
    if (!this.graphBackgroundColor) return;
    this.ctx.save();
    this.ctx.fillStyle = this.graphBackgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }

  private cssColorWithAlpha(color: string, alpha: number): string {
    const normalizedAlpha = this.clamp(alpha, 0, 1);
    const trimmed = String(color ?? "").trim();
    if (!trimmed) return `rgba(0, 0, 0, ${normalizedAlpha})`;
    if (trimmed.startsWith("#")) {
      return this.hexToRgba(trimmed, normalizedAlpha);
    }
    if (/^rgb\(/i.test(trimmed)) {
      return trimmed.replace(/^rgb\((.+)\)$/i, `rgba($1, ${normalizedAlpha})`);
    }
    return trimmed;
  }

  private darkenCssColor(color: string, amount: number): string {
    const trimmed = String(color ?? "").trim();
    if (!trimmed) return trimmed;
    const ratio = this.clamp(amount, 0, 0.75);
    if (trimmed.startsWith("#")) {
      return this.mixHexColors(trimmed, "#000000", ratio);
    }
    const rgbMatch = trimmed.match(/^rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)(?:,\s*([\d.]+))?\)$/i);
    if (!rgbMatch) return trimmed;
    const r = Math.round(Number(rgbMatch[1]) * (1 - ratio));
    const g = Math.round(Number(rgbMatch[2]) * (1 - ratio));
    const b = Math.round(Number(rgbMatch[3]) * (1 - ratio));
    return rgbMatch[4] === undefined
      ? `rgb(${r}, ${g}, ${b})`
      : `rgba(${r}, ${g}, ${b}, ${this.clamp(Number(rgbMatch[4]), 0, 1)})`;
  }

  private getGraphLensColors(container: EmbeddedGraphContainerState): {
    fill: string;
    border: string;
    titleBar: string;
    text: string;
    connector: string;
    buttonFill: string;
    buttonBorder: string;
    buttonIcon: string;
  } {
    const depth = Math.max(0, container.ancestry.length);
    const darken = this.clamp(depth * 0.12, 0, 0.48);
    const baseFill = this.darkenCssColor(this.getCssColorVariable("--o3-graph-lens-fill", "#24324a"), darken);
    const baseBorder = this.darkenCssColor(this.getCssColorVariable("--o3-graph-lens-border", "#88a6ff"), darken * 0.75);
    if (container.colorSource !== "default") {
      const readableAccentText = this.getReadableTextColor(container.color);
      return {
        fill: baseFill,
        border: baseBorder,
        titleBar: container.color,
        text: readableAccentText,
        connector: container.color,
        buttonFill: container.color,
        buttonBorder: readableAccentText,
        buttonIcon: readableAccentText
      };
    }
    return {
      fill: baseFill,
      border: baseBorder,
      titleBar: this.darkenCssColor(this.getCssColorVariable("--o3-graph-lens-titlebar", "#2f4270"), darken),
      text: this.getCssColorVariable("--o3-graph-lens-text", "#ffffff"),
      connector: this.darkenCssColor(this.getCssColorVariable("--o3-graph-lens-connector", "#88a6ff"), darken * 0.75),
      buttonFill: this.darkenCssColor(this.getCssColorVariable("--o3-graph-lens-button-fill", "#3f5590"), darken),
      buttonBorder: this.darkenCssColor(this.getCssColorVariable("--o3-graph-lens-button-border", "#c8d6ff"), darken * 0.55),
      buttonIcon: this.getCssColorVariable("--o3-graph-lens-button-icon", "#ffffff")
    };
  }

  private doBadgeRectsOverlap(
    a: { left: number; top: number; right: number; bottom: number },
    b: { left: number; top: number; right: number; bottom: number },
    padding = 4
  ): boolean {
    return !(
      a.right + padding <= b.left
      || b.right + padding <= a.left
      || a.bottom + padding <= b.top
      || b.bottom + padding <= a.top
    );
  }

  private positionNodeBadgeAnchor(
    anchor: HTMLElement,
    badgeEl: HTMLElement,
    desiredX: number,
    desiredY: number,
    occupiedRects: Array<{ left: number; top: number; right: number; bottom: number }>
  ): void {
    const width = Math.max(1, badgeEl.offsetWidth);
    const height = Math.max(1, badgeEl.offsetHeight);
    const xStep = Math.max(6, Math.round(width * 0.2));
    const yStep = Math.max(6, Math.round(height * 0.65));

    const candidates: Array<{ x: number; y: number }> = [{ x: desiredX, y: desiredY }];
    for (let layer = 1; layer <= 4; layer++) {
      const dx = layer * xStep;
      const dy = layer * yStep;
      candidates.push({ x: desiredX + dx, y: desiredY });
      candidates.push({ x: desiredX + dx, y: desiredY - dy });
      candidates.push({ x: desiredX, y: desiredY - dy });
      candidates.push({ x: desiredX - dx, y: desiredY - dy });
      candidates.push({ x: desiredX - dx, y: desiredY });
      candidates.push({ x: desiredX - dx, y: desiredY + dy });
      candidates.push({ x: desiredX, y: desiredY + dy });
      candidates.push({ x: desiredX + dx, y: desiredY + dy });
    }

    let chosen = candidates[0];
    for (const candidate of candidates) {
      const rect = {
        left: candidate.x,
        top: candidate.y,
        right: candidate.x + width,
        bottom: candidate.y + height
      };
      const collides = occupiedRects.some((existing) => this.doBadgeRectsOverlap(existing, rect));
      if (!collides) {
        chosen = candidate;
        break;
      }
    }

    setStyle(anchor, "left", `${chosen.x}px`);
    setStyle(anchor, "top", `${chosen.y}px`);
    occupiedRects.push({
      left: chosen.x,
      top: chosen.y,
      right: chosen.x + width,
      bottom: chosen.y + height
    });
  }

  private buildExpandedParentRequestKey(origin: string, linkType: string): string {
    return `${origin}::${linkType}`;
  }

  private normalizeLinkTypeSemantic(role: unknown): "link" | "parent" {
    return role === "parent" ? "parent" : "link";
  }

  private normalizeLinkTypePhysicsConfig(raw: unknown): LinkTypePhysicsConfig {
    const out: LinkTypePhysicsConfig = {};
    if (!raw || typeof raw !== "object") {
      return out;
    }

    const obj = raw as Record<string, unknown>;
    const preferredDistance = Number(obj.preferredDistance);
    const strength = Number(obj.strength);
    if (Number.isFinite(preferredDistance)) {
      out.preferredDistance = preferredDistance;
    }
    if (Number.isFinite(strength)) {
      out.strength = strength;
    }
    return out;
  }

  private normalizeDirectionPlacement(raw: unknown): DirectionPlacement {
    const normalized = String(raw ?? "").trim().toLowerCase();
    if (normalized === "left" || normalized === "up" || normalized === "down") {
      return normalized;
    }
    return "right";
  }

  private positionKey(x: number, y: number): string {
    const rx = Math.round(Number(x) * 1000) / 1000;
    const ry = Math.round(Number(y) * 1000) / 1000;
    return `${rx},${ry}`;
  }

  private normalizeSelectedTypes() {
    const before = Array.from(this.selectedLinkTypes).sort().join("|");

    const after = Array.from(this.selectedLinkTypes).sort().join("|");
    if (before !== after) {
      this.emitSelectedTypes();
    }
  }

  private emitSelectedTypes() {
    this.menuOptions.onSelectedLinkTypesChange?.(Array.from(this.selectedLinkTypes));
  }

  private emitLinkTypeSemantics() {
    const snapshot: Record<string, "link" | "parent"> = {};
    for (const [type, role] of this.linkTypeSemantics.entries()) {
      snapshot[type] = role;
    }
    this.menuOptions.onLinkTypeSemanticsChange?.(snapshot);
  }

  private emitLinkTypePhysics() {
    const snapshot: Record<string, LinkTypePhysicsConfig> = {};
    for (const [type, config] of this.linkTypePhysics.entries()) {
      const normalized = this.normalizeLinkTypePhysicsConfig(config);
      if (
        !Number.isFinite(normalized.preferredDistance) &&
        !Number.isFinite(normalized.strength)
      ) {
        continue;
      }
      snapshot[type] = normalized;
    }
    this.menuOptions.onLinkTypePhysicsChange?.(snapshot);
  }

  private emitGroupingRules() {
    this.menuOptions.onGroupingRulesChange?.(this.groupingRules.map(rule => ({ ...rule })));
  }

  setGroupingRules(rules: GroupingRule[]): void {
    this.groupingRules = this.normalizeGroupingRules(rules);
    if (this.settingsOpen) {
      this.buildSettingsMenu();
    }
    this.updateNodeColors();
    this.updateEmbeddedContainerInheritedColors();
  }

  setGroupingPropertyOptions(properties: string[]): void {
    this.groupingPropertyOptions = this.normalizeGroupingPropertyOptions(properties);
    if (this.settingsOpen) {
      this.buildSettingsMenu();
    }
  }

  updateNodeColors(nodeIds?: string[]): void {
    const evaluator = this.menuOptions.groupingEvaluator;
    if (!evaluator) {
      if (nodeIds && nodeIds.length > 0) {
        for (const id of nodeIds) {
          this.nodeFillColors.delete(String(id ?? "").trim());
        }
      } else {
        this.nodeFillColors.clear();
      }
      this.requestRender();
      return;
    }

    if (Array.isArray(nodeIds) && nodeIds.length > 0) {
      for (const rawId of nodeIds) {
        const id = String(rawId ?? "").trim();
        if (!id || !this.nodeMap.has(id)) continue;
        this.nodeFillColors.set(id, evaluator(this.getSourcePathForNodeId(id)));
      }
      this.requestRender();
      return;
    }

    for (const node of this.nodes) {
      this.nodeFillColors.set(node.id, evaluator(node.sourcePath));
    }
    this.requestRender();
  }

  private getLinkTypePhysicsConfig(type: string): LinkTypePhysicsConfig {
    const normalizedType = this.normalizeLinkType(type);
    if (!normalizedType) return {};
    return this.normalizeLinkTypePhysicsConfig(this.linkTypePhysics.get(normalizedType));
  }

  private getEdgePhysics(edge: Edge): { preferredDistance: number; strength: number } {
    const physicsKey = this.normalizeLinkType(edge.linkType ?? edge.type);
    const fileConfig = this.activeLinkTypePhysicsByProperty.get(physicsKey);
    const config = this.getLinkTypePhysicsConfig(physicsKey);
    return {
      preferredDistance: this.clamp(
        Number.isFinite(fileConfig?.preferredDistance)
          ? Number(fileConfig?.preferredDistance)
          : (Number.isFinite(config.preferredDistance) ? Number(config.preferredDistance) : this.linkDistance),
        20,
        800
      ),
      strength: this.clamp(
        Number.isFinite(fileConfig?.strength)
          ? Number(fileConfig?.strength)
          : (Number.isFinite(config.strength) ? Number(config.strength) : this.linkStrength),
        0.001,
        0.3
      )
    };
  }

  reheatSimulation(amount = 0.15, _reason?: string): void {
    const magnitude = Math.max(0, Number.isFinite(amount) ? amount : 0.15);
    if (magnitude <= 0) return;
    this.startSimulation();
  }

  private getParentSemanticLinkTypes(): string[] {
    return Array.from(this.availableLinkTypes)
      .map(type => this.normalizeLinkType(type))
      .filter(type => type.length > 0)
      .filter(type => this.getLinkTypeSemantic(type) === "parent")
      .sort((a, b) => a.localeCompare(b));
  }

  private refreshNodeBadgeDefinitions(): void {
    this.nodeParentBadgeTypes.clear();
    const activeParentTypes = this.activeNodeBadgeLinkTypes
      .map(linkType => this.normalizeLinkType(String(linkType.property ?? "")))
      .filter(type => type.length > 0)
      .filter(type => this.getLinkTypeSemantic(type) === "parent");
    const availableParentTypes = new Set(activeParentTypes.length > 0
      ? activeParentTypes
      : Array.from(this.availableLinkTypes)
        .map(type => this.normalizeLinkType(type))
        .filter(type => type.length > 0)
        .filter(type => this.getLinkTypeSemantic(type) === "parent"));

    if (availableParentTypes.size === 0) {
      this.badgesDirty = false;
      return;
    }

    const badgeTypes = Array.from(availableParentTypes).sort((a, b) => a.localeCompare(b));
    for (const node of this.nodes) {
      const sourcePath = String(node.sourcePath ?? "").trim();
      if (!sourcePath) continue;
      this.nodeParentBadgeTypes.set(node.id, badgeTypes);
    }

    this.badgesDirty = false;
  }

  private setBadgeButtonVisualState(button: HTMLButtonElement, nodeId: string, linkType: string): void {
    const active = this.isParentExpansionActive(nodeId, linkType);
    const sourcePath = this.getSourcePathForNodeId(nodeId) ?? nodeId;
    const linkTypeConfig = this.activeNodeBadgeLinkTypes.find((candidate) =>
      this.normalizeLinkType(String(candidate.property ?? "")) === this.normalizeLinkType(linkType)
    );
    const hasYamlLinks = this.hasBadgeYamlLinks(sourcePath, linkType);
    const baseColor = this.getBadgeBaseColor(linkType, linkTypeConfig?.color);
    const background = hasYamlLinks
      ? (active
        ? this.mixHexColors(baseColor, "#ffffff", 0.18)
        : this.mixHexColors(baseColor, "#000000", 0.28))
      : (active
        ? this.hexToRgba(this.mixHexColors(baseColor, "#ffffff", 0.12), 0.58)
        : this.hexToRgba(this.mixHexColors(baseColor, "#000000", 0.32), 0.42));
    button.textContent = `${active ? "-" : "+"} ${linkType}`;
    button.title = `${active ? "Collapse" : "Expand"} ${linkType}${hasYamlLinks ? "" : " (no YAML links)"}`;
    button.setAttribute("aria-label", button.title);
    button.dataset.o3BadgePopulated = hasYamlLinks ? "true" : "false";
    setStyle(button, "background", background);
    setStyle(button, "color", this.getBadgeTextColor(baseColor, hasYamlLinks || active ? 1 : 0.86));
    setStyle(button, "border", `1px solid ${hasYamlLinks || active ? baseColor : this.hexToRgba(baseColor, 0.5)}`);
    setStyle(button, "boxShadow", active
      ? (hasYamlLinks
        ? `0 0 0 1px ${this.hexToRgba(baseColor, 0.28)}, 0 2px 10px ${this.hexToRgba(baseColor, 0.32)}`
        : `0 0 0 1px ${this.hexToRgba(baseColor, 0.14)}, 0 2px 8px rgba(0,0,0,0.18)`)
      : `0 2px 8px rgba(0,0,0,0.25), inset 0 0 0 1px ${this.hexToRgba(baseColor, 0.12)}`);
    setStyle(button, "opacity", hasYamlLinks ? "1" : "0.72");
    setStyle(button, "padding", "0 8px");
    setStyle(button, "height", "18px");
    setStyle(button, "minHeight", "18px");
    setStyle(button, "fontSize", "10px");
    setStyle(button, "lineHeight", "16px");
  }

  private clearCollapsePreview(): void {
    if (this.collapsePreviewNodeIds.size === 0) return;
    this.collapsePreviewNodeIds.clear();
  }

  private computeCollapsePreviewNodeIds(originPath: string, linkType: string): Set<string> {
    const normalizedOrigin = String(originPath ?? "").trim();
    const normalizedLinkType = this.normalizeLinkType(linkType);
    const preview = new Set<string>();
    if (!normalizedOrigin || !normalizedLinkType) return preview;

    const workingEdges = this.edges.map(edge => ({ ...edge }));
    const workingNodeRefs = new Map<string, Array<NonNullable<GraphNode["expandedVia"]>[number]>>();
    for (const node of this.nodes) {
      workingNodeRefs.set(node.id, [...(node.expandedVia ?? [])]);
    }
    const workingRequests = new Map<string, { origin: string; linkType: string }>(this.expandedParentRequests);
    const collapsedKeys = new Set<string>();

    const collapseByOriginAndLinkType = (sourceOrigin: string, sourceLinkType: string) => {
      const collapseKey = this.buildExpandedParentRequestKey(sourceOrigin, sourceLinkType);
      if (collapsedKeys.has(collapseKey)) return;
      collapsedKeys.add(collapseKey);
      workingRequests.delete(collapseKey);

      const matchingEdges = workingEdges.filter(edge =>
        edge.relationship === "parent"
        && edge.origin === sourceOrigin
        && edge.linkType === sourceLinkType
      );
      if (matchingEdges.length === 0) return;

      const edgeKeysToRemove = new Set(
        matchingEdges.map(edge => this.buildEdgeKey(edge.from, edge.to, edge.type, edge.linkType))
      );
      for (let i = workingEdges.length - 1; i >= 0; i--) {
        const edge = workingEdges[i];
        const edgeKey = this.buildEdgeKey(edge.from, edge.to, edge.type, edge.linkType);
        if (edgeKeysToRemove.has(edgeKey)) {
          workingEdges.splice(i, 1);
        }
      }

      const targetIds = new Set(matchingEdges.map(edge => edge.to));
      for (const targetId of targetIds) {
        const refs = (workingNodeRefs.get(targetId) ?? []).filter(ref =>
          !(ref.origin === sourceOrigin && ref.linkType === sourceLinkType && ref.type === "parent")
        );
        workingNodeRefs.set(targetId, refs);

        if (refs.length > 0) continue;
        if (this.baseNodeIds.has(targetId)) continue;

        const descendantRequests = Array.from(workingRequests.values())
          .filter(req => req.origin === targetId);
        for (const req of descendantRequests) {
          collapseByOriginAndLinkType(req.origin, req.linkType);
        }

        for (let i = workingEdges.length - 1; i >= 0; i--) {
          const edge = workingEdges[i];
          if (edge.from === targetId || edge.to === targetId) {
            workingEdges.splice(i, 1);
          }
        }

        preview.add(targetId);
        workingNodeRefs.delete(targetId);
      }
    };

    collapseByOriginAndLinkType(normalizedOrigin, normalizedLinkType);
    return preview;
  }

  private updateCollapsePreviewForBadge(nodeId: string, linkType: string): void {
    if (!this.isParentExpansionActive(nodeId, linkType)) {
      this.clearCollapsePreview();
      return;
    }
    this.collapsePreviewNodeIds = this.computeCollapsePreviewNodeIds(nodeId, linkType);
  }

  private ensureBadgeButton(node: GraphNode, linkType: string): HTMLButtonElement {
    const key = this.badgeKey(node.id, linkType);
    const existing = this.nodeBadgeButtons.get(key);
    if (existing) {
      this.setBadgeButtonVisualState(existing, node.id, linkType);
      return existing;
    }

    const button = this.createElement("button");
    button.type = "button";
    setStyle(button, "position", "absolute");
    setStyle(button, "transform", "translate(-50%, -50%)");
    setStyle(button, "pointerEvents", "auto");
    setStyle(button, "padding", "0 8px");
    setStyle(button, "borderRadius", "999px");
    setStyle(button, "display", "inline-flex");
    setStyle(button, "alignItems", "center");
    setStyle(button, "justifyContent", "center");
    setStyle(button, "fontWeight", "700");
    setStyle(button, "whiteSpace", "nowrap");
    setStyle(button, "cursor", "pointer");
    setStyle(button, "transition", "filter 80ms ease");
    button.addEventListener("mouseenter", () => {
      setStyle(button, "filter", "brightness(1.1)");
      this.updateCollapsePreviewForBadge(node.id, linkType);
    });
    button.addEventListener("mouseleave", () => {
      setStyle(button, "filter", "");
      this.clearCollapsePreview();
    });
    ["mousedown", "mouseup", "click"].forEach(evt => {
      button.addEventListener(evt, (e) => {
        e.stopPropagation();
        e.preventDefault();
      });
    });
    button.addEventListener("click", () => {
      this.clearCollapsePreview();
      const currentNode = this.nodeMap.get(node.id);
      if (!currentNode) return;
      this.triggerParentExpansion(currentNode, linkType);
    });

    this.setBadgeButtonVisualState(button, node.id, linkType);
    this.badgeOverlay.appendChild(button);
    this.nodeBadgeButtons.set(key, button);
    return button;
  }

  private renderPinIcon(node: GraphNode): HTMLButtonElement | null {
    if (!this.badgeOverlay) return null;
    const existing = this.nodePinButtons.get(node.id);
    if (existing) {
      node.pinButton = existing;
      return existing;
    }

    const pin = this.createElement("button");
    pin.type = "button";
    pin.textContent = "📌";
    pin.title = "Unpin node";
    setStyle(pin, "position", "absolute");
    setStyle(pin, "transform", "translate(-50%, -50%)");
    setStyle(pin, "pointerEvents", "auto");
    setStyle(pin, "cursor", "pointer");
    setStyle(pin, "fontSize", "12px");
    setStyle(pin, "lineHeight", "1");
    setStyle(pin, "width", "18px");
    setStyle(pin, "height", "18px");
    setStyle(pin, "padding", "0");
    setStyle(pin, "border", "none");
    setStyle(pin, "borderRadius", "999px");
    setStyle(pin, "background", "var(--background-primary)");
    setStyle(pin, "boxShadow", "0 1px 4px rgba(0,0,0,0.3)");
    setStyle(pin, "display", "block");
    ["mousedown", "mouseup", "click"].forEach(evt => {
      pin.addEventListener(evt, (e) => {
        e.stopPropagation();
        e.preventDefault();
      });
    });
    pin.addEventListener("click", () => {
      const currentNode = this.nodeMap.get(node.id);
      if (!currentNode) return;
      this.unpinNode(currentNode);
    });

    this.badgeOverlay.appendChild(pin);
    this.nodePinButtons.set(node.id, pin);
    node.pinButton = pin;
    return pin;
  }

  private positionPinIcon(node: GraphNode): void {
    const pin = this.renderPinIcon(node);
    if (!pin) return;

    const renderedCenter = this.getRenderedNodeCenter(node);
    const sx = (renderedCenter.x + this.camera.x) * this.camera.zoom;
    const sy = (renderedCenter.y + this.camera.y) * this.camera.zoom;
    const radius = this.getRenderedNodeRadius(node) * this.camera.zoom;
    setStyle(pin, "left", `${sx + radius + 7}px`);
    setStyle(pin, "top", `${sy - radius - 7}px`);
    setStyle(pin, "display", "block");
  }

  private removePinIcon(node: GraphNode): void {
    const pin = node.pinButton ?? this.nodePinButtons.get(node.id);
    if (!pin) return;
    pin.remove();
    this.nodePinButtons.delete(node.id);
    node.pinButton = null;
  }

  private renderLensIcon(node: GraphNode): HTMLButtonElement | null {
    if (!this.badgeOverlay) return null;
    const existing = this.nodeLensButtons.get(node.id);
    if (existing) {
      node.lensButton = existing;
      return existing;
    }

    const button = this.createElement("button");
    button.type = "button";
    button.className = "o3-node-lens-button";
    button.textContent = "⌕";
    setStyle(button, "position", "absolute");
    setStyle(button, "transform", "translate(-50%, -50%)");
    setStyle(button, "pointerEvents", "auto");
    setStyle(button, "cursor", "pointer");
    setStyle(button, "fontSize", "14px");
    setStyle(button, "lineHeight", "1");
    setStyle(button, "width", "18px");
    setStyle(button, "height", "18px");
    setStyle(button, "padding", "0");
    setStyle(button, "borderRadius", "999px");
    setStyle(button, "boxShadow", "0 1px 4px rgba(0,0,0,0.3)");
    setStyle(button, "display", "block");
    setStyle(button, "fontWeight", "700");
    button.addEventListener("mousedown", (event) => {
      event.stopPropagation();
      event.preventDefault();
      if (event.button !== 0) return;
      const currentNode = this.nodeMap.get(node.id);
      if (!currentNode) return;
      void this.toggleEmbeddedGraph(currentNode.id);
    });
    ["mouseup", "click", "dblclick"].forEach(evt => {
      button.addEventListener(evt, (event) => {
        event.stopPropagation();
        event.preventDefault();
      });
    });

    this.badgeOverlay.appendChild(button);
    this.nodeLensButtons.set(node.id, button);
    node.lensButton = button;
    return button;
  }

  private positionLensIcon(node: GraphNode): void {
    const button = this.renderLensIcon(node);
    if (!button) return;

    const expanded = this.isEmbeddedGraphExpanded(node.id, node.sourcePath);
    const renderedCenter = this.getRenderedNodeCenter(node);
    const sx = (renderedCenter.x + this.camera.x) * this.camera.zoom;
    const sy = (renderedCenter.y + this.camera.y) * this.camera.zoom;
    const radius = this.getRenderedNodeRadius(node) * this.camera.zoom;
    const iconWorldX = renderedCenter.x - ((radius + 7) / Math.max(0.001, this.camera.zoom));
    const iconWorldY = renderedCenter.y - ((radius + 7) / Math.max(0.001, this.camera.zoom));
    if (
      !this.isRenderedPointInsideNodeLens(node, renderedCenter.x, renderedCenter.y)
      || !this.isRenderedPointInsideNodeLens(node, iconWorldX, iconWorldY)
      || this.isRenderedPointCoveredByOtherGraphLens(node, renderedCenter.x, renderedCenter.y)
      || this.isRenderedPointCoveredByOtherGraphLens(node, iconWorldX, iconWorldY)
    ) {
      setStyle(button, "display", "none");
      return;
    }
    button.title = expanded ? "Close graph lens" : "Open graph lens";
    button.setAttribute("aria-label", button.title);
    setStyle(button, "left", `${sx - radius - 7}px`);
    setStyle(button, "top", `${sy - radius - 7}px`);
    setStyle(button, "border", expanded
      ? "1px solid var(--interactive-accent)"
      : "1px solid var(--background-modifier-border)");
    setStyle(button, "background", expanded ? "var(--interactive-accent)" : "var(--background-primary)");
    setStyle(button, "color", expanded ? "var(--text-on-accent)" : "var(--text-muted)");
    setStyle(button, "display", "block");
  }

  private isRenderedPointInsideNodeLens(node: GraphNode, x: number, y: number): boolean {
    const container = this.getEmbeddedClipContainerForNode(node);
    if (!container) return true;
    const bounds = this.getGraphLensBounds(container);
    return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
  }

  private isRenderedPointCoveredByOtherGraphLens(node: GraphNode, x: number, y: number): boolean {
    const ownContainer = this.getEmbeddedClipContainerForNode(node);
    return this.getGraphLensCoverAlphaAtPoint(x, y, ownContainer) < 0.999;
  }

  private removeLensIcon(node: GraphNode): void {
    const button = node.lensButton ?? this.nodeLensButtons.get(node.id);
    if (!button) return;
    button.remove();
    this.nodeLensButtons.delete(node.id);
    node.lensButton = null;
  }

  private pinNode(node: GraphNode, options?: { persist?: boolean }): void {
    const x = Number.isFinite(node.x) ? node.x : 0;
    const y = Number.isFinite(node.y) ? node.y : 0;

    node.x = x;
    node.y = y;
    node.fx = x;
    node.fy = y;
    node.vx = 0;
    node.vy = 0;
    node.isPinned = true;
    node.isLocked = true;
    node.lockX = x;
    node.lockY = y;
    this.pinnedNodePaths.add(node.id);
    this.positionPinIcon(node);

    if (options?.persist !== false) {
      this.emitNodePositionChanged(node, x, y, true);
    }
  }

  private unpinNode(
    node: GraphNode,
    options?: { persist?: boolean; restartSimulation?: boolean }
  ): void {
    delete node.fx;
    delete node.fy;
    node.isPinned = false;
    node.isLocked = false;
    delete node.lockX;
    delete node.lockY;
    this.pinnedNodePaths.delete(node.id);
    this.removePinIcon(node);

    if (options?.persist !== false) {
      this.emitNodePositionChanged(node, undefined, undefined, false);
    }

    if (options?.restartSimulation !== false) {
      this.reheatSimulation(0.3, "node unpin");
    }
  }

  private syncPinnedNodeIcons(): void {
    if (!this.badgeOverlay) return;

    const neededNodeIds = new Set<string>();
    for (const node of this.nodes) {
      if (!node.isPinned) continue;
      neededNodeIds.add(node.id);
      this.positionPinIcon(node);
    }

    for (const [nodeId, button] of Array.from(this.nodePinButtons.entries())) {
      if (neededNodeIds.has(nodeId)) continue;
      button.remove();
      this.nodePinButtons.delete(nodeId);
    }
  }

  private syncLensNodeIcons(): void {
    if (!this.badgeOverlay) return;

    const neededNodeIds = new Set<string>();
    for (const node of this.nodes) {
      if (!this.menuOptions.isGraphNote?.(node.sourcePath)) {
        this.removeLensIcon(node);
        continue;
      }
      neededNodeIds.add(node.id);
      this.positionLensIcon(node);
    }

    for (const [nodeId, button] of Array.from(this.nodeLensButtons.entries())) {
      if (neededNodeIds.has(nodeId)) continue;
      button.remove();
      this.nodeLensButtons.delete(nodeId);
    }
  }

  private getEffectiveNodeRadius(node: GraphNode): number {
    const frontmatterSize = this.getFrontmatterNodeSize(node);
    if (frontmatterSize !== null) {
      return frontmatterSize;
    }

    const multiplier = Number.isFinite(this.nodeConnectionSizeMultiplier)
      ? Math.max(0, this.nodeConnectionSizeMultiplier)
      : 0;
    if (multiplier <= 0) {
      return this.nodeRadius;
    }

    const connectionCount = this.getNodeConnectionCount(node);
    const maxRadius = Math.max(this.nodeRadius, 96);
    return this.clamp(this.nodeRadius + (connectionCount * multiplier), this.nodeRadius, maxRadius);
  }

  private getEmbeddedNodeVisualScale(node: GraphNode): number {
    if (!node.embeddedInstanceId) return 1;
    const nestingDepth = Math.max(1, node.embeddedAncestry?.length ?? 1);
    return this.clamp(0.38 * Math.pow(0.72, nestingDepth - 1), 0.18, 0.42);
  }

  private getRenderedNodeRadius(node: GraphNode): number {
    if (node.embeddedInstanceId) {
      const container = this.embeddedGraphContainers.get(node.embeddedInstanceId);
      if (container) {
        return this.getEffectiveNodeRadius(node) * this.getEmbeddedContainerRenderTransform(container).scale;
      }
    }
    return this.getEffectiveNodeRadius(node) * this.getEmbeddedNodeVisualScale(node);
  }

  private getEmbeddedLabelFontSize(node: GraphNode): number {
    if (!node.embeddedInstanceId) return 12;
    const container = this.embeddedGraphContainers.get(node.embeddedInstanceId);
    const scale = container
      ? this.getEmbeddedContainerRenderTransform(container).scale
      : this.getEmbeddedNodeVisualScale(node);
    return Math.max(6, 11 * this.camera.zoom * scale);
  }

  private getFrontmatterNodeSize(node: GraphNode): number | null {
    const file = this.app.vault.getAbstractFileByPath(node.sourcePath);
    if (!(file instanceof TFile)) return null;
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter) return null;
    const raw = readFrontmatterPropertyByKey(frontmatter, this.graphPropertyKeys, "nodeIndividualSize");
    const size = Number(raw);
    if (!Number.isFinite(size) || !Number.isInteger(size) || size <= 0) return null;
    return this.clamp(size, 3, 120);
  }

  private getFrontmatterGraphIcon(node: GraphNode): GraphIconRender | null {
    const file = this.app.vault.getAbstractFileByPath(node.sourcePath);
    if (!(file instanceof TFile)) return null;
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter) return null;
    const raw = readFrontmatterPropertyByKey(frontmatter, this.graphPropertyKeys, "graphIcon");
    if (typeof raw !== "string") return null;
    const value = raw.trim();
    if (!value) return null;

    const imageFile = this.resolveGraphIconImageFile(value, file.path);
    if (imageFile) {
      return { kind: "image", file: imageFile };
    }
    return { kind: "text", text: value.slice(0, 8) };
  }

  private getNodeIcon(node: GraphNode): GraphIconRender | null {
    if (!this.showNodeIcons) return null;
    const explicitIcon = this.getFrontmatterGraphIcon(node);
    if (explicitIcon) return explicitIcon;

    const groupStyle = this.menuOptions.groupingStyleEvaluator?.(node.sourcePath);
    const value = String(groupStyle?.icon ?? "").trim();
    if (!value) return null;
    const sourcePath = String(groupStyle?.iconSourcePath ?? node.sourcePath).trim() || node.sourcePath;
    const imageFile = this.resolveGraphIconImageFile(value, sourcePath);
    if (imageFile) {
      return { kind: "image", file: imageFile, replaceNodeBody: true };
    }
    return { kind: "text", text: value.slice(0, 8), replaceNodeBody: true };
  }

  private resolveGraphIconImageFile(value: string, sourcePath: string): TFile | null {
    const candidates = extractInternalLinkCandidates(value);
    if (!candidates.includes(value)) {
      candidates.push(value);
    }

    for (const candidateRaw of candidates) {
      const candidate = String(candidateRaw ?? "").trim();
      if (!candidate) continue;
      const direct = this.app.vault.getAbstractFileByPath(candidate);
      const exportedExcalidrawImage = direct instanceof TFile
        ? this.resolveExcalidrawExportImageFile(direct)
        : null;
      if (exportedExcalidrawImage) return exportedExcalidrawImage;
      if (direct instanceof TFile && this.isGraphIconImagePath(direct.path)) {
        return direct;
      }
      const resolved = this.app.metadataCache.getFirstLinkpathDest(candidate, sourcePath);
      const resolvedExcalidrawImage = resolved instanceof TFile
        ? this.resolveExcalidrawExportImageFile(resolved)
        : null;
      if (resolvedExcalidrawImage) return resolvedExcalidrawImage;
      if (resolved instanceof TFile && this.isGraphIconImagePath(resolved.path)) {
        return resolved;
      }
    }

    return null;
  }

  private resolveExcalidrawExportImageFile(file: TFile): TFile | null {
    if (!/\.excalidraw\.md$/i.test(file.path)) return null;
    const basePath = file.path.replace(/\.excalidraw\.md$/i, "");
    for (const extension of ["svg", "png", "webp", "jpg", "jpeg"]) {
      const exported = this.app.vault.getAbstractFileByPath(`${basePath}.${extension}`);
      if (exported instanceof TFile) return exported;
    }
    return null;
  }

  private isGraphIconImagePath(path: string): boolean {
    return /\.(?:png|jpe?g|webp|gif|svg)$/i.test(String(path ?? "").trim());
  }

  private drawNodeIconText(
    icon: string,
    sx: number,
    sy: number,
    screenRadius: number,
    color: string,
    replaceNodeBody = false
  ): void {
    const fontSize = Math.max(13, Math.min(96, screenRadius * 1.45));
    this.ctx.save();
    if (replaceNodeBody) {
      this.drawNodeIconGroupColorRing(sx, sy, screenRadius, color);
    } else {
      this.drawNodeIconBackground(sx, sy, screenRadius, color);
    }
    this.ctx.globalAlpha *= this.iconOpacity;
    this.ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillStyle = color;
    this.ctx.fillText(icon, sx, sy + (fontSize * 0.03));
    this.ctx.restore();
  }

  private drawNodeIconImage(
    file: TFile,
    sx: number,
    sy: number,
    screenRadius: number,
    color: string,
    replaceNodeBody = false
  ): boolean {
    const entry = this.getGraphIconImage(file);
    if (!entry || entry.status !== "loaded") {
      return false;
    }

    const size = Math.max(12, screenRadius * (replaceNodeBody ? 1.3 : 1.55));
    this.ctx.save();
    if (replaceNodeBody) {
      this.drawNodeIconGroupColorRing(sx, sy, screenRadius, color);
    } else {
      this.drawNodeIconBackground(sx, sy, screenRadius, color);
    }
    this.ctx.globalAlpha *= this.iconOpacity;
    this.ctx.drawImage(entry.image, sx - size / 2, sy - size / 2, size, size);
    this.ctx.restore();
    return true;
  }

  private drawNodeIconBackground(sx: number, sy: number, screenRadius: number, color: string): void {
    this.ctx.beginPath();
    this.ctx.arc(sx, sy, screenRadius, 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.fill();
  }

  private drawNodeIconGroupColorRing(sx: number, sy: number, screenRadius: number, color: string): void {
    this.ctx.beginPath();
    this.ctx.arc(sx, sy, screenRadius, 0, Math.PI * 2);
    this.ctx.fillStyle = this.hexToRgba(color, 0.2);
    this.ctx.fill();
    this.ctx.strokeStyle = this.hexToRgba(color, 0.95);
    this.ctx.lineWidth = Math.max(1.5, screenRadius * 0.14);
    this.ctx.stroke();
  }

  private getGraphIconImage(file: TFile): GraphIconImageCacheEntry | null {
    const cached = this.graphIconImageCache.get(file.path);
    if (cached) return cached;

    const image = new Image();
    const entry: GraphIconImageCacheEntry = { status: "loading", image };
    this.graphIconImageCache.set(file.path, entry);
    image.onload = () => {
      entry.status = "loaded";
      this.requestRender();
    };
    image.onerror = () => {
      entry.status = "error";
    };
    image.src = this.app.vault.getResourcePath(file);
    return entry;
  }

  private readFrontmatterValueCaseInsensitive(frontmatter: Record<string, unknown>, property: string): unknown {
    const normalized = String(property ?? "").trim().toLowerCase();
    if (!normalized) return undefined;
    for (const [key, value] of Object.entries(frontmatter)) {
      if (String(key ?? "").trim().toLowerCase() === normalized) {
        return value;
      }
    }
    return undefined;
  }

  private getNodeConnectionCount(node: GraphNode): number {
    this.refreshNodeConnectionCountsIfNeeded();
    return this.nodeConnectionCountCache.get(node.id) ?? 0;
  }

  private getNodeRenderOpacity(node: GraphNode): number {
    if (node.isMissingFile) return Math.min(this.subnodeOpacity, 0.42);
    return node.depth > 0 ? this.subnodeOpacity : 1;
  }

  private refreshNodeConnectionCountsIfNeeded(): void {
    if (!this.nodeConnectionCountsDirty) return;
    this.nodeConnectionCountCache.clear();
    for (const node of this.nodes) {
      this.nodeConnectionCountCache.set(node.id, 0);
    }

    const runtimeIdsBySource = new Map<string, Set<string>>();
    for (const node of this.nodes) {
      const sourcePath = String(node.sourcePath ?? "").trim();
      if (!sourcePath) continue;
      if (!runtimeIdsBySource.has(sourcePath)) {
        runtimeIdsBySource.set(sourcePath, new Set<string>());
      }
      runtimeIdsBySource.get(sourcePath)!.add(node.id);
    }

    const add = (id: string) => {
      const node = this.nodeMap.get(id);
      if (node) {
        this.nodeConnectionCountCache.set(node.id, (this.nodeConnectionCountCache.get(node.id) ?? 0) + 1);
        return;
      }
      const sourcePath = this.getSourcePathForNodeId(id);
      if (!sourcePath) return;
      for (const runtimeId of runtimeIdsBySource.get(sourcePath) ?? []) {
        this.nodeConnectionCountCache.set(runtimeId, (this.nodeConnectionCountCache.get(runtimeId) ?? 0) + 1);
      }
    };

    for (const edge of this.edges) {
      add(edge.from);
      add(edge.to);
    }
    this.nodeConnectionCountsDirty = false;
  }

  private shouldShowNodeBadges(node: GraphNode): boolean {
    if (this.marqueeSelection) return false;
    if (this.isDraggingNode && this.draggedNode) {
      if (this.draggedNodeOriginPositions.has(node.id) || node.id === this.draggedNode.id) return false;
      return this.showAllLinkTypeBadgesHeld || this.selectedNodeIds.has(node.id) || this.dragBadgeRevealNodeId === node.id;
    }
    return this.showAllLinkTypeBadgesHeld || this.selectedNodeIds.has(node.id);
  }

  private syncNodeBadges(): void {
    if (!this.badgeOverlay) return;
    if (this.badgesDirty) {
      this.refreshNodeBadgeDefinitions();
    }

    const neededKeys = new Set<string>();

    for (const node of this.nodes) {
      if (!this.shouldShowNodeBadges(node)) continue;
      const badgeTypes = this.nodeParentBadgeTypes.get(node.id) ?? [];
      if (badgeTypes.length === 0) continue;

      const embeddedContainer = this.getExpandedEmbeddedContainerForOrigin(node.id);
      const renderedCenter = this.getRenderedNodeCenter(node);
      const useLensFrameAnchor = Boolean(embeddedContainer && !node.embeddedInstanceId);
      const sx = useLensFrameAnchor
        ? (embeddedContainer.right + this.camera.x) * this.camera.zoom
        : (renderedCenter.x + this.camera.x) * this.camera.zoom;
      const sy = useLensFrameAnchor
        ? (embeddedContainer.top + this.camera.y) * this.camera.zoom
        : (renderedCenter.y + this.camera.y) * this.camera.zoom;
      const count = badgeTypes.length;
      const baseRadius = (this.getRenderedNodeRadius(node) * this.camera.zoom) + 28;
      const orbitRadius = Math.max(24, baseRadius + (count * 10));
      const angleStep = (Math.PI * 2) / count;

      for (let i = 0; i < count; i++) {
        const linkType = badgeTypes[i];
        const angle = (-Math.PI / 2) + (i * angleStep);
        const x = sx + (Math.cos(angle) * orbitRadius);
        const y = sy + (Math.sin(angle) * orbitRadius);
        const key = this.badgeKey(node.id, linkType);
        neededKeys.add(key);

        const button = this.ensureBadgeButton(node, linkType);
        setStyle(button, "width", "auto");
        setStyle(button, "minWidth", "unset");
        setStyle(button, "height", "18px");
        setStyle(button, "minHeight", "18px");
        setStyle(button, "fontSize", "10px");
        setStyle(button, "lineHeight", "16px");
        setStyle(button, "left", `${x}px`);
        setStyle(button, "top", `${y}px`);
        setStyle(button, "display", "block");
        this.setBadgeButtonVisualState(button, node.id, linkType);
      }
    }

    for (const [key, button] of Array.from(this.nodeBadgeButtons.entries())) {
      if (neededKeys.has(key)) continue;
      button.remove();
      this.nodeBadgeButtons.delete(key);
    }
  }

  private renderBadges(): void {
    if (!this.badgeOverlay) return;
    for (const button of this.nodeBadgeButtons.values()) {
      button.remove();
    }
    this.nodeBadgeButtons.clear();
    for (const element of Array.from(this.badgeOverlay.querySelectorAll(".o3-node-badge, .o3-node-badge-anchor, .o3-embedded-graph-badge"))) {
      element.remove();
    }

    for (const node of this.nodes) {
      if (!this.shouldShowNodeBadges(node)) continue;
      const occupiedRects: Array<{ left: number; top: number; right: number; bottom: number }> = [];
      const file = this.app.vault.getAbstractFileByPath(node.sourcePath);
      if (!(file instanceof TFile)) continue;

      const matchingLinkTypes = this.getBadgeLinkTypesForNode(node).filter((linkType) =>
        this.shouldRenderLinkTypeBadge(node, linkType)
      );

      const embeddedContainer = this.getExpandedEmbeddedContainerForOrigin(node.id);
      const renderedCenter = this.getRenderedNodeCenter(node);
      const useLensFrameAnchor = Boolean(embeddedContainer && !node.embeddedInstanceId);
      const sx = useLensFrameAnchor
        ? (embeddedContainer.right + this.camera.x) * this.camera.zoom
        : (renderedCenter.x + this.camera.x) * this.camera.zoom;
      const sy = useLensFrameAnchor
        ? (embeddedContainer.top + this.camera.y) * this.camera.zoom
        : (renderedCenter.y + this.camera.y) * this.camera.zoom;
      const radius = useLensFrameAnchor ? 0 : this.getRenderedNodeRadius(node) * this.camera.zoom;

      if (matchingLinkTypes.length === 0) continue;

      for (let i = 0; i < matchingLinkTypes.length; i++) {
        const linkType = matchingLinkTypes[i];
        const normalizedProperty = String(linkType.property ?? "").trim().toLowerCase();
        if (!normalizedProperty) continue;
        const hasYamlLinks = this.hasBadgeYamlLinks(node.sourcePath, normalizedProperty);
        const expansionKey = `${node.id}::${normalizedProperty}`;
        const badgeLabel = String(linkType.key ?? linkType.property ?? "").trim() || normalizedProperty;
        const desiredX = sx + radius + 4;
        const desiredY = sy - radius - 4 - (i * 14);
        const anchor = this.createElement("div");
        anchor.className = "o3-node-badge-anchor";
        anchor.dataset.o3ExpansionKey = expansionKey;
        setStyle(anchor, "position", "absolute");
        setStyle(anchor, "left", `${desiredX}px`);
        setStyle(anchor, "top", `${desiredY}px`);
        setStyle(anchor, "pointerEvents", "auto");
        this.badgeOverlay.appendChild(anchor);

        const badge = new O3NodeBadge(anchor, file, node.id, linkType, this.app, this);
        badge.render();
        const badgeEl = anchor.querySelector(".o3-node-badge") as HTMLElement | null;
        if (badgeEl) {
          badgeEl.dataset.o3ExpansionKey = expansionKey;
          this.setNodeBadgeVisualState(badgeEl, node.id, normalizedProperty, badgeLabel, {
            hasYamlLinks,
            color: linkType.color
          });
          this.positionNodeBadgeAnchor(anchor, badgeEl, desiredX, desiredY, occupiedRects);
        }
      }
    }
  }

  private shouldRenderLinkTypeBadge(node: GraphNode, linkType: O3LinkType): boolean {
    const property = this.normalizeLinkType(String(linkType.property ?? "").trim().toLowerCase());
    if (!property) return false;
    if (linkType.semantic !== "parent" || linkType.linkDiscoveryDirection !== "incoming") {
      return true;
    }
    if (this.showAllLinkTypeBadgesHeld || this.dragBadgeRevealNodeId === node.id) {
      return true;
    }
    return this.isParentExpansionActive(node.id, property)
      || this.hasBadgeYamlLinks(node.sourcePath, property);
  }

  private normalizeBadgeLinkTypeDefinitions(linkTypes: O3LinkType[]): O3LinkType[] {
    const out: O3LinkType[] = [];
    const seen = new Set<string>();
    for (const linkType of linkTypes ?? []) {
      if (!linkType) continue;
      const property = this.normalizeLinkType(String(linkType.property ?? ""));
      if (!property || seen.has(property)) continue;
      seen.add(property);
      out.push(linkType);
    }
    return out;
  }

  private mergeBadgeLinkTypeDefinitions(...groups: O3LinkType[][]): O3LinkType[] {
    return this.normalizeBadgeLinkTypeDefinitions(groups.flat());
  }

  private reapplyExpandedParentRequests(): void {
    if (this.expandedParentRequests.size === 0) return;
    for (const { origin, linkType } of this.expandedParentRequests.values()) {
      this.expandParentLinks(origin, linkType);
    }
  }

  isEmbeddedGraphExpanded(originNodeId: string, graphPath: string): boolean {
    return this.embeddedGraphContainers.has(this.embeddedGraphKey(originNodeId, graphPath));
  }

  private getExpandedEmbeddedContainerForOrigin(
    originNodeIdRaw: string
  ): EmbeddedGraphContainerState | null {
    const originNodeId = String(originNodeIdRaw ?? "").trim();
    if (!originNodeId) return null;
    return Array.from(this.embeddedGraphContainers.values())
      .find((container) => container.origin === originNodeId) ?? null;
  }

  private embeddedGraphContainersHasOrigin(originNodeIdRaw: string): boolean {
    return this.getExpandedEmbeddedContainerForOrigin(originNodeIdRaw) !== null;
  }

  private getEmbeddedContainerRawBounds(container: EmbeddedGraphContainerState): {
    centerX: number;
    centerY: number;
    width: number;
    height: number;
  } {
    const members = Array.from(container.memberIds)
      .map((id) => this.nodeMap.get(id))
      .filter((node): node is GraphNode => Boolean(node));
    if (members.length === 0) {
      return {
        centerX: (container.left + container.right) / 2,
        centerY: (container.top + container.bottom) / 2,
        width: Math.max(1, container.right - container.left),
        height: Math.max(1, container.bottom - container.top)
      };
    }
    const anchorX = Number.isFinite(container.sourceCenterX)
      ? container.sourceCenterX
      : (container.left + container.right) / 2;
    const anchorY = Number.isFinite(container.sourceCenterY)
      ? container.sourceCenterY
      : (container.top + container.bottom) / 2;
    const padding = Math.max(this.nodeRadius * 1.8, 28);
    const objectBounds: Array<{ left: number; top: number; right: number; bottom: number }> = members.map((member) => ({
      left: member.x - this.getEffectiveNodeRadius(member),
      top: member.y - this.getEffectiveNodeRadius(member),
      right: member.x + this.getEffectiveNodeRadius(member),
      bottom: member.y + this.getEffectiveNodeRadius(member)
    }));
    for (const nested of this.parentContainers.values()) {
      if (nested.key === container.key) continue;
      const origin = this.nodeMap.get(nested.origin);
      if (!origin || origin.embeddedInstanceId !== container.key) continue;
      objectBounds.push({
        left: nested.left,
        top: nested.top,
        right: nested.right,
        bottom: nested.bottom
      });
    }
    const left = Math.min(...objectBounds.map((bounds) => bounds.left)) - padding;
    const top = Math.min(...objectBounds.map((bounds) => bounds.top)) - padding;
    const right = Math.max(...objectBounds.map((bounds) => bounds.right)) + padding;
    const bottom = Math.max(...objectBounds.map((bounds) => bounds.bottom)) + padding;
    const radiusX = Math.max(anchorX - left, right - anchorX, this.nodeRadius * 2);
    const radiusY = Math.max(anchorY - top, bottom - anchorY, this.nodeRadius * 2);
    return {
      centerX: anchorX,
      centerY: anchorY,
      width: Math.max(1, radiusX * 2),
      height: Math.max(1, radiusY * 2)
    };
  }

  private getEmbeddedContainerContentBounds(container: EmbeddedGraphContainerState): {
    centerX: number;
    centerY: number;
    width: number;
    height: number;
  } | null {
    const members = Array.from(container.memberIds)
      .map((id) => this.nodeMap.get(id))
      .filter((node): node is GraphNode => Boolean(node));
    if (members.length === 0) return null;
    const padding = Math.max(this.nodeRadius * 1.8, 28);
    const objectBounds: Array<{ left: number; top: number; right: number; bottom: number }> = members.map((member) => ({
      left: member.x - this.getEffectiveNodeRadius(member),
      top: member.y - this.getEffectiveNodeRadius(member),
      right: member.x + this.getEffectiveNodeRadius(member),
      bottom: member.y + this.getEffectiveNodeRadius(member)
    }));
    for (const nested of this.parentContainers.values()) {
      if (nested.key === container.key) continue;
      const origin = this.nodeMap.get(nested.origin);
      if (!origin || origin.embeddedInstanceId !== container.key) continue;
      objectBounds.push({
        left: nested.left,
        top: nested.top,
        right: nested.right,
        bottom: nested.bottom
      });
    }
    const left = Math.min(...objectBounds.map((bounds) => bounds.left)) - padding;
    const top = Math.min(...objectBounds.map((bounds) => bounds.top)) - padding;
    const right = Math.max(...objectBounds.map((bounds) => bounds.right)) + padding;
    const bottom = Math.max(...objectBounds.map((bounds) => bounds.bottom)) + padding;
    return {
      centerX: (left + right) / 2,
      centerY: (top + bottom) / 2,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top)
    };
  }

  private getEmbeddedContainerGravityCenter(container: EmbeddedGraphContainerState): { x: number; y: number } {
    return {
      x: (container.left + container.right) / 2,
      y: (container.top + container.bottom) / 2
    };
  }

  private getEmbeddedContainerRenderTransform(container: EmbeddedGraphContainerState): {
    sourceCenterX: number;
    sourceCenterY: number;
    targetCenterX: number;
    targetCenterY: number;
    scale: number;
  } {
    const bounds = this.getEmbeddedContainerRawBounds(container);
    const gravityCenter = this.getEmbeddedContainerGravityCenter(container);
    const lensBounds = this.getGraphLensBounds(container);
    const targetCenterX = (lensBounds.left + lensBounds.right) / 2;
    const targetCenterY = (lensBounds.top + lensBounds.bottom) / 2;
    const viewportWidth = Math.max(1, lensBounds.right - lensBounds.left);
    const viewportHeight = Math.max(1, lensBounds.bottom - lensBounds.top);
    const fitScale = Math.min(viewportWidth / bounds.width, viewportHeight / bounds.height);
    const baseMaxScale = this.getEmbeddedContainerMaxRenderScale(container);
    const maxScale = container.lensMaximized
      ? Math.max(baseMaxScale, Math.min(fitScale, 3.5))
      : baseMaxScale;
    const userZoom = Number.isFinite(container.viewZoom) ? this.clamp(Number(container.viewZoom), 0.1, 80) : 1;
    const scale = this.clamp(fitScale * userZoom, 0.04, maxScale * userZoom);
    if (
      !Number.isFinite(bounds.centerX)
      || !Number.isFinite(bounds.centerY)
      || !Number.isFinite(targetCenterX)
      || !Number.isFinite(targetCenterY)
      || !Number.isFinite(scale)
    ) {
      const fallbackCenterX = (container.left + container.right) / 2;
      const fallbackCenterY = (container.top + container.bottom) / 2;
      return {
        sourceCenterX: fallbackCenterX,
        sourceCenterY: fallbackCenterY,
        targetCenterX: fallbackCenterX,
        targetCenterY: fallbackCenterY,
        scale: 0.2
      };
    }
    return {
      sourceCenterX: gravityCenter.x,
      sourceCenterY: gravityCenter.y,
      targetCenterX: targetCenterX + (Number.isFinite(container.viewPanX) ? Number(container.viewPanX) : 0),
      targetCenterY: targetCenterY + (Number.isFinite(container.viewPanY) ? Number(container.viewPanY) : 0),
      scale
    };
  }

  private getEmbeddedContainerMaxRenderScale(container: EmbeddedGraphContainerState): number {
    const memberCount = Math.max(1, container.memberIds.size);
    const origin = this.nodeMap.get(container.origin);
    const depthScale = origin ? this.clamp(this.getEmbeddedNodeVisualScale(origin) / 0.38, 0.5, 1.1) : 1;
    const countScale = this.clamp(0.95 / Math.sqrt(memberCount), 0.22, 0.95);
    return this.clamp(countScale * depthScale, 0.18, 0.95);
  }

  private getGraphLensBounds(container: EmbeddedGraphContainerState): {
    left: number;
    top: number;
    right: number;
    bottom: number;
  } {
    const origin = this.nodeMap.get(container.origin);
    const anchor = this.getGraphLensAnchorCenter(container, origin);
    const compactCenterX = anchor.x;
    const compactCenterY = anchor.y;
    const width = Math.max(this.getMinimumContainerViewportSize(), Number(container.lensWidth) || this.getGraphLensWidth(origin));
    const height = Math.max(this.getMinimumContainerViewportSize(), Number(container.lensHeight) || this.getGraphLensHeight(origin));
    const offsetX = Number.isFinite(container.lensOffsetX) ? container.lensOffsetX : Math.max(80, this.nodeRadius * 4);
    const offsetY = Number.isFinite(container.lensOffsetY) ? container.lensOffsetY : -Math.max(18, this.nodeRadius * 0.9);
    const centerX = compactCenterX + offsetX + width / 2;
    const centerY = compactCenterY + offsetY;
    if (
      !Number.isFinite(centerX)
      || !Number.isFinite(centerY)
      || !Number.isFinite(width)
      || !Number.isFinite(height)
    ) {
      const fallbackX = origin?.x ?? 0;
      const fallbackY = origin?.y ?? 0;
      const fallbackWidth = this.getGraphLensWidth(origin);
      const fallbackHeight = this.getGraphLensHeight(origin);
      return {
        left: fallbackX,
        top: fallbackY - fallbackHeight / 2,
        right: fallbackX + fallbackWidth,
        bottom: fallbackY + fallbackHeight / 2
      };
    }
    return {
      left: centerX - width / 2,
      top: centerY - height / 2,
      right: centerX + width / 2,
      bottom: centerY + height / 2
    };
  }

  private getGraphLensAnchorCenter(
    container: EmbeddedGraphContainerState,
    origin = this.nodeMap.get(container.origin)
  ): { x: number; y: number } {
    if (origin) return this.getRenderedNodeCenter(origin);
    return {
      x: (container.left + container.right) / 2,
      y: (container.top + container.bottom) / 2
    };
  }

  private layoutGraphLenses(): void {
    const placed: Array<{ left: number; top: number; right: number; bottom: number }> = [];
    const containers = Array.from(this.embeddedGraphContainers.values())
      .sort((a, b) => {
        const ancestryDelta = a.ancestry.length - b.ancestry.length;
        return ancestryDelta !== 0 ? ancestryDelta : a.key.localeCompare(b.key);
      });
    for (const container of containers) {
      if (!container.lensUserPositioned) {
        const origin = this.nodeMap.get(container.origin);
        const radius = origin ? this.getEffectiveNodeRadius(origin) : this.nodeRadius;
        const baseDistance = Math.max(80, radius * 4);
        const verticalStep = Math.max(34, radius * 1.8);
        const candidates = [
          { x: baseDistance, y: -verticalStep * 0.5 },
          { x: baseDistance, y: verticalStep * 2.5 },
          { x: -baseDistance - (Number(container.lensWidth) || this.getGraphLensWidth(origin)), y: -verticalStep * 0.5 },
          { x: baseDistance, y: -verticalStep * 4 },
          { x: -baseDistance - (Number(container.lensWidth) || this.getGraphLensWidth(origin)), y: verticalStep * 2.5 },
          { x: baseDistance, y: verticalStep * 6 },
          { x: -baseDistance - (Number(container.lensWidth) || this.getGraphLensWidth(origin)), y: -verticalStep * 4 }
        ];
        for (const candidate of candidates) {
          container.lensOffsetX = candidate.x;
          container.lensOffsetY = candidate.y;
          const bounds = this.getGraphLensBounds(container);
          if (!placed.some((existing) => this.doBadgeRectsOverlap(existing, bounds, Math.max(8, this.nodeRadius * 0.4)))) {
            break;
          }
        }
      }
      placed.push(this.getGraphLensBounds(container));
    }
  }

  private getRenderedNodeCenter(node: GraphNode): { x: number; y: number } {
    if (node.embeddedInstanceId) {
      const container = this.embeddedGraphContainers.get(node.embeddedInstanceId);
      if (container) {
        const transform = this.getEmbeddedContainerRenderTransform(container);
        return {
          x: transform.targetCenterX + ((node.x - transform.sourceCenterX) * transform.scale),
          y: transform.targetCenterY + ((node.y - transform.sourceCenterY) * transform.scale)
        };
      }
    }
    return { x: node.x, y: node.y };
  }

  private getNodeWorldPointFromRenderedPoint(
    node: GraphNode,
    renderedX: number,
    renderedY: number
  ): { x: number; y: number } {
    if (node.embeddedInstanceId) {
      const container = this.embeddedGraphContainers.get(node.embeddedInstanceId);
      if (container) {
        const transform = this.getEmbeddedContainerRenderTransform(container);
        if (transform.scale > 0.001) {
          return {
            x: transform.sourceCenterX + ((renderedX - transform.targetCenterX) / transform.scale),
            y: transform.sourceCenterY + ((renderedY - transform.targetCenterY) / transform.scale)
          };
        }
      }
    }
    return { x: renderedX, y: renderedY };
  }


  private getRenderedEdgeEndpoint(
    node: GraphNode,
    towardX: number,
    towardY: number
  ): { x: number; y: number } {
    const center = this.getRenderedNodeCenter(node);
    const centerX = center.x;
    const centerY = center.y;
    const dx = towardX - centerX;
    const dy = towardY - centerY;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) return { x: centerX, y: centerY };
    const radius = this.getRenderedNodeRadius(node);
    return {
      x: centerX + (dx / length) * radius,
      y: centerY + (dy / length) * radius
    };
  }

  private getEdgeBoundaryGeometry(
    first: GraphNode,
    second: GraphNode
  ): {
    firstPoint: { x: number; y: number };
    secondPoint: { x: number; y: number };
    directionX: number;
    directionY: number;
    gap: number;
  } {
    const firstCenter = this.getRenderedNodeCenter(first);
    const secondCenter = this.getRenderedNodeCenter(second);
    let centerDx = secondCenter.x - firstCenter.x;
    let centerDy = secondCenter.y - firstCenter.y;
    let centerDistance = Math.hypot(centerDx, centerDy);
    if (centerDistance < 0.001) {
      const angle = this.deterministicAngle(`${first.id}::${second.id}`);
      centerDx = Math.cos(angle);
      centerDy = Math.sin(angle);
      centerDistance = 1;
    }
    const directionX = centerDx / centerDistance;
    const directionY = centerDy / centerDistance;
    const firstPoint = this.getRenderedEdgeEndpoint(first, secondCenter.x, secondCenter.y);
    const secondPoint = this.getRenderedEdgeEndpoint(second, firstCenter.x, firstCenter.y);
    const boundaryDx = secondPoint.x - firstPoint.x;
    const boundaryDy = secondPoint.y - firstPoint.y;
    const boundaryDistance = Math.hypot(boundaryDx, boundaryDy);
    const followsCenterDirection = (boundaryDx * directionX) + (boundaryDy * directionY);
    return {
      firstPoint,
      secondPoint,
      directionX,
      directionY,
      gap: followsCenterDirection >= 0 ? boundaryDistance : -boundaryDistance
    };
  }

  private getPhysicsEdgeBoundaryGeometry(
    first: GraphNode,
    second: GraphNode
  ): {
    directionX: number;
    directionY: number;
    gap: number;
  } {
    let centerDx = second.x - first.x;
    let centerDy = second.y - first.y;
    let centerDistance = Math.hypot(centerDx, centerDy);
    if (centerDistance < 0.001) {
      const angle = this.deterministicAngle(`${first.id}::${second.id}`);
      centerDx = Math.cos(angle);
      centerDy = Math.sin(angle);
      centerDistance = 1;
    }
    const directionX = centerDx / centerDistance;
    const directionY = centerDy / centerDistance;
    const gap = Math.max(
      0,
      centerDistance - this.getEffectiveNodeRadius(first) - this.getEffectiveNodeRadius(second)
    );
    return { directionX, directionY, gap };
  }

  getEmbeddedGraphInstances(graphPathRaw: string): Array<{
    originNodeId: string;
    ancestry: string[];
  }> {
    const graphPath = String(graphPathRaw ?? "").trim();
    if (!graphPath) return [];
    return Array.from(this.embeddedGraphContainers.values())
      .filter((container) => container.graphPath === graphPath)
      .map((container) => ({
        originNodeId: container.origin,
        ancestry: [...container.ancestry]
      }));
  }

  getEmbeddedGraphLensState(originNodeIdRaw: string, graphPathRaw: string): O3GraphEmbeddedLensState | undefined {
    const container = this.embeddedGraphContainers.get(this.embeddedGraphKey(originNodeIdRaw, graphPathRaw));
    return container ? this.getEmbeddedGraphLensStateForContainer(container) : undefined;
  }

  private getEmbeddedGraphLensStateForContainer(container: EmbeddedGraphContainerState): O3GraphEmbeddedLensState {
    return {
      lensWidth: container.lensWidth,
      lensHeight: container.lensHeight,
      lensOffsetX: container.lensOffsetX,
      lensOffsetY: container.lensOffsetY,
      ...(container.lensUserPositioned ? { lensUserPositioned: true } : {}),
      ...(container.lensMaximized ? { lensMaximized: true } : {}),
      ...(Number.isFinite(container.lensRestoreWidth) ? { lensRestoreWidth: container.lensRestoreWidth } : {}),
      ...(Number.isFinite(container.lensRestoreHeight) ? { lensRestoreHeight: container.lensRestoreHeight } : {}),
      ...(Number.isFinite(container.lensRestoreOffsetX) ? { lensRestoreOffsetX: container.lensRestoreOffsetX } : {}),
      ...(Number.isFinite(container.lensRestoreOffsetY) ? { lensRestoreOffsetY: container.lensRestoreOffsetY } : {}),
      ...(container.lensRestoreUserPositioned ? { lensRestoreUserPositioned: true } : {}),
      ...(Number.isFinite(container.viewZoom) ? { viewZoom: Number(container.viewZoom) } : {}),
      ...(Number.isFinite(container.viewPanX) ? { viewPanX: Number(container.viewPanX) } : {}),
      ...(Number.isFinite(container.viewPanY) ? { viewPanY: Number(container.viewPanY) } : {})
    };
  }

  private getEmbeddedGraphPersistenceContext(container: EmbeddedGraphContainerState): {
    originNodeId: string;
    ownerGraphPath?: string;
    parentChain: O3GraphEmbeddedGraphState[];
  } {
    const persistedOriginId = (candidate: EmbeddedGraphContainerState): string => {
      const origin = this.nodeMap.get(candidate.origin);
      return String(origin?.embeddedSourceNodeId ?? candidate.origin ?? "").trim();
    };
    const parentChain: O3GraphEmbeddedGraphState[] = [];
    let cursor: EmbeddedGraphContainerState | undefined = container;
    let rootOrigin = this.nodeMap.get(container.origin);
    while (cursor) {
      const origin = this.nodeMap.get(cursor.origin);
      rootOrigin = origin ?? rootOrigin;
      const parent = origin?.embeddedInstanceId
        ? this.embeddedGraphContainers.get(origin.embeddedInstanceId)
        : undefined;
      if (!parent) break;
      parentChain.unshift({
        originNodeId: persistedOriginId(parent),
        graphPath: parent.graphPath,
        expanded: true
      });
      cursor = parent;
    }
    return {
      originNodeId: persistedOriginId(container),
      ownerGraphPath: rootOrigin?.stateOwnerPath,
      parentChain
    };
  }

  applyEmbeddedGraphLensState(
    originNodeIdRaw: string,
    graphPathRaw: string,
    lens?: O3GraphEmbeddedLensState
  ): boolean {
    const container = this.embeddedGraphContainers.get(this.embeddedGraphKey(originNodeIdRaw, graphPathRaw));
    if (!container || !lens) return false;
    this.applyLensStateToContainer(container, lens);
    this.notifyEmbeddedGraphLensChanged(container);
    this.requestRender();
    return true;
  }

  private applyLensStateToContainer(
    container: EmbeddedGraphContainerState,
    lens: O3GraphEmbeddedLensState
  ): void {
    const applyNumber = (key: keyof O3GraphEmbeddedLensState, assign: (value: number) => void) => {
      const value = Number(lens[key]);
      if (Number.isFinite(value)) assign(value);
    };
    applyNumber("lensWidth", (value) => { container.lensWidth = Math.max(this.getMinimumContainerViewportSize(), value); });
    applyNumber("lensHeight", (value) => { container.lensHeight = Math.max(this.getMinimumContainerViewportSize(), value); });
    applyNumber("lensOffsetX", (value) => { container.lensOffsetX = value; });
    applyNumber("lensOffsetY", (value) => { container.lensOffsetY = value; });
    applyNumber("lensRestoreWidth", (value) => { container.lensRestoreWidth = Math.max(this.getMinimumContainerViewportSize(), value); });
    applyNumber("lensRestoreHeight", (value) => { container.lensRestoreHeight = Math.max(this.getMinimumContainerViewportSize(), value); });
    applyNumber("lensRestoreOffsetX", (value) => { container.lensRestoreOffsetX = value; });
    applyNumber("lensRestoreOffsetY", (value) => { container.lensRestoreOffsetY = value; });
    applyNumber("viewZoom", (value) => { container.viewZoom = this.clamp(value, 0.1, 80); });
    applyNumber("viewPanX", (value) => { container.viewPanX = value; });
    applyNumber("viewPanY", (value) => { container.viewPanY = value; });
    container.lensUserPositioned = lens.lensUserPositioned === true;
    container.lensMaximized = lens.lensMaximized === true;
    container.lensRestoreUserPositioned = lens.lensRestoreUserPositioned === true;
  }

  replaceEmbeddedGraphInstance(
    originNodeId: string,
    definition: EmbeddedGraphDefinition
  ): boolean {
    const graphPath = String(definition.graphPath ?? "").trim();
    if (!graphPath || !this.nodeMap.has(originNodeId)) return false;
    const key = this.embeddedGraphKey(originNodeId, graphPath);
    const previousContainer = this.embeddedGraphContainers.get(key);
    const previousDefinition = previousContainer
      ? this.getEmbeddedGraphDefinitionForContainer(previousContainer)
      : null;
    const previousLens = previousDefinition?.lens ?? this.getEmbeddedGraphLensState(originNodeId, graphPath);
    if ((definition.snapshots ?? []).length === 0) return false;
    this.collapseEmbeddedGraph(originNodeId, graphPath);
    const replaced = this.expandEmbeddedGraph(originNodeId, {
      ...definition,
      lens: definition.lens ?? previousLens
    });
    if (replaced) return true;
    if (previousDefinition) {
      this.expandEmbeddedGraph(originNodeId, previousDefinition);
    }
    return false;
  }

  private getEmbeddedGraphDefinitionForContainer(container: EmbeddedGraphContainerState): EmbeddedGraphDefinition {
    return {
      graphPath: container.graphPath,
      color: container.color,
      colorSource: container.colorSource,
      linkForce: container.linkForce,
      snapshots: this.getEmbeddedGraphSnapshotsForContainer(container),
      ancestry: [...container.ancestry],
      lens: this.getEmbeddedGraphLensStateForContainer(container),
      embeddedGraphs: this.getEmbeddedGraphChildStates(container),
      linkTypes: [...container.linkTypes],
      visibleLinkTypes: [...container.visibleLinkTypes],
      visibleLinkTypeDefinitions: [...container.visibleLinkTypeDefinitions]
    };
  }

  private getEmbeddedGraphChildStates(container: EmbeddedGraphContainerState): O3GraphEmbeddedGraphState[] {
    const children = Array.from(this.embeddedGraphContainers.values())
      .filter((candidate) => container.memberIds.has(candidate.origin));
    return children.map((child) => {
      const origin = this.nodeMap.get(child.origin);
      return {
        graphPath: child.graphPath,
        originNodeId: String(origin?.embeddedSourceNodeId ?? child.origin ?? "").trim(),
        expanded: true,
        lens: this.getEmbeddedGraphLensStateForContainer(child),
        embeddedGraphs: this.getEmbeddedGraphChildStates(child)
      };
    }).filter((entry) => entry.originNodeId.length > 0);
  }

  refreshEmbeddedRelationshipsForSourcePath(pathRaw: string): boolean {
    const path = String(pathRaw ?? "").trim();
    if (!path) return false;
    let refreshed = false;
    for (const node of this.nodes.filter((candidate) =>
      candidate.sourcePath === path
      && Boolean(candidate.embeddedInstanceId)
      && Boolean(candidate.stateOwnerPath)
    )) {
      const activeLinkTypes = this.getLinkTypesForNode(node).filter((linkType) => {
        const property = this.normalizeLinkType(String(linkType.property ?? ""));
        return property && this.expandedByBadge.has(this.badgeKey(node.id, property));
      });
      for (const linkType of activeLinkTypes) {
        this.refreshEmbeddedBadgeExpansionAfterMutation(node, linkType);
        refreshed = true;
      }
    }
    return refreshed;
  }

  refreshOuterRelationshipsForSourcePath(
    pathRaw: string,
    changedPropertiesRaw: string[] = []
  ): boolean {
    const path = String(pathRaw ?? "").trim();
    if (!path) return false;
    const changedProperties = new Set(
      changedPropertiesRaw
        .map((property) => this.normalizeLinkType(property))
        .filter(Boolean)
    );
    let refreshed = false;
    for (const node of this.nodes.filter((candidate) =>
      candidate.sourcePath === path
      && !candidate.stateOwnerPath
    )) {
      for (const linkType of this.getLinkTypesForNode(node)) {
        const property = this.normalizeLinkType(String(linkType.property ?? ""));
        if (!property) continue;
        const configuredProperties = new Set(
          [
            property,
            ...(linkType.properties ?? [])
              .map((candidate) => this.normalizeLinkType(String(candidate ?? "")))
          ].filter(Boolean)
        );
        if (
          changedProperties.size > 0
          && !Array.from(configuredProperties).some((candidate) => changedProperties.has(candidate))
        ) {
          continue;
        }
        const expanded = this.expandedByBadge.has(this.badgeKey(node.id, property))
          || this.isParentExpansionActive(node.id, property);
        if (!expanded) continue;
        this.refreshBadgeExpansionAfterMutation(node.id, node.sourcePath, property);
        refreshed = true;
      }
    }
    return refreshed;
  }

  clearEmbeddedGraphRuntime(): void {
    for (const container of Array.from(this.embeddedGraphContainers.values())) {
      this.edges = this.edges.filter((edge) => !container.memberIds.has(edge.from) && !container.memberIds.has(edge.to));
      for (const nodeId of container.memberIds) {
        this.removeNodeById(nodeId);
      }
    }
    this.embeddedGraphContainers.clear();
    this.badgesDirty = true;
  }

  async toggleEmbeddedGraph(originNodeIdRaw: string): Promise<boolean> {
    const originNodeId = String(originNodeIdRaw ?? "").trim();
    const originNode = this.nodeMap.get(originNodeId);
    if (!originNode || !this.menuOptions.isGraphNote?.(originNode.sourcePath)) {
      console.warn("[GraphEngine] Graph lens did not open: origin is not graph-capable", {
        originNodeId,
        sourcePath: originNode?.sourcePath
      });
      return false;
    }
    const graphPath = originNode.sourcePath;
    const key = this.embeddedGraphKey(originNodeId, graphPath);
    const existingContainer = this.embeddedGraphContainers.get(key);
    if (existingContainer) {
      const context = this.getEmbeddedGraphPersistenceContext(existingContainer);
      this.collapseEmbeddedGraph(originNodeId, graphPath);
      this.menuOptions.onEmbeddedGraphExpansionChanged?.(
        context.originNodeId,
        graphPath,
        false,
        context.ownerGraphPath,
        undefined,
        context.parentChain
      );
      return true;
    }

    const ancestry = Array.from(new Set([
      ...(originNode.embeddedAncestry ?? []),
      ...(originNode.stateOwnerPath ? [originNode.stateOwnerPath] : [])
    ].filter(Boolean)));
    if (ancestry.includes(graphPath)) {
      console.warn("[GraphEngine] Graph lens did not open: cyclic embedded graph blocked", {
        originNodeId,
        graphPath,
        ancestry
      });
      return false;
    }
    const definition = await this.menuOptions.onEmbeddedGraphExpansionRequested?.({
      originNodeId,
      graphPath,
      ancestry
    });
    if (!definition || definition.snapshots.length === 0) {
      console.warn("[GraphEngine] Graph lens did not open: embedded graph definition empty", {
        originNodeId,
        graphPath,
        hasDefinition: Boolean(definition),
        snapshots: definition?.snapshots.length ?? 0
      });
      return false;
    }
    const expanded = this.expandEmbeddedGraph(originNodeId, definition);
    if (expanded) {
      const container = this.embeddedGraphContainers.get(key);
      const context = container
        ? this.getEmbeddedGraphPersistenceContext(container)
        : {
            originNodeId: String(originNode.embeddedSourceNodeId ?? originNodeId),
            ownerGraphPath: originNode.stateOwnerPath,
            parentChain: [] as O3GraphEmbeddedGraphState[]
          };
      const lens = this.getEmbeddedGraphLensState(originNodeId, graphPath);
      this.menuOptions.onEmbeddedGraphExpansionChanged?.(
        context.originNodeId,
        graphPath,
        true,
        context.ownerGraphPath,
        lens,
        context.parentChain
      );
    }
    return expanded;
  }

  expandEmbeddedGraph(originNodeIdRaw: string, definition: EmbeddedGraphDefinition): boolean {
    const originNodeId = String(originNodeIdRaw ?? "").trim();
    const graphPath = String(definition.graphPath ?? "").trim();
    const originNode = this.nodeMap.get(originNodeId);
    if (!originNode || !graphPath || definition.snapshots.length === 0) return false;
    const ancestry = Array.from(new Set((definition.ancestry ?? []).map((path) => String(path ?? "").trim()).filter(Boolean)));
    if (ancestry.includes(graphPath)) return false;

    const key = this.embeddedGraphKey(originNodeId, graphPath);
    if (this.embeddedGraphContainers.has(key)) return true;
    const snapshots = definition.snapshots.filter((snapshot) => snapshot.path && snapshot.nodeId);
    if (snapshots.length === 0) return false;
    for (const linkType of [
      ...(definition.linkTypes ?? []),
      ...(definition.visibleLinkTypeDefinitions ?? [])
    ]) {
      this.registerLinkTypeRuntimeConfig(linkType);
    }

    const sourceCenterX = snapshots.reduce((sum, snapshot) => sum + Number(snapshot.x || 0), 0) / snapshots.length;
    const sourceCenterY = snapshots.reduce((sum, snapshot) => sum + Number(snapshot.y || 0), 0) / snapshots.length;
    const viewportWidth = this.getEmbeddedGraphViewportWidth(originNode);
    const viewportHeight = this.getEmbeddedGraphViewportHeight(originNode);
    const containerCenterX = originNode.x;
    const containerCenterY = originNode.y;
    const memberIds = new Set<string>();
    const runtimeIdBySourceId = new Map<string, string>();
    const addedOrUpdatedNodeIds: string[] = [];

    for (const snapshot of snapshots) {
      const runtimeId = this.embeddedRuntimeNodeId(key, snapshot.nodeId);
      runtimeIdBySourceId.set(snapshot.nodeId, runtimeId);
      memberIds.add(runtimeId);
      const file = this.app.vault.getAbstractFileByPath(snapshot.path);
      const sourcePath = file instanceof TFile ? file.path : String(snapshot.path ?? "").trim();
      if (!sourcePath) continue;
      const existing = this.nodeMap.get(runtimeId);
      const node: GraphNode = existing ?? {
        id: runtimeId,
        sourcePath,
        label: file instanceof TFile ? file.basename : this.labelFromPath(sourcePath),
        x: containerCenterX + (Number(snapshot.x || 0) - sourceCenterX),
        y: containerCenterY + (Number(snapshot.y || 0) - sourceCenterY),
        vx: 0,
        vy: 0,
        mass: 1,
        isBase: snapshot.origin.kind === "root",
        depth: 1
      };
      node.stateOwnerPath = graphPath;
      node.embeddedInstanceId = key;
      node.embeddedSourceNodeId = snapshot.nodeId;
      node.embeddedRoot = snapshot.origin.kind === "root";
      node.embeddedOrigin = snapshot.origin;
      node.embeddedAncestry = [...ancestry, graphPath];
      node.isPinned = snapshot.pinned;
      node.isMissingFile = !(file instanceof TFile);
      addedOrUpdatedNodeIds.push(runtimeId);
      if (snapshot.pinned) {
        node.fx = node.x;
        node.fy = node.y;
        node.isLocked = true;
        node.lockX = node.x;
        node.lockY = node.y;
        this.pinnedNodePaths.add(runtimeId);
      }
      if (!existing) {
        this.nodes.push(node);
        this.nodeMap.set(runtimeId, node);
      }
    }

    for (const snapshot of snapshots) {
      const runtimeSourceId = runtimeIdBySourceId.get(snapshot.nodeId);
      if (!runtimeSourceId) continue;
      for (const [linkTypeRaw, status] of Object.entries(snapshot.badges ?? {})) {
        if (status !== "expanded") continue;
        const linkType = this.normalizeLinkType(linkTypeRaw);
        if (!linkType) continue;
        const badgeKey = this.badgeKey(runtimeSourceId, linkType);
        const childSnapshots = snapshots.filter((candidate) =>
          candidate.origin.kind === "expansion"
          && candidate.origin.sourceNodeId === snapshot.nodeId
          && this.normalizeLinkType(candidate.origin.linkType) === linkType
        );
        this.expandedByBadge.set(badgeKey, new Set(childSnapshots.map((candidate) => candidate.path)));
        this.expansionNodes.set(badgeKey, new Set(
          childSnapshots
            .map((candidate) => runtimeIdBySourceId.get(candidate.nodeId))
            .filter((id): id is string => Boolean(id))
        ));
        this.expansionParent.set(badgeKey, null);
      }
    }

    for (const snapshot of snapshots) {
      if (snapshot.origin.kind !== "expansion") continue;
      const from = runtimeIdBySourceId.get(snapshot.origin.sourceNodeId);
      const to = runtimeIdBySourceId.get(snapshot.nodeId);
      if (!from || !to) continue;
      this.removeVisibleSemanticEdges(from, to, snapshot.origin.linkType);
      if (this.hasEdge(from, to, snapshot.origin.linkType)) continue;
      const relationship = this.getLinkTypeSemantic(snapshot.origin.linkType) === "parent"
        ? "parent" as const
        : undefined;
      this.edges.push({
        from,
        to,
        type: snapshot.origin.linkType,
        linkType: snapshot.origin.linkType,
        ...(relationship ? { relationship, origin: from } : {})
      });
      if (relationship) {
        this.expandedParentRequests.set(
          this.buildExpandedParentRequestKey(from, snapshot.origin.linkType),
          { origin: from, linkType: snapshot.origin.linkType }
        );
      }
    }

    const containerState: EmbeddedGraphContainerState = {
      key,
      origin: originNodeId,
      originSourcePath: originNode.sourcePath,
      graphPath,
      memberIds,
      interactionLocked: this.lockedEmbeddedGraphContainerKeys.has(key),
      color: this.normalizeBadgeColor(definition.color),
      colorSource: definition.colorSource ?? "explicit",
      linkForce: this.clamp(Number(definition.linkForce) || 0.015, 0, 1),
      sourceCenterX,
      sourceCenterY,
      viewportWidth,
      viewportHeight,
      left: containerCenterX - viewportWidth / 2,
      top: containerCenterY - viewportHeight / 2,
      right: containerCenterX + viewportWidth / 2,
      bottom: containerCenterY + viewportHeight / 2,
      ancestry,
      linkTypes: definition.linkTypes ?? [],
      visibleLinkTypes: Array.from(new Set(
        (definition.visibleLinkTypes ?? [])
          .map((type) => this.normalizeLinkType(type).toLowerCase())
          .filter(Boolean)
      )),
      visibleLinkTypeDefinitions: this.normalizeBadgeLinkTypeDefinitions(definition.visibleLinkTypeDefinitions ?? []),
      lastOriginX: originNode.x,
      lastOriginY: originNode.y,
      anchorDirectionX: 1,
      anchorDirectionY: 0,
      anchorVelocityX: 0,
      anchorVelocityY: 0,
      collisionPressureX: 0,
      collisionPressureY: 0,
      lensWidth: this.getGraphLensWidth(originNode),
      lensHeight: this.getGraphLensHeight(originNode),
      lensOffsetX: Math.max(80, this.getEffectiveNodeRadius(originNode) * 4),
      lensOffsetY: -Math.max(18, this.getEffectiveNodeRadius(originNode) * 0.9)
    };
    if (definition.lens) {
      this.applyLensStateToContainer(containerState, definition.lens);
    }
    this.embeddedGraphContainers.set(key, containerState);
    this.nodeConnectionCountsDirty = true;
    this.addEmbeddedVisibleLinkTypeEdges(key);
    this.badgesDirty = true;
    this.updateNodeColors(addedOrUpdatedNodeIds);
    this.refreshNearestActiveLinkedNode();
    this.reheatSimulation(0.18, "embedded graph expansion");
    for (const nested of definition.embeddedGraphs ?? []) {
      const nestedOriginId = runtimeIdBySourceId.get(nested.originNodeId);
      if (!nestedOriginId) continue;
      window.setTimeout(() => {
        void (async () => {
          const nestedOrigin = this.nodeMap.get(nestedOriginId);
          if (!nestedOrigin) return;
          const nestedDefinition = await this.menuOptions.onEmbeddedGraphExpansionRequested?.({
            originNodeId: nestedOriginId,
            graphPath: nested.graphPath,
            ancestry: [
              ...(nestedOrigin.embeddedAncestry ?? []),
              ...(nestedOrigin.stateOwnerPath ? [nestedOrigin.stateOwnerPath] : [])
            ]
          });
          if (!nestedDefinition) return;
          this.expandEmbeddedGraph(nestedOriginId, {
            ...nestedDefinition,
            lens: nested.lens ?? nestedDefinition.lens,
            embeddedGraphs: nested.embeddedGraphs ?? nestedDefinition.embeddedGraphs
          });
        })();
      }, 0);
    }
    return true;
  }

  collapseEmbeddedGraph(originNodeIdRaw: string, graphPathRaw: string): boolean {
    const key = this.embeddedGraphKey(originNodeIdRaw, graphPathRaw);
    const container = this.embeddedGraphContainers.get(key);
    if (!container) return false;
    for (const nested of Array.from(this.embeddedGraphContainers.values())) {
      if (container.memberIds.has(nested.origin)) {
        this.collapseEmbeddedGraph(nested.origin, nested.graphPath);
      }
    }
    this.edges = this.edges.filter((edge) => !container.memberIds.has(edge.from) && !container.memberIds.has(edge.to));
    for (const nodeId of container.memberIds) {
      this.removeNodeById(nodeId);
    }
    this.embeddedGraphContainers.delete(key);
    this.lockedEmbeddedGraphContainerKeys.delete(key);
    this.nodeConnectionCountsDirty = true;
    this.badgesDirty = true;
    this.requestRender();
    return true;
  }

  getEmbeddedGraphPathAtClientPosition(clientX: number, clientY: number): string | null {
    const world = this.clientToWorld(clientX, clientY);
    const containers = Array.from(this.embeddedGraphContainers.values()).reverse();
    return containers.find((container) => {
      const bounds = this.getGraphLensBounds(container);
      return world.x >= bounds.left && world.x <= bounds.right
        && world.y >= bounds.top && world.y <= bounds.bottom;
    })?.graphPath ?? null;
  }

  getEmbeddedGraphSnapshots(graphPathRaw: string): O3GraphRuntimeNodeSnapshot[] {
    const graphPath = String(graphPathRaw ?? "").trim();
    const container = Array.from(this.embeddedGraphContainers.values()).find((candidate) => candidate.graphPath === graphPath);
    if (!container) return [];
    return this.getEmbeddedGraphSnapshotsForContainer(container);
  }

  getEmbeddedGraphSnapshotsForInstance(instanceIdRaw: string): O3GraphRuntimeNodeSnapshot[] {
    const instanceId = String(instanceIdRaw ?? "").trim();
    if (!instanceId) return [];
    const container = this.embeddedGraphContainers.get(instanceId);
    if (!container) return [];
    return this.getEmbeddedGraphSnapshotsForContainer(container);
  }

  private getEmbeddedGraphSnapshotsForContainer(container: EmbeddedGraphContainerState): O3GraphRuntimeNodeSnapshot[] {
    const centerX = (container.left + container.right) / 2;
    const centerY = (container.top + container.bottom) / 2;
    return Array.from(container.memberIds).flatMap((nodeId) => {
      const node = this.nodeMap.get(nodeId);
      if (!node?.embeddedSourceNodeId) return [];
      return [{
        nodeId: node.embeddedSourceNodeId,
        path: node.sourcePath,
        x: container.sourceCenterX + (node.x - centerX),
        y: container.sourceCenterY + (node.y - centerY),
        pinned: Boolean(node.isPinned),
        origin: node.embeddedOrigin ?? (node.embeddedRoot ? { kind: "root" as const } : { kind: "filter" as const }),
        badges: this.getNodeBadgeSnapshot(node.id)
      }];
    });
  }

  private embeddedGraphKey(originNodeIdRaw: string, graphPathRaw: string): string {
    return `embed::${encodeURIComponent(String(originNodeIdRaw ?? "").trim())}::${encodeURIComponent(String(graphPathRaw ?? "").trim())}`;
  }

  private embeddedRuntimeNodeId(instanceId: string, sourceNodeId: string): string {
    return `__o3embed__::${encodeURIComponent(instanceId)}::${encodeURIComponent(String(sourceNodeId ?? "").trim())}`;
  }

  private deterministicAngle(seedRaw: string): number {
    const seed = String(seedRaw ?? "");
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index++) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) / 0xffffffff) * Math.PI * 2;
  }

  private hideParentOverlay(): void {
    if (!this.parentOverlay) return;
    setStyle(this.parentOverlay, "display", "none");
    this.parentOverlay.empty();
  }

  private showParentOverlayForNode(node: GraphNode): void {
    if (!this.parentOverlay || !this.canvas) return;

    this.parentOverlay.empty();

    const title = this.createElement("div");
    title.textContent = `Parent actions for: ${node.label || node.id}`;
    setStyle(title, "fontWeight", "600");
    setStyle(title, "fontSize", "12px");
    setStyle(title, "marginBottom", "8px");
    this.parentOverlay.appendChild(title);

    const parentTypes = this.getParentSemanticLinkTypes();
    if (parentTypes.length === 0) {
      const empty = this.createElement("div");
      empty.textContent = "No parent link types defined";
      setStyle(empty, "fontSize", "12px");
      setStyle(empty, "opacity", "0.8");
      this.parentOverlay.appendChild(empty);
    } else {
      const actions = this.createElement("div");
      setStyle(actions, "display", "grid");
      setStyle(actions, "gap", "6px");
      this.parentOverlay.appendChild(actions);

      for (const parentType of parentTypes) {
        const button = this.createElement("button");
        button.type = "button";
        button.textContent = parentType;
        setStyle(button, "textAlign", "left");
        setStyle(button, "padding", "4px 8px");
        setStyle(button, "cursor", "pointer");
        if (this.isParentExpansionActive(node.id, parentType)) {
          setStyle(button, "background", "rgba(110, 150, 220, 0.2)");
          setStyle(button, "borderColor", "rgba(110, 150, 220, 0.6)");
        }
        button.addEventListener("click", () => {
          this.triggerParentExpansion(node, parentType);
        });
        actions.appendChild(button);
      }
    }

    const renderedCenter = this.getRenderedNodeCenter(node);
    const sx = (renderedCenter.x + this.camera.x) * this.camera.zoom;
    const sy = (renderedCenter.y + this.camera.y) * this.camera.zoom;
    const canvasRect = this.canvas.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();
    const offsetX = 12;
    const offsetY = -12;
    const leftRaw = (canvasRect.left - containerRect.left) + sx + offsetX;
    const topRaw = (canvasRect.top - containerRect.top) + sy + offsetY;
    const maxLeft = Math.max(8, this.container.clientWidth - 320);
    const maxTop = Math.max(8, this.container.clientHeight - 220);
    const left = Math.min(Math.max(8, leftRaw), maxLeft);
    const top = Math.min(Math.max(8, topRaw), maxTop);

    setStyle(this.parentOverlay, "left", `${left}px`);
    setStyle(this.parentOverlay, "top", `${top}px`);
    setStyle(this.parentOverlay, "display", "block");
  }

  private triggerParentExpansion(node: GraphNode, parentLinkType: string): void {
    this.lastFocalNodeId = node.id;
    const sourcePath = String(node.sourcePath ?? "").trim() || String(node.id ?? "").trim();
    this.menuOptions.onParentExpansionRequested?.({
      sourceNodeId: node.id,
      sourcePath,
      sourceLabel: node.label,
      parentLinkType,
      ...(node.stateOwnerPath ? { ownerGraphPath: node.stateOwnerPath } : {}),
      ...(node.embeddedInstanceId ? { ownerInstanceId: node.embeddedInstanceId } : {}),
      ...(node.embeddedSourceNodeId ? { ownerNodeId: node.embeddedSourceNodeId } : {})
    });
    this.hideParentOverlay();
  }

  private updateMenuCounter() {
    if (!this.menuCount) return;
    this.menuCount.textContent = String(this.selectedLinkTypes.size);
  }

  private computeVisibleFiles(files: TFile[], selectedTypeSourceNodeIds: Set<string>): TFile[] {
    const applyLimit = (items: TFile[]) => items.slice(0, this.lastNodeLimit);

    if (this.selectedLinkTypes.size === 0) {
      return applyLimit(files);
    }

    const visibleNodeIds = new Set<string>();
    for (const path of this.rootFilePaths) {
      if (path) visibleNodeIds.add(path);
    }
    for (const path of this.filterFilePaths) {
      if (path) visibleNodeIds.add(path);
    }
    for (const edge of this.edges) {
      visibleNodeIds.add(edge.from);
      visibleNodeIds.add(edge.to);
    }
    for (const id of selectedTypeSourceNodeIds) {
      visibleNodeIds.add(id);
    }

    const matching = files.filter(file => visibleNodeIds.has(file.path));
    if (this.hideNodesWithoutSelectedLinkTypes) {
      return applyLimit(matching);
    }

    const nonMatching = files.filter(file =>
      !visibleNodeIds.has(file.path)
      && !this.shouldSuppressOriginalNodeForDuplicate(file.path)
    );
    return applyLimit([...matching, ...nonMatching]);
  }

  private syncNodes(files: TFile[]) {
    const newSet = new Set(files.map(f => f.path));

    for (const id of Array.from(this.nodeMap.keys())) {
      if (this.nodeMap.get(id)?.stateOwnerPath) continue;
      if (this.duplicateNodeSourceById.has(id)) continue;
      if (!newSet.has(id)) {
        const node = this.nodeMap.get(id)!;
        if (node.isMissingFile && this.currentFiles.has(node.sourcePath)) {
          continue;
        }
        this.rememberNodePosition(node);
        this.nodes = this.nodes.filter(n => n !== node);
        this.syncNodeMapFromNodes();
        this.nodeMap.delete(id);
        this.removePinIcon(node);
        this.pinnedNodePaths.delete(id);
      }
    }

    for (const file of files) {
      if (!this.nodeMap.has(file.path)) {
        const rememberedPosition = this.getRememberedNodePosition(file.path);
        const initialPosition = rememberedPosition ?? this.getInitialPositionForNewNode(file.path);
        const node: GraphNode = {
          id: file.path,
          sourcePath: file.path,
          label: this.lastLabels.get(file.path) ?? file.basename ?? file.name,
          x: initialPosition.x,
          y: initialPosition.y,
          vx: 0,
          vy: 0,
          mass: 1,
          isBase: this.rootFilePaths.has(file.path),
          depth: 0
        };

        this.nodes.push(node);
        this.nodeMap.set(file.path, node);
        this.applyPinnedStateToNode(node, { restorePersistedPosition: rememberedPosition === null });
      } else {
        const node = this.nodeMap.get(file.path)!;
        node.sourcePath = file.path;
        node.label = this.lastLabels.get(file.path) ?? file.basename ?? file.name;
        node.isMissingFile = false;
        node.isBase = this.rootFilePaths.has(file.path);
        node.depth = 0;
        this.applyPinnedStateToNode(node, { restorePersistedPosition: false });
      }
    }
  }

  private syncNodeMapFromNodes(): void {
    this.nodeMap.clear();
    for (const node of this.nodes) {
      this.nodeMap.set(node.id, node);
    }
  }

  private getInitialPositionForNewNode(path: string): { x: number; y: number } {
    const normalizedPath = String(path ?? "").trim();
    const rememberedPosition = this.getRememberedNodePosition(normalizedPath);
    if (rememberedPosition) return rememberedPosition;

    const anchors: Array<{ node: GraphNode; linkType: string }> = [];
    for (const edge of this.edges) {
      const otherId = edge.from === normalizedPath
        ? edge.to
        : edge.to === normalizedPath
          ? edge.from
          : null;
      if (!otherId) continue;
      const anchor = this.nodeMap.get(otherId);
      if (anchor) {
        anchors.push({
          node: anchor,
          linkType: this.normalizeLinkType(edge.linkType ?? edge.type)
        });
      }
    }

    if (anchors.length > 0) {
      const first = anchors[0];
      return this.getExpandedChildInitialPosition(normalizedPath, normalizedPath, first.node, first.linkType);
    }

    const visibleNodes = this.nodes.filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y));
    if (visibleNodes.length > 0) {
      const x = visibleNodes.reduce((sum, node) => sum + node.x, 0) / visibleNodes.length;
      const y = visibleNodes.reduce((sum, node) => sum + node.y, 0) / visibleNodes.length;
      return this.ensureInitialPositionIsSeparated({ x: x + 32, y: y + 32 }, normalizedPath, null);
    }

    const center = this.clientToWorld(this.canvas.width / 2, this.canvas.height / 2);
    return { x: center.x, y: center.y };
  }

  private getPreferredDistanceForLinkType(linkType: string | undefined): number {
    const normalizedType = this.normalizeLinkType(String(linkType ?? ""));
    const fileConfig = normalizedType ? this.activeLinkTypePhysicsByProperty.get(normalizedType) : undefined;
    const config = normalizedType ? this.getLinkTypePhysicsConfig(normalizedType) : {};
    return this.clamp(
      Number.isFinite(fileConfig?.preferredDistance)
        ? Number(fileConfig?.preferredDistance)
        : (Number.isFinite(config.preferredDistance) ? Number(config.preferredDistance) : this.linkDistance),
      20,
      800
    );
  }

  private getExpandedChildInitialPosition(
    nodeId: string,
    sourcePath: string,
    anchorNode: GraphNode | null,
    linkType?: string
  ): { x: number; y: number } {
    const normalizedNodeId = String(nodeId ?? "").trim();
    const normalizedSourcePath = String(sourcePath ?? "").trim();
    const rememberedPosition = this.getRememberedNodePosition(normalizedNodeId)
      ?? (normalizedNodeId === normalizedSourcePath ? this.getRememberedNodePosition(normalizedSourcePath) : null);
    if (rememberedPosition) {
      return rememberedPosition;
    }
    if (!anchorNode) {
      return this.ensureInitialPositionIsSeparated(this.getInitialPositionForNewNode(sourcePath), nodeId, null, linkType);
    }

    const normalizedLinkType = this.normalizeLinkType(String(linkType ?? ""));
    const siblingCount = this.countExistingExpansionSiblings(anchorNode.id, normalizedLinkType);
    const distance = Math.max(
      this.nodeRadius * 4,
      this.getPreferredDistanceForLinkType(normalizedLinkType) * 0.75
    );
    const angle = this.getExpansionSiblingAngle(siblingCount);
    const base = {
      x: anchorNode.x + Math.cos(angle) * distance,
      y: anchorNode.y + Math.sin(angle) * distance
    };
    return this.ensureInitialPositionIsSeparated(base, nodeId, anchorNode, normalizedLinkType);
  }

  private getExpansionSiblingAngle(index: number): number {
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    return -Math.PI / 2 + index * goldenAngle;
  }

  private countExistingExpansionSiblings(anchorNodeId: string, linkType: string): number {
    const normalizedAnchor = String(anchorNodeId ?? "").trim();
    const normalizedType = this.normalizeLinkType(linkType);
    if (!normalizedAnchor) return 0;

    const ids = new Set<string>();
    for (const edge of this.edges) {
      if (edge.from !== normalizedAnchor) continue;
      if (normalizedType && this.normalizeLinkType(edge.linkType ?? edge.type) !== normalizedType) continue;
      ids.add(edge.to);
    }
    for (const node of this.nodes) {
      for (const ref of node.expandedVia ?? []) {
        if (ref.origin !== normalizedAnchor) continue;
        if (normalizedType && this.normalizeLinkType(ref.linkType) !== normalizedType) continue;
        ids.add(node.id);
      }
    }
    return ids.size;
  }

  private ensureInitialPositionIsSeparated(
    position: { x: number; y: number },
    nodeId: string,
    anchorNode: GraphNode | null,
    linkType?: string
  ): { x: number; y: number } {
    const minDistance = Math.max(this.nodeRadius * 2.6, 40);
    if (!this.isPositionCrowded(position, nodeId, minDistance)) {
      return position;
    }

    const origin = anchorNode
      ? { x: anchorNode.x, y: anchorNode.y }
      : position;
    const baseDistance = Math.max(
      minDistance,
      this.getPreferredDistanceForLinkType(linkType) * 0.75
    );
    const startIndex = anchorNode
      ? this.countExistingExpansionSiblings(anchorNode.id, this.normalizeLinkType(String(linkType ?? "")))
      : 0;
    for (let i = 0; i < 24; i++) {
      const ring = Math.floor(i / 8);
      const angle = this.getExpansionSiblingAngle(startIndex + i);
      const distance = baseDistance + ring * minDistance;
      const candidate = {
        x: origin.x + Math.cos(angle) * distance,
        y: origin.y + Math.sin(angle) * distance
      };
      if (!this.isPositionCrowded(candidate, nodeId, minDistance)) {
        return candidate;
      }
    }
    return {
      x: position.x + minDistance,
      y: position.y + minDistance
    };
  }

  private isPositionCrowded(position: { x: number; y: number }, nodeId: string, minDistance: number): boolean {
    for (const node of this.nodes) {
      if (node.id === nodeId) continue;
      const distance = Math.hypot(node.x - position.x, node.y - position.y);
      if (distance < minDistance) return true;
    }
    return false;
  }

  private applyPinnedStateToNode(
    node: GraphNode,
    options: { restorePersistedPosition?: boolean } = {}
  ): void {
    const restorePersistedPosition = options.restorePersistedPosition !== false;
    const persistedEntry = this.getPersistedNodeEntryForRuntimeId(node.id);
    const persistedNode = persistedEntry?.node;
    const persistedX = Number(persistedNode?.x);
    const persistedY = Number(persistedNode?.y);
    if (restorePersistedPosition && Number.isFinite(persistedX) && Number.isFinite(persistedY)) {
      node.x = persistedX;
      node.y = persistedY;
    }

    if (this.pinnedNodePaths.has(node.id)) {
      const pinned = this.graphState?.pinned?.[node.id] ?? (persistedEntry ? this.graphState?.pinned?.[persistedEntry.id] : undefined);
      const x = Number((pinned as { x?: unknown } | undefined)?.x ?? persistedX);
      const y = Number((pinned as { y?: unknown } | undefined)?.y ?? persistedY);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        node.x = x;
        node.y = y;
      }
      this.pinNode(node, { persist: false });
      return;
    }

    if (node.isPinned) {
      this.unpinNode(node, { persist: false, restartSimulation: false });
    }
  }

  private getPersistedNodeEntryForRuntimeId(runtimeId: string): { id: string; node: NonNullable<O3GraphRuntimeState["nodes"]>[string] } | null {
    const normalizedRuntimeId = String(runtimeId ?? "").trim();
    if (!normalizedRuntimeId) return null;
    const nodes = this.graphState?.nodes ?? {};
    const direct = nodes[normalizedRuntimeId];
    if (direct) return { id: normalizedRuntimeId, node: direct };

    for (const [persistedNodeId, node] of Object.entries(nodes)) {
      if (String(node?.runtimeId ?? "").trim() === normalizedRuntimeId) {
        return { id: persistedNodeId, node };
      }
    }
    return null;
  }

  private resolvePersistedNodeIdToRuntimeId(nodeId: string): string {
    const normalizedNodeId = String(nodeId ?? "").trim();
    if (!normalizedNodeId) return "";
    const node = this.graphState?.nodes?.[normalizedNodeId];
    return String(node?.runtimeId ?? "").trim() || normalizedNodeId;
  }

  private applyGraphViewportState(): void {
    const viewport = this.graphState?.viewport;
    if (!viewport) return;

    const zoom = Number(viewport.zoom);
    const x = Number(viewport.x);
    const y = Number(viewport.y);
    if (!Number.isFinite(zoom) || !Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }

    this.suppressViewportChangedEvents = true;
    this.camera.zoom = Math.max(0.1, Math.min(5, zoom));
    this.camera.x = x;
    this.camera.y = y;
    this.lastEmittedViewport = {
      x: this.camera.x,
      y: this.camera.y,
      zoom: this.camera.zoom
    };
    this.suppressViewportChangedEvents = false;
    this.hasRestoredViewportFromState = true;
    this.hasInitializedGravityCenteredViewport = true;
    this.refreshBadges();
  }

  centerViewportOnGravityCenter(options?: { zoom?: number; emit?: boolean }): void {
    if (!this.canvas) return;
    const canvasWidth = Math.max(1, this.canvas.width);
    const canvasHeight = Math.max(1, this.canvas.height);
    if (canvasWidth <= 1 || canvasHeight <= 1) return;

    const requestedZoom = Number(options?.zoom);
    const zoom = Number.isFinite(requestedZoom)
      ? this.clamp(requestedZoom, 0.1, 5)
      : this.clamp(this.camera.zoom, 0.1, 5);

    this.camera.zoom = zoom;
    this.camera.x = canvasWidth / (2 * zoom);
    this.camera.y = canvasHeight / (2 * zoom);
    this.lastEmittedViewport = {
      x: this.camera.x,
      y: this.camera.y,
      zoom: this.camera.zoom
    };
    this.hasInitializedGravityCenteredViewport = true;
    this.refreshBadges();
    this.safeDraw();
    if (options?.emit === true) {
      this.emitViewportChanged();
    }
  }

  private emitViewportChanged(options?: { isFinal?: boolean }): void {
    if (this.suppressViewportChangedEvents) return;
    const current = {
      x: this.camera.x,
      y: this.camera.y,
      zoom: this.camera.zoom
    };
    const last = this.lastEmittedViewport;
    if (
      last
      && Math.abs(last.x - current.x) < 1e-6
      && Math.abs(last.y - current.y) < 1e-6
      && Math.abs(last.zoom - current.zoom) < 1e-6
    ) {
      return;
    }
    this.lastEmittedViewport = current;
    this.onViewportChanged?.(current, options);
  }

  private removeNodeById(nodeId: string): void {
    const node = this.getNode(nodeId);
    if (!node) return;
    this.removeContainersOwnedByNode(nodeId);
    this.rememberNodePosition(node);
    this.nodes = this.nodes.filter(n => n !== node);
    this.syncNodeMapFromNodes();
    this.nodeMap.delete(nodeId);
    this.removePinIcon(node);
    this.removeLensIcon(node);
    this.pinnedNodePaths.delete(nodeId);
    this.nodeFillColors.delete(nodeId);
    this.parentLinkTypeCache.delete(nodeId);
    this.nodeParentBadgeTypes.delete(nodeId);
    const sourcePath = this.duplicateNodeSourceById.get(nodeId);
    if (sourcePath) {
      this.duplicateNodeSourceById.delete(nodeId);
      const siblings = this.duplicateNodeIdsBySourcePath.get(sourcePath);
      siblings?.delete(nodeId);
      if (siblings && siblings.size === 0) {
        this.duplicateNodeIdsBySourcePath.delete(sourcePath);
      }
    }
    this.badgesDirty = true;
  }

  private removeContainersOwnedByNode(nodeIdRaw: string): void {
    const nodeId = String(nodeIdRaw ?? "").trim();
    if (!nodeId) return;

    if (this.isReconcilingGraphTopology) return;

    for (const container of Array.from(this.embeddedGraphContainers.values())) {
      if (container.origin !== nodeId) continue;
      this.collapseEmbeddedGraph(container.origin, container.graphPath);
    }

    const ownedParentRequests = Array.from(this.expandedParentRequests.values())
      .filter((request) => request.origin === nodeId);
    for (const request of ownedParentRequests) {
      this.collapseParentLinks(request.origin, request.linkType);
    }

    for (const [key, container] of Array.from(this.parentContainers.entries())) {
      if (container.origin === nodeId) {
        this.parentContainers.delete(key);
      }
    }
  }

  reconcileEmbeddedGraphContainersAfterTopologyUpdate(): void {
    const claimedOrigins = new Set(
      Array.from(this.embeddedGraphContainers.values())
        .filter((container) => this.nodeMap.has(container.origin))
        .map((container) => container.origin)
    );
    for (const container of Array.from(this.embeddedGraphContainers.values())) {
      if (this.nodeMap.has(container.origin)) continue;
      const replacement = this.nodes
        .filter((node) =>
          !node.stateOwnerPath
          && node.sourcePath === container.originSourcePath
          && !claimedOrigins.has(node.id)
          && !this.getExpandedEmbeddedContainerForOrigin(node.id)
        )
        .sort((a, b) =>
          Math.hypot(a.x - container.lastOriginX, a.y - container.lastOriginY)
          - Math.hypot(b.x - container.lastOriginX, b.y - container.lastOriginY)
        )[0];
      if (!replacement) {
        this.collapseEmbeddedGraph(container.origin, container.graphPath);
        continue;
      }

      const previousKey = container.key;
      const nextKey = this.embeddedGraphKey(replacement.id, container.graphPath);
      this.embeddedGraphContainers.delete(previousKey);
      if (this.lockedEmbeddedGraphContainerKeys.delete(previousKey) || container.interactionLocked) {
        this.lockedEmbeddedGraphContainerKeys.add(nextKey);
        container.interactionLocked = true;
      }
      container.key = nextKey;
      container.origin = replacement.id;
      container.originSourcePath = replacement.sourcePath;
      container.lastOriginX = replacement.x;
      container.lastOriginY = replacement.y;
      this.embeddedGraphContainers.set(nextKey, container);
      claimedOrigins.add(replacement.id);

      for (const memberId of container.memberIds) {
        const member = this.nodeMap.get(memberId);
        if (member?.embeddedInstanceId === previousKey) {
          member.embeddedInstanceId = nextKey;
        }
      }
    }
  }

  private ensureNodeForFile(
    file: TFile,
    options: {
      anchorNode?: GraphNode | null;
      expandedVia?: GraphNode["expandedVia"] extends Array<infer T> ? T : never;
    } = {}
  ): GraphNode {
    const existing = this.nodeMap.get(file.path);
    if (existing) {
      existing.sourcePath = file.path;
      existing.label = this.lastLabels.get(file.path) ?? file.basename ?? file.name;
      existing.isMissingFile = false;
      const parentDepth = Math.max(0, options.anchorNode?.depth ?? 0);
      if (!existing.isBase) {
        const nextDepth = parentDepth + 1;
        existing.depth = Number.isFinite(existing.depth)
          ? Math.min(existing.depth, nextDepth)
          : nextDepth;
      } else {
        existing.depth = 0;
      }
      if (options.expandedVia) {
        const refs = existing.expandedVia ?? [];
        const hasRef = refs.some(ref =>
          ref.origin === options.expandedVia!.origin
          && ref.linkType === options.expandedVia!.linkType
          && ref.type === options.expandedVia!.type
        );
        if (!hasRef) {
          existing.expandedVia = [...refs, options.expandedVia];
        } else if (!existing.expandedVia) {
          existing.expandedVia = refs;
        }
      }
      return existing;
    }

    const anchor = options.anchorNode ?? null;
    const parentDepth = Math.max(0, options.anchorNode?.depth ?? 0);
    const initialPosition = anchor
      ? this.getExpandedChildInitialPosition(file.path, file.path, anchor, options.expandedVia?.linkType)
      : this.getInitialPositionForNewNode(file.path);
    const rememberedPosition = this.getRememberedNodePosition(file.path);
    const node: GraphNode = {
      id: file.path,
      sourcePath: file.path,
      label: this.lastLabels.get(file.path) ?? file.basename ?? file.name,
      x: initialPosition.x,
      y: initialPosition.y,
      vx: 0,
      vy: 0,
      mass: 1,
      isBase: false,
      depth: parentDepth + 1,
      ...(options.expandedVia ? { expandedVia: [options.expandedVia] } : {})
    };
    this.nodes.push(node);
    this.nodeMap.set(file.path, node);
    this.applyPinnedStateToNode(node, { restorePersistedPosition: rememberedPosition === null });
    this.badgesDirty = true;
    return node;
  }

  private ensureNodeForTarget(
    target: GraphLinkTarget,
    options: {
      anchorNode?: GraphNode | null;
      expandedVia?: GraphNode["expandedVia"] extends Array<infer T> ? T : never;
    } = {}
  ): GraphNode {
    if (target.file instanceof TFile) {
      return this.ensureNodeForFile(target.file, options);
    }
    return this.ensureMissingNodeForTarget(target, options);
  }

  private ensureMissingNodeForTarget(
    target: GraphLinkTarget,
    options: {
      anchorNode?: GraphNode | null;
      expandedVia?: GraphNode["expandedVia"] extends Array<infer T> ? T : never;
    } = {}
  ): GraphNode {
    const path = String(target.path ?? "").trim();
    if (!path) {
      throw new Error("Cannot create missing graph node without a path.");
    }
    const existing = this.nodeMap.get(path);
    const parentDepth = Math.max(0, options.anchorNode?.depth ?? 0);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      return this.ensureNodeForFile(file, options);
    }
    if (existing) {
      existing.sourcePath = path;
      existing.label = target.label || this.labelFromPath(path);
      existing.isMissingFile = true;
      existing.isBase = false;
      existing.depth = Number.isFinite(existing.depth)
        ? Math.min(existing.depth, parentDepth + 1)
        : parentDepth + 1;
      if (options.expandedVia) {
        const refs = existing.expandedVia ?? [];
        const hasRef = refs.some(ref =>
          ref.origin === options.expandedVia!.origin
          && ref.linkType === options.expandedVia!.linkType
          && ref.type === options.expandedVia!.type
        );
        if (!hasRef) {
          existing.expandedVia = [...refs, options.expandedVia];
        } else if (!existing.expandedVia) {
          existing.expandedVia = refs;
        }
      }
      return existing;
    }

    const anchor = options.anchorNode ?? null;
    const initialPosition = anchor
      ? this.getExpandedChildInitialPosition(path, path, anchor, options.expandedVia?.linkType)
      : this.getInitialPositionForNewNode(path);
    const rememberedPosition = this.getRememberedNodePosition(path);
    const node: GraphNode = {
      id: path,
      sourcePath: path,
      label: target.label || this.labelFromPath(path),
      x: rememberedPosition?.x ?? initialPosition.x,
      y: rememberedPosition?.y ?? initialPosition.y,
      vx: 0,
      vy: 0,
      mass: 1,
      isBase: false,
      depth: parentDepth + 1,
      isMissingFile: true,
      ...(options.expandedVia ? { expandedVia: [options.expandedVia] } : {})
    };
    this.nodes.push(node);
    this.nodeMap.set(path, node);
    this.applyPinnedStateToNode(node, { restorePersistedPosition: rememberedPosition === null });
    this.badgesDirty = true;
    return node;
  }

  private ensureDuplicateNodeForFile(
    file: TFile,
    nodeId: string,
    options: {
      anchorNode?: GraphNode | null;
      expandedVia?: GraphNode["expandedVia"] extends Array<infer T> ? T : never;
    } = {}
  ): GraphNode {
    const normalizedNodeId = String(nodeId ?? "").trim();
    if (!normalizedNodeId) {
      return this.ensureNodeForFile(file, options);
    }
    this.duplicateNodeSourceById.set(normalizedNodeId, file.path);
    if (!this.duplicateNodeIdsBySourcePath.has(file.path)) {
      this.duplicateNodeIdsBySourcePath.set(file.path, new Set<string>());
    }
    this.duplicateNodeIdsBySourcePath.get(file.path)!.add(normalizedNodeId);

    const existing = this.nodeMap.get(normalizedNodeId);
    const parentDepth = Math.max(0, options.anchorNode?.depth ?? 0);
    if (existing) {
      existing.sourcePath = file.path;
      existing.label = this.lastLabels.get(file.path) ?? file.basename ?? file.name;
      existing.isBase = false;
      existing.isMissingFile = false;
      existing.depth = Number.isFinite(existing.depth)
        ? Math.min(existing.depth, parentDepth + 1)
        : parentDepth + 1;
      if (options.expandedVia) {
        const refs = existing.expandedVia ?? [];
        const hasRef = refs.some(ref =>
          ref.origin === options.expandedVia!.origin
          && ref.linkType === options.expandedVia!.linkType
          && ref.type === options.expandedVia!.type
        );
        if (!hasRef) {
          existing.expandedVia = [...refs, options.expandedVia];
        } else if (!existing.expandedVia) {
          existing.expandedVia = refs;
        }
      }
      return existing;
    }

    const anchor = options.anchorNode ?? null;
    const initialPosition = anchor
      ? this.getExpandedChildInitialPosition(normalizedNodeId, file.path, anchor, options.expandedVia?.linkType)
      : this.ensureInitialPositionIsSeparated(this.getInitialPositionForNewNode(file.path), normalizedNodeId, null, options.expandedVia?.linkType);
    const rememberedPosition = this.getRememberedNodePosition(normalizedNodeId);
    const node: GraphNode = {
      id: normalizedNodeId,
      sourcePath: file.path,
      label: this.lastLabels.get(file.path) ?? file.basename ?? file.name,
      x: rememberedPosition?.x ?? initialPosition.x,
      y: rememberedPosition?.y ?? initialPosition.y,
      vx: 0,
      vy: 0,
      mass: 1,
      isBase: false,
      depth: parentDepth + 1,
      ...(options.expandedVia ? { expandedVia: [options.expandedVia] } : {})
    };
    this.nodes.push(node);
    this.nodeMap.set(normalizedNodeId, node);
    this.applyPinnedStateToNode(node, { restorePersistedPosition: rememberedPosition === null });
    this.badgesDirty = true;
    return node;
  }

  private ensureDuplicateNodeForTarget(
    target: GraphLinkTarget,
    nodeId: string,
    options: {
      anchorNode?: GraphNode | null;
      expandedVia?: GraphNode["expandedVia"] extends Array<infer T> ? T : never;
    } = {}
  ): GraphNode {
    if (target.file instanceof TFile) {
      return this.ensureDuplicateNodeForFile(target.file, nodeId, options);
    }

    const normalizedNodeId = String(nodeId ?? "").trim();
    if (!normalizedNodeId) {
      return this.ensureMissingNodeForTarget(target, options);
    }
    const sourcePath = String(target.path ?? "").trim();
    if (!sourcePath) {
      throw new Error("Cannot create duplicate missing graph node without a path.");
    }
    this.duplicateNodeSourceById.set(normalizedNodeId, sourcePath);
    if (!this.duplicateNodeIdsBySourcePath.has(sourcePath)) {
      this.duplicateNodeIdsBySourcePath.set(sourcePath, new Set<string>());
    }
    this.duplicateNodeIdsBySourcePath.get(sourcePath)!.add(normalizedNodeId);

    const existing = this.nodeMap.get(normalizedNodeId);
    const parentDepth = Math.max(0, options.anchorNode?.depth ?? 0);
    if (existing) {
      existing.sourcePath = sourcePath;
      existing.label = target.label || this.labelFromPath(sourcePath);
      existing.isBase = false;
      existing.isMissingFile = true;
      existing.depth = Number.isFinite(existing.depth)
        ? Math.min(existing.depth, parentDepth + 1)
        : parentDepth + 1;
      if (options.expandedVia) {
        const refs = existing.expandedVia ?? [];
        const hasRef = refs.some(ref =>
          ref.origin === options.expandedVia!.origin
          && ref.linkType === options.expandedVia!.linkType
          && ref.type === options.expandedVia!.type
        );
        if (!hasRef) {
          existing.expandedVia = [...refs, options.expandedVia];
        } else if (!existing.expandedVia) {
          existing.expandedVia = refs;
        }
      }
      return existing;
    }

    const anchor = options.anchorNode ?? null;
    const initialPosition = anchor
      ? this.getExpandedChildInitialPosition(normalizedNodeId, sourcePath, anchor, options.expandedVia?.linkType)
      : this.ensureInitialPositionIsSeparated(this.getInitialPositionForNewNode(sourcePath), normalizedNodeId, null, options.expandedVia?.linkType);
    const rememberedPosition = this.getRememberedNodePosition(normalizedNodeId);
    const node: GraphNode = {
      id: normalizedNodeId,
      sourcePath,
      label: target.label || this.labelFromPath(sourcePath),
      x: rememberedPosition?.x ?? initialPosition.x,
      y: rememberedPosition?.y ?? initialPosition.y,
      vx: 0,
      vy: 0,
      mass: 1,
      isBase: false,
      depth: parentDepth + 1,
      isMissingFile: true,
      ...(options.expandedVia ? { expandedVia: [options.expandedVia] } : {})
    };
    this.nodes.push(node);
    this.nodeMap.set(normalizedNodeId, node);
    this.applyPinnedStateToNode(node, { restorePersistedPosition: rememberedPosition === null });
    this.badgesDirty = true;
    return node;
  }

  private renderLinkTypeMenu(options: { resetScroll?: boolean } = {}) {
    this.menuList.empty();
    if (this.disableDefaultLinkTypeList) {
      if (this.menuOptions.renderLinkTypeMenuExtras) {
        const extrasHost = this.createElement("div");
        setStyle(extrasHost, "display", "grid");
        setStyle(extrasHost, "gap", "8px");
        setStyle(extrasHost, "padding", "2px");
        this.menuList.appendChild(extrasHost);
        this.menuOptions.renderLinkTypeMenuExtras(extrasHost);
      }
      if (options.resetScroll) {
        this.menuList.scrollTop = 0;
      }
      return;
    }

    const all = [NONE_LINK_TYPE, ...Array.from(new Set<string>([
      ...this.availableLinkTypes,
      ...this.selectedLinkTypes
    ])).filter(t => t !== NONE_LINK_TYPE).sort((a, b) => a.localeCompare(b))];
    const filtered = all.filter(t =>
      t.toLowerCase().includes(this.menuSearchTerm)
    );

    const selected: string[] = [];
    const unselected: string[] = [];
    for (const type of filtered) {
      if (this.selectedLinkTypes.has(type)) {
        selected.push(type);
      } else {
        unselected.push(type);
      }
    }

    const appendDivider = (label: string) => {
      const divider = this.createElement("div");
      divider.className = "linktype-divider";
      divider.textContent = label;
      setStyle(divider, "fontSize", "10px");
      setStyle(divider, "fontWeight", "600");
      setStyle(divider, "opacity", "0.7");
      setStyle(divider, "textTransform", "uppercase");
      setStyle(divider, "letterSpacing", "0.04em");
      setStyle(divider, "padding", "6px 2px 2px");
      setStyle(divider, "marginTop", "4px");
      setStyle(divider, "borderTop", "1px solid var(--background-modifier-border)");
      this.menuList.appendChild(divider);
    };

    const appendLinkTypeRow = (type: string) => {
      const row = this.createElement("div");
      setStyle(row, "display", "flex");
      setStyle(row, "flexDirection", "column");
      setStyle(row, "gap", "4px");
      setStyle(row, "padding", "4px 2px");

      const checkboxRow = this.createElement("label");
      setStyle(checkboxRow, "display", "flex");
      setStyle(checkboxRow, "alignItems", "center");
      setStyle(checkboxRow, "gap", "8px");
      setStyle(checkboxRow, "cursor", "pointer");

      const checkbox = this.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = this.selectedLinkTypes.has(type);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          this.selectedLinkTypes.add(type);
        } else {
          this.selectedLinkTypes.delete(type);
        }

        this.emitSelectedTypes();
        this.updateMenuCounter();
        this.rebuildEdges(this.lastFiles, this.lastLinkTypeSourceFiles);
        this.menuList.scrollTop = 0;
      });

      const text = this.createElement("span");
      text.textContent = type;

      checkboxRow.appendChild(checkbox);
      checkboxRow.appendChild(text);
      row.appendChild(checkboxRow);

      const physicsConfig = this.getLinkTypePhysicsConfig(type);
      const physicsBlock = this.createElement("div");
      setStyle(physicsBlock, "display", "grid");
      setStyle(physicsBlock, "gap", "4px");
      setStyle(physicsBlock, "marginLeft", "22px");

      const makePhysicsSlider = (config: {
        label: string;
        min: number;
        max: number;
        step: number;
        defaultValue: number;
        currentValue?: number;
        formatter: (value: number) => string;
        onChange: (value: number) => void;
      }) => {
        const wrap = this.createElement("div");
        setStyle(wrap, "display", "grid");
        setStyle(wrap, "gap", "2px");

        const labelRow = this.createElement("div");
        setStyle(labelRow, "display", "flex");
        setStyle(labelRow, "justifyContent", "space-between");
        setStyle(labelRow, "alignItems", "center");
        setStyle(labelRow, "fontSize", "10px");

        const labelEl = this.createElement("span");
        const valueEl = this.createElement("span");
        setStyle(valueEl, "fontFamily", "var(--font-monospace)");
        labelRow.appendChild(labelEl);
        labelRow.appendChild(valueEl);
        wrap.appendChild(labelRow);

        const slider = this.createElement("input");
        slider.type = "range";
        slider.min = String(config.min);
        slider.max = String(config.max);
        slider.step = String(config.step);
        const initialValue = Number.isFinite(config.currentValue)
          ? Number(config.currentValue)
          : config.defaultValue;
        slider.value = String(initialValue);
        setStyle(slider, "width", "100%");
        ["mousedown", "mouseup", "click", "wheel"].forEach(evt => {
          slider.addEventListener(evt, (e) => e.stopPropagation());
        });

        const renderLabel = (value: number) => {
          labelEl.textContent = `${config.label}: ${config.formatter(value)}`;
          valueEl.textContent = `(Default: ${config.formatter(config.defaultValue)})`;
        };
        renderLabel(initialValue);

        slider.addEventListener("input", () => {
          const next = Number(slider.value);
          if (!Number.isFinite(next)) return;
          renderLabel(next);
          config.onChange(next);
        });
        wrap.appendChild(slider);
        return wrap;
      };

      physicsBlock.appendChild(makePhysicsSlider({
        label: "Distance",
        min: 30,
        max: 400,
        step: 5,
        defaultValue: this.linkDistance,
        currentValue: physicsConfig.preferredDistance,
        formatter: (v) => String(Math.round(v)),
        onChange: (value) => this.setLinkTypePhysicsOverride(
          type,
          { preferredDistance: value },
          { rerenderMenu: false, reheatAmount: 0.15 }
        )
      }));

      physicsBlock.appendChild(makePhysicsSlider({
        label: "Strength",
        min: 0.005,
        max: 0.2,
        step: 0.005,
        defaultValue: this.linkStrength,
        currentValue: physicsConfig.strength,
        formatter: (v) => Number(v).toFixed(3).replace(/0+$/, "").replace(/\.$/, ""),
        onChange: (value) => this.setLinkTypePhysicsOverride(
          type,
          { strength: value },
          { rerenderMenu: false, reheatAmount: 0.15 }
        )
      }));

      row.appendChild(physicsBlock);
      this.menuList.appendChild(row);
    };

    if (selected.length > 0) {
      appendDivider("Active Link Types");
      for (const type of selected) {
        appendLinkTypeRow(type);
      }
    }

    if (unselected.length > 0) {
      appendDivider("Available Link Types");
      for (const type of unselected) {
        appendLinkTypeRow(type);
      }
    }

    if (this.menuOptions.renderLinkTypeMenuExtras) {
      appendDivider("Graph Link Type Config");
      const extrasHost = this.createElement("div");
      setStyle(extrasHost, "display", "grid");
      setStyle(extrasHost, "gap", "8px");
      setStyle(extrasHost, "padding", "6px 2px 2px");
      this.menuList.appendChild(extrasHost);
      this.menuOptions.renderLinkTypeMenuExtras(extrasHost);
    }

    if (options.resetScroll) {
      this.menuList.scrollTop = 0;
    }
  }

  refreshLinkTypeMenu(): void {
    if (!this.menuOpen) return;
    this.renderLinkTypeMenu();
  }

  private buildSettingsMenu() {
    this.settingsPanel.empty();
    this.settingControls = {};

    const title = this.createElement("div");
    title.textContent = "Graph Settings";
    setStyle(title, "fontWeight", "600");
    setStyle(title, "marginBottom", "10px");
    this.settingsPanel.appendChild(title);

    this.appendLayoutSetting();

    this.appendSliderSetting({
      key: "repulsionStrength",
      label: "Repellent force",
      min: 500,
      max: 20000,
      step: 100,
      value: this.repulsionStrength,
      formatter: (v) => String(Math.round(v)),
      onChange: (v) => {
        this.repulsionStrength = v;
        this.emitSettings();
      }
    });

    this.appendSliderSetting({
      key: "centerStrength",
      label: "Gravity",
      min: 0,
      max: 0.05,
      step: 0.001,
      value: this.centerStrength,
      formatter: (v) => v.toFixed(3),
      onChange: (v) => {
        this.centerStrength = v;
        this.emitSettings();
      }
    });

    this.appendSliderSetting({
      key: "nodeRadius",
      label: "Node size",
      min: 3,
      max: 20,
      step: 1,
      value: this.nodeRadius,
      formatter: (v) => String(Math.round(v)),
      onChange: (v) => {
        this.nodeRadius = v;
        this.emitSettings();
      }
    });

    this.appendSliderSetting({
      key: "nodeConnectionSizeMultiplier",
      label: "Connection size growth",
      min: 0,
      max: 6,
      step: 0.25,
      value: this.nodeConnectionSizeMultiplier,
      formatter: (v) => v.toFixed(2),
      onChange: (v) => {
        this.nodeConnectionSizeMultiplier = v;
        this.emitSettings();
      }
    });

    this.appendSliderSetting({
      key: "nearRestVelocityThreshold",
      label: "Near-rest velocity",
      min: 0.005,
      max: 1,
      step: 0.005,
      value: this.nearRestVelocityThreshold,
      formatter: (v) => v.toFixed(3),
      onChange: (v) => {
        this.nearRestVelocityThreshold = v;
        this.emitSettings();
      }
    });

    this.appendSliderSetting({
      key: "restVelocityThreshold",
      label: "Rest velocity",
      min: 0.001,
      max: 0.2,
      step: 0.001,
      value: this.restVelocityThreshold,
      formatter: (v) => v.toFixed(3),
      onChange: (v) => {
        this.restVelocityThreshold = v;
        this.emitSettings();
      }
    });

    this.appendSliderSetting({
      key: "textFadeThreshold",
      label: "Text fade threshold",
      min: 0,
      max: 100,
      step: 1,
      value: this.textFadeThreshold,
      formatter: (v) => v <= 0 ? "Hidden" : (v >= 100 ? "Always" : `${Math.round(v)}%`),
      onChange: (v) => {
        this.textFadeThreshold = this.normalizeTextFadeThreshold(v);
        this.emitSettings({ restartSimulation: false });
      }
    });

    this.appendToggleSetting({
      label: "Hide nodes without selected link types",
      value: this.hideNodesWithoutSelectedLinkTypes,
      onChange: (enabled) => {
        this.hideNodesWithoutSelectedLinkTypes = enabled;
        this.menuOptions.onHideNodesWithoutSelectedLinkTypesChange?.(enabled);
        this.rebuildEdges(this.lastFiles, this.lastLinkTypeSourceFiles);
      }
    });

    this.appendGroupingSettings();
  }

  private appendLayoutSetting() {
    const wrapper = this.createElement("div");
    setStyle(wrapper, "marginBottom", "10px");

    const label = this.createElement("div");
    label.textContent = "Layout";
    setStyle(label, "fontSize", "12px");
    setStyle(label, "marginBottom", "4px");
    wrapper.appendChild(label);

    const select = this.createElement("select");
    setStyle(select, "width", "100%");
    setStyle(select, "fontSize", "12px");
    setStyle(select, "padding", "2px 4px");

    for (const option of this.layoutOptions) {
      const entry = this.createElement("option");
      entry.value = option.id;
      entry.textContent = option.enabled === false ? `${option.label} (coming soon)` : option.label;
      entry.disabled = option.enabled === false;
      select.appendChild(entry);
    }

    select.value = this.activeLayoutId;
    if (!select.value) {
      select.value = FORCE_GRAPH_LAYOUT_ID;
    }
    select.addEventListener("change", () => {
      this.setLayout(select.value);
      select.value = this.activeLayoutId;
    });

    wrapper.appendChild(select);
    this.settingsPanel.appendChild(wrapper);
  }

  private appendSliderSetting(config: {
    key: SettingKey;
    label: string;
    min: number;
    max: number;
    step: number;
    value: number;
    formatter: (value: number) => string;
    onChange: (value: number) => void;
  }) {
    const wrapper = this.createElement("div");
    setStyle(wrapper, "marginBottom", "10px");

    const labelRow = this.createElement("div");
    setStyle(labelRow, "display", "flex");
    setStyle(labelRow, "justifyContent", "space-between");
    setStyle(labelRow, "fontSize", "12px");
    setStyle(labelRow, "marginBottom", "4px");

    const labelText = this.createElement("span");
    labelText.textContent = config.label;
    const valueText = this.createElement("span");
    valueText.textContent = config.formatter(config.value);
    setStyle(valueText, "fontFamily", "var(--font-monospace)");

    labelRow.appendChild(labelText);
    labelRow.appendChild(valueText);
    wrapper.appendChild(labelRow);

    const slider = this.createElement("input");
    slider.type = "range";
    slider.min = String(config.min);
    slider.max = String(config.max);
    slider.step = String(config.step);
    slider.value = String(config.value);
    setStyle(slider, "width", "100%");
    slider.addEventListener("input", () => {
      const value = Number(slider.value);
      if (!Number.isFinite(value)) return;
      valueText.textContent = config.formatter(value);
      config.onChange(value);
    });
    wrapper.appendChild(slider);

    this.settingControls[config.key] = {
      slider,
      valueText,
      formatter: config.formatter
    };

    this.settingsPanel.appendChild(wrapper);
  }

  private appendToggleSetting(config: {
    label: string;
    value: boolean;
    onChange: (value: boolean) => void;
  }) {
    const wrapper = this.createElement("label");
    setStyle(wrapper, "display", "flex");
    setStyle(wrapper, "alignItems", "center");
    setStyle(wrapper, "justifyContent", "space-between");
    setStyle(wrapper, "gap", "10px");
    setStyle(wrapper, "marginTop", "2px");
    setStyle(wrapper, "fontSize", "12px");

    const labelText = this.createElement("span");
    labelText.textContent = config.label;

    const checkbox = this.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = config.value;
    checkbox.addEventListener("change", () => {
      config.onChange(checkbox.checked);
    });

    wrapper.appendChild(labelText);
    wrapper.appendChild(checkbox);
    this.settingsPanel.appendChild(wrapper);
  }

  private appendGroupingSettings(): void {
    const section = this.createElement("details");
    section.open = false;
    setStyle(section, "marginTop", "12px");
    setStyle(section, "paddingTop", "8px");
    setStyle(section, "borderTop", "1px solid var(--background-modifier-border)");

    const summary = this.createElement("summary");
    summary.textContent = "Grouping";
    setStyle(summary, "cursor", "pointer");
    setStyle(summary, "fontWeight", "600");
    setStyle(summary, "fontSize", "12px");
    section.appendChild(summary);

    const body = this.createElement("div");
    setStyle(body, "display", "grid");
    setStyle(body, "gap", "8px");
    setStyle(body, "marginTop", "8px");
    section.appendChild(body);

    const addRow = this.createElement("div");
    setStyle(addRow, "display", "flex");
    setStyle(addRow, "justifyContent", "flex-start");

    const addBtn = this.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = "+ Add Rule";
    setStyle(addBtn, "fontSize", "11px");
    addBtn.addEventListener("click", () => {
      const defaultProperty = this.groupingPropertyOptions[0] ?? "";
      this.groupingRules = [
        ...this.groupingRules,
        {
          property: defaultProperty,
          operator: "equals",
          value: "",
          color: "#4caf50"
        }
      ];
      this.emitGroupingRules();
      this.updateNodeColors();
      this.buildSettingsMenu();
    });
    addRow.appendChild(addBtn);
    body.appendChild(addRow);

    if (this.groupingRules.length === 0) {
      const empty = this.createElement("div");
      empty.textContent = "No grouping rules";
      setStyle(empty, "fontSize", "11px");
      setStyle(empty, "opacity", "0.7");
      body.appendChild(empty);
    }

    this.groupingRules.forEach((rule, index) => {
      const ruleBox = this.createElement("div");
      setStyle(ruleBox, "display", "grid");
      setStyle(ruleBox, "gap", "6px");
      setStyle(ruleBox, "padding", "8px");
      setStyle(ruleBox, "border", "1px solid var(--background-modifier-border)");
      setStyle(ruleBox, "borderRadius", "6px");

      const field = (labelText: string) => {
        const wrap = this.createElement("label");
        setStyle(wrap, "display", "grid");
        setStyle(wrap, "gap", "2px");
        setStyle(wrap, "fontSize", "11px");
        const label = this.createElement("span");
        label.textContent = labelText;
        setStyle(label, "opacity", "0.8");
        wrap.appendChild(label);
        ruleBox.appendChild(wrap);
        return wrap;
      };

      const propertyField = field("Property");
      const propertySelect = this.createElement("select");
      setStyle(propertySelect, "fontSize", "11px");
      setStyle(propertySelect, "padding", "2px 4px");
      const propertyOptions = this.normalizeGroupingPropertyOptions([
        ...this.groupingPropertyOptions,
        rule.property
      ]);
      if (propertyOptions.length === 0) {
        const opt = this.createElement("option");
        opt.value = "";
        opt.textContent = "(No properties)";
        propertySelect.appendChild(opt);
      } else {
        for (const property of propertyOptions) {
          const opt = this.createElement("option");
          opt.value = property;
          opt.textContent = property;
          propertySelect.appendChild(opt);
        }
      }
      propertySelect.value = rule.property;
      propertySelect.addEventListener("change", () => {
        this.groupingRules[index] = { ...this.groupingRules[index], property: propertySelect.value };
        this.emitGroupingRules();
        this.updateNodeColors();
      });
      propertyField.appendChild(propertySelect);

      const conditionField = field("Condition");
      const conditionSelect = this.createElement("select");
      setStyle(conditionSelect, "fontSize", "11px");
      setStyle(conditionSelect, "padding", "2px 4px");
      for (const optionValue of ["equals", "contains", "exists"] as const) {
        const opt = this.createElement("option");
        opt.value = optionValue;
        opt.textContent = optionValue;
        conditionSelect.appendChild(opt);
      }
      conditionSelect.value = rule.operator;
      conditionSelect.addEventListener("change", () => {
        const operator = (conditionSelect.value === "contains" || conditionSelect.value === "exists")
          ? conditionSelect.value
          : "equals";
        this.groupingRules[index] = {
          ...this.groupingRules[index],
          operator,
          ...(operator === "exists" ? {} : { value: this.groupingRules[index]?.value ?? "" })
        };
        this.emitGroupingRules();
        this.updateNodeColors();
        this.buildSettingsMenu();
      });
      conditionField.appendChild(conditionSelect);

      if (rule.operator !== "exists") {
        const valueField = field("Value");
        const valueInput = this.createElement("input");
        valueInput.type = "text";
        valueInput.value = rule.value ?? "";
        setStyle(valueInput, "fontSize", "11px");
        setStyle(valueInput, "padding", "2px 4px");
        valueInput.addEventListener("input", () => {
          this.groupingRules[index] = { ...this.groupingRules[index], value: valueInput.value };
          this.emitGroupingRules();
          this.updateNodeColors();
        });
        valueField.appendChild(valueInput);
      }

      const colorField = field("Color");
      const colorInput = this.createElement("input");
      colorInput.type = "color";
      colorInput.value = /^#[0-9a-fA-F]{6}$/.test(rule.color) ? rule.color : "#4caf50";
      colorInput.addEventListener("input", () => {
        this.groupingRules[index] = { ...this.groupingRules[index], color: colorInput.value };
        this.emitGroupingRules();
        this.updateNodeColors();
      });
      colorField.appendChild(colorInput);

      const deleteBtn = this.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.textContent = "Delete Rule";
      setStyle(deleteBtn, "fontSize", "11px");
      setStyle(deleteBtn, "justifySelf", "start");
      deleteBtn.addEventListener("click", () => {
        this.groupingRules = this.groupingRules.filter((_, i) => i !== index);
        this.emitGroupingRules();
        this.updateNodeColors();
        this.buildSettingsMenu();
      });
      ruleBox.appendChild(deleteBtn);

      body.appendChild(ruleBox);
    });

    this.settingsPanel.appendChild(section);
  }

  private emitSettings(options?: { restartSimulation?: boolean }) {
    if (options?.restartSimulation !== false) {
      this.startSimulation();
    }
    this.requestRender();
    this.menuOptions.onSettingsChange?.({
      repulsionStrength: this.repulsionStrength,
      centerStrength: this.centerStrength,
      nodeRadius: this.nodeRadius,
      nodeConnectionSizeMultiplier: this.nodeConnectionSizeMultiplier,
      nearRestVelocityThreshold: this.nearRestVelocityThreshold,
      restVelocityThreshold: this.restVelocityThreshold,
      textFadeThreshold: this.textFadeThreshold
    });
  }

  // =========================
  // SIMULATION LOOP
  // =========================

  private startSimulation() {
    if (this.animationFrame !== null) return;
    this.settledFrameCount = 0;

    const step = (timestamp: number) => {
      const targetFrameInterval = this.getTargetFrameIntervalMs();
      if (timestamp - this.lastAnimationFrameAt < targetFrameInterval) {
        this.animationFrame = window.requestAnimationFrame(step);
        return;
      }

      this.lastAnimationFrameAt = timestamp;
      const maxVelocity = this.simulate();
      this.safeDraw();
      if (this.simulationFrozenByHotkey) {
        this.animationFrame = window.requestAnimationFrame(step);
        return;
      }
      if (!this.shouldContinueSimulation(maxVelocity)) {
        this.clearTopologyUpdateFreeze();
        this.animationFrame = null;
        return;
      }
      this.animationFrame = window.requestAnimationFrame(step);
    };

    this.animationFrame = window.requestAnimationFrame(step);
  }

  private getTargetFrameIntervalMs(): number {
    if (this.isInteractionActive()) return this.activeFrameIntervalMs;
    return this.lastSimulationMaxVelocity <= this.getEffectiveNearRestVelocityThreshold()
      ? this.nearSettleFrameIntervalMs
      : this.activeFrameIntervalMs;
  }

  private shouldContinueSimulation(maxVelocity: number): boolean {
    this.lastSimulationMaxVelocity = maxVelocity;
    if (this.isInteractionActive()) {
      this.clearTopologyUpdateFreeze();
      this.settledFrameCount = 0;
      return true;
    }
    if (maxVelocity > this.getEffectiveRestVelocityThreshold()) {
      this.settledFrameCount = 0;
      return true;
    }
    this.settledFrameCount += 1;
    return this.settledFrameCount < this.settleFrameCount;
  }

  private getEffectiveNearRestVelocityThreshold(): number {
    return Math.max(
      this.getEffectiveRestVelocityThreshold(),
      Number.isFinite(this.nearRestVelocityThreshold) ? Math.max(0, this.nearRestVelocityThreshold) : 0.08
    );
  }

  private getEffectiveRestVelocityThreshold(): number {
    return Number.isFinite(this.restVelocityThreshold) ? Math.max(0, this.restVelocityThreshold) : 0.015;
  }

  private isInteractionActive(): boolean {
    return this.isDraggingNode
      || this.isPanning
      || this.marqueeSelection !== null
      || this.pressedNode !== null;
  }

  private simulate(): number {
    if (this.simulationFrozenByHotkey) {
      return 0;
    }

    const activelyDraggedNode = this.isDraggingNode ? this.draggedNode : null;
    if (activelyDraggedNode) {
      const world = this.clientToWorld(this.dragPointerClient.x, this.dragPointerClient.y);
      this.updateDraggedNodePositions(world.x, world.y);
    }

    if (this.activeLayoutId === FORCE_GRAPH_LAYOUT_ID) {
      return this.simulateForceLayout(activelyDraggedNode);
    }

    // Layout engine not implemented yet; keep existing force behavior as fallback.
    return this.simulateForceLayout(activelyDraggedNode);
  }

  private computeDirectionLockedTargets(): void {
    const previousTargets = new Map<string, { x: number; y: number }>(this.directionLockedNodeTargets);
    this.directionLockedNodeTargets.clear();
    if (this.activeLinkTypeDirectionByProperty.size === 0 || this.edges.length === 0) {
      return;
    }

    const incomingByChild = new Map<string, Array<{
      parentId: string;
      property: string;
      config: { direction: DirectionPlacement; cx: number; cy: number };
      order: number;
    }>>();
    const directionSourceIds = new Set<string>();

    for (let i = 0; i < this.edges.length; i++) {
      const edge = this.edges[i];
      if (edge.mode === "overlay") continue;
      const property = this.normalizeLinkType(edge.linkType ?? edge.type);
      if (!property) continue;
      const config = this.activeLinkTypeDirectionByProperty.get(property);
      if (!config) continue;
      if (!this.nodeMap.has(edge.from) || !this.nodeMap.has(edge.to)) continue;
      directionSourceIds.add(edge.from);
      const arr = incomingByChild.get(edge.to) ?? [];
      arr.push({ parentId: edge.from, property, config, order: i });
      incomingByChild.set(edge.to, arr);
    }

    const directionChildIds = new Set<string>(incomingByChild.keys());
    const directionNodeIds = new Set<string>([...directionSourceIds, ...directionChildIds]);

    const siblingGroups = new Map<string, string[]>();
    for (const [childId, incoming] of incomingByChild.entries()) {
      if (incoming.length !== 1) continue;
      const only = incoming[0];
      const key = `${only.parentId}::${only.property}`;
      const list = siblingGroups.get(key) ?? [];
      list.push(childId);
      siblingGroups.set(key, list);
    }

    const orderedChildren = Array.from(incomingByChild.entries())
      .sort((a, b) => (a[1][0]?.order ?? 0) - (b[1][0]?.order ?? 0));

    // Keep previous solved positions for stability across expansion/collapse interactions.
    const workingTargets = new Map<string, { x: number; y: number }>();
    for (const nodeId of directionNodeIds) {
      const prev = previousTargets.get(nodeId);
      if (prev) {
        workingTargets.set(nodeId, { x: prev.x, y: prev.y });
      }
    }

    // Ensure root sources are anchored if not already preserved.
    for (const sourceId of directionSourceIds) {
      if (directionChildIds.has(sourceId)) continue;
      if (workingTargets.has(sourceId)) continue;
      const node = this.nodeMap.get(sourceId);
      if (!node) continue;
      workingTargets.set(sourceId, { x: node.x, y: node.y });
    }

    const occupied = new Set<string>();
    for (const [nodeId, pos] of workingTargets.entries()) {
      if (!directionNodeIds.has(nodeId)) continue;
      occupied.add(this.positionKey(pos.x, pos.y));
    }

    const pending = new Set<string>(incomingByChild.keys());
    let madeProgress = true;
    while (pending.size > 0 && madeProgress) {
      madeProgress = false;

      for (const [childId, incoming] of orderedChildren) {
        if (!pending.has(childId)) continue;
        if (workingTargets.has(childId)) {
          pending.delete(childId);
          continue;
        }

        const child = this.nodeMap.get(childId);
        if (!child || incoming.length === 0) {
          pending.delete(childId);
          continue;
        }

        const first = incoming[0];
        const config = first.config;
        const cx = Math.max(1, Number.isFinite(config.cx) ? Number(config.cx) : 120);
        const cy = Math.max(1, Number.isFinite(config.cy) ? Number(config.cy) : 120);
        const parentNodes = incoming
          .map((entry) => workingTargets.get(entry.parentId))
          .filter((node): node is { x: number; y: number } => Boolean(node));

        if (parentNodes.length === 0) {
          continue;
        }

        let x = child.x;
        let y = child.y;

        if (parentNodes.length === 1) {
          const parent = parentNodes[0];
          const siblingKey = `${first.parentId}::${first.property}`;
          const siblings = siblingGroups.get(siblingKey) ?? [childId];
          const k = Math.max(0, siblings.indexOf(childId));
          const n = Math.max(1, siblings.length);
          const offset = (n - 1) / 2;

          if (config.direction === "right") {
            x = parent.x + cx;
            y = parent.y + (k - offset) * cy;
          } else if (config.direction === "left") {
            x = parent.x - cx;
            y = parent.y + (k - offset) * cy;
          } else if (config.direction === "down") {
            y = parent.y + cy;
            x = parent.x + (k - offset) * cx;
          } else {
            y = parent.y - cy;
            x = parent.x + (k - offset) * cx;
          }
        } else {
          const xs = parentNodes.map((n) => n.x);
          const ys = parentNodes.map((n) => n.y);
          if (config.direction === "right") {
            x = Math.max(...xs.map((px) => px + cx));
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            y = Math.round((((minY + maxY) / 2) / cy)) * cy;
          } else if (config.direction === "left") {
            x = Math.min(...xs.map((px) => px - cx));
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            y = Math.round((((minY + maxY) / 2) / cy)) * cy;
          } else if (config.direction === "down") {
            y = Math.max(...ys.map((py) => py + cy));
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            x = Math.round((((minX + maxX) / 2) / cx)) * cx;
          } else {
            y = Math.min(...ys.map((py) => py - cy));
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            x = Math.round((((minX + maxX) / 2) / cx)) * cx;
          }
        }

        let key = this.positionKey(x, y);
        if (config.direction === "right" || config.direction === "left") {
          while (occupied.has(key)) {
            y += cy;
            key = this.positionKey(x, y);
          }
        } else {
          while (occupied.has(key)) {
            x += cx;
            key = this.positionKey(x, y);
          }
        }

        occupied.add(key);
        workingTargets.set(childId, { x, y });
        pending.delete(childId);
        madeProgress = true;
      }
    }

    // Fallback for unresolved cycles: keep current on-canvas position and lock it.
    for (const childId of pending) {
      const node = this.nodeMap.get(childId);
      if (!node) continue;
      workingTargets.set(childId, { x: node.x, y: node.y });
    }

    this.directionLockedNodeTargets = workingTargets;
  }

  private simulateForceLayout(activelyDraggedNode: GraphNode | null): number {
    this.syncParentContainers();
    this.syncEmbeddedGraphContainers();
    if (this.directionLayoutDirty) {
      this.computeDirectionLockedTargets();
      this.directionLayoutDirty = false;
    }
    const isDirectionLocked = (node: GraphNode): boolean => this.directionLockedNodeTargets.has(node.id);
    const isAltDragFrozen = (node: GraphNode): boolean => this.altDragFrozenNodeIds.has(node.id);
    const isTopologyUpdateFrozen = (node: GraphNode): boolean => this.topologyUpdateFrozenNodeIds.has(node.id);
    const ownsOpenLens = (node: GraphNode): boolean => this.embeddedGraphContainersHasOrigin(node.id);
    const isActivelyDragged = (node: GraphNode): boolean =>
      activelyDraggedNode === node || this.draggedNodeOriginPositions.has(node.id);
    const draggedLensDescendantIds = activelyDraggedNode
      ? this.getDraggedLensDescendantNodeIds()
      : new Set<string>();
    const isDraggedLensDescendant = (node: GraphNode): boolean => draggedLensDescendantIds.has(node.id);

    // Repulsion (O(n^2))
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {

        const n1 = this.nodes[i];
        const n2 = this.nodes[j];
        if (this.nodesAreSeparatedByContainerBoundary(n1, n2)) {
          continue;
        }

        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;

        const distance = Math.hypot(dx, dy) || 1;
        const boundaryDistance = Math.max(
          1,
          distance - this.getEffectiveNodeRadius(n1) - this.getEffectiveNodeRadius(n2)
        );
        const force = this.clamp(this.repulsionStrength / boundaryDistance, 0, 8);

        const fx = force * (dx / distance);
        const fy = force * (dy / distance);

        const n1Dragged = isActivelyDragged(n1);
        const n2Dragged = isActivelyDragged(n2);

        if (!n1Dragged && !isDraggedLensDescendant(n1) && !ownsOpenLens(n1) && !isDirectionLocked(n1) && !isAltDragFrozen(n1) && !isTopologyUpdateFrozen(n1)) {
          n1.vx -= fx;
          n1.vy -= fy;
        }
        if (!n2Dragged && !isDraggedLensDescendant(n2) && !ownsOpenLens(n2) && !isDirectionLocked(n2) && !isAltDragFrozen(n2) && !isTopologyUpdateFrozen(n2)) {
          n2.vx += fx;
          n2.vy += fy;
        }
      }
    }

    this.applyContainerRepulsion(
      isActivelyDragged,
      isDirectionLocked,
      isAltDragFrozen,
      isTopologyUpdateFrozen,
      isDraggedLensDescendant
    );
    this.applyContainerToContainerRepulsion();

    // Link springs
    for (const e of this.edges) {
      if (e.mode === "overlay") continue;

      const n1 = this.nodeMap.get(e.from);
      const n2 = this.nodeMap.get(e.to);
      if (!n1 || !n2) continue;
      if (this.nodesAreSeparatedByContainerBoundary(n1, n2)) continue;

      const geometry = this.getPhysicsEdgeBoundaryGeometry(n1, n2);
      const edgePhysics = this.getEdgePhysics(e);
      const diff = geometry.gap - edgePhysics.preferredDistance;
      const force = this.clamp(edgePhysics.strength * diff, -5, 5);

      const fx = geometry.directionX * force;
      const fy = geometry.directionY * force;

      if (!isActivelyDragged(n1) && !isDraggedLensDescendant(n1) && !ownsOpenLens(n1) && !isDirectionLocked(n1) && !isAltDragFrozen(n1) && !isTopologyUpdateFrozen(n1)) {
        n1.vx += fx;
        n1.vy += fy;
      }
      if (!isActivelyDragged(n2) && !isDraggedLensDescendant(n2) && !ownsOpenLens(n2) && !isDirectionLocked(n2) && !isAltDragFrozen(n2) && !isTopologyUpdateFrozen(n2)) {
        n2.vx -= fx;
        n2.vy -= fy;
      }
    }

    // Integrate
    let maxVelocity = 0;
    for (const n of this.nodes) {
      if (isDraggedLensDescendant(n) || (ownsOpenLens(n) && !isActivelyDragged(n)) || isTopologyUpdateFrozen(n)) {
        n.vx = 0;
        n.vy = 0;
        continue;
      }
      const directionTarget = this.directionLockedNodeTargets.get(n.id);
      if (directionTarget && !isActivelyDragged(n)) {
        n.vx = 0;
        n.vy = 0;
        n.x = directionTarget.x;
        n.y = directionTarget.y;
        continue;
      }
      if (n.isLocked) {
        n.vx = 0;
        n.vy = 0;
        if (Number.isFinite(n.lockX)) {
          n.x = Number(n.lockX);
        }
        if (Number.isFinite(n.lockY)) {
          n.y = Number(n.lockY);
        }
        continue;
      }
      if (isAltDragFrozen(n)) {
        n.vx = 0;
        n.vy = 0;
        continue;
      }
      if (isActivelyDragged(n)) continue;
      const embeddedContainer = n.embeddedInstanceId
        ? this.embeddedGraphContainers.get(n.embeddedInstanceId)
        : null;
      if (embeddedContainer) {
        const gravityCenter = this.getEmbeddedContainerGravityCenter(embeddedContainer);
        const centerX = gravityCenter.x;
        const centerY = gravityCenter.y;
        const dx = centerX - n.x;
        const dy = centerY - n.y;
        const distance = Math.hypot(dx, dy);
        const centeringDeadZone = Math.max(this.getEffectiveRestVelocityThreshold() * 8, 0.25);
        if (distance > centeringDeadZone) {
          const forceScale = ((distance - centeringDeadZone) / distance) * embeddedContainer.linkForce;
          n.vx += dx * forceScale;
          n.vy += dy * forceScale;
        }
      } else if (!this.isNodeInsideParentContainer(n.id)) {
        n.vx += -n.x * this.centerStrength;
        n.vy += -n.y * this.centerStrength;
      }
      n.vx *= this.damping;
      n.vy *= this.damping;

      n.x += n.vx;
      n.y += n.vy;
      this.constrainNodeToParentContainers(n);
      this.constrainNodeToEmbeddedGraphContainer(n);
      maxVelocity = Math.max(maxVelocity, Math.hypot(n.vx, n.vy));
    }
    maxVelocity = Math.max(maxVelocity, this.anchorContainersToParents());
    for (const node of this.nodes) {
      this.constrainNodeToParentContainers(node);
      this.constrainNodeToEmbeddedGraphContainer(node);
    }
    return maxVelocity;
  }

  private applyContainerRepulsion(
    isActivelyDragged: (node: GraphNode) => boolean,
    isDirectionLocked: (node: GraphNode) => boolean,
    isAltDragFrozen: (node: GraphNode) => boolean,
    isTopologyUpdateFrozen: (node: GraphNode) => boolean,
    isDraggedLensDescendant: (node: GraphNode) => boolean = () => false
  ): void {
    const influenceDistance = Math.max(120, this.nodeRadius * 16);
    const containers = [
      ...Array.from(this.parentContainers.values()),
      ...Array.from(this.embeddedGraphContainers.values())
    ];
    for (const container of containers) {
      const containerCircle = this.getContainerPhysicsCircle(container);
      const origin = this.nodeMap.get(container.origin);
      for (const node of this.nodes) {
        if (
          node.id === container.origin
          || this.isNodePartOfContainer(node, container)
          || (origin && this.nodesAreSeparatedByContainerBoundary(origin, node))
          || isActivelyDragged(node)
          || isDirectionLocked(node)
          || isAltDragFrozen(node)
          || isTopologyUpdateFrozen(node)
          || isDraggedLensDescendant(node)
          || node.isLocked
        ) {
          continue;
        }

        const radius = this.getEffectiveNodeRadius(node);
        let dx = node.x - containerCircle.x;
        let dy = node.y - containerCircle.y;
        let centerDistance = Math.hypot(dx, dy);
        if (centerDistance < 0.001) {
          const angle = this.deterministicAngle(`${container.key}::${node.id}`);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          centerDistance = 1;
        }
        const boundaryDistance = centerDistance - containerCircle.radius - radius;
        if (boundaryDistance > influenceDistance) continue;

        const magnitude = boundaryDistance <= 0
          ? this.clamp(
              this.repulsionStrength / Math.max(20, Math.abs(boundaryDistance)),
              0.5,
              8
            )
          : this.clamp(
              (this.repulsionStrength / Math.max(1, boundaryDistance))
              * (1 - boundaryDistance / influenceDistance),
              0,
              8
            );
        const fx = (dx / centerDistance) * magnitude;
        const fy = (dy / centerDistance) * magnitude;
        node.vx += fx;
        node.vy += fy;
        if (
          origin
          && origin.id !== node.id
          && !isActivelyDragged(origin)
          && !this.embeddedGraphContainersHasOrigin(origin.id)
          && !isDirectionLocked(origin)
          && !isAltDragFrozen(origin)
          && !isTopologyUpdateFrozen(origin)
          && !isDraggedLensDescendant(origin)
          && !origin.isLocked
        ) {
          origin.vx -= fx;
          origin.vy -= fy;
        }
      }
    }
  }

  private getContainerPhysicsCircle(
    container: ParentContainerState | EmbeddedGraphContainerState
  ): { x: number; y: number; radius: number } {
    if ("graphPath" in container) {
      const origin = this.nodeMap.get(container.origin);
      if (origin) {
        return {
          x: origin.x,
          y: origin.y,
          radius: this.getEffectiveNodeRadius(origin)
        };
      }
    }
    const width = Math.max(1, container.right - container.left);
    const height = Math.max(1, container.bottom - container.top);
    return {
      x: (container.left + container.right) / 2,
      y: (container.top + container.bottom) / 2,
      radius: Math.max(width, height) / 2
    };
  }

  private isNodePartOfContainer(
    node: GraphNode,
    container: ParentContainerState | EmbeddedGraphContainerState
  ): boolean {
    if (container.memberIds.has(node.id)) return true;
    return "graphPath" in container
      && node.embeddedAncestry?.includes(container.graphPath) === true;
  }

  private applyContainerToContainerRepulsion(): void {
    const repulsion = Math.max(0, this.repulsionStrength);
    if (repulsion <= 0) return;
    const containers = [
      ...Array.from(this.parentContainers.values()),
      ...Array.from(this.embeddedGraphContainers.values())
    ];
    const influenceDistance = Math.max(36, this.nodeRadius * 4);
    for (let firstIndex = 0; firstIndex < containers.length; firstIndex++) {
      for (let secondIndex = firstIndex + 1; secondIndex < containers.length; secondIndex++) {
        const first = containers[firstIndex];
        const second = containers[secondIndex];
        if (!this.shouldContainersRepel(first, second)) continue;

        const firstCircle = this.getContainerPhysicsCircle(first);
        const secondCircle = this.getContainerPhysicsCircle(second);
        let dx = secondCircle.x - firstCircle.x;
        let dy = secondCircle.y - firstCircle.y;
        let centerDistance = Math.hypot(dx, dy);
        if (centerDistance < 0.001) {
          const angle = this.deterministicAngle(`${first.key}::${second.key}`);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          centerDistance = 1;
        }
        const boundaryDistance = centerDistance - firstCircle.radius - secondCircle.radius;
        if (boundaryDistance > influenceDistance) continue;

        const magnitude = boundaryDistance <= 0
          ? this.clamp(
              (repulsion / 20)
              * (0.35 + Math.min(1, Math.abs(boundaryDistance) / influenceDistance)),
              0,
              repulsion / 40
            )
          : this.clamp(
              (repulsion / Math.max(1, boundaryDistance))
              * (1 - boundaryDistance / influenceDistance),
              0,
              repulsion / 40
            );
        const fx = (dx / centerDistance) * magnitude;
        const fy = (dy / centerDistance) * magnitude;
        const firstOrigin = this.nodeMap.get(first.origin);
        const secondOrigin = this.nodeMap.get(second.origin);
        if (firstOrigin && !firstOrigin.isLocked) {
          firstOrigin.vx -= fx;
          firstOrigin.vy -= fy;
        }
        if (secondOrigin && !secondOrigin.isLocked) {
          secondOrigin.vx += fx;
          secondOrigin.vy += fy;
        }
      }
    }
  }

  private shouldContainersRepel(
    first: ParentContainerState | EmbeddedGraphContainerState,
    second: ParentContainerState | EmbeddedGraphContainerState
  ): boolean {
    if (first.key === second.key) return false;
    if (first.memberIds.has(second.origin) || second.memberIds.has(first.origin)) return false;
    for (const nodeId of first.memberIds) {
      if (second.memberIds.has(nodeId)) return false;
    }
    return true;
  }

  private isNodePartOfEmbeddedContainer(
    node: GraphNode,
    container: EmbeddedGraphContainerState
  ): boolean {
    return container.memberIds.has(node.id)
      || node.embeddedAncestry?.includes(container.graphPath) === true;
  }

  private syncEmbeddedGraphContainers(): void {
    for (const container of this.embeddedGraphContainers.values()) {
      const origin = this.nodeMap.get(container.origin);
      const width = this.getEmbeddedGraphViewportWidth(origin);
      const height = this.getEmbeddedGraphViewportHeight(origin);
      container.viewportWidth = width;
      container.viewportHeight = height;
      const centerX = (container.left + container.right) / 2;
      const centerY = (container.top + container.bottom) / 2;
      container.left = centerX - width / 2;
      container.right = centerX + width / 2;
      container.top = centerY - height / 2;
      container.bottom = centerY + height / 2;
    }
  }

  private getEmbeddedGraphViewportWidth(origin?: GraphNode): number {
    const radius = origin ? this.getEffectiveNodeRadius(origin) : this.nodeRadius;
    return Math.max(this.getMinimumContainerViewportSize(), radius * 2.8);
  }

  private getEmbeddedGraphViewportHeight(origin?: GraphNode): number {
    const radius = origin ? this.getEffectiveNodeRadius(origin) : this.nodeRadius;
    return Math.max(this.getMinimumContainerViewportSize(), radius * 2.8);
  }

  private getGraphLensWidth(origin?: GraphNode): number {
    const radius = origin ? this.getEffectiveNodeRadius(origin) : this.nodeRadius;
    return Math.max(220, radius * 12);
  }

  private getGraphLensHeight(origin?: GraphNode): number {
    const radius = origin ? this.getEffectiveNodeRadius(origin) : this.nodeRadius;
    return Math.max(160, radius * 8);
  }

  private getMinimumContainerViewportSize(): number {
    return Math.max(44, this.nodeRadius * 2.2);
  }

  private constrainNodeToEmbeddedGraphContainer(node: GraphNode): void {
    // Embedded graph nodes use their own raw layout space and are fitted into
    // the visible container at render time. Clamping raw positions to the small
    // viewport collapses the internal graph and makes expansions unusable.
  }

  private syncParentContainers(): void {
    const directChildrenByKey = new Map<string, Set<string>>();
    const requestByKey = new Map<string, { origin: string; linkType: string }>();

    for (const [key, request] of this.expandedParentRequests.entries()) {
      requestByKey.set(key, request);
    }

    for (const edge of this.edges) {
      if (edge.relationship !== "parent" || !edge.origin || !edge.linkType) continue;
      const key = this.buildExpandedParentRequestKey(edge.origin, edge.linkType);
      if (!requestByKey.has(key)) continue;
      const members = directChildrenByKey.get(key) ?? new Set<string>();
      members.add(edge.to);
      directChildrenByKey.set(key, members);
    }

    const nextKeys = new Set<string>();
    for (const [key, request] of requestByKey.entries()) {
      // A parent container owns only the targets discovered by this exact
      // expansion. Other badge expansions and nested parent relationships
      // retain their own layout/container ownership.
      const memberIds = new Set(directChildrenByKey.get(key) ?? []);
      const memberNodes = Array.from(memberIds)
        .map((id) => this.nodeMap.get(id))
        .filter((node): node is GraphNode => Boolean(node));
      if (memberNodes.length === 0) continue;

      nextKeys.add(key);
      const padding = Math.max(6, this.nodeRadius * 0.45);
      const minLeft = Math.min(...memberNodes.map((node) => node.x - this.getEffectiveNodeRadius(node))) - padding;
      const minTop = Math.min(...memberNodes.map((node) => node.y - this.getEffectiveNodeRadius(node))) - padding;
      const maxRight = Math.max(...memberNodes.map((node) => node.x + this.getEffectiveNodeRadius(node))) + padding;
      const maxBottom = Math.max(...memberNodes.map((node) => node.y + this.getEffectiveNodeRadius(node))) + padding;
      const minWidth = this.getMinimumContainerViewportSize();
      const minHeight = this.getMinimumContainerViewportSize();
      const desiredWidth = Math.max(minWidth, maxRight - minLeft);
      const desiredHeight = Math.max(minHeight, maxBottom - minTop);
      const centerX = (minLeft + maxRight) / 2;
      const centerY = (minTop + maxBottom) / 2;
      const desired = {
        left: centerX - desiredWidth / 2,
        top: centerY - desiredHeight / 2,
        right: centerX + desiredWidth / 2,
        bottom: centerY + desiredHeight / 2
      };
      const visual = this.activeLinkTypeVisualByProperty.get(this.normalizeLinkType(request.linkType));
      const color = this.normalizeBadgeColor(visual?.color ?? "#6e96dc");
      const existing = this.parentContainers.get(key);
      if (!existing) {
        const originNode = this.nodeMap.get(request.origin);
        const container: ParentContainerState = {
          key,
          origin: request.origin,
          linkType: request.linkType,
          memberIds,
          ...desired,
          color,
          lastOriginX: originNode?.x ?? centerX,
          lastOriginY: originNode?.y ?? centerY,
          ...this.createContainerAnchorState(originNode, desired)
        };
        if (originNode) {
          this.attachContainerToOrigin(container, originNode, desiredWidth, desiredHeight, false);
        }
        this.parentContainers.set(key, container);
        continue;
      }

      existing.memberIds = memberIds;
      existing.color = color;
      existing.origin = request.origin;
      existing.linkType = request.linkType;
      existing.left = desired.left;
      existing.right = desired.right;
      existing.top = desired.top;
      existing.bottom = desired.bottom;
    }

    for (const key of Array.from(this.parentContainers.keys())) {
      if (!nextKeys.has(key)) {
        this.parentContainers.delete(key);
      }
    }
  }

  private createContainerAnchorState(
    parent: GraphNode | undefined,
    bounds: Pick<ParentContainerState, "left" | "top" | "right" | "bottom">
  ): Pick<
    ParentContainerState,
    "anchorDirectionX" | "anchorDirectionY"
    | "anchorVelocityX" | "anchorVelocityY"
    | "collisionPressureX" | "collisionPressureY"
  > {
    const centerX = (bounds.left + bounds.right) / 2;
    const centerY = (bounds.top + bounds.bottom) / 2;
    const dx = centerX - (parent?.x ?? centerX - 1);
    const dy = centerY - (parent?.y ?? centerY);
    const length = Math.hypot(dx, dy) || 1;
    return {
      anchorDirectionX: dx / length,
      anchorDirectionY: dy / length,
      anchorVelocityX: 0,
      anchorVelocityY: 0,
      collisionPressureX: 0,
      collisionPressureY: 0
    };
  }

  private attachContainerToOrigin(
    container: ParentContainerState | EmbeddedGraphContainerState,
    parent: GraphNode,
    widthRaw: number,
    heightRaw: number,
    translateMembers = true
  ): void {
    const radius = this.getEffectiveNodeRadius(parent);
    const gap = Math.max(4, radius * 0.2);
    const width = Math.max(this.getMinimumContainerViewportSize(), widthRaw);
    const height = Math.max(this.getMinimumContainerViewportSize(), heightRaw);
    const oldCenterX = (container.left + container.right) / 2;
    const oldCenterY = (container.top + container.bottom) / 2;
    const directionLength = Math.hypot(container.anchorDirectionX, container.anchorDirectionY) || 1;
    const ux = container.anchorDirectionX / directionLength;
    const uy = container.anchorDirectionY / directionLength;
    container.anchorDirectionX = ux;
    container.anchorDirectionY = uy;
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const supportX = Math.abs(ux) > 0.0001 ? halfWidth / Math.abs(ux) : Number.POSITIVE_INFINITY;
    const supportY = Math.abs(uy) > 0.0001 ? halfHeight / Math.abs(uy) : Number.POSITIVE_INFINITY;
    const centerDistance = Math.min(supportX, supportY) + radius + gap;
    const centerX = parent.x + ux * centerDistance;
    const centerY = parent.y + uy * centerDistance;
    container.left = centerX - halfWidth;
    container.right = centerX + halfWidth;
    container.top = centerY - halfHeight;
    container.bottom = centerY + halfHeight;
    if (!translateMembers) return;
    const dx = centerX - oldCenterX;
    const dy = centerY - oldCenterY;
    const translationDeadZone = Math.max(this.getEffectiveRestVelocityThreshold(), 0.01);
    if (Math.hypot(dx, dy) < translationDeadZone) return;
    for (const nodeId of container.memberIds) {
      const node = this.nodeMap.get(nodeId);
      if (!node) continue;
      node.x += dx;
      node.y += dy;
      if (Number.isFinite(node.fx)) node.fx = Number(node.fx) + dx;
      if (Number.isFinite(node.fy)) node.fy = Number(node.fy) + dy;
    }
  }

  private attachEmbeddedContainerToOrigin(
    container: EmbeddedGraphContainerState,
    parent: GraphNode,
    widthRaw: number,
    heightRaw: number,
    translateMembers = true
  ): void {
    const width = Math.max(this.getMinimumContainerViewportSize(), widthRaw);
    const height = Math.max(this.getMinimumContainerViewportSize(), heightRaw);
    const oldCenterX = (container.left + container.right) / 2;
    const oldCenterY = (container.top + container.bottom) / 2;
    const centerX = parent.x;
    const centerY = parent.y;
    container.left = centerX - width / 2;
    container.right = centerX + width / 2;
    container.top = centerY - height / 2;
    container.bottom = centerY + height / 2;
    if (!translateMembers) return;
    const dx = centerX - oldCenterX;
    const dy = centerY - oldCenterY;
    const translationDeadZone = Math.max(this.getEffectiveRestVelocityThreshold(), 0.01);
    if (Math.hypot(dx, dy) < translationDeadZone) return;
    for (const nodeId of container.memberIds) {
      const node = this.nodeMap.get(nodeId);
      if (!node) continue;
      node.x += dx;
      node.y += dy;
      if (Number.isFinite(node.fx)) node.fx = Number(node.fx) + dx;
      if (Number.isFinite(node.fy)) node.fy = Number(node.fy) + dy;
    }
  }

  private constrainNodeToParentContainers(node: GraphNode): void {
    const memberships = Array.from(this.parentContainers.values())
      .filter((container) => container.memberIds.has(node.id));
    if (memberships.length === 0) return;

    const radius = this.getEffectiveNodeRadius(node);
    for (const container of memberships) {
      const minX = container.left + radius + 10;
      const maxX = container.right - radius - 10;
      const minY = container.top + radius + 18;
      const maxY = container.bottom - radius - 10;
      const nextX = this.clamp(node.x, minX, maxX);
      const nextY = this.clamp(node.y, minY, maxY);
      if (nextX !== node.x) node.vx = 0;
      if (nextY !== node.y) node.vy = 0;
      node.x = nextX;
      node.y = nextY;
    }
  }

  private isNodeInsideParentContainer(nodeIdRaw: string): boolean {
    const nodeId = String(nodeIdRaw ?? "").trim();
    if (!nodeId) return false;
    return Array.from(this.parentContainers.values())
      .some((container) => container.memberIds.has(nodeId));
  }

  private nodesAreSeparatedByContainerBoundary(first: GraphNode, second: GraphNode): boolean {
    const firstContainers = this.getNodeContainerKeys(first);
    const secondContainers = this.getNodeContainerKeys(second);
    if (firstContainers.size === 0 && secondContainers.size === 0) return false;
    return !Array.from(firstContainers).some((key) => secondContainers.has(key));
  }

  private getNodeContainerKeys(node: GraphNode): Set<string> {
    const keys = new Set<string>();
    for (const container of this.parentContainers.values()) {
      if (container.memberIds.has(node.id)) keys.add(`parent:${container.key}`);
    }
    for (const container of this.embeddedGraphContainers.values()) {
      if (this.isNodePartOfEmbeddedContainer(node, container)) keys.add(`embedded:${container.key}`);
    }
    return keys;
  }

  private anchorContainersToParents(): number {
    const containers = [
      ...Array.from(this.parentContainers.values()),
      ...Array.from(this.embeddedGraphContainers.values())
    ];
    const velocityDeadZone = Math.max(this.getEffectiveRestVelocityThreshold(), 0.02);
    for (const container of containers) {
      container.anchorVelocityX = 0;
      container.anchorVelocityY = 0;
      container.collisionPressureX = 0;
      container.collisionPressureY = 0;
    }
    for (const container of containers) {
      const origin = this.nodeMap.get(container.origin);
      if (!origin) continue;
      const originMovement = Math.hypot(
        origin.x - (Number.isFinite(container.lastOriginX) ? container.lastOriginX : origin.x),
        origin.y - (Number.isFinite(container.lastOriginY) ? container.lastOriginY : origin.y)
      );
      if ("graphPath" in container) {
        this.attachEmbeddedContainerToOrigin(
          container,
          origin,
          container.right - container.left,
          container.bottom - container.top,
          false
        );
      } else {
        this.attachContainerToOrigin(
          container,
          origin,
          container.right - container.left,
          container.bottom - container.top,
          originMovement >= velocityDeadZone
        );
      }
      container.lastOriginX = origin.x;
      container.lastOriginY = origin.y;
    }
    return 0;
  }

  private getEmbeddedClipContainerForNode(node: GraphNode): EmbeddedGraphContainerState | null {
    if (!node.embeddedInstanceId) return null;
    return this.embeddedGraphContainers.get(node.embeddedInstanceId) ?? null;
  }

  private getSharedEmbeddedClipContainer(first: GraphNode, second: GraphNode): EmbeddedGraphContainerState | null {
    if (!first.embeddedInstanceId || first.embeddedInstanceId !== second.embeddedInstanceId) return null;
    return this.embeddedGraphContainers.get(first.embeddedInstanceId) ?? null;
  }

  private getRenderedContainerBounds(
    container: ParentContainerState | EmbeddedGraphContainerState
  ): { left: number; top: number; right: number; bottom: number } {
    const origin = this.nodeMap.get(container.origin);
    if (!origin?.embeddedInstanceId) {
      return {
        left: container.left,
        top: container.top,
        right: container.right,
        bottom: container.bottom
      };
    }
    const outer = this.embeddedGraphContainers.get(origin.embeddedInstanceId);
    if (!outer) {
      return {
        left: container.left,
        top: container.top,
        right: container.right,
        bottom: container.bottom
      };
    }
    const transform = this.getEmbeddedContainerRenderTransform(outer);
    return {
      left: transform.targetCenterX + ((container.left - transform.sourceCenterX) * transform.scale),
      top: transform.targetCenterY + ((container.top - transform.sourceCenterY) * transform.scale),
      right: transform.targetCenterX + ((container.right - transform.sourceCenterX) * transform.scale),
      bottom: transform.targetCenterY + ((container.bottom - transform.sourceCenterY) * transform.scale)
    };
  }

  private clipToEmbeddedContainer(container: EmbeddedGraphContainerState): void {
    const bounds = this.getGraphLensBounds(container);
    const x = (bounds.left + this.camera.x) * this.camera.zoom;
    const y = (bounds.top + this.camera.y) * this.camera.zoom;
    const width = (bounds.right - bounds.left) * this.camera.zoom;
    const height = (bounds.bottom - bounds.top) * this.camera.zoom;
    if (width <= 0 || height <= 0) return;
    this.ctx.beginPath();
    this.roundRectPath(x, y, width, height, Math.max(6, 10 * this.camera.zoom));
    this.ctx.clip();
  }

  private isWorldPointInsideAnyGraphLens(
    x: number,
    y: number,
    exceptInstanceId?: string | null
  ): boolean {
    for (const container of this.embeddedGraphContainers.values()) {
      if (exceptInstanceId && container.key === exceptInstanceId) continue;
      const bounds = this.getGraphLensBounds(container);
      if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
        return true;
      }
    }
    return false;
  }

  private getGraphLensCoverAlphaAtPoint(
    x: number,
    y: number,
    ownContainer?: EmbeddedGraphContainerState | null
  ): number {
    let alpha = 1;
    const visibleThroughLensAlpha = 1 - this.getGraphLensBodyOpacity();
    for (const container of this.embeddedGraphContainers.values()) {
      if (ownContainer && this.isSameOrAncestorGraphLens(container, ownContainer)) continue;
      const bounds = this.getGraphLensBounds(container);
      if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
        alpha *= visibleThroughLensAlpha;
      }
    }
    return this.clamp(alpha, 0, 1);
  }

  private isSameOrAncestorGraphLens(
    candidate: EmbeddedGraphContainerState,
    container: EmbeddedGraphContainerState
  ): boolean {
    if (candidate.key === container.key) return true;
    let cursor: EmbeddedGraphContainerState | undefined = container;
    while (cursor) {
      const origin = this.nodeMap.get(cursor.origin);
      const parent = origin?.embeddedInstanceId
        ? this.embeddedGraphContainers.get(origin.embeddedInstanceId)
        : undefined;
      if (!parent) return false;
      if (parent.key === candidate.key) return true;
      cursor = parent;
    }
    return false;
  }

  private findEmbeddedContainerAtScreenPosition(
    clientX: number,
    clientY: number
  ): EmbeddedGraphContainerState | null {
    const world = this.clientToWorld(clientX, clientY);
    return Array.from(this.embeddedGraphContainers.values())
      .sort((a, b) => {
        const ancestryDelta = b.ancestry.length - a.ancestry.length;
        if (ancestryDelta !== 0) return ancestryDelta;
        const aBounds = this.getGraphLensBounds(a);
        const bBounds = this.getGraphLensBounds(b);
        return ((aBounds.right - aBounds.left) * (aBounds.bottom - aBounds.top))
          - ((bBounds.right - bBounds.left) * (bBounds.bottom - bBounds.top));
      })
      .find((container) => {
        const bounds = this.getGraphLensBounds(container);
        return world.x >= bounds.left
          && world.x <= bounds.right
          && world.y >= bounds.top
          && world.y <= bounds.bottom;
      }) ?? null;
  }

  private findGraphLensMoveHandleAtScreenPosition(
    clientX: number,
    clientY: number
  ): EmbeddedGraphContainerState | null {
    const world = this.clientToWorld(clientX, clientY);
    const container = this.getTopGraphLensAtWorldPoint(world.x, world.y);
    if (!container) return null;
    const bounds = this.getGraphLensBounds(container);
    return this.isWorldPointInGraphLensTitleBar(world.x, world.y, bounds)
      && !this.isWorldPointInGraphLensButton(world.x, world.y, bounds)
      ? container
      : null;
  }

  private findGraphLensResizeTargetAtScreenPosition(
    clientX: number,
    clientY: number
  ): { container: EmbeddedGraphContainerState; edgeX: -1 | 0 | 1; edgeY: -1 | 0 | 1 } | null {
    const world = this.clientToWorld(clientX, clientY);
    for (const container of this.getGraphLensesTopFirst()) {
      const bounds = this.getGraphLensBounds(container);
      const hit = this.getGraphLensResizeHitMetrics();
      if (
        world.x < bounds.left - hit.side
        || world.x > bounds.right + hit.side
        || world.y < bounds.top
        || world.y > bounds.bottom + hit.bottom
      ) {
        continue;
      }
      const edge = this.getGraphLensResizeEdge(world.x, world.y, bounds);
      if (edge.edgeX !== 0 || edge.edgeY !== 0) return { container, ...edge };
      if (this.isWorldPointInsideGraphLensBounds(world.x, world.y, bounds)) return null;
    }
    return null;
  }

  private findGraphLensButtonAtScreenPosition(
    clientX: number,
    clientY: number
  ): { container: EmbeddedGraphContainerState; action: "close" | "maximize" | "fit" } | null {
    const world = this.clientToWorld(clientX, clientY);
    const container = this.getTopGraphLensAtWorldPoint(world.x, world.y);
    if (!container) return null;
    const bounds = this.getGraphLensBounds(container);
    const action = this.getGraphLensButtonAction(world.x, world.y, bounds);
    return action ? { container, action } : null;
  }

  private getGraphLensesTopFirst(): EmbeddedGraphContainerState[] {
    return Array.from(this.embeddedGraphContainers.values())
      .sort((a, b) => {
        const ancestryDelta = b.ancestry.length - a.ancestry.length;
        if (ancestryDelta !== 0) return ancestryDelta;
        const aBounds = this.getGraphLensBounds(a);
        const bBounds = this.getGraphLensBounds(b);
        return ((aBounds.right - aBounds.left) * (aBounds.bottom - aBounds.top))
          - ((bBounds.right - bBounds.left) * (bBounds.bottom - bBounds.top));
      });
  }

  private getTopGraphLensAtWorldPoint(x: number, y: number): EmbeddedGraphContainerState | null {
    return this.getGraphLensesTopFirst().find((container) =>
      this.isWorldPointInsideGraphLensBounds(x, y, this.getGraphLensBounds(container))
    ) ?? null;
  }

  private isWorldPointInsideGraphLensBounds(
    x: number,
    y: number,
    bounds: { left: number; top: number; right: number; bottom: number }
  ): boolean {
    return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
  }

  private getGraphLensTitleBarHeight(): number {
    return Math.max(18 / this.camera.zoom, this.nodeRadius * 0.55);
  }

  private getGraphLensEdgeHitSize(): number {
    return Math.max(4 / this.camera.zoom, this.nodeRadius * 0.1);
  }

  private getGraphLensResizeHitMetrics(): {
    top: number;
    side: number;
    bottom: number;
    corner: number;
  } {
    const base = this.getGraphLensEdgeHitSize();
    return {
      top: base,
      side: Math.max(base, 10 / this.camera.zoom, this.nodeRadius * 0.25),
      bottom: Math.max(base, 14 / this.camera.zoom, this.nodeRadius * 0.35),
      corner: Math.max(base, 20 / this.camera.zoom, this.nodeRadius * 0.45)
    };
  }

  private isWorldPointInGraphLensTitleBar(
    x: number,
    y: number,
    bounds: { left: number; top: number; right: number; bottom: number }
  ): boolean {
    return x >= bounds.left
      && x <= bounds.right
      && y >= bounds.top
      && y <= bounds.top + this.getGraphLensTitleBarHeight();
  }

  private getGraphLensResizeEdge(
    x: number,
    y: number,
    bounds: { left: number; top: number; right: number; bottom: number }
  ): { edgeX: -1 | 0 | 1; edgeY: -1 | 0 | 1 } {
    if (this.isWorldPointInGraphLensButton(x, y, bounds)) return { edgeX: 0, edgeY: 0 };
    const hit = this.getGraphLensResizeHitMetrics();
    const nearBottom = y >= bounds.bottom - hit.bottom && y <= bounds.bottom + hit.bottom;
    const nearTop = y >= bounds.top && y <= bounds.top + hit.top;
    const nearLeft = x >= bounds.left - hit.side && x <= bounds.left + hit.side;
    const nearRight = x >= bounds.right - hit.side && x <= bounds.right + hit.side;
    const nearBottomLeft = nearBottom && x >= bounds.left - hit.corner && x <= bounds.left + hit.corner;
    const nearBottomRight = nearBottom && x >= bounds.right - hit.corner && x <= bounds.right + hit.corner;
    const edgeX: -1 | 0 | 1 = nearBottomLeft || nearLeft ? -1 : nearBottomRight || nearRight ? 1 : 0;
    const edgeY: -1 | 0 | 1 = nearBottom ? 1 : nearTop ? -1 : 0;
    return { edgeX, edgeY };
  }

  private getGraphLensResizeCursor(edgeX: -1 | 0 | 1, edgeY: -1 | 0 | 1): string {
    if (edgeX !== 0 && edgeY !== 0) {
      return edgeX === edgeY ? "nwse-resize" : "nesw-resize";
    }
    if (edgeX !== 0) return "ew-resize";
    if (edgeY !== 0) return "ns-resize";
    return "";
  }

  private setGraphCursor(cursor: string): void {
    if (this.canvas) setStyle(this.canvas, "cursor", cursor);
    if (this.badgeOverlay) setStyle(this.badgeOverlay, "cursor", cursor);
    if (this.container) setStyle(this.container, "cursor", cursor);
  }

  private updateGraphLensCursor(clientX: number, clientY: number): void {
    if (this.resizingGraphLens) {
      this.setGraphCursor(this.getGraphLensResizeCursor(
        this.lensResizeStart.edgeX as -1 | 0 | 1,
        this.lensResizeStart.edgeY as -1 | 0 | 1
      ));
      return;
    }
    if (this.movingGraphLens) {
      this.setGraphCursor("move");
      return;
    }
    if (this.panningEmbeddedContainer) {
      this.setGraphCursor("grabbing");
      return;
    }
    if (this.isPanning && this.didPan) {
      this.setGraphCursor("grabbing");
      return;
    }
    if (this.findGraphLensButtonAtScreenPosition(clientX, clientY)) {
      this.setGraphCursor("pointer");
      return;
    }
    const resizeTarget = this.findGraphLensResizeTargetAtScreenPosition(clientX, clientY);
    if (resizeTarget) {
      this.setGraphCursor(this.getGraphLensResizeCursor(resizeTarget.edgeX, resizeTarget.edgeY));
      return;
    }
    if (this.findGraphLensMoveHandleAtScreenPosition(clientX, clientY)) {
      this.setGraphCursor("move");
      return;
    }
    if (this.isAltPressed) {
      this.setGraphCursor("crosshair");
      return;
    }
    if (this.findActualNodeAtScreenPosition(clientX, clientY)) {
      this.setGraphCursor("pointer");
      return;
    }
    if (this.findEmbeddedContainerAtScreenPosition(clientX, clientY)) {
      this.setGraphCursor("grab");
      return;
    }
    this.setGraphCursor("grab");
  }

  private isWorldPointInGraphLensButton(
    x: number,
    y: number,
    bounds: { left: number; top: number; right: number; bottom: number }
  ): boolean {
    return this.getGraphLensButtonAction(x, y, bounds) !== null;
  }

  private getGraphLensButtonAction(
    x: number,
    y: number,
    bounds: { left: number; top: number; right: number; bottom: number }
  ): "close" | "maximize" | "fit" | null {
    if (!this.isWorldPointInGraphLensTitleBar(x, y, bounds)) return null;
    const buttonSize = Math.max(14 / this.camera.zoom, this.nodeRadius * 0.42);
    const gap = Math.max(4 / this.camera.zoom, this.nodeRadius * 0.12);
    const top = bounds.top + Math.max(2 / this.camera.zoom, this.nodeRadius * 0.08);
    const closeRight = bounds.right - gap;
    const closeLeft = closeRight - buttonSize;
    const maximizeRight = closeLeft - gap;
    const maximizeLeft = maximizeRight - buttonSize;
    const fitRight = maximizeLeft - gap;
    const fitLeft = fitRight - buttonSize;
    const bottom = top + buttonSize;
    if (y < top || y > bottom) return null;
    if (x >= closeLeft && x <= closeRight) return "close";
    if (x >= maximizeLeft && x <= maximizeRight) return "maximize";
    if (x >= fitLeft && x <= fitRight) return "fit";
    return null;
  }

  private getClosestPointOnRectEdge(
    point: { x: number; y: number },
    bounds: { left: number; top: number; right: number; bottom: number }
  ): { x: number; y: number } {
    const clampedX = this.clamp(point.x, bounds.left, bounds.right);
    const clampedY = this.clamp(point.y, bounds.top, bounds.bottom);
    const candidates = [
      { x: clampedX, y: bounds.top },
      { x: bounds.right, y: clampedY },
      { x: clampedX, y: bounds.bottom },
      { x: bounds.left, y: clampedY }
    ];
    const selected = candidates.sort((a, b) =>
      Math.hypot(point.x - a.x, point.y - a.y)
      - Math.hypot(point.x - b.x, point.y - b.y)
    )[0];
    const centerX = (bounds.left + bounds.right) / 2;
    const centerY = (bounds.top + bounds.bottom) / 2;
    const minOffset = Math.max(8 / this.camera.zoom, this.nodeRadius * 0.18);
    const horizontalEdge = Math.abs(selected.y - bounds.top) < 0.001 || Math.abs(selected.y - bounds.bottom) < 0.001;
    const verticalEdge = Math.abs(selected.x - bounds.left) < 0.001 || Math.abs(selected.x - bounds.right) < 0.001;
    if (Math.abs(selected.x - point.x) < 0.001 && horizontalEdge) {
      const sign = point.x <= centerX ? 1 : -1;
      selected.x = this.clamp(selected.x + (sign * minOffset), bounds.left, bounds.right);
    }
    if (Math.abs(selected.y - point.y) < 0.001 && verticalEdge) {
      const sign = point.y <= centerY ? 1 : -1;
      selected.y = this.clamp(selected.y + (sign * minOffset), bounds.top, bounds.bottom);
    }
    return selected;
  }

  private getRayRectIntersection(
    from: { x: number; y: number },
    to: { x: number; y: number },
    bounds: { left: number; top: number; right: number; bottom: number }
  ): { x: number; y: number } {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const candidates: Array<{ t: number; x: number; y: number }> = [];
    const addCandidate = (t: number): void => {
      if (!Number.isFinite(t) || t < 0 || t > 1) return;
      const x = from.x + dx * t;
      const y = from.y + dy * t;
      if (x < bounds.left - 0.001 || x > bounds.right + 0.001) return;
      if (y < bounds.top - 0.001 || y > bounds.bottom + 0.001) return;
      candidates.push({ t, x, y });
    };
    if (Math.abs(dx) > 0.0001) {
      addCandidate((bounds.left - from.x) / dx);
      addCandidate((bounds.right - from.x) / dx);
    }
    if (Math.abs(dy) > 0.0001) {
      addCandidate((bounds.top - from.y) / dy);
      addCandidate((bounds.bottom - from.y) / dy);
    }
    return candidates.sort((a, b) => a.t - b.t)[0] ?? to;
  }

  private resetEmbeddedContainerView(container: EmbeddedGraphContainerState): void {
    container.viewZoom = 1;
    container.viewPanX = 0;
    container.viewPanY = 0;
    this.notifyEmbeddedGraphLensChanged(container);
    this.requestRender();
  }

  private fitEmbeddedContainerViewToLens(container: EmbeddedGraphContainerState): void {
    container.viewZoom = 1;
    container.viewPanX = 0;
    container.viewPanY = 0;
    const contentBounds = this.getEmbeddedContainerContentBounds(container);
    if (!contentBounds) return;
    const transform = this.getEmbeddedContainerRenderTransform(container);
    container.viewPanX = -(contentBounds.centerX - transform.sourceCenterX) * transform.scale;
    container.viewPanY = -(contentBounds.centerY - transform.sourceCenterY) * transform.scale;
  }

  private setEmbeddedContainerViewportCenter(
    container: EmbeddedGraphContainerState,
    viewportCenterX: number,
    viewportCenterY: number
  ): void {
    if (!Number.isFinite(viewportCenterX) || !Number.isFinite(viewportCenterY)) return;
    const afterTransform = this.getEmbeddedContainerRenderTransform(container);
    if (!Number.isFinite(afterTransform.scale) || Math.abs(afterTransform.scale) < 0.001) {
      return;
    }
    const afterBounds = this.getGraphLensBounds(container);
    const afterLensCenterX = (afterBounds.left + afterBounds.right) / 2;
    const afterLensCenterY = (afterBounds.top + afterBounds.bottom) / 2;

    container.viewPanX = afterLensCenterX - (afterTransform.targetCenterX - (Number.isFinite(container.viewPanX) ? Number(container.viewPanX) : 0))
      - ((viewportCenterX - afterTransform.sourceCenterX) * afterTransform.scale);
    container.viewPanY = afterLensCenterY - (afterTransform.targetCenterY - (Number.isFinite(container.viewPanY) ? Number(container.viewPanY) : 0))
      - ((viewportCenterY - afterTransform.sourceCenterY) * afterTransform.scale);
  }

  private notifyEmbeddedGraphLensChanged(container: EmbeddedGraphContainerState): void {
    const context = this.getEmbeddedGraphPersistenceContext(container);
    this.menuOptions.onEmbeddedGraphExpansionChanged?.(
      context.originNodeId,
      container.graphPath,
      true,
      context.ownerGraphPath,
      this.getEmbeddedGraphLensStateForContainer(container),
      context.parentChain
    );
  }

  private toggleGraphLensMaximized(container: EmbeddedGraphContainerState): void {
    const origin = this.nodeMap.get(container.origin);
    if (container.lensMaximized) {
      container.lensMaximized = false;
      container.lensWidth = Number.isFinite(container.lensRestoreWidth)
        ? Math.max(this.getMinimumContainerViewportSize(), Number(container.lensRestoreWidth))
        : this.getGraphLensWidth(origin);
      container.lensHeight = Number.isFinite(container.lensRestoreHeight)
        ? Math.max(this.getMinimumContainerViewportSize(), Number(container.lensRestoreHeight))
        : this.getGraphLensHeight(origin);
      container.lensOffsetX = Number.isFinite(container.lensRestoreOffsetX)
        ? Number(container.lensRestoreOffsetX)
        : Math.max(80, this.getEffectiveNodeRadius(origin) * 4);
      container.lensOffsetY = Number.isFinite(container.lensRestoreOffsetY)
        ? Number(container.lensRestoreOffsetY)
        : -Math.max(18, this.getEffectiveNodeRadius(origin) * 0.9);
      container.lensUserPositioned = container.lensRestoreUserPositioned === true;
      container.lensMaximized = false;
      container.lensRestoreWidth = undefined;
      container.lensRestoreHeight = undefined;
      container.lensRestoreOffsetX = undefined;
      container.lensRestoreOffsetY = undefined;
      container.lensRestoreUserPositioned = undefined;
      this.fitEmbeddedContainerViewToLens(container);
      this.notifyEmbeddedGraphLensChanged(container);
      this.requestRender();
      return;
    }
    const viewportWidth = Math.max(1, this.canvas.width / this.camera.zoom);
    const viewportHeight = Math.max(1, this.canvas.height / this.camera.zoom);
    const anchor = this.getGraphLensAnchorCenter(container, origin);
    const cameraCenterX = (this.canvas.width / 2 / this.camera.zoom) - this.camera.x;
    const cameraCenterY = (this.canvas.height / 2 / this.camera.zoom) - this.camera.y;
    const width = Math.max(this.getGraphLensWidth(origin), viewportWidth * 0.72);
    const height = Math.max(this.getGraphLensHeight(origin), viewportHeight * 0.72);
    container.lensRestoreWidth = container.lensWidth;
    container.lensRestoreHeight = container.lensHeight;
    container.lensRestoreOffsetX = container.lensOffsetX;
    container.lensRestoreOffsetY = container.lensOffsetY;
    container.lensRestoreUserPositioned = container.lensUserPositioned === true;
    container.lensWidth = width;
    container.lensHeight = height;
    container.lensOffsetX = cameraCenterX - anchor.x - (width / 2);
    container.lensOffsetY = cameraCenterY - anchor.y;
    container.lensUserPositioned = true;
    container.lensMaximized = true;
    this.fitEmbeddedContainerViewToLens(container);
    this.notifyEmbeddedGraphLensChanged(container);
    this.requestRender();
  }

  // =========================
  // RENDER
  // =========================

  private draw() {

    this.syncParentContainers();
    this.syncEmbeddedGraphContainers();
    this.layoutGraphLenses();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.fillGraphBackground();
    this.drawParentContainers();
    this.drawGraphLenses();
    this.drawContainerNecks();
    const activePath = this.activeNodePath;
    const accent = getComputedStyle(this.container).getPropertyValue("--interactive-accent").trim() || "#6b8cff";
    const edgeHighlightedNodes = this.hoveredHighlightNodes;
    const highlightedNodes = this.getCombinedHoveredNodes();

    for (const e of this.edges) {
      if (e.relationship === "parent") continue;

      const n1 = this.nodeMap.get(e.from);
      const n2 = this.nodeMap.get(e.to);
      if (!n1 || !n2) continue;
      const edgeClipContainer = this.getSharedEmbeddedClipContainer(n1, n2);

      const geometry = this.getEdgeBoundaryGeometry(n1, n2);
      const midpointX = (geometry.firstPoint.x + geometry.secondPoint.x) / 2;
      const midpointY = (geometry.firstPoint.y + geometry.secondPoint.y) / 2;
      const edgeLensCoverAlpha = this.getGraphLensCoverAlphaAtPoint(midpointX, midpointY, edgeClipContainer);
      const sx1 = (geometry.firstPoint.x + this.camera.x) * this.camera.zoom;
      const sy1 = (geometry.firstPoint.y + this.camera.y) * this.camera.zoom;
      const sx2 = (geometry.secondPoint.x + this.camera.x) * this.camera.zoom;
      const sy2 = (geometry.secondPoint.y + this.camera.y) * this.camera.zoom;

      const childDepth = Math.max(0, Number(n2.depth ?? 0));
      const parentEdgeAlpha = Math.max(0.35, 0.9 - (childDepth * 0.1));

      const edgeHighlighted = edgeHighlightedNodes?.has(e.to) ?? false;
      const strokeColor = this.getEdgeStrokeColor(e, edgeHighlighted, parentEdgeAlpha);
      const edgeLineWidth = this.getEdgeLineWidth(e, edgeHighlighted);

      let edgeLensAlphaSaved = false;
      if (edgeLensCoverAlpha < 0.999) {
        this.ctx.save();
        this.ctx.globalAlpha *= edgeLensCoverAlpha;
        edgeLensAlphaSaved = true;
      }
      if (edgeClipContainer) {
        this.ctx.save();
        this.clipToEmbeddedContainer(edgeClipContainer);
      }

      const dashedEdge = this.shouldRenderEdgeDashed(e);
      if (dashedEdge || e.relationship === "parent") {
        this.ctx.save();
        this.ctx.strokeStyle = strokeColor;
        this.ctx.lineWidth = edgeLineWidth;
        if (dashedEdge) {
          this.ctx.setLineDash([5, 5]);
        }
      } else {
        this.ctx.strokeStyle = strokeColor;
        this.ctx.lineWidth = edgeLineWidth;
      }

      this.ctx.beginPath();
      this.ctx.moveTo(sx1, sy1);
      this.ctx.lineTo(sx2, sy2);
      this.ctx.stroke();

      if (dashedEdge || e.relationship === "parent") {
        this.drawEdgeArrow(e, sx1, sy1, sx2, sy2, strokeColor, edgeLineWidth);
        this.ctx.restore();
      } else {
        this.drawEdgeArrow(e, sx1, sy1, sx2, sy2, strokeColor, edgeLineWidth);
      }
      if (edgeClipContainer) {
        this.ctx.restore();
      }
      if (edgeLensAlphaSaved) {
        this.ctx.restore();
      }
    }

    // Nodes
    for (const n of this.nodes) {
      const nodeClipContainer = this.getEmbeddedClipContainerForNode(n);
      const renderedCenter = this.getRenderedNodeCenter(n);
      const nodeLensCoverAlpha = this.getGraphLensCoverAlphaAtPoint(renderedCenter.x, renderedCenter.y, nodeClipContainer);
      if (nodeClipContainer) {
        this.ctx.save();
        this.clipToEmbeddedContainer(nodeClipContainer);
      }
      let nodeLensAlphaSaved = false;
      if (nodeLensCoverAlpha < 0.999) {
        this.ctx.save();
        this.ctx.globalAlpha *= nodeLensCoverAlpha;
        nodeLensAlphaSaved = true;
      }

      const sx = (renderedCenter.x + this.camera.x) * this.camera.zoom;
      const sy = (renderedCenter.y + this.camera.y) * this.camera.zoom;
      const radius = this.getRenderedNodeRadius(n);
      const screenRadius = radius * this.camera.zoom;

      const groupedFill = this.nodeFillColors.get(n.id);
      const isHighlighted = highlightedNodes?.has(n.id) ?? false;
      const nodeFill = isHighlighted
        ? (groupedFill ?? (n.isBase ? "rgba(255,255,255,1)" : "rgba(240,240,240,1)"))
        : (groupedFill ?? (n.isBase ? "rgba(255,255,255,0.98)" : "rgba(225,225,225,1)"));
      const graphIcon = this.getNodeIcon(n);

      this.ctx.save();
      this.ctx.globalAlpha *= this.getNodeRenderOpacity(n);
      if (graphIcon?.kind === "text") {
        this.drawNodeIconText(graphIcon.text, sx, sy, screenRadius, nodeFill, graphIcon.replaceNodeBody === true);
      } else if (graphIcon?.kind === "image" && this.drawNodeIconImage(
        graphIcon.file,
        sx,
        sy,
        screenRadius,
        nodeFill,
        graphIcon.replaceNodeBody === true
      )) {
        // Image drawn.
      } else {
        this.ctx.beginPath();
        this.ctx.arc(sx, sy, screenRadius, 0, Math.PI * 2);
        this.ctx.fillStyle = nodeFill;
        this.ctx.fill();
      }
      this.ctx.restore();

      if (isHighlighted) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(sx, sy, (radius + 4) * this.camera.zoom, 0, Math.PI * 2);
        this.ctx.strokeStyle = "rgba(255, 214, 102, 0.85)";
        this.ctx.lineWidth = Math.max(1.4, 1.2 * this.camera.zoom);
        this.ctx.shadowColor = "rgba(255, 214, 102, 0.45)";
        this.ctx.shadowBlur = 8;
        this.ctx.stroke();
        this.ctx.restore();
      }

      if (this.selectedNodeIds.has(n.id)) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(sx, sy, (radius + 8) * this.camera.zoom, 0, Math.PI * 2);
        this.ctx.strokeStyle = "rgba(255, 214, 102, 0.95)";
        this.ctx.lineWidth = Math.max(2.5, 1.8 * this.camera.zoom);
        this.ctx.setLineDash([6, 4]);
        this.ctx.shadowColor = "rgba(255, 214, 102, 0.4)";
        this.ctx.shadowBlur = 9;
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        this.ctx.restore();
      }

      if (n.isBase) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(sx, sy, (radius + 3.5) * this.camera.zoom, 0, Math.PI * 2);
        this.ctx.strokeStyle = this.rootNodeRingColor;
        this.ctx.lineWidth = Math.max(1, 1 * this.camera.zoom);
        this.ctx.shadowColor = this.rootNodeRingColor;
        this.ctx.shadowBlur = 6;
        this.ctx.stroke();
        this.ctx.restore();
      }

      if (activePath && n.sourcePath === activePath) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(sx, sy, (radius + 12) * this.camera.zoom, 0, Math.PI * 2);
        this.ctx.strokeStyle = this.activeNodeRingColor;
        this.ctx.lineWidth = Math.max(3, 2.2 * this.camera.zoom);
        this.ctx.shadowColor = this.activeNodeRingColor;
        this.ctx.shadowBlur = 10;
        this.ctx.stroke();
        this.ctx.restore();
      }

      if (this.nearestActiveLinkedNodeId === n.id) {
        const opacity = Math.max(0, Math.min(1, this.nearestActiveLinkedNodeOpacityPercent / 100));
        if (opacity > 0) {
          this.ctx.save();
          this.ctx.beginPath();
          this.ctx.arc(sx, sy, (radius + 10) * this.camera.zoom, 0, Math.PI * 2);
          this.ctx.strokeStyle = this.hexToRgba(this.nearestActiveLinkedNodeColor, opacity);
          this.ctx.lineWidth = Math.max(2, 1.8 * this.camera.zoom);
          this.ctx.setLineDash([4, 5]);
          this.ctx.shadowColor = this.hexToRgba(this.nearestActiveLinkedNodeColor, opacity * 0.7);
          this.ctx.shadowBlur = 6;
          this.ctx.stroke();
          this.ctx.setLineDash([]);
          this.ctx.restore();
        }
      }

      if (this.collapsePreviewNodeIds.has(n.id)) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(sx, sy, (radius + 2) * this.camera.zoom, 0, Math.PI * 2);
        this.ctx.strokeStyle = "rgba(255, 110, 110, 0.8)";
        this.ctx.lineWidth = Math.max(1.2, 1 * this.camera.zoom);
        this.ctx.setLineDash([4, 3]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        this.ctx.beginPath();
        this.ctx.arc(sx, sy, screenRadius, 0, Math.PI * 2);
        this.ctx.fillStyle = "rgba(255, 80, 80, 0.12)";
        this.ctx.fill();
        this.ctx.restore();
      }

      if (activePath && n.id === activePath) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(sx, sy, (radius + 5) * this.camera.zoom, 0, Math.PI * 2);
        this.ctx.strokeStyle = accent;
        this.ctx.lineWidth = Math.max(2, 1.5 * this.camera.zoom);
        this.ctx.shadowColor = accent;
        this.ctx.shadowBlur = 8;
        this.ctx.stroke();
        this.ctx.restore();
      }
      if (nodeLensAlphaSaved) {
        this.ctx.restore();
      }
      if (nodeClipContainer) {
        this.ctx.restore();
      }
    }

    this.drawLabels();
    this.drawMarqueeSelection();
    if (!this.suppressDomOverlayRender) {
      if (!this.isDraggingNode || this.badgesDirty || this.dragBadgeRevealNodeId) {
        this.renderBadges();
      }
      this.syncPinnedNodeIcons();
      this.syncLensNodeIcons();
    }
  }

  private drawMarqueeSelection(): void {
    if (!this.marqueeSelection) return;
    const left = Math.min(this.marqueeSelection.startX, this.marqueeSelection.currentX);
    const top = Math.min(this.marqueeSelection.startY, this.marqueeSelection.currentY);
    const width = Math.abs(this.marqueeSelection.currentX - this.marqueeSelection.startX);
    const height = Math.abs(this.marqueeSelection.currentY - this.marqueeSelection.startY);

    this.ctx.save();
    this.ctx.fillStyle = "rgba(255, 214, 102, 0.12)";
    this.ctx.strokeStyle = "rgba(255, 214, 102, 0.9)";
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([6, 4]);
    this.ctx.fillRect(left, top, width, height);
    this.ctx.strokeRect(left, top, width, height);
    this.ctx.setLineDash([]);
    this.ctx.restore();
  }

  // =========================
  // ZOOM
  // =========================

  private onWheel(e: WheelEvent) {

    e.preventDefault();

    const zoomFactor = 1.1;
    const rect = this.canvas.getBoundingClientRect();

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldX = (mouseX / this.camera.zoom) - this.camera.x;
    const worldY = (mouseY / this.camera.zoom) - this.camera.y;
    const embeddedContainer = this.findEmbeddedContainerAtScreenPosition(e.clientX, e.clientY);
    if (embeddedContainer) {
      const before = this.getEmbeddedContainerRenderTransform(embeddedContainer);
      const rawX = before.sourceCenterX + ((worldX - before.targetCenterX) / before.scale);
      const rawY = before.sourceCenterY + ((worldY - before.targetCenterY) / before.scale);
      const currentZoom = Number.isFinite(embeddedContainer.viewZoom) ? Number(embeddedContainer.viewZoom) : 1;
      embeddedContainer.viewZoom = this.clamp(
        e.deltaY < 0 ? currentZoom * zoomFactor : currentZoom / zoomFactor,
        0.1,
        80
      );
      const after = this.getEmbeddedContainerRenderTransform(embeddedContainer);
      const afterWorldX = after.targetCenterX + ((rawX - after.sourceCenterX) * after.scale);
      const afterWorldY = after.targetCenterY + ((rawY - after.sourceCenterY) * after.scale);
      embeddedContainer.viewPanX = (Number.isFinite(embeddedContainer.viewPanX) ? embeddedContainer.viewPanX : 0) + (worldX - afterWorldX);
      embeddedContainer.viewPanY = (Number.isFinite(embeddedContainer.viewPanY) ? embeddedContainer.viewPanY : 0) + (worldY - afterWorldY);
      this.notifyEmbeddedGraphLensChanged(embeddedContainer);
      this.requestRender();
      return;
    }

    if (e.deltaY < 0) {
      this.camera.zoom *= zoomFactor;
    } else {
      this.camera.zoom /= zoomFactor;
    }

    this.camera.zoom = Math.max(0.1, Math.min(5, this.camera.zoom));

    this.camera.x = (mouseX / this.camera.zoom) - worldX;
    this.camera.y = (mouseY / this.camera.zoom) - worldY;
    this.emitViewportChanged();
    this.requestRender();
  }

  // =========================
  // PAN
  // =========================

  private selectOnlyNode(nodeId: string): void {
    if (this.selectedNodeIds.size === 1 && this.selectedNodeIds.has(nodeId)) return;
    this.selectedNodeIds = new Set([nodeId]);
    this.badgesDirty = true;
    this.requestRender();
  }

  private toggleNodeSelection(nodeId: string): void {
    const next = new Set(this.selectedNodeIds);
    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      next.add(nodeId);
    }
    this.selectedNodeIds = next;
    this.badgesDirty = true;
    this.requestRender();
  }

  private clearNodeSelection(): void {
    if (this.selectedNodeIds.size === 0) return;
    this.selectedNodeIds.clear();
    this.badgesDirty = true;
    this.requestRender();
  }

  selectAllNodes(): number {
    const next = new Set(
      this.nodes
        .map((node) => String(node.id ?? "").trim())
        .filter(Boolean)
    );
    if (!this.haveSelectedNodesChanged(next)) return next.size;
    this.selectedNodeIds = next;
    this.badgesDirty = true;
    this.requestRender();
    return next.size;
  }

  private onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.container.focus();

    const clickedNode = this.findNodeAtScreenPosition(e.clientX, e.clientY);
    if (clickedNode && !this.selectedNodeIds.has(clickedNode.id)) {
      this.selectOnlyNode(clickedNode.id);
    }

    const selectedNodes = this.getSelectedNodes();
    const menu = new Menu();

    if (selectedNodes.length > 0) {
      if (selectedNodes.some((node) => !this.isNodePinned(node))) {
        menu.addItem((item) => {
          item
            .setTitle(selectedNodes.length === 1 ? "Pin node" : "Pin nodes")
            .onClick(() => this.pinSelectedNodes(selectedNodes));
        });
      }

      if (selectedNodes.some((node) => this.isNodePinned(node))) {
        menu.addItem((item) => {
          item
            .setTitle(selectedNodes.length === 1 ? "Unpin node" : "Unpin nodes")
            .onClick(() => this.unpinSelectedNodes(selectedNodes));
        });
      }

      if (this.menuOptions.onCopySelectedNodeLinks) {
        menu.addItem((item) => {
          item
            .setTitle(selectedNodes.length === 1 ? "Copy node link" : "Copy node links")
            .onClick(() => {
              void this.menuOptions.onCopySelectedNodeLinks?.();
            });
        });
      }

      const nodeToOpen = clickedNode ?? (selectedNodes.length === 1 ? selectedNodes[0] : null);
      if (nodeToOpen) {
        const embeddedContainer = this.getExpandedEmbeddedContainerForOrigin(nodeToOpen.id);
        if (embeddedContainer) {
          menu.addItem((item) => {
            item
              .setTitle(embeddedContainer.interactionLocked ? "Unlock expanded graph" : "Lock expanded graph")
              .onClick(() => this.setEmbeddedGraphContainerInteractionLocked(
                embeddedContainer,
                !embeddedContainer.interactionLocked
              ));
          });
          menu.addItem((item) => {
            item
              .setTitle("Reset expanded graph view")
              .onClick(() => this.resetEmbeddedContainerView(embeddedContainer));
          });
          menu.addItem((item) => {
            item
              .setTitle("Auto-place lens")
              .onClick(() => {
                embeddedContainer.lensUserPositioned = false;
                this.layoutGraphLenses();
                this.notifyEmbeddedGraphLensChanged(embeddedContainer);
                this.requestRender();
              });
          });
        }

        menu.addItem((item) => {
          item
            .setTitle("Open node in new tab")
            .onClick(() => {
              void this.openNodeFile(nodeToOpen, true);
            });
        });
      }

      const removableEmbeddedRoots = selectedNodes.filter((node) =>
        node.embeddedRoot && node.stateOwnerPath
      );
      if (removableEmbeddedRoots.length > 0 && this.menuOptions.onEmbeddedRootRemoveRequested) {
        menu.addItem((item) => {
          item
            .setTitle(removableEmbeddedRoots.length === 1
              ? "Remove embedded root node"
              : "Remove embedded root nodes")
            .onClick(() => {
              for (const node of removableEmbeddedRoots) {
                void this.menuOptions.onEmbeddedRootRemoveRequested?.({
                  ownerGraphPath: node.stateOwnerPath!,
                  sourcePath: node.sourcePath
                });
              }
            });
        });
      }

      if (this.menuOptions.onAddRootNodeRequested) {
        menu.addSeparator();
      }
    }

    if (this.menuOptions.onAddRootNodeRequested) {
      menu.addItem((item) => {
        item
          .setTitle("Add root node")
          .onClick(() => {
            const ownerPath = this.getEmbeddedGraphPathAtClientPosition(e.clientX, e.clientY);
            void this.menuOptions.onAddRootNodeRequested?.({ ownerPath });
          });
      });
    }

    menu.showAtMouseEvent(e);
  }

  private getSelectedNodes(): GraphNode[] {
    const nodes: GraphNode[] = [];
    for (const nodeId of this.selectedNodeIds) {
      const node = this.nodeMap.get(nodeId);
      if (node) nodes.push(node);
    }
    return nodes;
  }

  private isNodePinned(node: GraphNode): boolean {
    return Boolean(node.isPinned || this.pinnedNodePaths.has(node.id));
  }

  private pinSelectedNodes(nodes: GraphNode[]): void {
    for (const node of nodes) {
      if (this.isNodePinned(node)) continue;
      this.pinNode(node);
    }
    this.badgesDirty = true;
    this.requestRender();
  }

  private unpinSelectedNodes(nodes: GraphNode[]): void {
    let changed = false;
    for (const node of nodes) {
      if (!this.isNodePinned(node)) continue;
      this.unpinNode(node, { restartSimulation: false });
      changed = true;
    }
    if (changed) {
      this.reheatSimulation(0.3, "context menu unpin");
      this.badgesDirty = true;
      this.requestRender();
    }
  }

  private setEmbeddedGraphContainerInteractionLocked(
    container: EmbeddedGraphContainerState,
    locked: boolean
  ): void {
    container.interactionLocked = locked;
    if (locked) {
      this.lockedEmbeddedGraphContainerKeys.add(container.key);
    } else {
      this.lockedEmbeddedGraphContainerKeys.delete(container.key);
    }
    this.notifyEmbeddedGraphLensChanged(container);
    this.requestRender();
  }

  private drawParentContainers(): void {
    const containers = Array.from(this.parentContainers.values())
      .sort((a, b) => b.memberIds.size - a.memberIds.size || a.key.localeCompare(b.key));

    for (const container of containers) {
      const bounds = this.getRenderedContainerBounds(container);
      const x = (bounds.left + this.camera.x) * this.camera.zoom;
      const y = (bounds.top + this.camera.y) * this.camera.zoom;
      const width = (bounds.right - bounds.left) * this.camera.zoom;
      const height = (bounds.bottom - bounds.top) * this.camera.zoom;
      if (width <= 0 || height <= 0) continue;
      if (x > this.canvas.width || y > this.canvas.height || x + width < 0 || y + height < 0) continue;

      const radius = Math.max(6, 10 * this.camera.zoom);
      this.ctx.save();
      this.ctx.beginPath();
      this.roundRectPath(x, y, width, height, radius);
      this.ctx.fillStyle = this.hexToRgba(container.color, 0.14);
      this.ctx.fill();
      this.ctx.strokeStyle = this.hexToRgba(container.color, 0.68);
      this.ctx.lineWidth = Math.max(1.25, 1.5 * this.camera.zoom);
      this.ctx.stroke();

      if (this.camera.zoom >= 0.35) {
        const label = this.activeNodeBadgeLinkTypes.find((linkType) =>
          this.normalizeLinkType(String(linkType.property ?? "")) === this.normalizeLinkType(container.linkType)
        )?.key ?? container.linkType;
        const origin = this.nodeMap.get(container.origin);
        const fontSize = origin?.embeddedInstanceId
          ? Math.max(7, 11 * this.camera.zoom * this.getEmbeddedNodeVisualScale(origin))
          : Math.max(10, 11 * this.camera.zoom);
        this.ctx.font = `${fontSize}px sans-serif`;
        this.ctx.textAlign = "left";
        this.ctx.textBaseline = "top";
        this.ctx.fillStyle = this.hexToRgba(container.color, 0.95);
        this.ctx.fillText(String(label), x + Math.max(3, fontSize * 0.7), y + Math.max(2, fontSize * 0.45));
      }
      this.ctx.restore();
    }
  }

  private drawEmbeddedGraphContainers(): void {
    const containers = Array.from(this.embeddedGraphContainers.values())
      .sort((a, b) => (a.right - a.left) * (a.bottom - a.top) - (b.right - b.left) * (b.bottom - b.top));
    for (const container of containers) {
      const bounds = this.getRenderedContainerBounds(container);
      const x = (bounds.left + this.camera.x) * this.camera.zoom;
      const y = (bounds.top + this.camera.y) * this.camera.zoom;
      const width = (bounds.right - bounds.left) * this.camera.zoom;
      const height = (bounds.bottom - bounds.top) * this.camera.zoom;
      if (width <= 0 || height <= 0) continue;
      const radius = Math.max(6, 10 * this.camera.zoom);
      this.ctx.save();
      this.ctx.beginPath();
      this.roundRectPath(x, y, width, height, radius);
      this.ctx.fillStyle = this.hexToRgba(container.color, 0.12);
      this.ctx.fill();
      this.ctx.strokeStyle = this.hexToRgba(container.color, 0.78);
      this.ctx.lineWidth = Math.max(1.5, 2 * this.camera.zoom);
      this.ctx.stroke();
      if (container.interactionLocked) {
        this.ctx.save();
        this.ctx.beginPath();
        this.roundRectPath(x + 4, y + 4, Math.max(24, 34 * this.camera.zoom), Math.max(16, 20 * this.camera.zoom), Math.max(4, 5 * this.camera.zoom));
        this.ctx.fillStyle = this.hexToRgba(container.color, 0.18);
        this.ctx.fill();
        this.ctx.strokeStyle = this.hexToRgba(container.color, 0.5);
        this.ctx.lineWidth = Math.max(1, 1 * this.camera.zoom);
        this.ctx.stroke();
        const lockCx = x + Math.max(16, 21 * this.camera.zoom);
        const lockCy = y + Math.max(12, 14 * this.camera.zoom);
        const lockScale = Math.max(0.75, this.camera.zoom);
        this.ctx.strokeStyle = this.hexToRgba(container.color, 0.92);
        this.ctx.fillStyle = this.hexToRgba(container.color, 0.82);
        this.ctx.lineWidth = Math.max(1.2, 1.2 * this.camera.zoom);
        this.ctx.beginPath();
        this.ctx.arc(lockCx, lockCy - 2.5 * lockScale, 4.2 * lockScale, Math.PI, 0);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.roundRect(lockCx - 5.5 * lockScale, lockCy - 1.5 * lockScale, 11 * lockScale, 8 * lockScale, 2 * lockScale);
        this.ctx.fill();
        this.ctx.restore();
      }
      if (this.activeNodePath && container.graphPath === this.activeNodePath) {
        this.ctx.beginPath();
        this.roundRectPath(x - 7, y - 7, width + 14, height + 14, radius + 7);
        this.ctx.strokeStyle = this.activeNodeRingColor;
        this.ctx.lineWidth = Math.max(3, 2.2 * this.camera.zoom);
        this.ctx.shadowColor = this.activeNodeRingColor;
        this.ctx.shadowBlur = 10;
        this.ctx.stroke();
      }
      if (this.selectedNodeIds.has(container.origin)) {
        this.ctx.beginPath();
        this.roundRectPath(x - 3, y - 3, width + 6, height + 6, radius + 3);
        this.ctx.strokeStyle = "rgba(255, 214, 102, 0.95)";
        this.ctx.lineWidth = Math.max(2, 2.2 * this.camera.zoom);
        this.ctx.setLineDash([7, 5]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
      }
      const shouldDrawTitle = this.shouldDrawNodeLabels() || this.selectedNodeIds.has(container.origin);
      if (shouldDrawTitle) {
        const label = container.graphPath.split("/").pop()?.replace(/\.md$/i, "") ?? container.graphPath;
        const origin = this.nodeMap.get(container.origin);
        const fontSize = origin?.embeddedInstanceId
          ? Math.max(7, 11 * this.camera.zoom * this.getEmbeddedNodeVisualScale(origin))
          : Math.max(10, 11 * this.camera.zoom);
        this.ctx.font = `${fontSize}px sans-serif`;
        this.ctx.textAlign = "left";
        this.ctx.textBaseline = "top";
        this.ctx.fillStyle = this.hexToRgba(container.color, 0.98);
        this.ctx.fillText(label, x + Math.max(3, fontSize * 0.7), y + Math.max(2, fontSize * 0.45));
      }
      this.ctx.restore();
    }
  }

  private drawGraphLenses(): void {
    const containers = Array.from(this.embeddedGraphContainers.values())
      .sort((a, b) => {
        const ancestryDelta = a.ancestry.length - b.ancestry.length;
        if (ancestryDelta !== 0) return ancestryDelta;
        return (b.right - b.left) * (b.bottom - b.top) - (a.right - a.left) * (a.bottom - a.top);
      });
    for (const container of containers) {
      const bounds = this.getGraphLensBounds(container);
      const x = (bounds.left + this.camera.x) * this.camera.zoom;
      const y = (bounds.top + this.camera.y) * this.camera.zoom;
      const width = (bounds.right - bounds.left) * this.camera.zoom;
      const height = (bounds.bottom - bounds.top) * this.camera.zoom;
      if (width <= 0 || height <= 0) continue;
      const colors = this.getGraphLensColors(container);
      const radius = Math.max(5, 8 * this.camera.zoom);
      this.ctx.save();
      this.ctx.beginPath();
      this.roundRectPath(x, y, width, height, radius);
      const bodyOpacity = this.getGraphLensBodyOpacity();
      this.ctx.fillStyle = this.cssColorWithAlpha(colors.fill, bodyOpacity);
      this.ctx.fill();
      this.ctx.strokeStyle = colors.border;
      this.ctx.lineWidth = Math.max(1, 1.25 * this.camera.zoom);
      this.ctx.setLineDash([6, 4]);
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      const titleBarHeight = this.getGraphLensTitleBarHeight() * this.camera.zoom;
      this.ctx.beginPath();
      this.roundRectPath(x, y, width, Math.min(height, titleBarHeight), radius);
      this.ctx.fillStyle = colors.titleBar;
      this.ctx.fill();

      const buttonSize = Math.max(14, this.getGraphLensButtonSizeScreen());
      const buttonGap = Math.max(4, 4 * this.camera.zoom);
      const buttonTop = y + Math.max(2, 2 * this.camera.zoom);
      const closeRight = x + width - buttonGap;
      const closeLeft = closeRight - buttonSize;
      const maximizeRight = closeLeft - buttonGap;
      const maximizeLeft = maximizeRight - buttonSize;
      const fitRight = maximizeLeft - buttonGap;
      const fitLeft = fitRight - buttonSize;
      this.drawGraphLensButton(fitLeft, buttonTop, buttonSize, colors, "fit");
      this.drawGraphLensButton(maximizeLeft, buttonTop, buttonSize, colors, container.lensMaximized ? "restore" : "maximize");
      this.drawGraphLensButton(closeLeft, buttonTop, buttonSize, colors, "close");

      const origin = this.nodeMap.get(container.origin);
      const originCenter = origin
        ? this.getRenderedNodeCenter(origin)
        : {
          x: (container.left + container.right) / 2,
          y: (container.top + container.bottom) / 2
        };
      const compactCenterX = (originCenter.x + this.camera.x) * this.camera.zoom;
      const compactCenterY = (originCenter.y + this.camera.y) * this.camera.zoom;
      const originInsideLens = originCenter.x >= bounds.left
        && originCenter.x <= bounds.right
        && originCenter.y >= bounds.top
        && originCenter.y <= bounds.bottom;
      if (!originInsideLens) {
        const lensCenter = {
          x: (bounds.left + bounds.right) / 2,
          y: (bounds.top + bounds.bottom) / 2
        };
        const lensAnchor = this.getRayRectIntersection(originCenter, lensCenter, bounds);
        const lensAnchorX = (lensAnchor.x + this.camera.x) * this.camera.zoom;
        const lensAnchorY = (lensAnchor.y + this.camera.y) * this.camera.zoom;
        this.ctx.beginPath();
        this.ctx.moveTo(compactCenterX, compactCenterY);
        this.ctx.lineTo(lensAnchorX, lensAnchorY);
        this.ctx.strokeStyle = colors.connector;
        this.ctx.lineWidth = Math.max(0.8, 1 * this.camera.zoom);
        this.ctx.stroke();
      }

      const label = "Lens";
      const fontSize = Math.max(8, 10 * this.camera.zoom);
      this.ctx.font = `${fontSize}px sans-serif`;
      this.ctx.textAlign = "left";
      this.ctx.textBaseline = "top";
      this.ctx.fillStyle = colors.text;
      this.ctx.fillText(label, x + Math.max(4, 6 * this.camera.zoom), y + Math.max(3, 4 * this.camera.zoom));
      this.ctx.restore();
    }
  }

  private getGraphLensButtonSizeScreen(): number {
    return Math.max(14, this.getGraphLensTitleBarHeight() * this.camera.zoom - Math.max(4, 4 * this.camera.zoom));
  }

  private drawGraphLensButton(
    x: number,
    y: number,
    size: number,
    colors: ReturnType<GraphEngine["getGraphLensColors"]>,
    kind: "close" | "maximize" | "restore" | "fit"
  ): void {
    this.ctx.save();
    this.ctx.beginPath();
    this.roundRectPath(x, y, size, size, Math.max(3, size * 0.18));
    this.ctx.fillStyle = colors.buttonFill;
    this.ctx.fill();
    this.ctx.strokeStyle = colors.buttonBorder;
    this.ctx.lineWidth = Math.max(1, this.camera.zoom);
    this.ctx.stroke();
    this.ctx.strokeStyle = colors.buttonIcon;
    this.ctx.lineWidth = Math.max(1, size * 0.08);
    this.ctx.beginPath();
    if (kind === "close") {
      this.ctx.moveTo(x + size * 0.32, y + size * 0.32);
      this.ctx.lineTo(x + size * 0.68, y + size * 0.68);
      this.ctx.moveTo(x + size * 0.68, y + size * 0.32);
      this.ctx.lineTo(x + size * 0.32, y + size * 0.68);
    } else if (kind === "maximize") {
      this.ctx.rect(x + size * 0.3, y + size * 0.3, size * 0.4, size * 0.4);
    } else if (kind === "fit") {
      const left = x + size * 0.28;
      const right = x + size * 0.72;
      const top = y + size * 0.28;
      const bottom = y + size * 0.72;
      const tick = size * 0.16;
      this.ctx.moveTo(left, top + tick);
      this.ctx.lineTo(left, top);
      this.ctx.lineTo(left + tick, top);
      this.ctx.moveTo(right - tick, top);
      this.ctx.lineTo(right, top);
      this.ctx.lineTo(right, top + tick);
      this.ctx.moveTo(right, bottom - tick);
      this.ctx.lineTo(right, bottom);
      this.ctx.lineTo(right - tick, bottom);
      this.ctx.moveTo(left + tick, bottom);
      this.ctx.lineTo(left, bottom);
      this.ctx.lineTo(left, bottom - tick);
    } else {
      this.ctx.rect(x + size * 0.24, y + size * 0.36, size * 0.34, size * 0.34);
      this.ctx.moveTo(x + size * 0.38, y + size * 0.24);
      this.ctx.lineTo(x + size * 0.72, y + size * 0.24);
      this.ctx.lineTo(x + size * 0.72, y + size * 0.58);
    }
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawContainerNecks(): void {
    const containers = [
      ...Array.from(this.parentContainers.values()),
    ];
    for (const container of containers) {
      const parent = this.nodeMap.get(container.origin);
      if (!parent) continue;

      const centerX = (container.left + container.right) / 2;
      const centerY = (container.top + container.bottom) / 2;
      let directionX = centerX - parent.x;
      let directionY = centerY - parent.y;
      const directionLength = Math.hypot(directionX, directionY);
      if (directionLength < 0.001) continue;
      directionX /= directionLength;
      directionY /= directionLength;

      const halfWidth = Math.max(1, (container.right - container.left) / 2);
      const halfHeight = Math.max(1, (container.bottom - container.top) / 2);
      const hitX = Math.abs(directionX) > 0.0001
        ? halfWidth / Math.abs(directionX)
        : Number.POSITIVE_INFINITY;
      const hitY = Math.abs(directionY) > 0.0001
        ? halfHeight / Math.abs(directionY)
        : Number.POSITIVE_INFINITY;
      const hitDistance = Math.min(hitX, hitY);
      const edgeX = centerX - directionX * hitDistance;
      const edgeY = centerY - directionY * hitDistance;
      const hitsVerticalEdge = hitX <= hitY;
      const edgeTangentX = hitsVerticalEdge ? 0 : 1;
      const edgeTangentY = hitsVerticalEdge ? 1 : 0;
      const nodeTangentX = -directionY;
      const nodeTangentY = directionX;
      const parentRadius = this.getEffectiveNodeRadius(parent);
      const edgeSpan = Math.min(
        18,
        Math.max(7, (hitsVerticalEdge ? halfHeight : halfWidth) * 0.18)
      );
      const nodeSpan = Math.min(10, Math.max(4, parentRadius * 0.42));
      const parentEdgeX = parent.x + directionX * (parentRadius + 1);
      const parentEdgeY = parent.y + directionY * (parentRadius + 1);

      this.ctx.save();
      this.ctx.strokeStyle = this.hexToRgba(container.color, 0.78);
      this.ctx.lineWidth = Math.max(1.1, 1.5 * this.camera.zoom);
      this.ctx.lineCap = "round";
      for (const side of [-1, 1]) {
        const startX = (parentEdgeX + nodeTangentX * nodeSpan * side + this.camera.x) * this.camera.zoom;
        const startY = (parentEdgeY + nodeTangentY * nodeSpan * side + this.camera.y) * this.camera.zoom;
        const endX = (edgeX + edgeTangentX * edgeSpan * side + this.camera.x) * this.camera.zoom;
        const endY = (edgeY + edgeTangentY * edgeSpan * side + this.camera.y) * this.camera.zoom;
        this.ctx.beginPath();
        this.ctx.moveTo(startX, startY);
        this.ctx.lineTo(endX, endY);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }
  }

  private roundRectPath(x: number, y: number, width: number, height: number, radiusRaw: number): void {
    const radius = Math.max(0, Math.min(radiusRaw, width / 2, height / 2));
    this.ctx.moveTo(x + radius, y);
    this.ctx.lineTo(x + width - radius, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.ctx.lineTo(x + width, y + height - radius);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.ctx.lineTo(x + radius, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.ctx.lineTo(x, y + radius);
    this.ctx.quadraticCurveTo(x, y, x + radius, y);
    this.ctx.closePath();
  }

  private getCanvasPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  private beginMarqueeSelection(e: MouseEvent): void {
    const point = this.getCanvasPoint(e.clientX, e.clientY);
    this.marqueeSelection = {
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y
    };
    this.selectedNodeIds.clear();
    this.altDragFrozenNodeIds = new Set(this.nodes.map((node) => node.id));
    this.badgesDirty = true;
    this.requestRender();
  }

  private updateMarqueeSelection(e: MouseEvent): void {
    if (!this.marqueeSelection) return;
    this.altDragFrozenNodeIds = e.altKey
      ? new Set(this.nodes.map((node) => node.id))
      : new Set<string>();
    const point = this.getCanvasPoint(e.clientX, e.clientY);
    this.marqueeSelection.currentX = point.x;
    this.marqueeSelection.currentY = point.y;

    const left = Math.min(this.marqueeSelection.startX, this.marqueeSelection.currentX);
    const right = Math.max(this.marqueeSelection.startX, this.marqueeSelection.currentX);
    const top = Math.min(this.marqueeSelection.startY, this.marqueeSelection.currentY);
    const bottom = Math.max(this.marqueeSelection.startY, this.marqueeSelection.currentY);
    const next = new Set<string>();

    for (const node of this.nodes) {
      const renderedCenter = this.getRenderedNodeCenter(node);
      const sx = (renderedCenter.x + this.camera.x) * this.camera.zoom;
      const sy = (renderedCenter.y + this.camera.y) * this.camera.zoom;
      if (sx >= left && sx <= right && sy >= top && sy <= bottom) {
        next.add(node.id);
      }
    }

    const changed = this.haveSelectedNodesChanged(next);
    if (changed) {
      this.selectedNodeIds = next;
      this.badgesDirty = true;
    }
    this.requestRender();
  }

  private haveSelectedNodesChanged(next: Set<string>): boolean {
    if (next.size !== this.selectedNodeIds.size) return true;
    for (const nodeId of next) {
      if (!this.selectedNodeIds.has(nodeId)) return true;
    }
    return false;
  }

  private endMarqueeSelection(): void {
    if (!this.marqueeSelection) return;
    this.marqueeSelection = null;
    this.altDragFrozenNodeIds.clear();
    this.badgesDirty = true;
    this.requestRender();
  }

  private captureDraggedNodeOrigins(anchorNode: GraphNode): void {
    const nodeIds = this.selectedNodeIds.has(anchorNode.id)
      ? Array.from(this.selectedNodeIds)
      : [anchorNode.id];
    const excludedLensMemberIds = this.getOpenLensDescendantNodeIds(anchorNode.id);
    this.draggedNodeOriginPositions.clear();
    for (const nodeId of nodeIds) {
      if (nodeId !== anchorNode.id && excludedLensMemberIds.has(nodeId)) continue;
      const node = this.nodeMap.get(nodeId);
      if (!node) continue;
      this.draggedNodeOriginPositions.set(node.id, { x: node.x, y: node.y });
    }
  }

  private getOpenLensDescendantNodeIds(originNodeIdRaw: string): Set<string> {
    const originNodeId = String(originNodeIdRaw ?? "").trim();
    const out = new Set<string>();
    if (!originNodeId) return out;
    const queue = Array.from(this.embeddedGraphContainers.values())
      .filter((container) => container.origin === originNodeId);
    while (queue.length > 0) {
      const container = queue.shift()!;
      for (const nodeId of container.memberIds) {
        out.add(nodeId);
      }
      for (const nested of this.embeddedGraphContainers.values()) {
        if (container.memberIds.has(nested.origin)) {
          queue.push(nested);
        }
      }
    }
    return out;
  }

  private getDraggedLensDescendantNodeIds(): Set<string> {
    const out = new Set<string>();
    const ownerIds = new Set<string>();
    if (this.draggedNode) ownerIds.add(this.draggedNode.id);
    for (const nodeId of this.draggedNodeOriginPositions.keys()) {
      ownerIds.add(nodeId);
    }
    for (const ownerId of ownerIds) {
      for (const descendantId of this.getOpenLensDescendantNodeIds(ownerId)) {
        if (!ownerIds.has(descendantId)) {
          out.add(descendantId);
        }
      }
    }
    return out;
  }

  private updateDraggedNodePositions(pointerWorldX: number, pointerWorldY: number): void {
    if (!this.draggedNode) return;
    if (this.draggedNodeOriginPositions.size === 0) {
      this.captureDraggedNodeOrigins(this.draggedNode);
    }

    const draggedOrigin = this.draggedNodeOriginPositions.get(this.draggedNode.id) ?? {
      x: this.draggedNode.x,
      y: this.draggedNode.y
    };
    const target = this.getNodeWorldPointFromRenderedPoint(this.draggedNode, pointerWorldX, pointerWorldY);
    const dx = target.x - draggedOrigin.x;
    const dy = target.y - draggedOrigin.y;

    for (const [nodeId, origin] of this.draggedNodeOriginPositions.entries()) {
      const node = this.nodeMap.get(nodeId);
      if (!node) continue;
      node.x = origin.x + dx;
      node.y = origin.y + dy;
      node.vx = 0;
      node.vy = 0;
    }
  }

  private persistDraggedNodePositions(options?: { excludeNodeIds?: Set<string> }): void {
    for (const nodeId of this.draggedNodeOriginPositions.keys()) {
      if (options?.excludeNodeIds?.has(nodeId)) continue;
      const node = this.nodeMap.get(nodeId);
      if (!node) continue;
      this.emitNodePositionChanged(node, node.x, node.y, this.isNodePinned(node));
    }
  }

  private emitNodePositionChanged(node: GraphNode, x?: number, y?: number, pinned = false): void {
    if (node.stateOwnerPath && node.embeddedInstanceId && node.embeddedSourceNodeId) {
      const container = this.embeddedGraphContainers.get(node.embeddedInstanceId);
      if (!container) return;
      const centerX = (container.left + container.right) / 2;
      const centerY = (container.top + container.bottom) / 2;
      void this.menuOptions.onEmbeddedNodePositionChanged?.({
        ownerGraphPath: node.stateOwnerPath,
        instanceId: node.embeddedInstanceId,
        sourceNodeId: node.embeddedSourceNodeId,
        ...(x === undefined || y === undefined
          ? {}
          : {
              x: container.sourceCenterX + (x - centerX),
              y: container.sourceCenterY + (y - centerY)
            }),
        pinned
      });
      return;
    }
    this.onNodePositionChanged?.(node.id, x, y);
  }

  private beginPinnedNodeRepositioning(): void {
    this.repositioningPinnedNodeIds.clear();
    for (const nodeId of this.draggedNodeOriginPositions.keys()) {
      const node = this.nodeMap.get(nodeId);
      if (!node || !this.isNodePinned(node)) continue;
      this.repositioningPinnedNodeIds.add(node.id);
      node.repositioningPin = true;
      delete node.fx;
      delete node.fy;
      node.isLocked = false;
      delete node.lockX;
      delete node.lockY;
    }
  }

  private finishPinnedNodeRepositioning(options?: { persist?: boolean }): void {
    for (const nodeId of this.repositioningPinnedNodeIds) {
      const node = this.nodeMap.get(nodeId);
      if (!node) continue;
      this.pinNode(node, { persist: options?.persist !== false });
      node.repositioningPin = false;
    }
    this.repositioningPinnedNodeIds.clear();
  }

  private onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    this.clearNodeHoverPreview();
    this.clearTopologyUpdateFreeze();
    this.container.focus();
    this.isAltPressed = e.altKey;

    this.dragPointerClient = { x: e.clientX, y: e.clientY };
    this.mouseDownScreen = { x: e.clientX, y: e.clientY };
    this.pressedNode = null;
    this.draggedNode = null;
    this.isDraggingNode = false;
    this.dragBadgeRevealNodeId = null;
    this.panningEmbeddedContainer = null;
    this.movingGraphLens = null;
    this.resizingGraphLens = null;
    this.pendingEmbeddedLensClickNodeId = null;
    this.isPanning = true;
    this.didPan = false;
    this.panStart = { x: e.clientX, y: e.clientY };
    this.cameraStart = { ...this.camera };

    const lensButtonTarget = this.findGraphLensButtonAtScreenPosition(e.clientX, e.clientY);
    if (lensButtonTarget) {
      if (lensButtonTarget.action === "close") {
        this.collapseEmbeddedGraph(lensButtonTarget.container.origin, lensButtonTarget.container.graphPath);
      } else if (lensButtonTarget.action === "maximize") {
        this.toggleGraphLensMaximized(lensButtonTarget.container);
      } else {
        this.fitEmbeddedContainerViewToLens(lensButtonTarget.container);
        this.notifyEmbeddedGraphLensChanged(lensButtonTarget.container);
        this.requestRender();
      }
      this.isPanning = false;
      this.didPan = true;
      return;
    }

    const lensResizeTarget = this.findGraphLensResizeTargetAtScreenPosition(e.clientX, e.clientY);
    if (lensResizeTarget) {
      this.resizingGraphLens = lensResizeTarget.container;
      const transform = this.getEmbeddedContainerRenderTransform(lensResizeTarget.container);
      const bounds = this.getGraphLensBounds(lensResizeTarget.container);
      const lensCenterX = (bounds.left + bounds.right) / 2;
      const lensCenterY = (bounds.top + bounds.bottom) / 2;
      const viewportCenterX = Number.isFinite(transform.scale) && Math.abs(transform.scale) >= 0.001
        ? transform.sourceCenterX + ((lensCenterX - transform.targetCenterX) / transform.scale)
        : 0;
      const viewportCenterY = Number.isFinite(transform.scale) && Math.abs(transform.scale) >= 0.001
        ? transform.sourceCenterY + ((lensCenterY - transform.targetCenterY) / transform.scale)
        : 0;
      this.lensResizeStart = {
        width: Number(lensResizeTarget.container.lensWidth) || this.getGraphLensWidth(this.nodeMap.get(lensResizeTarget.container.origin)),
        height: Number(lensResizeTarget.container.lensHeight) || this.getGraphLensHeight(this.nodeMap.get(lensResizeTarget.container.origin)),
        offsetX: Number.isFinite(lensResizeTarget.container.lensOffsetX) ? lensResizeTarget.container.lensOffsetX : 0,
        offsetY: Number.isFinite(lensResizeTarget.container.lensOffsetY) ? lensResizeTarget.container.lensOffsetY : 0,
        edgeX: lensResizeTarget.edgeX,
        edgeY: lensResizeTarget.edgeY,
        viewportCenterX,
        viewportCenterY
      };
      this.isPanning = false;
      this.setGraphCursor(this.getGraphLensResizeCursor(lensResizeTarget.edgeX, lensResizeTarget.edgeY));
      return;
    }

    const lensMoveTarget = this.findGraphLensMoveHandleAtScreenPosition(e.clientX, e.clientY);
    if (lensMoveTarget) {
      this.movingGraphLens = lensMoveTarget;
      this.lensMoveStart = {
        x: Number.isFinite(lensMoveTarget.lensOffsetX) ? lensMoveTarget.lensOffsetX : 0,
        y: Number.isFinite(lensMoveTarget.lensOffsetY) ? lensMoveTarget.lensOffsetY : 0
      };
      this.isPanning = false;
      this.setGraphCursor("move");
      return;
    }

    if (e.altKey) {
      this.isPanning = false;
      this.didPan = true;
      this.beginMarqueeSelection(e);
      this.setGraphCursor("crosshair");
      return;
    }

    const embeddedContainer = this.findEmbeddedContainerAtScreenPosition(e.clientX, e.clientY);
    if (embeddedContainer) {
      const embeddedClickedNode = this.findNodeAtScreenPosition(e.clientX, e.clientY, new Set(), { ignoreLockedEmbeddedContainers: true });
      if (embeddedClickedNode?.embeddedInstanceId === embeddedContainer.key) {
        this.pressedNode = embeddedClickedNode;
        if (e.shiftKey) {
          this.toggleNodeSelection(this.pressedNode.id);
          this.requestRender();
          this.pressedNode = null;
          this.isPanning = false;
          return;
        }
        if (!this.selectedNodeIds.has(this.pressedNode.id)) {
          this.selectOnlyNode(this.pressedNode.id);
        }
        this.captureDraggedNodeOrigins(this.pressedNode);
        this.pressedNode.repositioningPin = false;
        this.isPanning = false;
        this.requestRender();
        return;
      }
      this.pendingEmbeddedLensClickNodeId = embeddedClickedNode?.embeddedInstanceId === embeddedContainer.key
        ? embeddedClickedNode.id
        : null;
      this.panningEmbeddedContainer = embeddedContainer;
      this.embeddedPanStart = {
        x: Number.isFinite(embeddedContainer.viewPanX) ? embeddedContainer.viewPanX : 0,
        y: Number.isFinite(embeddedContainer.viewPanY) ? embeddedContainer.viewPanY : 0
      };
      this.isPanning = false;
      this.didPan = false;
      this.setGraphCursor("grab");
      return;
    }

    this.pressedNode = this.findNodeAtScreenPosition(e.clientX, e.clientY, new Set(), { ignoreLockedEmbeddedContainers: true });
    if (this.pressedNode) {
      if (e.shiftKey) {
        this.toggleNodeSelection(this.pressedNode.id);
        this.requestRender();
        this.pressedNode = null;
        this.isPanning = false;
        return;
      }

      if (!this.selectedNodeIds.has(this.pressedNode.id)) {
        this.selectOnlyNode(this.pressedNode.id);
      }
      this.captureDraggedNodeOrigins(this.pressedNode);
      this.pressedNode.repositioningPin = false;
      this.isPanning = false;
      this.requestRender();
      return;
    }

    this.setGraphCursor("grab");
  }

  private onMouseMove(e: MouseEvent) {
    this.dragPointerClient = { x: e.clientX, y: e.clientY };
    this.isAltPressed = e.altKey;
    this.updateAltDragFreeze();
    this.updateGraphLensCursor(e.clientX, e.clientY);
    if (!this.isClientPointInsideContainer(e.clientX, e.clientY)) {
      this.clearNodeHoverPreview();
      return;
    }
    if (this.marqueeSelection) {
      this.clearNodeHoverPreview();
      this.updateMarqueeSelection(e);
      return;
    }
    if (this.panningEmbeddedContainer) {
      this.clearNodeHoverPreview();
      const dx = (e.clientX - this.panStart.x) / this.camera.zoom;
      const dy = (e.clientY - this.panStart.y) / this.camera.zoom;
      this.panningEmbeddedContainer.viewPanX = this.embeddedPanStart.x + dx;
      this.panningEmbeddedContainer.viewPanY = this.embeddedPanStart.y + dy;
      this.didPan = Math.hypot(e.clientX - this.panStart.x, e.clientY - this.panStart.y) > this.clickDragThreshold;
      this.requestRender();
      return;
    }
    if (this.movingGraphLens) {
      this.clearNodeHoverPreview();
      const dx = (e.clientX - this.panStart.x) / this.camera.zoom;
      const dy = (e.clientY - this.panStart.y) / this.camera.zoom;
      this.movingGraphLens.lensOffsetX = this.lensMoveStart.x + dx;
      this.movingGraphLens.lensOffsetY = this.lensMoveStart.y + dy;
      this.movingGraphLens.lensUserPositioned = true;
      this.didPan = Math.hypot(e.clientX - this.panStart.x, e.clientY - this.panStart.y) > this.clickDragThreshold;
      this.requestRender();
      return;
    }
    if (this.resizingGraphLens) {
      this.clearNodeHoverPreview();
      const dx = (e.clientX - this.panStart.x) / this.camera.zoom;
      const dy = (e.clientY - this.panStart.y) / this.camera.zoom;
      const minSize = this.getMinimumContainerViewportSize();
      if (this.lensResizeStart.edgeX !== 0) {
        const proposedWidth = this.lensResizeStart.width + (this.lensResizeStart.edgeX * dx);
        const newWidth = Math.max(minSize, proposedWidth);
        const consumedDx = this.lensResizeStart.edgeX === -1
          ? this.lensResizeStart.width - newWidth
          : newWidth - this.lensResizeStart.width;
        this.resizingGraphLens.lensWidth = newWidth;
        if (this.lensResizeStart.edgeX === -1) {
          this.resizingGraphLens.lensOffsetX = this.lensResizeStart.offsetX + consumedDx;
        }
      }
      if (this.lensResizeStart.edgeY !== 0) {
        const proposedHeight = this.lensResizeStart.height + (this.lensResizeStart.edgeY * dy);
        const newHeight = Math.max(minSize, proposedHeight);
        const consumedDy = this.lensResizeStart.edgeY === -1
          ? this.lensResizeStart.height - newHeight
          : newHeight - this.lensResizeStart.height;
        this.resizingGraphLens.lensHeight = newHeight;
        this.resizingGraphLens.lensOffsetY = this.lensResizeStart.offsetY + (consumedDy / 2);
      }
      this.resizingGraphLens.lensUserPositioned = true;
      this.resizingGraphLens.lensMaximized = false;
      this.setEmbeddedContainerViewportCenter(
        this.resizingGraphLens,
        this.lensResizeStart.viewportCenterX,
        this.lensResizeStart.viewportCenterY
      );
      this.didPan = Math.hypot(e.clientX - this.panStart.x, e.clientY - this.panStart.y) > this.clickDragThreshold;
      this.requestRender();
      return;
    }
    const targetEl = this.isHTMLElement(e.target)
      ? e.target.closest("[data-o3-expansion-key]") as HTMLElement | null
      : null;
    const nextHoveredExpansionKey = targetEl?.dataset?.o3ExpansionKey ?? null;
    if (nextHoveredExpansionKey !== this.hoveredExpansionKey) {
      this.hoveredExpansionKey = nextHoveredExpansionKey;
      this.refreshHoveredHighlightNodes();
      this.requestRender();
    }

    const hoveredNode = this.findNodeAtScreenPosition(e.clientX, e.clientY);
    const actualHoveredNode = this.findActualNodeAtScreenPosition(e.clientX, e.clientY);
    if (!this.isDraggingNode && !this.pressedNode && !this.isPanning) {
      this.scheduleNodeHoverPreview(actualHoveredNode, e);
    } else {
      this.clearNodeHoverPreview();
    }
    const nextHoveredDuplicateNodeIds = this.computeHoveredDuplicateNodeIds(hoveredNode);
    if (!this.areSetsEqual(nextHoveredDuplicateNodeIds, this.hoveredDuplicateNodeIds)) {
      this.hoveredDuplicateNodeIds = nextHoveredDuplicateNodeIds;
      this.requestRender();
    }

    if (this.isDraggingNode && this.draggedNode) {
      this.clearNodeHoverPreview();
      const world = this.clientToWorld(e.clientX, e.clientY);
      this.updateDraggedNodePositions(world.x, world.y);
      if (this.draggedNode.isBase) {
        this.directionLockedNodeTargets.clear();
        this.directionLayoutDirty = true;
      }
      this.updateDragBadgeRevealTarget(e.clientX, e.clientY);
      this.didPan = true;
      return;
    }

    if (this.pressedNode) {
      this.clearNodeHoverPreview();
      const dragDistance = Math.hypot(
        e.clientX - this.mouseDownScreen.x,
        e.clientY - this.mouseDownScreen.y
      );
      if (dragDistance > this.clickDragThreshold) {
        this.startSimulation();
        this.didPan = true;
        this.draggedNode = this.pressedNode;
        this.draggedNode.repositioningPin = false;
        this.beginPinnedNodeRepositioning();
        this.isDraggingNode = true;
        this.badgesDirty = true;
        const world = this.clientToWorld(e.clientX, e.clientY);
        this.updateDraggedNodePositions(world.x, world.y);
        this.updateAltDragFreeze();
        this.updateDragBadgeRevealTarget(e.clientX, e.clientY);
        this.requestRender();
      }
      return;
    }

    if (!this.isPanning) return;

    const dx = (e.clientX - this.panStart.x) / this.camera.zoom;
    const dy = (e.clientY - this.panStart.y) / this.camera.zoom;

    const dragDistance = Math.hypot(
      e.clientX - this.panStart.x,
      e.clientY - this.panStart.y
    );
    if (dragDistance > this.clickDragThreshold) {
      this.startSimulation();
      this.didPan = true;
      this.setGraphCursor("grabbing");
    }

    this.camera.x = this.cameraStart.x + dx;
    this.camera.y = this.cameraStart.y + dy;
    this.emitViewportChanged();
    this.requestRender();
  }

  private onMouseUp(e: MouseEvent) {
    if (this.dragHoldTimer !== null) {
      window.clearTimeout(this.dragHoldTimer);
      this.dragHoldTimer = null;
    }
    const wasPanningEmbeddedContainer = this.panningEmbeddedContainer !== null;
    const wasMovingGraphLens = this.movingGraphLens !== null;
    const wasResizingGraphLens = this.resizingGraphLens !== null;
    const pannedEmbeddedContainer = this.panningEmbeddedContainer;
    const movedGraphLens = this.movingGraphLens;
    const resizedGraphLens = this.resizingGraphLens;
    this.panningEmbeddedContainer = null;
    this.movingGraphLens = null;
    this.resizingGraphLens = null;
    this.updateGraphLensCursor(e.clientX, e.clientY);

    if (e.button === 0) {
      if (wasPanningEmbeddedContainer || wasMovingGraphLens || wasResizingGraphLens) {
        if (wasPanningEmbeddedContainer && this.didPan && pannedEmbeddedContainer) {
          this.notifyEmbeddedGraphLensChanged(pannedEmbeddedContainer);
        }
        if (wasMovingGraphLens && this.didPan && movedGraphLens) {
          this.notifyEmbeddedGraphLensChanged(movedGraphLens);
        }
        if (wasResizingGraphLens && this.didPan && resizedGraphLens) {
          this.notifyEmbeddedGraphLensChanged(resizedGraphLens);
        }
        if (
          wasPanningEmbeddedContainer
          && !this.didPan
          && this.pendingEmbeddedLensClickNodeId
          && this.nodeMap.has(this.pendingEmbeddedLensClickNodeId)
        ) {
          if (e.shiftKey) {
            this.toggleNodeSelection(this.pendingEmbeddedLensClickNodeId);
          } else {
            this.selectOnlyNode(this.pendingEmbeddedLensClickNodeId);
          }
        } else if (wasPanningEmbeddedContainer && !this.didPan) {
          this.clearNodeSelection();
        }
      } else if (this.isDraggingNode) {
        const dragged = this.draggedNode;
        if (dragged) {
          const badgeDropTarget = this.findBadgeDropTargetAtClientPosition(e.clientX, e.clientY, dragged.id);
          if (badgeDropTarget) {
            void this.applyNodeDropToBadge(dragged, badgeDropTarget, e.altKey);
          } else {
            this.persistDraggedNodePositions({ excludeNodeIds: this.repositioningPinnedNodeIds });
          }
          this.finishPinnedNodeRepositioning();
          if (dragged.isBase) {
            this.directionLockedNodeTargets.clear();
          }
          this.directionLayoutDirty = true;
          dragged.repositioningPin = false;
        }
        this.isDraggingNode = false;
        this.draggedNode = null;
        this.draggedNodeOriginPositions.clear();
        this.setDragBadgeRevealNodeId(null);
        this.repositioningPinnedNodeIds.clear();
        this.badgesDirty = true;
      } else if (this.marqueeSelection) {
        this.endMarqueeSelection();
      } else if (this.pressedNode && !this.didPan) {
        this.selectOnlyNode(this.pressedNode.id);
      } else if (this.isPanning && !this.didPan) {
        const clickedNode = this.findNodeAtScreenPosition(e.clientX, e.clientY);
        if (clickedNode) {
          this.selectOnlyNode(clickedNode.id);
        } else {
          this.clearNodeSelection();
        }
      }
    }

    const wasPanning = this.isPanning;
    const didPan = this.didPan;
    this.isPanning = false;
    if (this.pressedNode) {
      this.pressedNode.repositioningPin = false;
    }
    if (!this.isDraggingNode) {
      this.draggedNodeOriginPositions.clear();
      this.repositioningPinnedNodeIds.clear();
    }
    this.pressedNode = null;
    this.pendingEmbeddedLensClickNodeId = null;
    this.isAltPressed = e.altKey;
    this.dragPointerClient = { x: 0, y: 0 };
    if (!this.marqueeSelection) {
      this.altDragFrozenNodeIds.clear();
    }
    if (wasPanning && didPan) {
      this.emitViewportChanged({ isFinal: true });
    }
    if (this.badgeOverlay) {
      this.badgeOverlay.draggable = false;
    }
  }

  private onDoubleClick(e: MouseEvent): void {
    if (e.button !== 0) return;
    const node = this.findNodeAtScreenPosition(e.clientX, e.clientY);
    if (!node) return;
    this.selectOnlyNode(node.id);
    void this.openNodeFile(node);
  }

  private onNativeDragStart(e: DragEvent): void {
    const transfer = e.dataTransfer;
    if (!transfer) {
      e.preventDefault();
      return;
    }

    const node = this.findNodeAtScreenPosition(e.clientX, e.clientY) ?? this.pressedNode;
    if (!node) {
      e.preventDefault();
      return;
    }

    if (!this.selectedNodeIds.has(node.id)) {
      this.selectOnlyNode(node.id);
    }
    this.captureDraggedNodeOrigins(node);

    const refs = this.getDraggedGraphNodeMutationRefs(node);
    if (refs.length === 0) {
      e.preventDefault();
      return;
    }

    const paths = refs.map((ref) => ref.path);
    const markdownLinks = paths.map((path) => this.pathToWikiLink(path)).join("\n");
    transfer.effectAllowed = "copyMove";
    transfer.setData("application/x-o3-graph-node-paths", JSON.stringify(paths));
    transfer.setData("text/markdown", markdownLinks);
    transfer.setData("text/plain", markdownLinks);
    this.startObsidianFileDrag(e, paths);
    this.setTransparentDragImage(transfer);

    if (this.dragHoldTimer !== null) {
      window.clearTimeout(this.dragHoldTimer);
      this.dragHoldTimer = null;
    }
    this.nativeGraphDragActive = true;
    this.nativeGraphDropHandled = false;
    this.lastNativeDragClient = { x: e.clientX, y: e.clientY };
    this.draggedNode = node;
    this.isDraggingNode = true;
    this.isPanning = false;
    this.didPan = true;
    this.badgesDirty = true;
    this.requestRender();
  }

  private onNativeDragOver(e: DragEvent): void {
    if (!this.nativeGraphDragActive || !this.draggedNode) return;
    this.lastNativeDragClient = { x: e.clientX, y: e.clientY };
    if (!this.isClientPointInsideContainer(e.clientX, e.clientY)) return;
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    const world = this.clientToWorld(e.clientX, e.clientY);
    this.updateDraggedNodePositions(world.x, world.y);
    this.requestRender();
  }

  private onNativeDrop(e: DragEvent): void {
    if (!this.nativeGraphDragActive) return;
    if (!this.isClientPointInsideContainer(e.clientX, e.clientY)) return;
    e.preventDefault();
    this.nativeGraphDropHandled = true;
    this.finishNativeGraphDrag(true);
  }

  private onNativeDragEnd(e: DragEvent): void {
    if (this.nativeGraphDragActive) {
      this.lastNativeDragClient = { x: e.clientX, y: e.clientY };
      const keepGraphPosition = this.nativeGraphDropHandled || this.isClientPointInsideContainer(e.clientX, e.clientY);
      this.finishNativeGraphDrag(keepGraphPosition);
      return;
    }

    if (this.dragHoldTimer !== null) {
      window.clearTimeout(this.dragHoldTimer);
      this.dragHoldTimer = null;
    }
    if (this.badgeOverlay) {
      this.badgeOverlay.draggable = false;
    }

    const dragged = this.draggedNode;
    if (this.isDraggingNode && dragged) {
      this.persistDraggedNodePositions({ excludeNodeIds: this.repositioningPinnedNodeIds });
      this.finishPinnedNodeRepositioning();
      dragged.repositioningPin = false;
    }

    this.isDraggingNode = false;
    this.draggedNode = null;
    this.draggedNodeOriginPositions.clear();
    this.setDragBadgeRevealNodeId(null);
    this.repositioningPinnedNodeIds.clear();
    if (this.pressedNode) {
      this.pressedNode.repositioningPin = false;
    }
    this.pressedNode = null;
    this.isPanning = false;
    this.didPan = false;
    this.dragPointerClient = { x: 0, y: 0 };
    this.altDragFrozenNodeIds.clear();
    this.isAltPressed = e.altKey;
    this.badgesDirty = true;
    this.requestRender();
  }

  private finishNativeGraphDrag(keepGraphPosition: boolean): void {
    if (keepGraphPosition) {
      this.persistDraggedNodePositions({ excludeNodeIds: this.repositioningPinnedNodeIds });
      this.finishPinnedNodeRepositioning();
    } else {
      this.restoreDraggedNodeOriginPositions();
      this.finishPinnedNodeRepositioning({ persist: false });
    }
    this.nativeGraphDragActive = false;
    this.nativeGraphDropHandled = false;
    this.lastNativeDragClient = null;
    this.isDraggingNode = false;
    this.draggedNode = null;
    this.draggedNodeOriginPositions.clear();
    this.setDragBadgeRevealNodeId(null);
    this.repositioningPinnedNodeIds.clear();
    if (this.pressedNode) {
      this.pressedNode.repositioningPin = false;
    }
    this.pressedNode = null;
    this.isPanning = false;
    this.didPan = false;
    this.dragPointerClient = { x: 0, y: 0 };
    this.altDragFrozenNodeIds.clear();
    this.badgesDirty = true;
    this.requestRender();
  }

  private startObsidianFileDrag(event: DragEvent, paths: string[]): void {
    const dragManager = (this.app as unknown as {
      dragManager?: {
        dragFile?: (event: DragEvent, file: TFile) => unknown;
        dragFiles?: (event: DragEvent, files: TFile[]) => unknown;
        onDragStart?: (event: DragEvent, dragData: unknown) => void;
      };
    }).dragManager;
    if (!dragManager?.onDragStart) return;

    const files = paths
      .map((path) => this.app.vault.getAbstractFileByPath(path))
      .filter((file): file is TFile => file instanceof TFile);
    if (files.length === 0) return;

    try {
      const dragData = files.length > 1 && dragManager.dragFiles
        ? dragManager.dragFiles(event, files)
        : dragManager.dragFile?.(event, files[0]);
      if (dragData !== undefined) {
        dragManager.onDragStart(event, dragData);
      }
    } catch (error) {
      if (this.debugEnabled) {
        console.warn("[GraphEngine] Obsidian drag manager failed.", error);
      }
    }
  }

  private shouldRenderEdgeDashed(edge: Edge): boolean {
    if (edge.mode === "visible") return this.visibleLinkTypeLineStyle === "dashed";
    if (edge.mode === "overlay") return true;
    if (edge.relationship === "parent") return false;
    return this.discoveredLinkLineStyle === "dashed";
  }

  private setTransparentDragImage(transfer: DataTransfer): void {
    try {
      const image = this.getTransparentDragImage();
      transfer.setDragImage(image, 0, 0);
    } catch (error) {
      if (this.debugEnabled) {
        console.warn("[GraphEngine] Failed to set transparent drag image.", error);
      }
    }
  }

  private getTransparentDragImage(): HTMLElement {
    if (this.transparentDragImage) return this.transparentDragImage;
    const image = this.createElement("div");
    setStyle(image, "position", "fixed");
    setStyle(image, "left", "-10000px");
    setStyle(image, "top", "-10000px");
    setStyle(image, "width", "1px");
    setStyle(image, "height", "1px");
    setStyle(image, "opacity", "0");
    setStyle(image, "pointerEvents", "none");
    document.body.appendChild(image);
    this.transparentDragImage = image;
    return image;
  }

  private restoreDraggedNodeOriginPositions(): void {
    for (const [nodeId, origin] of this.draggedNodeOriginPositions.entries()) {
      const node = this.nodeMap.get(nodeId);
      if (!node) continue;
      node.x = origin.x;
      node.y = origin.y;
      node.vx = 0;
      node.vy = 0;
    }
  }

  private isClientPointInsideContainer(clientX: number, clientY: number): boolean {
    const rect = this.container.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  private pathToWikiLink(path: string): string {
    const normalized = String(path ?? "").trim().replace(/\\/g, "/").replace(/\.md$/i, "");
    return normalized ? `[[${normalized}]]` : "";
  }

  private pathToHoverLinkText(path: string): string {
    return String(path ?? "").trim().replace(/\\/g, "/").replace(/\.md$/i, "");
  }

  private scheduleNodeHoverPreview(node: GraphNode | null, event: MouseEvent): void {
    const nodeId = node?.id ?? null;
    if (!nodeId) {
      this.clearNodeHoverPreview();
      return;
    }

    if (this.hoverPreviewTriggeredNodeId === nodeId) {
      this.positionHoverPreviewTarget(event.clientX, event.clientY);
      return;
    }

    if (this.hoverPreviewNodeId === nodeId && this.hoverPreviewTimer !== null) {
      this.positionHoverPreviewTarget(event.clientX, event.clientY);
      return;
    }

    this.clearNodeHoverPreview();
    this.hoverPreviewNodeId = nodeId;
    this.positionHoverPreviewTarget(event.clientX, event.clientY);
    const clientX = event.clientX;
    const clientY = event.clientY;
    this.hoverPreviewTimer = window.setTimeout(() => {
      this.hoverPreviewTimer = null;
      const currentNode = this.nodeMap.get(nodeId);
      const hoveredNode = this.findActualNodeAtScreenPosition(clientX, clientY);
      if (!currentNode || hoveredNode?.id !== nodeId) {
        this.clearNodeHoverPreview();
        return;
      }
      this.triggerNodeHoverPreview(currentNode, event);
    }, this.hoverPreviewDelayMs);
  }

  private clearNodeHoverPreview(): void {
    if (this.hoverPreviewTimer !== null) {
      window.clearTimeout(this.hoverPreviewTimer);
      this.hoverPreviewTimer = null;
    }
    this.hoverPreviewNodeId = null;
    this.hoverPreviewTriggeredNodeId = null;
  }

  private positionHoverPreviewTarget(clientX: number, clientY: number): void {
    if (!this.hoverPreviewTargetEl) return;
    const rect = this.container.getBoundingClientRect();
    setStyle(this.hoverPreviewTargetEl, "left", `${Math.max(0, clientX - rect.left)}px`);
    setStyle(this.hoverPreviewTargetEl, "top", `${Math.max(0, clientY - rect.top)}px`);
  }

  private triggerNodeHoverPreview(node: GraphNode, event: MouseEvent): void {
    const targetEl = this.hoverPreviewTargetEl ?? this.canvas;
    const hoverParent = this.menuOptions.hoverParent;
    if (!hoverParent || !targetEl) return;
    const ref = this.getGraphNodeMutationRef(node);
    const linktext = this.pathToHoverLinkText(ref?.path ?? node.sourcePath);
    if (!linktext) return;
    this.hoverPreviewTriggeredNodeId = node.id;
    this.app.workspace.trigger("hover-link", {
      event,
      source: "o3-graph-view",
      hoverParent,
      targetEl,
      linktext,
      sourcePath: this.menuOptions.hoverSourcePath?.() ?? ""
    });
  }

  private updateAltDragFreeze(): void {
    if (!this.isDraggingNode || !this.draggedNode || !this.isAltPressed) {
      if (this.altDragFrozenNodeIds.size > 0) {
        this.altDragFrozenNodeIds.clear();
      }
      return;
    }

    const draggedNodeIds = new Set(this.draggedNodeOriginPositions.keys());
    draggedNodeIds.add(this.draggedNode.id);
    this.altDragFrozenNodeIds = new Set(
      this.nodes
        .map((node) => node.id)
        .filter((nodeId) => !draggedNodeIds.has(nodeId)),
    );
  }

  private findBadgeDropTargetAtClientPosition(
    clientX: number,
    clientY: number,
    draggedNodeId: string,
  ): BadgeDropTarget | null {
    const element = document.elementFromPoint(clientX, clientY);
    let badgeElement = this.isHTMLElement(element)
      ? element.closest("[data-o3-expansion-key]") as HTMLElement | null
      : null;
    if (!badgeElement) {
      badgeElement = this.findNearestBadgeElementAtClientPosition(clientX, clientY);
    }
    const expansionKey = badgeElement?.dataset.o3ExpansionKey;
    if (!expansionKey) return null;

    const separator = expansionKey.lastIndexOf("::");
    if (separator <= 0) return null;
    const nodeId = expansionKey.slice(0, separator);
    const linkType = this.normalizeLinkType(expansionKey.slice(separator + 2));
    if (!nodeId || !linkType || nodeId === draggedNodeId) return null;

    return { nodeId, linkType };
  }

  private updateDragBadgeRevealTarget(clientX: number, clientY: number): void {
    if (!this.isDraggingNode || !this.draggedNode) {
      this.setDragBadgeRevealNodeId(null);
      return;
    }
    this.setDragBadgeRevealNodeId(this.resolveDragBadgeRevealNodeId(clientX, clientY, this.draggedNode.id));
  }

  private setDragBadgeRevealNodeId(nodeId: string | null): void {
    const normalized = String(nodeId ?? "").trim() || null;
    if (normalized === this.dragBadgeRevealNodeId) return;
    this.dragBadgeRevealNodeId = normalized;
    this.badgesDirty = true;
    this.requestRender();
  }

  private resolveDragBadgeRevealNodeId(clientX: number, clientY: number, draggedNodeId: string): string | null {
    const badgeDropTarget = this.findBadgeDropTargetAtClientPosition(clientX, clientY, draggedNodeId);
    if (badgeDropTarget?.nodeId) return badgeDropTarget.nodeId;

    if (
      this.dragBadgeRevealNodeId
      && this.dragBadgeRevealNodeId !== draggedNodeId
      && this.isClientPointInNodeBadgeRevealZone(this.dragBadgeRevealNodeId, clientX, clientY)
    ) {
      return this.dragBadgeRevealNodeId;
    }

    const excluded = this.getDraggedNodeIdSet(draggedNodeId);
    const hoveredNode = this.findActualNodeAtScreenPosition(clientX, clientY, excluded);
    if (!hoveredNode) return null;
    if (hoveredNode.id === draggedNodeId || excluded.has(hoveredNode.id)) return null;
    return hoveredNode.id;
  }

  private getDraggedNodeIdSet(draggedNodeId: string): Set<string> {
    const out = new Set<string>([draggedNodeId]);
    for (const nodeId of this.draggedNodeOriginPositions.keys()) {
      out.add(nodeId);
    }
    if (this.selectedNodeIds.has(draggedNodeId)) {
      for (const nodeId of this.selectedNodeIds) {
        out.add(nodeId);
      }
    }
    return out;
  }

  private isClientPointInNodeBadgeRevealZone(nodeId: string, clientX: number, clientY: number): boolean {
    const node = this.nodeMap.get(nodeId);
    if (!node || node.id === this.draggedNode?.id) return false;

    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const renderedCenter = this.getRenderedNodeCenter(node);
    const expandedContainer = this.getExpandedEmbeddedContainerForOrigin(node.id);
    const useLensFrameAnchor = Boolean(expandedContainer && !node.embeddedInstanceId);
    const sx = useLensFrameAnchor
      ? (expandedContainer.right + this.camera.x) * this.camera.zoom
      : (renderedCenter.x + this.camera.x) * this.camera.zoom;
    const sy = useLensFrameAnchor
      ? (expandedContainer.top + this.camera.y) * this.camera.zoom
      : (renderedCenter.y + this.camera.y) * this.camera.zoom;
    const radius = Math.max(this.getRenderedNodeRadius(node) * this.camera.zoom, 8);
    if (Math.hypot(x - sx, y - sy) <= Math.max(80, radius + 72)) return true;

    if (!this.badgeOverlay) return false;
    for (const element of Array.from(this.badgeOverlay.querySelectorAll<HTMLElement>("[data-o3-expansion-key]"))) {
      const expansionKey = element.dataset.o3ExpansionKey ?? "";
      if (!expansionKey.startsWith(`${nodeId}::`)) continue;
      const badgeRect = element.getBoundingClientRect();
      if (
        clientX >= badgeRect.left - 16
        && clientX <= badgeRect.right + 16
        && clientY >= badgeRect.top - 16
        && clientY <= badgeRect.bottom + 16
      ) {
        return true;
      }
    }
    return false;
  }

  private findNearestBadgeElementAtClientPosition(clientX: number, clientY: number): HTMLElement | null {
    if (!this.badgeOverlay) return null;
    let best: HTMLElement | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const element of Array.from(this.badgeOverlay.querySelectorAll<HTMLElement>("[data-o3-expansion-key]"))) {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const within =
        clientX >= rect.left - 8 &&
        clientX <= rect.right + 8 &&
        clientY >= rect.top - 8 &&
        clientY <= rect.bottom + 8;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const distance = Math.hypot(clientX - cx, clientY - cy);
      if (!within && distance > 36) continue;
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = element;
    }
    return best;
  }

  private async applyNodeDropToBadge(
    draggedNode: GraphNode,
    target: BadgeDropTarget,
    _altKey: boolean,
  ): Promise<void> {
    const targetNode = this.nodeMap.get(target.nodeId);
    if (!targetNode) return;

    const targetRef = this.getGraphNodeMutationRef(targetNode);
    const sourceRefs = this.getDraggedGraphNodeMutationRefs(draggedNode)
      .filter((source) => source.path !== targetRef?.path);
    if (!targetRef || sourceRefs.length === 0) return;

    const badgeLinkType = target.linkType;
    const embeddedLinkType = targetNode.embeddedInstanceId
      ? this.getBadgeLinkTypesForNode(targetNode).find((linkType) =>
          this.normalizeLinkType(String(linkType.property ?? "")) === badgeLinkType
        )
      : undefined;
    const propertyKey = embeddedLinkType
      ? this.normalizeLinkType(String(
          embeddedLinkType.writeProperty
          ?? embeddedLinkType.properties?.[0]
          ?? embeddedLinkType.property
          ?? ""
        ))
      : this.getLinkTypeWriteProperty(badgeLinkType);
    if (!propertyKey) return;
    const discoveryDirection = embeddedLinkType?.linkDiscoveryDirection
      ?? this.activeLinkTypeDiscoveryDirectionByProperty.get(badgeLinkType)
      ?? "outgoing";
    const result = await this.menuOptions.onGraphLinkBadgeDrop?.({
      target: targetRef,
      sources: sourceRefs,
      property: propertyKey,
      discoveryDirection
    });

    this.clearIncomingLinkIndex();
    this.registerRecentGraphLinkMutationTargets(
      targetRef.path,
      badgeLinkType,
      result?.added ?? [],
      result?.removed ?? []
    );
    this.parentLinkTypeCache.delete(targetRef.path);
    this.badgesDirty = true;
    const changed = !result || (result.added.length + result.removed.length > 0);
    if (changed) {
      const shouldAutoExpand = this.menuOptions.shouldAutoExpandDroppedLinkTypes?.() ?? true;
      if (shouldAutoExpand && targetNode.embeddedInstanceId && embeddedLinkType) {
        this.refreshEmbeddedBadgeExpansionAfterMutation(targetNode, embeddedLinkType);
      } else if (shouldAutoExpand) {
        this.refreshBadgeExpansionAfterMutation(targetNode.id, targetRef.path, badgeLinkType);
      } else {
        this.syncVisibleLinkTypeEdgesAfterBadgeMutation(
          targetRef.path,
          badgeLinkType,
          discoveryDirection,
          result
        );
      }
    }
    this.reheatSimulation(0.2, "badge link mutation");
  }

  requestBadgeLinkInput(sourceNodeId: string, linkType: O3LinkType): void {
    void this.openBadgeLinkInput(sourceNodeId, linkType);
  }

  private async openBadgeLinkInput(sourceNodeId: string, linkType: O3LinkType): Promise<void> {
    const targetNode = this.nodeMap.get(sourceNodeId);
    if (!targetNode) return;

    const targetRef = this.getGraphNodeMutationRef(targetNode);
    const badgeLinkType = String(linkType.property ?? linkType.key ?? "").trim().toLowerCase();
    const propertyKey = targetNode.embeddedInstanceId
      ? this.normalizeLinkType(String(
          linkType.writeProperty
          ?? linkType.properties?.[0]
          ?? linkType.property
          ?? ""
        ))
      : this.getLinkTypeWriteProperty(badgeLinkType);
    if (!targetRef || !propertyKey) return;

    const result = await this.menuOptions.onGraphLinkInputRequested?.({
      target: targetRef,
      property: propertyKey,
      discoveryDirection: linkType.linkDiscoveryDirection,
      ...(targetNode.stateOwnerPath ? { graphCapableOwnerPath: targetNode.stateOwnerPath } : {})
    });

    this.clearIncomingLinkIndex();
    this.registerRecentGraphLinkMutationTargets(
      targetRef.path,
      badgeLinkType,
      result?.added ?? [],
      result?.removed ?? []
    );
    this.parentLinkTypeCache.delete(targetRef.path);
    this.badgesDirty = true;
    const changed = !result || (result.added.length + result.removed.length > 0);
    if (changed) {
      if (targetNode.embeddedInstanceId) {
        this.refreshEmbeddedBadgeExpansionAfterMutation(targetNode, linkType);
      } else {
        this.refreshBadgeExpansionAfterMutation(targetNode.id, targetRef.path, badgeLinkType);
      }
    }
    this.reheatSimulation(0.2, "badge link input");
  }

  private refreshBadgeExpansionAfterMutation(
    originNodeIdRaw: string,
    originPath: string,
    linkType: string
  ): void {
    const originNodeId = String(originNodeIdRaw ?? "").trim();
    const normalizedOrigin = String(originPath ?? "").trim();
    const normalizedLinkType = this.normalizeLinkType(linkType);
    if (!originNodeId || !normalizedOrigin || !normalizedLinkType) return;
    const refreshKey = this.buildExpandedParentRequestKey(originNodeId, normalizedLinkType);

    const refresh = async () => {
      this.badgeExpansionRefreshTimers.delete(refreshKey);
      const previousNodeIds = this.getCurrentNodeIdSet();
      const expandedBadges = this.captureOuterExpandedBadges();
      const expandedParents = Array.from(this.expandedParentRequests.values())
        .map((request) => ({ ...request }));
      const embeddedGraphs = Array.from(this.embeddedGraphContainers.values())
        .map((container) => {
          const origin = this.nodeMap.get(container.origin);
          return {
            originNodeId: container.origin,
            originSourcePath: origin?.sourcePath ?? container.graphPath,
            originX: origin?.x ?? (container.left + container.right) / 2,
            originY: origin?.y ?? (container.top + container.bottom) / 2,
            graphPath: container.graphPath,
            ancestryDepth: container.ancestry.length
          };
        })
        .sort((a, b) => a.ancestryDepth - b.ancestryDepth);
      const positions = new Map(
        this.nodes
          .filter((node) => !node.stateOwnerPath)
          .map((node) => [
            node.id,
            {
              x: node.x,
              y: node.y,
              vx: node.vx,
              vy: node.vy
            }
          ])
      );
      const wasReconcilingGraphTopology = this.isReconcilingGraphTopology;
      this.isReconcilingGraphTopology = true;
      try {
        this.parentLinkTypeCache.delete(originNodeId);
        this.parentLinkTypeCache.delete(normalizedOrigin);
        this.badgesDirty = true;
        if (this.getLinkTypeSemantic(normalizedLinkType) === "parent") {
          this.collapseParentLinks(originNodeId, normalizedLinkType);
          this.expandParentLinks(originNodeId, normalizedLinkType);
        } else {
          const sourceFile = this.app.vault.getAbstractFileByPath(normalizedOrigin);
          if (sourceFile instanceof TFile) {
            const badgeKey = this.badgeKey(originNodeId, normalizedLinkType);
            if (this.expandedByBadge.has(badgeKey)) {
              this.toggleExpansion(sourceFile, normalizedLinkType, {
                persist: false,
                sourceNodeId: originNodeId
              });
            }
            this.toggleExpansion(sourceFile, normalizedLinkType, {
              persist: false,
              sourceNodeId: originNodeId
            });
          }
        }
        this.restoreOuterExpandedBadges(expandedBadges);
        for (const request of expandedParents) {
          if (this.expandedParentRequests.has(
            this.buildExpandedParentRequestKey(request.origin, request.linkType)
          )) {
            continue;
          }
          if (this.nodeMap.has(request.origin)) {
            this.expandParentLinks(request.origin, request.linkType);
          }
        }
      } finally {
        this.isReconcilingGraphTopology = wasReconcilingGraphTopology;
      }
      if (!this.isReconcilingGraphTopology) {
        this.reconcileEmbeddedGraphContainersAfterTopologyUpdate();
      }
      for (const node of this.nodes) {
        if (node.stateOwnerPath) continue;
        const position = positions.get(node.id);
        if (!position) continue;
        node.x = position.x;
        node.y = position.y;
        node.vx = position.vx;
        node.vy = position.vy;
        if (node.isPinned || node.isLocked) {
          node.fx = position.x;
          node.fy = position.y;
          node.lockX = position.x;
          node.lockY = position.y;
        }
      }
      const claimedEmbeddedOrigins = new Set<string>();
      for (const embedded of embeddedGraphs) {
        if (this.isEmbeddedGraphExpanded(embedded.originNodeId, embedded.graphPath)) {
          claimedEmbeddedOrigins.add(embedded.originNodeId);
          continue;
        }
        const restoredOriginId = this.nodeMap.has(embedded.originNodeId)
          ? embedded.originNodeId
          : this.nodes
              .filter((node) =>
                !node.stateOwnerPath
                && node.sourcePath === embedded.originSourcePath
                && !claimedEmbeddedOrigins.has(node.id)
                && !this.getExpandedEmbeddedContainerForOrigin(node.id)
              )
              .sort((a, b) =>
                Math.hypot(a.x - embedded.originX, a.y - embedded.originY)
                - Math.hypot(b.x - embedded.originX, b.y - embedded.originY)
              )[0]?.id;
        if (!restoredOriginId) continue;
        claimedEmbeddedOrigins.add(restoredOriginId);
        await this.toggleEmbeddedGraph(restoredOriginId);
      }
      this.freezeExistingNodesForTopologyUpdate(previousNodeIds);
      void this.menuOptions.onGraphRuntimeChanged?.();
      this.reheatSimulation(0.2, "badge expansion refresh");
    };

    const existing = this.badgeExpansionRefreshTimers.get(refreshKey);
    if (existing !== undefined) {
      window.clearTimeout(existing);
    }
    const timer = window.setTimeout(() => {
      void refresh();
    }, 250);
    this.badgeExpansionRefreshTimers.set(refreshKey, timer);
  }

  private captureOuterExpandedBadges(): Array<{
    sourceNodeId: string;
    sourcePath: string;
    property: string;
    depth: number;
  }> {
    const expanded: Array<{
      sourceNodeId: string;
      sourcePath: string;
      property: string;
      depth: number;
    }> = [];
    for (const badgeKey of this.expandedByBadge.keys()) {
      const separator = badgeKey.lastIndexOf("::");
      if (separator <= 0) continue;
      const sourceNodeId = badgeKey.slice(0, separator);
      const property = this.normalizeLinkType(badgeKey.slice(separator + 2));
      const node = this.nodeMap.get(sourceNodeId);
      if (!node || node.stateOwnerPath || !property) continue;
      expanded.push({
        sourceNodeId,
        sourcePath: node.sourcePath,
        property,
        depth: node.depth
      });
    }
    return expanded.sort((a, b) => a.depth - b.depth);
  }

  private restoreOuterExpandedBadges(
    expandedBadges: Array<{
      sourceNodeId: string;
      sourcePath: string;
      property: string;
      depth: number;
    }>
  ): void {
    const pending = [...expandedBadges];
    let progressed = true;
    while (pending.length > 0 && progressed) {
      progressed = false;
      for (let index = pending.length - 1; index >= 0; index--) {
        const entry = pending[index];
        const node = this.nodeMap.get(entry.sourceNodeId);
        if (!node) continue;
        const badgeKey = this.badgeKey(node.id, entry.property);
        if (!this.expandedByBadge.has(badgeKey)) {
          const sourceFile = this.app.vault.getAbstractFileByPath(entry.sourcePath);
          if (!(sourceFile instanceof TFile)) {
            pending.splice(index, 1);
            progressed = true;
            continue;
          }
          this.toggleExpansion(sourceFile, entry.property, {
            persist: false,
            sourceNodeId: node.id
          });
        }
        pending.splice(index, 1);
        progressed = true;
      }
    }
  }

  private refreshEmbeddedBadgeExpansionAfterMutation(
    sourceNode: GraphNode,
    linkType: O3LinkType
  ): void {
    const instanceId = sourceNode.embeddedInstanceId;
    const ownerPath = sourceNode.stateOwnerPath;
    const property = this.normalizeLinkType(String(linkType.property ?? ""));
    if (!instanceId || !ownerPath || !property) return;
    const refreshKey = `embedded::${sourceNode.id}::${property}`;

    const refresh = () => {
      this.badgeExpansionRefreshTimers.delete(refreshKey);
      const currentNode = this.nodeMap.get(sourceNode.id);
      if (!currentNode?.embeddedInstanceId) return;
      const expandedBadges = this.captureEmbeddedExpandedBadges(instanceId);
      const positions = new Map(
        this.nodes
          .filter((node) => node.embeddedInstanceId === instanceId && node.embeddedSourceNodeId)
          .map((node) => [
            node.embeddedSourceNodeId!,
            {
              x: node.x,
              y: node.y,
              vx: node.vx,
              vy: node.vy
            }
          ])
      );
      const badgeKey = this.badgeKey(currentNode.id, property);
      if (this.expandedByBadge.has(badgeKey)) {
        this.toggleEmbeddedNodeExpansion(currentNode, linkType, false);
      }
      this.toggleEmbeddedNodeExpansion(currentNode, linkType, false);
      this.restoreEmbeddedExpandedBadges(instanceId, expandedBadges);
      for (const node of this.nodes) {
        if (node.embeddedInstanceId !== instanceId || !node.embeddedSourceNodeId) continue;
        const position = positions.get(node.embeddedSourceNodeId);
        if (!position) continue;
        node.x = position.x;
        node.y = position.y;
        node.vx = position.vx;
        node.vy = position.vy;
        if (node.isPinned || node.isLocked) {
          node.fx = position.x;
          node.fy = position.y;
          node.lockX = position.x;
          node.lockY = position.y;
        }
      }
      void this.menuOptions.onEmbeddedGraphRuntimeChanged?.(ownerPath, instanceId);
      this.reheatSimulation(0.16, "embedded badge mutation refresh");
    };

    const existing = this.badgeExpansionRefreshTimers.get(refreshKey);
    if (existing !== undefined) {
      window.clearTimeout(existing);
    }
    this.badgeExpansionRefreshTimers.set(refreshKey, window.setTimeout(refresh, 300));
  }

  private captureEmbeddedExpandedBadges(instanceId: string): Array<{
    sourceNodeId: string;
    property: string;
    depth: number;
  }> {
    const expanded: Array<{ sourceNodeId: string; property: string; depth: number }> = [];
    for (const node of this.nodes) {
      if (node.embeddedInstanceId !== instanceId || !node.embeddedSourceNodeId) continue;
      for (const linkType of this.getLinkTypesForNode(node)) {
        const property = this.normalizeLinkType(String(linkType.property ?? ""));
        if (!property || !this.expandedByBadge.has(this.badgeKey(node.id, property))) continue;
        expanded.push({
          sourceNodeId: node.embeddedSourceNodeId,
          property,
          depth: node.depth
        });
      }
    }
    return expanded.sort((a, b) => a.depth - b.depth);
  }

  private restoreEmbeddedExpandedBadges(
    instanceId: string,
    expandedBadges: Array<{ sourceNodeId: string; property: string; depth: number }>
  ): void {
    const pending = [...expandedBadges];
    let progressed = true;
    while (pending.length > 0 && progressed) {
      progressed = false;
      for (let index = pending.length - 1; index >= 0; index--) {
        const entry = pending[index];
        const node = this.nodes.find((candidate) =>
          candidate.embeddedInstanceId === instanceId
          && candidate.embeddedSourceNodeId === entry.sourceNodeId
        );
        if (!node) continue;
        const badgeKey = this.badgeKey(node.id, entry.property);
        if (!this.expandedByBadge.has(badgeKey)) {
          const linkType = this.getLinkTypesForNode(node).find((candidate) =>
            this.normalizeLinkType(String(candidate.property ?? "")) === entry.property
          );
          if (!linkType) {
            pending.splice(index, 1);
            progressed = true;
            continue;
          }
          this.toggleEmbeddedNodeExpansion(node, linkType, false);
        }
        pending.splice(index, 1);
        progressed = true;
      }
    }
  }

  private getGraphNodeMutationRef(node: GraphNode): GraphLinkMutationNodeRef | null {
    const path = String(this.duplicateNodeSourceById.get(node.id) ?? node.sourcePath ?? node.id ?? "").trim();
    if (!path) return null;
    const file = this.resolveFileForGraphNode(node);
    return { nodeId: node.id, path: file?.path ?? path };
  }

  private getDraggedGraphNodeMutationRefs(draggedNode: GraphNode): GraphLinkMutationNodeRef[] {
    const nodeIds = this.selectedNodeIds.has(draggedNode.id)
      ? Array.from(new Set([...this.selectedNodeIds, draggedNode.id]))
      : [draggedNode.id];
    const refs: GraphLinkMutationNodeRef[] = [];
    const seen = new Set<string>();
    for (const nodeId of nodeIds) {
      const node = this.nodeMap.get(nodeId);
      if (!node) continue;
      const ref = this.getGraphNodeMutationRef(node);
      if (!ref || seen.has(ref.path)) continue;
      seen.add(ref.path);
      refs.push(ref);
    }
    return refs;
  }

  private resolveFileForGraphNode(node: GraphNode): TFile | null {
    const path = this.duplicateNodeSourceById.get(node.id) ?? node.sourcePath ?? node.id;
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
  }

  private clientToWorld(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    return {
      x: (mouseX / this.camera.zoom) - this.camera.x,
      y: (mouseY / this.camera.zoom) - this.camera.y
    };
  }

  private findNodeAtScreenPosition(
    clientX: number,
    clientY: number,
    excludeNodeIds: Set<string> = new Set(),
    options?: { ignoreLockedEmbeddedContainers?: boolean }
  ): GraphNode | null {
    const directNode = this.findActualNodeAtScreenPosition(clientX, clientY, excludeNodeIds);
    if (directNode) return directNode;
    const world = this.clientToWorld(clientX, clientY);
    const containers = Array.from(this.embeddedGraphContainers.values())
      .sort((a, b) =>
        ((a.right - a.left) * (a.bottom - a.top))
        - ((b.right - b.left) * (b.bottom - b.top))
      );
    for (const container of containers) {
      if (excludeNodeIds.has(container.origin)) continue;
      if (options?.ignoreLockedEmbeddedContainers && container.interactionLocked) continue;
      const bounds = this.getGraphLensBounds(container);
      if (
        world.x >= bounds.left
        && world.x <= bounds.right
        && world.y >= bounds.top
        && world.y <= bounds.bottom
      ) {
        return this.nodeMap.get(container.origin) ?? null;
      }
    }
    return null;
  }

  private findActualNodeAtScreenPosition(
    clientX: number,
    clientY: number,
    excludeNodeIds: Set<string> = new Set()
  ): GraphNode | null {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    let bestNode: GraphNode | null = null;
    let bestDistSq = Number.POSITIVE_INFINITY;

    for (const node of this.nodes) {
      if (excludeNodeIds.has(node.id)) continue;
      const renderedCenter = this.getRenderedNodeCenter(node);
      const sx = (renderedCenter.x + this.camera.x) * this.camera.zoom;
      const sy = (renderedCenter.y + this.camera.y) * this.camera.zoom;
      const dx = sx - mouseX;
      const dy = sy - mouseY;
      const distSq = dx * dx + dy * dy;
      const hitRadius = Math.max(this.getRenderedNodeRadius(node) * this.camera.zoom, 8);
      const hitRadiusSq = hitRadius * hitRadius;

      if (distSq <= hitRadiusSq && distSq < bestDistSq) {
        bestDistSq = distSq;
        bestNode = node;
      }
    }

    return bestNode;
  }

  private async openNodeFile(node: GraphNode, newTab = false): Promise<void> {
    if (this.menuOptions.onNodeOpen) {
      await this.menuOptions.onNodeOpen({
        nodeId: node.id,
        path: node.sourcePath,
        newTab
      });
      return;
    }

    const target = this.app.vault.getAbstractFileByPath(node.sourcePath);
    if (!(target instanceof TFile)) return;

    const leaf = this.app.workspace.getLeaf(newTab ? "tab" : false);
    await leaf.openFile(target, { active: true });
  }

  private drawLabels() {
    const shouldDrawUnselectedLabels = this.shouldDrawNodeLabels();
    if (!shouldDrawUnselectedLabels && this.selectedNodeIds.size === 0) return;

    this.ctx.fillStyle = "#cfcfcf";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "top";

    for (const node of this.nodes) {
      if (!node.label) continue;
      if (!shouldDrawUnselectedLabels && !this.selectedNodeIds.has(node.id)) continue;

      const clipContainer = this.getEmbeddedClipContainerForNode(node);
      if (clipContainer) {
        this.ctx.save();
        this.clipToEmbeddedContainer(clipContainer);
      }
      const renderedCenter = this.getRenderedNodeCenter(node);
      const labelLensCoverAlpha = this.getGraphLensCoverAlphaAtPoint(renderedCenter.x, renderedCenter.y, clipContainer);
      const sx = (renderedCenter.x + this.camera.x) * this.camera.zoom;
      const sy = (renderedCenter.y + this.camera.y) * this.camera.zoom;
      const labelOffset = Math.max(this.getRenderedNodeRadius(node) * this.camera.zoom + 4, 8);
      this.ctx.font = `${this.getEmbeddedLabelFontSize(node)}px sans-serif`;

      if (sx < -80 || sx > this.canvas.width + 80 || sy < -30 || sy > this.canvas.height + 30) {
        if (clipContainer) this.ctx.restore();
        continue;
      }

      let labelLensAlphaSaved = false;
      if (labelLensCoverAlpha < 0.999) {
        this.ctx.save();
        this.ctx.globalAlpha *= labelLensCoverAlpha;
        labelLensAlphaSaved = true;
      }
      this.ctx.fillText(node.label, sx, sy + labelOffset);
      if (labelLensAlphaSaved) this.ctx.restore();
      if (clipContainer) this.ctx.restore();
    }
  }

  private shouldDrawNodeLabels(): boolean {
    const visibility = this.normalizeTextFadeThreshold(this.textFadeThreshold);
    if (visibility <= 0) return false;
    if (visibility >= 100) return true;

    const minZoom = 0.1;
    const maxZoom = 5;
    const requiredZoom = maxZoom - ((visibility / 100) * (maxZoom - minZoom));
    return this.camera.zoom >= requiredZoom;
  }

  setSelectedLinkTypes(types: string[]) {
    const nextTypes = (types ?? [])
      .map((type) => this.normalizeLinkType(type))
      .filter((type) => type.length > 0)
      .sort((a, b) => a.localeCompare(b));
    const currentTypes = Array.from(this.selectedLinkTypes).sort((a, b) => a.localeCompare(b));
    if (nextTypes.length === currentTypes.length && nextTypes.every((type, index) => type === currentTypes[index])) {
      this.updateMenuCounter();
      return;
    }

    this.selectedLinkTypes = new Set<string>();
    for (const type of nextTypes) {
      this.selectedLinkTypes.add(type);
    }

    this.rebuildEdges(this.lastFiles, this.lastLinkTypeSourceFiles);
    this.updateMenuCounter();
    if (this.menuOpen) {
      this.renderLinkTypeMenu({ resetScroll: true });
    }
  }

  setActiveLinkTypes(linkTypes: O3LinkType[]): void {
    const nextSignature = this.buildActiveLinkTypeSignature(linkTypes);
    const changed = nextSignature !== this.activeLinkTypeSignature;
    this.activeLinkTypeSignature = nextSignature;

    // LinkType definitions changed (possibly direction/cx/cy), so invalidate cached directional placements.
    if (changed) {
      this.directionLockedNodeTargets.clear();
    }
    this.activeLinkTypePhysicsByProperty.clear();
    this.activeLinkTypeDirectionByProperty.clear();
    this.activeLinkTypeDiscoveryByProperty.clear();
    this.activeLinkTypeDiscoveryDirectionByProperty.clear();
    this.activeLinkTypeDuplicateNodesByProperty.clear();
    this.activeLinkTypeVisualByProperty.clear();
    this.activeLinkTypeExpansionPropertiesByProperty.clear();
    this.activeLinkTypeWritePropertyByProperty.clear();
    this.activeNodeBadgeLinkTypes = (linkTypes ?? [])
      .filter((lt): lt is O3LinkType => Boolean(lt))
      .filter((lt) => String(lt.property ?? "").trim().length > 0);
    for (const linkType of this.activeNodeBadgeLinkTypes) {
      this.registerLinkTypeRuntimeConfig(linkType);
    }
    this.clearIncomingLinkIndex();
    if (changed) {
      this.directionLayoutDirty = true;
      this.badgesDirty = true;
    }
  }

  private registerLinkTypeRuntimeConfig(linkType: O3LinkType): void {
    const property = this.normalizeLinkType(String(linkType.property ?? ""));
    if (!property) return;
    if (linkType.semantic === "parent") {
      this.linkTypeSemantics.set(property, "parent");
    }
    this.activeLinkTypeExpansionPropertiesByProperty.set(property, this.getLinkTypeExpansionProperties(linkType));
    const writeProperty = this.normalizeLinkType(String(linkType.writeProperty ?? linkType.properties?.[0] ?? linkType.property ?? "").trim().toLowerCase());
    if (writeProperty) {
      this.activeLinkTypeWritePropertyByProperty.set(property, writeProperty);
    }
    const duplicateNodes = linkType.linkDuplicateNodes === true;
    this.activeLinkTypeDuplicateNodesByProperty.set(property, duplicateNodes);
    this.activeLinkTypeDiscoveryByProperty.set(property, duplicateNodes ? false : (linkType.linkDiscovery !== false));
    this.activeLinkTypeDiscoveryDirectionByProperty.set(property, linkType.linkDiscoveryDirection);
    const color = this.normalizeLinkLineColor(linkType.linkLineColor ?? linkType.color);
    const thickness = this.normalizeLinkLineThickness(linkType.linkLineThickness);
    this.activeLinkTypeVisualByProperty.set(property, {
      ...(color ? { color } : {}),
      ...(Number.isFinite(thickness) ? { thickness } : {}),
      pointerDirection: this.normalizePointerDirection(linkType.pointerDirection)
    });
    if (linkType.linkType === "Direction Based") {
      const direction = this.normalizeDirectionPlacement(linkType.linkDirection);
      const cx = Number(linkType.linkXAxis);
      const cy = Number(linkType.linkYAxis);
      this.activeLinkTypeDirectionByProperty.set(property, {
        direction,
        cx: Number.isFinite(cx) ? Math.abs(cx) || 120 : 120,
        cy: Number.isFinite(cy) ? Math.abs(cy) || 120 : 120
      });
    } else {
      const preferredDistance = Number(linkType.linkDistance);
      const strength = Number(linkType.linkForce);
      this.activeLinkTypePhysicsByProperty.set(property, {
        ...(Number.isFinite(preferredDistance) ? { preferredDistance } : {}),
        ...(Number.isFinite(strength) ? { strength } : {})
      });
    }
  }

  isBadgeExpansionActive(sourcePath: string, linkType: string): boolean {
    const source = String(sourcePath ?? "").trim();
    const type = this.normalizeLinkType(linkType);
    if (!source || !type) return false;
    return this.expandedByBadge.has(this.badgeKey(source, type));
  }

  expandFromNode(
    sourceFile: TFile,
    linkType: O3LinkType,
    sourceNodeId?: string
  ): void {
    const runtimeSourceNodeId = String(sourceNodeId ?? sourceFile.path).trim();
    const embeddedSourceNode = this.nodeMap.get(runtimeSourceNodeId);
    if (embeddedSourceNode?.stateOwnerPath && embeddedSourceNode.embeddedInstanceId) {
      this.toggleEmbeddedNodeExpansion(embeddedSourceNode, linkType);
      return;
    }
    if (linkType.semantic === "parent") {
      const normalizedSourceNodeId = String(sourceNodeId ?? sourceFile.path).trim();
      const sourceNode = this.nodeMap.get(normalizedSourceNodeId)
        ?? this.nodeMap.get(sourceFile.path);
      if (!sourceNode) return;
      this.triggerParentExpansion(
        sourceNode,
        this.normalizeLinkType(String(linkType.property ?? "").trim().toLowerCase())
      );
      return;
    }
    this.toggleExpansion(sourceFile, String(linkType.property ?? ""), { sourceNodeId });
  }

  private toggleEmbeddedNodeExpansion(
    sourceNode: GraphNode,
    linkType: O3LinkType,
    persist = true
  ): void {
    const property = this.normalizeLinkType(String(linkType.property ?? ""));
    const instanceId = sourceNode.embeddedInstanceId;
    const ownerPath = sourceNode.stateOwnerPath;
    const container = instanceId ? this.embeddedGraphContainers.get(instanceId) : null;
    if (!property || !instanceId || !ownerPath || !container) return;
    const badgeKey = this.badgeKey(sourceNode.id, property);

    if (this.expandedByBadge.has(badgeKey)) {
      const linkedNodeIds = new Set(this.expansionNodes.get(badgeKey) ?? []);
      const removedNodeIds = new Set(
        Array.from(linkedNodeIds).filter((nodeId) => {
          const node = this.nodeMap.get(nodeId);
          return Boolean(
            node
            && !node.embeddedRoot
            && node.embeddedOrigin?.kind === "expansion"
            && node.embeddedOrigin.sourceNodeId === (sourceNode.embeddedSourceNodeId ?? sourceNode.sourcePath)
            && this.normalizeLinkType(node.embeddedOrigin.linkType) === property
          );
        })
      );
      const queue = Array.from(removedNodeIds);
      while (queue.length > 0) {
        const parentId = queue.shift()!;
        for (const edge of this.edges) {
          if (edge.from !== parentId || !container.memberIds.has(edge.to)) continue;
          const child = this.nodeMap.get(edge.to);
          if (!child || child.embeddedRoot || removedNodeIds.has(child.id)) continue;
          removedNodeIds.add(child.id);
          queue.push(child.id);
        }
      }
      this.edges = this.edges.filter((edge) =>
        !(edge.from === sourceNode.id && linkedNodeIds.has(edge.to) && edge.linkType === property)
        && !removedNodeIds.has(edge.from)
        && !removedNodeIds.has(edge.to)
      );
      for (const childId of removedNodeIds) {
        container.memberIds.delete(childId);
        this.removeNodeById(childId);
        for (const expansionKey of Array.from(this.expandedByBadge.keys())) {
          if (!expansionKey.startsWith(`${childId}::`)) continue;
          this.expandedByBadge.delete(expansionKey);
          this.expansionNodes.delete(expansionKey);
          this.expansionParent.delete(expansionKey);
        }
      }
      this.expansionNodes.delete(badgeKey);
      this.expandedByBadge.delete(badgeKey);
      this.expansionParent.delete(badgeKey);
      this.expandedParentRequests.delete(this.buildExpandedParentRequestKey(sourceNode.id, property));
      sourceNode.embeddedOrigin = sourceNode.embeddedOrigin ?? (sourceNode.embeddedRoot
        ? { kind: "root" }
        : { kind: "filter" });
      this.addEmbeddedVisibleLinkTypeEdges(container.key);
      if (persist) {
        void this.menuOptions.onEmbeddedGraphRuntimeChanged?.(ownerPath, instanceId);
      }
      this.badgesDirty = true;
      this.requestRender();
      return;
    }

    const sourceFile = this.app.vault.getAbstractFileByPath(sourceNode.sourcePath);
    if (!(sourceFile instanceof TFile)) return;
    const targets = this.resolveLinkedTargets(sourceFile, linkType);
    const targetPaths = new Set<string>();
    const childIds = new Set<string>();
    const addedOrUpdatedNodeIds: string[] = [sourceNode.id];
    for (const target of targets) {
      const targetIdentity = this.resolveEmbeddedTargetIdentity(
        container,
        sourceNode,
        target.path,
        linkType
      );
      const childSourceId = targetIdentity.sourceNodeId;
      const childId = targetIdentity.runtimeNodeId;
      targetPaths.add(target.path);
      childIds.add(childId);
      let child = this.nodeMap.get(childId);
      if (!child) {
        const angle = this.deterministicAngle(`${sourceNode.id}::${target.path}::${property}`);
        const distance = this.activeLinkTypePhysicsByProperty.get(property)?.preferredDistance ?? 120;
        child = {
          id: childId,
          sourcePath: target.path,
          label: target.label,
          x: sourceNode.x + Math.cos(angle) * distance,
          y: sourceNode.y + Math.sin(angle) * distance,
          vx: 0,
          vy: 0,
          mass: 1,
          isBase: false,
          depth: sourceNode.depth + 1,
          stateOwnerPath: ownerPath,
          embeddedInstanceId: instanceId,
          embeddedSourceNodeId: childSourceId,
          embeddedRoot: false,
          isMissingFile: target.missing,
          embeddedOrigin: {
            kind: "expansion",
            sourceNodeId: sourceNode.embeddedSourceNodeId ?? sourceNode.sourcePath,
            linkType: property,
            ...(targetIdentity.duplicate ? { duplicate: true } : {})
          },
          embeddedAncestry: sourceNode.embeddedAncestry
        };
        this.nodes.push(child);
        this.nodeMap.set(childId, child);
        container.memberIds.add(childId);
      } else {
        child.sourcePath = target.path;
        child.label = target.label;
        child.isMissingFile = target.missing;
      }
      addedOrUpdatedNodeIds.push(childId);
      this.removeVisibleSemanticEdges(sourceNode.id, childId, property);
      if (!this.hasEdge(sourceNode.id, childId, property)) {
        const relationship = linkType.semantic === "parent" ? "parent" as const : undefined;
        this.edges.push({
          from: sourceNode.id,
          to: childId,
          type: property,
          linkType: property,
          ...(relationship ? { relationship, origin: sourceNode.id } : {})
        });
      }
    }
    this.expansionNodes.set(badgeKey, childIds);
    this.expandedByBadge.set(badgeKey, targetPaths);
    this.expansionParent.set(badgeKey, null);
    if (linkType.semantic === "parent") {
      this.expandedParentRequests.set(
        this.buildExpandedParentRequestKey(sourceNode.id, property),
        { origin: sourceNode.id, linkType: property }
      );
    }
    if (persist) {
      void this.menuOptions.onEmbeddedGraphRuntimeChanged?.(ownerPath, instanceId);
    }
    this.nodeConnectionCountsDirty = true;
    this.badgesDirty = true;
    this.updateNodeColors(addedOrUpdatedNodeIds);
    this.refreshNearestActiveLinkedNode();
    this.reheatSimulation(0.16, "embedded badge expansion");
  }

  private resolveEmbeddedTargetIdentity(
    container: EmbeddedGraphContainerState,
    sourceNode: GraphNode,
    targetPathRaw: string,
    linkType: O3LinkType
  ): { sourceNodeId: string; runtimeNodeId: string; duplicate: boolean } {
    const targetPath = String(targetPathRaw ?? "").trim();
    const instanceId = sourceNode.embeddedInstanceId ?? container.key;
    const property = this.normalizeLinkType(String(linkType.property ?? ""));
    if (linkType.linkDuplicateNodes === true && container.visibleLinkTypes.includes(property)) {
      const existingTargetId = this.findSemanticEdgeTargetNodeId(sourceNode.id, targetPath, property, container.memberIds)
        ?? this.findVisibleNodeIdForSourcePath(targetPath, container.memberIds);
      const existing = existingTargetId ? this.nodeMap.get(existingTargetId) : null;
      if (existing) {
        return {
          sourceNodeId: existing.embeddedSourceNodeId ?? existing.sourcePath,
          runtimeNodeId: existing.id,
          duplicate: false
        };
      }
    }
    if (linkType.linkDuplicateNodes === true) {
      const sourceNodeId = this.formatDuplicateNodeId(
        sourceNode.embeddedSourceNodeId ?? sourceNode.sourcePath,
        targetPath,
        property
      );
      return {
        sourceNodeId,
        runtimeNodeId: this.embeddedRuntimeNodeId(instanceId, sourceNodeId),
        duplicate: true
      };
    }

    const existing = Array.from(container.memberIds)
      .map((nodeId) => this.nodeMap.get(nodeId))
      .filter((node): node is GraphNode => {
        if (!node || node.sourcePath !== targetPath) return false;
        return node.embeddedOrigin?.kind !== "expansion"
          || node.embeddedOrigin.duplicate !== true;
      })
      .sort((a, b) => {
        if (a.embeddedRoot !== b.embeddedRoot) return a.embeddedRoot ? -1 : 1;
        return a.id.localeCompare(b.id);
      })[0];
    if (existing?.embeddedSourceNodeId) {
      return {
        sourceNodeId: existing.embeddedSourceNodeId,
        runtimeNodeId: existing.id,
        duplicate: false
      };
    }

    return {
      sourceNodeId: targetPath,
      runtimeNodeId: this.embeddedRuntimeNodeId(instanceId, targetPath),
      duplicate: false
    };
  }

  expandLinkTypeChainFromNode(
    sourceFile: TFile,
    linkType: O3LinkType,
    sourceNodeId?: string
  ): Promise<void> {
    return this.expandLinkTypeChainFromNodeAsync(sourceFile, linkType, sourceNodeId);
  }

  private async expandLinkTypeChainFromNodeAsync(
    sourceFile: TFile,
    linkType: O3LinkType,
    sourceNodeId?: string
  ): Promise<void> {
    const property = this.normalizeLinkType(String(linkType.property ?? ""));
    if (!property) return;

    const startSourceNodeId = String(sourceNodeId ?? "").trim() || sourceFile.path;
    const embeddedSourceNode = this.nodeMap.get(startSourceNodeId);
    if (embeddedSourceNode?.stateOwnerPath && embeddedSourceNode.embeddedInstanceId) {
      this.expandEmbeddedLinkTypeChainLevel(embeddedSourceNode, linkType);
      return;
    }
    const queue: Array<{ sourcePath: string; sourceNodeId: string }> = [{
      sourcePath: sourceFile.path,
      sourceNodeId: startSourceNodeId
    }];
    const visitedPaths = new Set<string>();
    let processed = 0;
    let firstToggleEvent: BadgeExpansionRuntimeEvent | null = null;

    while (queue.length > 0) {
      const current = queue.shift()!;
      const sourcePath = String(current.sourcePath ?? "").trim();
      const runtimeSourceNodeId = String(current.sourceNodeId ?? "").trim();
      if (!sourcePath || !runtimeSourceNodeId) continue;

      const badgeKey = this.badgeKey(runtimeSourceNodeId, property);
      const visitKey = `${sourcePath}::${property}`;
      if (visitedPaths.has(visitKey)) continue;
      visitedPaths.add(visitKey);

      if (!this.expandedByBadge.has(badgeKey)) {
        const source = this.app.vault.getAbstractFileByPath(sourcePath);
        if (!(source instanceof TFile)) continue;
        const toggleEvent = this.expandBadgeRuntime(source, property, runtimeSourceNodeId);
        if (!toggleEvent) continue;
        firstToggleEvent = firstToggleEvent ?? toggleEvent;
      }

      const childNodeIds = Array.from(this.expansionNodes.get(badgeKey) ?? []);
      for (const childNodeId of childNodeIds) {
        const childPath = this.getSourcePathForNodeId(childNodeId);
        if (!childPath) continue;
        const childFile = this.app.vault.getAbstractFileByPath(childPath);
        if (!(childFile instanceof TFile)) continue;
        if (this.resolveLinkedTargets(childFile, { property } as O3LinkType).length === 0) continue;

        const childRuntimeNodeId = this.nodeMap.has(childNodeId)
          ? childNodeId
          : this.getVisibleNodeIdForSourcePath(childPath);
        if (!childRuntimeNodeId) continue;
        queue.push({
          sourcePath: childPath,
          sourceNodeId: childRuntimeNodeId
        });
      }

      processed++;
      if (processed % 25 === 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    }

    if (!firstToggleEvent) return;

    this.refreshHoveredHighlightNodes();
    this.reconcileCurrentFilesFromVisibleState();
    const files = this.getCurrentFilesAsTFiles();
    this.lastFiles = files;
    this.lastLinkTypeSourceFiles = files;
    this.rebuildEdges();
    this.menuOptions.onBadgeExpansionToggled?.(
      firstToggleEvent.sourceNodeId,
      firstToggleEvent.sourcePath,
      firstToggleEvent.linkType,
      firstToggleEvent.expanded,
      firstToggleEvent.expansionId,
      firstToggleEvent.parentExpansionId
    );
  }

  private expandEmbeddedLinkTypeChainLevel(
    sourceNode: GraphNode,
    linkType: O3LinkType
  ): void {
    const property = this.normalizeLinkType(String(linkType.property ?? ""));
    const instanceId = sourceNode.embeddedInstanceId;
    const ownerPath = sourceNode.stateOwnerPath;
    const container = instanceId ? this.embeddedGraphContainers.get(instanceId) : null;
    if (!property || !instanceId || !ownerPath || !container) return;

    const sourceBadgeKey = this.badgeKey(sourceNode.id, property);
    if (!this.expandedByBadge.has(sourceBadgeKey)) {
      this.toggleEmbeddedNodeExpansion(sourceNode, linkType, false);
      void this.menuOptions.onEmbeddedGraphRuntimeChanged?.(ownerPath, instanceId);
      return;
    }

    const visited = new Set<string>([sourceNode.id]);
    let frontier = new Set<string>(this.expansionNodes.get(sourceBadgeKey) ?? []);
    while (frontier.size > 0) {
      const candidates = Array.from(frontier)
        .map((nodeId) => this.nodeMap.get(nodeId))
        .filter((node): node is GraphNode =>
          Boolean(
            node
            && node.embeddedInstanceId === instanceId
            && !this.expandedByBadge.has(this.badgeKey(node.id, property))
          )
        )
        .filter((node) => {
          const file = this.app.vault.getAbstractFileByPath(node.sourcePath);
          return file instanceof TFile && this.resolveLinkedTargets(file, linkType).length > 0;
        });
      if (candidates.length > 0) {
        for (const candidate of candidates) {
          this.toggleEmbeddedNodeExpansion(candidate, linkType, false);
        }
        void this.menuOptions.onEmbeddedGraphRuntimeChanged?.(ownerPath, instanceId);
        return;
      }

      const next = new Set<string>();
      for (const parentId of frontier) {
        if (visited.has(parentId)) continue;
        visited.add(parentId);
        const badgeKey = this.badgeKey(parentId, property);
        for (const childId of this.expansionNodes.get(badgeKey) ?? []) {
          if (!container.memberIds.has(childId) || visited.has(childId)) continue;
          next.add(childId);
        }
      }
      frontier = next;
    }
  }

  private expandBadgeRuntime(
    source: TFile,
    propertyRaw: string,
    expansionSourceNodeIdRaw: string
  ): BadgeExpansionRuntimeEvent | null {
    const property = this.normalizeLinkType(propertyRaw);
    const expansionSourceNodeId = String(expansionSourceNodeIdRaw ?? "").trim() || source.path;
    if (!property || !expansionSourceNodeId) return null;

    const badgeKey = this.badgeKey(expansionSourceNodeId, property);
    if (this.expandedByBadge.has(badgeKey)) return null;

    const targets = this.resolveLinkedTargets(source, { property } as O3LinkType);
    const targetPaths = new Set<string>();
    if (!this.expansionNodes.has(badgeKey)) {
      this.expansionNodes.set(badgeKey, new Set<string>());
    }
    if (!this.expansionParent.has(badgeKey)) {
      let parentKey: string | null = null;
      if (!this.rootFilePaths.has(expansionSourceNodeId)) {
        const owners = this.nodeOwners.get(expansionSourceNodeId);
        if (owners && owners.size > 0) {
          parentKey = Array.from(owners).sort((a, b) => a.localeCompare(b))[0] ?? null;
        }
      }
      this.expansionParent.set(badgeKey, parentKey);
    }

    for (const target of targets) {
      const targetPath = target.path;
      this.currentFiles.add(targetPath);
      targetPaths.add(targetPath);
      const anchorNode = this.nodeMap.get(expansionSourceNodeId) ?? null;
      const childNodeId = this.ensureExpansionTargetNode(target, expansionSourceNodeId, property, {
        anchorNode,
        preferExistingVisibleTarget: this.visibleLinkTypes.has(property)
      });
      this.expansionNodes.get(badgeKey)!.add(childNodeId);
      if (!this.nodeOwners.has(childNodeId)) {
        this.nodeOwners.set(childNodeId, new Set<string>());
      }
      this.nodeOwners.get(childNodeId)!.add(badgeKey);
    }

    this.expandedByBadge.set(badgeKey, targetPaths);
    return {
      sourceNodeId: expansionSourceNodeId,
      sourcePath: source.path,
      linkType: property,
      expanded: true,
      expansionId: badgeKey,
      parentExpansionId: this.expansionParent.get(badgeKey) ?? null
    };
  }

  toggleExpansion(
    sourceFile: TFile | string,
    linkTypeName: string,
    options: { persist?: boolean; sourceNodeId?: string } = {}
  ): void {
    const persist = options.persist !== false;
    const source = typeof sourceFile === "string"
      ? this.app.vault.getAbstractFileByPath(String(sourceFile ?? "").trim())
      : sourceFile;
    if (!(source instanceof TFile)) return;

    const property = String(linkTypeName ?? "").trim().toLowerCase();
    if (!property) return;
    const expansionSourceNodeId = String(options.sourceNodeId ?? "").trim() || source.path;
    const badgeKey = `${expansionSourceNodeId}::${property}`;
    let changed = false;
    let toggleEvent: {
      sourceNodeId: string;
      sourcePath: string;
      linkType: string;
      expanded: boolean;
      expansionId: string;
      parentExpansionId: string | null;
    } | null = null;

    if (this.expandedByBadge.has(badgeKey)) {
      const subtree = this.getExpansionSubtree(badgeKey);
      const adjacency = new Map<string, Set<string>>();
      for (const key of subtree) {
        adjacency.set(key, new Set<string>());
      }
      for (const [child, parent] of this.expansionParent.entries()) {
        if (!parent) continue;
        if (!subtree.has(child) || !subtree.has(parent)) continue;
        adjacency.get(parent)?.add(child);
      }
      const depthMap = new Map<string, number>();
      depthMap.set(badgeKey, 0);
      const queue: string[] = [badgeKey];
      while (queue.length > 0) {
        const current = queue.shift()!;
        const currentDepth = depthMap.get(current) ?? 0;
        for (const child of adjacency.get(current) ?? []) {
          if (depthMap.has(child)) continue;
          depthMap.set(child, currentDepth + 1);
          queue.push(child);
        }
      }
      const collapseOrder = Array.from(subtree).sort((a, b) =>
        (depthMap.get(b) ?? 0) - (depthMap.get(a) ?? 0)
      );

      for (const subKey of collapseOrder) {
        const ownedNodes = this.expansionNodes.get(subKey);
        for (const nodePath of ownedNodes ?? []) {
          const owners = this.nodeOwners.get(nodePath);
          if (!owners) continue;
          owners.delete(subKey);
          if (owners.size === 0) {
            this.nodeOwners.delete(nodePath);
            if (!this.rootFilePaths.has(nodePath)) {
              this.currentFiles.delete(nodePath);
            }
          }
        }

        this.expansionNodes.delete(subKey);
        this.expandedByBadge.delete(subKey);
        this.expansionParent.delete(subKey);
      }

      if (subtree.has(this.hoveredExpansionKey ?? "")) {
        this.hoveredExpansionKey = null;
      }
      changed = true;
    } else {
      const targets = this.resolveLinkedTargets(source, { property } as O3LinkType);
      const targetPaths = new Set<string>();
      if (!this.expansionNodes.has(badgeKey)) {
        this.expansionNodes.set(badgeKey, new Set<string>());
      }
      if (!this.expansionParent.has(badgeKey)) {
        let parentKey: string | null = null;
        if (!this.rootFilePaths.has(expansionSourceNodeId)) {
          const owners = this.nodeOwners.get(expansionSourceNodeId);
          if (owners && owners.size > 0) {
            parentKey = Array.from(owners).sort((a, b) => a.localeCompare(b))[0] ?? null;
          }
        }
        this.expansionParent.set(badgeKey, parentKey);
      }
      for (const target of targets) {
        const targetPath = target.path;
        targetPaths.add(targetPath);
        const anchorNode = this.nodeMap.get(expansionSourceNodeId) ?? null;
        const childNodeId = this.ensureExpansionTargetNode(target, expansionSourceNodeId, property, {
          anchorNode,
          preferExistingVisibleTarget: this.visibleLinkTypes.has(property)
        });
        if (this.activeLinkTypeDuplicateNodesByProperty.get(property) !== true) {
          this.currentFiles.add(targetPath);
        }
        this.expansionNodes.get(badgeKey)!.add(childNodeId);
        if (!this.nodeOwners.has(childNodeId)) {
          this.nodeOwners.set(childNodeId, new Set<string>());
        }
        this.nodeOwners.get(childNodeId)!.add(badgeKey);
      }
      this.expandedByBadge.set(badgeKey, targetPaths);
      changed = true;
    }

    if (persist && changed) {
      toggleEvent = {
        sourceNodeId: expansionSourceNodeId,
        sourcePath: source.path,
        linkType: property,
        expanded: this.expandedByBadge.has(badgeKey),
        expansionId: badgeKey,
        parentExpansionId: this.expansionParent.get(badgeKey) ?? null
      };
    }
    this.refreshHoveredHighlightNodes();
    this.reconcileCurrentFilesFromVisibleState();

    const files = this.getCurrentFilesAsTFiles();
    this.lastFiles = files;
    this.lastLinkTypeSourceFiles = files;
    this.rebuildEdges();
    if (toggleEvent) {
      this.menuOptions.onBadgeExpansionToggled?.(
        toggleEvent.sourceNodeId,
        toggleEvent.sourcePath,
        toggleEvent.linkType,
        toggleEvent.expanded,
        toggleEvent.expansionId,
        toggleEvent.parentExpansionId
      );
    }
  }

  private requestRender(): void {
    if (!this.canvas || !this.ctx) return;
    this.safeDraw();
  }

  private safeDraw(): void {
    try {
      this.draw();
    } catch (error) {
      console.error("[GraphEngine] render error", error);
    }
  }

  private refreshHoveredHighlightNodes(): void {
    if (!this.hoveredExpansionKey) {
      this.hoveredHighlightNodes = null;
      return;
    }
    const subtree = this.getExpansionSubtree(this.hoveredExpansionKey);
    const highlightSet = new Set<string>();
    for (const subKey of subtree) {
      const nodes = this.expansionNodes.get(subKey);
      if (!nodes) continue;
      for (const nodeId of nodes) {
        highlightSet.add(nodeId);
      }
    }
    this.hoveredHighlightNodes = highlightSet.size > 0 ? highlightSet : null;
  }

  private getExpansionSubtree(rootKey: string): Set<string> {
    const root = String(rootKey ?? "").trim();
    const subtree = new Set<string>();
    if (!root) return subtree;
    const adjacency = new Map<string, Set<string>>();
    for (const [child, parent] of this.expansionParent.entries()) {
      if (!parent) continue;
      if (!adjacency.has(parent)) {
        adjacency.set(parent, new Set<string>());
      }
      adjacency.get(parent)!.add(child);
    }
    const queue: string[] = [root];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const key = queue.shift()!;
      if (visited.has(key)) continue;
      visited.add(key);
      subtree.add(key);
      for (const child of adjacency.get(key) ?? []) {
        if (!visited.has(child)) {
          queue.push(child);
        }
      }
    }
    return subtree;
  }

  private resolveLinkedTargets(sourceFile: TFile, linkType: O3LinkType): GraphLinkTarget[] {
    const property = this.normalizeLinkType(String(linkType.property ?? "").trim().toLowerCase());
    if (!property) return [];
    const direction = linkType.linkDiscoveryDirection
      ?? this.activeLinkTypeDiscoveryDirectionByProperty.get(property)
      ?? "outgoing";
    const candidates = new Set<string>();
    if (direction === "outgoing" || direction === "both") {
      const frontmatterByType = this.collectFrontmatterLinksByType(sourceFile);
      for (const targetPath of frontmatterByType.get(property) ?? []) {
        candidates.add(targetPath);
      }
    }
    if (direction === "incoming" || direction === "both") {
      this.ensureIncomingLinkIndex();
      for (const incomingSource of this.incomingLinksByProperty.get(property)?.get(sourceFile.path) ?? []) {
        candidates.add(incomingSource);
      }
    }
    const resolved: GraphLinkTarget[] = [];
    const seen = new Set<string>();

    for (const candidate of candidates) {
      const file = this.app.vault.getAbstractFileByPath(candidate)
        ?? this.app.metadataCache.getFirstLinkpathDest(candidate, sourceFile.path);

      const target = file instanceof TFile
        ? {
            path: file.path,
            label: this.lastLabels.get(file.path) ?? file.basename ?? file.name,
            file,
            missing: false
          } satisfies GraphLinkTarget
        : this.resolveGraphLinkTarget(candidate, sourceFile.path);

      if (target && target.path !== sourceFile.path && !seen.has(target.path)) {
        seen.add(target.path);
        resolved.push(target);
      }
    }

    return resolved;
  }

  private registerRecentGraphLinkMutationTargets(
    sourcePathRaw: string,
    linkTypeRaw: string,
    addedPathsRaw: string[] = [],
    removedPathsRaw: string[] = []
  ): void {
    const sourcePath = String(sourcePathRaw ?? "").trim();
    const linkType = this.normalizeLinkType(String(linkTypeRaw ?? "").trim().toLowerCase());
    if (!sourcePath || !linkType) return;
    const addedPaths = addedPathsRaw
      .map((path) => String(path ?? "").trim())
      .filter(Boolean);
    const removedPaths = removedPathsRaw
      .map((path) => String(path ?? "").trim())
      .filter(Boolean);
    if (addedPaths.length === 0 && removedPaths.length === 0) return;

    const key = this.graphLinkMutationTargetKey(sourcePath, linkType);
    const now = Date.now();
    const targets = this.recentGraphLinkMutationTargets.get(key) ?? new Map<string, number>();
    for (const removed of removedPaths) {
      targets.delete(removed);
    }
    for (const added of addedPaths) {
      targets.set(added, now);
    }
    if (targets.size > 0) {
      this.recentGraphLinkMutationTargets.set(key, targets);
    } else {
      this.recentGraphLinkMutationTargets.delete(key);
    }
  }

  private getRecentGraphLinkMutationTargets(sourcePathRaw: string, linkTypeRaw: string): string[] {
    const sourcePath = String(sourcePathRaw ?? "").trim();
    const linkType = this.normalizeLinkType(String(linkTypeRaw ?? "").trim().toLowerCase());
    if (!sourcePath || !linkType) return [];
    const key = this.graphLinkMutationTargetKey(sourcePath, linkType);
    const targets = this.recentGraphLinkMutationTargets.get(key);
    if (!targets) return [];

    const now = Date.now();
    const out: string[] = [];
    for (const [targetPath, createdAt] of targets.entries()) {
      if (now - createdAt > this.recentGraphLinkMutationTargetTtlMs) {
        targets.delete(targetPath);
        continue;
      }
      out.push(targetPath);
    }
    if (targets.size === 0) {
      this.recentGraphLinkMutationTargets.delete(key);
    }
    return out;
  }

  private graphLinkMutationTargetKey(sourcePath: string, linkType: string): string {
    return `${sourcePath}::${this.normalizeLinkType(String(linkType ?? "").trim().toLowerCase())}`;
  }

  private clearIncomingLinkIndex(): void {
    this.incomingLinksByProperty.clear();
    this.incomingLinksBySource.clear();
    this.incomingLinkIndexReady = false;
    this.badgeYamlLinkPresenceCache.clear();
  }

  private ensureIncomingLinkIndex(): void {
    if (this.incomingLinkIndexReady) return;
    this.incomingLinksByProperty.clear();
    this.incomingLinksBySource.clear();
    for (const file of this.app.vault.getMarkdownFiles()) {
      this.indexIncomingLinksForFile(file);
    }
    this.incomingLinkIndexReady = true;
  }

  updateLinkDiscoveryIndexForFile(file: TFile): void {
    if (!this.incomingLinkIndexReady) {
      this.badgeYamlLinkPresenceCache.clear();
      return;
    }
    this.removeIncomingLinksForSource(file.path);
    this.indexIncomingLinksForFile(file);
    this.badgeYamlLinkPresenceCache.clear();
    this.parentLinkTypeCache.clear();
  }

  private indexIncomingLinksForFile(file: TFile): void {
    const linksByType = this.collectFrontmatterLinksByType(file);
    const sourceEntries = new Map<string, Set<string>>();
    for (const property of this.activeLinkTypeDiscoveryDirectionByProperty.keys()) {
      const targets = linksByType.get(property);
      if (!targets || targets.size === 0) continue;
      const sourceTargets = new Set<string>();
      for (const targetPath of targets) {
        sourceTargets.add(targetPath);
        let incomingByTarget = this.incomingLinksByProperty.get(property);
        if (!incomingByTarget) {
          incomingByTarget = new Map<string, Set<string>>();
          this.incomingLinksByProperty.set(property, incomingByTarget);
        }
        let sources = incomingByTarget.get(targetPath);
        if (!sources) {
          sources = new Set<string>();
          incomingByTarget.set(targetPath, sources);
        }
        sources.add(file.path);
      }
      sourceEntries.set(property, sourceTargets);
    }
    if (sourceEntries.size > 0) {
      this.incomingLinksBySource.set(file.path, sourceEntries);
    }
  }

  private removeIncomingLinksForSource(sourcePath: string): void {
    const previous = this.incomingLinksBySource.get(sourcePath);
    if (!previous) return;
    for (const [property, targets] of previous.entries()) {
      const incomingByTarget = this.incomingLinksByProperty.get(property);
      if (!incomingByTarget) continue;
      for (const targetPath of targets) {
        const sources = incomingByTarget.get(targetPath);
        if (!sources) continue;
        sources.delete(sourcePath);
        if (sources.size === 0) incomingByTarget.delete(targetPath);
      }
      if (incomingByTarget.size === 0) this.incomingLinksByProperty.delete(property);
    }
    this.incomingLinksBySource.delete(sourcePath);
  }

  private isLinkDiscoveryEnabled(linkType: string): boolean {
    const normalizedType = this.normalizeLinkType(linkType);
    if (!normalizedType || normalizedType === NONE_LINK_TYPE) return true;
    return this.activeLinkTypeDiscoveryByProperty.get(normalizedType) !== false;
  }

  private isLinkDuplicateNodesEnabled(linkType: string): boolean {
    const normalizedType = this.normalizeLinkType(linkType);
    if (!normalizedType || normalizedType === NONE_LINK_TYPE) return false;
    return this.activeLinkTypeDuplicateNodesByProperty.get(normalizedType) === true;
  }

  private getLinkTypesForNode(node: GraphNode): O3LinkType[] {
    if (!node.embeddedInstanceId) return this.activeNodeBadgeLinkTypes;
    return this.embeddedGraphContainers.get(node.embeddedInstanceId)?.linkTypes
      ?? this.activeNodeBadgeLinkTypes;
  }

  private getBadgeLinkTypesForNode(node: GraphNode): O3LinkType[] {
    const activeLinkTypes = this.getLinkTypesForNode(node);
    const shouldIncludeVisibleLinkTypes =
      node.embeddedInstanceId
      && (this.selectedNodeIds.has(node.id) || this.dragBadgeRevealNodeId === node.id);
    if (!shouldIncludeVisibleLinkTypes) {
      return activeLinkTypes;
    }
    const container = this.embeddedGraphContainers.get(node.embeddedInstanceId);
    return this.mergeBadgeLinkTypeDefinitions(
      activeLinkTypes,
      container?.visibleLinkTypeDefinitions ?? [],
      this.visibleNodeBadgeLinkTypes
    );
  }

  private getPersistableBadgeLinkTypesForNode(node: GraphNode): O3LinkType[] {
    const activeLinkTypes = this.getLinkTypesForNode(node);
    if (!node.embeddedInstanceId) return activeLinkTypes;
    const container = this.embeddedGraphContainers.get(node.embeddedInstanceId);
    return this.mergeBadgeLinkTypeDefinitions(
      activeLinkTypes,
      container?.visibleLinkTypeDefinitions ?? [],
      this.visibleNodeBadgeLinkTypes
    );
  }

  private createDuplicateNodeId(sourcePath: string, targetPath: string, linkType: string): string {
    const id = this.formatDuplicateNodeId(sourcePath, targetPath, linkType);
    const normalizedTarget = String(targetPath ?? "").trim();
    this.duplicateNodeSourceById.set(id, normalizedTarget);
    if (!this.duplicateNodeIdsBySourcePath.has(normalizedTarget)) {
      this.duplicateNodeIdsBySourcePath.set(normalizedTarget, new Set<string>());
    }
    this.duplicateNodeIdsBySourcePath.get(normalizedTarget)!.add(id);
    return id;
  }

  private resolveRuntimeTargetNodeId(
    sourceNodeId: string,
    targetPath: string,
    linkType: string,
    options: { preferExistingVisibleTarget?: boolean; memberIds?: Set<string> } = {}
  ): string {
    const normalizedTarget = String(targetPath ?? "").trim();
    if (!normalizedTarget) return normalizedTarget;
    if (!this.isLinkDuplicateNodesEnabled(linkType)) {
      return normalizedTarget;
    }
    if (options.preferExistingVisibleTarget === true) {
      const semanticTarget = this.findSemanticEdgeTargetNodeId(sourceNodeId, normalizedTarget, linkType, options.memberIds);
      if (semanticTarget) return semanticTarget;
      const visibleTarget = this.findVisibleNodeIdForSourcePath(normalizedTarget, options.memberIds);
      if (visibleTarget) return visibleTarget;
    }
    return this.createDuplicateNodeId(sourceNodeId, normalizedTarget, linkType);
  }

  private ensureExpansionTargetNode(
    target: GraphLinkTarget,
    sourceNodeId: string,
    linkType: string,
    options: {
      anchorNode?: GraphNode | null;
      preferExistingVisibleTarget?: boolean;
      memberIds?: Set<string>;
      expandedVia?: GraphNodeExpansionRef;
    } = {}
  ): string {
    const property = this.normalizeLinkType(linkType);
    const targetPath = String(target.path ?? "").trim();
    const childNodeId = this.resolveRuntimeTargetNodeId(sourceNodeId, targetPath, property, {
      preferExistingVisibleTarget: options.preferExistingVisibleTarget === true,
      memberIds: options.memberIds
    });
    const targetIsDuplicate = childNodeId !== targetPath
      && this.tryGetDuplicateSourcePathFromId(childNodeId) === targetPath;
    const ensureOptions = {
      anchorNode: options.anchorNode ?? null,
      ...(options.expandedVia ? { expandedVia: options.expandedVia } : {})
    };
    if (targetIsDuplicate) {
      this.ensureDuplicateNodeForTarget(target, childNodeId, ensureOptions);
    } else {
      this.ensureNodeForTarget(target, ensureOptions);
    }
    return childNodeId;
  }

  private findSemanticEdgeTargetNodeId(
    sourceNodeId: string,
    targetPath: string,
    linkType: string,
    memberIds?: Set<string>
  ): string | null {
    const sourcePath = this.getSourcePathForNodeId(sourceNodeId) || String(sourceNodeId ?? "").trim();
    const normalizedTarget = String(targetPath ?? "").trim();
    const normalizedType = this.normalizeLinkType(linkType);
    if (!sourcePath || !normalizedTarget || !normalizedType) return null;
    const match = this.edges.find((edge) => {
      if (memberIds && (!memberIds.has(edge.from) || !memberIds.has(edge.to))) return false;
      return (this.getSourcePathForNodeId(edge.from) || edge.from) === sourcePath
        && (this.getSourcePathForNodeId(edge.to) || edge.to) === normalizedTarget
        && this.normalizeLinkType(edge.linkType ?? edge.type) === normalizedType;
    });
    return match?.to ?? null;
  }

  private findVisibleNodeIdForSourcePath(
    sourcePathRaw: string,
    memberIds?: Set<string>
  ): string | null {
    const sourcePath = String(sourcePathRaw ?? "").trim();
    if (!sourcePath) return null;
    const candidates = this.nodes
      .filter((node) => node.sourcePath === sourcePath)
      .filter((node) => !memberIds || memberIds.has(node.id))
      .sort((a, b) => {
        if ((a.id === sourcePath) !== (b.id === sourcePath)) return a.id === sourcePath ? -1 : 1;
        const aDuplicate = this.tryGetDuplicateSourcePathFromId(a.id) === sourcePath;
        const bDuplicate = this.tryGetDuplicateSourcePathFromId(b.id) === sourcePath;
        if (aDuplicate !== bDuplicate) return aDuplicate ? 1 : -1;
        if (a.isBase !== b.isBase) return a.isBase ? -1 : 1;
        return a.id.localeCompare(b.id);
      });
    return candidates[0]?.id ?? null;
  }

  private formatDuplicateNodeId(sourcePath: string, targetPath: string, linkType: string): string {
    const from = encodeURIComponent(String(sourcePath ?? "").trim());
    const to = encodeURIComponent(String(targetPath ?? "").trim());
    const type = encodeURIComponent(this.normalizeLinkType(linkType));
    return `__o3dup__::${to}::${from}::${type}`;
  }

  private isNodeVisibleAfterFileFilter(nodeId: string, visibleFileIds: Set<string>): boolean {
    if (visibleFileIds.has(nodeId)) return true;
    if (this.duplicateNodeSourceById.has(nodeId)) return true;
    if (this.tryGetDuplicateSourcePathFromId(nodeId)) return true;
    const existing = this.nodeMap.get(nodeId);
    if (existing && String(existing.sourcePath ?? "").trim() !== String(existing.id ?? "").trim()) {
      return true;
    }
    return false;
  }

  private shouldSuppressOriginalNodeForDuplicate(path: string): boolean {
    const normalizedPath = String(path ?? "").trim();
    if (!normalizedPath) return false;
    if (!this.duplicateNodeIdsBySourcePath.has(normalizedPath)) return false;
    const hasDirectEdge = this.edges.some((edge) =>
      edge.from === normalizedPath || edge.to === normalizedPath
    );
    return !hasDirectEdge;
  }

  private syncDuplicateNodesFromEdges(): void {
    const requiredDuplicateNodeIds = new Set<string>();
    const anchorByDuplicateNodeId = new Map<string, string>();
    const expandedViaByDuplicateNodeId = new Map<string, NonNullable<GraphNode["expandedVia"]>[number]>();
    for (const edge of this.edges) {
      const fromIsDuplicate = this.duplicateNodeSourceById.has(edge.from);
      const toIsDuplicate = this.duplicateNodeSourceById.has(edge.to);
      if (fromIsDuplicate) {
        requiredDuplicateNodeIds.add(edge.from);
        if (!anchorByDuplicateNodeId.has(edge.from)) {
          anchorByDuplicateNodeId.set(edge.from, edge.to);
        }
        if (edge.relationship === "parent" && edge.linkType && edge.origin) {
          expandedViaByDuplicateNodeId.set(edge.from, {
            type: "parent",
            linkType: this.normalizeLinkType(edge.linkType),
            origin: edge.origin
          });
        }
      }
      if (toIsDuplicate) {
        requiredDuplicateNodeIds.add(edge.to);
        if (!anchorByDuplicateNodeId.has(edge.to)) {
          anchorByDuplicateNodeId.set(edge.to, edge.from);
        }
        if (edge.relationship === "parent" && edge.linkType && edge.origin) {
          expandedViaByDuplicateNodeId.set(edge.to, {
            type: "parent",
            linkType: this.normalizeLinkType(edge.linkType),
            origin: edge.origin
          });
        }
      }
    }

    for (const nodeId of Array.from(this.nodeMap.keys())) {
      if (!this.duplicateNodeSourceById.has(nodeId)) continue;
      if (requiredDuplicateNodeIds.has(nodeId)) continue;
      this.removeNodeById(nodeId);
    }

    for (const duplicateNodeId of requiredDuplicateNodeIds) {
      if (this.nodeMap.has(duplicateNodeId)) continue;
      const sourcePath = this.duplicateNodeSourceById.get(duplicateNodeId);
      if (!sourcePath) continue;
      const file = this.app.vault.getAbstractFileByPath(sourcePath);
      const anchorNodeId = anchorByDuplicateNodeId.get(duplicateNodeId) ?? "";
      const anchorNode = this.nodeMap.get(anchorNodeId) ?? null;
      const labelFromPath = sourcePath.split("/").pop()?.replace(/\.md$/i, "") ?? sourcePath;
      const label = (file instanceof TFile)
        ? (this.lastLabels.get(sourcePath) ?? file.basename ?? file.name)
        : (this.lastLabels.get(sourcePath) ?? labelFromPath);
      const parentDepth = Math.max(0, anchorNode?.depth ?? 0);
      const rememberedPosition = this.getRememberedNodePosition(duplicateNodeId);
      const duplicateLinkType = this.normalizeLinkType(
        this.edges.find((edge) => edge.to === duplicateNodeId)?.linkType ?? ""
      );
      const initialPosition = rememberedPosition
        ?? (anchorNode
          ? this.getExpandedChildInitialPosition(duplicateNodeId, sourcePath, anchorNode, duplicateLinkType)
          : this.ensureInitialPositionIsSeparated(
            this.getInitialPositionForNewNode(sourcePath),
            duplicateNodeId,
            null,
            duplicateLinkType
          ));
      const node: GraphNode = {
        id: duplicateNodeId,
        sourcePath,
        label,
        x: initialPosition.x,
        y: initialPosition.y,
        vx: 0,
        vy: 0,
        mass: 1,
        isBase: false,
        depth: parentDepth + 1,
        isMissingFile: !(file instanceof TFile),
        ...(expandedViaByDuplicateNodeId.has(duplicateNodeId)
          ? { expandedVia: [expandedViaByDuplicateNodeId.get(duplicateNodeId)!] }
          : {})
      };
      this.nodes.push(node);
      this.nodeMap.set(duplicateNodeId, node);
      this.applyPinnedStateToNode(node, { restorePersistedPosition: rememberedPosition === null });
      this.badgesDirty = true;
    }

    const nextDuplicateNodeIdsBySourcePath = new Map<string, Set<string>>();
    for (const duplicateNodeId of requiredDuplicateNodeIds) {
      const sourcePath = this.duplicateNodeSourceById.get(duplicateNodeId);
      if (!sourcePath) continue;
      if (!nextDuplicateNodeIdsBySourcePath.has(sourcePath)) {
        nextDuplicateNodeIdsBySourcePath.set(sourcePath, new Set<string>());
      }
      nextDuplicateNodeIdsBySourcePath.get(sourcePath)!.add(duplicateNodeId);
    }
    this.duplicateNodeIdsBySourcePath = nextDuplicateNodeIdsBySourcePath;
  }

  private getSourcePathForNodeId(nodeId: string): string {
    const normalizedNodeId = String(nodeId ?? "").trim();
    if (!normalizedNodeId) return "";
    const fromDuplicateMap = this.duplicateNodeSourceById.get(normalizedNodeId);
    if (fromDuplicateMap) return fromDuplicateMap;
    const fromDuplicateId = this.tryGetDuplicateSourcePathFromId(normalizedNodeId);
    if (fromDuplicateId) return fromDuplicateId;
    const fromNode = this.nodeMap.get(normalizedNodeId);
    if (fromNode && String(fromNode.sourcePath ?? "").trim()) {
      return String(fromNode.sourcePath ?? "").trim();
    }
    return normalizedNodeId;
  }

  private tryGetDuplicateSourcePathFromId(nodeId: string): string | null {
    const raw = String(nodeId ?? "").trim();
    if (!raw.startsWith("__o3dup__::")) return null;
    const parts = raw.split("::");
    if (parts.length < 4) return null;
    try {
      const decoded = decodeURIComponent(parts[1] ?? "");
      return decoded.trim() || null;
    } catch {
      return null;
    }
  }

  private computeHoveredDuplicateNodeIds(node: GraphNode | null): Set<string> | null {
    if (!node) return null;
    const sourcePath = String(node.sourcePath ?? "").trim();
    if (!sourcePath) return null;
    const duplicateNodeIds = this.duplicateNodeIdsBySourcePath.get(sourcePath);
    if (!duplicateNodeIds || duplicateNodeIds.size === 0) return null;
    return new Set<string>(duplicateNodeIds);
  }

  private areSetsEqual(a: Set<string> | null, b: Set<string> | null): boolean {
    if (a === b) return true;
    if (!a || !b) return !a && !b;
    if (a.size !== b.size) return false;
    for (const item of a) {
      if (!b.has(item)) return false;
    }
    return true;
  }

  private getCombinedHoveredNodes(): Set<string> | null {
    if (!this.hoveredHighlightNodes && !this.hoveredDuplicateNodeIds) return null;
    const out = new Set<string>();
    for (const id of this.hoveredHighlightNodes ?? []) out.add(id);
    for (const id of this.hoveredDuplicateNodeIds ?? []) out.add(id);
    return out;
  }

  setLinkTypeSemantic(type: string, role: "link" | "parent"): void {
    const normalizedType = this.normalizeLinkType(type);
    if (!normalizedType) return;

    const normalizedRole = this.normalizeLinkTypeSemantic(role);
    if (normalizedRole === "link") {
      this.linkTypeSemantics.delete(normalizedType);
    } else {
      this.linkTypeSemantics.set(normalizedType, normalizedRole);
    }

    if (this.menuOpen) {
      this.renderLinkTypeMenu();
    }
    this.parentLinkTypeCache.clear();
    this.refreshBadges();
    this.emitLinkTypeSemantics();
  }

  setLinkTypePhysicsOverride(
    type: string,
    patch: Partial<LinkTypePhysicsConfig>,
    options: { rerenderMenu?: boolean; reheatAmount?: number } = {}
  ): void {
    const normalizedType = this.normalizeLinkType(type);
    if (!normalizedType) return;

    const current = this.getLinkTypePhysicsConfig(normalizedType);
    const next: LinkTypePhysicsConfig = {
      preferredDistance: patch.preferredDistance === undefined ? current.preferredDistance : patch.preferredDistance,
      strength: patch.strength === undefined ? current.strength : patch.strength
    };
    const normalized = this.normalizeLinkTypePhysicsConfig(next);

    if (
      !Number.isFinite(normalized.preferredDistance) &&
      !Number.isFinite(normalized.strength)
    ) {
      this.linkTypePhysics.delete(normalizedType);
    } else {
      this.linkTypePhysics.set(normalizedType, normalized);
    }

    if (options.rerenderMenu !== false && this.menuOpen) {
      this.renderLinkTypeMenu();
    }
    if (this.lastFocalNodeId && this.hasNode(this.lastFocalNodeId)) {
      this.lockNode(this.lastFocalNodeId);
      this.reheatSimulation(options.reheatAmount ?? 0.15, "link type physics override");
      this.scheduleUnlock(this.lastFocalNodeId);
    } else {
      this.reheatSimulation(options.reheatAmount ?? 0.15, "link type physics override");
    }
    this.emitLinkTypePhysics();
  }

  updateLinkTypePhysics(configMap: Record<string, LinkTypePhysicsConfig>): void {
    this.setLinkTypePhysics(configMap);
  }

  setLinkTypePhysics(configMap: Record<string, LinkTypePhysicsConfig>): void {
    const nextSignature = this.buildLinkTypePhysicsSignature(configMap);
    const changed = nextSignature !== this.linkTypePhysicsSignature;
    this.linkTypePhysicsSignature = nextSignature;

    this.linkTypePhysics.clear();
    if (configMap && typeof configMap === "object") {
      for (const [type, rawConfig] of Object.entries(configMap)) {
        const normalizedType = this.normalizeLinkType(type);
        if (!normalizedType) continue;
        const normalized = this.normalizeLinkTypePhysicsConfig(rawConfig);
        if (
          !Number.isFinite(normalized.preferredDistance) &&
          !Number.isFinite(normalized.strength)
        ) {
          continue;
        }
        this.linkTypePhysics.set(normalizedType, normalized);
      }
    }
    if (this.menuOpen) {
      this.renderLinkTypeMenu();
    }
    if (changed) {
      this.freezeExistingNodesForTopologyUpdate(this.getCurrentNodeIdSet());
      this.reheatSimulation(0.15, "link type physics apply");
    } else {
      this.requestRender();
    }
  }

  lockNode(path: string): void {
    const normalizedPath = String(path ?? "").trim();
    if (!normalizedPath) return;
    const node = this.getNode(normalizedPath);
    if (!node) return;

    node.isLocked = true;
    node.lockX = node.x;
    node.lockY = node.y;
    node.vx = 0;
    node.vy = 0;
    this.lastFocalNodeId = normalizedPath;
  }

  unlockNode(path: string): void {
    const normalizedPath = String(path ?? "").trim();
    if (!normalizedPath) return;
    const node = this.getNode(normalizedPath);
    const timer = this.nodeUnlockTimers.get(normalizedPath);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      this.nodeUnlockTimers.delete(normalizedPath);
    }
    if (!node) return;
    if (node.isPinned) {
      node.isLocked = true;
      node.lockX = Number.isFinite(node.fx) ? Number(node.fx) : node.x;
      node.lockY = Number.isFinite(node.fy) ? Number(node.fy) : node.y;
      return;
    }
    node.isLocked = false;
  }

  scheduleUnlock(path: string, delayMs = 600): void {
    const normalizedPath = String(path ?? "").trim();
    if (!normalizedPath) return;
    if (!this.nodeMap.has(normalizedPath)) return;

    const existingTimer = this.nodeUnlockTimers.get(normalizedPath);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
    }

    const timer = window.setTimeout(() => {
      this.nodeUnlockTimers.delete(normalizedPath);
      this.unlockNode(normalizedPath);
    }, Math.max(0, Math.round(delayMs)));
    this.nodeUnlockTimers.set(normalizedPath, timer);
  }

  getLinkTypeSemantic(type: string): "link" | "parent" {
    const normalizedType = this.normalizeLinkType(type);
    if (!normalizedType) return "link";
    return this.normalizeLinkTypeSemantic(this.linkTypeSemantics.get(normalizedType));
  }

  setAllLinkTypeSemantics(semantics: Record<string, "link" | "parent">): void {
    this.linkTypeSemantics.clear();
    if (semantics && typeof semantics === "object") {
      for (const [type, role] of Object.entries(semantics)) {
        const normalizedType = this.normalizeLinkType(type);
        if (!normalizedType) continue;
        const normalizedRole = this.normalizeLinkTypeSemantic(role);
        if (normalizedRole === "parent") {
          this.linkTypeSemantics.set(normalizedType, normalizedRole);
        }
      }
    }

    if (this.menuOpen) {
      this.renderLinkTypeMenu();
    }
    this.parentLinkTypeCache.clear();
    this.refreshBadges();
  }

  updateNodeHighlightOnly(path: string | null): void {
    const nextPath = typeof path === "string" && path.trim().length > 0
      ? path.trim()
      : null;
    if (this.activeNodePath === nextPath) return;
    this.activeNodePath = nextPath;
    this.refreshNearestActiveLinkedNode();
    this.requestRender();
  }

  private refreshNearestActiveLinkedNode(): void {
    const previous = this.nearestActiveLinkedNodeId;
    this.nearestActiveLinkedNodeId = null;
    const activePath = String(this.activeNodePath ?? "").trim();
    if (!this.nearestActiveLinkedNodeEnabled || !activePath || !this.menuOptions.nearestActiveLinkedNodeEvaluator) {
      return;
    }
    const activeVisibleAsNode = this.nodes.some((node) => node.sourcePath === activePath || node.id === activePath);
    const activeVisibleAsContainer = Array.from(this.embeddedGraphContainers.values()).some((container) => container.graphPath === activePath);
    if (activeVisibleAsNode || activeVisibleAsContainer) {
      return;
    }
    const candidates: ActiveLinkedVisibleNodeCandidate[] = this.nodes
      .map((node) => ({
        id: node.id,
        path: node.sourcePath,
        isCore: Boolean(node.isBase || this.rootFilePaths.has(node.sourcePath) || this.filterFilePaths.has(node.sourcePath)),
        depth: Math.max(0, Number(node.depth ?? 0)),
        x: node.x,
        y: node.y
      }));
    const nextId = String(this.menuOptions.nearestActiveLinkedNodeEvaluator(activePath, candidates) ?? "").trim();
    this.nearestActiveLinkedNodeId = nextId && this.nodeMap.has(nextId) ? nextId : null;
    if (previous !== this.nearestActiveLinkedNodeId) {
      this.requestRender();
    }
  }

  updateNodeColor(path: string): void {
    const normalizedPath = String(path ?? "").trim();
    if (!normalizedPath) return;
    const nodeIds = this.nodes
      .filter((node) => node.sourcePath === normalizedPath)
      .map((node) => node.id);
    this.updateNodeColors(nodeIds.length > 0 ? nodeIds : [normalizedPath]);
    this.updateEmbeddedContainerInheritedColorsForSourcePath(normalizedPath);
  }

  updateNode(path: string, _metadata: Record<string, unknown>): void {
    const normalizedPath = String(path ?? "").trim();
    if (!normalizedPath) return;
    if (!this.hasNode(normalizedPath) && !this.hasVisibleNodeForSourcePath(normalizedPath)) return;
    const file = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (file instanceof TFile) {
      for (const node of this.nodes) {
        if (node.sourcePath !== normalizedPath && node.id !== normalizedPath) continue;
        node.sourcePath = file.path;
        node.label = this.lastLabels.get(file.path) ?? file.basename ?? file.name;
        node.isMissingFile = false;
      }
    }
    this.clearBadgeYamlLinkPresenceForPath(normalizedPath);
    this.updateNodeColor(normalizedPath);
    this.refreshNearestActiveLinkedNode();
    this.renderBadges();
  }

  private updateEmbeddedContainerInheritedColorsForSourcePath(pathRaw: string): void {
    const path = String(pathRaw ?? "").trim();
    if (!path || !this.menuOptions.groupingEvaluator) return;
    const changed = this.updateEmbeddedContainerInheritedColor((container) => container.originSourcePath === path);
    if (changed) {
      this.badgesDirty = true;
      this.requestRender();
    }
  }

  private updateEmbeddedContainerInheritedColors(): void {
    const changed = this.updateEmbeddedContainerInheritedColor(() => true);
    if (changed) {
      this.badgesDirty = true;
      this.requestRender();
    }
  }

  private updateEmbeddedContainerInheritedColor(
    predicate: (container: EmbeddedGraphContainerState) => boolean
  ): boolean {
    if (!this.menuOptions.groupingEvaluator) return false;
    let changed = false;
    for (const container of this.embeddedGraphContainers.values()) {
      if (!predicate(container) || container.colorSource === "explicit") continue;
      const groupColor = this.menuOptions.groupingEvaluator(container.originSourcePath);
      const nextColor = this.normalizeBadgeColor(groupColor ?? "#6e96dc");
      if (container.color === nextColor) continue;
      container.color = nextColor;
      container.colorSource = groupColor ? "group" : "default";
      changed = true;
    }
    return changed;
  }

  private clearBadgeYamlLinkPresenceForPath(path: string): void {
    const prefix = `${path}::`;
    for (const key of Array.from(this.badgeYamlLinkPresenceCache.keys())) {
      if (key.startsWith(prefix)) {
        this.badgeYamlLinkPresenceCache.delete(key);
      }
    }
  }

  refreshBadges(): void {
    this.badgesDirty = true;
    this.syncNodeBadges();
    this.syncPinnedNodeIcons();
    this.syncLensNodeIcons();
  }

  removeEdgesForNode(path: string): boolean {
    const normalizedPath = String(path ?? "").trim();
    if (!normalizedPath) return false;

    const before = this.edges.length;
    this.edges = this.edges.filter(edge =>
      edge.relationship === "parent" || edge.from !== normalizedPath
    );
    const changed = this.edges.length !== before;
    if (changed) this.nodeConnectionCountsDirty = true;
    return changed;
  }

  addEdge(
    sourcePath: string,
    targetPath: string,
    edgeData: {
      type: string;
      linkType?: string;
      relationship?: "parent";
      origin?: string;
    },
    options?: { allowNodeCreation?: boolean }
  ): boolean {
    const from = String(sourcePath ?? "").trim();
    const to = String(targetPath ?? "").trim();
    const type = String(edgeData?.type ?? "").trim();
    const allowCreation = options?.allowNodeCreation ?? false;
    if (!from || !to || !type) return false;
    if (!this.nodeMap.has(from)) return false;

    if (!this.nodeMap.has(to)) {
      if (!allowCreation) return false;
      const targetFile = this.app.vault.getAbstractFileByPath(to);
      if (!(targetFile instanceof TFile)) return false;
      const anchorNode = this.nodeMap.get(from) ?? null;
      this.ensureNodeForFile(targetFile, { anchorNode });
      this.updateNodeColors([to]);
    }

    const key = this.buildEdgeKey(from, to, type, edgeData.linkType);
    const exists = this.edges.some(edge =>
      this.buildEdgeKey(edge.from, edge.to, edge.type, edge.linkType) === key
      && edge.relationship === edgeData.relationship
    );
    if (exists) return false;

    this.edges.push({
      from,
      to,
      type,
      ...(edgeData.linkType ? { linkType: edgeData.linkType } : {}),
      ...(edgeData.relationship ? { relationship: edgeData.relationship } : {}),
      ...(edgeData.origin ? { origin: edgeData.origin } : {})
    });
    this.nodeConnectionCountsDirty = true;
    return true;
  }

  updateEdges(path: string, edges: ModelGraphEdge[]): void {
    const normalizedPath = String(path ?? "").trim();
    if (!normalizedPath) return;
    if (!this.hasNode(normalizedPath)) return;

    const previousNodeIds = this.getCurrentNodeIdSet();
    let changed = this.removeEdgesForNode(normalizedPath);
    for (const edge of edges) {
      changed = this.addEdge(
        edge.source,
        edge.target,
        { type: edge.type },
        { allowNodeCreation: false }
      ) || changed;
    }

    if (!changed) return;
    this.renderBadges();
    this.updateNodeColors([normalizedPath]);
    const now = Date.now();
    if (now - this.lastSimulationReheat > 300) {
      this.freezeExistingNodesForTopologyUpdate(previousNodeIds);
      this.reheatSimulation(0.08, "incremental edges update");
      this.lastSimulationReheat = now;
    }
  }

  removeNode(path: string): void {
    const normalizedPath = String(path ?? "").trim();
    if (!normalizedPath) return;
    if (!this.hasNode(normalizedPath) && !this.hasVisibleNodeForSourcePath(normalizedPath)) return;

    const previousNodeIds = this.getCurrentNodeIdSet();
    const removedNodeIds = new Set<string>();
    this.nodes = this.nodes.filter((node) => {
      const match = node.sourcePath === normalizedPath || node.id === normalizedPath;
      if (match) {
        removedNodeIds.add(node.id);
      }
      return !match;
    });
    this.syncNodeMapFromNodes();

    for (const nodeId of removedNodeIds) {
      this.nodeMap.delete(nodeId);
      this.nodeBadgeButtons.get(nodeId)?.remove();
      this.nodeBadgeButtons.delete(nodeId);
      this.nodePinButtons.get(nodeId)?.remove();
      this.nodePinButtons.delete(nodeId);
      this.nodeLensButtons.get(nodeId)?.remove();
      this.nodeLensButtons.delete(nodeId);
    }
    this.nodeMap.delete(normalizedPath);
    this.nodeBadgeButtons.get(normalizedPath)?.remove();
    this.nodeBadgeButtons.delete(normalizedPath);
    this.nodePinButtons.get(normalizedPath)?.remove();
    this.nodePinButtons.delete(normalizedPath);
    this.nodeLensButtons.get(normalizedPath)?.remove();
    this.nodeLensButtons.delete(normalizedPath);

    this.edges = this.edges.filter((edge) =>
      edge.from !== normalizedPath
      && edge.to !== normalizedPath
      && !removedNodeIds.has(edge.from)
      && !removedNodeIds.has(edge.to)
    );
    this.nodeConnectionCountsDirty = true;

    this.currentFiles.delete(normalizedPath);
    this.rootFilePaths.delete(normalizedPath);
    this.baseNodeIds.delete(normalizedPath);
    this.filterFilePaths.delete(normalizedPath);
    this.duplicateNodeIdsBySourcePath.delete(normalizedPath);
    this.recentGraphLinkMutationTargets.delete(normalizedPath);
    this.parentLinkTypeCache.delete(normalizedPath);
    for (const targets of this.recentGraphLinkMutationTargets.values()) {
      targets.delete(normalizedPath);
    }
    for (const [, nodeIds] of this.duplicateNodeIdsBySourcePath.entries()) {
      for (const nodeId of removedNodeIds) {
        nodeIds.delete(nodeId);
      }
    }

    this.renderBadges();
    this.freezeExistingNodesForTopologyUpdate(previousNodeIds);
    this.reheatSimulation(0.1, "remove node");
  }

  hasNode(path: string): boolean {
    return this.nodeMap.has(path);
  }

  hasVisibleNodeForSourcePath(path: string): boolean {
    const normalizedPath = String(path ?? "").trim();
    if (!normalizedPath) return false;
    return this.nodes.some((node) => node.sourcePath === normalizedPath || node.id === normalizedPath);
  }

  hasOuterVisibleNodeForSourcePath(path: string): boolean {
    const normalizedPath = String(path ?? "").trim();
    if (!normalizedPath) return false;
    return this.nodes.some((node) =>
      (node.sourcePath === normalizedPath || node.id === normalizedPath)
      && !node.stateOwnerPath
    );
  }

  getVisibleNodeIdForSourcePath(path: string): string | null {
    const normalizedPath = String(path ?? "").trim();
    if (!normalizedPath) return null;
    if (this.nodeMap.has(normalizedPath)) return normalizedPath;
    const candidates = this.nodes
      .filter((node) => node.sourcePath === normalizedPath)
      .sort((a, b) => {
        const depthDelta = (a.depth ?? 0) - (b.depth ?? 0);
        if (depthDelta !== 0) return depthDelta;
        return a.id.localeCompare(b.id);
      });
    return candidates[0]?.id ?? null;
  }

  getSelectedNodePaths(): string[] {
    const paths: string[] = [];
    const seen = new Set<string>();
    for (const nodeId of this.selectedNodeIds) {
      const node = this.nodeMap.get(nodeId);
      if (!node) continue;
      const ref = this.getGraphNodeMutationRef(node);
      if (!ref || seen.has(ref.path)) continue;
      seen.add(ref.path);
      paths.push(ref.path);
    }
    return paths;
  }

  private getNode(path: string): GraphNode | undefined {
    return this.nodeMap.get(path);
  }

  hasEdge(from: string, to: string, linkType: string): boolean {
    const normalizedFrom = String(from ?? "").trim();
    const normalizedTo = String(to ?? "").trim();
    const normalizedLinkType = this.normalizeLinkType(linkType);
    if (!normalizedFrom || !normalizedTo || !normalizedLinkType) return false;

    return this.edges.some(edge =>
      edge.from === normalizedFrom
      && edge.to === normalizedTo
      && edge.relationship === "parent"
      && edge.linkType === normalizedLinkType
    );
  }

  isParentExpansionActive(originPath: string, linkType: string): boolean {
    const normalizedOrigin = String(originPath ?? "").trim();
    const normalizedLinkType = this.normalizeLinkType(linkType);
    if (!normalizedOrigin || !normalizedLinkType) return false;
    return this.expandedParentRequests.has(this.buildExpandedParentRequestKey(normalizedOrigin, normalizedLinkType));
  }

  refreshExpandedParentLinksForOrigin(originPath: string): boolean {
    const normalizedOrigin = String(originPath ?? "").trim();
    if (!normalizedOrigin) return false;

    const activeRequests = Array.from(this.expandedParentRequests.values())
      .filter((request) =>
        request.origin === normalizedOrigin
        || this.getSourcePathForNodeId(request.origin) === normalizedOrigin
      );
    if (activeRequests.length === 0) return false;

    let changed = false;
    for (const request of activeRequests) {
      this.parentLinkTypeCache.delete(request.origin);
      this.parentLinkTypeCache.delete(normalizedOrigin);
      this.badgesDirty = true;
      this.collapseParentLinks(request.origin, request.linkType);
      changed = this.expandParentLinks(request.origin, request.linkType) || changed;
    }
    if (changed) {
      this.reheatSimulation(0.12, "expanded parent metadata refresh");
    }
    return changed;
  }

  getParentLinkTargets(originPath: string, linkType: string): string[] {
    const normalizedOrigin = String(originPath ?? "").trim();
    const normalizedLinkType = this.normalizeLinkType(linkType);
    if (!normalizedOrigin || !normalizedLinkType) return [];

    const sourcePath = this.getSourcePathForNodeId(normalizedOrigin) || normalizedOrigin;
    const originFile = this.app.vault.getAbstractFileByPath(sourcePath);
    if (!(originFile instanceof TFile)) return [];

    return this.resolveLinkedTargets(originFile, { property: normalizedLinkType } as O3LinkType)
      .map((target) => target.path);
  }

  expandParentLinks(originPath: string, linkType: string): boolean {
    const normalizedOrigin = String(originPath ?? "").trim();
    const normalizedLinkType = this.normalizeLinkType(linkType);
    if (!normalizedOrigin || !normalizedLinkType) return false;

    const requestKey = this.buildExpandedParentRequestKey(normalizedOrigin, normalizedLinkType);

    const originNode = this.nodeMap.get(normalizedOrigin);
    if (!originNode) {
      this.expandedParentRequests.delete(requestKey);
      return false;
    }

    const sourcePath = this.getSourcePathForNodeId(normalizedOrigin) || normalizedOrigin;
    const originFile = this.app.vault.getAbstractFileByPath(sourcePath);
    if (!(originFile instanceof TFile)) return false;
    const targets = this.resolveLinkedTargets(originFile, { property: normalizedLinkType } as O3LinkType);
    if (targets.length === 0) {
      this.expandedParentRequests.delete(requestKey);
      return false;
    }

    for (const target of targets) {
      const targetNodeId = this.ensureExpansionTargetNode(target, normalizedOrigin, normalizedLinkType, {
        anchorNode: originNode,
        preferExistingVisibleTarget: this.visibleLinkTypes.has(normalizedLinkType),
        expandedVia: {
          type: "parent",
          linkType: normalizedLinkType,
          origin: normalizedOrigin
        }
      });

      this.removeVisibleSemanticEdges(normalizedOrigin, targetNodeId, normalizedLinkType);
      if (this.hasEdge(normalizedOrigin, targetNodeId, normalizedLinkType)) {
        continue;
      }
      this.edges.push({
        from: normalizedOrigin,
        to: targetNodeId,
        type: "parent",
        origin: normalizedOrigin,
        linkType: normalizedLinkType,
        relationship: "parent"
      });
      this.nodeConnectionCountsDirty = true;
      this.updateNodeColors([targetNodeId]);
    }

    this.expandedParentRequests.set(requestKey, {
      origin: normalizedOrigin,
      linkType: normalizedLinkType
    });
    this.badgesDirty = true;
    this.requestRender();
    return true;
  }

  collapseParentLinks(
    originPath: string,
    linkType: string
  ): Array<{ origin: string; linkType: string }> {
    const normalizedOrigin = String(originPath ?? "").trim();
    const normalizedLinkType = this.normalizeLinkType(linkType);
    if (!normalizedOrigin || !normalizedLinkType) return [];

    const removedRequests: Array<{ origin: string; linkType: string }> = [];
    const removedRequestKeys = new Set<string>();

    const deleteRequest = (origin: string, type: string) => {
      const key = this.buildExpandedParentRequestKey(origin, type);
      if (removedRequestKeys.has(key)) return;
      removedRequestKeys.add(key);
      this.expandedParentRequests.delete(key);
      removedRequests.push({ origin, linkType: type });
    };

    const pruneTargetNode = (targetId: string, sourceOrigin: string, sourceLinkType: string) => {
      const node = this.nodeMap.get(targetId);
      if (!node) return;

      const refs = (node.expandedVia ?? []).filter(ref =>
        !(ref.origin === sourceOrigin && ref.linkType === sourceLinkType && ref.type === "parent")
      );

      if (refs.length > 0) {
        node.expandedVia = refs;
        return;
      }

      delete node.expandedVia;
      if (this.baseNodeIds.has(targetId)) {
        return;
      }

      const descendantRequests = Array.from(this.expandedParentRequests.values())
        .filter(req => req.origin === targetId);
      for (const req of descendantRequests) {
        collapseByOriginAndLinkType(req.origin, req.linkType);
      }

      this.edges = this.edges.filter(edge =>
        edge.from !== targetId && edge.to !== targetId
      );
      this.nodeConnectionCountsDirty = true;
      this.removeNodeById(targetId);
    };

    const collapseByOriginAndLinkType = (sourceOrigin: string, sourceLinkType: string) => {
      const matchingEdges = this.edges.filter(edge =>
        edge.relationship === "parent"
        && edge.origin === sourceOrigin
        && edge.linkType === sourceLinkType
      );

      deleteRequest(sourceOrigin, sourceLinkType);

      if (matchingEdges.length === 0) {
        return;
      }

      const edgeKeysToRemove = new Set(
        matchingEdges.map(edge => this.buildEdgeKey(edge.from, edge.to, edge.type, edge.linkType))
      );
      this.edges = this.edges.filter(edge => {
        const key = this.buildEdgeKey(edge.from, edge.to, edge.type, edge.linkType);
        return !edgeKeysToRemove.has(key);
      });
      this.nodeConnectionCountsDirty = true;

      const targetIds = new Set(matchingEdges.map(edge => edge.to));
      for (const targetId of targetIds) {
        pruneTargetNode(targetId, sourceOrigin, sourceLinkType);
      }
    };

    collapseByOriginAndLinkType(normalizedOrigin, normalizedLinkType);
    this.parentContainers.delete(
      this.buildExpandedParentRequestKey(normalizedOrigin, normalizedLinkType)
    );
    this.badgesDirty = true;
    this.requestRender();
    return removedRequests;
  }

  setSimulationSettings(settings: Partial<GraphSimulationSettings>) {
    const before = this.buildSimulationSettingsSignature();
    if (Number.isFinite(settings.repulsionStrength)) {
      this.repulsionStrength = Number(settings.repulsionStrength);
    }
    if (Number.isFinite(settings.centerStrength)) {
      this.centerStrength = Number(settings.centerStrength);
    }
    if (Number.isFinite(settings.nodeRadius)) {
      this.nodeRadius = Number(settings.nodeRadius);
    }
    if (Number.isFinite(settings.nodeConnectionSizeMultiplier)) {
      this.nodeConnectionSizeMultiplier = Number(settings.nodeConnectionSizeMultiplier);
    }
    if (Number.isFinite(settings.nearRestVelocityThreshold)) {
      this.nearRestVelocityThreshold = Number(settings.nearRestVelocityThreshold);
    }
    if (Number.isFinite(settings.restVelocityThreshold)) {
      this.restVelocityThreshold = Number(settings.restVelocityThreshold);
    }
    if (Number.isFinite(settings.textFadeThreshold)) {
      this.textFadeThreshold = this.normalizeTextFadeThreshold(settings.textFadeThreshold);
    }
    this.syncSettingControls();
    const after = this.buildSimulationSettingsSignature();
    if (after !== before) {
      this.freezeExistingNodesForTopologyUpdate(this.getCurrentNodeIdSet());
      this.startSimulation();
    }
    this.requestRender();
  }

  getNodeCount(): number {
    return this.nodes.length;
  }

  getEdgeCount(): number {
    return this.edges.length;
  }

  async exportImage(options: GraphImageExportOptions): Promise<Blob> {
    if (!this.canvas || !this.ctx) {
      throw new Error("Graph canvas is not initialized.");
    }
    const area = options.area === "fit-to-content" ? "fit-to-content" : "current-viewport";
    const previousCanvas = this.canvas;
    const previousCtx = this.ctx;
    const previousCamera = { ...this.camera };
    const previousBackgroundColor = this.graphBackgroundColor;
    const previousSuppressDomOverlayRender = this.suppressDomOverlayRender;

    const exportBounds = area === "fit-to-content"
      ? this.getRenderableGraphBounds(Number.isFinite(Number(options.padding)) ? Math.max(0, Number(options.padding)) : 48)
      : this.getCurrentViewportWorldBounds();
    const size = area === "fit-to-content"
      ? this.getExportCanvasSizeForWorldBounds(exportBounds)
      : {
          width: Math.max(1, previousCanvas.width),
          height: Math.max(1, previousCanvas.height),
          zoom: previousCamera.zoom
        };

    const exportCanvas = this.createElement("canvas");
    exportCanvas.width = size.width;
    exportCanvas.height = size.height;
    const exportCtx = exportCanvas.getContext("2d");
    if (!exportCtx) {
      throw new Error("Could not create export canvas context.");
    }

    try {
      this.canvas = exportCanvas;
      this.ctx = exportCtx;
      this.camera = area === "fit-to-content"
        ? {
            zoom: size.zoom,
            x: -exportBounds.left,
            y: -exportBounds.top
          }
        : { ...previousCamera };
      this.graphBackgroundColor = options.backgroundColor === undefined
        ? previousBackgroundColor
        : this.normalizeCssColor(options.backgroundColor) ?? null;
      this.suppressDomOverlayRender = true;
      this.draw();
      return await this.canvasToPngBlob(exportCanvas);
    } finally {
      this.canvas = previousCanvas;
      this.ctx = previousCtx;
      this.camera = previousCamera;
      this.graphBackgroundColor = previousBackgroundColor;
      this.suppressDomOverlayRender = previousSuppressDomOverlayRender;
      this.safeDraw();
    }
  }

  private canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Could not encode graph image."));
        }
      }, "image/png");
    });
  }

  private getCurrentViewportWorldBounds(): { left: number; top: number; right: number; bottom: number } {
    const zoom = Math.max(0.001, this.camera.zoom);
    return {
      left: -this.camera.x,
      top: -this.camera.y,
      right: (this.canvas.width / zoom) - this.camera.x,
      bottom: (this.canvas.height / zoom) - this.camera.y
    };
  }

  private getExportCanvasSizeForWorldBounds(bounds: { left: number; top: number; right: number; bottom: number }): {
    width: number;
    height: number;
    zoom: number;
  } {
    const worldWidth = Math.max(1, bounds.right - bounds.left);
    const worldHeight = Math.max(1, bounds.bottom - bounds.top);
    const maxDimension = 4096;
    const preferredZoom = Math.min(2, Math.max(0.2, this.camera.zoom || 1));
    const zoom = Math.min(preferredZoom, maxDimension / Math.max(worldWidth, worldHeight));
    return {
      width: Math.max(1, Math.ceil(worldWidth * zoom)),
      height: Math.max(1, Math.ceil(worldHeight * zoom)),
      zoom
    };
  }

  private getRenderableGraphBounds(padding: number): { left: number; top: number; right: number; bottom: number } {
    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    const addBounds = (bounds: { left: number; top: number; right: number; bottom: number }): void => {
      if (![bounds.left, bounds.top, bounds.right, bounds.bottom].every(Number.isFinite)) return;
      left = Math.min(left, bounds.left);
      top = Math.min(top, bounds.top);
      right = Math.max(right, bounds.right);
      bottom = Math.max(bottom, bounds.bottom);
    };

    for (const node of this.nodes) {
      const center = this.getRenderedNodeCenter(node);
      const radius = this.getRenderedNodeRadius(node);
      addBounds({
        left: center.x - radius - 80,
        top: center.y - radius - 20,
        right: center.x + radius + 80,
        bottom: center.y + radius + 34
      });
    }
    for (const container of this.parentContainers.values()) {
      addBounds(this.getRenderedContainerBounds(container));
    }
    for (const container of this.embeddedGraphContainers.values()) {
      addBounds(this.getGraphLensBounds(container));
    }

    if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
      return this.getCurrentViewportWorldBounds();
    }
    return {
      left: left - padding,
      top: top - padding,
      right: right + padding,
      bottom: bottom + padding
    };
  }

  fitToNodes(options?: { padding?: number; maxZoom?: number }): void {
    if (!this.canvas) return;
    if (this.nodes.length === 0) return;

    const padding = Number.isFinite(Number(options?.padding))
      ? Math.max(0, Number(options?.padding))
      : 48;
    const maxZoom = Number.isFinite(Number(options?.maxZoom))
      ? Math.max(0.1, Number(options?.maxZoom))
      : 1.6;

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const node of this.nodes) {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y);
    }

    const worldWidth = Math.max(1, maxX - minX);
    const worldHeight = Math.max(1, maxY - minY);
    const canvasWidth = Math.max(1, this.canvas.width);
    const canvasHeight = Math.max(1, this.canvas.height);
    const zoomX = (canvasWidth - (padding * 2)) / worldWidth;
    const zoomY = (canvasHeight - (padding * 2)) / worldHeight;
    const nextZoom = this.clamp(Math.min(zoomX, zoomY, maxZoom), 0.1, 5);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    this.camera.zoom = nextZoom;
    this.camera.x = (canvasWidth / (2 * nextZoom)) - centerX;
    this.camera.y = (canvasHeight / (2 * nextZoom)) - centerY;
    this.lastEmittedViewport = null;
    this.safeDraw();
    this.emitViewportChanged();
  }

  setLinkTypeMenuSize(size: Partial<LinkTypeMenuSize> | null | undefined): void {
    const next = this.normalizeMenuSize(size);
    this.menuOptions.initialLinkTypeMenuSize = next;
    if (!this.menuPanel) {
      return;
    }
    this.suppressMenuSizeChangedEvents = true;
    setStyle(this.menuPanel, "width", `${next.width}px`);
    setStyle(this.menuPanel, "height", `${next.height}px`);
    window.setTimeout(() => {
      this.suppressMenuSizeChangedEvents = false;
    }, 0);
  }

  setRootNodeRingColor(color: string): void {
    const normalized = String(color ?? "").trim();
    if (!normalized) return;
    this.rootNodeRingColor = normalized;
    this.requestRender();
  }

  setActiveNodeRingColor(color: string): void {
    const normalized = String(color ?? "").trim();
    if (!normalized) return;
    this.activeNodeRingColor = normalized;
    this.requestRender();
  }

  setNearestActiveLinkedNodeIndicator(settings: {
    enabled?: boolean;
    color?: string;
    opacityPercent?: number;
  }): void {
    if (typeof settings.enabled === "boolean") {
      this.nearestActiveLinkedNodeEnabled = settings.enabled;
    }
    const color = String(settings.color ?? "").trim();
    if (color) {
      this.nearestActiveLinkedNodeColor = color;
    }
    const opacity = Number(settings.opacityPercent);
    if (Number.isFinite(opacity)) {
      this.nearestActiveLinkedNodeOpacityPercent = Math.max(0, Math.min(100, Math.round(opacity)));
    }
    this.refreshNearestActiveLinkedNode();
    this.requestRender();
  }

  setShowAllLinkTypeBadgesKey(key: string): void {
    const normalized = this.normalizeKeyboardKey(key);
    if (!normalized) return;
    this.showAllLinkTypeBadgesKey = normalized;
    if (this.showAllLinkTypeBadgesHeld) {
      this.showAllLinkTypeBadgesHeld = false;
      this.badgesDirty = true;
      this.requestRender();
    }
  }

  setFreezeGraphKey(key: string): void {
    const normalized = this.normalizeKeyboardKey(key);
    if (!normalized) return;
    this.freezeGraphKey = normalized;
    if (this.simulationFrozenByHotkey) {
      this.simulationFrozenByHotkey = false;
      this.requestRender();
    }
  }

  setGraphPropertyKeys(keys: Partial<GraphPropertyKeys>): void {
    this.graphPropertyKeys = normalizeGraphPropertyKeys(keys);
    this.requestRender();
  }

  setSubnodeOpacityPercent(percent: number): void {
    this.subnodeOpacity = this.normalizeOpacityPercent(percent, 78) / 100;
    this.requestRender();
  }

  setIconOpacityPercent(percent: number): void {
    this.iconOpacity = this.normalizeOpacityPercent(percent, 100) / 100;
    this.requestRender();
  }

  private normalizeOpacityPercent(percent: unknown, fallback: number): number {
    const parsed = Number(percent);
    return Number.isFinite(parsed) ? this.clamp(parsed, 0, 100) : fallback;
  }

  private normalizeTextFadeThreshold(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? this.clamp(parsed, 0, 100) : 97;
  }

  private normalizeKeyboardKey(key: unknown): string {
    return String(key ?? "").trim().toLowerCase();
  }

  private isEditableKeyboardTarget(target: EventTarget | null): boolean {
    if (!this.isHTMLElement(target)) return false;
    const tagName = target.tagName.toLowerCase();
    return tagName === "input"
      || tagName === "textarea"
      || tagName === "select"
      || target.isContentEditable;
  }

  getLinkTypeMenuSize(): LinkTypeMenuSize {
    if (!this.menuPanel) {
      return this.normalizeMenuSize(this.menuOptions.initialLinkTypeMenuSize);
    }
    const rect = this.menuPanel.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return this.normalizeMenuSize({ width: rect.width, height: rect.height });
    }
    return this.normalizeMenuSize({
      width: Number.parseFloat(this.menuPanel.style.width),
      height: Number.parseFloat(this.menuPanel.style.height)
    });
  }

  getRuntimeNodeSnapshots(): O3GraphRuntimeNodeSnapshot[] {
    return this.nodes.filter((node) => !node.stateOwnerPath).map((node) => {
      const owner = this.getPrimaryNodeOwner(node.id);
      const origin = owner
        ? {
            kind: "expansion" as const,
            sourceNodeId: owner.sourceNodeId,
            linkType: owner.linkType,
            ...(node.id !== node.sourcePath ? { duplicate: true } : {})
          }
        : node.isBase
          ? { kind: "root" as const }
          : { kind: "filter" as const, ...(this.filterFilePaths.has(node.sourcePath) && this.currentFilterId ? { filterId: this.currentFilterId } : {}) };
      return {
        nodeId: node.id,
        path: node.sourcePath,
        x: node.x,
        y: node.y,
        pinned: Boolean(node.isPinned || this.pinnedNodePaths.has(node.id)),
        origin,
        badges: this.getNodeBadgeSnapshot(node.id)
      };
    });
  }

  private getPrimaryNodeOwner(nodeId: string): { sourceNodeId: string; linkType: string } | null {
    const expandedRef = this.nodeMap.get(nodeId)?.expandedVia?.[0];
    if (expandedRef) {
      return {
        sourceNodeId: expandedRef.origin,
        linkType: this.normalizeLinkType(expandedRef.linkType)
      };
    }

    const owners = this.nodeOwners.get(nodeId);
    const ownerKey = owners ? Array.from(owners).sort((a, b) => a.localeCompare(b))[0] : null;
    if (!ownerKey) return null;
    const separator = ownerKey.lastIndexOf("::");
    if (separator <= 0) return null;
    const sourceNodeId = ownerKey.slice(0, separator);
    const linkType = this.normalizeLinkType(ownerKey.slice(separator + 2));
    if (!sourceNodeId || !linkType) return null;
    return { sourceNodeId, linkType };
  }

  private getNodeBadgeSnapshot(nodeId: string): Record<string, "expanded" | "collapsed"> {
    const badges: Record<string, "expanded" | "collapsed"> = {};
    const node = this.nodeMap.get(nodeId);
    const nodeLinkTypes = node ? this.getPersistableBadgeLinkTypesForNode(node) : this.activeNodeBadgeLinkTypes;
    const linkTypes = nodeLinkTypes.length > 0
      ? nodeLinkTypes.map((linkType) => String(linkType.property ?? ""))
      : Array.from(this.availableLinkTypes);
    for (const rawLinkType of linkTypes) {
      const linkType = this.normalizeLinkType(rawLinkType);
      if (!linkType) continue;
      const expanded = this.getLinkTypeSemantic(linkType) === "parent"
        ? this.isParentExpansionActive(nodeId, linkType)
        : this.expandedByBadge.has(this.badgeKey(nodeId, linkType));
      badges[linkType] = expanded
        ? "expanded"
        : "collapsed";
    }
    return badges;
  }

  setLayout(layoutId: string): void {
    const nextId = this.normalizeLayoutId(layoutId);
    const nextOption = this.layoutOptions.find((option) => option.id === nextId && option.enabled !== false);
    if (!nextOption) {
      return;
    }
    if (nextId === this.activeLayoutId) {
      return;
    }

    this.activeLayoutId = nextId;
    if (this.settingsOpen) {
      this.buildSettingsMenu();
    }
    this.menuOptions.onLayoutChange?.(this.activeLayoutId);
  }

  getLayout(): string {
    return this.activeLayoutId;
  }

  getLayoutOptions(): GraphLayoutOption[] {
    return this.layoutOptions.map((option) => ({ ...option }));
  }

  setNodeDragHoldDurationMs(durationMs: number) {
    if (!Number.isFinite(durationMs)) return;
    this.dragHoldDurationMs = Math.max(0, Number(durationMs));
  }

  setHideNodesWithoutSelectedLinkTypes(enabled: boolean) {
    this.hideNodesWithoutSelectedLinkTypes = Boolean(enabled);
    if (this.settingsOpen) {
      this.buildSettingsMenu();
    }
    this.rebuildEdges(this.lastFiles, this.lastLinkTypeSourceFiles);
  }

  private syncSettingControls() {
    const values: GraphSimulationSettings = {
      repulsionStrength: this.repulsionStrength,
      centerStrength: this.centerStrength,
      nodeRadius: this.nodeRadius,
      nodeConnectionSizeMultiplier: this.nodeConnectionSizeMultiplier,
      nearRestVelocityThreshold: this.nearRestVelocityThreshold,
      restVelocityThreshold: this.restVelocityThreshold,
      textFadeThreshold: this.textFadeThreshold
    };

    for (const key of Object.keys(values) as SettingKey[]) {
      const control = this.settingControls[key];
      if (!control) continue;
      const value = values[key];
      control.slider.value = String(value);
      control.valueText.textContent = control.formatter(value);
    }
  }

  private debug(event: string, payload?: Record<string, unknown>) {
    if (!this.debugEnabled) return;
    void event;
    void payload;
  }

  private isHTMLElement(value: unknown): value is HTMLElement {
    if (!value || typeof value !== "object") return false;
    const ownerDocument = "ownerDocument" in value
      ? (value as { ownerDocument?: Document | null }).ownerDocument
      : null;
    const ownerWindow = ownerDocument?.defaultView ?? window;
    return value instanceof ownerWindow.HTMLElement;
  }

  private createElement<K extends keyof HTMLElementTagNameMap>(tagName: K): HTMLElementTagNameMap[K] {
    return createEl(tagName);
  }
}

/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- Re-enable dynamic-data lint rules after this module. */
