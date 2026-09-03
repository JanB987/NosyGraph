import type { GraphPhysicsShadowInputCapture } from "./GraphPhysicsShadowInputService";
import {
  GraphPhysicsShadowDiagnostics,
  type GraphPhysicsShadowComparison,
  type GraphPhysicsShadowSummary
} from "./GraphPhysicsShadowDiagnostics";

export interface GraphPhysicsShadowObservation {
  summary: GraphPhysicsShadowSummary;
  comparison?: GraphPhysicsShadowComparison;
}

export interface GraphPhysicsShadowObservationSink {
  onObservation(observation: GraphPhysicsShadowObservation): void;
}

/** Emits compact observations only when a caller explicitly requests one. */
export class GraphPhysicsShadowObserver {
  constructor(
    private readonly sink: GraphPhysicsShadowObservationSink,
    private readonly diagnostics = new GraphPhysicsShadowDiagnostics()
  ) {}

  observe(
    capture: GraphPhysicsShadowInputCapture,
    expected?: GraphPhysicsShadowSummary
  ): GraphPhysicsShadowObservation {
    const summary = this.diagnostics.summarize(capture);
    const observation: GraphPhysicsShadowObservation = {
      summary,
      ...(expected
        ? { comparison: this.diagnostics.compare(expected, summary) }
        : {})
    };
    this.sink.onObservation(observation);
    return observation;
  }
}
