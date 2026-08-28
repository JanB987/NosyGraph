import type { GraphExpansion } from "../graph-domain/GraphExpansion";
import type { GraphNodeInstance } from "../graph-domain/GraphNodeInstance";
import type { GraphNote } from "../graph-domain/GraphNote";
import type { GraphSnapshot, GraphSnapshotSource } from "../graph-domain/GraphSnapshot";
import type { GraphContextId, NodeInstanceId } from "../graph-domain/graph-identifiers";

export const ROOT_GRAPH_CONTEXT_ID: GraphContextId = "graph:root";

/** A copied node record exposed by the legacy engine during migration. */
export interface LegacyGraphReadNode extends GraphNodeInstance {
  noteName: string;
}

/** A copied expansion record exposed by the legacy engine during migration. */
export interface LegacyGraphReadExpansion extends GraphExpansion {}

export interface LegacyGraphReadState {
  nodes: readonly LegacyGraphReadNode[];
  expansions: readonly LegacyGraphReadExpansion[];
}

export interface LegacyGraphReadSource {
  getLegacyGraphReadState(): LegacyGraphReadState;
}

export interface LegacyGraphNoteReader {
  readNote(path: string, fallbackName: string): GraphNote;
}

/**
 * Temporary bridge from the active GraphEngine to the new immutable snapshot.
 * It can be deleted after GraphStore becomes the runtime state owner.
 */
export class LegacyGraphSnapshotAdapter implements GraphSnapshotSource {
  constructor(
    private readonly source: LegacyGraphReadSource,
    private readonly noteReader: LegacyGraphNoteReader
  ) {}

  getSnapshot(): GraphSnapshot {
    const legacy = this.source.getLegacyGraphReadState();
    const notes = this.readUniqueNotes(legacy.nodes);
    const nodes = legacy.nodes.map((node) => this.copyNode(node));
    const expansions = legacy.expansions.map((expansion) => this.copyExpansion(expansion));

    return { nodes, notes, expansions };
  }

  private readUniqueNotes(nodes: readonly LegacyGraphReadNode[]): GraphNote[] {
    const result: GraphNote[] = [];
    const namesByNoteId = new Map<string, string>();

    for (const node of nodes) {
      if (!namesByNoteId.has(node.noteId)) namesByNoteId.set(node.noteId, node.noteName);
    }

    for (const [noteId, fallbackName] of namesByNoteId) {
      result.push(this.noteReader.readNote(noteId, fallbackName));
    }

    return result;
  }

  private copyNode(node: LegacyGraphReadNode): GraphNodeInstance {
    return {
      id: node.id,
      noteId: node.noteId,
      contextId: node.contextId,
      position: { ...node.position },
      velocity: { ...node.velocity },
      radius: node.radius,
      pinned: node.pinned,
      selected: node.selected,
      origin: { ...node.origin }
    };
  }

  private copyExpansion(expansion: LegacyGraphReadExpansion): GraphExpansion {
    return {
      ...expansion,
      createdNodeIds: [...expansion.createdNodeIds],
      createdEdgeIds: [...expansion.createdEdgeIds],
      childExpansionIds: [...expansion.childExpansionIds]
    };
  }
}

export function contextIdForLegacyNode(
  embeddedInstanceId: string | undefined
): GraphContextId {
  const normalized = String(embeddedInstanceId ?? "").trim();
  return normalized ? `embedded:${normalized}` : ROOT_GRAPH_CONTEXT_ID;
}

export function uniqueExistingNodeIds(
  ids: Iterable<NodeInstanceId>,
  existingIds: ReadonlySet<NodeInstanceId>
): NodeInstanceId[] {
  return Array.from(new Set(ids)).filter((id) => existingIds.has(id));
}
