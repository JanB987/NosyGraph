// Canvas renderer and interaction layer for graph visualization.

import type { GraphEdge, GraphNode } from "../core/types";
import { debugLog } from "../debug";
import type { GraphLinkDropIntentCore } from "../graph-core/graph-interactions";
import { ForceLayout } from "./ForceLayout";
import { ConnectionPreview } from "../components/ConnectionPreview";

interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

interface PointerState {
  mode: "idle" | "pan" | "drag-node" | "marquee";
  nodeId?: string;
  lastX: number;
  lastY: number;
  startX: number;
  startY: number;
  dragStartWorldX?: number;
  dragStartWorldY?: number;
  originalNodeX?: number;
  originalNodeY?: number;
}

interface PendingBadgePress {
  nodeId: string;
  linkTypeId: string;
  startX: number;
  startY: number;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  anchorX: number;
  anchorY: number;
}

interface HoveredBadgeTarget {
  nodeId: string;
  linkTypeId: string;
  anchorScreenX: number;
  anchorScreenY: number;
  exists: boolean;
}

interface BadgeDragState {
  type: "badge-drag";
  sourceNodeId: string;
  linkTypeId: string;
  pointerScreenX: number;
  pointerScreenY: number;
  anchorWorldX: number;
  anchorWorldY: number;
  hoveredNodeId?: string;
  existingLink: boolean;
}

interface NodeDragState {
  type: "node-drag";
  sourceNodeId: string;
  pointerScreenX: number;
  pointerScreenY: number;
  hoveredBadge?: HoveredBadgeTarget;
  altKey: boolean;
}

type DragState = BadgeDragState | NodeDragState;

interface MarqueeSelectionState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
  originalSelection: Set<string>;
}

export interface GraphViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface NodeLinkBadge {
  linkTypeId: string;
  label: string;
  color: string;
  expanded: boolean;
  hasLinks: boolean;
}

interface FolderGroup {
  id: string;
  linkTypeId: string;
  color: string;
  opacity: number;
  anchorNodeId: string;
  nodeIds: string[];
}

interface FolderAnchorDisplayPosition {
  x: number;
  y: number;
}

export interface BadgeInteraction {
  nodeId: string;
  linkTypeId: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export interface LinkStatusCheck {
  parentNodeId: string;
  childNodeId: string;
  linkTypeId: string;
}

export interface LinkStatusResult {
  exists: boolean;
}

export interface NodeOpenInteraction {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export type GraphLinkDropIntent = GraphLinkDropIntentCore;

interface BadgeHitTarget {
  nodeId: string;
  linkTypeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}

interface BadgeLayoutItem {
  badge: NodeLinkBadge;
  width: number;
}

export class GraphEngine {
  private static readonly DRAG_START_THRESHOLD_PX = 8;
  private static readonly BADGE_SNAP_RADIUS_PX = 40;
  private static readonly NEAR_SETTLE_VELOCITY_THRESHOLD = 0.3;
  private static readonly SETTLE_VELOCITY_THRESHOLD = 0.08;
  private static readonly SETTLE_FRAME_COUNT = 8;
  private static readonly ACTIVE_FRAME_INTERVAL_MS = 1000 / 30;
  private static readonly NEAR_SETTLE_FRAME_INTERVAL_MS = 1000 / 8;

  private canvas?: HTMLCanvasElement;
  private ctx?: CanvasRenderingContext2D;
  private nodes: GraphNode[] = [];
  private nodeById = new Map<string, GraphNode>();
  private edges: GraphEdge[] = [];
  private layout = new ForceLayout();
  private animationFrameId?: number;
  private camera: CameraState = { x: 0, y: 0, zoom: 1 };
  private pointer: PointerState = { mode: "idle", lastX: 0, lastY: 0, startX: 0, startY: 0 };
  private pendingBadgePress?: PendingBadgePress;
  private dragState?: DragState;
  private marqueeSelection?: MarqueeSelectionState;
  private rootNodeIds = new Set<string>();
  private filteredNodeIds = new Set<string>();
  private selectedNodeIds = new Set<string>();
  private folderGroups: FolderGroup[] = [];
  private folderAnchorDisplayPositions = new Map<string, FolderAnchorDisplayPosition>();
  private nodeBadges = new Map<string, NodeLinkBadge[]>();
  private badgeTargets: BadgeHitTarget[] = [];
  private openNodeHandler?: (node: GraphNode, interaction: NodeOpenInteraction) => void | Promise<void>;
  private badgeInteractionHandler?: (interaction: BadgeInteraction) => void | Promise<void>;
  private linkStatusResolver?: (check: LinkStatusCheck) => LinkStatusResult;
  private linkDropHandler?: (intent: GraphLinkDropIntent) => void | Promise<void>;
  private viewportChangeHandler?: (viewport: GraphViewportState) => void;
  private nodeStateChangeHandler?: (nodes: GraphNode[]) => void;
  private connectionPreview?: ConnectionPreview;
  private settledFrameCount = 0;
  private draggedNodeOriginPositions = new Map<string, { x: number; y: number }>();
  private lastAnimationFrameAt = 0;

  initialize(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d") ?? undefined;
    if (canvas.parentElement) {
      this.connectionPreview = new ConnectionPreview(canvas.parentElement);
    }
    this.resizeCanvas();
    canvas.addEventListener("mousedown", this.handleMouseDown);
    canvas.addEventListener("mousemove", this.handleMouseMove);
    canvas.addEventListener("mouseup", this.handleMouseUp);
    canvas.addEventListener("mouseleave", this.handleMouseUp);
    canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    canvas.addEventListener("dblclick", this.handleDoubleClick);
    globalThis.addEventListener("resize", this.handleResize);
    this.requestAnimationLoop();
  }

