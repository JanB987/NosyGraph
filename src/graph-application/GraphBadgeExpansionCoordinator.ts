import type { O3LinkType } from "../O3LinkType";

export interface GraphBadgeExpansionNode {
  id: string;
  sourcePath: string;
  stateOwnerPath?: string;
  embeddedInstanceId?: string;
}

export interface GraphBadgeExpansionRuntime<TNode extends GraphBadgeExpansionNode, TFile> {
  getSourcePath(file: TFile): string;
  getNode(nodeId: string): TNode | undefined;
  expandEmbedded(node: TNode, linkType: O3LinkType): void;
  expandParent(node: TNode, linkType: string): void;
  toggleLinkType(file: TFile, linkType: string, sourceNodeId?: string): void;
}

/**
 * Interprets a badge expansion command and delegates the graph-specific effect
 * to a runtime port. It owns no Obsidian reads, node collections, or rendering.
 */
export class GraphBadgeExpansionCoordinator<
  TNode extends GraphBadgeExpansionNode,
  TFile
> {
  constructor(
    private readonly runtime: GraphBadgeExpansionRuntime<TNode, TFile>,
    private readonly normalizeLinkType: (value: string) => string
  ) {}

  expandFromNode(sourceFile: TFile, linkType: O3LinkType, sourceNodeId?: string): void {
    const runtimeSourceNodeId = String(sourceNodeId ?? "").trim() || this.runtime.getSourcePath(sourceFile).trim();
    const embeddedSourceNode = this.runtime.getNode(runtimeSourceNodeId);
    if (embeddedSourceNode?.stateOwnerPath && embeddedSourceNode.embeddedInstanceId) {
      this.runtime.expandEmbedded(embeddedSourceNode, linkType);
      return;
    }

    const property = this.normalizeLinkType(String(linkType.property ?? ""));
    if (!property) return;
    if (linkType.semantic === "parent") {
      const sourceNode = this.runtime.getNode(runtimeSourceNodeId)
        ?? this.runtime.getNode(this.runtime.getSourcePath(sourceFile).trim());
      if (sourceNode) this.runtime.expandParent(sourceNode, property);
      return;
    }
    this.runtime.toggleLinkType(sourceFile, property, sourceNodeId);
  }
}
