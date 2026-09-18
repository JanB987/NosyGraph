import type { GraphBadge } from "../graph-domain/GraphBadge";
import {
  countGraphChanges,
  type GraphChangeSet,
  type GraphEntityChanges
} from "../graph-domain/GraphChangeSet";
import type { GraphEdge } from "../graph-domain/GraphEdge";
import type { GraphExpansion } from "../graph-domain/GraphExpansion";
import type { GraphLens } from "../graph-domain/GraphLens";
import type { GraphNodeInstance } from "../graph-domain/GraphNodeInstance";
import type { GraphNote } from "../graph-domain/GraphNote";
import type { GraphSnapshot, GraphSnapshotSource } from "../graph-domain/GraphSnapshot";
import type {
  BadgeId,
  EdgeId,
  ExpansionId,
  LensId,
  NodeInstanceId,
  NoteId
} from "../graph-domain/graph-identifiers";

export type GraphStoreCollectionName =
  | "notes"
  | "nodes"
  | "edges"
  | "badges"
  | "expansions"
  | "lenses";

export type GraphChangeSetApplyResult =
  | { applied: true; changeCount: number }
  | {
      applied: false;
      reason: "revision-mismatch";
      expectedRevision: number;
      actualRevision: number;
    }
  | {
      applied: false;
      reason: "duplicate-id" | "conflicting-id" | "missing-reference" | "expansion-cycle";
      collection: GraphStoreCollectionName;
      entityId: string;
      referenceId?: string;
    };

/**
 * Incremental owner of mutable graph runtime state.
 *
 * Selection is already connected to the live engine. Snapshot collections and
 * atomic changes are available for the new path but are not live-connected yet.
 */
export class GraphStore implements GraphSnapshotSource {
  private notes: Map<NoteId, GraphNote>;
  private nodes: Map<NodeInstanceId, GraphNodeInstance>;
  private edges: Map<EdgeId, GraphEdge>;
  private badges: Map<BadgeId, GraphBadge>;
  private expansions: Map<ExpansionId, GraphExpansion>;
  private lenses: Map<LensId, GraphLens>;
  private readonly selectedNodeIds = new Set<NodeInstanceId>();
  private revision = 0;

  constructor(snapshot: GraphSnapshot = emptyGraphSnapshot()) {
    this.notes = indexEntities(snapshot.notes, copyNote);
    this.nodes = indexEntities(snapshot.nodes, copyNode);
    this.edges = indexEntities(snapshot.edges, copyEntity);
    this.badges = indexEntities(snapshot.badges, copyEntity);
    this.expansions = indexEntities(snapshot.expansions, copyExpansion);
    this.lenses = indexEntities(snapshot.lenses, copyLens);
    for (const node of snapshot.nodes) {
      if (node.selected) this.selectedNodeIds.add(node.id);
    }
  }

  getSnapshot(): GraphSnapshot {
    return {
      notes: Array.from(this.notes.values(), copyNote),
      nodes: Array.from(this.nodes.values(), (node) => copyNode({
        ...node,
        selected: this.selectedNodeIds.has(node.id)
      })),
      edges: Array.from(this.edges.values(), copyEntity),
      badges: Array.from(this.badges.values(), copyEntity),
      expansions: Array.from(this.expansions.values(), copyExpansion),
      lenses: Array.from(this.lenses.values(), copyLens)
    };
  }

  getRevision(): number {
    return this.revision;
  }

