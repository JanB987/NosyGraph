# Migration status

This page is the status boundary for the NosyGraph architecture migration. A component can be implemented and tested without being selected by the live plugin. Status words below are deliberate:

- **Implemented** means the code exists behind a host-neutral or adapter boundary and has automated coverage.
- **Live** means the production Obsidian composition selects that path for user-visible behavior.
- **Experimental** means the code is detached, shadowed, staged, or available only through an explicit test/diagnostic entry point.
- **Proposed** means the design or follow-up is recorded, but the production behavior is not implemented or has not passed its activation gate.

## Current runtime

| Area | Status | Current owner or entry point | Evidence and limit |
|---|---|---|---|
| Obsidian view lifecycle and rendering | **Live** | GraphView and the legacy GraphEngine | Existing production path. |
| Force simulation, dragging, pins, freezes, directional links, lenses, and persistence | **Live** | Legacy src/GraphEngine.ts | This remains the user-visible solver while parity work continues. |
| Selection command boundary | **Live** | GraphController backed by GraphStore selection state | Selection is the first state slice moved to the store. |
| Normal badge command routing | **Live bridge** | GraphController to GraphBadgeToggleHandler to LegacyBadgeCommandAdapter | Planning enters the new boundary; legacy mutation and persistence still perform the operation. |
| Legacy graph snapshot and relationship adapters | **Implemented; live read-only source** | LegacyGraphSnapshotAdapter, LegacyGraphRelationshipTargetAdapter | Used to feed detached snapshots and shadow calculations; they do not own live collections. |
| Shadow badge transition calculation and comparison | **Experimental** | GraphBadgeToggleShadowService and GraphBadgeToggleShadowComparator | Diagnostic only. It does not replace legacy mutation. B01–B14 live evidence remains pending. |

## Implemented but detached

| Area | Status | What is safe to rely on |
|---|---|---|
| Host-neutral graph domain records | **Implemented** | Notes, node instances, edges, badges, expansions, lenses, change sets, and explicit ownership contracts are tested independently of Obsidian. |
| GraphStore graph collections and atomic change sets | **Implemented; experimental** | Snapshot application, stale revision rejection, expansion/collapse ownership, and shared-node rehoming are tested. Production graph collections remain in GraphEngine. |
| Validated GraphStore initialization | **Implemented; experimental** | GraphStoreInitializer copies one host-adapted snapshot, preserves IDs, and rejects invalid references before construction. Store mode is not selected in production. |
| Runtime state and kinematics boundaries | **Implemented; experimental** | Structural revisions and kinematics sequences are separate, and compatible frames can be composed into detached snapshots. |
| Physics input projection and legacy read adapters | **Implemented; experimental** | Detached nodes, edges, settings, constraints, containers, and current motion can be assembled for inspection. The animation loop does not consume this input. |
| Pure force, integration, confinement, anchoring, and settling stages | **Implemented; experimental** | Stages are unit-tested against characterized legacy behavior and composed by StagedGraphPhysicsEngine. |
| StagedGraphPhysicsEngine | **Experimental** | One and multiple non-zero steps match the current parity fixture within documented tolerances. It must not replace the live solver yet. |
| Physics parity runners and comparators | **Experimental** | They compare detached legacy and staged frames, including multi-step traces; they do not alter runtime motion. |
| GraphSettlingPolicy | **Experimental** | Used by the staged engine only. The live animation scheduler and interaction wake-up path remain legacy-owned. |
| Container synchronizer and anchoring state | **Implemented; experimental** | State persistence and reconciliation are tested. Full host-event synchronization and live composition are still open. |

## Still proposed or gated

These items are intentionally not described as live:

1. **Manual badge regression closure.** B01–B14 still need visible outer/embedded behavior, console shadow evidence, and persisted replay in Obsidian. The automated semantic slice passes.
2. **Interactive physics verification.** A9 remains blocked until a callable Computer Use session or a manual run records parent, embedded, nested, drag, pin, freeze, expansion, collapse, and settling results.
3. **Live physics cutover.** The replacement engine needs dynamic container synchronization, legacy anchor-state capture, nested ancestry-aware eligibility, host interaction projection, and the direction-target solver before activation.
4. **GraphStore ownership cutover.** Store mode must own the complete graph collection lifecycle before legacy arrays are removed. There will be no long-term dual-write mirror.
5. **Persistence and lifecycle reconciliation.** Close/reopen replay, lens lifecycle, topology changes, and host event ordering remain application-boundary work.
6. **Behavior changes.** Any intentional change must be recorded beside the relevant parity evidence and accepted as a new contract. Comparators must continue reporting semantic differences.

## Activation rule

A component moves from **experimental** to **live** only after:

1. its host-neutral tests pass;
2. the corresponding live/shadow or parity evidence has no unexplained difference;
3. interaction and persistence behavior are covered where applicable;
4. the ownership and rollback boundary is documented; and
5. the production composition explicitly selects it.

Until those conditions hold, the legacy path remains the runtime authority and the detached implementation remains evidence-generating code.
