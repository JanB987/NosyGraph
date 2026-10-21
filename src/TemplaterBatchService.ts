export interface TemplaterBatchTarget {
  nodeId: string;
  path: string;
}

export interface TemplaterBatchResult {
  succeeded: TemplaterBatchTarget[];
  skipped: TemplaterBatchTarget[];
  failed?: { target: TemplaterBatchTarget; error: unknown };
}

export type TemplaterTargetExecutor = (target: TemplaterBatchTarget) => Promise<void>;

/** Executes a captured selection in order and stops at the first template error. */
export class TemplaterBatchService {
  async execute(
    targets: readonly TemplaterBatchTarget[],
    executeTarget: TemplaterTargetExecutor,
    onSuccess?: (target: TemplaterBatchTarget) => Promise<void> | void
  ): Promise<TemplaterBatchResult> {
    const succeeded: TemplaterBatchTarget[] = [];
    for (const target of targets) {
      try {
        await executeTarget(target);
        succeeded.push(target);
        await onSuccess?.(target);
      } catch (error) {
        return { succeeded, skipped: [], failed: { target, error } };
      }
    }
    return { succeeded, skipped: [] };
  }
}
