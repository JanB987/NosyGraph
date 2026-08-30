import type {
  GraphContextId,
  LinkTypeId,
  NoteId
} from "../graph-domain/graph-identifiers";
import type {
  GraphRelationshipTarget,
  GraphRelationshipTargetQuery,
  GraphRelationshipTargetReader
} from "./GraphRelationshipTargetReader";

export interface LegacyRelationshipTarget {
  path: string;
  label: string;
  missing: boolean;
}

export interface LegacyGraphRelationshipTargetAdapterOptions<TSource, TLinkType> {
  getSource(noteId: NoteId): TSource | undefined | Promise<TSource | undefined>;
  getLinkType(
    linkTypeId: LinkTypeId,
    contextId: GraphContextId
  ): TLinkType | undefined | Promise<TLinkType | undefined>;
  resolveTargets(
    source: TSource,
    linkType: TLinkType
  ): readonly LegacyRelationshipTarget[] | Promise<readonly LegacyRelationshipTarget[]>;
}

/** Converts the current relationship resolver into the host-neutral reader. */
export class LegacyGraphRelationshipTargetAdapter<TSource, TLinkType>
  implements GraphRelationshipTargetReader {
  constructor(
    private readonly options: LegacyGraphRelationshipTargetAdapterOptions<TSource, TLinkType>
  ) {}

  async readTargets(
    query: GraphRelationshipTargetQuery
  ): Promise<readonly GraphRelationshipTarget[]> {
    const source = await this.options.getSource(query.sourceNoteId);
    if (!source) return [];
    const linkType = await this.options.getLinkType(query.linkTypeId, query.contextId);
    if (!linkType) return [];

    const targets = await this.options.resolveTargets(source, linkType);
    const result: GraphRelationshipTarget[] = [];
    const seen = new Set<string>();
    for (const target of targets) {
      const noteId = String(target.path ?? "").trim();
      if (!noteId || noteId === query.sourceNoteId || seen.has(noteId)) continue;
      seen.add(noteId);
      result.push({
        noteId,
        label: String(target.label ?? "").trim() || noteId,
        missing: target.missing === true
      });
    }
    return result;
  }
}