  destroy(): void {
    if (this.animationFrameId !== undefined) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }
    if (this.canvas) {
      this.canvas.removeEventListener("mousedown", this.handleMouseDown);
      this.canvas.removeEventListener("mousemove", this.handleMouseMove);
      this.canvas.removeEventListener("mouseup", this.handleMouseUp);
      this.canvas.removeEventListener("mouseleave", this.handleMouseUp);
      this.canvas.removeEventListener("wheel", this.handleWheel);
      this.canvas.removeEventListener("dblclick", this.handleDoubleClick);
    }
    globalThis.removeEventListener("resize", this.handleResize);
    this.connectionPreview?.clear();
    this.canvas = undefined;
    this.ctx = undefined;
    this.nodes = [];
    this.edges = [];
    this.badgeTargets = [];
    this.pendingBadgePress = undefined;
    this.dragState = undefined;
    this.marqueeSelection = undefined;
    this.pointer = { mode: "idle", lastX: 0, lastY: 0, startX: 0, startY: 0 };
  }

  setGraph(nodes: GraphNode[], edges: GraphEdge[]): void {
    debugLog("GraphEngine.setGraph() received graph:", {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      sampleNodePaths: nodes.slice(0, 5).map((node) => node.path),
    });

    const previousNodesById = new Map(this.nodes.map((node) => [node.id, node] as const));
    this.nodes = nodes.map((node) => {
      const previousNode = previousNodesById.get(node.id);
      if (!previousNode) {
        return node;
      }

      return {
        ...node,
        x: previousNode.x,
        y: previousNode.y,
        vx: previousNode.vx,
        vy: previousNode.vy,
        pinned: previousNode.pinned,
      };
    });
    this.nodeById = new Map(this.nodes.map((node) => [node.id, node]));
    this.edges = edges;
    this.selectedNodeIds = new Set(
      [...this.selectedNodeIds].filter((nodeId) => this.nodes.some((node) => node.id === nodeId)),
    );
    this.layout.initialize(this.nodes, this.canvas?.width, this.canvas?.height);
    this.settledFrameCount = 0;
    debugLog("GraphEngine.setGraph() initialized layout:", {
      nodeCount: this.nodes.length,
      edgeCount: this.edges.length,
    });
    this.requestAnimationLoop();
  }

  setRootNodes(rootNodeIds: string[]): void {
    this.rootNodeIds = new Set(rootNodeIds);
  }

  setFilteredNodes(filteredNodeIds: string[]): void {
    this.filteredNodeIds = new Set(filteredNodeIds);
  }

  setFolderGroups(folderGroups: FolderGroup[]): void {
    this.folderGroups = folderGroups.map((group) => ({
      ...group,
      nodeIds: [...group.nodeIds],
    }));
    this.render();
  }

  setOpenNodeHandler(handler: (node: GraphNode, interaction: NodeOpenInteraction) => void | Promise<void>): void {
    this.openNodeHandler = handler;
  }

  setBadgeInteractionHandler(handler: (interaction: BadgeInteraction) => void | Promise<void>): void {
    this.badgeInteractionHandler = handler;
  }

  setLinkStatusResolver(handler: (check: LinkStatusCheck) => LinkStatusResult): void {
    this.linkStatusResolver = handler;
  }

  setLinkDropHandler(handler: (intent: GraphLinkDropIntent) => void | Promise<void>): void {
    this.linkDropHandler = handler;
  }

  setNodeBadges(badgesByNode: Record<string, NodeLinkBadge[]>): void {
    this.nodeBadges = new Map(Object.entries(badgesByNode));
    this.render();
  }

  setViewport(viewport: GraphViewportState): void {
    this.camera = { ...viewport };
    this.render();
  }

  getViewport(): GraphViewportState {
    return { ...this.camera };
  }

  setViewportChangeHandler(handler: (viewport: GraphViewportState) => void): void {
    this.viewportChangeHandler = handler;
  }

  setNodeStateChangeHandler(handler: (nodes: GraphNode[]) => void): void {
    this.nodeStateChangeHandler = handler;
  }

  setCentralGravity(value: number): void {
    this.layout.setCenteringStrength(value);
  }

  getCentralGravity(): number {
    return this.layout.getCenteringStrength();
  }

  setRepulsionForce(value: number): void {
    this.layout.setRepulsionStrength(value);
  }

  getRepulsionForce(): number {
    return this.layout.getRepulsionStrength();
  }

  setVelocitySnapThreshold(value: number): void {
    this.layout.setVelocitySnapThreshold(value);
  }

  getVelocitySnapThreshold(): number {
    return this.layout.getVelocitySnapThreshold();
  }

  fitToGraph(): void {
    if (!this.canvas || this.nodes.length === 0) {
      return;
    }

    const margin = 48;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const node of this.nodes) {
      const radius = this.getNodeRadius(node);
      minX = Math.min(minX, node.x - radius);
      minY = Math.min(minY, node.y - radius);
      maxX = Math.max(maxX, node.x + radius);
      maxY = Math.max(maxY, node.y + radius);
    }

    const boundsWidth = Math.max(maxX - minX, 40);
    const boundsHeight = Math.max(maxY - minY, 40);
    const availableWidth = Math.max(this.canvas.width - margin * 2, 1);
    const availableHeight = Math.max(this.canvas.height - margin * 2, 1);
    const zoom = this.clamp(
      Math.min(availableWidth / boundsWidth, availableHeight / boundsHeight),
      0.2,
      4,
    );
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    this.camera.zoom = zoom;
    this.camera.x = this.canvas.width / 2 - centerX * zoom;
    this.camera.y = this.canvas.height / 2 - centerY * zoom;
    this.emitViewportChange();
    this.render();
  }

