export type ArchitectureAuditStatus = "verified" | "partial" | "blocked";

export interface ArchitectureAuditEntry {
  readonly id: string;
  readonly area: string;
  readonly status: ArchitectureAuditStatus;
  readonly evidence: readonly string[];
  readonly blockers: readonly string[];
}

/** Validation scope for the strict architecture typecheck boundary. */
export interface ArchitectureValidationScope {
  readonly typecheckConfig: string;
  readonly typecheckIncludes: readonly string[];
  readonly excludedProductionAreas: readonly {
    path: string;
    reason: string;
  }[];
  readonly completeBundleValidation: string;
}

export const ARCHITECTURE_VALIDATION_SCOPE = {
  typecheckConfig: "tsconfig.architecture.json",
  typecheckIncludes: [
    "src/graph-domain/**/*.ts",
    "src/graph-application/**/*.ts"
  ],
  excludedProductionAreas: [
    {
      path: "src/GraphView.ts",
      reason: "Live legacy composition has pre-existing strict-type errors."
    },
    {
      path: "src/GraphEngine.ts",
      reason: "Live legacy solver has pre-existing strict-type errors."
    },
    {
      path: "src/main.ts",
      reason: "Host entrypoint has pre-existing strict-type errors."
    },
    {
      path: "src/graph/**/*.ts and src/views/**/*.ts",
      reason: "Working Memory extraction files reference modules outside this package."
    }
  ],
  completeBundleValidation: "npm run build"
} as const satisfies ArchitectureValidationScope;

/**
 * Source-of-truth summary for the final architecture audit.
 *
 * "Verified" means the boundary is implemented and covered in detached code.
 * "Partial" means the boundary exists, but live composition still depends on
 * the legacy owner. "Blocked" means a required boundary is not yet safe to
 * activate.
 */
export const ARCHITECTURE_AUDIT = [
  {
    id: "graph-view-orchestration",
    area: "GraphView and GraphController orchestration",
    status: "partial",
    evidence: [
      "GraphController is a host-neutral command boundary.",
      "StoreGraphRuntime composes store, renderer, physics, commands, persistence, and lifecycle."
    ],
    blockers: [
      "src/GraphView.ts still constructs and owns GraphEngine in the live Obsidian path.",
      "The production view has not selected StoreGraphRuntime."
    ]
  },
  {
    id: "graph-controller-boundary",
    area: "GraphController host-neutral command routing",
    status: "verified",
    evidence: [
      "Selection is applied through GraphStore.",
      "Pin, drag, root, relationship, navigation, and badge behavior cross explicit ports.",
      "Controller commands carry stable identifiers and detached values."
    ],
    blockers: []
  },
  {
    id: "replaceable-physics",
    area: "Replaceable physics implementation",
    status: "partial",
    evidence: [
      "GraphPhysicsCoordinator accepts the GraphPhysicsEngine contract.",
      "DeterministicGraphPhysicsEngine and StagedGraphPhysicsEngine satisfy the same port.",
      "StoreGraphRuntime accepts a StoreGraphPhysicsPort."
    ],
    blockers: [
      "The live GraphEngine animation loop still owns production motion.",
      "StagedGraphPhysicsEngine remains experimental until parity and interactive evidence gates pass."
    ]
  },
  {
    id: "host-neutral-domain",
    area: "Host-neutral graph domain",
    status: "verified",
    evidence: [
      "src/graph-domain contains domain records and contracts without Obsidian, GraphView, GraphEngine, or DOM imports."
    ],
    blockers: []
  },
  {
    id: "documentation-alignment",
    area: "Documentation and source alignment",
    status: "verified",
    evidence: [
      "Architecture pages label target boundaries separately from the current live GraphEngine composition.",
      "Migration status records detached, experimental, live, and blocked components."
    ],
    blockers: []
  }
] as const satisfies readonly ArchitectureAuditEntry[];

export function getArchitectureAudit(): readonly ArchitectureAuditEntry[] {
  return ARCHITECTURE_AUDIT;
}

export function getArchitectureAuditBlockers(): readonly ArchitectureAuditEntry[] {
  return ARCHITECTURE_AUDIT.filter((entry) => entry.blockers.length > 0);
}
