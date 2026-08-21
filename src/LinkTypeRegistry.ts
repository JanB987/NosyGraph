import { App, parseYaml, TFile } from "obsidian";
import { O3LinkType } from "./O3LinkType";
import {
  DEFAULT_NOTE_TYPE_IDENTIFIERS,
  type NoteTypeIdentifierSettings,
  frontmatterMatchesIdentifier,
  normalizeNoteTypeIdentifiers
} from "./NoteTypeIdentifier";
import {
  DEFAULT_LINK_TYPE_PROPERTY_KEYS,
  type LinkTypePropertyKeys,
  normalizeLinkTypePropertyKeys
} from "./NoteTypePropertyKeys";

export class LinkTypeRegistry {
  private readonly app: App;
  private folderPath: string;
  private identifiers: NoteTypeIdentifierSettings;
  private propertyKeys: LinkTypePropertyKeys;
  private readonly allLinkTypes: O3LinkType[] = [];
  private readonly byProperty = new Map<string, O3LinkType[]>();

  constructor(
    app: App,
    folderPath: string,
    identifiers: Partial<NoteTypeIdentifierSettings> = DEFAULT_NOTE_TYPE_IDENTIFIERS,
    propertyKeys: Partial<LinkTypePropertyKeys> = DEFAULT_LINK_TYPE_PROPERTY_KEYS
  ) {
    this.app = app;
    this.folderPath = this.normalizeFolderPath(folderPath);
    this.identifiers = normalizeNoteTypeIdentifiers(identifiers);
    this.propertyKeys = normalizeLinkTypePropertyKeys(propertyKeys);
  }

  setIdentifiers(identifiers: Partial<NoteTypeIdentifierSettings>): void {
    this.identifiers = normalizeNoteTypeIdentifiers(identifiers);
  }

  setPropertyKeys(propertyKeys: Partial<LinkTypePropertyKeys>): void {
    this.propertyKeys = normalizeLinkTypePropertyKeys(propertyKeys);
  }

  async load(): Promise<void> {
    this.allLinkTypes.length = 0;
    this.byProperty.clear();
    this.folderPath = this.normalizeFolderPath(this.folderPath);
    if (!this.folderPath) {
      return;
    }

    const files = this.app.vault
      .getFiles()
      .filter((file) => file instanceof TFile && file.extension === "md")
      .filter((file) => this.isInRegistryFolder(file.path))
      .sort((a, b) => a.path.localeCompare(b.path));

    for (const file of files) {
      const fm = await this.readFrontmatter(file);
      if (!frontmatterMatchesIdentifier(fm, this.identifiers.linkType)) continue;

      const linkType = new O3LinkType(file, fm, this.propertyKeys);
      const property = String(linkType.property ?? "").trim().toLowerCase();
      if (!property) continue;
      this.allLinkTypes.push(linkType);
      const list = this.byProperty.get(property) ?? [];
      list.push(linkType);
      this.byProperty.set(property, list);
    }
  }

  getAll(): O3LinkType[] {
    return [...this.allLinkTypes];
  }

  getByProperty(property: string): O3LinkType | undefined {
    const key = String(property ?? "").trim().toLowerCase();
    if (!key) return undefined;
    const list = this.byProperty.get(key);
    return list?.[0];
  }

  private normalizeFolderPath(raw: string): string {
    return String(raw ?? "").trim().replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
  }

  private isInRegistryFolder(filePath: string): boolean {
    const normalizedFilePath = String(filePath ?? "").trim();
    if (!normalizedFilePath || !this.folderPath) return false;
    if (normalizedFilePath === this.folderPath) return false;
    return normalizedFilePath.startsWith(`${this.folderPath}/`);
  }

  private async readFrontmatter(file: TFile): Promise<Record<string, unknown> | null> {
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (fm && typeof fm === "object") {
      return fm as Record<string, unknown>;
    }

    try {
      const content = await this.app.vault.cachedRead(file);
      const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
      if (!frontmatterMatch) return null;
      const parsed = parseYaml(frontmatterMatch[1]);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
