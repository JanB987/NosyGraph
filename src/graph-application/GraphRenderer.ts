import type { GraphBadge } from "../graph-domain/GraphBadge";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import { copyGraphSnapshot } from "../graph-domain/GraphSnapshot";
import type { BadgeId, NodeInstanceId } from "../graph-domain/graph-identifiers";

export interface GraphRenderViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface GraphRenderSnapshot extends GraphSnapshot {
  viewport: GraphRenderViewport;
}

export interface GraphRenderPoint {
  x: number;
  y: number;
}

export type GraphRendererIntent =
  | {
      kind: "node-clicked";
      nodeId: NodeInstanceId;
      shiftKey: boolean;
      ctrlKey: boolean;
      metaKey: boolean;
      altKey: boolean;
    }
  | {
      kind: "badge-clicked";
      badgeId: BadgeId;
      nodeId: NodeInstanceId;
      linkTypeId: string;
      shiftKey: boolean;
      ctrlKey: boolean;
      metaKey: boolean;
      altKey: boolean;
    };

export type GraphRendererIntentListener = (intent: GraphRendererIntent) => void;

interface NodeHitRegion {
  nodeId: NodeInstanceId;
  x: number;
  y: number;
  radius: number;
}

interface BadgeHitRegion {
  badgeId: BadgeId;
  nodeId: NodeInstanceId;
  linkTypeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BadgeHandle {
  badge: GraphBadge;
  element: HTMLButtonElement;
}

/**
 * Snapshot renderer and hit-testing boundary for store-mode projections.
 *
 * The renderer owns canvas, DOM, and hit-region handles. It never mutates a
 * GraphSnapshot or semantic graph collection; user actions leave through
 * GraphRendererIntent listeners.
 */
export class GraphRenderer {
  private canvas?: HTMLCanvasElement;
  private context?: CanvasRenderingContext2D;
  private badgeOverlay?: HTMLDivElement;
  private readonly badgeHandles = new Map<BadgeId, BadgeHandle>();
  private readonly nodeHitRegions = new Map<NodeInstanceId, NodeHitRegion>();
  private readonly badgeHitRegions = new Map<BadgeId, BadgeHitRegion>();
  private readonly intentListeners = new Set<GraphRendererIntentListener>();
  private snapshot?: GraphRenderSnapshot;
  private viewport: GraphRenderViewport = { x: 0, y: 0, zoom: 1 };
  private mountedContainer?: HTMLElement;
  private readonly handleCanvasClick = (event: MouseEvent): void => {
    const point = this.getCanvasPoint(event);
    const badgeId = this.hitTestBadge(point);
    if (badgeId) {
      const badge = this.snapshot?.badges.find((item) => item.id === badgeId);
      if (badge) {
        this.emit({
          kind: "badge-clicked",
          badgeId: badge.id,
          nodeId: badge.nodeId,
          linkTypeId: badge.linkTypeId,
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey
        });
      }
      return;
    }
    const nodeId = this.hitTestNode(point);
    if (nodeId) {
      this.emit({
        kind: "node-clicked",
        nodeId,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey
      });
    }
  };

  mount(container: HTMLElement): void {
    this.unmount();
    const document = container.ownerDocument
      ?? (typeof globalThis.document === "undefined" ? undefined : globalThis.document);
    if (!document) {
      throw new Error("GraphRenderer requires a document to mount.");
    }

    this.mountedContainer = container;
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("aria-label", "Graph");
    this.canvas.addEventListener("click", this.handleCanvasClick);
    this.canvas.style.position = "absolute";
    this.canvas.style.inset = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.zIndex = "0";

    this.badgeOverlay = document.createElement("div");
    this.badgeOverlay.setAttribute("aria-label", "Graph badges");
    this.badgeOverlay.style.position = "absolute";
    this.badgeOverlay.style.inset = "0";
    this.badgeOverlay.style.pointerEvents = "none";
    this.badgeOverlay.style.zIndex = "1";

    container.append(this.canvas, this.badgeOverlay);
    this.context = this.canvas.getContext("2d") ?? undefined;
    this.resize(container.clientWidth || 1, container.clientHeight || 1);
    if (this.snapshot) this.render(this.snapshot);
  }

  unmount(): void {
    this.canvas?.removeEventListener("click", this.handleCanvasClick);
    for (const handle of this.badgeHandles.values()) {
      handle.element.remove();
    }
    this.badgeHandles.clear();
    this.badgeOverlay?.remove();
    this.canvas?.remove();
    this.badgeOverlay = undefined;
    this.canvas = undefined;
    this.context = undefined;
    this.mountedContainer = undefined;
    this.nodeHitRegions.clear();
    this.badgeHitRegions.clear();
  }

