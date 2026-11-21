import type { App, TFile } from "obsidian";
import { extractInternalLinkCandidates } from "./linkResolver";
import { O3GraphDocumentStore } from "./O3GraphDocumentStore";
import type { O3GraphRuntimeNodeSnapshot } from "./O3GraphState";
import { resolveEffectiveRootProperties } from "./GraphRootPropertyResolver";
import { reconcileRootSnapshots } from "./GraphRootSnapshotReconciliation";
import type { BadgeMembershipConfig } from "./ObsidianGraphBadgeMembership";
import type { GraphCutChange } from "./ObsidianGraphNodeCutHost";
import { resolveGraphCutReference } from "./ObsidianGraphNodeCutHost";

export function getGraphCutRootSnapshots(app: App, file: TFile, frontmatter: Record<string, unknown>, config: BadgeMembershipConfig): O3GraphRuntimeNodeSnapshot[] {
  const keys = resolveEffectiveRootProperties(frontmatter, config.graphPropertyKeys, config.defaultRootNodeProperties).propertyKeys;
  const paths = new Set(keys.flatMap(key => extractInternalLinkCandidates(frontmatter[key])
    .flatMap(candidate => resolveGraphCutReference(app, candidate, file.path) ?? [])));
  return [...paths].map(path => ({ nodeId: path, path, x: 0, y: 0, pinned: false, origin: { kind: "root" }, badges: {} }));
}

export async function persistGraphCutRootTruth(app: App, change: GraphCutChange, config: BadgeMembershipConfig): Promise<void> {
  const store = new O3GraphDocumentStore(app, change.file, config.graphPropertyKeys);
  const state = await store.readState({ cached: false });
  if (!state.loadedFromGraphStateBlock) return;
  const configured = getGraphCutRootSnapshots(app, change.file, change.frontmatter, config);
  const snapshots = reconcileRootSnapshots(state.toRuntimeNodeSnapshots(), configured);
  state.migrateToCurrentLayout(snapshots);
  const ids = new Set(snapshots.map(snapshot => snapshot.nodeId));
  for (const [key, entry] of Object.entries(state.state.embeddedGraphs ?? {})) {
    if (!ids.has(entry.originNodeId)) delete state.state.embeddedGraphs?.[key];
  }
  await store.writeState(state, { reason: "note-truth-reconciliation", requireExistingBlock: true, forceEmptyOverwrite: snapshots.length === 0 });
}
