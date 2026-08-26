/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- This extracted runtime manager is not bundled by the Obsidian plugin and keeps host-neutral callback boundaries for future reuse. */
import { LinkQuickSwitcher } from "../components/LinkQuickSwitcher";
import type { GraphEdge, GraphNode } from "../core/types";
import type { LinkTypeDefinition } from "../link-types/types";
import type { WorkspacePaneId } from "../core/views/types";
import type { GraphViewState } from "../views/GraphViewStateStore";
import {
  GraphEngine,
  type GraphViewportState,
  type NodeLinkBadge,
  type NodeOpenInteraction,
} from "./GraphEngine";
import { resolveLinkTypeMutationEndpoints } from "../link-types/LinkTypeSemantics";

export interface GraphPaneRenderState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rootNodeIds: string[];
  filteredNodeIds: string[];
  folderGroups: Array<{
    id: string;
    linkTypeId: string;
    color: string;
    opacity: number;
    anchorNodeId: string;
    nodeIds: string[];
  }>;
  badgesByNode: Record<string, NodeLinkBadge[]>;
}

export interface GraphPaneRuntimeManagerOptions {
  getLinkTypes: () => LinkTypeDefinition[];
  getIndexedNodes: () => Array<{
    id: string;
    path: string;
    relativePath: string;
    name: string;
    vaultId: string;
    kind: string;
    frontmatter: Record<string, unknown>;
  }>;
  openGraphNode: (pane: WorkspacePaneId, node: GraphNode, interaction: NodeOpenInteraction) => Promise<void>;
  graphLinkExists: (parentNodeId: string, childNodeId: string, linkTypeId: string) => boolean;
  enqueueGraphLinkMutation: (command: {
    action: "add_or_create_link" | "remove_link";
    parentReference: string;
    childReference: string;
    property: string;
  }) => void;
  updateGraphView: (
    documentPath: string,
    updater: (current: GraphViewState) => GraphViewState,
    options?: { skipPaneRender?: boolean; skipPersist?: boolean },
  ) => Promise<void>;
  persistGraphView: (documentPath: string) => Promise<void>;
  rerenderGraphDocument: (pane: WorkspacePaneId, documentPath: string) => void;
}

interface GraphPaneRuntime {
  canvas: HTMLCanvasElement;
  engine: GraphEngine;
  documentPath: string;
  saveTimeoutId?: number;
  nodesById: Map<string, GraphNode>;
  lastRenderSignature?: string;
  lastCameraSignature?: string;
  lastCentralGravity?: number;
  lastRepulsionForce?: number;
  lastVelocitySnapThreshold?: number;
}

export class GraphPaneRuntimeManager {
  private readonly runtimes = new Map<WorkspacePaneId, GraphPaneRuntime>();
  private readonly quickSwitcher = new LinkQuickSwitcher();

  constructor(private readonly options: GraphPaneRuntimeManagerOptions) {}

  destroyPane(pane: WorkspacePaneId): void {
    const runtime = this.runtimes.get(pane);
    if (!runtime) {
      return;
    }
    if (runtime.saveTimeoutId !== undefined) {
      window.clearTimeout(runtime.saveTimeoutId);
    }
    runtime.engine.destroy();
    runtime.canvas.remove();
    this.runtimes.delete(pane);
  }

  destroyAll(): void {
    for (const pane of this.runtimes.keys()) {
      this.destroyPane(pane);
    }
  }

  fitPaneToGraph(pane: WorkspacePaneId): void {
    this.runtimes.get(pane)?.engine.fitToGraph();
  }

