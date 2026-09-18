import type { GraphRelationshipTarget, GraphRelationshipTargetQuery, GraphRelationshipTargetReader } from "./GraphRelationshipTargetReader";
import type { LinkTypeId, GraphContextId } from "../graph-domain/graph-identifiers";
import type { GraphNoteRepository } from "./ObsidianNoteRepository";

export type ObsidianRelationshipDirection = "outgoing" | "incoming" | "both";

export interface ObsidianRelationshipType {
  property: string;
  properties?: readonly string[];
  direction?: ObsidianRelationshipDirection;
}

export interface ObsidianRelationshipTargetReaderOptions {
  notes: GraphNoteRepository;
  getRelationshipType(
    linkTypeId: LinkTypeId,
    contextId: GraphContextId
  ): ObsidianRelationshipType | undefined | Promise<ObsidianRelationshipType | undefined>;
}

/** Resolves configured outgoing and incoming note links without exposing host records. */
export class ObsidianRelationshipTargetReader implements GraphRelationshipTargetReader {
  constructor(private readonly options: ObsidianRelationshipTargetReaderOptions) {}

  async readTargets(query: GraphRelationshipTargetQuery): Promise<readonly GraphRelationshipTarget[]> {
    const config = await this.options.getRelationshipType(query.linkTypeId, query.contextId);
    if (!config || !String(config.property ?? "").trim()) return [];

    const direction = config.direction ?? "outgoing";
    const paths: string[] = [];
    if (direction === "outgoing" || direction === "both") {
      for (const property of relationshipProperties(config)) {
        paths.push(...await this.options.notes.getOutgoingLinks(query.sourceNoteId, property));
      }
    }
    if (direction === "incoming" || direction === "both") {
      for (const property of relationshipProperties(config)) {
        paths.push(...await this.options.notes.getIncomingLinks(query.sourceNoteId, property));
      }
    }

    const result: GraphRelationshipTarget[] = [];
    const seen = new Set<string>();
    for (const rawPath of paths) {
      const noteId = String(rawPath ?? "").trim();
      if (!noteId || noteId === query.sourceNoteId || seen.has(noteId)) continue;
      seen.add(noteId);
      const note = await this.options.notes.getNote(noteId);
      result.push({
        noteId,
        label: note?.name || noteId.replace(/\.md$/i, "").split("/").pop() || noteId,
        missing: !note
      });
    }
    return result;
  }
}

function relationshipProperties(config: ObsidianRelationshipType): readonly string[] {
  const values = [config.property, ...(config.properties ?? [])]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  return Array.from(new Set(values));
}
