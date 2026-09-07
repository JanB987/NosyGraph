import type { GraphKinematicsFrame } from "../graph-domain/GraphKinematicsFrame";
import {
  GraphKinematicsFrameDiagnostics,
  type GraphKinematicsFrameSummary
} from "./GraphKinematicsFrameDiagnostics";
import {
  DeterministicGraphPhysicsEngine,
  type GraphPhysicsEngine
} from "./GraphPhysicsEngine";
import {
  GraphPhysicsShadowDiagnostics,
  type GraphPhysicsShadowSummary
} from "./GraphPhysicsShadowDiagnostics";
import type { GraphPhysicsShadowCaptureSource } from "./GraphPhysicsShadowSampleService";

export interface GraphPhysicsExperimentResult {
  input: GraphPhysicsShadowSummary;
  frame: GraphKinematicsFrame;
  frameSummary: GraphKinematicsFrameSummary;
}

export interface GraphPhysicsExperimentTraceResult {
  input: GraphPhysicsShadowSummary;
  frames: readonly GraphKinematicsFrame[];
  frameSummaries: readonly GraphKinematicsFrameSummary[];
}

/** Runs one replacement-engine step against a detached input capture. */
export class GraphPhysicsExperimentRunner {
  constructor(
    private readonly inputSource: GraphPhysicsShadowCaptureSource,
    private readonly engineFactory: () => GraphPhysicsEngine =
      () => new DeterministicGraphPhysicsEngine(),
    private readonly inputDiagnostics = new GraphPhysicsShadowDiagnostics(),
    private readonly frameDiagnostics = new GraphKinematicsFrameDiagnostics()
  ) {}

  run(frameSequence: number, deltaTime: number): GraphPhysicsExperimentResult {
    const capture = this.inputSource.captureArchitecturePhysicsInput(frameSequence);
    const engine = this.engineFactory();
    engine.setInput(capture.input);
    engine.start();
    const frameInput = engine.step(deltaTime);
    engine.stop();
    const frame: GraphKinematicsFrame = { sequence: frameSequence, ...frameInput };

    return {
      input: this.inputDiagnostics.summarize(capture),
      frame,
      frameSummary: this.frameDiagnostics.summarize(frame)
    };
  }

  /**
   * Runs several positive steps from one captured starting state.
   * The engine is retained for the trace and discarded afterward.
   */
  runSteps(
    frameSequence: number,
    deltaTime: number,
    stepCount: number
  ): GraphPhysicsExperimentTraceResult {
    const capture = this.inputSource.captureArchitecturePhysicsInput(frameSequence);
    const engine = this.engineFactory();
    engine.setInput(capture.input);
    engine.start();

    const frames: GraphKinematicsFrame[] = [];
    const frameSummaries: GraphKinematicsFrameSummary[] = [];
    const count = normalizeStepCount(stepCount);
    for (let index = 0; index < count; index += 1) {
      const frameInput = engine.step(deltaTime);
      const frame: GraphKinematicsFrame = {
        sequence: frameSequence + index,
        ...frameInput
      };
      frames.push(frame);
      frameSummaries.push(this.frameDiagnostics.summarize(frame));
    }
    engine.stop();

    return {
      input: this.inputDiagnostics.summarize(capture),
      frames,
      frameSummaries
    };
  }
}

function normalizeStepCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
