export type LegacyOwnershipDisposition =
  | "blocked-live"
  | "blocked-evidence"
  | "removable";

export interface LegacyOwnershipAuditEntry {
  id: string;
  currentOwner: string;
  replacement: string;
  disposition: LegacyOwnershipDisposition;
  blockers: readonly string[];
}

/**
 * Explicit D6 inventory. Entries stay here until their live dependents and
 * parity evidence are removed; deleting a legacy implementation early would
 * make rollback or a supported feature cross an ownership boundary.
 */
export const LEGACY_OWNERSHIP_AUDIT: readonly LegacyOwnershipAuditEntry[] = [
  {
    id: "semantic-collections",
    currentOwner: "GraphEngine.nodes/edges/badges/expansions",
    replacement: "GraphStore and StoreGraphRuntime",
    disposition: "blocked-live",
    blockers: ["GraphView constructs GraphEngine", "store mode is not the live default"]
  },
  {
    id: "interaction-state",
    currentOwner: "GraphEngine selection, pin, drag, root, lens, and container maps",
    replacement: "GraphController and GraphSceneStore ports",
    disposition: "blocked-live",
    blockers: ["supported Obsidian interactions still call GraphEngine"]
  },
  {
    id: "badge-executor",
    currentOwner: "LegacyGraphBadgeToggleExecutor and GraphBadgeToggleShadowService",
    replacement: "GraphStoreBadgeToggleExecutor",
    disposition: "blocked-live",
    blockers: ["live normal badge clicks still execute the legacy adapter", "B01-B14 manual parity is incomplete"]
  },
  {
    id: "physics-loop",
    currentOwner: "GraphEngine force loop and animation scheduler",
    replacement: "StagedGraphPhysicsEngine and StoreGraphRuntime",
    disposition: "blocked-live",
    blockers: ["production animation still uses GraphEngine", "controlled legacy non-zero parity is unavailable", "A9 interactive verification is incomplete"]
  },
  {
    id: "legacy-read-adapters",
    currentOwner: "LegacyGraphSnapshotAdapter and LegacyGraphPhysicsReadAdapter",
    replacement: "GraphStore snapshots and detached physics inputs",
    disposition: "blocked-evidence",
    blockers: ["GraphEngine exposes explicit shadow and parity diagnostics through these adapters"]
  },
  {
    id: "view-hydration",
    currentOwner: "GraphView and O3GraphState persistence/hydration",
    replacement: "GraphDocumentPersistence and store-mode lifecycle",
    disposition: "blocked-live",
    blockers: ["production GraphView hydration remains legacy-owned", "interactive reopen evidence is incomplete"]
  }
];

export function getRemovableLegacyOwnership(): readonly LegacyOwnershipAuditEntry[] {
  return LEGACY_OWNERSHIP_AUDIT.filter((entry) => entry.disposition === "removable");
}