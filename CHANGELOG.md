# Changelog

## 0.2.10 - 2026-09-19

### Fixed

- Restored graph relationship lines and badge interactions when LinkType notes
  are explicitly referenced by a graph note outside the configured discovery
  folder.
- Kept badges hidden on unselected nodes during normal graph viewing while
  preserving selected-node, show-all, and drag-target interactions.

### Validation

- The scoped architecture typecheck, production build, and 88-file/403-test
  suite pass.
- The generated `main.js` was synchronized to the enabled `nosygraph` plugin
  folder.

## 0.2.9 — 2026-09-18

### Fixed

- Updated the renderer to use Obsidian DOM helpers, CSS classes, and runtime CSS properties instead of direct inline style assignments.
- Hardened metadata and frontmatter adapters with explicit runtime narrowing and removed unnecessary type assertions.
- Used browser timer APIs in the lifecycle coordinator while retaining a host-neutral test fallback.
- Added paste-event guards and generated a fresh production bundle containing the fixes.

### Validation

- The automated suite passes 83 test files and 385 tests; the scoped architecture typecheck and production build pass.
- This release is intended to be rescanned by the automatic release checker.

## 0.2.8 — 2026-09-18

### Added

- Completed the documented extraction and class-based boundaries for controllers, rendering, persistence, lifecycle handling, Obsidian adapters, and the guarded store runtime.
- Added scoped metadata refresh behavior for large graphs.
- Added architecture and use-case documentation for metadata refresh, badge exploration, persistence, and migration status.

### Fixed

- Persisted badge expansions made inside graph lenses when the owning graph is persistent.
- Preserved child-node badge expansion sources in graph-note rebuilds.
- Kept visible and overlay connections when unrelated node frontmatter changes trigger incremental updates.
- Scoped visible-link refreshes to the changed source note instead of rebuilding the visible-link context for every source.

### Validation and limitations

- The production bundle is generated with `npm run build` and is included as `main.js`.
- The automated suite passes 83 test files and 385 tests; the scoped architecture typecheck passes.
- The plugin remains beta software. Store mode and replacement physics remain guarded/experimental, and interactive Obsidian verification is still required for release workflows involving large graphs, lenses, nested graphs, persistence, and lifecycle changes.
- Use a copied vault or reliable backups before testing graph-note writes.
