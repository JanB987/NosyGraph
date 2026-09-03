import type { NodeInstanceId } from "../graph-domain/graph-identifiers";
import type { GraphKinematicsFrame } from "../graph-domain/GraphKinematicsFrame";
import type { GraphPoint } from "../graph-domain/GraphNodeInstance";

export interface GraphKinematicsComparisonOptions {
  positionTolerance?: number;
  velocityTolerance?: number;
  maxReportedDifferences?: number;
}

export type GraphKinematicsNodeDifference =
  | { nodeId: NodeInstanceId; kind: "missing-expected" | "missing-actual" }
  | {
      nodeId: NodeInstanceId;
      kind: "position" | "velocity";
      distance: number;
      expected: Readonly<GraphPoint>;
      actual: Readonly<GraphPoint>;
    };

export interface GraphKinematicsFrameComparisonResult {
  matches: boolean;
  sequenceMatches: boolean;
  structuralRevisionMatches: boolean;
  comparedNodeCount: number;
  differenceCount: number;
  reportedDifferences: readonly GraphKinematicsNodeDifference[];
  truncated: boolean;
  positionTolerance: number;
  velocityTolerance: number;
}

/** Compares detached frames by stable node identity with bounded detail output. */
export class GraphKinematicsFrameComparator {
  compare(
    expected: GraphKinematicsFrame,
    actual: GraphKinematicsFrame,
    options: GraphKinematicsComparisonOptions = {}
  ): GraphKinematicsFrameComparisonResult {
    const positionTolerance = normalizeTolerance(options.positionTolerance, 0.001);
    const velocityTolerance = normalizeTolerance(options.velocityTolerance, 0.001);
    const maxReportedDifferences = normalizeLimit(options.maxReportedDifferences, 20);
    const sequenceMatches = expected.sequence === actual.sequence;
    const structuralRevisionMatches =
      expected.structuralRevision === actual.structuralRevision;
    const nodeIds = Array.from(new Set([
      ...expected.positions.keys(),
      ...expected.velocities.keys(),
      ...actual.positions.keys(),
      ...actual.velocities.keys()
    ])).sort((left, right) => left.localeCompare(right));
    const reportedDifferences: GraphKinematicsNodeDifference[] = [];
    let differenceCount = Number(!sequenceMatches) + Number(!structuralRevisionMatches);
    let comparedNodeCount = 0;

    const record = (difference: GraphKinematicsNodeDifference) => {
      differenceCount += 1;
      if (reportedDifferences.length < maxReportedDifferences) {
        reportedDifferences.push(difference);
      }
    };

    for (const nodeId of nodeIds) {
      const expectedPosition = expected.positions.get(nodeId);
      const expectedVelocity = expected.velocities.get(nodeId);
      const actualPosition = actual.positions.get(nodeId);
      const actualVelocity = actual.velocities.get(nodeId);
      const expectedComplete = Boolean(expectedPosition && expectedVelocity);
      const actualComplete = Boolean(actualPosition && actualVelocity);
      if (!expectedComplete) {
        record({ nodeId, kind: "missing-expected" });
        continue;
      }
      if (!actualComplete) {
        record({ nodeId, kind: "missing-actual" });
        continue;
      }

      comparedNodeCount += 1;
      const positionDistance = distance(expectedPosition!, actualPosition!);
      if (!Number.isFinite(positionDistance) || positionDistance > positionTolerance) {
        record({
          nodeId,
          kind: "position",
          distance: positionDistance,
          expected: { ...expectedPosition! },
          actual: { ...actualPosition! }
        });
      }
      const velocityDistance = distance(expectedVelocity!, actualVelocity!);
      if (!Number.isFinite(velocityDistance) || velocityDistance > velocityTolerance) {
        record({
          nodeId,
          kind: "velocity",
          distance: velocityDistance,
          expected: { ...expectedVelocity! },
          actual: { ...actualVelocity! }
        });
      }
    }

    return {
      matches: differenceCount === 0,
      sequenceMatches,
      structuralRevisionMatches,
      comparedNodeCount,
      differenceCount,
      reportedDifferences,
      truncated: reportedDifferences.length < differenceCount,
      positionTolerance,
      velocityTolerance
    };
  }
}

function distance(expected: Readonly<GraphPoint>, actual: Readonly<GraphPoint>): number {
  return Math.hypot(expected.x - actual.x, expected.y - actual.y);
}

function normalizeTolerance(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : fallback;
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  return Number.isFinite(value)
    ? Math.max(0, Math.floor(Number(value)))
    : fallback;
}
