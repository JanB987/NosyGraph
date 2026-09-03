import {
  GraphKinematicsFrameComparator,
  type GraphKinematicsComparisonOptions,
  type GraphKinematicsFrameComparisonResult
} from "./GraphKinematicsFrameComparator";
import type { GraphPhysicsExperimentResult } from "./GraphPhysicsExperimentRunner";
import type { LegacyGraphKinematicsCaptureSource } from "./GraphPhysicsShadowSampleService";
import type { LegacyGraphKinematicsReadResult } from "./LegacyGraphKinematicsAdapter";

export interface GraphPhysicsExperimentSource {
  run(frameSequence: number, deltaTime: number): GraphPhysicsExperimentResult;
}

export interface GraphPhysicsParityOptions extends GraphKinematicsComparisonOptions {
  deltaTime?: number;
}

export interface GraphPhysicsParityResult {
  legacyFrameDiagnostics: LegacyGraphKinematicsReadResult["diagnostics"];
  experiment: GraphPhysicsExperimentResult;
  comparison: GraphKinematicsFrameComparisonResult;
}

/** Compares copied legacy motion with one isolated replacement-engine experiment. */
export class GraphPhysicsParityService {
  constructor(
    private readonly legacyFrames: LegacyGraphKinematicsCaptureSource,
    private readonly experiments: GraphPhysicsExperimentSource,
    private readonly comparator = new GraphKinematicsFrameComparator()
  ) {}

  compare(
    frameSequence: number,
    options: GraphPhysicsParityOptions = {}
  ): GraphPhysicsParityResult {
    const legacy = this.legacyFrames.captureLegacyKinematicsFrame(frameSequence);
    const experiment = this.experiments.run(
      frameSequence,
      normalizeDeltaTime(options.deltaTime)
    );
    return {
      legacyFrameDiagnostics: legacy.diagnostics,
      experiment,
      comparison: this.comparator.compare(legacy.frame, experiment.frame, options)
    };
  }
}

function normalizeDeltaTime(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}
