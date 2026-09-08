# Architecture audit

This audit records what is implemented, what is live, and what remains gated. It is generated from the executable inventory in [`ArchitectureAudit.ts`](../../src/graph-application/ArchitectureAudit.ts) and is intentionally explicit about the remaining legacy owner.

| Boundary | Status | Evidence | Remaining limit |
|---|---|---|---|
| GraphView and GraphController orchestration | **Partial** | GraphController is host-neutral; StoreGraphRuntime composes store, renderer, physics, commands, persistence, and lifecycle. | The live `GraphView` still constructs `GraphEngine`; production has not selected StoreGraphRuntime. |
| GraphController command boundary | **Verified** | Selection uses GraphStore. Other supported command families cross explicit ports with stable identifiers and detached values. | Live pin, drag, root, relationship, lens, and container mutation still belongs to legacy adapters/engine. |
| Replaceable physics | **Partial** | GraphPhysicsCoordinator accepts GraphPhysicsEngine; deterministic and staged implementations satisfy the port; StoreGraphRuntime accepts a physics port. | GraphEngine still owns the production animation loop. Staged physics remains behind parity and interactive evidence gates. |
| Host-neutral domain | **Verified** | Domain source has no Obsidian, GraphView, GraphEngine, or DOM imports. A source guard test enforces this. | Host adapters remain outside the domain by design. |
| Documentation and source alignment | **Verified** | GraphView, GraphController, GraphPhysicsEngine, MigrationStatus, and LegacyOwnershipAudit distinguish target, live, experimental, and blocked code. | Re-run this audit after any runtime composition change. |

## What the audit means

A verified boundary is safe to depend on as a detached contract. A partial boundary is implemented but cannot own production behavior yet. The audit does not promote store mode or delete legacy ownership; those decisions remain governed by the activation evidence and ownership audit.

The current architecture therefore has two compositions:

- **Live legacy composition:** GraphView -> GraphEngine, including the production animation loop and supported interaction state.
- **Guarded store composition:** GraphView-equivalent runtime -> GraphController -> GraphStore, with replaceable physics, detached rendering, persistence, and lifecycle ports.

The second composition is exercised by automated tests and guarded trials. It becomes the live composition only after D4 evidence, B01-B14 manual regression, A9 interactive verification, persistence/lifecycle parity, and the D6 ownership audit are complete.

## Re-run criteria

Repeat this audit whenever one of these changes:

- GraphView selects a different runtime factory.
- GraphController gains or loses a host port.
- A physics implementation is wired into the live animation scheduler.
- A domain module imports a host or renderer type.
- A legacy owner or shadow adapter is removed.

The executable audit must continue to pass, and the migration status must be updated in the same change.

## Full-tree strict typecheck

The architecture typecheck is intentionally scoped by tsconfig.architecture.json to:

- src/graph-domain/**/*.ts
- src/graph-application/**/*.ts

That boundary is the completed architecture surface, including its automated tests. npm run typecheck passes there.

A full npx tsc -p tsconfig.json --noEmit still fails in legacy production files. The failures include unresolved imports from the incomplete Working Memory extraction tree and existing strict-type errors in GraphView.ts, GraphEngine.ts, main.ts, and related legacy/view files. Those files remain outside the strict architecture boundary because they are the live legacy composition and are not yet type-clean enough to join it.

The complete plugin bundle is still validated by npm run build, which passed during this audit. The exclusion list and reasons are executable in ARCHITECTURE_VALIDATION_SCOPE and guarded by ArchitectureAudit.test.ts; an exclusion must be removed only after its source errors and missing package dependencies are resolved.