  attachOrUpdatePane(args: {
    pane: WorkspacePaneId;
    viewport: HTMLElement;
    documentPath: string;
    view: GraphViewState;
    renderState: {
      nodes: GraphNode[];
      edges: GraphEdge[];
      rootNodeIds: string[];
      filteredNodeIds: string[];
      folderGroups: Array<{
        id: string;
        linkTypeId: string;
        color: string;
        opacity: number;
        anchorNodeId: string;
        nodeIds: string[];
      }>;
      badgesByNode: Record<string, NodeLinkBadge[]>;
    };
  }): void {
    const runtime = this.ensureRuntime(args.pane, args.viewport, args.documentPath);
    const renderSignature = this.buildRenderSignature(args);
    const cameraSignature = args.view.camera
      ? `${args.view.camera.x}:${args.view.camera.y}:${args.view.camera.zoom}`
      : "";
    const graphChanged = runtime.lastRenderSignature !== renderSignature;
    const cameraChanged = runtime.lastCameraSignature !== cameraSignature;
    const centralGravityChanged = runtime.lastCentralGravity !== args.view.centralGravity;
    const repulsionChanged = runtime.lastRepulsionForce !== args.view.repulsionForce;
    const velocitySnapThresholdChanged = runtime.lastVelocitySnapThreshold !== args.view.velocitySnapThreshold;

    if (graphChanged) {
      const nodes = this.cloneGraphRenderNodes(args.renderState.nodes, args.view);
      const edges = this.cloneGraphRenderEdges(args.renderState.edges);
      runtime.nodesById = new Map(nodes.map((node) => [node.id, node] as const));
      runtime.engine.setRootNodes(args.renderState.rootNodeIds);
      runtime.engine.setFilteredNodes(args.renderState.filteredNodeIds);
      runtime.engine.setFolderGroups(args.renderState.folderGroups);
      runtime.engine.setNodeBadges(args.renderState.badgesByNode);
      runtime.engine.setGraph(nodes, edges);
      runtime.lastRenderSignature = renderSignature;
    }
    if (centralGravityChanged) {
      runtime.engine.setCentralGravity(args.view.centralGravity);
      runtime.lastCentralGravity = args.view.centralGravity;
    }
    if (repulsionChanged) {
      runtime.engine.setRepulsionForce(args.view.repulsionForce);
      runtime.lastRepulsionForce = args.view.repulsionForce;
    }
    if (velocitySnapThresholdChanged) {
      runtime.engine.setVelocitySnapThreshold(args.view.velocitySnapThreshold);
      runtime.lastVelocitySnapThreshold = args.view.velocitySnapThreshold;
    }
    if (args.view.camera && cameraChanged) {
      runtime.engine.setViewport(args.view.camera);
      runtime.lastCameraSignature = cameraSignature;
    }
    if (graphChanged || cameraChanged || centralGravityChanged || repulsionChanged || velocitySnapThresholdChanged) {
      runtime.engine.render();
    }
  }

