import type { GraphRelationshipIndex } from "../../graph-core/graph-types.js";
import type { VaultIndex } from "../../indexer/VaultIndex.js";

export class WorkingMemoryIndexProvider implements GraphRelationshipIndex {
  constructor(private readonly index: VaultIndex) {}

  getProperties(): string[] {
    return this.index.getProperties();
  }

  getPropertyOutgoingLinks(property: string, nodeId: string): string[] {
    return this.index.getPropertyOutgoingLinks(property, nodeId);
  }

  getPropertyIncomingLinks(property: string, nodeId: string): string[] {
    return this.index.getPropertyIncomingLinks(property, nodeId);
  }
}
