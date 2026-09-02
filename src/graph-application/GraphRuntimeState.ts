import type { GraphChangeSet } from "../graph-domain/GraphChangeSet";
import type { GraphSnapshotSource } from "../graph-domain/GraphSnapshot";
import type { GraphChangeSetApplyResult } from "./GraphStore";

export type GraphRuntimeMode = "legacy" | "store";

export type GraphRuntimeChangeSetApplyResult =
  | GraphChangeSetApplyResult
  | {
      applied: false;
      reason: "runtime-read-only";
      mode: "legacy";
    };

/** Exclusive semantic-state boundary shared by legacy and future store runtimes. */
export interface GraphRuntimeState extends GraphSnapshotSource {
  readonly mode: GraphRuntimeMode;
  getStructuralRevision(): number;
  applyChangeSet(
    changeSet: GraphChangeSet,
    expectedRevision?: number
  ): GraphRuntimeChangeSetApplyResult;
}
