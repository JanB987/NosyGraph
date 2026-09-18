import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import type { GraphPhysicsRuntimeInputRequest } from "./GraphPhysicsRuntimeInputComposer";
import {
  LegacyGraphPhysicsConstraintAdapter,
  type LegacyGraphPhysicsConstraintReadState
} from "./LegacyGraphPhysicsConstraintAdapter";
import {
  LegacyGraphPhysicsContainerAdapter,
  type LegacyGraphPhysicsContainerRead
} from "./LegacyGraphPhysicsContainerAdapter";
import {
  LegacyGraphPhysicsSettingsAdapter,
  type LegacyGraphPhysicsSettingsReadState
} from "./LegacyGraphPhysicsSettingsAdapter";

export interface LegacyGraphPhysicsReadState {
  settings: LegacyGraphPhysicsSettingsReadState;
  constraints: LegacyGraphPhysicsConstraintReadState;
  containers: readonly LegacyGraphPhysicsContainerRead[];
}

export interface LegacyGraphPhysicsReadResult {
  request: GraphPhysicsRuntimeInputRequest;
  diagnostics: {
    ignoredConstraintEntryCount: number;
  };
}

/** Composes copied legacy physics state into one host-neutral runtime request. */
export class LegacyGraphPhysicsReadAdapter {
  constructor(private readonly source: LegacyGraphPhysicsReadState) {}

  getRuntimeInputRequest(
    snapshot: GraphSnapshot,
    structuralRevision: number,
    frameSequence: number
  ): LegacyGraphPhysicsReadResult {
    const constraints = new LegacyGraphPhysicsConstraintAdapter(
      this.source.constraints
    ).getConstraintInput();
    return {
      request: {
        snapshot,
        structuralRevision,
        frameSequence,
        settings: new LegacyGraphPhysicsSettingsAdapter(
          this.source.settings
        ).getSettingsInput(),
        transientConstraints: constraints.input,
        containers: new LegacyGraphPhysicsContainerAdapter(
          this.source.containers
        ).getContainerCandidates()
      },
      diagnostics: {
        ignoredConstraintEntryCount: constraints.ignoredEntryCount
      }
    };
  }
}
