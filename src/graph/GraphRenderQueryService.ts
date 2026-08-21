import type { IndexedNodeSummary } from "../app/AppController.js";
import { FilterQueryService } from "../core/views/FilterQueryService.js";
import { getFilterPropertyValue } from "../core/views/ViewFilterEngine.js";
import type { GraphEdge, GraphNode } from "../core/types.js";
import type { GraphViewState } from "../views/GraphViewStateStore.js";
import type { LinkTypeDefinition } from "../link-types/types.js";
import type { VaultIndex } from "../indexer/VaultIndex.js";
import { createLinkTypeEdge, getLinkTypeRelatedNodeIds } from "../link-types/LinkTypeSemantics.js";
import type { AppliedNodeGroupEffect } from "../groups/types.js";
import type { ViewFilterExpression, ViewFilterGroup, ViewFilterRule } from "../core/views/ViewDocument.js";
import { getGraphExpansionId, normalizeGraphPath } from "../graph-core/graph-actions.js";
import { resolveGraphNodeId, resolveGraphRoots } from "../graph-core/graph-node-resolver.js";
import {
  buildGraphFolderGroups,
  buildGraphNodeBadges,
} from "../graph-core/graph-render-metadata.js";
import type { GraphFolderGroupCore, GraphNodeBadgeCore } from "../graph-core/graph-types.js";

const GRAPH_FILTER_NODE_LIMIT = 300;

export interface GraphRenderQueryResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rootNodeIds: string[];
  filteredNodeIds: string[];
  folderGroups: GraphFolderGroupCore[];
  badgesByNode: Record<string, GraphNodeBadgeCore[]>;
}

export class GraphRenderQueryService {
  private readonly indexedGraphFilterQuery = new FilterQueryService<IndexedNodeSummary>({
    getFileName: (node) => normalizeGraphPath(node.relativePath).split("/").pop() ?? node.name,
    getPath: (node) => normalizeGraphPath(node.relativePath),
    getDocumentKind: (node) => node.kind ?? "markdown-note",
    getPropertyValue: (node, propertyName) => getFilterPropertyValue(node.frontmatter ?? {}, propertyName),
  });

  build(input: {
    index: VaultIndex;
    viewState: GraphViewState;
    indexedNodes: IndexedNodeSummary[];
    activeLinkTypes: LinkTypeDefinition[];
    nodeGroupEffects: Map<string, AppliedNodeGroupEffect>;
  }): GraphRenderQueryResult {
    const explicitRoots = resolveGraphRoots(input.viewState.roots, input.index);
    const rootNodeIds = this.resolveFilteredGraphNodeIds(
      input.index,
      input.viewState,
      input.indexedNodes,
      explicitRoots,
    );
    if (rootNodeIds.length === 0) {
      return {
        nodes: [],
        edges: [],
        rootNodeIds: [],
        filteredNodeIds: [],
        folderGroups: [],
        badgesByNode: {},
      };
    }

    const visibleNodes = new Map<string, GraphNode>();
    const visibleEdges = new Map<string, GraphEdge>();
    const queue = [...rootNodeIds];
    const visited = new Set<string>();
    const expansionMap = new Map((input.viewState.expansions ?? []).map((expansion) => [expansion.id, expansion]));

    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
      const nodeId = queue[queueIndex];
      if (visited.has(nodeId)) {
        continue;
      }
      visited.add(nodeId);

      const node = input.index.getNode(nodeId);
      if (!node) {
        continue;
      }
      visibleNodes.set(node.id, node);

      for (const linkType of input.activeLinkTypes) {
        const expansionId = getGraphExpansionId(node.id, linkType.id);
        if (!expansionMap.has(expansionId)) {
          continue;
        }

        for (const targetId of getLinkTypeRelatedNodeIds(input.index, linkType, node.id)) {
          const targetNode = input.index.getNode(targetId);
          if (!targetNode) {
            continue;
          }

          visibleNodes.set(targetNode.id, targetNode);
          const edgeEndpoints = createLinkTypeEdge(linkType, node.id, targetId);
          visibleEdges.set(`${node.id}::${targetId}::${linkType.id}`, {
            source: edgeEndpoints.source,
            target: edgeEndpoints.target,
            type: linkType.id,
            color: linkType.color,
            property: linkType.property,
            linkTypeId: linkType.id,
            renderStyle: linkType.renderStyle,
            opacity: linkType.opacity,
            lineThickness: linkType.lineThickness,
            lineLengthMultiplier: linkType.lineLengthMultiplier,
            forceStrength: linkType.forceStrength,
          });
          if (!visited.has(targetId)) {
            queue.push(targetId);
          }
        }
      }
    }

