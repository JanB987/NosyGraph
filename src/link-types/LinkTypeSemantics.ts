import type {
  LinkTypeDefinition,
} from "./types.js";
import type { VaultIndex } from "../indexer/VaultIndex.js";
import {
  createGraphLinkTypeEdge,
  getGraphLinkTypeRelatedNodeIds,
  resolveGraphLinkTypeMutationEndpoints,
} from "../graph-core/graph-actions.js";
import { normalizeGraphLinkTypeCore } from "../graph-core/graph-link-types.js";

export function normalizeLinkTypeDefinition(
  linkType: Partial<LinkTypeDefinition> | undefined,
): LinkTypeDefinition | undefined {
  const normalized = normalizeGraphLinkTypeCore(linkType);
  if (!normalized) {
    return undefined;
  }

  return {
    ...normalized,
    layout: "force",
  };
}

export function getLinkTypeRelatedNodeIds(
  index: VaultIndex,
  linkType: Pick<LinkTypeDefinition, "property" | "directionMode">,
  nodeId: string,
): string[] {
  return getGraphLinkTypeRelatedNodeIds(index, linkType, nodeId);
}

export function createLinkTypeEdge(
  linkType: Pick<LinkTypeDefinition, "id" | "color" | "property" | "directionMode">,
  sourceNodeId: string,
  relatedNodeId: string,
): { source: string; target: string } {
  return createGraphLinkTypeEdge(linkType, sourceNodeId, relatedNodeId);
}

export function resolveLinkTypeMutationEndpoints(
  linkType: Pick<LinkTypeDefinition, "directionMode">,
  badgeNodeId: string,
  otherNodeId: string,
): { parentNodeId: string; childNodeId: string } {
  return resolveGraphLinkTypeMutationEndpoints(linkType, badgeNodeId, otherNodeId);
}
