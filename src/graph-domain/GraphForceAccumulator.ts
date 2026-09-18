import type { EdgeId, NodeInstanceId } from "./graph-identifiers";
import { calculateGraphCenterGravity } from "./GraphCenterGravity";
import {
  calculateGraphContainerRepulsion,
  shouldGraphContainersRepel
} from "./GraphContainerRepulsion";
import { calculateGraphLinkSpring } from "./GraphLinkSpring";
import {
  calculateGraphNodeContainerRepulsion,
  resolveGraphContainerPhysicsCircle
} from "./GraphNodeContainerRepulsion";
import type { GraphVector } from "./GraphNodeInstance";
import { calculateGraphPairwiseRepulsion } from "./GraphPairwiseRepulsion";
import type { GraphPhysicsRuntimeInput } from "./GraphPhysicsRuntimeInput";

export interface GraphForceEligibilityPolicy {
  canReceiveForce?(nodeId: NodeInstanceId): boolean;
  nodesMayInteract?(firstNodeId: NodeInstanceId, secondNodeId: NodeInstanceId): boolean;
}

export interface GraphForceAccumulationResult {
  velocityDeltas: ReadonlyMap<NodeInstanceId, Readonly<GraphVector>>;
  diagnostics: {
    simulationFrozen: boolean;
    skippedSeparatedNodePairCount: number;
    skippedSeparatedEdgeIds: readonly EdgeId[];
    skippedDirectionEdgeIds: readonly EdgeId[];
    blockedVelocityApplicationCount: number;
    worldGravityApplicationCount: number;
    embeddedGravityApplicationCount: number;
    activeNodeContainerForceCount: number;
    originReactionCount: number;
    skippedContainerCandidateCount: number;
    activeContainerPairForceCount: number;
    containerOriginReactionCount: number;
    skippedContainerPairCount: number;
  };
}

/** Accumulates node repulsion and link-spring deltas without mutating runtime input. */
export class GraphForceAccumulator {
  accumulate(
    input: GraphPhysicsRuntimeInput,
    policy: GraphForceEligibilityPolicy = {}
  ): GraphForceAccumulationResult {
    const velocityDeltas = new Map<NodeInstanceId, GraphVector>(
      input.graph.nodes.map((node) => [node.id, { x: 0, y: 0 }])
    );
    const skippedSeparatedEdgeIds: EdgeId[] = [];
    const skippedDirectionEdgeIds: EdgeId[] = [];
    let skippedSeparatedNodePairCount = 0;
    let blockedVelocityApplicationCount = 0;
    let worldGravityApplicationCount = 0;
    let embeddedGravityApplicationCount = 0;
    let activeNodeContainerForceCount = 0;
    let originReactionCount = 0;
    let skippedContainerCandidateCount = 0;
    let activeContainerPairForceCount = 0;
    let containerOriginReactionCount = 0;
    let skippedContainerPairCount = 0;

    if (input.constraints.simulationFrozen) {
      return result(true);
    }

    const nodeById = new Map(input.graph.nodes.map((node) => [node.id, node]));
    const memberships = containerMemberships(input);
    const blockedNodeIds = new Set(
      input.constraints.transientNodeConstraints
        .filter((constraint) => constraint.kind !== "position-lock")
        .map((constraint) => constraint.nodeId)
    );
    const canReceive = (nodeId: NodeInstanceId) =>
      !blockedNodeIds.has(nodeId) && (policy.canReceiveForce?.(nodeId) ?? true);
    const mayInteract = (firstNodeId: NodeInstanceId, secondNodeId: NodeInstanceId) =>
      policy.nodesMayInteract?.(firstNodeId, secondNodeId)
      ?? shareContainerBoundary(firstNodeId, secondNodeId, memberships);
    const addRaw = (nodeId: NodeInstanceId, delta: Readonly<GraphVector>): boolean => {
      const current = velocityDeltas.get(nodeId);
      if (!current) return false;
      current.x += delta.x;
      current.y += delta.y;
      return true;
    };
    const add = (nodeId: NodeInstanceId, delta: Readonly<GraphVector>): boolean => {
      if (!canReceive(nodeId)) {
        blockedVelocityApplicationCount += 1;
        return false;
      }
      return addRaw(nodeId, delta);
    };

    for (let firstIndex = 0; firstIndex < input.graph.nodes.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < input.graph.nodes.length;
        secondIndex += 1
      ) {
        const first = input.graph.nodes[firstIndex];
        const second = input.graph.nodes[secondIndex];
        if (!mayInteract(first.id, second.id)) {
          skippedSeparatedNodePairCount += 1;
          continue;
        }
        const force = calculateGraphPairwiseRepulsion(
          first,
          second,
          input.settings.repulsionStrength
        );
        add(first.id, force.firstVelocityDelta);
        add(second.id, force.secondVelocityDelta);
      }
    }

