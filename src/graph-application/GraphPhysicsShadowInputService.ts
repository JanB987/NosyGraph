import type { GraphPhysicsRuntimeInput } from "../graph-domain/GraphPhysicsRuntimeInput";
import type { GraphRuntimeState } from "./GraphRuntimeState";
import {
  GraphPhysicsRuntimeInputComposer,
  type GraphPhysicsRuntimeInputCompositionResult
} from "./GraphPhysicsRuntimeInputComposer";
import {
  LegacyGraphPhysicsReadAdapter,
  type LegacyGraphPhysicsReadState
} from "./LegacyGraphPhysicsReadAdapter";

export interface LegacyGraphPhysicsReadSource {
  getLegacyPhysicsReadState(): LegacyGraphPhysicsReadState;
}

export interface GraphPhysicsShadowInputCapture {
  input: GraphPhysicsRuntimeInput;
  diagnostics: GraphPhysicsRuntimeInputCompositionResult["diagnostics"] & {
    legacy: {
      ignoredConstraintEntryCount: number;
    };
  };
}

/** Builds detached physics input for diagnostics without owning or stepping an engine. */
export class GraphPhysicsShadowInputService {
  constructor(
    private readonly runtime: GraphRuntimeState,
    private readonly legacyPhysics: LegacyGraphPhysicsReadSource,
    private readonly composer = new GraphPhysicsRuntimeInputComposer()
  ) {}

  capture(frameSequence: number): GraphPhysicsShadowInputCapture {
    const snapshot = this.runtime.getSnapshot();
    const structuralRevision = this.runtime.getStructuralRevision();
    const legacy = new LegacyGraphPhysicsReadAdapter(
      this.legacyPhysics.getLegacyPhysicsReadState()
    ).getRuntimeInputRequest(snapshot, structuralRevision, frameSequence);
    const composed = this.composer.compose(legacy.request);

    return {
      input: composed.input,
      diagnostics: {
        ...composed.diagnostics,
        legacy: legacy.diagnostics
      }
    };
  }
}
