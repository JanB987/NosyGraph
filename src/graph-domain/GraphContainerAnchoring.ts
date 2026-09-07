import type { ContainerId, NodeInstanceId } from "./graph-identifiers";
import type { GraphKinematicsFrameInput } from "./GraphKinematicsFrame";
import type { GraphRectangle } from "./GraphLens";
import type { GraphPoint, GraphVector } from "./GraphNodeInstance";
import { copyGraphPhysicsContainerState, type GraphPhysicsContainerState } from "./GraphPhysicsContainers";
import type { GraphPhysicsNode } from "./GraphPhysicsInput";

/** Evolving solver state, separate from container membership and configuration. */
export interface GraphContainerAnchorState {
  bounds: Readonly<GraphRectangle>;
  anchorDirection: Readonly<GraphVector>;
  lastOrigin: Readonly<{ x?: number; y?: number }>;
  anchorVelocity: Readonly<GraphVector>;
  collisionPressure: Readonly<GraphVector>;
}

/** Effective runtime coordinates; these are not persisted pin intent. */
export interface GraphAnchoringFixedCoordinates {
  x?: number | null;
  y?: number | null;
}

export interface GraphContainerAnchoringInput {
  frame: GraphKinematicsFrameInput;
  nodes: readonly GraphPhysicsNode[];
  containers: GraphPhysicsContainerState;
  anchors: ReadonlyMap<ContainerId, GraphContainerAnchorState>;
  fixedCoordinates: ReadonlyMap<NodeInstanceId, GraphAnchoringFixedCoordinates>;
  restVelocityThreshold: number;
  /** Legacy adapter supplies max(44, base node radius * 2.2). */
  minimumViewportSize: number;
}

export interface GraphContainerAnchoringResult {
  frame: GraphKinematicsFrameInput;
  /** Detached compatibility projection using the returned runtime bounds. */
  containers: GraphPhysicsContainerState;
  anchors: ReadonlyMap<ContainerId, GraphContainerAnchorState>;
  fixedCoordinates: ReadonlyMap<NodeInstanceId, GraphAnchoringFixedCoordinates>;
  maxVelocity: 0;
  diagnostics: {
    anchoredParentCount: number;
    anchoredEmbeddedCount: number;
    memberTranslationCount: number;
    missingOriginContainerIds: readonly ContainerId[];
    missingAnchorContainerIds: readonly ContainerId[];
    missingMemberReferences: readonly { containerId: ContainerId; nodeId: NodeInstanceId }[];
  };
}

