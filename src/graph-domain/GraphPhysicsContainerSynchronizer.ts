import type { ContainerId, NodeInstanceId } from "./graph-identifiers";
import type { GraphPhysicsNode } from "./GraphPhysicsInput";
import {
  copyGraphPhysicsContainerState,
  type GraphPhysicsContainer,
  type GraphPhysicsContainerState
} from "./GraphPhysicsContainers";

export interface GraphParentContainerRequest {
  id: ContainerId;
  originNodeId: NodeInstanceId;
}

export interface GraphParentContainerMembership {
  containerId: ContainerId;
  nodeId: NodeInstanceId;
}

export interface GraphPhysicsContainerSynchronizationInput {
  nodes: readonly GraphPhysicsNode[];
  existing: GraphPhysicsContainerState;
  parentRequests: readonly GraphParentContainerRequest[];
  parentMemberships: readonly GraphParentContainerMembership[];
  baseNodeRadius: number;
  minimumViewportSize?: number;
  embeddedViewportScale?: number;
}

export interface GraphPhysicsContainerSynchronizationResult {
  state: GraphPhysicsContainerState;
  diagnostics: {
    createdParentIds: readonly ContainerId[];
    recalculatedParentIds: readonly ContainerId[];
    recalculatedEmbeddedIds: readonly ContainerId[];
    removedParentIds: readonly ContainerId[];
    skippedEmptyParentIds: readonly ContainerId[];
    replacedKindIds: readonly ContainerId[];
    ignoredMemberships: readonly GraphParentContainerMembership[];
    missingEmbeddedOriginIds: readonly NodeInstanceId[];
  };
}

/** Rebuilds dynamic container membership and geometry without mutating input state. */
export class GraphPhysicsContainerSynchronizer {
  synchronize(
    input: GraphPhysicsContainerSynchronizationInput
  ): GraphPhysicsContainerSynchronizationResult {
    const nodes = new Map(input.nodes.map((node) => [node.id, node]));
    const existing = copyGraphPhysicsContainerState(input.existing);
    const existingById = new Map(existing.containers.map((container) => [container.id, container]));
    const membershipByContainer = new Map<ContainerId, NodeInstanceId[]>();
    const requestById = new Map<ContainerId, GraphParentContainerRequest>();
    const ignoredMemberships: GraphParentContainerMembership[] = [];

    for (const request of input.parentRequests) {
      if (!requestById.has(request.id)) requestById.set(request.id, { ...request });
    }
    for (const membership of input.parentMemberships) {
      if (!requestById.has(membership.containerId) || !nodes.has(membership.nodeId)) {
        ignoredMemberships.push({ ...membership });
        continue;
      }
      const members = membershipByContainer.get(membership.containerId) ?? [];
      if (!members.includes(membership.nodeId)) members.push(membership.nodeId);
      membershipByContainer.set(membership.containerId, members);
    }

    const baseRadius = finitePositive(input.baseNodeRadius, 0);
    const minimumViewportSize = Math.max(
      44,
      finitePositive(input.minimumViewportSize ?? baseRadius * 2.2, 44)
    );
    const embeddedViewportScale = finitePositive(input.embeddedViewportScale ?? 2.8, 2.8);
    const containers: GraphPhysicsContainer[] = [];
    const createdParentIds: ContainerId[] = [];
    const recalculatedParentIds: ContainerId[] = [];
    const skippedEmptyParentIds: ContainerId[] = [];
    const replacedKindIds: ContainerId[] = [];

    for (const request of requestById.values()) {
      const memberNodeIds = membershipByContainer.get(request.id) ?? [];
      if (memberNodeIds.length === 0) {
        skippedEmptyParentIds.push(request.id);
        continue;
      }
      const memberNodes = memberNodeIds
        .map((nodeId) => nodes.get(nodeId))
        .filter((node): node is GraphPhysicsNode => Boolean(node));
      const bounds = calculateParentBounds(memberNodes, baseRadius, minimumViewportSize);
      const previous = existingById.get(request.id);
      if (previous && previous.kind !== "parent") replacedKindIds.push(request.id);
      if (!previous || previous.kind !== "parent") createdParentIds.push(request.id);
      else recalculatedParentIds.push(request.id);
      containers.push({
        id: request.id,
        kind: "parent",
        originNodeId: request.originNodeId,
        memberNodeIds,
        bounds,
        parentContainerIds: previous?.parentContainerIds ? [...previous.parentContainerIds] : []
      });
    }

    const activeParentIds = new Set(
      containers.filter((container) => container.kind === "parent").map((container) => container.id)
    );
    const removedParentIds = existing.containers
      .filter((container) => container.kind === "parent" && !activeParentIds.has(container.id))
      .map((container) => container.id);
    const missingEmbeddedOriginIds: NodeInstanceId[] = [];
    const recalculatedEmbeddedIds: ContainerId[] = [];
    for (const previous of existing.containers) {
      if (previous.kind !== "embedded" || activeParentIds.has(previous.id)) continue;
      const origin = nodes.get(previous.originNodeId);
      const radius = origin?.radius ?? baseRadius;
      if (!origin) missingEmbeddedOriginIds.push(previous.originNodeId);
      const width = Math.max(minimumViewportSize, finitePositive(radius, baseRadius) * embeddedViewportScale);
      const height = width;
      const centerX = (previous.bounds.left + previous.bounds.right) / 2;
      const centerY = (previous.bounds.top + previous.bounds.bottom) / 2;
      containers.push({
        ...previous,
        memberNodeIds: [...previous.memberNodeIds],
        bounds: {
          left: centerX - width / 2,
          right: centerX + width / 2,
          top: centerY - height / 2,
          bottom: centerY + height / 2
        },
        parentContainerIds: [...previous.parentContainerIds]
      });
      recalculatedEmbeddedIds.push(previous.id);
    }

    const stateContainers = containers.map((container) => ({
      ...container,
      parentContainerIds: deriveParentContainerIds(container, containers)
    }));
    return {
      state: copyGraphPhysicsContainerState({ containers: stateContainers }),
      diagnostics: {
        createdParentIds,
        recalculatedParentIds,
        recalculatedEmbeddedIds,
        removedParentIds,
        skippedEmptyParentIds,
        replacedKindIds,
        ignoredMemberships,
        missingEmbeddedOriginIds
      }
    };
  }
}

function calculateParentBounds(
  nodes: readonly GraphPhysicsNode[],
  baseRadius: number,
  minimumViewportSize: number
): { left: number; top: number; right: number; bottom: number } {
  const padding = Math.max(6, baseRadius * 0.45);
  const minLeft = Math.min(...nodes.map((node) => node.position.x - node.radius)) - padding;
  const minTop = Math.min(...nodes.map((node) => node.position.y - node.radius)) - padding;
  const maxRight = Math.max(...nodes.map((node) => node.position.x + node.radius)) + padding;
  const maxBottom = Math.max(...nodes.map((node) => node.position.y + node.radius)) + padding;
  const width = Math.max(minimumViewportSize, maxRight - minLeft);
  const height = Math.max(minimumViewportSize, maxBottom - minTop);
  const centerX = (minLeft + maxRight) / 2;
  const centerY = (minTop + maxBottom) / 2;
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    right: centerX + width / 2,
    bottom: centerY + height / 2
  };
}

function deriveParentContainerIds(
  container: GraphPhysicsContainer,
  all: readonly GraphPhysicsContainer[]
): ContainerId[] {
  return all
    .filter((candidate) => candidate.id !== container.id)
    .filter((candidate) => candidate.memberNodeIds.includes(container.originNodeId))
    .map((candidate) => candidate.id);
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
