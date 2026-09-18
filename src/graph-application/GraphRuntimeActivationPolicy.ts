export type GraphRuntimeActivationGate =
  | "automated-regression"
  | "controlled-physics-parity"
  | "manual-badge-regression"
  | "interactive-physics-verification"
  | "persistence-parity"
  | "lifecycle-parity"
  | "ownership-cutover";

export interface GraphRuntimeActivationEvidence {
  automatedRegression: boolean;
  controlledPhysicsParity: boolean;
  manualBadgeRegression: boolean;
  interactivePhysicsVerification: boolean;
  persistenceParity: boolean;
  lifecycleParity: boolean;
  ownershipCutover: boolean;
}

export interface GraphRuntimeActivationDecision {
  storeModeDefault: boolean;
  unmetGates: readonly GraphRuntimeActivationGate[];
}

const GATES: readonly [
  GraphRuntimeActivationGate,
  keyof GraphRuntimeActivationEvidence
][] = [
  ["automated-regression", "automatedRegression"],
  ["controlled-physics-parity", "controlledPhysicsParity"],
  ["manual-badge-regression", "manualBadgeRegression"],
  ["interactive-physics-verification", "interactivePhysicsVerification"],
  ["persistence-parity", "persistenceParity"],
  ["lifecycle-parity", "lifecycleParity"],
  ["ownership-cutover", "ownershipCutover"]
];

/** Evaluates whether evidence is strong enough to make store mode default. */
export function evaluateGraphRuntimeActivation(
  evidence: GraphRuntimeActivationEvidence
): GraphRuntimeActivationDecision {
  const unmetGates = GATES
    .filter(([, key]) => evidence[key] !== true)
    .map(([gate]) => gate);
  return {
    storeModeDefault: unmetGates.length === 0,
    unmetGates
  };
}

/** Conservative evidence state used until live parity work is recorded. */
export const CURRENT_GRAPH_RUNTIME_ACTIVATION_EVIDENCE: GraphRuntimeActivationEvidence = {
  automatedRegression: true,
  controlledPhysicsParity: false,
  manualBadgeRegression: false,
  interactivePhysicsVerification: false,
  persistenceParity: true,
  lifecycleParity: true,
  ownershipCutover: false
};