  applyChangeSet(
    changeSet: GraphChangeSet,
    expectedRevision: number = this.revision
  ): GraphChangeSetApplyResult {
    if (expectedRevision !== this.revision) {
      return {
        applied: false,
        reason: "revision-mismatch",
        expectedRevision,
        actualRevision: this.revision
      };
    }
    const structuralFailure = validateChangeSetStructure(changeSet);
    if (structuralFailure) return structuralFailure;

    const currentNodes = new Map(
      Array.from(this.nodes.entries(), ([id, node]) => [
        id,
        { ...node, selected: this.selectedNodeIds.has(id) }
      ])
    );
    const nextNotes = applyEntityChanges(this.notes, changeSet.notes, copyNote);
    const nextNodes = applyEntityChanges(currentNodes, changeSet.nodes, copyNode);
    const nextEdges = applyEntityChanges(this.edges, changeSet.edges, copyEntity);
    const nextBadges = applyEntityChanges(this.badges, changeSet.badges, copyEntity);
    const nextExpansions = applyEntityChanges(
      this.expansions,
      changeSet.expansions,
      copyExpansion
    );
    const nextLenses = applyEntityChanges(this.lenses, changeSet.lenses, copyLens);
    const referenceFailure = validateReferences({
      notes: nextNotes,
      nodes: nextNodes,
      edges: nextEdges,
      badges: nextBadges,
      expansions: nextExpansions,
      lenses: nextLenses
    });
    if (referenceFailure) return referenceFailure;

    const nextSelectedNodeIds = new Set(this.selectedNodeIds);
    for (const nodeId of changeSet.nodes.removeIds) nextSelectedNodeIds.delete(nodeId);
    for (const node of changeSet.nodes.upsert) {
      if (node.selected) nextSelectedNodeIds.add(node.id);
      else nextSelectedNodeIds.delete(node.id);
    }

    this.notes = nextNotes;
    this.nodes = nextNodes;
    this.edges = nextEdges;
    this.badges = nextBadges;
    this.expansions = nextExpansions;
    this.lenses = nextLenses;
    this.selectedNodeIds.clear();
    for (const nodeId of nextSelectedNodeIds) this.selectedNodeIds.add(nodeId);
    const changeCount = countGraphChanges(changeSet);
    if (changeCount > 0) this.revision += 1;
    return { applied: true, changeCount };
  }

  getSelectedNodeIds(): readonly NodeInstanceId[] {
    return Array.from(this.selectedNodeIds);
  }

  getSelectedNodeCount(): number {
    return this.selectedNodeIds.size;
  }

  isNodeSelected(nodeId: NodeInstanceId): boolean {
    return this.selectedNodeIds.has(nodeId);
  }

  selectOnly(nodeId: NodeInstanceId): boolean {
    const normalized = this.normalizeNodeId(nodeId);
    if (!normalized) return this.clearSelection();
    if (this.selectedNodeIds.size === 1 && this.selectedNodeIds.has(normalized)) return false;
    this.selectedNodeIds.clear();
    this.selectedNodeIds.add(normalized);
    this.revision += 1;
    return true;
  }

  toggleSelection(nodeId: NodeInstanceId): boolean {
    const normalized = this.normalizeNodeId(nodeId);
    if (!normalized) return false;
    if (this.selectedNodeIds.has(normalized)) {
      this.selectedNodeIds.delete(normalized);
    } else {
      this.selectedNodeIds.add(normalized);
    }
    this.revision += 1;
    return true;
  }

  replaceSelection(nodeIds: Iterable<NodeInstanceId>): boolean {
    const next = new Set<NodeInstanceId>();
    for (const nodeId of nodeIds) {
      const normalized = this.normalizeNodeId(nodeId);
      if (normalized) next.add(normalized);
    }
    if (this.selectionEquals(next)) return false;
    this.selectedNodeIds.clear();
    for (const nodeId of next) this.selectedNodeIds.add(nodeId);
    this.revision += 1;
    return true;
  }

  clearSelection(): boolean {
    if (this.selectedNodeIds.size === 0) return false;
    this.selectedNodeIds.clear();
    this.revision += 1;
    return true;
  }

  private selectionEquals(other: ReadonlySet<NodeInstanceId>): boolean {
    if (other.size !== this.selectedNodeIds.size) return false;
    for (const nodeId of other) {
      if (!this.selectedNodeIds.has(nodeId)) return false;
    }
    return true;
  }

  private normalizeNodeId(nodeId: NodeInstanceId): NodeInstanceId {
    return String(nodeId ?? "").trim();
  }
}

export type GraphStoreReferenceValidationFailure = {
  applied: false;
  reason: "missing-reference" | "expansion-cycle";
  collection: GraphStoreCollectionName;
  entityId: string;
  referenceId?: string;
};

export type GraphStoreSnapshotValidationFailure =
  | {
      applied: false;
      reason: "invalid-id" | "duplicate-id";
      collection: GraphStoreCollectionName;
      entityId: string;
    }
  | GraphStoreReferenceValidationFailure;

