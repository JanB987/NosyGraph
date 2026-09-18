# E1 baseline

Captured 2026-09-08 from local commit 3cce6a012b7f2540db982ac9f4a7dde356840b68.

## Validation

| Check | Result |
|---|---|
| npm test | 77 test files passed; 369 tests passed |
| npm run typecheck | Passed using tsconfig.architecture.json |
| npm run build | Passed |
| git diff --check | Passed |
| Generated bundle | main.js, 616,943 bytes |

The generated bundle was restored after the build so this baseline record does not include generated-output changes.

## Vault activation evidence

The vault community plugin configuration at .obsidian/community-plugins.json contains nosygraph. The plugin directory contains manifest.json and the freshly built main.js artifact. This confirms the installed and enabled configuration used for testing; it does not prove that an Obsidian process is currently open.

## Known limitations

- The live production path remains GraphView -> GraphEngine. StoreGraphRuntime is guarded and experimental.
- Legacy ownership cleanup is blocked until supported behavior and parity evidence move to the replacement boundaries.
- Interactive A9 physics verification and the manual B01-B14 badge regression pass remain outstanding.
- The scoped architecture typecheck passes. A full strict typecheck still reports unresolved Working Memory imports and pre-existing errors in GraphView.ts, GraphEngine.ts, main.ts, and related legacy/view files.
- The replacement physics implementation is not the live animation solver, and store mode is not the default runtime.

This baseline is the starting point for E2 interactive verification and later bug or cleanup changes. Re-capture it after any deliberate baseline reset.