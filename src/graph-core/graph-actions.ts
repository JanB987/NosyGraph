import type {
  GraphExpansionSource,
  GraphExpansionState,
  GraphLinkEndpoints,
  GraphLinkTypeCore,
  GraphRelationshipIndex,
  GraphRootExpansionState,
} from "./graph-types.js";

export function normalizeGraphPath(value: string): string {
  return String(value ?? "").replace(/\\/g, "/").trim();
}

export function getGraphExpansionId(nodeId: string, linkTypeId: string): string {
  return `${nodeId}::${linkTypeId}`;
}

export function createGraphExpansion(source: GraphExpansionSource): GraphExpansionState {
  return {
    id: getGraphExpansionId(source.nodeId, source.linkTypeId),
    sourceNodeId: source.nodeId,
    sourcePath: source.sourcePath,
    linkType: source.linkTypeId,
    status: "expanded",
    childrenExpansionIds: [],
  };
}

export function addGraphRoot(viewState: GraphRootExpansionState, rootPath: string): boolean {
  const normalizedRoot = normalizeGraphPath(rootPath);
  if (!normalizedRoot) {
    return false;
  }

  const roots = viewState.roots ?? [];
  const existingRoots = new Set(roots.map((root) => normalizeGraphPath(root)));
  if (existingRoots.has(normalizedRoot)) {
    return false;
  }

  viewState.roots = [...existingRoots, normalizedRoot];
  return true;
}

export function removeGraphRoot(viewState: GraphRootExpansionState, rootPath: string): boolean {
  const normalizedRoot = normalizeGraphPath(rootPath);
  const roots = viewState.roots ?? [];
  const nextRoots = roots.filter((root) => normalizeGraphPath(root) !== normalizedRoot);
  if (nextRoots.length === roots.length) {
    return false;
  }

  viewState.roots = nextRoots;
  return true;
}

export function toggleGraphExpansion(
  viewState: GraphRootExpansionState,
  source: GraphExpansionSource,
): boolean {
  const expansionId = getGraphExpansionId(source.nodeId, source.linkTypeId);
  const expansions = [...(viewState.expansions ?? [])];
  const existingIndex = expansions.findIndex((expansion) => expansion.id === expansionId);

  if (existingIndex >= 0) {
    expansions.splice(existingIndex, 1);
    viewState.expansions = expansions;
    return true;
  }

  expansions.push(createGraphExpansion(source));
  viewState.expansions = expansions;
  return true;
}

export function ensureGraphExpansion(
  viewState: GraphRootExpansionState,
  source: GraphExpansionSource,
): boolean {
  const expansionId = getGraphExpansionId(source.nodeId, source.linkTypeId);
  const expansions = [...(viewState.expansions ?? [])];
  if (expansions.some((expansion) => expansion.id === expansionId)) {
    return false;
  }

  expansions.push(createGraphExpansion(source));
  viewState.expansions = expansions;
  return true;
}

export function getGraphLinkTypeRelatedNodeIds(
  index: GraphRelationshipIndex,
  linkType: Pick<GraphLinkTypeCore, "property" | "directionMode">,
  nodeId: string,
): string[] {
  if (linkType.directionMode === "parent") {
    return getPropertyIncomingLinks(index, linkType.property, nodeId);
  }
  return getPropertyOutgoingLinks(index, linkType.property, nodeId);
}

export function createGraphLinkTypeEdge(
  linkType: Pick<GraphLinkTypeCore, "directionMode">,
  sourceNodeId: string,
  relatedNodeId: string,
): { source: string; target: string } {
  return linkType.directionMode === "parent"
    ? { source: relatedNodeId, target: sourceNodeId }
    : { source: sourceNodeId, target: relatedNodeId };
}

export function resolveGraphLinkTypeMutationEndpoints(
  linkType: Pick<GraphLinkTypeCore, "directionMode">,
  badgeNodeId: string,
  otherNodeId: string,
): GraphLinkEndpoints {
  return linkType.directionMode === "parent"
    ? { parentNodeId: otherNodeId, childNodeId: badgeNodeId }
    : { parentNodeId: badgeNodeId, childNodeId: otherNodeId };
}

function getPropertyOutgoingLinks(index: GraphRelationshipIndex, property: string, nodeId: string): string[] {
  const direct = index.getPropertyOutgoingLinks(property, nodeId);
  if (direct.length > 0) {
    return direct;
  }
  const matchingProperty = getMatchingProperty(index, property);
  if (!matchingProperty || matchingProperty === property) {
    return direct;
  }
  return index.getPropertyOutgoingLinks(matchingProperty, nodeId);
}

function getPropertyIncomingLinks(index: GraphRelationshipIndex, property: string, nodeId: string): string[] {
  const direct = index.getPropertyIncomingLinks(property, nodeId);
  if (direct.length > 0) {
    return direct;
  }
  const matchingProperty = getMatchingProperty(index, property);
  if (!matchingProperty || matchingProperty === property) {
    return direct;
  }
  return index.getPropertyIncomingLinks(matchingProperty, nodeId);
}

function getMatchingProperty(index: GraphRelationshipIndex, property: string): string | undefined {
  const normalizedProperty = property.trim().toLowerCase();
  if (!normalizedProperty) {
    return undefined;
  }
  return index
    .getProperties()
    .find((candidate) => candidate.trim().toLowerCase() === normalizedProperty);
}