export function validateGraphSnapshot(
  snapshot: GraphSnapshot
): GraphStoreSnapshotValidationFailure | null {
  const collections: Array<[
    GraphStoreCollectionName,
    readonly { id: string }[]
  ]> = [
    ["notes", snapshot.notes],
    ["nodes", snapshot.nodes],
    ["edges", snapshot.edges],
    ["badges", snapshot.badges],
    ["expansions", snapshot.expansions],
    ["lenses", snapshot.lenses]
  ];

  for (const [collection, entities] of collections) {
    const ids = new Set<string>();
    for (const entity of entities) {
      const entityId = String(entity?.id ?? "");
      if (!entityId.trim()) {
        return {
          applied: false,
          reason: "invalid-id",
          collection,
          entityId
        };
      }
      if (ids.has(entityId)) {
        return {
          applied: false,
          reason: "duplicate-id",
          collection,
          entityId
        };
      }
      ids.add(entityId);
    }
  }

  const state: GraphStateMaps = {
    notes: new Map(snapshot.notes.map((entity) => [entity.id, entity])),
    nodes: new Map(snapshot.nodes.map((entity) => [entity.id, entity])),
    edges: new Map(snapshot.edges.map((entity) => [entity.id, entity])),
    badges: new Map(snapshot.badges.map((entity) => [entity.id, entity])),
    expansions: new Map(snapshot.expansions.map((entity) => [entity.id, entity])),
    lenses: new Map(snapshot.lenses.map((entity) => [entity.id, entity]))
  };
  return validateReferences(state) as GraphStoreSnapshotValidationFailure | null;
}

interface GraphStateMaps {
  notes: ReadonlyMap<NoteId, GraphNote>;
  nodes: ReadonlyMap<NodeInstanceId, GraphNodeInstance>;
  edges: ReadonlyMap<EdgeId, GraphEdge>;
  badges: ReadonlyMap<BadgeId, GraphBadge>;
  expansions: ReadonlyMap<ExpansionId, GraphExpansion>;
  lenses: ReadonlyMap<LensId, GraphLens>;
}

function emptyGraphSnapshot(): GraphSnapshot {
  return { notes: [], nodes: [], edges: [], badges: [], expansions: [], lenses: [] };
}

function indexEntities<TEntity extends { id: string }>(
  entities: readonly TEntity[],
  copy: (entity: TEntity) => TEntity
): Map<string, TEntity> {
  return new Map(entities.map((entity) => [entity.id, copy(entity)]));
}

function applyEntityChanges<TEntity extends { id: string }>(
  current: ReadonlyMap<string, TEntity>,
  changes: GraphEntityChanges<TEntity, string>,
  copy: (entity: TEntity) => TEntity
): Map<string, TEntity> {
  const next = new Map(current);
  for (const id of changes.removeIds) next.delete(id);
  for (const entity of changes.upsert) next.set(entity.id, copy(entity));
  return next;
}

function validateChangeSetStructure(changeSet: GraphChangeSet): GraphChangeSetApplyResult | null {
  const collections: Array<[
    GraphStoreCollectionName,
    GraphEntityChanges<{ id: string }, string>
  ]> = [
    ["notes", changeSet.notes],
    ["nodes", changeSet.nodes],
    ["edges", changeSet.edges],
    ["badges", changeSet.badges],
    ["expansions", changeSet.expansions],
    ["lenses", changeSet.lenses]
  ];
  for (const [collection, changes] of collections) {
    const upsertIds = new Set<string>();
    for (const entity of changes.upsert) {
      if (upsertIds.has(entity.id)) {
        return { applied: false, reason: "duplicate-id", collection, entityId: entity.id };
      }
      upsertIds.add(entity.id);
    }
    const removeIds = new Set<string>();
    for (const id of changes.removeIds) {
      if (removeIds.has(id)) {
        return { applied: false, reason: "duplicate-id", collection, entityId: id };
      }
      if (upsertIds.has(id)) {
        return { applied: false, reason: "conflicting-id", collection, entityId: id };
      }
      removeIds.add(id);
    }
  }
  return null;
}

