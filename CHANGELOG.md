# Changelog

## 0.2.14 - 2026-10-27

### Fixed

- Remove the redundant plugin-name heading from the settings panel to comply
  with the Obsidian checker. Keep the introduction as descriptive text.
- Enable the matching settings-heading lint rule to catch this locally.

## 0.2.13 - 2026-10-27

### Changed

- Organize plugin settings into graph defaults, appearance, linked-note
  navigation, and interaction, with shorter labels and clearer descriptions.
- Place advanced note identifiers and YAML property mappings in collapsible,
  keyboard-accessible sections. Preserve existing saved values.
- Add theme-aware section styling, aligned controls, labeled identifier fields,
  and a stacked layout for narrow settings panels.

- Hide the unused Graph marker, Filters, and Recursive property mappings.
- Move Relationship direction into Legacy compatibility and clarify that it
  provides an arrow-direction fallback, not relationship discovery.
  Existing mappings remain stored for compatibility.

### Fixed

- Adding YAML links to explicitly configured or default root-node properties
  refreshes open graph views and lenses automatically, including shortly after
  a graph-state save.
- Merge newly configured roots into existing and restored Lens snapshots while
  retaining node positions, pinning, and badge expansion state.

## 0.2.12 - 2026-10-21

- Publish the validated plugin-checker fixes under a new version so Obsidian
  can run a fresh release scan after 0.2.11 was already scanned.
- Synchronize manifest, package metadata, compatibility mapping, and release
  documentation. Runtime code is unchanged from the corrected 0.2.11 build.
- Minimum Obsidian version remains 1.5.0. The 0.2.11 fixes passed 551 tests,
  scoped typecheck, production build, and local checks for the reported lint rules.

## 0.2.11 - 2026-10-21

### Added

- Lens LinkTypes (`linkType: lens`) with independent viewports, multiple read
  properties, an optional `writeProperty`, and definition-scoped instance state.
- Multiple connected Bases/views through a YAML list in `connected_base_filter`;
  results are combined without duplicate notes and every Base is watched.
- Apply a Templater template to selected graph nodes using the installed
  Templater plugin.
- Configurable far-view Lens badge and pin thresholds, with per-note overrides.

### Fixed

- Address the automatic plugin review: guard post-1.5 storage APIs with a
  vault-scoped fallback and migration, parse property IDs without the newer
  Bases helper, use DOM helpers, and correct lifecycle/paste/promise handling.
- Replace browser confirmation with an Obsidian Templater confirmation modal,
  remove deprecated slider tooltip calls, and restore the extracted engine's
  missing typed connection-preview dependency.
- Persist inline grouping rules in the graph note, including an explicitly
  empty rule list.
- Save Lens open/closed state from both node badges and the window close button;
  serialize Lens writes and finish pending actions before unloading the note.
- Keep graph-capable Lens targets read-only unless explicitly identified as
  persistent graph notes; store their instance snapshots in the owning graph.
- Preserve full paths and extensions in Base file-property comparisons; support
  unary negation and report unsupported filter syntax.
- Combine global Base filters with view filters using AND, and apply `not`
  lists as none-of groups.
- Match LinkType properties case-insensitively in outgoing and incoming discovery,
  cached metadata, aliases, and visible relationship edges.
- Preserve ordinary badge visibility rules while allowing discoverable Lens
  badges; keep LinkType definition identities and references stable across moves.
- Route graph-node opening according to graph capability, pinned panes, and
  Graph Tab behavior. Preserve configured graph state during promotion.

### Validation and limitations

- Scoped architecture typecheck, production build, and 103-file/551-test suite pass.
- Local lint checks reproduce the reported compatibility and code-safety rules.
- The live composition remains `GraphView -> GraphEngine`. Store runtime and
  replacement physics remain experimental; the separate 0.3 development plugin
  is not included.
- Lens LinkTypes currently support outgoing discovery. The Base evaluator
  supports a documented subset of expressions and reports unsupported syntax;
  use YAML `and`/`or` groups for compound conditions.
- Manual large-vault, nested-Lens, Templater, and clean-install validation remains
  incomplete. NosyGraph remains beta software.

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
