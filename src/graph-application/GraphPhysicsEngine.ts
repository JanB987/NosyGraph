import type { NodeInstanceId } from "../graph-domain/graph-identifiers";
import type { GraphKinematicsFrameInput } from "../graph-domain/GraphKinematicsFrame";
import type { GraphPoint, GraphVector } from "../graph-domain/GraphNodeInstance";
import type { GraphPhysicsRuntimeInput } from "../graph-domain/GraphPhysicsRuntimeInput";

export type GraphPhysicsEngineStatus = "stopped" | "running" | "frozen";

/** Host-neutral port implemented by any graph physics runtime. */
export interface GraphPhysicsEngine {
  setInput(input: GraphPhysicsRuntimeInput): void;
  getStatus(): GraphPhysicsEngineStatus;
  start(): void;
  reheat(amount?: number): void;
  freeze(): void;
  resume(): void;
  stop(): void;
  step(deltaTime: number): GraphKinematicsFrameInput;
  setNodePosition(nodeId: NodeInstanceId, point: GraphPoint): boolean;
}

/** Predictable linear-motion implementation used to test orchestration, not force parity. */
export class DeterministicGraphPhysicsEngine implements GraphPhysicsEngine {
  private status: GraphPhysicsEngineStatus = "stopped";
  private structuralRevision = 0;
  private positions = new Map<NodeInstanceId, GraphPoint>();
  private velocities = new Map<NodeInstanceId, GraphVector>();

  setInput(input: GraphPhysicsRuntimeInput): void {
    this.structuralRevision = input.graph.structuralRevision;
    this.positions = new Map(input.graph.nodes.map((node) => [node.id, { ...node.position }]));
    this.velocities = new Map(input.graph.nodes.map((node) => [node.id, { ...node.velocity }]));
    this.status = input.constraints.simulationFrozen ? "frozen" : this.status;
  }

  getStatus(): GraphPhysicsEngineStatus {
    return this.status;
  }

  start(): void {
    if (this.status !== "frozen") this.status = "running";
  }

  reheat(amount = 0.15): void {
    if (Number.isFinite(amount) && amount > 0) this.start();
  }

  freeze(): void {
    this.status = "frozen";
  }

  resume(): void {
    this.status = "running";
  }

  stop(): void {
    this.status = "stopped";
  }

  step(deltaTime: number): GraphKinematicsFrameInput {
    const delta = Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0;
    if (this.status === "running") {
      for (const [nodeId, position] of this.positions) {
        const velocity = this.velocities.get(nodeId) ?? { x: 0, y: 0 };
        this.positions.set(nodeId, {
          x: position.x + velocity.x * delta,
          y: position.y + velocity.y * delta
        });
      }
    }
    return {
      structuralRevision: this.structuralRevision,
      positions: new Map(Array.from(this.positions, ([id, point]) => [id, { ...point }])),
      velocities: new Map(Array.from(this.velocities, ([id, vector]) => [id, { ...vector }]))
    };
  }

  setNodePosition(nodeId: NodeInstanceId, point: GraphPoint): boolean {
    if (!this.positions.has(nodeId)) return false;
    this.positions.set(nodeId, { ...point });
    return true;
  }
}
