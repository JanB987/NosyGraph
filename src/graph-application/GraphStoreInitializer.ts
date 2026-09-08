import { copyGraphSnapshot, type GraphSnapshot, type GraphSnapshotSource } from "../graph-domain/GraphSnapshot";
import {
  GraphStore,
  validateGraphSnapshot,
  type GraphStoreSnapshotValidationFailure
} from "./GraphStore";

export interface GraphStoreInitializationSource extends GraphSnapshotSource {}

export type GraphStoreInitializationResult =
  | {
      ok: true;
      snapshot: GraphSnapshot;
      store: GraphStore;
    }
  | {
      ok: false;
      reason: "invalid-snapshot";
      failure: GraphStoreSnapshotValidationFailure;
    };

/**
 * Bootstraps store mode once from a host-adapted configuration snapshot.
 *
 * The source may be backed by legacy runtime reads, graph-document
 * configuration, and Obsidian note adapters. The resulting snapshot is
 * detached before validation and store construction, so initialization never
 * retains host-owned arrays or mutable records.
 */
export class GraphStoreInitializer {
  constructor(private readonly source: GraphStoreInitializationSource) {}

  initialize(): GraphStoreInitializationResult {
    const snapshot = copyGraphSnapshot(this.source.getSnapshot());
    const failure = validateGraphSnapshot(snapshot);
    if (failure) {
      return { ok: false, reason: "invalid-snapshot", failure };
    }
    return {
      ok: true,
      snapshot,
      store: new GraphStore(snapshot)
    };
  }
}
