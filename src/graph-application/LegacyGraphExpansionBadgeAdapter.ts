import {
  createGraphBadgeId,
  type GraphBadge,
  type GraphBadgeSemantic
} from "../graph-domain/GraphBadge";
import type { GraphContextId, LinkTypeId, NoteId } from "../graph-domain/graph-identifiers";
import type {
  GraphExpansionBadgeReadInput,
  GraphExpansionBadgeReader
} from "./GraphExpansionTargetMaterializer";

export interface GraphExpansionBadgeDefinition {
  linkTypeId: LinkTypeId;
  label: string;
  color: string;
  semantic: GraphBadgeSemantic;
  duplicateNodes: boolean;
}

export interface LegacyGraphExpansionBadgeAdapterOptions {
  getDefinitions(contextId: GraphContextId): readonly GraphExpansionBadgeDefinition[];
  hasRelationships(noteId: NoteId, linkTypeId: LinkTypeId): boolean;
}

/** Materializes configured badges without exposing legacy LinkType objects. */
export class LegacyGraphExpansionBadgeAdapter
  implements GraphExpansionBadgeReader {
  constructor(
    private readonly options: LegacyGraphExpansionBadgeAdapterOptions
  ) {}

  async readBadges(
    input: GraphExpansionBadgeReadInput
  ): Promise<readonly GraphBadge[]> {
    const result: GraphBadge[] = [];
    const seen = new Set<LinkTypeId>();
    for (const definition of this.options.getDefinitions(input.targetNode.contextId)) {
      const linkTypeId = String(definition.linkTypeId ?? "").trim();
      if (!linkTypeId || seen.has(linkTypeId)) continue;
      seen.add(linkTypeId);
      result.push({
        id: createGraphBadgeId(input.targetNode.id, linkTypeId),
        nodeId: input.targetNode.id,
        linkTypeId,
        contextId: input.targetNode.contextId,
        label: String(definition.label ?? "").trim() || linkTypeId,
        color: definition.color,
        state: "collapsed",
        semantic: definition.semantic,
        hasRelationships: this.options.hasRelationships(
          input.targetNote.id,
          linkTypeId
        ),
        duplicateNodes: definition.duplicateNodes
      });
    }
    return result;
  }
}
