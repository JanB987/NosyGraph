import type { GraphChangeSet } from "../graph-domain/GraphChangeSet";
import type { GraphSnapshot, GraphSnapshotSource } from "../graph-domain/GraphSnapshot";
import type {
  GraphRuntimeChangeSetApplyResult,
  GraphRuntimeState
} from "./GraphRuntimeState";

export interface LegacyGraphRuntimeRevisionSource {
  getStructuralRevision(): number;
}

/** Read-only runtime boundary for the current engine-owned semantic graph. */
export class LegacyGraphRuntimeState implements GraphRuntimeState {
  readonly mode = "legacy" as const;

  constructor(
    private readonly snapshotSource: GraphSnapshotSource,
    private readonly revisionSource: LegacyGraphRuntimeRevisionSource
  ) {}

  getSnapshot(): GraphSnapshot {
    return this.snapshotSource.getSnapshot();
  }

  getStructuralRevision(): number {
    return this.revisionSource.getStructuralRevision();
  }

  applyChangeSet(
    _changeSet: GraphChangeSet,
    _expectedRevision?: number
  ): GraphRuntimeChangeSetApplyResult {
    return { applied: false, reason: "runtime-read-only", mode: this.mode };
  }
}