  resize(width: number, height: number): void {
    if (!this.canvas) return;
    this.canvas.width = Math.max(1, Math.round(width));
    this.canvas.height = Math.max(1, Math.round(height));
    this.draw();
    this.syncBadgeHandles();
  }

  render(snapshot: GraphRenderSnapshot): void {
    this.snapshot = copyGraphSnapshot(snapshot) as GraphRenderSnapshot;
    this.viewport = normalizeViewport(snapshot.viewport);
    this.nodeHitRegions.clear();
    this.badgeHitRegions.clear();
    this.layoutHitRegions(this.snapshot);
    this.draw();
    this.syncBadgeHandles();
  }

  hitTestNode(point: GraphRenderPoint): NodeInstanceId | undefined {
    const world = this.screenToWorld(point);
    const regions = [...this.nodeHitRegions.values()];
    for (let index = regions.length - 1; index >= 0; index -= 1) {
      const region = regions[index];
      const dx = world.x - region.x;
      const dy = world.y - region.y;
      if (dx * dx + dy * dy <= region.radius * region.radius) {
        return region.nodeId;
      }
    }
    return undefined;
  }

  hitTestBadge(point: GraphRenderPoint): BadgeId | undefined {
    const world = this.screenToWorld(point);
    const regions = [...this.badgeHitRegions.values()];
    for (let index = regions.length - 1; index >= 0; index -= 1) {
      const region = regions[index];
      if (
        world.x >= region.x
        && world.x <= region.x + region.width
        && world.y >= region.y
        && world.y <= region.y + region.height
      ) {
        return region.badgeId;
      }
    }
    return undefined;
  }

  onIntent(listener: GraphRendererIntentListener): () => void {
    this.intentListeners.add(listener);
    return () => {
      this.intentListeners.delete(listener);
    };
  }

  getRenderedNodeIds(): readonly NodeInstanceId[] {
    return [...this.nodeHitRegions.keys()];
  }

  getRenderedBadgeIds(): readonly BadgeId[] {
    return [...this.badgeHitRegions.keys()];
  }

  private layoutHitRegions(snapshot: GraphRenderSnapshot): void {
    const badgesByNode = new Map<NodeInstanceId, GraphBadge[]>();
    for (const badge of snapshot.badges) {
      const list = badgesByNode.get(badge.nodeId) ?? [];
      list.push(badge);
      badgesByNode.set(badge.nodeId, list);
    }

    for (const node of snapshot.nodes) {
      const radius = normalizedRadius(node.radius);
      this.nodeHitRegions.set(node.id, {
        nodeId: node.id,
        x: node.position.x,
        y: node.position.y,
        radius
      });

      const badges = badgesByNode.get(node.id) ?? [];
      const gap = 4;
      const height = 18;
      const widths = badges.map((badge) => Math.max(40, badge.label.length * 7 + 18));
      const totalWidth = widths.reduce((sum, width) => sum + width, 0)
        + Math.max(0, widths.length - 1) * gap;
      let x = node.position.x - totalWidth / 2;
      const y = node.position.y - radius - height - 8;

      badges.forEach((badge, index) => {
        const width = widths[index] ?? 40;
        this.badgeHitRegions.set(badge.id, {
          badgeId: badge.id,
          nodeId: badge.nodeId,
          linkTypeId: badge.linkTypeId,
          x,
          y,
          width,
          height
        });
        x += width + gap;
      });
    }
  }

