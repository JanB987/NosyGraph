export interface GraphLinkMutationNodeRef {
  readonly nodeId: string;
  readonly path: string;
}

export type GraphLinkDiscoveryDirection = "incoming" | "outgoing" | "both";
export type GraphLinkInputOrigin = "single-note-input" | "clipboard-batch";

export interface GraphLinkWriteDescriptor {
  readonly target: GraphLinkMutationNodeRef;
  readonly property: string;
  readonly discoveryDirection: GraphLinkDiscoveryDirection;
  readonly readProperties?: readonly string[];
  readonly semantic?: "link" | "parent" | "lens";
  readonly definitionId?: string;
}

export interface GraphLinkBadgeDropMutationRequest extends GraphLinkWriteDescriptor {
  readonly sources: readonly GraphLinkMutationNodeRef[];
  readonly origin?: GraphLinkInputOrigin;
}

export interface GraphLinkBadgeDropMutationResult {
  added: string[];
  removed: string[];
  skipped: string[];
  origin?: GraphLinkInputOrigin;
  selected?: string[];
  alreadyPresent?: string[];
  failed?: Array<{ path: string; filePath: string; reason: string }>;
  changedFilePaths?: string[];
}

export interface GraphBadgeLinkInputRequest {
  readonly target: GraphLinkMutationNodeRef;
  readonly write: GraphLinkWriteDescriptor | null;
  readonly membership: GraphBadgeMembershipContext;
  readonly isCurrent: () => boolean;
}

export type GraphBadgeMembershipContext =
  | { kind: "unavailable"; reason: string }
  | { kind: "note"; ownerPath: string; referencePath: string; instanceId?: string }
  | { kind: "lens"; ownerPath: string; referencePath: string; instanceId: string;
      definitionId: string; readProperties: readonly string[]; provenance: readonly string[] };

export interface GraphBadgeMembershipDestination {
  readonly ownerPath: string;
  readonly referencePath: string;
  readonly property: string;
  readonly lensDefinitionId?: string;
}

export interface GraphBadgeMembershipItem {
  path: string;
  status: "added" | "already-present" | "failed" | "stale" | "unavailable" | "off";
  reason?: string;
}

export interface GraphBadgeMembershipResult {
  destination?: GraphBadgeMembershipDestination;
  items: GraphBadgeMembershipItem[];
  changedFilePaths: string[];
}

export interface GraphBadgeInputResult extends GraphLinkBadgeDropMutationResult {
  membership?: GraphBadgeMembershipResult;
}

export type GraphBadgeBatchCommitted = (
  write: GraphLinkWriteDescriptor,
  result: GraphLinkBadgeDropMutationResult
) => void;
