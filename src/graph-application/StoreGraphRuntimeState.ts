import type { GraphChangeSet } from "../graph-domain/GraphChangeSet";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import type {
  GraphRuntimeChangeSetApplyResult,
  GraphRuntimeState
} from "./GraphRuntimeState";
import type { GraphStore } from "./GraphStore";

/** Mutable runtime boundary whose semantic graph is owned exclusively by GraphStore. */
export class StoreGraphRuntimeState implements GraphRuntimeState {
  readonly mode = "store" as const;

  constructor(private readonly store: GraphStore) {}

  getSnapshot(): GraphSnapshot {
    return this.store.getSnapshot();
  }

  getStructuralRevision(): number {
    return this.store.getRevision();
  }

  applyChangeSet(
    changeSet: GraphChangeSet,
    expectedRevision: number = this.store.getRevision()
  ): GraphRuntimeChangeSetApplyResult {
    return this.store.applyChangeSet(changeSet, expectedRevision);
  }
}