    for (const edge of input.graph.edges) {
      const first = nodeById.get(edge.fromNodeId);
      const second = nodeById.get(edge.toNodeId);
      if (!first || !second) continue;
      if (!mayInteract(first.id, second.id)) {
        skippedSeparatedEdgeIds.push(edge.id);
        continue;
      }
      const linkPolicy = input.settings.linkPolicies.get(edge.linkTypeId)
        ?? input.settings.defaultLinkPolicy;
      if (linkPolicy.mode === "direction") {
        skippedDirectionEdgeIds.push(edge.id);
        continue;
      }
      const force = calculateGraphLinkSpring(first, second, linkPolicy);
      add(first.id, force.firstVelocityDelta);
      add(second.id, force.secondVelocityDelta);
    }

    const containerEligibility = indexContainerForceEligibility(input);
    for (const container of input.containers.containers) {
      const origin = nodeById.get(container.originNodeId);
      const circle = resolveGraphContainerPhysicsCircle(container, origin);
      for (const node of input.graph.nodes) {
        if (
          node.id === container.originNodeId
          || container.memberNodeIds.includes(node.id)
          || (origin && !mayInteract(origin.id, node.id))
          || containerEligibility.nodeBlocked.has(node.id)
          || policy.canReceiveForce?.(node.id) === false
        ) {
          skippedContainerCandidateCount += 1;
          continue;
        }
        const force = calculateGraphNodeContainerRepulsion(
          node,
          container.id,
          circle,
          input.settings.repulsionStrength,
          input.settings.nodeContainerInfluenceDistance
        );
        if (!force.active) continue;
        addRaw(node.id, force.nodeVelocityDelta);
        activeNodeContainerForceCount += 1;

        if (
          !origin
          || origin.id === node.id
          || containerEligibility.originBlocked.has(origin.id)
          || policy.canReceiveForce?.(origin.id) === false
        ) continue;
        addRaw(origin.id, force.originVelocityDelta);
        originReactionCount += 1;
      }
    }

