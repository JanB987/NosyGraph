import type { GraphPhysicsRuntimeInput } from "../graph-domain/GraphPhysicsRuntimeInput";
import type { GraphKinematicsPublishResult, GraphKinematicsStore } from "./GraphKinematicsStore";
import type { GraphPhysicsEngine } from "./GraphPhysicsEngine";

export type GraphPhysicsStepResult =
  | GraphKinematicsPublishResult
  | {
      applied: false;
      reason: "structural-revision-mismatch";
      expectedStructuralRevision: number;
      actualStructuralRevision: number;
    };

/** Coordinates physics stepping with protected kinematics publication. */
export class GraphPhysicsCoordinator {
  private structuralRevision: number | undefined;

  constructor(
    private readonly engine: GraphPhysicsEngine,
    private readonly kinematics: GraphKinematicsStore
  ) {}

  setInput(input: GraphPhysicsRuntimeInput): void {
    this.engine.setInput(input);
    this.structuralRevision = input.graph.structuralRevision;
  }

  start(): void { this.engine.start(); }
  reheat(amount?: number): void { this.engine.reheat(amount); }
  freeze(): void { this.engine.freeze(); }
  resume(): void { this.engine.resume(); }
  stop(): void { this.engine.stop(); }

  step(
    deltaTime: number,
    expectedSequence: number = this.kinematics.getSequence()
  ): GraphPhysicsStepResult {
    const actualSequence = this.kinematics.getSequence();
    if (expectedSequence !== actualSequence) {
      return {
        applied: false,
        reason: "sequence-mismatch",
        expectedSequence,
        actualSequence
      };
    }

    const frame = this.engine.step(deltaTime);
    if (this.structuralRevision !== undefined
      && frame.structuralRevision !== this.structuralRevision) {
      return {
        applied: false,
        reason: "structural-revision-mismatch",
        expectedStructuralRevision: this.structuralRevision,
        actualStructuralRevision: frame.structuralRevision
      };
    }
    return this.kinematics.publishFrame(frame, expectedSequence);
  }
}
