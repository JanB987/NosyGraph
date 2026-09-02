# GraphRenderer

## Purpose

`GraphRenderer` converts a read-only graph snapshot into canvas and DOM output. It also translates pointer and keyboard input into semantic intents.

## Proposed API

```ts
class GraphRenderer {
  mount(container: HTMLElement): void;
  render(snapshot: GraphRenderSnapshot): void;
  resize(width: number, height: number): void;
  hitTestNode(point: Point): NodeInstanceId | undefined;
  hitTestBadge(point: Point): BadgeId | undefined;
  onIntent(listener: GraphIntentListener): Unsubscribe;
  unmount(): void;
}
```

## Responsibilities

- Node, edge, badge, lens, and container drawing
- Viewport transforms
- Hit testing
- DOM badge overlays
- Visual hover, drag, and selection feedback
- Emitting intents such as `NodeClickedIntent` and `BadgeClickedIntent`

## Connections

- Will read detached semantic and motion snapshots from [GraphSnapshotKinematicsComposer](GraphSnapshotKinematicsComposer.md).
- Emits intents to [GraphController](GraphController.md).
- Uses independently sequenced positions from [GraphKinematicsStore](GraphKinematicsStore.md).
- Renders [GraphLens](GraphLens.md) contexts with clipping and local transforms.

The renderer never reads or writes notes.

Its role in the ownership migration is defined by [GraphStore Ownership Cutover](GraphStoreOwnershipCutover.md). Store mode must supply renderer-owned visual handles and read-only semantic projections rather than allowing drawing helpers to mutate graph collections.
