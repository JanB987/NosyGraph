/** WorkspaceLeaf.id is untyped. Verify it through the workspace before using it as a binding. */
export function graphTabLeafId<Leaf extends object>(leaf: Leaf, getLeafById: (id: string) => Leaf | null): string | null {
  const id = (leaf as { id?: unknown }).id;
  return typeof id === "string" && id.trim() && getLeafById(id) === leaf ? id : null;
}

export function resolveGraphTabLeaf<Leaf extends object>(id: string, getLeafById: (id: string) => Leaf | null): Leaf | null {
  if (!id) return null;
  const leaf = getLeafById(id);
  return leaf && graphTabLeafId(leaf, getLeafById) === id ? leaf : null;
}
import type { Workspace, WorkspaceLeaf } from "obsidian";

export function lookupGraphTabLeaf(workspace: Workspace, id: string): WorkspaceLeaf | null {
  // getLeafById was made public in 1.5.1. Older builds without it cannot verify exact identity.
  const lookup = (workspace as { getLeafById?: (key: string) => WorkspaceLeaf | null }).getLeafById;
  return typeof lookup === "function" ? lookup.call(workspace, id) : null;
}