  render(): void {
    if (!this.canvas || !this.ctx) {
      return;
    }

    this.resizeCanvas();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    this.ctx.translate(this.camera.x, this.camera.y);
    this.ctx.scale(this.camera.zoom, this.camera.zoom);
    this.ctx.lineWidth = 1 / this.camera.zoom;
    this.badgeTargets = [];
    this.folderAnchorDisplayPositions.clear();

    this.renderFolderGroups();

    for (const edge of this.edges) {
      if (edge.renderStyle === "folder") {
        continue;
      }
      const from = this.findNode(edge.source);
      const to = this.findNode(edge.target);
      if (!from || !to) {
        continue;
      }
      const fromPosition = this.getDisplayedNodePosition(from);
      const toPosition = this.getDisplayedNodePosition(to);

      this.ctx.strokeStyle = this.withAlpha(edge.color ?? "#73808c", edge.opacity ?? 1);
      this.ctx.lineWidth = (edge.lineThickness ?? 1) / this.camera.zoom;
      this.ctx.beginPath();
      this.ctx.moveTo(fromPosition.x, fromPosition.y);
      this.ctx.lineTo(toPosition.x, toPosition.y);
      this.ctx.stroke();
    }
    this.ctx.lineWidth = 1 / this.camera.zoom;

    this.ctx.font = `${12 / this.camera.zoom}px monospace`;
    this.ctx.textBaseline = "middle";
    for (const node of this.nodes) {
      const radius = this.getNodeRadius(node);
      this.renderNode(node, radius);

      const label = node.name.replace(/\.md$/i, "") || node.path.split("/").pop()?.replace(/\.md$/i, "") || node.id;
      this.renderNodeBadges(node, radius);
      this.renderNodeLabel(node, radius, label);
    }

    this.ctx.restore();
    this.renderMarqueeSelection();
  }

  private requestAnimationLoop(): void {
    if (this.animationFrameId !== undefined) {
      return;
    }
    const tick = (timestamp: number): void => {
      const targetFrameIntervalMs = this.getTargetFrameIntervalMs();
      if (timestamp - this.lastAnimationFrameAt < targetFrameIntervalMs) {
        this.animationFrameId = requestAnimationFrame(tick);
        return;
      }
      this.lastAnimationFrameAt = timestamp;
      const maxVelocity = this.layout.step(this.nodes, this.edges);
      this.render();
      const shouldContinue = this.shouldContinueAnimating(maxVelocity);
      if (!shouldContinue) {
        this.animationFrameId = undefined;
        return;
      }
      this.animationFrameId = requestAnimationFrame(tick);
    };

    this.animationFrameId = requestAnimationFrame(tick);
  }

  private getTargetFrameIntervalMs(): number {
    if (this.isInteractionActive()) {
      return GraphEngine.ACTIVE_FRAME_INTERVAL_MS;
    }
    return this.settledFrameCount > 0
      ? GraphEngine.NEAR_SETTLE_FRAME_INTERVAL_MS
      : GraphEngine.ACTIVE_FRAME_INTERVAL_MS;
  }

  private shouldContinueAnimating(maxVelocity: number): boolean {
    if (this.isInteractionActive()) {
      this.settledFrameCount = 0;
      return true;
    }
    if (maxVelocity > GraphEngine.SETTLE_VELOCITY_THRESHOLD) {
      this.settledFrameCount = 0;
      return true;
    }
    this.settledFrameCount += 1;
    return this.settledFrameCount < GraphEngine.SETTLE_FRAME_COUNT;
  }

  private isInteractionActive(): boolean {
    return this.pointer.mode !== "idle" || Boolean(this.pendingBadgePress) || Boolean(this.dragState);
  }

  private readonly handleMouseDown = (event: MouseEvent): void => {
    if (!this.canvas) {
      return;
    }

    const screenPoint = this.getCanvasPoint(event);
    const worldPoint = this.screenToWorld(screenPoint.x, screenPoint.y);
    const hitBadge = this.findBadgeAt(worldPoint.x, worldPoint.y);

    this.pointer.lastX = screenPoint.x;
    this.pointer.lastY = screenPoint.y;
    this.pointer.startX = screenPoint.x;
    this.pointer.startY = screenPoint.y;

    if (hitBadge) {
      this.pendingBadgePress = {
        nodeId: hitBadge.nodeId,
        linkTypeId: hitBadge.linkTypeId,
        startX: screenPoint.x,
        startY: screenPoint.y,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        anchorX: hitBadge.anchorX,
        anchorY: hitBadge.anchorY,
      };
      this.requestAnimationLoop();
      return;
    }

    const hitNode = this.findNodeAt(worldPoint.x, worldPoint.y);
    if (hitNode) {
      if (event.shiftKey) {
        this.toggleNodeSelection(hitNode.id);
        this.render();
        return;
      }
      if (!this.selectedNodeIds.has(hitNode.id)) {
        this.selectedNodeIds = new Set([hitNode.id]);
        this.render();
      }
      this.pointer.mode = "drag-node";
      this.pointer.nodeId = hitNode.id;
      this.pointer.dragStartWorldX = worldPoint.x;
      this.pointer.dragStartWorldY = worldPoint.y;
      this.pointer.originalNodeX = hitNode.x;
      this.pointer.originalNodeY = hitNode.y;
      this.draggedNodeOriginPositions = new Map(
        [...this.selectedNodeIds]
          .map((nodeId) => {
            const node = this.findNode(nodeId);
            return node ? [nodeId, { x: node.x, y: node.y }] as const : undefined;
          })
          .filter((entry): entry is readonly [string, { x: number; y: number }] => Boolean(entry)),
      );
      this.updateNodeDragSuspension(event.altKey);
      this.requestAnimationLoop();
      return;
    }

    if (event.altKey) {
      this.layout.setSuspendedNodeIds([]);
      this.pointer.mode = "marquee";
      this.pointer.nodeId = undefined;
      this.pointer.dragStartWorldX = undefined;
      this.pointer.dragStartWorldY = undefined;
      this.pointer.originalNodeX = undefined;
      this.pointer.originalNodeY = undefined;
      this.marqueeSelection = {
        startX: screenPoint.x,
        startY: screenPoint.y,
        currentX: screenPoint.x,
        currentY: screenPoint.y,
        additive: event.shiftKey,
        originalSelection: new Set(this.selectedNodeIds),
      };
      if (!event.shiftKey && this.selectedNodeIds.size > 0) {
        this.selectedNodeIds.clear();
      }
      this.render();
      return;
    }

    if (this.selectedNodeIds.size > 0) {
      this.selectedNodeIds.clear();
      this.render();
    }
    this.layout.setSuspendedNodeIds([]);
    this.pointer.mode = "pan";
    this.pointer.nodeId = undefined;
    this.pointer.dragStartWorldX = undefined;
    this.pointer.dragStartWorldY = undefined;
    this.pointer.originalNodeX = undefined;
    this.pointer.originalNodeY = undefined;
    this.requestAnimationLoop();
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.canvas) {
      return;
    }

