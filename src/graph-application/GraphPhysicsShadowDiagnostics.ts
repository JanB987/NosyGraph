import type { GraphPhysicsShadowInputCapture } from "./GraphPhysicsShadowInputService";

export interface GraphPhysicsShadowSummary {
  structuralRevision: number;
  frameSequence: number;
  nodeCount: number;
  edgeCount: number;
  linkPolicyCount: number;
  simulationFrozen: boolean;
  persistentPinCount: number;
  positionLockCount: number;
  dragTargetCount: number;
  directionTargetCount: number;
  velocityFreezeCount: number;
  parentContainerCount: number;
  embeddedContainerCount: number;
  ignoredLegacyConstraintCount: number;
  ignoredEdgeCount: number;
  ignoredTransientConstraintCount: number;
  rejectedContainerCount: number;
  ignoredContainerMemberCount: number;
  ignoredContainerParentCount: number;
}

export interface GraphPhysicsShadowDifference {
  field: keyof GraphPhysicsShadowSummary;
  expected: number | boolean;
  actual: number | boolean;
}

export type GraphPhysicsShadowComparison =
  | { matches: true; differences: readonly [] }
  | { matches: false; differences: readonly GraphPhysicsShadowDifference[] };

/** Produces and compares small structural summaries without retaining graph data. */
export class GraphPhysicsShadowDiagnostics {
  summarize(capture: GraphPhysicsShadowInputCapture): GraphPhysicsShadowSummary {
    const transient = capture.input.constraints.transientNodeConstraints;
    const containers = capture.input.containers.containers;
    return {
      structuralRevision: capture.input.graph.structuralRevision,
      frameSequence: capture.input.graph.frameSequence,
      nodeCount: capture.input.graph.nodes.length,
      edgeCount: capture.input.graph.edges.length,
      linkPolicyCount: capture.input.settings.linkPolicies.size,
      simulationFrozen: capture.input.constraints.simulationFrozen,
      persistentPinCount: capture.input.constraints.persistentPins.length,
      positionLockCount: transient.filter((item) => item.kind === "position-lock").length,
      dragTargetCount: transient.filter((item) => item.kind === "drag-target").length,
      directionTargetCount: transient.filter((item) => item.kind === "direction-target").length,
      velocityFreezeCount: transient.filter((item) => item.kind === "velocity-freeze").length,
      parentContainerCount: containers.filter((item) => item.kind === "parent").length,
      embeddedContainerCount: containers.filter((item) => item.kind === "embedded").length,
      ignoredLegacyConstraintCount:
        capture.diagnostics.legacy.ignoredConstraintEntryCount,
      ignoredEdgeCount: capture.diagnostics.graph.ignoredEdgeIds.length,
      ignoredTransientConstraintCount:
        capture.diagnostics.constraints.ignoredTransientConstraints.length,
      rejectedContainerCount: capture.diagnostics.containers.rejectedContainers.length,
      ignoredContainerMemberCount:
        capture.diagnostics.containers.ignoredMemberReferences.length,
      ignoredContainerParentCount:
        capture.diagnostics.containers.ignoredParentReferences.length
    };
  }

  compare(
    expected: GraphPhysicsShadowSummary,
    actual: GraphPhysicsShadowSummary
  ): GraphPhysicsShadowComparison {
    const differences: GraphPhysicsShadowDifference[] = [];
    for (const field of Object.keys(expected) as Array<keyof GraphPhysicsShadowSummary>) {
      if (expected[field] === actual[field]) continue;
      differences.push({ field, expected: expected[field], actual: actual[field] });
    }
    return differences.length === 0
      ? { matches: true, differences: [] }
      : { matches: false, differences };
  }
}
