# GraphGroup and GraphContainer

## Purpose

`GraphGroup` classifies and styles notes. `GraphContainer` owns spatial membership and physics isolation. They are related but not interchangeable.

## GraphGroup

```ts
interface GraphGroup {
  id: GroupId;
  label: string;
  priority: number;
  condition: GroupCondition;
  style: GroupStyle;
}
```

Pure functions:

```ts
noteMatchesGroup(note, group): boolean;
resolveNodeGroups(note, groups): readonly GraphGroup[];
resolveEffectiveNodeStyle(note, groups): NodeStyle;
```

## GraphContainer

```ts
interface GraphContainer {
  id: ContainerId;
  contextId: GraphContextId;
  ownerNodeId?: NodeInstanceId;
  memberNodeIds: readonly NodeInstanceId[];
  parentContainerId?: ContainerId;
}
```

## Connections

- Groups evaluate [GraphNote](GraphNote.md) properties.
- Containers refer to [GraphNodeInstance](GraphNodeInstance.md) IDs.
- Both are stored in [GraphStore](GraphStore.md).
- Containers affect [PhysicsEngine](PhysicsEngine.md); groups do not directly change physics.
- Both provide render metadata to [GraphRenderer](GraphRenderer.md).

