import type { GraphKinematicsFrame } from "../graph-domain/GraphKinematicsFrame";
import {
  GraphKinematicsFrameComparator,
  type GraphKinematicsComparisonOptions,
  type GraphKinematicsFrameComparisonResult
} from "./GraphKinematicsFrameComparator";

export interface GraphKinematicsTraceComparisonResult {
  matches: boolean;
  expectedStepCount: number;
  actualStepCount: number;
  comparedStepCount: number;
  differenceCount: number;
  maxPositionDistance: number;
  maxVelocityDistance: number;
  stepComparisons: readonly GraphKinematicsFrameComparisonResult[];
}

/** Compares one or more synchronized detached solver frames step by step. */
export class GraphKinematicsTraceComparator {
  constructor(
    private readonly frameComparator = new GraphKinematicsFrameComparator()
  ) {}

  compare(
    expected: readonly GraphKinematicsFrame[],
    actual: readonly GraphKinematicsFrame[],
    options: GraphKinematicsComparisonOptions = {}
  ): GraphKinematicsTraceComparisonResult {
    const comparedStepCount = Math.min(expected.length, actual.length);
    const stepComparisons: GraphKinematicsFrameComparisonResult[] = [];
    let differenceCount = Math.abs(expected.length - actual.length);
    let maxPositionDistance = 0;
    let maxVelocityDistance = 0;

    for (let index = 0; index < comparedStepCount; index += 1) {
      const comparison = this.frameComparator.compare(
        expected[index]!,
        actual[index]!,
        options
      );
      stepComparisons.push(comparison);
      differenceCount += comparison.differenceCount;
      maxPositionDistance = Math.max(maxPositionDistance, comparison.maxPositionDistance);
      maxVelocityDistance = Math.max(maxVelocityDistance, comparison.maxVelocityDistance);
    }

    return {
      matches: differenceCount === 0,
      expectedStepCount: expected.length,
      actualStepCount: actual.length,
      comparedStepCount,
      differenceCount,
      maxPositionDistance,
      maxVelocityDistance,
      stepComparisons
    };
  }
}
