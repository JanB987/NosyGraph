import type { NodeInstanceId } from "../graph-domain/graph-identifiers";
import { GraphContainerConfinement } from "../graph-domain/GraphContainerConfinement";
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
}

/** Experimental engine composed from extracted pure legacy-compatible stages. */
export class StagedGraphPhysicsEngine implements GraphPhysicsEngine {
  private status: GraphPhysicsEngineStatus = "stopped";
  private input: GraphPhysicsRuntimeInput | undefined;
  private frame: GraphKinematicsFrameInput = {
    structuralRevision: 0, positions: new Map(), velocities: new Map()
  };
  private lastStepDiagnostics: StagedGraphPhysicsStepDiagnostics | undefined;

  constructor(
    private readonly forces = new GraphForceAccumulator(),
    private readonly integrator = new GraphMotionIntegrator(),
    private readonly confinement = new GraphContainerConfinement()
  ) {}

  setInput(input: GraphPhysicsRuntimeInput): void {
    this.input = input;
    this.frame = {
      structuralRevision: input.graph.structuralRevision,
      positions: new Map(input.graph.nodes.map((node) => [node.id, { ...node.position }])),
      velocities: new Map(input.graph.nodes.map((node) => [node.id, { ...node.velocity }]))
    };
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
    const forces = this.forces.accumulate(stepInput);
    const integration = this.integrator.integrate(stepInput, forces.velocityDeltas);
    const confinement = this.confinement.constrain(
      integration.frame, stepInput.graph.nodes, stepInput.containers
    );
    this.frame = copyFrame(confinement.frame);
    this.lastStepDiagnostics = {
      forces: forces.diagnostics,
      integration: {
        maxVelocity: integration.maxVelocity,
        outcomes: new Map(integration.outcomes)
      },
      confinement: confinement.diagnostics
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
      forces: { ...this.lastStepDiagnostics.forces },
      integration: {
        maxVelocity: this.lastStepDiagnostics.integration.maxVelocity,
        outcomes: new Map(this.lastStepDiagnostics.integration.outcomes)
      },
      confinement: {
        ...this.lastStepDiagnostics.confinement,
        missingSampleNodeIds: [...this.lastStepDiagnostics.confinement.missingSampleNodeIds]
      }
    };
  }

  private inputWithCurrentMotion(): GraphPhysicsRuntimeInput {
    const input = this.input!;
    return {
      ...input,
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
}

function copyFrame(frame: GraphKinematicsFrameInput): GraphKinematicsFrameInput {
  return {
    structuralRevision: frame.structuralRevision,
    positions: new Map(Array.from(frame.positions, ([id, point]) => [id, { ...point }])),
    velocities: new Map(Array.from(frame.velocities, ([id, vector]) => [id, { ...vector }]))
  };
}