/** Pure extraction of the legacy post-integration anchorContainersToParents tick. */
export class GraphContainerAnchoring {
  anchor(input: GraphContainerAnchoringInput): GraphContainerAnchoringResult {
    const positions = new Map<NodeInstanceId, GraphPoint>(
      Array.from(input.frame.positions, ([id, point]) => [id, { ...point }])
    );
    const velocities = new Map(
      Array.from(input.frame.velocities, ([id, vector]) => [id, { ...vector }])
    );
    const fixedCoordinates = new Map(
      Array.from(input.fixedCoordinates, ([id, fixed]) => [id, { ...fixed }])
    );
    const anchors = new Map<ContainerId, GraphContainerAnchorState>(
      Array.from(input.anchors, ([id, state]) => [id, {
        bounds: { ...state.bounds }, anchorDirection: { ...state.anchorDirection },
        lastOrigin: { ...state.lastOrigin }, anchorVelocity: { ...state.anchorVelocity },
        collisionPressure: { ...state.collisionPressure }
      }])
    );
    const containers = copyGraphPhysicsContainerState(input.containers);
    const nodes = new Map(input.nodes.map((node) => [node.id, node]));
    const ordered = [
      ...containers.containers.filter((container) => container.kind === "parent"),
      ...containers.containers.filter((container) => container.kind === "embedded")
    ];
    const diagnostics: GraphContainerAnchoringResult["diagnostics"] = {
      anchoredParentCount: 0, anchoredEmbeddedCount: 0, memberTranslationCount: 0,
      missingOriginContainerIds: [], missingAnchorContainerIds: [], missingMemberReferences: []
    };
    const missingOrigins: ContainerId[] = [];
    const missingAnchors: ContainerId[] = [];
    const missingMembers: { containerId: ContainerId; nodeId: NodeInstanceId }[] = [];
    const velocityDeadZone = Math.max(input.restVelocityThreshold, 0.02);
    const translationDeadZone = Math.max(input.restVelocityThreshold, 0.01);

    // Reset every active container before processing any origins, including missing origins.
    for (const container of ordered) {
      const state = anchors.get(container.id);
      if (!state) { missingAnchors.push(container.id); continue; }
      state.anchorVelocity = { x: 0, y: 0 };
      state.collisionPressure = { x: 0, y: 0 };
      container.bounds = { ...state.bounds };
    }

    for (const container of ordered) {
      const state = anchors.get(container.id);
      if (!state) continue;
      const origin = positions.get(container.originNodeId);
      const originNode = nodes.get(container.originNodeId);
      if (!origin || !originNode) { missingOrigins.push(container.id); continue; }
      const originMovement = Math.hypot(
        origin.x - (Number.isFinite(state.lastOrigin.x) ? state.lastOrigin.x! : origin.x),
        origin.y - (Number.isFinite(state.lastOrigin.y) ? state.lastOrigin.y! : origin.y)
      );
      const width = Math.max(input.minimumViewportSize, state.bounds.right - state.bounds.left);
      const height = Math.max(input.minimumViewportSize, state.bounds.bottom - state.bounds.top);
      const oldCenterX = (state.bounds.left + state.bounds.right) / 2;
      const oldCenterY = (state.bounds.top + state.bounds.bottom) / 2;
      let centerX = origin.x;
      let centerY = origin.y;
      if (container.kind === "parent") {
        const length = Math.hypot(state.anchorDirection.x, state.anchorDirection.y) || 1;
        const ux = state.anchorDirection.x / length;
        const uy = state.anchorDirection.y / length;
        state.anchorDirection = { x: ux, y: uy };
        const supportX = Math.abs(ux) > 0.0001 ? width / 2 / Math.abs(ux) : Infinity;
        const supportY = Math.abs(uy) > 0.0001 ? height / 2 / Math.abs(uy) : Infinity;
        const radius = originNode.radius;
        const distance = Math.min(supportX, supportY) + radius + Math.max(4, radius * 0.2);
        centerX += ux * distance;
        centerY += uy * distance;
        diagnostics.anchoredParentCount += 1;
      } else {
        diagnostics.anchoredEmbeddedCount += 1;
      }
      state.bounds = {
        left: centerX - width / 2, right: centerX + width / 2,
        top: centerY - height / 2, bottom: centerY + height / 2
      };
      container.bounds = { ...state.bounds };
      const dx = centerX - oldCenterX;
      const dy = centerY - oldCenterY;
      if (container.kind === "parent" && originMovement >= velocityDeadZone
        && !(Math.hypot(dx, dy) < translationDeadZone)) {
        for (const nodeId of container.memberNodeIds) {
          const position = positions.get(nodeId);
          if (!position || !nodes.has(nodeId)) {
            missingMembers.push({ containerId: container.id, nodeId });
            continue;
          }
          position.x += dx;
          position.y += dy;
          const fixed = fixedCoordinates.get(nodeId);
          if (fixed) {
            if (Number.isFinite(fixed.x)) fixed.x = Number(fixed.x) + dx;
            if (Number.isFinite(fixed.y)) fixed.y = Number(fixed.y) + dy;
          }
          diagnostics.memberTranslationCount += 1;
        }
      }
      // Read after member translation, matching legacy behavior even for self-membership.
      state.lastOrigin = { x: origin.x, y: origin.y };
    }
    return {
      frame: { structuralRevision: input.frame.structuralRevision, positions, velocities },
      containers, anchors, fixedCoordinates, maxVelocity: 0,
      diagnostics: { ...diagnostics, missingOriginContainerIds: missingOrigins,
        missingAnchorContainerIds: missingAnchors, missingMemberReferences: missingMembers }
    };
  }
}