  private buildRenderSignature(args: {
    documentPath: string;
    renderState: GraphPaneRenderState;
  }): string {
    return JSON.stringify({
      documentPath: args.documentPath,
      nodes: args.renderState.nodes.map((node) => ({
        id: node.id,
        path: node.path,
        name: node.name,
        color: node.color,
        size: node.size,
        pinned: Boolean(node.pinned),
      })),
      edges: args.renderState.edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        color: edge.color,
        opacity: edge.opacity,
        renderStyle: edge.renderStyle,
        lineThickness: edge.lineThickness,
      })),
      rootNodeIds: args.renderState.rootNodeIds,
      filteredNodeIds: args.renderState.filteredNodeIds,
      folderGroups: args.renderState.folderGroups,
      badgesByNode: args.renderState.badgesByNode,
    });
  }

  private ensureRuntime(
    pane: WorkspacePaneId,
    viewport: HTMLElement,
    documentPath: string,
  ): GraphPaneRuntime {
    const currentRuntime = this.runtimes.get(pane);
    if (
      currentRuntime
      && currentRuntime.documentPath === documentPath
      && currentRuntime.canvas.parentElement === viewport
    ) {
      return currentRuntime;
    }

    this.destroyPane(pane);
    const graphCanvas = viewport.createEl("canvas");
    graphCanvas.addClass("wm-graph-preview-canvas");
    graphCanvas.dataset.graphInteractiveCanvas = pane;

    const graphEngine = new GraphEngine();
    graphEngine.initialize(graphCanvas);
    graphEngine.setOpenNodeHandler((node, interaction) => void this.options.openGraphNode(pane, node, interaction));
    graphEngine.setLinkStatusResolver((check) => {
      const linkType = this.options.getLinkTypes().find((candidate) => candidate.id === check.linkTypeId);
      if (!linkType) {
        return { exists: false };
      }
      const resolved = resolveLinkTypeMutationEndpoints(linkType, check.parentNodeId, check.childNodeId);
      return {
        exists: this.options.graphLinkExists(resolved.parentNodeId, resolved.childNodeId, check.linkTypeId),
      };
    });
    graphEngine.setViewportChangeHandler((viewportState) => {
      void this.handleViewportChange(pane, documentPath, viewportState);
    });
    graphEngine.setNodeStateChangeHandler((nodes) => {
      void this.handleNodeStateChange(pane, documentPath, nodes);
    });
    graphEngine.setBadgeInteractionHandler((interaction) => {
      void this.handleBadgeInteraction(pane, documentPath, interaction.nodeId, interaction.linkTypeId, interaction.altKey);
    });
    graphEngine.setLinkDropHandler((intent) => {
      void this.handleLinkDrop(pane, documentPath, intent.parentNodeId, intent.childNodeId, intent.linkTypeId, intent.action);
    });

    const runtime: GraphPaneRuntime = {
      canvas: graphCanvas,
      engine: graphEngine,
      documentPath,
      nodesById: new Map<string, GraphNode>(),
    };
    this.runtimes.set(pane, runtime);
    return runtime;
  }

  private async handleViewportChange(
    pane: WorkspacePaneId,
    documentPath: string,
    viewport: GraphViewportState,
  ): Promise<void> {
    await this.options.updateGraphView(documentPath, (current) => ({
      ...current,
      camera: { ...viewport },
    }), { skipPaneRender: true, skipPersist: true });
    this.scheduleSilentPersist(pane, documentPath);
  }

  private async handleNodeStateChange(
    pane: WorkspacePaneId,
    documentPath: string,
    nodes: GraphNode[],
  ): Promise<void> {
    const runtime = this.runtimes.get(pane);
    if (!runtime || runtime.documentPath !== documentPath) {
      return;
    }
    runtime.nodesById = new Map(nodes.map((node) => [node.id, node] as const));
    await this.options.updateGraphView(documentPath, (current) => ({
      ...current,
      nodePositions: this.extractGraphNodePositions(nodes),
    }), { skipPaneRender: true, skipPersist: true });
    this.scheduleSilentPersist(pane, documentPath);
  }

  private async handleBadgeInteraction(
    pane: WorkspacePaneId,
    documentPath: string,
    nodeId: string,
    linkTypeId: string,
    openQuickSwitcher: boolean,
  ): Promise<void> {
    const runtime = this.runtimes.get(pane);
    const sourceNode = runtime?.nodesById.get(nodeId);
    if (!sourceNode) {
      return;
    }
    const linkType = this.options.getLinkTypes().find((candidate) => candidate.id === linkTypeId);
    if (!linkType) {
      return;
    }
    const sourceReference = this.normalizeCompanionPath(sourceNode.relativePath || sourceNode.name || sourceNode.path);

    if (openQuickSwitcher) {
      this.quickSwitcher.open({
        parentLabel: sourceNode.name.replace(/\.md$/i, "") || this.getDocumentTitleFromPath(sourceNode.path),
        parentPath: sourceReference,
        linkTypeLabel: linkType.label,
        linkTypeProperty: linkType.property,
        indexedFiles: this.options.getIndexedNodes(),
        onSelect: async (selection) => {
          await this.options.updateGraphView(documentPath, (current) => {
            this.toggleGraphExpansion(current, sourceNode, linkTypeId, "ensure");
            return current;
          }, { skipPaneRender: true });
          const selectedReference = this.normalizeCompanionPath(selection.childPath);
          const endpoints = resolveLinkTypeMutationEndpoints(linkType, sourceReference, selectedReference);
          this.options.enqueueGraphLinkMutation({
            action: "add_or_create_link",
            parentReference: endpoints.parentNodeId,
            childReference: endpoints.childNodeId,
            property: linkType.property,
          });
          this.options.rerenderGraphDocument(pane, documentPath);
        },
      });
      return;
    }

    await this.options.updateGraphView(documentPath, (current) => {
      this.toggleGraphExpansion(current, sourceNode, linkTypeId, "toggle");
      return current;
    }, { skipPaneRender: true });
    this.options.rerenderGraphDocument(pane, documentPath);
  }

  private async handleLinkDrop(
    pane: WorkspacePaneId,
    documentPath: string,
    badgeNodeId: string,
    otherNodeId: string,
    linkTypeId: string,
    action: "add_or_create_link" | "remove_link",
  ): Promise<void> {
    const runtime = this.runtimes.get(pane);
    const badgeNode = runtime?.nodesById.get(badgeNodeId);
    const otherNode = runtime?.nodesById.get(otherNodeId);
    const linkType = this.options.getLinkTypes().find((candidate) => candidate.id === linkTypeId);
    if (!runtime || !badgeNode || !otherNode || !linkType) {
      return;
    }
    const resolvedEndpoints = resolveLinkTypeMutationEndpoints(linkType, badgeNodeId, otherNodeId);
    if (action === "add_or_create_link" && this.options.graphLinkExists(resolvedEndpoints.parentNodeId, resolvedEndpoints.childNodeId, linkTypeId)) {
      return;
    }
    if (action === "remove_link" && !this.options.graphLinkExists(resolvedEndpoints.parentNodeId, resolvedEndpoints.childNodeId, linkTypeId)) {
      return;
    }
    if (action === "add_or_create_link") {
      await this.options.updateGraphView(documentPath, (current) => {
        this.toggleGraphExpansion(current, badgeNode, linkTypeId, "ensure");
        return current;
      }, { skipPaneRender: true });
      this.options.rerenderGraphDocument(pane, documentPath);
    }
    this.options.enqueueGraphLinkMutation({
      action,
      parentReference: this.normalizeCompanionPath(
        (linkType.directionMode === "parent" ? otherNode : badgeNode).relativePath
          || (linkType.directionMode === "parent" ? otherNode : badgeNode).name
          || (linkType.directionMode === "parent" ? otherNode : badgeNode).path,
      ),
      childReference: this.normalizeCompanionPath(
        (linkType.directionMode === "parent" ? badgeNode : otherNode).relativePath
          || (linkType.directionMode === "parent" ? badgeNode : otherNode).name
          || (linkType.directionMode === "parent" ? badgeNode : otherNode).path,
      ),
      property: linkType.property,
    });
  }

  private scheduleSilentPersist(pane: WorkspacePaneId, documentPath: string): void {
    const runtime = this.runtimes.get(pane);
    if (!runtime || runtime.documentPath !== documentPath) {
      return;
    }
    if (runtime.saveTimeoutId !== undefined) {
      window.clearTimeout(runtime.saveTimeoutId);
    }
    runtime.saveTimeoutId = window.setTimeout(() => {
      runtime.saveTimeoutId = undefined;
      void this.options.persistGraphView(documentPath);
    }, 120);
  }

  private cloneGraphRenderNodes(nodes: GraphNode[], view: GraphViewState): GraphNode[] {
    return nodes.map((node) => {
      const savedPosition = view.nodePositions?.[node.id] ?? view.nodePositions?.[node.path];
      return {
        ...node,
        metadata: { ...(node.metadata ?? {}) },
        x: savedPosition?.x ?? node.x,
        y: savedPosition?.y ?? node.y,
        vx: 0,
        vy: 0,
        pinned: Boolean(savedPosition),
      };
    });
  }

  private cloneGraphRenderEdges(edges: GraphEdge[]): GraphEdge[] {
    return edges.map((edge) => ({ ...edge }));
  }

  private extractGraphNodePositions(nodes: GraphNode[]): Record<string, { x: number; y: number }> {
    const nextPositions: Record<string, { x: number; y: number }> = {};
    for (const node of nodes) {
      if (!node.pinned) {
        continue;
      }
      nextPositions[node.id] = {
        x: node.x,
        y: node.y,
      };
    }
    return nextPositions;
  }

  private normalizeCompanionPath(value: string): string {
    const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "").trim();
    if (!normalized) {
      return normalized;
    }
    return /\.md$/i.test(normalized) ? normalized : `${normalized}.md`;
  }

  private toggleGraphExpansion(
    view: GraphViewState,
    sourceNode: Pick<GraphNode, "id" | "path">,
    linkTypeId: string,
    mode: "toggle" | "ensure",
  ): void {
    const expansionId = `${sourceNode.id}::${linkTypeId}`;
    const expansions = [...(view.expansions ?? [])];
    const existingIndex = expansions.findIndex((expansion) => expansion.id === expansionId);
    if (existingIndex >= 0) {
      if (mode === "toggle") {
        expansions.splice(existingIndex, 1);
      }
      view.expansions = expansions;
      return;
    }
    expansions.push({
      id: expansionId,
      sourceNodeId: sourceNode.id,
      sourcePath: sourceNode.path,
      linkType: linkTypeId,
      status: "expanded",
      childrenExpansionIds: [],
    });
    view.expansions = expansions;
  }

  private getDocumentTitleFromPath(path: string): string {
    return path.replace(/\\/g, "/").split("/").pop()?.replace(/\.[^.]+$/u, "") ?? path;
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- Re-enable dynamic host-boundary lint rules after the extracted runtime manager. */
