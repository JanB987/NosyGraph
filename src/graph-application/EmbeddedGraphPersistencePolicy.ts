export interface EmbeddedGraphPersistencePolicyInput {
  ownerIsPersistentGraphNote: boolean;
  ownerHasReadableGraphState: boolean;
  parentIsPersistentGraphNote: boolean;
}

export interface EmbeddedGraphPersistenceOwnerInput {
  targetPath: string;
  targetIsPersistentGraphNote: boolean;
  parentOwnerPath?: string;
}

export function resolveEmbeddedGraphPersistenceOwner(
  input: EmbeddedGraphPersistenceOwnerInput,
): string | null {
  const targetPath = String(input.targetPath ?? "").trim();
  const parentOwnerPath = String(input.parentOwnerPath ?? "").trim();
  if (input.targetIsPersistentGraphNote) return targetPath || null;
  return parentOwnerPath || null;
}

/**
 * A document may receive embedded runtime writes only when it is explicitly a
 * persistent graph note. Parent-owned Lens snapshots are written through the
 * parent's own graph state and never authorize writes into the Lens target.
 */
export function shouldPersistEmbeddedGraphRuntime(
  input: EmbeddedGraphPersistencePolicyInput,
): boolean {
  return input.ownerIsPersistentGraphNote;
}