    const screenPoint = this.getCanvasPoint(event);
    const worldPoint = this.screenToWorld(screenPoint.x, screenPoint.y);

    if (this.pendingBadgePress) {
      if (
        this.getDragDistance(
          screenPoint.x,
          screenPoint.y,
          this.pendingBadgePress.startX,
          this.pendingBadgePress.startY,
        ) >= GraphEngine.DRAG_START_THRESHOLD_PX
      ) {
        this.dragState = {
          type: "badge-drag",
          sourceNodeId: this.pendingBadgePress.nodeId,
          linkTypeId: this.pendingBadgePress.linkTypeId,
          pointerScreenX: screenPoint.x,
          pointerScreenY: screenPoint.y,
          anchorWorldX: this.pendingBadgePress.anchorX,
          anchorWorldY: this.pendingBadgePress.anchorY,
          hoveredNodeId: undefined,
          existingLink: false,
        };
        this.pendingBadgePress = undefined;
      } else {
        return;
      }
    }

    if (this.dragState?.type === "badge-drag") {
      this.dragState.pointerScreenX = screenPoint.x;
      this.dragState.pointerScreenY = screenPoint.y;

      const hoveredNode = this.findNodeAt(worldPoint.x, worldPoint.y);
      if (hoveredNode && hoveredNode.id !== this.dragState.sourceNodeId) {
        this.dragState.hoveredNodeId = hoveredNode.id;
        this.dragState.existingLink = this.resolveLinkStatus({
          parentNodeId: this.dragState.sourceNodeId,
          childNodeId: hoveredNode.id,
          linkTypeId: this.dragState.linkTypeId,
        }).exists;
      } else {
        this.dragState.hoveredNodeId = undefined;
        this.dragState.existingLink = false;
      }

      this.renderDragOverlay();
      this.requestAnimationLoop();
      return;
    }

    if (this.pointer.mode === "idle") {
      return;
    }

    if (this.pointer.mode === "marquee" && this.marqueeSelection) {
      this.marqueeSelection.currentX = screenPoint.x;
      this.marqueeSelection.currentY = screenPoint.y;
      this.updateMarqueeSelection();
      this.render();
      return;
    }

    const deltaX = screenPoint.x - this.pointer.lastX;
    const deltaY = screenPoint.y - this.pointer.lastY;
    this.pointer.lastX = screenPoint.x;
    this.pointer.lastY = screenPoint.y;

    if (this.pointer.mode === "pan") {
      this.camera.x += deltaX;
      this.camera.y += deltaY;
      this.emitViewportChange();
      this.render();
      return;
    }

