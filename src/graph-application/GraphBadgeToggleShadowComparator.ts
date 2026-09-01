import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import type { GraphBadgeToggleShadowObservation } from "./GraphBadgeToggleShadowService";
import { GraphStore } from "./GraphStore";

export type GraphBadgeToggleComparedCollection =
  | "notes"
  | "nodes"
  | "edges"
  | "badges"
  | "expansions";

export interface GraphBadgeToggleShadowDifference {
  collection: GraphBadgeToggleComparedCollection;
  entityId: string;
  kind: "missing-after-legacy" | "unexpected-after-legacy" | "value-mismatch";
  fields?: readonly string[];
}

export type GraphBadgeToggleShadowComparison =
  | {
      status: "compared";
      matches: boolean;
      differences: readonly GraphBadgeToggleShadowDifference[];
    }
  | {
      status: "not-comparable";
      reason:
        | "shadow-threw"
        | "transition-rejected"
        | "legacy-not-applied"
        | "expected-state-rejected";
    };

/** Compares a calculated transition with the semantic state produced by legacy execution. */
export class GraphBadgeToggleShadowComparator {
  compare(
    observation: GraphBadgeToggleShadowObservation
  ): GraphBadgeToggleShadowComparison {
    if (observation.calculation.status === "failed") {
      return { status: "not-comparable", reason: "shadow-threw" };
    }
    if (!observation.calculation.result.ok) {
      return { status: "not-comparable", reason: "transition-rejected" };
    }
    if (observation.execution.status !== "applied") {
      return { status: "not-comparable", reason: "legacy-not-applied" };
    }

    const expectedStore = new GraphStore(observation.beforeSnapshot);
    const applied = expectedStore.applyChangeSet(
      observation.calculation.result.changeSet
    );
    if (!applied.applied) {
      return { status: "not-comparable", reason: "expected-state-rejected" };
    }

    const differences = compareSnapshots(
      expectedStore.getSnapshot(),
      observation.afterSnapshot
    );
    return {
      status: "compared",
      matches: differences.length === 0,
      differences
    };
  }
}

function compareSnapshots(
  expected: GraphSnapshot,
  actual: GraphSnapshot
): GraphBadgeToggleShadowDifference[] {
  return [
    ...compareCollection("notes", expected.notes, actual.notes, projectNote),
    ...compareCollection("nodes", expected.nodes, actual.nodes, projectNode),
    ...compareCollection("edges", expected.edges, actual.edges, projectEntity),
    ...compareCollection("badges", expected.badges, actual.badges, projectBadge),
    ...compareCollection(
      "expansions",
      expected.expansions,
      actual.expansions,
      projectExpansion
    )
  ];
}

function compareCollection<TEntity extends { id: string }>(
  collection: GraphBadgeToggleComparedCollection,
  expected: readonly TEntity[],
  actual: readonly TEntity[],
  project: (entity: TEntity) => Readonly<Record<string, unknown>>
): GraphBadgeToggleShadowDifference[] {
  const expectedById = new Map(expected.map((entity) => [entity.id, entity]));
  const actualById = new Map(actual.map((entity) => [entity.id, entity]));
  const differences: GraphBadgeToggleShadowDifference[] = [];

  for (const [entityId, expectedEntity] of expectedById) {
    const actualEntity = actualById.get(entityId);
    if (!actualEntity) {
      differences.push({ collection, entityId, kind: "missing-after-legacy" });
      continue;
    }
    const expectedValue = project(expectedEntity);
    const actualValue = project(actualEntity);
    const fields = Object.keys(expectedValue).filter((field) =>
      stableValue(expectedValue[field]) !== stableValue(actualValue[field])
    );
    if (fields.length > 0) {
      differences.push({ collection, entityId, kind: "value-mismatch", fields });
    }
  }
  for (const entityId of actualById.keys()) {
    if (!expectedById.has(entityId)) {
      differences.push({ collection, entityId, kind: "unexpected-after-legacy" });
    }
  }
  return differences;
}

function projectNote(
  entity: GraphSnapshot["notes"][number]
): Readonly<Record<string, unknown>> {
  return {
    path: entity.path,
    name: entity.name,
    availability: entity.availability,
    properties: entity.properties,
    configuredSize: entity.configuredSize,
    icon: entity.icon
  };
}

function projectNode(entity: GraphSnapshot["nodes"][number]): Readonly<Record<string, unknown>> {
  return {
    noteId: entity.noteId,
    contextId: entity.contextId,
    origin: entity.origin
  };
}

function projectExpansion(
  entity: GraphSnapshot["expansions"][number]
): Readonly<Record<string, unknown>> {
  return {
    sourceNodeId: entity.sourceNodeId,
    sourceNoteId: entity.sourceNoteId,
    linkTypeId: entity.linkTypeId,
    contextId: entity.contextId,
    ownedNodeIds: [...entity.ownedNodeIds].sort(),
    ownedEdgeIds: [...entity.ownedEdgeIds].sort(),
    childExpansionIds: [...entity.childExpansionIds].sort()
  };
}

function projectBadge(
  entity: GraphSnapshot["badges"][number]
): Readonly<Record<string, unknown>> {
  return {
    nodeId: entity.nodeId,
    linkTypeId: entity.linkTypeId,
    contextId: entity.contextId,
    state: entity.state,
    semantic: entity.semantic,
    hasRelationships: entity.hasRelationships,
    duplicateNodes: entity.duplicateNodes,
    expansionId: entity.expansionId
  };
}

function projectEntity<TEntity extends { id: string }>(
  entity: TEntity
): Readonly<Record<string, unknown>> {
  const { id: _id, ...value } = entity;
  return value;
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(stableObject));
  return JSON.stringify(stableObject(value));
}

function stableObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Readonly<Record<string, unknown>>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableObject(item)])
    );
  }
  return value;
}
