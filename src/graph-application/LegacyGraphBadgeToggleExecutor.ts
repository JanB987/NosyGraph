import type { ExpansionId, NodeInstanceId } from "../graph-domain/graph-identifiers";
import type {
  GraphBadgeToggleExecutionResult,
  GraphBadgeToggleExecutor
} from "./GraphBadgeToggleExecutor";
import type { GraphBadgeTogglePlan } from "./GraphBadgeTogglePlan";

export interface LegacyToggleNode {
  id: NodeInstanceId;
  sourcePath: string;
}

export interface LegacyToggleLinkType {
  property?: unknown;
}

export interface LegacyGraphBadgeToggleTarget<
  TNode extends LegacyToggleNode,
  TFile,
  TLinkType extends LegacyToggleLinkType
> {
  node: TNode;
  file: TFile;
  linkType: TLinkType;
}

export interface LegacyGraphBadgeToggleExecutorOptions<
  TNode extends LegacyToggleNode,
  TFile,
  TLinkType extends LegacyToggleLinkType
> {
  getNode(nodeId: NodeInstanceId): TNode | undefined;
  getFile(sourcePath: string): TFile | undefined;
  getLinkTypes(node: TNode): readonly TLinkType[];
  normalizeLinkType(value: string): string;
  isExpanded(expansionId: ExpansionId): boolean;
  toggle(
    target: LegacyGraphBadgeToggleTarget<TNode, TFile, TLinkType>
  ): void | Promise<void>;
}

/** State-aware bridge that applies plans through the current legacy toggle. */
export class LegacyGraphBadgeToggleExecutor<
  TNode extends LegacyToggleNode,
  TFile,
  TLinkType extends LegacyToggleLinkType
> implements GraphBadgeToggleExecutor {
  constructor(
    private readonly options: LegacyGraphBadgeToggleExecutorOptions<TNode, TFile, TLinkType>
  ) {}

  async execute(plan: GraphBadgeTogglePlan): Promise<GraphBadgeToggleExecutionResult> {
    if (plan.kind === "unsupported") {
      return { status: "rejected", badgeId: plan.badgeId, reason: "unsupported-plan" };
    }

    const expanded = this.options.isExpanded(plan.expansionId);
    if (plan.kind === "expand" && expanded) {
      return {
        status: "unchanged",
        badgeId: plan.badgeId,
        expansionId: plan.expansionId,
        reason: "already-expanded"
      };
    }
    if (plan.kind === "collapse" && !expanded) {
      return {
        status: "unchanged",
        badgeId: plan.badgeId,
        expansionId: plan.expansionId,
        reason: "already-collapsed"
      };
    }

    const target = this.resolveTarget(plan);
    if (!target) {
      return { status: "rejected", badgeId: plan.badgeId, reason: "target-not-found" };
    }
    await this.options.toggle(target);
    return {
      status: "applied",
      badgeId: plan.badgeId,
      expansionId: plan.expansionId,
      effect: plan.kind
    };
  }

  private resolveTarget(
    plan: Exclude<GraphBadgeTogglePlan, { kind: "unsupported" }>
  ): LegacyGraphBadgeToggleTarget<TNode, TFile, TLinkType> | undefined {
    const node = this.options.getNode(plan.sourceNodeId);
    if (!node || node.sourcePath !== plan.sourceNoteId) return undefined;
    const file = this.options.getFile(node.sourcePath);
    if (!file) return undefined;
    const linkType = this.options.getLinkTypes(node).find((candidate) =>
      this.options.normalizeLinkType(String(candidate.property ?? "")) === plan.linkTypeId
    );
    return linkType ? { node, file, linkType } : undefined;
  }
}
