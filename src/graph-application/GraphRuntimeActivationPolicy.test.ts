import { describe, expect, it } from "vitest";
import {
  CURRENT_GRAPH_RUNTIME_ACTIVATION_EVIDENCE,
  evaluateGraphRuntimeActivation,
  type GraphRuntimeActivationEvidence
} from "./GraphRuntimeActivationPolicy";

describe("GraphRuntimeActivationPolicy", () => {
  it("keeps store mode non-default while required evidence is missing", () => {
    const decision = evaluateGraphRuntimeActivation(CURRENT_GRAPH_RUNTIME_ACTIVATION_EVIDENCE);
    expect(decision.storeModeDefault).toBe(false);
    expect(decision.unmetGates).toEqual([
      "controlled-physics-parity",
      "manual-badge-regression",
      "interactive-physics-verification",
      "ownership-cutover"
    ]);
  });

  it("allows store mode to become the default only when every gate is recorded", () => {
    const evidence: GraphRuntimeActivationEvidence = {
      automatedRegression: true,
      controlledPhysicsParity: true,
      manualBadgeRegression: true,
      interactivePhysicsVerification: true,
      persistenceParity: true,
      lifecycleParity: true,
      ownershipCutover: true
    };
    expect(evaluateGraphRuntimeActivation(evidence)).toEqual({
      storeModeDefault: true,
      unmetGates: []
    });
  });
});