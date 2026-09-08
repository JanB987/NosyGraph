import type { GraphContainer } from "../graph-domain/GraphContainer";
import type { GraphGroup } from "../graph-domain/GraphGroup";
import type { GraphLens } from "../graph-domain/GraphLens";
import type { ContainerId, GroupId, LensId } from "../graph-domain/graph-identifiers";
import {
  type GraphSceneCommand,
  type GraphSceneCommandPort,
  type GraphSceneCommandResult
} from "./GraphSceneCommand";

export interface GraphSceneSnapshot {
  lenses: readonly GraphLens[];
  groups: readonly GraphGroup[];
  containers: readonly GraphContainer[];
}

export class GraphSceneStore implements GraphSceneCommandPort {
  private readonly lenses = new Map<LensId, GraphLens>();
  private readonly groups = new Map<GroupId, GraphGroup>();
  private readonly containers = new Map<ContainerId, GraphContainer>();
  private revision = 0;

  constructor(snapshot: GraphSceneSnapshot = { lenses: [], groups: [], containers: [] }) {
    this.load(snapshot);
  }

  getRevision(): number {
    return this.revision;
  }

  getSnapshot(): GraphSceneSnapshot {
    return {
      lenses: Array.from(this.lenses.values(), copyLens),
      groups: Array.from(this.groups.values(), copyGroup),
      containers: Array.from(this.containers.values(), copyContainer)
    };
  }

  executeScene(command: GraphSceneCommand): GraphSceneCommandResult {
    const current = this.getSnapshot();
    const maps: SceneMaps = {
      lenses: new Map(current.lenses.map((item) => [item.id, item])),
      groups: new Map(current.groups.map((item) => [item.id, item])),
      containers: new Map(current.containers.map((item) => [item.id, item]))
    };

    const result = applyCommand(maps, command);
    if (!result.ok) {
      return { handled: false, command: command.type, reason: result.reason, revision: this.revision };
    }

    const validationFailure = validateScene(maps);
    if (validationFailure) {
      return {
        handled: false,
        command: command.type,
        reason: validationFailure,
        revision: this.revision
      };
    }

    if (!result.changed) {
      return { handled: true, command: command.type, changed: false, revision: this.revision };
    }

    this.lenses.clear();
    this.groups.clear();
    this.containers.clear();
    for (const [id, lens] of maps.lenses) this.lenses.set(id, copyLens(lens));
    for (const [id, group] of maps.groups) this.groups.set(id, copyGroup(group));
    for (const [id, container] of maps.containers) this.containers.set(id, copyContainer(container));
    this.revision += 1;

    return { handled: true, command: command.type, changed: true, revision: this.revision };
  }

  private load(snapshot: GraphSceneSnapshot): void {
    const maps: SceneMaps = {
      lenses: new Map(snapshot.lenses.map((item) => [item.id, copyLens(item)])),
      groups: new Map(snapshot.groups.map((item) => [item.id, copyGroup(item)])),
      containers: new Map(snapshot.containers.map((item) => [item.id, copyContainer(item)]))
    };
    if (validateScene(maps)) throw new Error("Invalid graph scene snapshot");
    for (const [id, lens] of maps.lenses) this.lenses.set(id, lens);
    for (const [id, group] of maps.groups) this.groups.set(id, group);
    for (const [id, container] of maps.containers) this.containers.set(id, container);
  }
}

type SceneMaps = {
  lenses: Map<LensId, GraphLens>;
  groups: Map<GroupId, GraphGroup>;
  containers: Map<ContainerId, GraphContainer>;
};

type ApplyResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: "invalid-id" | "duplicate-id" | "not-found" | "invalid-value" };

function applyCommand(maps: SceneMaps, command: GraphSceneCommand): ApplyResult {
  switch (command.type) {
    case "create-lens":
      return create(maps.lenses, command.lens, isLensValid);
    case "update-lens":
      return update(maps.lenses, command.lens, isLensValid);
    case "remove-lens":
      return remove(maps.lenses, command.lensId);
    case "create-group":
      return create(maps.groups, command.group, isGroupValid);
    case "update-group":
      return update(maps.groups, command.group, isGroupValid);
    case "remove-group":
      return remove(maps.groups, command.groupId);
    case "create-container":
      return create(maps.containers, command.container, isContainerValid);
    case "update-container":
      return update(maps.containers, command.container, isContainerValid);
    case "remove-container":
      return remove(maps.containers, command.containerId);
  }
}