    const explicitRootSet = new Set(explicitRoots);
    const filteredNodeIds = rootNodeIds.filter((nodeId) => !explicitRootSet.has(nodeId));
    const rootSet = new Set(explicitRoots);
    const filteredSet = new Set(filteredNodeIds);
    for (const node of visibleNodes.values()) {
      node.metadata.isRoot = rootSet.has(node.id);
      node.metadata.isFiltered = filteredSet.has(node.id);
    }

    const nodes = Array.from(visibleNodes.values());
    for (const node of nodes) {
      const effect = input.nodeGroupEffects.get(node.id);
      if (!effect) {
        continue;
      }
      node.color = effect.nodeColor;
      node.size = effect.nodeSize;
      node.icon = effect.icon;
      node.metadata.groupId = effect.groupId;
    }
    return {
      nodes,
      edges: Array.from(visibleEdges.values()),
      rootNodeIds: explicitRoots,
      filteredNodeIds,
      folderGroups: buildGraphFolderGroups({
        index: input.index,
        activeLinkTypes: input.activeLinkTypes,
        expansionMap,
        visibleNodeIds: visibleNodes.keys(),
      }),
      badgesByNode: buildGraphNodeBadges({
        index: input.index,
        nodeIds: nodes.map((node) => node.id),
        activeLinkTypes: input.activeLinkTypes,
        expansionMap,
      }),
    };
  }

  private resolveFilteredGraphNodeIds(
    index: VaultIndex,
    viewState: GraphViewState,
    indexedNodes: IndexedNodeSummary[],
    explicitRoots: string[],
  ): string[] {
    const activeFilter = this.getActiveGraphFilter(viewState.filters);
    if (!activeFilter || !this.indexedGraphFilterQuery.hasRules(activeFilter)) {
      return explicitRoots;
    }

    const filteredNodeIds: string[] = [];
    const seen = new Set(explicitRoots);
    for (const node of indexedNodes) {
      if (filteredNodeIds.length >= GRAPH_FILTER_NODE_LIMIT) {
        break;
      }
      if (!this.indexedGraphFilterQuery.matches(activeFilter, node)) {
        continue;
      }
      const nodeId = resolveGraphNodeId(node.id, index) ?? resolveGraphNodeId(node.relativePath, index);
      if (!nodeId || seen.has(nodeId)) {
        continue;
      }
      seen.add(nodeId);
      filteredNodeIds.push(nodeId);
    }
    return Array.from(new Set([...explicitRoots, ...filteredNodeIds]));
  }

  private getActiveGraphFilter(expression: ViewFilterExpression): ViewFilterExpression | undefined {
    if (expression.type === "rule") {
      return this.isCompleteGraphFilterRule(expression) ? expression : undefined;
    }

    const children = expression.children
      .map((child) => this.getActiveGraphFilter(child))
      .filter((child): child is ViewFilterExpression => Boolean(child));
    if (children.length === 0) {
      return undefined;
    }

    return {
      ...expression,
      children,
    } satisfies ViewFilterGroup;
  }

  private isCompleteGraphFilterRule(rule: ViewFilterRule): boolean {
    if (rule.field.kind === "yaml-property" && !rule.field.property?.trim()) {
      return false;
    }
    if (rule.operator === "exists" || rule.operator === "not-exists") {
      return true;
    }
    return String(rule.value ?? "").trim().length > 0;
  }
}
