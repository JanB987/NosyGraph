import type {
  GraphBadgeInputResult, GraphBadgeMembershipDestination, GraphBadgeMembershipResult,
  GraphLinkBadgeDropMutationResult, GraphLinkInputOrigin
} from "./GraphLinkMutation";

export const MEMBERSHIP_UNAVAILABLE = "Only the badge link will be added. This node has no property-backed membership here.";

export type BadgeMembershipOption =
  | { kind: "off" }
  | { kind: "unavailable"; reason: string }
  | { kind: "destination"; destination: GraphBadgeMembershipDestination };

export interface BadgeInputEntry<Note> {
  readonly path: string;
  readonly file: Note;
  readonly relationshipComplete: boolean;
}

export async function submitGraphBadgeInput<Note>(
  entries: readonly BadgeInputEntry<Note>[],
  origin: GraphLinkInputOrigin,
  membership: BadgeMembershipOption,
  ports: {
    isCurrent: (entry: BadgeInputEntry<Note>) => boolean;
    addRelationships: (entries: readonly BadgeInputEntry<Note>[]) => Promise<GraphLinkBadgeDropMutationResult>;
    addMembership: (destination: GraphBadgeMembershipDestination, entries: readonly BadgeInputEntry<Note>[]) => Promise<GraphBadgeMembershipResult>;
    onRelationshipsChanged?: (result: GraphLinkBadgeDropMutationResult) => void;
    onMembershipChanged?: (result: GraphBadgeMembershipResult) => void;
  }
): Promise<GraphBadgeInputResult> {
  const current = entries.filter(ports.isCurrent);
  const pending = current.filter((entry) => !entry.relationshipComplete);
  const primary = pending.length ? await ports.addRelationships(pending) : { added: [], removed: [], skipped: [] };
  const result: GraphBadgeInputResult = {
    ...primary, origin, selected: entries.map(({ path }) => path),
    skipped: [...primary.skipped, ...entries.filter((entry) => !entry.relationshipComplete && !current.includes(entry)).map(({ path }) => path)]
  };
  if (primary.changedFilePaths?.length) ports.onRelationshipsChanged?.(result);

  const succeeded = new Set([...primary.added, ...(primary.alreadyPresent ?? [])]);
  const eligible = entries.filter((entry) => entry.relationshipComplete || succeeded.has(entry.path));
  if (!eligible.length) return result;
  if (membership.kind !== "destination") {
    result.membership = {
      items: eligible.map(({ path }) => membership.kind === "off"
        ? { path, status: "off" }
        : { path, status: "unavailable", reason: membership.reason }),
      changedFilePaths: []
    };
    return result;
  }

  const { destination } = membership;
  try {
    result.membership = await ports.addMembership(destination, eligible);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    result.membership = { destination, items: eligible.map(({ path }) => ({ path, status: "failed", reason })), changedFilePaths: [] };
  }
  if (result.membership.changedFilePaths.length) ports.onMembershipChanged?.(result.membership);
  return result;
}