function create<TEntity extends { id: string }>(
  map: Map<string, TEntity>,
  entity: TEntity,
  valid: (value: TEntity) => boolean
): ApplyResult {
  const id = String(entity.id ?? "").trim();
  if (!id || id !== entity.id || !valid(entity)) return { ok: false, reason: "invalid-value" };
  if (map.has(id)) return { ok: false, reason: "duplicate-id" };
  map.set(id, entity);
  return { ok: true, changed: true };
}

function update<TEntity extends { id: string }>(
  map: Map<string, TEntity>,
  entity: TEntity,
  valid: (value: TEntity) => boolean
): ApplyResult {
  const id = String(entity.id ?? "").trim();
  if (!id || id !== entity.id || !valid(entity)) return { ok: false, reason: "invalid-value" };
  if (!map.has(id)) return { ok: false, reason: "not-found" };
  if (JSON.stringify(map.get(id)) === JSON.stringify(entity)) return { ok: true, changed: false };
  map.set(id, entity);
  return { ok: true, changed: true };
}

function remove<TEntity>(map: Map<string, TEntity>, idRaw: string): ApplyResult {
  const id = String(idRaw ?? "").trim();
  if (!id) return { ok: false, reason: "invalid-id" };
  if (!map.delete(id)) return { ok: false, reason: "not-found" };
  return { ok: true, changed: true };
}

function validateScene(
  maps: SceneMaps
): "invalid-container-reference" | "container-cycle" | null {
  for (const container of maps.containers.values()) {
    if (!isContainerValid(container)) return "invalid-container-reference";
    if (container.lensId && !maps.lenses.has(container.lensId)) return "invalid-container-reference";
    for (const parentId of container.parentContainerIds) {
      if (!maps.containers.has(parentId) || parentId === container.id) {
        return "invalid-container-reference";
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    for (const parentId of maps.containers.get(id)?.parentContainerIds ?? []) {
      if (!visit(parentId)) return false;
    }
    visiting.delete(id);
    visited.add(id);
    return true;
  };

  for (const id of maps.containers.keys()) {
    if (!visit(id)) return "container-cycle";
  }
  return null;
}

function isLensValid(lens: GraphLens): boolean {
  return Boolean(String(lens.id ?? "").trim())
    && Boolean(String(lens.sourceNodeId ?? "").trim())
    && Boolean(String(lens.documentId ?? "").trim())
    && Boolean(String(lens.contextId ?? "").trim())
    && finiteRectangle(lens.bounds)
    && Number.isFinite(lens.viewport.x)
    && Number.isFinite(lens.viewport.y)
    && Number.isFinite(lens.viewport.zoom)
    && lens.viewport.zoom > 0;
}

function isGroupValid(group: GraphGroup): boolean {
  return Boolean(String(group.id ?? "").trim())
    && Boolean(String(group.label ?? "").trim())
    && Boolean(String(group.property ?? "").trim())
    && ["equals", "contains", "exists"].includes(group.operator)
    && Boolean(String(group.color ?? "").trim())
    && Number.isFinite(group.priority);
}

function isContainerValid(container: GraphContainer): boolean {
  const ids = [...container.memberNodeIds];
  return Boolean(String(container.id ?? "").trim())
    && Boolean(String(container.contextId ?? "").trim())
    && Boolean(String(container.originNodeId ?? "").trim())
    && (container.kind === "parent" || container.kind === "embedded")
    && ids.every((id) => Boolean(String(id ?? "").trim()))
    && new Set(ids).size === ids.length
    && new Set(container.parentContainerIds).size === container.parentContainerIds.length
    && finiteRectangle(container.bounds);
}

function finiteRectangle(rectangle: GraphLens["bounds"]): boolean {
  return Number.isFinite(rectangle.left)
    && Number.isFinite(rectangle.top)
    && Number.isFinite(rectangle.right)
    && Number.isFinite(rectangle.bottom)
    && rectangle.right >= rectangle.left
    && rectangle.bottom >= rectangle.top;
}

function copyLens(lens: GraphLens): GraphLens {
  return { ...lens, bounds: { ...lens.bounds }, viewport: { ...lens.viewport } };
}

function copyGroup(group: GraphGroup): GraphGroup {
  return { ...group };
}

function copyContainer(container: GraphContainer): GraphContainer {
  return {
    ...container,
    memberNodeIds: [...container.memberNodeIds],
    parentContainerIds: [...container.parentContainerIds],
    bounds: { ...container.bounds }
  };
}