function validateReferences(state: GraphStateMaps): GraphChangeSetApplyResult | null {
  for (const node of state.nodes.values()) {
    if (!state.notes.has(node.noteId)) {
      return missingReference("nodes", node.id, node.noteId);
    }
    if (
      node.origin.kind === "badge-expansion"
      && !state.expansions.has(node.origin.expansionId)
    ) {
      return missingReference("nodes", node.id, node.origin.expansionId);
    }
  }
  for (const edge of state.edges.values()) {
    if (!state.nodes.has(edge.fromNodeId)) {
      return missingReference("edges", edge.id, edge.fromNodeId);
    }
    if (!state.nodes.has(edge.toNodeId)) {
      return missingReference("edges", edge.id, edge.toNodeId);
    }
  }
  for (const badge of state.badges.values()) {
    if (!state.nodes.has(badge.nodeId)) {
      return missingReference("badges", badge.id, badge.nodeId);
    }
    if (badge.expansionId && !state.expansions.has(badge.expansionId)) {
      return missingReference("badges", badge.id, badge.expansionId);
    }
  }
  for (const expansion of state.expansions.values()) {
    if (!state.nodes.has(expansion.sourceNodeId)) {
      return missingReference("expansions", expansion.id, expansion.sourceNodeId);
    }
    if (!state.notes.has(expansion.sourceNoteId)) {
      return missingReference("expansions", expansion.id, expansion.sourceNoteId);
    }
    for (const nodeId of expansion.ownedNodeIds) {
      if (!state.nodes.has(nodeId)) return missingReference("expansions", expansion.id, nodeId);
    }
    for (const edgeId of expansion.ownedEdgeIds) {
      if (!state.edges.has(edgeId)) return missingReference("expansions", expansion.id, edgeId);
    }
    for (const childId of expansion.childExpansionIds) {
      if (!state.expansions.has(childId)) {
        return missingReference("expansions", expansion.id, childId);
      }
    }
  }
  const cycleId = findExpansionCycle(state.expansions);
  if (cycleId) {
    return {
      applied: false,
      reason: "expansion-cycle",
      collection: "expansions",
      entityId: cycleId
    };
  }
  for (const lens of state.lenses.values()) {
    if (!state.nodes.has(lens.sourceNodeId)) {
      return missingReference("lenses", lens.id, lens.sourceNodeId);
    }
  }
  return null;
}

function findExpansionCycle(
  expansions: ReadonlyMap<ExpansionId, GraphExpansion>
): ExpansionId | null {
  const visiting = new Set<ExpansionId>();
  const visited = new Set<ExpansionId>();
  const visit = (id: ExpansionId): ExpansionId | null => {
    if (visiting.has(id)) return id;
    if (visited.has(id)) return null;
    visiting.add(id);
    for (const childId of expansions.get(id)?.childExpansionIds ?? []) {
      const cycleId = visit(childId);
      if (cycleId) return cycleId;
    }
    visiting.delete(id);
    visited.add(id);
    return null;
  };
  for (const id of expansions.keys()) {
    const cycleId = visit(id);
    if (cycleId) return cycleId;
  }
  return null;
}

function missingReference(
  collection: GraphStoreCollectionName,
  entityId: string,
  referenceId: string
): GraphChangeSetApplyResult {
  return {
    applied: false,
    reason: "missing-reference",
    collection,
    entityId,
    referenceId
  };
}

function copyNote(note: GraphNote): GraphNote {
  return { ...note, properties: copyGraphRecord(note.properties) };
}

function copyGraphRecord(
  record: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, copyGraphValue(value)])
  );
}

function copyGraphValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copyGraphValue);
  if (value && typeof value === "object") {
    return copyGraphRecord(value as Readonly<Record<string, unknown>>);
  }
  return value;
}

function copyNode(node: GraphNodeInstance): GraphNodeInstance {
  return {
    ...node,
    position: { ...node.position },
    velocity: { ...node.velocity },
    origin: { ...node.origin }
  };
}

function copyExpansion(expansion: GraphExpansion): GraphExpansion {
  return {
    ...expansion,
    ownedNodeIds: [...expansion.ownedNodeIds],
    ownedEdgeIds: [...expansion.ownedEdgeIds],
    childExpansionIds: [...expansion.childExpansionIds]
  };
}

function copyLens(lens: GraphLens): GraphLens {
  return {
    ...lens,
    bounds: { ...lens.bounds },
    viewport: { ...lens.viewport }
  };
}

function copyEntity<TEntity extends object>(entity: TEntity): TEntity {
  return { ...entity };
}
