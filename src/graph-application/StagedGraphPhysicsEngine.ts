import type { NodeInstanceId } from "../graph-domain/graph-identifiers";
import { GraphContainerConfinement } from "../graph-domain/GraphContainerConfinement";
import { GraphContainerAnchoring, type GraphContainerAnchoringResult } from "../graph-domain/GraphContainerAnchoring";
import {
  copyGraphPhysicsAnchoringState,
  reconcileGraphPhysicsAnchoringState,
  type GraphPhysicsAnchoringReconciliation,
  type GraphPhysicsAnchoringState
} from "../graph-domain/GraphPhysicsAnchoringState";
import { copyGraphPhysicsContainerState, type GraphPhysicsContainerState } from "../graph-domain/GraphPhysicsContainers";
import { copyGraphPhysicsConstraintState } from "../graph-domain/GraphPhysicsConstraints";
import { GraphForceAccumulator, type GraphForceAccumulationResult } from "../graph-domain/GraphForceAccumulator";
import type { GraphKinematicsFrameInput } from "../graph-domain/GraphKinematicsFrame";
import { GraphMotionIntegrator, type GraphMotionIntegrationResult } from "../graph-domain/GraphMotionIntegrator";
import type { GraphPoint } from "../graph-domain/GraphNodeInstance";
import type { GraphPhysicsRuntimeInput } from "../graph-domain/GraphPhysicsRuntimeInput";
import type { GraphPhysicsEngine, GraphPhysicsEngineStatus } from "./GraphPhysicsEngine";

export interface StagedGraphPhysicsStepDiagnostics {
  forces: GraphForceAccumulationResult["diagnostics"];
  integration: Pick<GraphMotionIntegrationResult, "maxVelocity" | "outcomes">;
  confinement: ReturnType<GraphContainerConfinement["constrain"]>["diagnostics"];
  anchoring: GraphContainerAnchoringResult["diagnostics"];
  finalConfinement: ReturnType<GraphContainerConfinement["constrain"]>["diagnostics"];
}

/** Experimental engine composed from extracted pure legacy-compatible stages. */
export class StagedGraphPhysicsEngine implements GraphPhysicsEngine {
  private status: GraphPhysicsEngineStatus = "stopped";
  private input: GraphPhysicsRuntimeInput | undefined;
  private frame: GraphKinematicsFrameInput = {
    structuralRevision: 0, positions: new Map(), velocities: new Map()
  };
  private lastStepDiagnostics: StagedGraphPhysicsStepDiagnostics | undefined;
  private containers: GraphPhysicsContainerState = { containers: [] };
  private anchoringState: GraphPhysicsAnchoringState | undefined;
  private anchoringReconciliation: GraphPhysicsAnchoringReconciliation["diagnostics"] | undefined;

  constructor(
    private readonly forces = new GraphForceAccumulator(),
    private readonly integrator = new GraphMotionIntegrator(),
    private readonly confinement = new GraphContainerConfinement(),
    private readonly anchoring = new GraphContainerAnchoring()
  ) {}

  setInput(input: GraphPhysicsRuntimeInput): void {
    const nextContainers = copyGraphPhysicsContainerState(input.containers);
    const nextAnchoringSeed = input.anchoring
      ? copyGraphPhysicsAnchoringState(input.anchoring)
      : undefined;
    const reconciliation = reconcileGraphPhysicsAnchoringState(
      this.anchoringState,
      this.input?.containers,
      nextAnchoringSeed,
      nextContainers,
      new Set(input.graph.nodes.map((node) => node.id))
    );
    this.input = {
      graph: { ...input.graph,
        nodes: input.graph.nodes.map((node) => ({
          ...node, position: { ...node.position }, velocity: { ...node.velocity }
        })),
        edges: input.graph.edges.map((edge) => ({ ...edge }))
      },
      settings: { ...input.settings, defaultLinkPolicy: { ...input.settings.defaultLinkPolicy },
        linkPolicies: new Map(Array.from(input.settings.linkPolicies, ([id, policy]) => [id, { ...policy }]))
      },
      constraints: copyGraphPhysicsConstraintState(input.constraints),
      containers: nextContainers
    };
    this.anchoringState = reconciliation.state;
    this.anchoringReconciliation = reconciliation.diagnostics;
    this.containers = copyGraphPhysicsContainerState(nextContainers);
    // The seed's runtime bounds also drive the first force and confinement pass.
    for (const container of this.containers.containers) {
      const anchor = this.anchoringState?.anchors.get(container.id);
      if (anchor) container.bounds = { ...anchor.bounds };
    }
    this.frame = reconcileFrame(
      this.input ? this.frame : undefined,
      input.graph.structuralRevision,
      input.graph.nodes
    );
    this.lastStepDiagnostics = undefined;
    if (input.constraints.simulationFrozen) this.status = "frozen";
  }

