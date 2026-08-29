import type { NodeInstanceId } from "../graph-domain/graph-identifiers";
import type { GraphBadgeRequest } from "./GraphBadgeRequest";
import type { GraphBadgeCommandPort } from "./GraphController";

/** Minimum legacy node data needed to resolve a badge command. */
export interface LegacyBadgeNode {
  id: NodeInstanceId;
  sourcePath: string;
}

/** Minimum legacy link-type data needed to match a GraphBadge. */
export interface LegacyBadgeLinkType {
  property?: unknown;
}

export interface LegacyBadgeCommandTarget<
  TNode extends LegacyBadgeNode,
  TFile,
  TLinkType extends LegacyBadgeLinkType
> {
  node: TNode;
  file: TFile;
  linkType: TLinkType;
}

export interface LegacyBadgeCommandAdapterOptions<
  TNode extends LegacyBadgeNode,
  TFile,
  TLinkType extends LegacyBadgeLinkType
> {
  getNode(nodeId: NodeInstanceId): TNode | undefined;
  getFile(sourcePath: string): TFile | undefined;
  getLinkTypes(node: TNode): readonly TLinkType[];
  normalizeLinkType(value: string): string;
  toggle(target: LegacyBadgeCommandTarget<TNode, TFile, TLinkType>): void | Promise<void>;
  openInput(target: LegacyBadgeCommandTarget<TNode, TFile, TLinkType>): void | Promise<void>;
  expandChain(target: LegacyBadgeCommandTarget<TNode, TFile, TLinkType>): void | Promise<void>;
}

/**
 * Temporary bridge from host-neutral badge commands to legacy runtime objects.
 *
 * The adapter owns identity resolution while GraphEngine supplies access to its
 * current objects and its unchanged legacy operations.
 */
export class LegacyBadgeCommandAdapter<
  TNode extends LegacyBadgeNode,
  TFile,
  TLinkType extends LegacyBadgeLinkType
> implements GraphBadgeCommandPort {
  constructor(
    private readonly options: LegacyBadgeCommandAdapterOptions<TNode, TFile, TLinkType>
  ) {}

  executeBadge(request: GraphBadgeRequest): void | Promise<void> {
    const target = this.resolveTarget(request);
    if (!target) return;
    switch (request.action) {
      case "toggle-badge":
        return this.options.toggle(target);
      case "open-badge-input":
        return this.options.openInput(target);
      case "expand-badge-chain":
        return this.options.expandChain(target);
    }
  }

  private resolveTarget(
    request: GraphBadgeRequest
  ): LegacyBadgeCommandTarget<TNode, TFile, TLinkType> | undefined {
    const node = this.options.getNode(request.nodeId);
    if (!node) return undefined;
    const file = this.options.getFile(node.sourcePath);
    if (!file) return undefined;
    const linkType = this.options.getLinkTypes(node).find((candidate) =>
      this.options.normalizeLinkType(String(candidate.property ?? "")) === request.linkTypeId
    );
    return linkType ? { node, file, linkType } : undefined;
  }
}
