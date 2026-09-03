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

/** Runs one isolated replacement-engine step against detached live input. */
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
}
