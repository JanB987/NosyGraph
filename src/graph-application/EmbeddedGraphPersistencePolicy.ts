export interface EmbeddedGraphPersistencePolicyInput {
  ownerIsPersistentGraphNote: boolean;
  ownerHasReadableGraphState: boolean;
  parentIsPersistentGraphNote: boolean;
}

/**
 * Embedded runtime belongs to the embedded graph note. A persistent parent may
 * initialize that note's state block when a graph-capable note is first used
 * as a lens; ephemeral parent views remain ephemeral.
 */
export function shouldPersistEmbeddedGraphRuntime(
  input: EmbeddedGraphPersistencePolicyInput,
): boolean {
  return input.ownerIsPersistentGraphNote
    || input.ownerHasReadableGraphState
    || input.parentIsPersistentGraphNote;
}