  getStatus(): GraphPhysicsEngineStatus { return this.status; }
  start(): void { if (this.status !== "frozen") this.status = "running"; }
  reheat(amount = 0.15): void {
    if (Number.isFinite(amount) && amount > 0) this.start();
  }
  freeze(): void { this.status = "frozen"; }
  resume(): void { this.status = "running"; }
  stop(): void { this.status = "stopped"; }

  step(deltaTime: number): GraphKinematicsFrameInput {
    if (!this.input || this.status !== "running" || !Number.isFinite(deltaTime) || deltaTime <= 0) {
      return copyFrame(this.frame);
    }
    const stepInput = this.inputWithCurrentMotion();
    const state = this.requireAnchoringState();
    const forces = this.forces.accumulate(stepInput);
    const integration = this.integrator.integrate(stepInput, forces.velocityDeltas);
    const confinement = this.confinement.constrain(
      integration.frame,
      stepInput.graph.nodes.filter((node) => integration.outcomes.get(node.id) === "integrated"),
      stepInput.containers
    );
    const anchoring = this.anchoring.anchor({
      frame: confinement.frame, nodes: stepInput.graph.nodes, containers: stepInput.containers,
      ...state, restVelocityThreshold: stepInput.settings.restVelocityThreshold
    });
    const finalConfinement = this.confinement.constrain(
      anchoring.frame, stepInput.graph.nodes, anchoring.containers
    );
    this.frame = copyFrame(finalConfinement.frame);
    this.containers = copyGraphPhysicsContainerState(anchoring.containers);
    this.anchoringState = copyGraphPhysicsAnchoringState({
      ...state, anchors: anchoring.anchors, fixedCoordinates: anchoring.fixedCoordinates
    });
    this.lastStepDiagnostics = {
      forces: forces.diagnostics,
      integration: {
        maxVelocity: integration.maxVelocity,
        outcomes: new Map(integration.outcomes)
      },
      confinement: confinement.diagnostics,
      anchoring: anchoring.diagnostics,
      finalConfinement: finalConfinement.diagnostics
    };
    return copyFrame(this.frame);
  }

  setNodePosition(nodeId: NodeInstanceId, point: GraphPoint): boolean {
    if (!this.frame.positions.has(nodeId)) return false;
    const positions = new Map(this.frame.positions);
    positions.set(nodeId, { ...point });
    this.frame = { ...this.frame, positions };
    return true;
  }

  getLastStepDiagnostics(): StagedGraphPhysicsStepDiagnostics | undefined {
    if (!this.lastStepDiagnostics) return undefined;
    return {
      forces: { ...this.lastStepDiagnostics.forces,
        skippedSeparatedEdgeIds: [...this.lastStepDiagnostics.forces.skippedSeparatedEdgeIds],
        skippedDirectionEdgeIds: [...this.lastStepDiagnostics.forces.skippedDirectionEdgeIds]
      },
      integration: {
        maxVelocity: this.lastStepDiagnostics.integration.maxVelocity,
        outcomes: new Map(this.lastStepDiagnostics.integration.outcomes)
      },
      confinement: {
        ...this.lastStepDiagnostics.confinement,
        missingSampleNodeIds: [...this.lastStepDiagnostics.confinement.missingSampleNodeIds]
      },
      anchoring: {
        ...this.lastStepDiagnostics.anchoring,
        missingOriginContainerIds: [...this.lastStepDiagnostics.anchoring.missingOriginContainerIds],
        missingAnchorContainerIds: [...this.lastStepDiagnostics.anchoring.missingAnchorContainerIds],
        missingMemberReferences: this.lastStepDiagnostics.anchoring.missingMemberReferences.map((item) => ({ ...item }))
      },
      finalConfinement: {
        ...this.lastStepDiagnostics.finalConfinement,
        missingSampleNodeIds: [...this.lastStepDiagnostics.finalConfinement.missingSampleNodeIds]
      }
    };
  }

