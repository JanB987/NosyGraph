import type { GraphSnapshot, GraphSnapshotSource } from "../graph-domain/GraphSnapshot";
import type {
  GraphBadgeToggleExecutionResult,
  GraphBadgeToggleExecutor
} from "./GraphBadgeToggleExecutor";
import type { GraphBadgeTogglePlan } from "./GraphBadgeTogglePlan";
import {
  GraphBadgeToggleTransitionService,
  type GraphBadgeToggleTransitionResult
} from "./GraphBadgeToggleTransitionService";
import { GraphExpansionTransitionService } from "./GraphExpansionTransitionService";
import {
  DefaultGraphExpansionTargetMaterializer,
  type GraphExpansionNoteReader,
  type GraphExpansionTargetMaterializerOptions
} from "./GraphExpansionTargetMaterializer";
import { GraphQueries } from "./GraphQueries";

export type GraphBadgeToggleShadowCalculation =
  | { status: "calculated"; result: GraphBadgeToggleTransitionResult }
  | { status: "failed"; error: unknown };

export interface GraphBadgeToggleShadowObservation {
  plan: GraphBadgeTogglePlan;
  beforeSnapshot: GraphSnapshot;
  afterSnapshot: GraphSnapshot;
  calculation: GraphBadgeToggleShadowCalculation;
  execution: GraphBadgeToggleExecutionResult;
}

export interface GraphBadgeToggleShadowServiceOptions {
  getMaterializerOptions?(): GraphExpansionTargetMaterializerOptions;
  observe?(observation: GraphBadgeToggleShadowObservation): void;
}

/** Calculates the new transition against a captured snapshot while delegating live mutation. */
export class GraphBadgeToggleShadowService implements GraphBadgeToggleExecutor {
  constructor(
    private readonly snapshotSource: GraphSnapshotSource,
    private readonly noteReader: GraphExpansionNoteReader,
    private readonly liveExecutor: GraphBadgeToggleExecutor,
    private readonly options: GraphBadgeToggleShadowServiceOptions = {}
  ) {}

  async execute(plan: GraphBadgeTogglePlan): Promise<GraphBadgeToggleExecutionResult> {
    const beforeSnapshot = this.snapshotSource.getSnapshot();
    const shadowPromise = this.calculate(plan, new GraphQueries({
      getSnapshot: () => beforeSnapshot
    }));
    const execution = await this.liveExecutor.execute(plan);
    const afterSnapshot = this.snapshotSource.getSnapshot();
    const calculation = await shadowPromise;
    try {
      this.options.observe?.({
        plan,
        beforeSnapshot,
        afterSnapshot,
        calculation,
        execution
      });
    } catch {
      // Diagnostics must never change live badge behavior.
    }
    return execution;
  }

  private async calculate(
    plan: GraphBadgeTogglePlan,
    queries: GraphQueries
  ): Promise<GraphBadgeToggleShadowCalculation> {
    try {
      const materializer = new DefaultGraphExpansionTargetMaterializer(
        queries,
        this.noteReader,
        undefined,
        this.options.getMaterializerOptions?.()
      );
      const expansionTransitions = new GraphExpansionTransitionService(
        queries,
        materializer
      );
      const transitions = new GraphBadgeToggleTransitionService(
        queries,
        expansionTransitions
      );
      return { status: "calculated", result: await transitions.create(plan) };
    } catch (error) {
      return { status: "failed", error };
    }
  }
}
