# GraphRenderer

## Purpose

GraphRenderer converts a detached GraphRenderSnapshot into canvas output and renderer-owned DOM badge handles. It translates pointer clicks into serializable renderer intents. It never mutates notes, nodes, badges, edges, expansions, or lenses.

Current implementation: [src/graph-application/GraphRenderer.ts](../../src/graph-application/GraphRenderer.ts)

## Status

The renderer boundary is implemented and tested as an experimental store-mode projection. The production Obsidian view still draws and hit-tests through the legacy GraphEngine until the renderer compatibility and interaction gates in [GraphStore Ownership Cutover](GraphStoreOwnershipCutover.md) pass.

## API

- mount(container) creates and owns a canvas and badge overlay.
- render(snapshot) copies a detached snapshot, lays out hit regions, and draws available canvas output.
- resize(width, height) updates the renderer-owned canvas.
- hitTestNode(point) and hitTestBadge(point) return stable identities without changing state.
- onIntent(listener) subscribes to node-clicked and badge-clicked intents.
- unmount() removes event listeners and renderer-owned DOM handles.

The snapshot includes a viewport transform. Invalid viewport and radius values are normalized at the rendering boundary; semantic records are not rewritten.

## Renderer-owned handles

Canvas and DOM handles never enter GraphSnapshot:

- The canvas and 2D context belong to the renderer instance.
- Badge buttons are kept in a map keyed by BadgeId.
- Node and badge hit regions are kept in maps keyed by NodeInstanceId and BadgeId.
- A changed snapshot removes stale handles and creates only the new visual handles.

This keeps drawing, pointer hit testing, and DOM lifecycle separate from GraphStore and GraphController.

Static renderer layout is supplied by the `nosygraph-renderer-*` classes in
`styles.css`. Obsidian's `createEl` creates the canvas, overlay, and badge
buttons; only the badge button's position and size are updated at runtime with
`setCssProps`.

## Connections

- Consumes detached semantic and motion projections from [GraphSnapshotKinematicsComposer](GraphSnapshotKinematicsComposer.md).
- Emits intents to [GraphController](GraphController.md).
- Uses stable identities from [GraphNodeInstance](GraphNodeInstance.md) and [GraphBadge](GraphBadge.md).
- Is available for [GraphStore Ownership Cutover](GraphStoreOwnershipCutover.md) Stage 4.
- Test coverage: [GraphRenderer.test.ts](../../src/graph-application/GraphRenderer.test.ts).

The renderer currently does not own physics, persistence, graph expansion, selection commands, or lens mutation. Those remain application or host responsibilities.
