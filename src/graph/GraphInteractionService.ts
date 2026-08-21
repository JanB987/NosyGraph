import type { GraphNode } from "../core/types.js";
import type { LinkQuickSwitcherSelection } from "../components/LinkQuickSwitcher";
import type { BadgeInteraction, GraphLinkDropIntent } from "./GraphEngine.js";
import type { LinkTypeDefinition } from "../link-types/types.js";
import type { GraphLinkMutationCommand } from "./GraphMutationService.js";
import {
  resolveGraphLinkDropCore,
  type ResolvedGraphLinkDropCore,
} from "../graph-core/graph-interactions.js";

export interface GraphBadgeInteractionIntent {
  kind: "open-link-quick-switcher" | "toggle-expansion";
  nodeId: string;
  linkTypeId: string;
}

export interface GraphLinkQuickSwitcherSession {
  parentLabel: string;
  parentPath: string;
  linkTypeLabel: string;
  linkTypeProperty: string;
}

export interface ResolveGraphLinkDropOptions {
  intent: GraphLinkDropIntent;
  existingLink: boolean;
  parentReference: string;
  childReference: string;
  linkTypeProperty: string;
}

export type ResolvedGraphLinkDrop = ResolvedGraphLinkDropCore;

export class GraphInteractionService {
  resolveBadgeInteraction(interaction: BadgeInteraction): GraphBadgeInteractionIntent {
    return {
      kind: interaction.altKey
        ? "open-link-quick-switcher"
        : "toggle-expansion",
      nodeId: interaction.nodeId,
      linkTypeId: interaction.linkTypeId,
    };
  }

  buildQuickSwitcherSession(
    parentNode: Pick<GraphNode, "name" | "relativePath" | "path">,
    linkType: Pick<LinkTypeDefinition, "label" | "property">,
    parentReference: string,
  ): GraphLinkQuickSwitcherSession {
    const parentLabel = parentNode.name.replace(/\.md$/i, "") || parentReference.replace(/\.md$/i, "");
    return {
      parentLabel,
      parentPath: parentReference,
      linkTypeLabel: linkType.label,
      linkTypeProperty: linkType.property,
    };
  }

  buildQuickSwitcherCommand(
    session: GraphLinkQuickSwitcherSession,
    _selection: LinkQuickSwitcherSelection,
    childReference: string,
  ): GraphLinkMutationCommand {
    return {
      action: "add_or_create_link",
      parentReference: session.parentPath,
      childReference,
      property: session.linkTypeProperty,
    };
  }

  resolveLinkDrop(options: ResolveGraphLinkDropOptions): ResolvedGraphLinkDrop | undefined {
    return resolveGraphLinkDropCore(options);
  }
}
