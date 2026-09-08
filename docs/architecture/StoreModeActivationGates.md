# Store-mode activation gates

D2 verifies the conditions that must hold before selecting store mode for a live graph. The detached runtime is evidence-generating; it does not change the production GraphView/GraphEngine selection.

| Gate | Verification | Result | Limit |
|---|---|---|---|
| 1. Valid initial snapshot | `GraphStoreInitializer` validates stable identities and references before constructing `GraphStore`. | Pass | Host configuration still supplies the initial snapshot. |
| 2. Detached rendering and physics | `StoreGraphActivationGate.test.ts` runs physics, rendering, selection, and persistence from an initialized copy and asserts the source collections are unchanged. | Pass | The live view remains on the legacy renderer and solver. |
| 3. Normal expand/collapse parity | Store transition, collapse, stale-transition, and rejection tests pass; badge shadow matrix B01–B14 remains the manual parity gate. | Automated pass; activation pending | Do not select store mode until the documented manual matrix is complete. |
| 4. Visible unsupported-command failures | Missing store ports return explicit reasons for badge, pin, drag, root, scene, and relationship operations. Legacy runtime change sets return `runtime-read-only`; no fallback mutation is attempted. | Pass | A future store command must add its port before activation. |
| 5. Direct persistence restoration | `GraphDocumentPersistence` restores snapshots, ownership, expansions, scenes, layouts, and identities directly; runtime persistence tests cover committed saves. | Pass | Production hydration still follows legacy paths. |
| 6. Close/reopen ownership | Runtime lifecycle tests detach intents, stop physics, close generations, and preserve detached identities across restoration. | Automated pass | Interactive Obsidian reopen evidence remains part of the activation review. |

The D2 tests deliberately use a mutable source snapshot as a stand-in for legacy collections. Supported store operations receive a copied snapshot and never write back to that source. Unsupported operations stop at the application boundary with a structured result, so adding a new interaction cannot silently cross back into legacy mutation.