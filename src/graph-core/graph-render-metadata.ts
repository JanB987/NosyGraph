import {
  getGraphExpansionId,
  getGraphLinkTypeRelatedNodeIds,
} from "./graph-actions.js";
import type {
  GraphExpansionState,
  GraphFolderGroupCore,
  GraphLinkTypeCore,
  GraphNodeBadgeCore,
  GraphRelationshipIndex,
} from "./graph-types.js";

export type GraphRenderMetadataLinkType = Pick<
  GraphLinkTypeCore,
  "id" | "label" | "property" | "directionMode" | "color" | "renderStyle" | "opacity"
> & {
  label: string;
  color: string;
  opacity: number;
};

export function buildGraphFolderGroups(input: {
  index: GraphRelationshipIndex;
  activeLinkTypes: GraphRenderMetadataLinkType[];
  expansionMap: Map<string, GraphExpansionState>;
  visibleNodeIds: Iterable<string>;
}): GraphFolderGroupCore[] {
  const groups: GraphFolderGroupCore[] = [];
  const visibleNodeIds = new Set(input.visibleNodeIds);
  for (const linkType of input.activeLinkTypes) {
    if (linkType.renderStyle !== "folder") {
      continue;
    }
    for (const expansion of input.expansionMap.values()) {
      if (expansion.linkType !== linkType.id || !visibleNodeIds.has(expansion.sourceNodeId)) {
        continue;
      }
      const nodeIds = collectGraphFolderGroupNodeIds({
        index: input.index,
        linkType,
        expansionMap: input.expansionMap,
        anchorNodeId: expansion.sourceNodeId,
        visibleNodeIds,
      });
      if (nodeIds.length < 2) {
        continue;
      }
      groups.push({
        id: `${expansion.sourceNodeId}::${linkType.id}`,
        linkTypeId: linkType.id,
        color: linkType.color,
        opacity: linkType.opacity,
        anchorNodeId: expansion.sourceNodeId,
        nodeIds,
      });
    }
  }
  return groups;
}

export function buildGraphNodeBadges(input: {
  index: GraphRelationshipIndex;
  nodeIds: Iterable<string>;
  activeLinkTypes: GraphRenderMetadataLinkType[];
  expansionMap: Map<string, GraphExpansionState>;
}): Record<string, GraphNodeBadgeCore[]> {
  const badgesByNode: Record<string, GraphNodeBadgeCore[]> = {};
  for (const nodeId of input.nodeIds) {
    const badges = input.activeLinkTypes
      .map((linkType) => {
        const hasLinks = getGraphLinkTypeRelatedNodeIds(input.index, linkType, nodeId).length > 0;
        return {
          linkTypeId: linkType.id,
          label: linkType.label,
          color: linkType.color,
          expanded: hasLinks && input.expansionMap.has(getGraphExpansionId(nodeId, linkType.id)),
          hasLinks,
        } satisfies GraphNodeBadgeCore;
      })
      .sort((left, right) => {
        if (left.hasLinks !== right.hasLinks) {
          return left.hasLinks ? -1 : 1;
        }
        return left.label.localeCompare(right.label);
      });

    if (badges.length > 0) {
      badgesByNode[nodeId] = badges;
    }
  }

  return badgesByNode;
}

function collectGraphFolderGroupNodeIds(input: {
  index: GraphRelationshipIndex;
  linkType: GraphRenderMetadataLinkType;
  expansionMap: Map<string, GraphExpansionState>;
  anchorNodeId: string;
  visibleNodeIds: Set<string>;
}): string[] {
  const collected = new Set<string>([input.anchorNodeId]);
  const queue = [input.anchorNodeId];
  while (queue.length > 0) {
    const currentNodeId = queue.shift()!;
    for (const relatedNodeId of getGraphLinkTypeRelatedNodeIds(input.index, input.linkType, currentNodeId)) {
      if (!input.visibleNodeIds.has(relatedNodeId) || collected.has(relatedNodeId)) {
        continue;
      }
      collected.add(relatedNodeId);
      const expansionId = getGraphExpansionId(relatedNodeId, input.linkType.id);
      if (input.expansionMap.has(expansionId)) {
        queue.push(relatedNodeId);
      }
    }
  }
  return Array.from(collected);
}
