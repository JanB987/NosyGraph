# GraphEdge and LinkType

## Purpose

A `LinkType` defines relationship semantics. A `GraphEdge` is one visible runtime instance of such a relationship.

Current edge implementation: [`src/graph-domain/GraphEdge.ts`](../../src/graph-domain/GraphEdge.ts)

## LinkType

```ts
interface LinkType {
  id: LinkTypeId;
  property: string;
  readProperties: readonly string[];
  label: string;
  direction: "child" | "parent";
  discovery: "outgoing" | "incoming" | "both";
  renderStyle: "line" | "folder";
  duplicateNodes: boolean;
  physics: LinkPhysicsSettings;
}
```

## GraphEdge

```ts
interface GraphEdge {
  id: EdgeId;
  fromNodeId: NodeInstanceId;
  toNodeId: NodeInstanceId;
  linkTypeId: LinkTypeId;
  contextId: GraphContextId;
  origin: EdgeOrigin;
}
```

`origin` distinguishes edges introduced by a badge expansion from independently discovered, visible, overlay, and parent edges. This distinction lets collapse remove an expansion edge without deleting the same relationship when another graph rule still keeps it visible.

Badge-expansion edges share one stable identity function across the new materializer and the temporary legacy snapshot:

```ts
createGraphBadgeExpansionEdgeId(fromNodeId, toNodeId, linkTypeId): EdgeId;
```

Special legacy semantics take precedence. A visible, overlay, or parent edge keeps its legacy identity and origin even if an expansion also references it; only an ordinary expansion-owned edge is normalized to `badge-expansion`.

## Functions

```ts
resolveRelationshipDirection(source, target, linkType): RelationshipEndpoints;
buildVisibleEdges(nodes, relationships, linkTypes): readonly GraphEdge[];
getEdgesForNode(nodeId, edges): readonly GraphEdge[];
```

Avoid subclasses for each link type. Data-driven semantics plus pure functions are easier to test and extend.

## Connections

Edges are stored in [GraphStore](GraphStore.md), rendered by [GraphRenderer](GraphRenderer.md), and converted into forces by [PhysicsEngine](PhysicsEngine.md).

During migration, [LegacyGraphSnapshotAdapter](LegacyGraphSnapshotAdapter.md) maps the active engine's discovered, visible, overlay, parent, and expansion-owned edges into this model. The adapter copies endpoint IDs and classifies their origin without changing the renderer's edge collection.