    const lockedOriginIds = new Set<NodeInstanceId>([
      ...input.constraints.persistentPins.map((pin) => pin.nodeId),
      ...input.constraints.transientNodeConstraints
        .filter((constraint) => constraint.kind === "position-lock")
        .map((constraint) => constraint.nodeId)
    ]);
    const containers = input.containers.containers;
    for (let firstIndex = 0; firstIndex < containers.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < containers.length; secondIndex += 1) {
        const first = containers[firstIndex];
        const second = containers[secondIndex];
        if (!shouldGraphContainersRepel(first, second)) {
          skippedContainerPairCount += 1;
          continue;
        }
        const firstOrigin = nodeById.get(first.originNodeId);
        const secondOrigin = nodeById.get(second.originNodeId);
        const force = calculateGraphContainerRepulsion(
          {
            container: first,
            circle: resolveGraphContainerPhysicsCircle(first, firstOrigin)
          },
          {
            container: second,
            circle: resolveGraphContainerPhysicsCircle(second, secondOrigin)
          },
          input.settings.repulsionStrength,
          input.settings.containerContainerInfluenceDistance
        );
        if (!force.active) continue;
        activeContainerPairForceCount += 1;
        if (
          firstOrigin
          && !lockedOriginIds.has(firstOrigin.id)
          && policy.canReceiveForce?.(firstOrigin.id) !== false
        ) {
          addRaw(firstOrigin.id, force.firstOriginVelocityDelta);
          containerOriginReactionCount += 1;
        }
        if (
          secondOrigin
          && !lockedOriginIds.has(secondOrigin.id)
          && policy.canReceiveForce?.(secondOrigin.id) !== false
        ) {
          addRaw(secondOrigin.id, force.secondOriginVelocityDelta);
          containerOriginReactionCount += 1;
        }
      }
    }

    const gravityBlockedNodeIds = new Set<NodeInstanceId>([
      ...input.constraints.persistentPins.map((pin) => pin.nodeId),
      ...input.constraints.transientNodeConstraints.map((constraint) => constraint.nodeId)
    ]);
    for (const node of input.graph.nodes) {
      const gravity = calculateGraphCenterGravity(
        node,
        input.containers,
        input.settings
      );
      if (gravity.kind === "none") continue;
      if (gravityBlockedNodeIds.has(node.id)) {
        blockedVelocityApplicationCount += 1;
        continue;
      }
      if (!add(node.id, gravity.velocityDelta)) continue;
      if (gravity.kind === "world") worldGravityApplicationCount += 1;
      else embeddedGravityApplicationCount += 1;
    }

    return result(false);

    function result(simulationFrozen: boolean): GraphForceAccumulationResult {
      return {
        velocityDeltas,
        diagnostics: {
          simulationFrozen,
          skippedSeparatedNodePairCount,
          skippedSeparatedEdgeIds,
          skippedDirectionEdgeIds,
          blockedVelocityApplicationCount,
          worldGravityApplicationCount,
          embeddedGravityApplicationCount,
          activeNodeContainerForceCount,
          originReactionCount,
          skippedContainerCandidateCount,
          activeContainerPairForceCount,
          containerOriginReactionCount,
          skippedContainerPairCount
        }
      };
    }
  }
}

function indexContainerForceEligibility(input: GraphPhysicsRuntimeInput): {
  nodeBlocked: ReadonlySet<NodeInstanceId>;
  originBlocked: ReadonlySet<NodeInstanceId>;
} {
  const locked = new Set<NodeInstanceId>([
    ...input.constraints.persistentPins.map((pin) => pin.nodeId),
    ...input.constraints.transientNodeConstraints
      .filter((constraint) => constraint.kind === "position-lock")
      .map((constraint) => constraint.nodeId)
  ]);
  const nodeBlocked = new Set(locked);
  const originBlocked = new Set(locked);
  for (const constraint of input.constraints.transientNodeConstraints) {
    if (constraint.kind === "position-lock") continue;
    if (constraint.kind === "velocity-freeze" && constraint.reason === "lens-owner") {
      originBlocked.add(constraint.nodeId);
      continue;
    }
    nodeBlocked.add(constraint.nodeId);
    originBlocked.add(constraint.nodeId);
  }
  return { nodeBlocked, originBlocked };
}

function containerMemberships(
  input: GraphPhysicsRuntimeInput
): ReadonlyMap<NodeInstanceId, ReadonlySet<string>> {
  const memberships = new Map<NodeInstanceId, Set<string>>();
  for (const container of input.containers.containers) {
    for (const nodeId of container.memberNodeIds) {
      const nodeMemberships = memberships.get(nodeId) ?? new Set<string>();
      nodeMemberships.add(container.id);
      memberships.set(nodeId, nodeMemberships);
    }
  }
  return memberships;
}

function shareContainerBoundary(
  firstNodeId: NodeInstanceId,
  secondNodeId: NodeInstanceId,
  memberships: ReadonlyMap<NodeInstanceId, ReadonlySet<string>>
): boolean {
  const first = memberships.get(firstNodeId);
  const second = memberships.get(secondNodeId);
  if (!first?.size && !second?.size) return true;
  if (!first?.size || !second?.size) return false;
  for (const containerId of first) {
    if (second.has(containerId)) return true;
  }
  return false;
}