    if (this.pointer.mode === "drag-node" && this.pointer.nodeId) {
      const node = this.findNode(this.pointer.nodeId);
      if (!node) {
        return;
      }
      this.updateNodeDragSuspension(event.altKey);

      const hasExceededThreshold =
        this.getDragDistance(screenPoint.x, screenPoint.y, this.pointer.startX, this.pointer.startY) >=
        GraphEngine.DRAG_START_THRESHOLD_PX;

      const dragStartWorldX = this.pointer.dragStartWorldX ?? worldPoint.x;
      const dragStartWorldY = this.pointer.dragStartWorldY ?? worldPoint.y;
      const deltaWorldX = worldPoint.x - dragStartWorldX;
      const deltaWorldY = worldPoint.y - dragStartWorldY;

      for (const [nodeId, origin] of this.draggedNodeOriginPositions.entries()) {
        const draggedNode = this.findNode(nodeId);
        if (!draggedNode) {
          continue;
        }
        draggedNode.x = origin.x + deltaWorldX;
        draggedNode.y = origin.y + deltaWorldY;
        draggedNode.vx = 0;
        draggedNode.vy = 0;
      }

      if (hasExceededThreshold) {
        const hoveredBadge = this.findClosestBadgeDropTarget(
          screenPoint.x,
          screenPoint.y,
          this.pointer.nodeId,
        );
        this.dragState = {
          type: "node-drag",
          sourceNodeId: this.pointer.nodeId,
          pointerScreenX: screenPoint.x,
          pointerScreenY: screenPoint.y,
          hoveredBadge,
          altKey: event.altKey,
        };
        this.renderDragOverlay();
        this.requestAnimationLoop();
      }
      this.render();
    }
  };

  private readonly handleMouseUp = (_event?: MouseEvent): void => {
    if (this.pendingBadgePress) {
      void this.badgeInteractionHandler?.({
        nodeId: this.pendingBadgePress.nodeId,
        linkTypeId: this.pendingBadgePress.linkTypeId,
        ctrlKey: this.pendingBadgePress.ctrlKey,
        metaKey: this.pendingBadgePress.metaKey,
        altKey: this.pendingBadgePress.altKey,
        shiftKey: this.pendingBadgePress.shiftKey,
      });
      this.pendingBadgePress = undefined;
      this.clearDragState();
      this.resetPointer();
      this.requestAnimationLoop();
      return;
    }

    if (this.dragState?.type === "badge-drag") {
      const dragState = this.dragState;
      if (dragState.hoveredNodeId && !dragState.existingLink) {
        void this.linkDropHandler?.({
          action: "add_or_create_link",
          parentNodeId: dragState.sourceNodeId,
          childNodeId: dragState.hoveredNodeId,
          linkTypeId: dragState.linkTypeId,
        });
      }

      this.clearDragState();
      this.resetPointer();
      this.requestAnimationLoop();
      return;
    }

    if (this.pointer.mode === "marquee") {
      this.marqueeSelection = undefined;
      this.clearDragState();
      this.resetPointer();
      this.render();
      return;
    }

    if (this.pointer.mode === "drag-node" && this.pointer.nodeId) {
      const node = this.findNode(this.pointer.nodeId);
      if (!node) {
        this.layout.setSuspendedNodeIds([]);
        this.resetPointer();
        return;
      }

      if (this.dragState?.type === "node-drag") {
        const dragState = this.dragState;
        const hoveredBadge = dragState.hoveredBadge;

        if (hoveredBadge) {
          const shouldRemove = dragState.altKey && hoveredBadge.exists;
          const shouldAdd = !dragState.altKey && !hoveredBadge.exists;
          if (shouldRemove || shouldAdd) {
            void this.linkDropHandler?.({
              action: shouldRemove ? "remove_link" : "add_or_create_link",
              parentNodeId: hoveredBadge.nodeId,
              childNodeId: dragState.sourceNodeId,
              linkTypeId: hoveredBadge.linkTypeId,
            });
          }

          for (const [nodeId, origin] of this.draggedNodeOriginPositions.entries()) {
            const draggedNode = this.findNode(nodeId);
            if (!draggedNode) {
              continue;
            }
            draggedNode.x = origin.x;
            draggedNode.y = origin.y;
            draggedNode.vx = 0;
            draggedNode.vy = 0;
          }
        } else if (dragState.altKey) {
          node.pinned = !node.pinned;
        }

        this.emitNodeStateChange();
        this.clearDragState();
        this.resetPointer();
        return;
      }

      this.emitNodeStateChange();
    }

    this.clearDragState();
    this.layout.setSuspendedNodeIds([]);
    this.resetPointer();
    this.requestAnimationLoop();
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();

    const screenPoint = this.getCanvasPoint(event);
    const worldBeforeZoom = this.screenToWorld(screenPoint.x, screenPoint.y);
    const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
    const nextZoom = this.clamp(this.camera.zoom * zoomFactor, 0.2, 4);
    this.camera.zoom = nextZoom;
    this.camera.x = screenPoint.x - worldBeforeZoom.x * this.camera.zoom;
    this.camera.y = screenPoint.y - worldBeforeZoom.y * this.camera.zoom;
    this.emitViewportChange();
    this.render();
  };

  private readonly handleDoubleClick = (event: MouseEvent): void => {
    const screenPoint = this.getCanvasPoint(event);
    const worldPoint = this.screenToWorld(screenPoint.x, screenPoint.y);
    const hitNode = this.findNodeAt(worldPoint.x, worldPoint.y);
    if (!hitNode || !this.openNodeHandler) {
      return;
    }

    void this.openNodeHandler(hitNode, {
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
    });
  };

  private readonly handleResize = (): void => {
    this.resizeCanvas();
    this.render();
  };

  private renderNode(node: GraphNode, radius: number): void {
    if (!this.ctx) {
      return;
    }
    const position = this.getDisplayedNodePosition(node);

    const isRoot = this.rootNodeIds.has(node.id);
    const isFiltered = this.filteredNodeIds.has(node.id);
    const isSelected = this.selectedNodeIds.has(node.id);
    const fillColor = node.color ?? (node.pinned
      ? "#f5c451"
      : isRoot && isFiltered
        ? "#b8f0d2"
        : isRoot
          ? "#e9f1ff"
          : isFiltered
            ? "#dff4ff"
            : "#e1e8f3");
    this.ctx.fillStyle = fillColor;
    this.ctx.beginPath();
    this.ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
    this.ctx.fill();

    if (isSelected) {
      this.ctx.lineWidth = 3 / this.camera.zoom;
      this.ctx.strokeStyle = "#ffd66b";
      this.ctx.beginPath();
      this.ctx.arc(position.x, position.y, radius + 3 / this.camera.zoom, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.lineWidth = 1 / this.camera.zoom;
    }

    if (isRoot || isFiltered) {
      this.ctx.lineWidth = 2 / this.camera.zoom;
      this.ctx.strokeStyle = isRoot && isFiltered
        ? "#47a86d"
        : isRoot
          ? "#7aa2ff"
          : "#57b6d9";
      this.ctx.beginPath();
      this.ctx.arc(position.x, position.y, radius + 1.5 / this.camera.zoom, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.lineWidth = 1 / this.camera.zoom;
    }

    if (this.dragState?.type === "badge-drag" && this.dragState.hoveredNodeId === node.id) {
      this.ctx.strokeStyle = this.dragState.existingLink ? "#d96c6c" : "#7aa2ff";
      this.ctx.lineWidth = 2 / this.camera.zoom;
      this.ctx.beginPath();
      this.ctx.arc(position.x, position.y, radius + 4 / this.camera.zoom, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.lineWidth = 1 / this.camera.zoom;
    }
  }

  private renderFolderGroups(): void {
    if (!this.ctx || this.folderGroups.length === 0) {
      return;
    }

    for (const group of this.folderGroups) {
      const allNodes = group.nodeIds
        .map((nodeId) => this.findNode(nodeId))
        .filter((node): node is GraphNode => Boolean(node));
      if (allNodes.length < 2) {
        continue;
      }
      const anchorNode = this.findNode(group.anchorNodeId);
      const childNodes = allNodes.filter((node) => node.id !== group.anchorNodeId);
      const nodes = childNodes.length > 0 ? childNodes : allNodes;

      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const node of nodes) {
        const radius = this.getNodeRadius(node);
        minX = Math.min(minX, node.x - radius);
        minY = Math.min(minY, node.y - radius);
        maxX = Math.max(maxX, node.x + radius);
        maxY = Math.max(maxY, node.y + radius);
      }

      const padding = 22 / this.camera.zoom;
      const width = maxX - minX + padding * 2;
      const height = maxY - minY + padding * 2;
      const x = minX - padding;
      const y = minY - padding;

      this.ctx.fillStyle = this.withAlpha(group.color, Math.min(group.opacity * 0.12, 0.18));
      this.ctx.strokeStyle = this.withAlpha(group.color, Math.min(group.opacity * 0.55, 0.7));
      this.ctx.lineWidth = 2 / this.camera.zoom;
      this.roundRectPath(x, y, width, height, 18 / this.camera.zoom);
      this.ctx.fill();
      this.ctx.stroke();

      if (anchorNode) {
        const anchorPoint = this.getNearestPointOnRect(anchorNode.x, anchorNode.y, x, y, width, height);
        this.folderAnchorDisplayPositions.set(anchorNode.id, anchorPoint);
      }
      this.ctx.lineWidth = 1 / this.camera.zoom;
    }
  }

  private getNearestPointOnRect(
    pointX: number,
    pointY: number,
    rectX: number,
    rectY: number,
    rectWidth: number,
    rectHeight: number,
  ): { x: number; y: number } {
    const clampedX = this.clamp(pointX, rectX, rectX + rectWidth);
    const clampedY = this.clamp(pointY, rectY, rectY + rectHeight);
    const distances = [
      { edge: "left", distance: Math.abs(pointX - rectX), x: rectX, y: clampedY },
      { edge: "right", distance: Math.abs(pointX - (rectX + rectWidth)), x: rectX + rectWidth, y: clampedY },
      { edge: "top", distance: Math.abs(pointY - rectY), x: clampedX, y: rectY },
      { edge: "bottom", distance: Math.abs(pointY - (rectY + rectHeight)), x: clampedX, y: rectY + rectHeight },
    ];
    distances.sort((left, right) => left.distance - right.distance);
    return { x: distances[0].x, y: distances[0].y };
  }

  private renderNodeBadges(node: GraphNode, radius: number): void {
    if (!this.ctx) {
      return;
    }

    const isNodeDropActive = this.pointer.mode === "drag-node" && Boolean(this.pointer.nodeId);
    if (!this.selectedNodeIds.has(node.id) && !isNodeDropActive) {
      return;
    }

    const badges = this.nodeBadges.get(node.id) ?? [];
    if (badges.length === 0) {
      return;
    }

    const badgeHeight = 18 / this.camera.zoom;
    const gap = 4 / this.camera.zoom;
    const labelHeight = 18 / this.camera.zoom;
    const badgeItems: BadgeLayoutItem[] = badges.map((badge) => {
      const text = `${badge.expanded ? "-" : "+"} ${badge.label}`;
      return {
        badge,
        width: Math.max((text.length * 7 + 14) / this.camera.zoom, 40 / this.camera.zoom),
      };
    });
    const rowLimit = Math.max(radius * 6, 110 / this.camera.zoom);
    const rows: BadgeLayoutItem[][] = [];
    let currentRow: BadgeLayoutItem[] = [];
    let currentWidth = 0;

    for (const item of badgeItems) {
      const nextWidth = currentRow.length === 0 ? item.width : currentWidth + gap + item.width;
      if (currentRow.length > 0 && nextWidth > rowLimit) {
        rows.push(currentRow);
        currentRow = [item];
        currentWidth = item.width;
      } else {
        currentRow.push(item);
        currentWidth = nextWidth;
      }
    }
    if (currentRow.length > 0) {
      rows.push(currentRow);
    }

    const totalHeight = rows.length * badgeHeight + Math.max(rows.length - 1, 0) * gap;
    const position = this.getDisplayedNodePosition(node);
    let currentY = position.y - radius - labelHeight - totalHeight - 8 / this.camera.zoom;

    for (const row of rows) {
      const rowWidth = row.reduce((sum, item, index) => sum + item.width + (index > 0 ? gap : 0), 0);
      let currentX = position.x - rowWidth / 2;
      for (const item of row) {
        const text = `${item.badge.expanded ? "-" : "+"} ${item.badge.label}`;
        const x = currentX;
        const y = currentY;
        const anchorX = x + item.width / 2;
        const anchorY = y + badgeHeight / 2;
        const badgeTone = this.getBadgeTone(node.id, item.badge.linkTypeId);
        const fillAlpha = badgeTone === "highlight"
          ? 0.24
          : badgeTone === "remove"
            ? 0.2
            : item.badge.hasLinks ? 0.2 : 0.09;
        const strokeColor = badgeTone === "highlight"
          ? "#7aa2ff"
          : badgeTone === "remove"
            ? "#d96c6c"
            : item.badge.hasLinks
              ? item.badge.color
              : this.withAlpha(item.badge.color, 0.38);
        const textColor = badgeTone === "remove"
          ? "#ffd1d1"
          : badgeTone === "highlight"
            ? "#edf4ff"
            : item.badge.hasLinks ? "#d8e5f6" : "#97a7b8";

        this.ctx.fillStyle = badgeTone === "remove"
          ? "rgba(217, 108, 108, 0.14)"
          : this.withAlpha(item.badge.color, fillAlpha);
        this.ctx.strokeStyle = strokeColor;
        this.roundRectPath(x, y, item.width, badgeHeight, 9 / this.camera.zoom);
        this.ctx.fill();
        this.ctx.stroke();

        this.ctx.fillStyle = textColor;
        this.ctx.fillText(text, x + 7 / this.camera.zoom, y + badgeHeight / 2);

        this.badgeTargets.push({
          nodeId: node.id,
          linkTypeId: item.badge.linkTypeId,
          x,
          y,
          width: item.width,
          height: badgeHeight,
          anchorX,
          anchorY,
        });

        currentX += item.width + gap;
      }
      currentY += badgeHeight + gap;
    }
  }

  private renderNodeLabel(node: GraphNode, radius: number, label: string): void {
    if (!this.ctx) {
      return;
    }
    const position = this.getDisplayedNodePosition(node);
    const isSelected = this.selectedNodeIds.has(node.id);

    const y = position.y + radius + 14 / this.camera.zoom;
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = isSelected ? "#fff4cf" : "#d8e5f6";
    this.ctx.fillText(label, position.x, y);
    this.ctx.textAlign = "left";
  }

  private renderDragOverlay(): void {
    if (!this.connectionPreview || !this.dragState) {
      return;
    }

    if (this.dragState.type === "badge-drag") {
      const anchorScreen = this.worldToScreen(this.dragState.anchorWorldX, this.dragState.anchorWorldY);
      const color = this.dragState.existingLink ? "#d96c6c" : "#7aa2ff";
      this.connectionPreview.showLine({
        startX: anchorScreen.x,
        startY: anchorScreen.y,
        endX: this.dragState.pointerScreenX,
        endY: this.dragState.pointerScreenY,
        color,
        dashed: !this.dragState.hoveredNodeId,
      });

      if (this.dragState.hoveredNodeId && this.dragState.existingLink) {
        this.connectionPreview.showTooltip({
          text: "Already linked - Press ALT to remove",
          x: this.dragState.pointerScreenX,
          y: this.dragState.pointerScreenY,
          tone: "default",
        });
        return;
      }

      this.connectionPreview.hideTooltip();
      return;
    }

    const draggedNode = this.findNode(this.dragState.sourceNodeId);
    if (!draggedNode) {
      this.connectionPreview.clear();
      return;
    }

    const draggedNodePosition = this.getDisplayedNodePosition(draggedNode);
    const nodeScreen = this.worldToScreen(draggedNodePosition.x, draggedNodePosition.y);
    const endX = this.dragState.hoveredBadge?.anchorScreenX ?? this.dragState.pointerScreenX;
    const endY = this.dragState.hoveredBadge?.anchorScreenY ?? this.dragState.pointerScreenY;
    const color = this.dragState.altKey ? "#d96c6c" : "#7aa2ff";
    this.connectionPreview.showLine({
      startX: nodeScreen.x,
      startY: nodeScreen.y,
      endX,
      endY,
      color,
      dashed: !this.dragState.hoveredBadge,
    });

    if (!this.dragState.hoveredBadge) {
      this.connectionPreview.hideTooltip();
      return;
    }

    const hoveredBadge = this.dragState.hoveredBadge;
    if (hoveredBadge.exists && !this.dragState.altKey) {
      this.connectionPreview.showTooltip({
        text: "Already linked - Press ALT to remove",
        x: this.dragState.pointerScreenX,
        y: this.dragState.pointerScreenY,
        tone: "default",
      });
      return;
    }

    if (hoveredBadge.exists && this.dragState.altKey) {
      this.connectionPreview.showTooltip({
        text: "Remove link",
        x: this.dragState.pointerScreenX,
        y: this.dragState.pointerScreenY,
        tone: "remove",
      });
      return;
    }

    this.connectionPreview.showTooltip({
      text: "Create link",
      x: this.dragState.pointerScreenX,
      y: this.dragState.pointerScreenY,
      tone: "highlight",
    });
  }

  private renderMarqueeSelection(): void {
    if (!this.ctx || !this.canvas || !this.marqueeSelection) {
      return;
    }

    const { left, top, width, height } = this.getMarqueeRect();
    this.ctx.save();
    this.ctx.fillStyle = "rgba(122, 162, 255, 0.12)";
    this.ctx.strokeStyle = "rgba(122, 162, 255, 0.9)";
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([6, 4]);
    this.ctx.fillRect(left, top, width, height);
    this.ctx.strokeRect(left, top, width, height);
    this.ctx.restore();
  }

  private getMarqueeRect(): { left: number; top: number; width: number; height: number } {
    if (!this.marqueeSelection) {
      return { left: 0, top: 0, width: 0, height: 0 };
    }
    const left = Math.min(this.marqueeSelection.startX, this.marqueeSelection.currentX);
    const top = Math.min(this.marqueeSelection.startY, this.marqueeSelection.currentY);
    const width = Math.abs(this.marqueeSelection.currentX - this.marqueeSelection.startX);
    const height = Math.abs(this.marqueeSelection.currentY - this.marqueeSelection.startY);
    return { left, top, width, height };
  }

  private updateMarqueeSelection(): void {
    if (!this.marqueeSelection) {
      return;
    }

    const nextSelection = new Set(this.marqueeSelection.additive ? this.marqueeSelection.originalSelection : []);
    const { left, top, width, height } = this.getMarqueeRect();
    const right = left + width;
    const bottom = top + height;

    for (const node of this.nodes) {
      const position = this.getDisplayedNodePosition(node);
      const screen = this.worldToScreen(position.x, position.y);
      if (screen.x >= left && screen.x <= right && screen.y >= top && screen.y <= bottom) {
        nextSelection.add(node.id);
      }
    }

    this.selectedNodeIds = nextSelection;
  }

  private toggleNodeSelection(nodeId: string): void {
    const nextSelection = new Set(this.selectedNodeIds);
    if (nextSelection.has(nodeId)) {
      nextSelection.delete(nodeId);
    } else {
      nextSelection.add(nodeId);
    }
    this.selectedNodeIds = nextSelection;
  }

  private getBadgeTone(nodeId: string, linkTypeId: string): "default" | "highlight" | "remove" {
    if (this.dragState?.type === "node-drag" && this.dragState.hoveredBadge) {
      if (
        this.dragState.hoveredBadge.nodeId === nodeId &&
        this.dragState.hoveredBadge.linkTypeId === linkTypeId
      ) {
        return this.dragState.altKey ? "remove" : "highlight";
      }
    }

    return "default";
  }

  private findClosestBadgeDropTarget(
    screenX: number,
    screenY: number,
    excludeNodeId?: string,
  ): HoveredBadgeTarget | undefined {
    let closestTarget: HoveredBadgeTarget | undefined;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const badgeTarget of this.badgeTargets) {
      if (excludeNodeId && badgeTarget.nodeId === excludeNodeId) {
        continue;
      }

      const anchorScreen = this.worldToScreen(badgeTarget.anchorX, badgeTarget.anchorY);
      const distance = this.getDragDistance(screenX, screenY, anchorScreen.x, anchorScreen.y);
      if (distance > GraphEngine.BADGE_SNAP_RADIUS_PX || distance >= closestDistance) {
        continue;
      }

      closestDistance = distance;
      closestTarget = {
        nodeId: badgeTarget.nodeId,
        linkTypeId: badgeTarget.linkTypeId,
        anchorScreenX: anchorScreen.x,
        anchorScreenY: anchorScreen.y,
        exists: this.resolveLinkStatus({
          parentNodeId: badgeTarget.nodeId,
          childNodeId: excludeNodeId ?? "",
          linkTypeId: badgeTarget.linkTypeId,
        }).exists,
      };
    }

    return closestTarget;
  }

  private resolveLinkStatus(check: LinkStatusCheck): LinkStatusResult {
    return this.linkStatusResolver?.(check) ?? { exists: false };
  }

  private clearDragState(): void {
    this.dragState = undefined;
    this.marqueeSelection = undefined;
    this.draggedNodeOriginPositions.clear();
    this.connectionPreview?.clear();
  }

  private updateNodeDragSuspension(altKey: boolean): void {
    if (this.pointer.mode !== "drag-node" || !this.pointer.nodeId || this.draggedNodeOriginPositions.size === 0) {
      this.layout.setSuspendedNodeIds([]);
      return;
    }

    if (altKey) {
      this.layout.setSuspendedNodeIds(this.nodes.map((node) => node.id));
      return;
    }

    this.layout.setSuspendedNodeIds([...this.draggedNodeOriginPositions.keys()]);
  }

  private resetPointer(): void {
    this.layout.setSuspendedNodeIds([]);
    this.pointer = { mode: "idle", lastX: 0, lastY: 0, startX: 0, startY: 0 };
    this.pendingBadgePress = undefined;
  }

  private resizeCanvas(): void {
    if (!this.canvas) {
      return;
    }

    const width = this.canvas.clientWidth || globalThis.innerWidth || 800;
    const height = this.canvas.clientHeight || globalThis.innerHeight || 600;

    if (this.canvas.width !== width) {
      this.canvas.width = width;
    }
    if (this.canvas.height !== height) {
      this.canvas.height = height;
    }
  }

  private getCanvasPoint(event: MouseEvent | WheelEvent): { x: number; y: number } {
    if (!this.canvas) {
      return { x: 0, y: 0 };
    }

    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  private screenToWorld(x: number, y: number): { x: number; y: number } {
    return {
      x: (x - this.camera.x) / this.camera.zoom,
      y: (y - this.camera.y) / this.camera.zoom,
    };
  }

  private worldToScreen(x: number, y: number): { x: number; y: number } {
    return {
      x: x * this.camera.zoom + this.camera.x,
      y: y * this.camera.zoom + this.camera.y,
    };
  }

  private findNode(nodeId: string): GraphNode | undefined {
    return this.nodeById.get(nodeId);
  }

  private findBadgeAt(x: number, y: number): BadgeHitTarget | undefined {
    for (let index = this.badgeTargets.length - 1; index >= 0; index--) {
      const badge = this.badgeTargets[index];
      if (
        x >= badge.x &&
        x <= badge.x + badge.width &&
        y >= badge.y &&
        y <= badge.y + badge.height
      ) {
        return badge;
      }
    }
    return undefined;
  }

  private roundRectPath(x: number, y: number, width: number, height: number, radius: number): void {
    if (!this.ctx) {
      return;
    }

    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  private withAlpha(hex: string, alpha: number): string {
    const normalized = hex.trim();
    const match = /^#?([0-9a-f]{6})$/i.exec(normalized);
    if (!match) {
      return `rgba(122, 162, 255, ${alpha})`;
    }

    const value = match[1];
    const r = Number.parseInt(value.slice(0, 2), 16);
    const g = Number.parseInt(value.slice(2, 4), 16);
    const b = Number.parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private findNodeAt(x: number, y: number): GraphNode | undefined {
    for (let index = this.nodes.length - 1; index >= 0; index--) {
      const node = this.nodes[index];
      const radius = this.getNodeRadius(node);
      const position = this.getDisplayedNodePosition(node);
      const dx = x - position.x;
      const dy = y - position.y;
      if (dx * dx + dy * dy <= radius * radius) {
        return node;
      }
    }
    return undefined;
  }

  private getDisplayedNodePosition(node: GraphNode): { x: number; y: number } {
    const isNodeBeingDragged = this.pointer.mode === "drag-node" && this.pointer.nodeId === node.id;
    if (isNodeBeingDragged) {
      return { x: node.x, y: node.y };
    }
    return this.folderAnchorDisplayPositions.get(node.id) ?? { x: node.x, y: node.y };
  }

  private getNodeRadius(node: GraphNode): number {
    if (Number.isFinite(node.size)) {
      return Math.max(6, Math.min(48, Number(node.size)));
    }
    return this.rootNodeIds.has(node.id) ? 12 : 10;
  }

  private getDragDistance(x: number, y: number, originX: number, originY: number): number {
    const dx = x - originX;
    const dy = y - originY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private emitViewportChange(): void {
    this.viewportChangeHandler?.(this.getViewport());
  }

  private emitNodeStateChange(): void {
    this.nodeStateChangeHandler?.([...this.nodes]);
  }
}
