export type GraphCutDirection = "outgoing" | "incoming" | "both";

export interface GraphCutDefinition {
  readonly definitionId: string;
  readonly readProperties: readonly string[];
  readonly semantic: "link" | "parent" | "lens";
  readonly direction: GraphCutDirection;
}

export interface GraphCutExpansion {
  readonly expansionId: string;
  readonly sourceNodeId: string;
  readonly sourcePath: string;
  readonly definition?: GraphCutDefinition;
  readonly rawProperty?: string;
}

export type GraphCutOrigin =
  | { readonly kind: "graph-membership"; readonly ownerPath: string }
  | { readonly kind: "lens-membership"; readonly ownerPath: string; readonly definition: GraphCutDefinition; readonly provenance: readonly string[] }
  | { readonly kind: "relationship-expansion"; readonly owners: readonly GraphCutExpansion[]; readonly unavailable: readonly string[] }
  | { readonly kind: "unavailable"; readonly reason: string };

export interface GraphNodeCutSelection {
  readonly nodeId: string;
  readonly path: string;
  readonly contextId?: string;
  readonly origin: GraphCutOrigin;
}

export interface GraphCutReference {
  readonly holderPath: string;
  readonly property: string;
  readonly referencePath: string;
  readonly targets: readonly GraphNodeCutSelection[];
}

export interface GraphNodeCutSkip {
  readonly target: GraphNodeCutSelection;
  readonly reason: string;
  readonly failed?: boolean;
}

export interface GraphNodeCutPlan<Edit extends GraphCutReference = GraphCutReference> {
  edits: Edit[];
  skipped: GraphNodeCutSkip[];
}

export interface GraphNodeCutResult extends GraphNodeCutPlan {
  published: boolean;
  clipboardCount: number;
  removed: GraphCutReference[];
  fullyUnlinked: GraphNodeCutSelection[];
  partiallyUnlinked: GraphNodeCutSelection[];
  failed: GraphNodeCutSelection[];
  failedOwners: string[];
  clipboardError?: unknown;
}

export interface GraphNodeCutPorts<Edit extends GraphCutReference> {
  plan(selection: readonly GraphNodeCutSelection[]): Promise<GraphNodeCutPlan<Edit>>;
  publish(paths: string[]): Promise<unknown>;
  isCurrent(): boolean;
  remove(holder: string, edits: Edit[]): Promise<GraphNodeCutPlan>;
}

export async function cutGraphNodes<Edit extends GraphCutReference>(
  selection: readonly GraphNodeCutSelection[], ports: GraphNodeCutPorts<Edit>
): Promise<GraphNodeCutResult> {
  const plan = await ports.plan(selection);
  const result: GraphNodeCutResult = {
    ...plan, skipped: [...plan.skipped], published: false, clipboardCount: 0,
    removed: [], fullyUnlinked: [], partiallyUnlinked: [], failed: [], failedOwners: []
  };
  if (!plan.edits.length) {
    result.failed = selection.filter(target => result.skipped.some(skip => skip.target === target && skip.failed));
    return result;
  }
  const eligible = new Set(plan.edits.flatMap(edit => edit.targets));
  if (!ports.isCurrent()) {
    result.skipped.push(...[...eligible].map(target => ({ target, reason: "The source graph changed." })));
    return result;
  }
  const clipboardPaths = [...new Set(selection.filter(target => eligible.has(target)).map(target => target.path))];
  try {
    await ports.publish(clipboardPaths);
    result.published = true;
    result.clipboardCount = clipboardPaths.length;
  } catch (error) {
    result.clipboardError = error;
    return result;
  }
  if (!ports.isCurrent()) {
    result.skipped.push(...[...eligible].map(target => ({ target, reason: "The source graph changed during clipboard publication." })));
    return result;
  }
  const byHolder = new Map<string, Edit[]>();
  for (const edit of plan.edits) {
    const group = byHolder.get(edit.holderPath) ?? [];
    group.push(edit);
    byHolder.set(edit.holderPath, group);
  }
  for (const [holder, edits] of byHolder) {
    try {
      const committed = await ports.remove(holder, edits);
      result.removed.push(...committed.edits);
      result.skipped.push(...committed.skipped);
    } catch {
      result.failedOwners.push(holder);
      for (const target of new Set(edits.flatMap(edit => edit.targets))) {
        result.skipped.push({ target, reason: `Could not update ${holder}.`, failed: true });
      }
    }
  }
  const changed = new Set(result.removed.flatMap(edit => edit.targets));
  const incomplete = new Set(result.skipped.map(skip => skip.target));
  const failed = new Set(result.skipped.filter(skip => skip.failed).map(skip => skip.target));
  for (const target of selection) {
    if (changed.has(target)) {
      (incomplete.has(target) ? result.partiallyUnlinked : result.fullyUnlinked).push(target);
    } else if (failed.has(target)) {
      result.failed.push(target);
    }
  }
  return result;
}