  private draw(): void {
    const context = this.context;
    const snapshot = this.snapshot;
    if (!context || !this.canvas || !snapshot) return;

    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.save();
    context.translate(this.viewport.x, this.viewport.y);
    context.scale(this.viewport.zoom, this.viewport.zoom);

    const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node] as const));
    for (const edge of snapshot.edges) {
      const from = nodesById.get(edge.fromNodeId);
      const to = nodesById.get(edge.toNodeId);
      if (!from || !to) continue;
      context.strokeStyle = edge.origin === "overlay" ? "#73808c88" : "#73808c";
      context.lineWidth = 1 / this.viewport.zoom;
      context.beginPath();
      context.moveTo(from.position.x, from.position.y);
      context.lineTo(to.position.x, to.position.y);
      context.stroke();
    }

    const notesById = new Map(snapshot.notes.map((note) => [note.id, note] as const));
    for (const node of snapshot.nodes) {
      const region = this.nodeHitRegions.get(node.id);
      if (!region) continue;
      context.fillStyle = node.selected ? "#ffcc66" : "#7aa2ff";
      context.beginPath();
      context.arc(region.x, region.y, region.radius, 0, Math.PI * 2);
      context.fill();

      const label = notesById.get(node.noteId)?.name ?? node.noteId;
      context.fillStyle = "#d8e5f6";
      context.font = "12px sans-serif";
      context.textAlign = "center";
      context.fillText(label, region.x, region.y + region.radius + 14);

      for (const badge of snapshot.badges.filter((item) => item.nodeId === node.id)) {
        const hit = this.badgeHitRegions.get(badge.id);
        if (!hit) continue;
        context.fillStyle = badge.state === "expanded" ? "#36577c" : "#263b57";
        context.strokeStyle = badge.color;
        context.lineWidth = 1 / this.viewport.zoom;
        roundRect(context, hit.x, hit.y, hit.width, hit.height, 6);
        context.fill();
        context.stroke();
        context.fillStyle = "#d8e5f6";
        context.textAlign = "left";
        context.fillText(
          (badge.state === "expanded" ? "- " : "+ ") + badge.label,
          hit.x + 7,
          hit.y + hit.height / 2
        );
      }
    }
    context.restore();
  }

  private syncBadgeHandles(): void {
    const overlay = this.badgeOverlay;
    const snapshot = this.snapshot;
    if (!overlay || !snapshot) return;

    const activeIds = new Set(this.badgeHitRegions.keys());
    for (const [badgeId, handle] of this.badgeHandles) {
      if (activeIds.has(badgeId)) continue;
      handle.element.remove();
      this.badgeHandles.delete(badgeId);
    }

    for (const badge of snapshot.badges) {
      const region = this.badgeHitRegions.get(badge.id);
      if (!region) continue;
      let handle = this.badgeHandles.get(badge.id);
      if (!handle) {
        const element = overlay.ownerDocument.createElement("button");
        element.type = "button";
        element.setAttribute("aria-label", badge.label);
        element.style.position = "absolute";
        element.style.pointerEvents = "auto";
        element.style.opacity = "0";
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          this.emit({
            kind: "badge-clicked",
            badgeId: badge.id,
            nodeId: badge.nodeId,
            linkTypeId: badge.linkTypeId,
            shiftKey: event.shiftKey,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            altKey: event.altKey
          });
        });
        overlay.append(element);
        handle = { badge, element };
        this.badgeHandles.set(badge.id, handle);
      } else {
        handle.badge = badge;
      }
      const topLeft = this.worldToScreen({ x: region.x, y: region.y });
      handle.element.style.left = topLeft.x + "px";
      handle.element.style.top = topLeft.y + "px";
      handle.element.style.width = region.width * this.viewport.zoom + "px";
      handle.element.style.height = region.height * this.viewport.zoom + "px";
    }
  }

  private getCanvasPoint(event: MouseEvent): GraphRenderPoint {
    const rect = this.canvas?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0)
    };
  }

  private screenToWorld(point: GraphRenderPoint): GraphRenderPoint {
    return {
      x: (point.x - this.viewport.x) / this.viewport.zoom,
      y: (point.y - this.viewport.y) / this.viewport.zoom
    };
  }

  private worldToScreen(point: GraphRenderPoint): GraphRenderPoint {
    return {
      x: point.x * this.viewport.zoom + this.viewport.x,
      y: point.y * this.viewport.zoom + this.viewport.y
    };
  }

  private emit(intent: GraphRendererIntent): void {
    for (const listener of this.intentListeners) {
      listener(intent);
    }
  }
}

function normalizeViewport(viewport: GraphRenderViewport | undefined): GraphRenderViewport {
  return {
    x: Number.isFinite(viewport?.x) ? viewport!.x : 0,
    y: Number.isFinite(viewport?.y) ? viewport!.y : 0,
    zoom: Number.isFinite(viewport?.zoom) && viewport!.zoom > 0 ? viewport!.zoom : 1
  };
}

function normalizedRadius(radius: number): number {
  return Number.isFinite(radius) && radius > 0 ? radius : 10;
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const clamped = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + clamped, y);
  context.lineTo(x + width - clamped, y);
  context.quadraticCurveTo(x + width, y, x + width, y + clamped);
  context.lineTo(x + width, y + height - clamped);
  context.quadraticCurveTo(x + width, y + height, x + width - clamped, y + height);
  context.lineTo(x + clamped, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - clamped);
  context.lineTo(x, y + clamped);
  context.quadraticCurveTo(x, y, x + clamped, y);
  context.closePath();
}
