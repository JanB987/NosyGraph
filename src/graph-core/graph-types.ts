export type GraphLinkDirectionMode = "child" | "parent";
export type GraphLinkRenderStyle = "line" | "folder";

export interface GraphLinkTypeCore {
  id: string;
  label?: string;
  property: string;
  directionMode: GraphLinkDirectionMode;
  color?: string;
  renderStyle?: GraphLinkRenderStyle;
  opacity?: number;
  lineThickness?: number;
  lineLengthMultiplier?: number;
  forceStrength?: number;
}

export interface NormalizedGraphLinkTypeCore extends GraphLinkTypeCore {
  label: string;
  color: string;
  renderStyle: GraphLinkRenderStyle;
  directionMode: GraphLinkDirectionMode;
  opacity: number;
  lineThickness: number;
  lineLengthMultiplier: number;
  forceStrength: number;
}

export interface GraphRelationshipIndex {
  getProperties(): string[];
  getPropertyOutgoingLinks(property: string, nodeId: string): string[];
  getPropertyIncomingLinks(property: string, nodeId: string): string[];
}

export interface GraphNodeIdentityCore {
  id: string;
  path: string;
  relativePath: string;
  name: string;
}

export interface GraphNodeLookupIndex<TNode extends GraphNodeIdentityCore = GraphNodeIdentityCore> {
  getNode(nodeId: string): TNode | undefined;
  getAllNodes(): TNode[];
}

export interface GraphExpansionState {
  id: string;
  sourceNodeId: string;
  sourcePath: string;
  linkType: string;
  status: "expanded";
  childrenExpansionIds: string[];
}

export interface GraphRootExpansionState {
  roots?: string[];
  expansions?: GraphExpansionState[];
}

export interface GraphExpansionSource {
  nodeId: string;
  sourcePath: string;
  linkTypeId: string;
}

export interface GraphLinkEndpoints {
  parentNodeId: string;
  childNodeId: string;
}

export interface GraphNodeBadgeCore {
  linkTypeId: string;
  label: string;
  color: string;
  expanded: boolean;
  hasLinks: boolean;
}

export interface GraphFolderGroupCore {
  id: string;
  linkTypeId: string;
  color: string;
  opacity: number;
  anchorNodeId: string;
  nodeIds: string[];
}
