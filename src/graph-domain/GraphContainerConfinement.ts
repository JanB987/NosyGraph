import type { NodeInstanceId } from "./graph-identifiers";
import type { GraphKinematicsFrameInput } from "./GraphKinematicsFrame";
import type { GraphPhysicsContainerState } from "./GraphPhysicsContainers";
import type { GraphPhysicsNode } from "./GraphPhysicsInput";

export interface GraphContainerConfinementResult {
  frame: GraphKinematicsFrameInput;
  diagnostics: {
    correctedXCount: number;
    correctedYCount: number;
    missingSampleNodeIds: readonly NodeInstanceId[];
    embeddedContainerCount: number;
  };
}

/** Applies the legacy parent-container clamp to a detached motion frame. */
export class GraphContainerConfinement {
  constrain(
    frame: GraphKinematicsFrameInput,
    nodes: readonly GraphPhysicsNode[],
    containers: GraphPhysicsContainerState
  ): GraphContainerConfinementResult {
    const positions = new Map(
      Array.from(frame.positions, ([id, point]) => [id, { ...point }])
    );
    const velocities = new Map(
      Array.from(frame.velocities, ([id, vector]) => [id, { ...vector }])
    );
    const missingSampleNodeIds: NodeInstanceId[] = [];
    let correctedXCount = 0;
    let correctedYCount = 0;

    for (const node of nodes) {
      const position = positions.get(node.id);
      const velocity = velocities.get(node.id);
      if (!position || !velocity) {
        missingSampleNodeIds.push(node.id);
        continue;
      }
      for (const container of containers.containers) {
        if (container.kind !== "parent" || !container.memberNodeIds.includes(node.id)) {
          continue;
        }
        const nextX = clamp(
          position.x,
          container.bounds.left + node.radius + 10,
          container.bounds.right - node.radius - 10
        );
        const nextY = clamp(
          position.y,
          container.bounds.top + node.radius + 18,
          container.bounds.bottom - node.radius - 10
        );
        if (nextX !== position.x) {
          position.x = nextX;
          velocity.x = 0;
          correctedXCount += 1;
        }
        if (nextY !== position.y) {
          position.y = nextY;
          velocity.y = 0;
          correctedYCount += 1;
        }
      }
    }

    return {
      frame: {
        structuralRevision: frame.structuralRevision,
        positions,
        velocities
      },
      diagnostics: {
        correctedXCount,
        correctedYCount,
        missingSampleNodeIds,
        embeddedContainerCount: containers.containers.filter(
          (container) => container.kind === "embedded"
        ).length
      }
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