  private inputWithCurrentMotion(): GraphPhysicsRuntimeInput {
    const input = this.input!;
    return {
      ...input,
      containers: copyGraphPhysicsContainerState(this.containers),
      graph: {
        ...input.graph,
        nodes: input.graph.nodes.map((node) => ({
          ...node,
          position: { ...(this.frame.positions.get(node.id) ?? node.position) },
          velocity: { ...(this.frame.velocities.get(node.id) ?? node.velocity) }
        }))
      }
    };
  }

  /** Detached inspection; setInput always starts a new simulation from its supplied seed. */
  getAnchoringState(): GraphPhysicsAnchoringState | undefined {
    return this.anchoringState && copyGraphPhysicsAnchoringState(this.anchoringState);
  }

  getAnchoringReconciliation(): GraphPhysicsAnchoringReconciliation["diagnostics"] | undefined {
    if (!this.anchoringReconciliation) return undefined;
    return {
      preservedContainerIds: [...this.anchoringReconciliation.preservedContainerIds],
      resetContainers: this.anchoringReconciliation.resetContainers.map((item) => ({ ...item })),
      addedContainerIds: [...this.anchoringReconciliation.addedContainerIds],
      removedContainerIds: [...this.anchoringReconciliation.removedContainerIds],
      preservedFixedCoordinateNodeIds: [...this.anchoringReconciliation.preservedFixedCoordinateNodeIds],
      addedFixedCoordinateNodeIds: [...this.anchoringReconciliation.addedFixedCoordinateNodeIds],
      removedFixedCoordinateNodeIds: [...this.anchoringReconciliation.removedFixedCoordinateNodeIds],
      missingSeedContainerIds: [...this.anchoringReconciliation.missingSeedContainerIds]
    };
  }

  private requireAnchoringState(): GraphPhysicsAnchoringState {
    const state = this.anchoringState;
    if (!state) throw new Error("Staged container stepping requires an explicit anchoring seed.");
    if (!Number.isFinite(state.minimumViewportSize) || state.minimumViewportSize < 44) {
      throw new Error("Anchoring minimumViewportSize must be finite and at least 44.");
    }
    for (const container of this.containers.containers) {
      if (!state.anchors.has(container.id)) {
        throw new Error(`Missing anchoring state for container: ${container.id}`);
      }
    }
    return state;
  }
}

function copyFrame(frame: GraphKinematicsFrameInput): GraphKinematicsFrameInput {
  return {
    structuralRevision: frame.structuralRevision,
    positions: new Map(Array.from(frame.positions, ([id, point]) => [id, { ...point }])),
    velocities: new Map(Array.from(frame.velocities, ([id, vector]) => [id, { ...vector }]))
  };
}

function reconcileFrame(
  previous: GraphKinematicsFrameInput | undefined,
  structuralRevision: number,
  nodes: GraphPhysicsRuntimeInput["graph"]["nodes"]
): GraphKinematicsFrameInput {
  const positions = new Map(
    nodes.map((node) => [
      node.id,
      { ...(previous?.positions.get(node.id) ?? node.position) }
    ])
  );
  const velocities = new Map(
    nodes.map((node) => [
      node.id,
      { ...(previous?.velocities.get(node.id) ?? node.velocity) }
    ])
  );
  return { structuralRevision, positions, velocities };
}
