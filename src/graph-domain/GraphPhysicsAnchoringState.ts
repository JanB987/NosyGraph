import type { ContainerId, NodeInstanceId } from "./graph-identifiers";
import type { GraphAnchoringFixedCoordinates, GraphContainerAnchorState } from "./GraphContainerAnchoring";
import type { GraphPhysicsContainerState } from "./GraphPhysicsContainers";

export type GraphPhysicsAnchoringResetReason =
  | "new-container"
  | "kind-changed"
  | "origin-changed"
  | "missing-seed";

/** Detached seed/current state for the container anchoring stage of a simulation. */
export interface GraphPhysicsAnchoringState {
  anchors: ReadonlyMap<ContainerId, GraphContainerAnchorState>;
  fixedCoordinates: ReadonlyMap<NodeInstanceId, GraphAnchoringFixedCoordinates>;
  /** Captured from max(44, legacy base node radius * 2.2). */
  minimumViewportSize: number;
}

export interface GraphPhysicsAnchoringReconciliation {
  state: GraphPhysicsAnchoringState | undefined;
  diagnostics: {
    preservedContainerIds: readonly ContainerId[];
    resetContainers: readonly {
      containerId: ContainerId;
      reason: GraphPhysicsAnchoringResetReason;
    }[];
    addedContainerIds: readonly ContainerId[];
    removedContainerIds: readonly ContainerId[];
    preservedFixedCoordinateNodeIds: readonly NodeInstanceId[];
    addedFixedCoordinateNodeIds: readonly NodeInstanceId[];
    removedFixedCoordinateNodeIds: readonly NodeInstanceId[];
    missingSeedContainerIds: readonly ContainerId[];
  };
}

export function copyGraphPhysicsAnchoringState(state: GraphPhysicsAnchoringState): GraphPhysicsAnchoringState {
  const anchors = new Map<ContainerId, GraphContainerAnchorState>();
  for (const [id, anchor] of state.anchors) anchors.set(id, copyAnchor(anchor));
  const fixedCoordinates = new Map<NodeInstanceId, GraphAnchoringFixedCoordinates>();
  for (const [id, point] of state.fixedCoordinates) fixedCoordinates.set(id, { ...point });
  return {
    minimumViewportSize: state.minimumViewportSize,
    anchors,
    fixedCoordinates
  };
}

/** Reconciles evolving solver state with a new detached graph/container projection. */
export function reconcileGraphPhysicsAnchoringState(
  previousState: GraphPhysicsAnchoringState | undefined,
  previousContainers: GraphPhysicsContainerState | undefined,
  nextState: GraphPhysicsAnchoringState | undefined,
  nextContainers: GraphPhysicsContainerState,
  nextNodeIds: ReadonlySet<NodeInstanceId>
): GraphPhysicsAnchoringReconciliation {
  const previousById = new Map<ContainerId, GraphPhysicsContainerState["containers"][number]>();
  for (const container of previousContainers?.containers ?? []) previousById.set(container.id, container);
  const seedAnchors: ReadonlyMap<ContainerId, GraphContainerAnchorState> = nextState?.anchors ?? new Map();
  const previousAnchors: ReadonlyMap<ContainerId, GraphContainerAnchorState> = previousState?.anchors ?? new Map();
  const anchors = new Map<ContainerId, GraphContainerAnchorState>();
  const preservedContainerIds: ContainerId[] = [];
  const resetContainers: GraphPhysicsAnchoringReconciliation["diagnostics"]["resetContainers"][number][] = [];
  const addedContainerIds: ContainerId[] = [];
  const missingSeedContainerIds: ContainerId[] = [];

  for (const container of nextContainers.containers) {
    const previousContainer = previousById.get(container.id);
    const previousAnchor = previousAnchors.get(container.id);
    const seedAnchor = seedAnchors.get(container.id);
    if (
      previousContainer
      && previousAnchor
      && previousContainer.kind === container.kind
      && previousContainer.originNodeId === container.originNodeId
    ) {
      anchors.set(container.id, copyAnchor(previousAnchor));
      preservedContainerIds.push(container.id);
      continue;
    }
    if (seedAnchor) {
      anchors.set(container.id, copyAnchor(seedAnchor));
      if (!previousContainer || !previousAnchor) {
        addedContainerIds.push(container.id);
      } else {
        resetContainers.push({
          containerId: container.id,
          reason: previousContainer.kind !== container.kind ? "kind-changed" : "origin-changed"
        });
      }
    } else {
      missingSeedContainerIds.push(container.id);
      if (!previousContainer || !previousAnchor) {
        addedContainerIds.push(container.id);
      } else {
        resetContainers.push({ containerId: container.id, reason: "missing-seed" });
      }
    }
  }

  const nextIds = new Set(nextContainers.containers.map((container) => container.id));
  const removedContainerIds = Array.from(previousAnchors.keys())
    .filter((containerId) => !nextIds.has(containerId));
  const previousFixed: ReadonlyMap<NodeInstanceId, GraphAnchoringFixedCoordinates> = previousState?.fixedCoordinates ?? new Map();
  const seedFixed: ReadonlyMap<NodeInstanceId, GraphAnchoringFixedCoordinates> = nextState?.fixedCoordinates ?? new Map();
  const fixedCoordinates = new Map<NodeInstanceId, GraphAnchoringFixedCoordinates>();
  const preservedFixedCoordinateNodeIds: NodeInstanceId[] = [];
  const addedFixedCoordinateNodeIds: NodeInstanceId[] = [];
  for (const nodeId of nextNodeIds) {
    const previous = previousFixed.get(nodeId);
    const seed = seedFixed.get(nodeId);
    if (previous) {
      fixedCoordinates.set(nodeId, { ...previous });
      preservedFixedCoordinateNodeIds.push(nodeId);
    } else if (seed) {
      fixedCoordinates.set(nodeId, { ...seed });
      addedFixedCoordinateNodeIds.push(nodeId);
    }
  }
  const nextFixedIds = new Set(nextNodeIds);
  const removedFixedCoordinateNodeIds = Array.from(previousFixed.keys())
    .filter((nodeId) => !nextFixedIds.has(nodeId));

  const diagnostics = {
    preservedContainerIds, resetContainers, addedContainerIds, removedContainerIds,
    preservedFixedCoordinateNodeIds, addedFixedCoordinateNodeIds,
    removedFixedCoordinateNodeIds, missingSeedContainerIds
  };
  if (!previousState && !nextState && nextContainers.containers.length > 0) {
    return { state: undefined, diagnostics };
  }
  if (nextContainers.containers.length === 0) {
    return {
      state: {
        anchors: new Map(), fixedCoordinates,
        minimumViewportSize: nextState?.minimumViewportSize
          ?? previousState?.minimumViewportSize
          ?? 44
      },
      diagnostics
    };
  }
  return {
    state: {
      anchors,
      fixedCoordinates,
      minimumViewportSize: nextState?.minimumViewportSize
        ?? previousState?.minimumViewportSize
        ?? 44
    },
    diagnostics
  };
}

function copyAnchor(anchor: GraphContainerAnchorState): GraphContainerAnchorState {
  return {
    bounds: { ...anchor.bounds }, anchorDirection: { ...anchor.anchorDirection },
    lastOrigin: { ...anchor.lastOrigin }, anchorVelocity: { ...anchor.anchorVelocity },
    collisionPressure: { ...anchor.collisionPressure }
  };
}
