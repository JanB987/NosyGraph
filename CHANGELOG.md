# Changelog

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
