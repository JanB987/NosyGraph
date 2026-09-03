import type { ContainerId, NodeInstanceId } from "../graph-domain/graph-identifiers";
import {
  copyGraphPhysicsContainerState,
  type GraphPhysicsContainer,
  type GraphPhysicsContainerState
} from "../graph-domain/GraphPhysicsContainers";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";

export type GraphPhysicsContainerRejectionReason =
  | "invalid-id"
  | "duplicate-id"
  | "missing-origin"
  | "invalid-bounds"
  | "invalid-gravity";

export interface GraphPhysicsContainerProjectionDiagnostics {
  rejectedContainers: readonly {
    containerId: ContainerId;
    reason: GraphPhysicsContainerRejectionReason;
  }[];
  ignoredMemberReferences: readonly {
    containerId: ContainerId;
    nodeId: NodeInstanceId;
  }[];
  ignoredParentReferences: readonly {
    containerId: ContainerId;
    parentContainerId: ContainerId;
    reason: "missing-container" | "self-reference" | "cycle";
  }[];
}

export interface GraphPhysicsContainerProjectionResult {
  state: GraphPhysicsContainerState;
  diagnostics: GraphPhysicsContainerProjectionDiagnostics;
}

/** Validates and detaches container physics data against one graph snapshot. */
export class GraphPhysicsContainerProjector {
  project(
    snapshot: GraphSnapshot,
    candidateState: GraphPhysicsContainerState
  ): GraphPhysicsContainerProjectionResult {
    const nodeIds = new Set(snapshot.nodes.map((node) => node.id));
    const acceptedIds = new Set<ContainerId>();
    const accepted: GraphPhysicsContainer[] = [];
    const rejectedContainers: GraphPhysicsContainerProjectionDiagnostics["rejectedContainers"][number][] = [];

    for (const container of candidateState.containers) {
      const reason = this.rejectionReason(container, acceptedIds, nodeIds);
      if (reason) {
        rejectedContainers.push({ containerId: container.id, reason });
        continue;
      }
      acceptedIds.add(container.id);
      accepted.push(container);
    }

    const ignoredMemberReferences: GraphPhysicsContainerProjectionDiagnostics["ignoredMemberReferences"][number][] = [];
    const ignoredParentReferences: GraphPhysicsContainerProjectionDiagnostics["ignoredParentReferences"][number][] = [];
    const parentIdsByContainer = new Map<ContainerId, ContainerId[]>();
    const containers = accepted.map((container) => {
      const memberNodeIds: NodeInstanceId[] = [];
      const seenMembers = new Set<NodeInstanceId>();
      for (const nodeId of container.memberNodeIds) {
        if (!nodeIds.has(nodeId)) {
          ignoredMemberReferences.push({ containerId: container.id, nodeId });
        } else if (!seenMembers.has(nodeId)) {
          seenMembers.add(nodeId);
          memberNodeIds.push(nodeId);
        }
      }

      const parentContainerIds: ContainerId[] = [];
      for (const parentId of container.parentContainerIds) {
        let reason: "missing-container" | "self-reference" | "cycle" | undefined;
        if (!acceptedIds.has(parentId)) reason = "missing-container";
        else if (parentId === container.id) reason = "self-reference";
        else if (hasParentPath(parentId, container.id, parentIdsByContainer)) reason = "cycle";
        if (reason) {
          ignoredParentReferences.push({
            containerId: container.id,
            parentContainerId: parentId,
            reason
          });
        } else if (!parentContainerIds.includes(parentId)) {
          parentContainerIds.push(parentId);
        }
      }
      parentIdsByContainer.set(container.id, parentContainerIds);

      const normalizedContainer = {
        ...container,
        memberNodeIds,
        bounds: { ...container.bounds },
        parentContainerIds
      };
      return normalizedContainer.kind === "embedded"
        ? {
            ...normalizedContainer,
            gravityStrength: Math.min(1, Math.max(0, normalizedContainer.gravityStrength))
          }
        : normalizedContainer;
    });

    return {
      state: copyGraphPhysicsContainerState({ containers }),
      diagnostics: {
        rejectedContainers,
        ignoredMemberReferences,
        ignoredParentReferences
      }
    };
  }

  private rejectionReason(
    container: GraphPhysicsContainer,
    acceptedIds: ReadonlySet<ContainerId>,
    nodeIds: ReadonlySet<NodeInstanceId>
  ): GraphPhysicsContainerRejectionReason | undefined {
    if (!String(container.id ?? "").trim()) return "invalid-id";
    if (acceptedIds.has(container.id)) return "duplicate-id";
    if (!nodeIds.has(container.originNodeId)) return "missing-origin";
    const { left, top, right, bottom } = container.bounds;
    if (![left, top, right, bottom].every(Number.isFinite)
      || left > right || top > bottom) return "invalid-bounds";
    if (container.kind === "embedded" && !Number.isFinite(container.gravityStrength)) {
      return "invalid-gravity";
    }
    return undefined;
  }
}

function hasParentPath(
  start: ContainerId,
  target: ContainerId,
  parentsByContainer: ReadonlyMap<ContainerId, readonly ContainerId[]>
): boolean {
  const pending = [start];
  const visited = new Set<ContainerId>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(parentsByContainer.get(current) ?? []));
  }
  return false;
}
