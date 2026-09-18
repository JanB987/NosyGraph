# Dual-mode regression and performance comparison

D4 exercises the guarded legacy and store factories with the same detached graph snapshots at 12, 96, and 384 nodes. The comparison harness is [`GraphModeRegression.test.ts`](../../src/graph-application/GraphModeRegression.test.ts).

Each mode run covers:

- creation and open timing;
- repeated snapshot queries over the representative graph size;
- persistence serialization and direct restoration, including stable node identities;
- the interaction boundary (store selection succeeds; legacy structural writes return `runtime-read-only`);
- close timing and lifecycle cleanup.

Store mode additionally runs two deterministic physics steps, renders the resulting frame, and verifies that renderer subscriptions are removed when it closes. Legacy non-zero physics is recorded as `legacy-not-controlled`: the live `GraphEngine` has no controlled step-and-capture hook, so the harness does not invent a numerical parity result. Existing A8 parity fixtures remain the source of controlled force comparisons.

The timing values are diagnostic samples, not machine-specific thresholds. The regression assertions compare identity counts, restored state, command outcomes, motion ownership, and cleanup invariants so performance noise cannot hide a semantic difference.

This is host-neutral coverage. Interactive Obsidian behavior, visual rendering, and the full B01–B14 manual matrix remain separate activation evidence.