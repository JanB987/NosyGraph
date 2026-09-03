import {
  GraphKinematicsFrameDiagnostics,
  type GraphKinematicsFrameSummary
} from "./GraphKinematicsFrameDiagnostics";
import {
  GraphPhysicsShadowDiagnostics,
  type GraphPhysicsShadowSummary
} from "./GraphPhysicsShadowDiagnostics";
import type { GraphPhysicsShadowInputCapture } from "./GraphPhysicsShadowInputService";
import type { LegacyGraphKinematicsReadResult } from "./LegacyGraphKinematicsAdapter";

export interface GraphPhysicsShadowCaptureSource {
  captureArchitecturePhysicsInput(frameSequence: number): GraphPhysicsShadowInputCapture;
}

export interface LegacyGraphKinematicsCaptureSource {
  captureLegacyKinematicsFrame(frameSequence: number): LegacyGraphKinematicsReadResult;
}

export interface GraphPhysicsShadowSampleEvidence {
  input: GraphPhysicsShadowSummary;
  frame: GraphKinematicsFrameSummary;
  legacyFrameDiagnostics: LegacyGraphKinematicsReadResult["diagnostics"];
}

export type GraphPhysicsShadowSample =
  | ({ status: "ready" } & GraphPhysicsShadowSampleEvidence)
  | ({
      status: "revision-mismatch";
      inputStructuralRevision: number;
      frameStructuralRevision: number;
    } & GraphPhysicsShadowSampleEvidence);

/** Joins compact input and motion evidence only when both see one topology revision. */
export class GraphPhysicsShadowSampleService {
  constructor(
    private readonly inputSource: GraphPhysicsShadowCaptureSource,
    private readonly frameSource: LegacyGraphKinematicsCaptureSource,
    private readonly inputDiagnostics = new GraphPhysicsShadowDiagnostics(),
    private readonly frameDiagnostics = new GraphKinematicsFrameDiagnostics()
  ) {}

  capture(frameSequence: number): GraphPhysicsShadowSample {
    const inputCapture = this.inputSource.captureArchitecturePhysicsInput(frameSequence);
    const frameCapture = this.frameSource.captureLegacyKinematicsFrame(frameSequence);
    const evidence: GraphPhysicsShadowSampleEvidence = {
      input: this.inputDiagnostics.summarize(inputCapture),
      frame: this.frameDiagnostics.summarize(frameCapture.frame),
      legacyFrameDiagnostics: frameCapture.diagnostics
    };
    const inputStructuralRevision = evidence.input.structuralRevision;
    const frameStructuralRevision = evidence.frame.structuralRevision;

    return inputStructuralRevision === frameStructuralRevision
      ? { status: "ready", ...evidence }
      : {
          status: "revision-mismatch",
          inputStructuralRevision,
          frameStructuralRevision,
          ...evidence
        };
  }
}
