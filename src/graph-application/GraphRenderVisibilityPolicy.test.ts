import { describe, expect, it } from "vitest";
import { GraphRenderVisibilityPolicy } from "./GraphRenderVisibilityPolicy";

describe("GraphRenderVisibilityPolicy", () => {
  const policy = new GraphRenderVisibilityPolicy();

  it("renders a selected relationship when both endpoint notes are already visible", () => {
    expect(policy.shouldRenderRelationshipEdge({
      selected: true,
      parentSemantic: false,
      duplicateNodes: false,
      discoveryEnabled: true,
      targetAlreadyVisible: true
    })).toBe(true);
  });

  it("does not turn existing-node edge rendering into node discovery", () => {
    expect(policy.shouldRenderRelationshipEdge({
      selected: true,
      parentSemantic: false,
      duplicateNodes: false,
      discoveryEnabled: true,
      targetAlreadyVisible: false
    })).toBe(false);
  });

  it("leaves parent and duplicate relationships to their specialized render paths", () => {
    const baseline = {
      selected: true,
      discoveryEnabled: true,
      targetAlreadyVisible: true
    };
    expect(policy.shouldRenderRelationshipEdge({
      ...baseline,
      parentSemantic: true,
      duplicateNodes: false
    })).toBe(false);
    expect(policy.shouldRenderRelationshipEdge({
      ...baseline,
      parentSemantic: false,
      duplicateNodes: true
    })).toBe(false);
  });

  it("keeps populated badges visible and reveals empty badges through selection", () => {
    const baseline = {
      marqueeSelectionActive: false,
      dragging: false,
      draggedNode: false,
      showAll: false,
      selected: false,
      dragRevealTarget: false
    };
    expect(policy.shouldShowNodeBadges({
      ...baseline,
      hasQualifyingRelationship: true
    })).toBe(true);
    expect(policy.shouldShowNodeBadges({
      ...baseline,
      selected: true,
      hasQualifyingRelationship: false
    })).toBe(true);
    expect(policy.shouldShowNodeBadges({
      ...baseline,
      hasQualifyingRelationship: false
    })).toBe(false);
  });

  it("keeps drag and marquee suppression behavior intact", () => {
    expect(policy.shouldShowNodeBadges({
      marqueeSelectionActive: true,
      dragging: false,
      draggedNode: false,
      showAll: true,
      selected: true,
      dragRevealTarget: true,
      hasQualifyingRelationship: true
    })).toBe(false);
    expect(policy.shouldShowNodeBadges({
      marqueeSelectionActive: false,
      dragging: true,
      draggedNode: true,
      showAll: true,
      selected: true,
      dragRevealTarget: true,
      hasQualifyingRelationship: true
    })).toBe(false);
  });

  it("keeps ordinary edges at least one screen pixel wide at far zoom", () => {
    expect(policy.getEdgeLineWidth({
      baseWidth: 2,
      zoom: 0.18,
      renderScale: 1,
      highlighted: false,
      parentSemantic: false
    })).toBe(1);
    expect(policy.getEdgeLineWidth({
      baseWidth: 2,
      zoom: 1,
      renderScale: 1,
      highlighted: false,
      parentSemantic: false
    })).toBe(2);
  });
});
