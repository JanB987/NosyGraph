import type { EdgeId, NodeInstanceId } from "./graph-identifiers";
import { calculateGraphLinkSpring } from "./GraphLinkSpring";
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
    const add = (nodeId: NodeInstanceId, delta: Readonly<GraphVector>) => {
      if (!canReceive(nodeId)) {
        blockedVelocityApplicationCount += 1;
        return;
      }
      const current = velocityDeltas.get(nodeId);
      if (!current) return;
      current.x += delta.x;
      current.y += delta.y;
    };

    for (let firstIndex = 0; firstIndex < input.graph.nodes.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < input.graph.nodes.length;
        secondIndex += 1
      ) {
        const first = input.graph.nodes[firstIndex]!;
        const second = input.graph.nodes[secondIndex]!;
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

    return result(false);

    function result(simulationFrozen: boolean): GraphForceAccumulationResult {
      return {
        velocityDeltas,
        diagnostics: {
          simulationFrozen,
          skippedSeparatedNodePairCount,
          skippedSeparatedEdgeIds,
          skippedDirectionEdgeIds,
          blockedVelocityApplicationCount
        }
      };
    }
  }
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
