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
## E11 dependency map

The executable inventory still reports six blocked ownership areas and zero removable entries.

| Legacy dependency | Remaining import or supported behavior | Current source paths |
|---|---|---|
| Semantic collections | Graph nodes, edges, badges, expansions, visible instances, and runtime maps remain owned by GraphEngine. | src/GraphView.ts, src/main.ts, src/GraphEngine.ts |
| Interaction state | Selection, pinning, dragging, root membership, lens ownership, container ownership, pointer hit testing, and interaction wake-up still call GraphEngine methods. | src/GraphView.ts, src/main.ts, src/GraphEngine.ts |
| Badge execution | Live normal, parent, input, and chain badge requests still reach the legacy badge port and executor; shadow comparison is constructed beside it. | src/GraphEngine.ts, src/graph-application/LegacyBadgeCommandAdapter.ts, src/graph-application/LegacyGraphBadgeToggleExecutor.ts |
| Physics loop | Force calculation, integration, confinement, anchoring, settling, animation scheduling, drag constraints, freezes, pins, and direction-target behavior remain in the legacy loop. | src/GraphEngine.ts, src/GraphView.ts |
| Legacy read and parity evidence | Snapshot, kinematics, physics-input, shadow-observer, shadow-sample, and parity diagnostics read copied state from GraphEngine. | src/GraphEngine.ts, src/graph-application/LegacyGraphSnapshotAdapter.ts, src/graph-application/LegacyGraphPhysicsReadAdapter.ts, src/graph-application/GraphPhysicsShadow*.ts |
| Host hydration and persistence | Obsidian metadata reads, relationship refresh, graph-note hydration, view-state migration, writes, rename/delete handling, and reopen behavior remain connected to the legacy view/state path. | src/GraphView.ts, src/main.ts, src/O3GraphState.ts, src/O3GraphStateStore.ts |
| Excluded legacy view tree | The older src/graph and src/views files still import GraphEngine/view types and reference unavailable Working Memory modules. | src/graph/**/*.ts, src/views/**/*.ts |

## E12 cleanup decision

The audit was re-run for E11. No entry is removable, so E12 intentionally deletes nothing. Every candidate legacy adapter, executor, collection, solver path, and shadow service still has either a live caller or an evidence dependency. The nested duplicate tree identified by E10 remains a separate local cleanup candidate and is not part of the source ownership cutover.
