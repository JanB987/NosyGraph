# Legacy ownership audit

D6 can remove an implementation only after no supported feature depends on it and the replacement has passed the relevant activation gates. The current audit intentionally reports no removable entries.

| Area | Current owner | Replacement | Status | Blocking dependency |
|---|---|---|---|---|
| Semantic collections | `GraphEngine` node, edge, badge, and expansion arrays/maps | `GraphStore` and `StoreGraphRuntime` | Blocked live | `GraphView` still constructs `GraphEngine`; store mode is not the live default. |
| Interaction state | `GraphEngine` selection, pin, drag, root, lens, and container maps | `GraphController` and `GraphSceneStore` ports | Blocked live | Supported Obsidian interactions still call the legacy engine. |
| Badge executor and shadow | `LegacyGraphBadgeToggleExecutor` and `GraphBadgeToggleShadowService` | `GraphStoreBadgeToggleExecutor` | Blocked live/evidence | Live normal badge clicks still use the legacy adapter and B01–B14 manual parity is incomplete. |
| Physics loop | `GraphEngine` force loop and animation scheduler | `StagedGraphPhysicsEngine` and `StoreGraphRuntime` | Blocked live/evidence | Production animation is legacy-owned; controlled legacy non-zero parity and A9 interactive evidence are missing. |
| Legacy read adapters | `LegacyGraphSnapshotAdapter` and `LegacyGraphPhysicsReadAdapter` | Store snapshots and detached physics input | Blocked evidence | Explicit GraphEngine shadow and parity diagnostics still depend on copied legacy reads. |
| View hydration | `GraphView` and `O3GraphState` persistence/hydration | `GraphDocumentPersistence` and store lifecycle | Blocked live | Production hydration and interactive reopen behavior remain legacy-owned. |

The executable inventory is [`LegacyOwnershipAudit.ts`](../../src/graph-application/LegacyOwnershipAudit.ts). Its test fails if a future change claims an entry is removable without first changing the recorded blockers. No legacy arrays, executors, solver paths, or shadow services are deleted in D6 because each still has a live or evidence dependency.

Once the activation policy records convincing parity and ownership evidence, repeat this audit. Remove one owner at a time, run the full regression suite, and delete the corresponding adapter and shadow tests only after no production import or supported diagnostic references it.