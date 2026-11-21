import type { O3GraphRuntimeNodeSnapshot, O3GraphEmbeddedGraphState } from "./O3GraphState";

export function reconcileEmbeddedRootMembership(entries: O3GraphEmbeddedGraphState[], owner: string, configured: O3GraphRuntimeNodeSnapshot[]): O3GraphEmbeddedGraphState[] {
  return entries.map(entry => {
    const snapshots = entry.graphPath === owner ? reconcileRootSnapshots(entry.snapshots ?? [], configured) : entry.snapshots;
    const ids = new Set(snapshots?.map(snapshot => snapshot.nodeId));
    const children = entry.embeddedGraphs?.filter(child => !snapshots || ids.has(child.originNodeId));
    return { ...entry, ...(snapshots ? { snapshots } : {}),
      ...(children ? { embeddedGraphs: reconcileEmbeddedRootMembership(children, owner, configured) } : {}) };
  });
}

/** Property roots are authoritative. Preserve surviving runtime instances and their layout. */
export function reconcileRootSnapshots(snapshots: O3GraphRuntimeNodeSnapshot[], configured: O3GraphRuntimeNodeSnapshot[]): O3GraphRuntimeNodeSnapshot[] {
  const roots = configured.filter(snapshot => snapshot.origin.kind === "root");
  const paths = new Set(roots.map(snapshot => snapshot.path));
  const removed = new Set(snapshots.filter(snapshot => snapshot.origin.kind === "root" && !paths.has(snapshot.path)).map(snapshot => snapshot.nodeId));
  let changed = true;
  while (changed) {
    changed = false;
    for (const snapshot of snapshots) {
      if (removed.has(snapshot.nodeId) || paths.has(snapshot.path) || snapshot.origin.kind !== "expansion") continue;
      if (removed.has(snapshot.origin.sourceNodeId)) {
        removed.add(snapshot.nodeId);
        changed = true;
      }
    }
  }
  const survivors = snapshots.filter(snapshot => !removed.has(snapshot.nodeId)).map(snapshot => paths.has(snapshot.path) && snapshot.origin.kind === "expansion"
    ? { ...snapshot, origin: { kind: "root" as const } } : snapshot);
  const existing = new Set(survivors.map(snapshot => snapshot.path));
  return [...survivors, ...roots.filter(snapshot => !existing.has(snapshot.path))];
}

/** Refresh direct Lens members while retaining expansions hanging from a surviving member. */
export function reconcileLensMembershipSnapshots(
  previous: O3GraphRuntimeNodeSnapshot[],
  members: O3GraphRuntimeNodeSnapshot[]
): O3GraphRuntimeNodeSnapshot[] {
  const byId = new Map(previous.map((snapshot) => [snapshot.nodeId, snapshot]));
  const next = members.map((snapshot) => {
    const old = byId.get(snapshot.nodeId);
    return old?.path === snapshot.path
      ? { ...snapshot, x: old.x, y: old.y, pinned: old.pinned, badges: old.badges }
      : snapshot;
  });
  const included = new Map(next.map((snapshot) => [snapshot.nodeId, snapshot]));
  const descendants = previous.filter((snapshot) => !included.has(snapshot.nodeId)
    && !snapshot.relationshipProperties?.length && snapshot.origin.kind === "expansion");
  let added = true;
  while (added) {
    added = false;
    for (const snapshot of descendants) {
      if (included.has(snapshot.nodeId) || snapshot.origin.kind !== "expansion") continue;
      const source = included.get(snapshot.origin.sourceNodeId);
      if (source?.badges?.[snapshot.origin.linkType] !== "expanded") continue;
      next.push(snapshot);
      included.set(snapshot.nodeId, snapshot);
      added = true;
    }
  }
  return next;
}
