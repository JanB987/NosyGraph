import type { GraphDocument } from "../graph-domain/GraphDocument";
import {
  GraphDocumentPersistence,
  type GraphDocumentReadResult,
  type GraphDocumentRestoreResult,
  type GraphDocumentStorage
} from "./GraphDocumentPersistence";

/** Obsidian-facing storage composition for graph documents. */
export class ObsidianGraphDocumentRepository {
  private readonly persistence = new GraphDocumentPersistence();

  constructor(private readonly storage: GraphDocumentStorage) {}

  async load(path: string): Promise<GraphDocumentReadResult> {
    return this.persistence.load(this.storage, path);
  }

  async save(document: GraphDocument): Promise<void> {
    await this.persistence.save(this.storage, document);
  }

  async loadAndRestore(path: string): Promise<GraphDocumentRestoreResult> {
    return this.persistence.loadAndRestore(this.storage, path);
  }
}
