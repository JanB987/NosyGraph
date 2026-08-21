import type { LinkTypeDefinition, LinkTypeRegistryData } from "./types";
import { normalizeLinkTypeDefinition } from "./LinkTypeSemantics.js";

export interface LinkTypeRegistryStorage {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
}

export class LinkTypeRegistry {
  private state: LinkTypeRegistryData = {
    version: 1,
    linkTypes: [],
  };

  constructor(
    private readonly storage: LinkTypeRegistryStorage,
    private readonly registryPath = ".wm/link-types.json",
  ) {}

  async load(): Promise<LinkTypeRegistryData> {
    try {
      const raw = await this.storage.readFile(this.registryPath);
      if (typeof raw !== "string" || raw.trim().length === 0) {
        this.state = this.createDefaultState();
        return this.getState();
      }

      const parsed = JSON.parse(raw) as Partial<LinkTypeRegistryData>;
      this.state = {
        version: 1,
        linkTypes: Array.isArray(parsed.linkTypes)
          ? parsed.linkTypes
              .map((linkType) => this.normalizeLinkType(linkType))
              .filter((linkType): linkType is LinkTypeDefinition => Boolean(linkType))
          : [],
      };
    } catch {
      this.state = this.createDefaultState();
    }

    return this.getState();
  }

  async save(): Promise<void> {
    await this.storage.writeFile(this.registryPath, JSON.stringify(this.state, null, 2));
  }

  getState(): LinkTypeRegistryData {
    return {
      version: this.state.version,
      linkTypes: this.getAll(),
    };
  }

  getAll(): LinkTypeDefinition[] {
    return [...this.state.linkTypes];
  }

  getById(id: string): LinkTypeDefinition | undefined {
    return this.state.linkTypes.find((linkType) => linkType.id === id);
  }

  async add(linkType: LinkTypeDefinition): Promise<LinkTypeDefinition> {
    const normalized = this.normalizeLinkType(linkType);
    if (!normalized) {
      throw new Error("Invalid link type definition.");
    }

    if (this.state.linkTypes.some((existing) => existing.id === normalized.id)) {
      throw new Error(`Link type ${normalized.id} already exists.`);
    }

    this.state.linkTypes = [...this.state.linkTypes, normalized];
    await this.save();
    return normalized;
  }

  async update(id: string, updates: Partial<LinkTypeDefinition>): Promise<LinkTypeDefinition> {
    const current = this.getById(id);
    if (!current) {
      throw new Error(`Link type ${id} does not exist.`);
    }

    const normalized = this.normalizeLinkType({
      ...current,
      ...updates,
      id: current.id,
    });
    if (!normalized) {
      throw new Error("Invalid link type definition.");
    }

    this.state.linkTypes = this.state.linkTypes.map((linkType) => (
      linkType.id === id ? normalized : linkType
    ));
    await this.save();
    return normalized;
  }

  private createDefaultState(): LinkTypeRegistryData {
    return {
      version: 1,
      linkTypes: [],
    };
  }

  private normalizeLinkType(
    linkType: Partial<LinkTypeDefinition> | undefined,
  ): LinkTypeDefinition | undefined {
    return normalizeLinkTypeDefinition(linkType);
  }
}
