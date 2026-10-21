export interface GraphRelationshipEdgeVisibilityInput {
  selected: boolean;
  parentSemantic: boolean;
  duplicateNodes: boolean;
  discoveryEnabled: boolean;
  targetAlreadyVisible: boolean;
}

export interface GraphNodeBadgeVisibilityInput {
  marqueeSelectionActive: boolean;
  dragging: boolean;
  draggedNode: boolean;
  showAll: boolean;
  selected: boolean;
  dragRevealTarget: boolean;
}

export interface GraphBadgeDefinitionVisibilityInput extends GraphNodeBadgeVisibilityInput {
  semantic: "link" | "parent" | "lens";
  hasRelationships: boolean;
}

export interface GraphEdgeLineWidthInput {
  baseWidth: number;
  zoom: number;
  renderScale: number;
  highlighted: boolean;
  parentSemantic: boolean;
}

/**
 * Host-neutral presentation policy for relationships that already belong to
 * the visible graph. It does not discover notes, mutate expansion ownership,
 * or access renderer/Obsidian state.
 */
export class GraphRenderVisibilityPolicy {
  shouldRenderRelationshipEdge(input: GraphRelationshipEdgeVisibilityInput): boolean {
    return input.selected
      && !input.parentSemantic
      && !input.duplicateNodes
      && input.discoveryEnabled
      && input.targetAlreadyVisible;
  }

  shouldShowNodeBadges(input: GraphNodeBadgeVisibilityInput): boolean {
    if (input.marqueeSelectionActive) return false;
    if (input.dragging) {
      if (input.draggedNode) return false;
      return input.showAll || input.selected || input.dragRevealTarget;
    }
    return input.showAll
      || input.selected
      || input.dragRevealTarget;
  }

  /**
   * Ordinary badges retain the selected-node rule. Lens badges are the only
   * exception: an eligible unselected node may expose a compact badge, while
   * selection/show-all/drag reveal still exposes empty Lens definitions.
   */
  shouldShowBadge(input: GraphBadgeDefinitionVisibilityInput): boolean {
    if (input.marqueeSelectionActive) return false;
    const selectedContext = input.showAll || input.selected || input.dragRevealTarget;
    if (input.dragging && input.draggedNode) return false;
    if (selectedContext) return true;
    return input.semantic === "lens" && input.hasRelationships;
  }

  getEdgeLineWidth(input: GraphEdgeLineWidthInput): number {
    const baseWidth = Number.isFinite(input.baseWidth) ? Math.max(0, input.baseWidth) : 1;
    const zoom = Number.isFinite(input.zoom) ? Math.max(0, input.zoom) : 1;
    const renderScale = Number.isFinite(input.renderScale) ? Math.max(0, input.renderScale) : 1;
    const scaled = Math.max(1, baseWidth * zoom * renderScale);
    if (input.highlighted) return Math.max(scaled, 1.4);
    if (input.parentSemantic) return Math.max(scaled, 1);
    return scaled;
  }
}
