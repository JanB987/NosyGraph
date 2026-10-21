/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- NosyGraph parses Obsidian frontmatter, Bases data, and persisted graph JSON whose shapes are validated at runtime. */
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

    await this.loadFiles(files);
  }

  /**
   * Loads definitions that a graph note references explicitly, even when the
   * note lives outside the configured discovery folder. The folder continues
   * to define menu/discovery scope; an explicit graph-note link is authoritative
   * configuration and must remain usable after installation or settings reset.
   */
  async loadReferencedFiles(files: readonly TFile[]): Promise<void> {
    const knownPaths = new Set(this.allLinkTypes.map((linkType) => linkType.file.path));
    const additions = Array.from(new Map(
      (files ?? [])
        .filter((file): file is TFile => file instanceof TFile && file.extension === "md")
        .map((file) => [file.path, file] as const)
    ).values())
      .filter((file) => !knownPaths.has(file.path))
      .sort((a, b) => a.path.localeCompare(b.path));
    await this.loadFiles(additions);
  }

  getAll(): O3LinkType[] {
    return [...this.allLinkTypes];
  }

  getById(id: string): O3LinkType | undefined {
    const normalizedId = String(id ?? "").trim();
    if (!normalizedId) return undefined;
    return this.allLinkTypes.find((linkType) => linkType.definitionId === normalizedId);
  }

  getByProperty(property: string): O3LinkType | undefined {
    return this.getByProperties(property)[0];
  }

  /** Returns every definition that reads the property, including Lenses. */
  getByProperties(...properties: string[]): O3LinkType[] {
    const keys = new Set(
      properties
        .flatMap((value) => String(value ?? "").split(","))
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    );
    if (keys.size === 0) return [];

    const result: O3LinkType[] = [];
    const seen = new Set<string>();
    for (const key of keys) {
      for (const linkType of this.byProperty.get(key) ?? []) {
        const path = String(linkType.file?.path ?? "").trim();
        const identity = path || `${linkType.key}:${linkType.property}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        result.push(linkType);
      }
    }
    return result;
  }

  /** Returns non-Lens definitions that conflict with a requested definition. */
  getNonLensConflicts(requested: O3LinkType): O3LinkType[] {
    if (requested.semantic === "lens") return [];
    const requestedProperties = new Set(requested.properties);
    const requestedPath = String(requested.file?.path ?? "").trim();
    const conflicts: O3LinkType[] = [];
    const seen = new Set<string>();
    for (const linkType of this.getByProperties(...requested.properties)) {
      const path = String(linkType.file?.path ?? "").trim();
      if (path && path === requestedPath) continue;
      if (linkType.semantic === "lens") continue;
      if (!linkType.properties.some((property) => requestedProperties.has(property))) continue;
      if (seen.has(path)) continue;
      seen.add(path);
      conflicts.push(linkType);
    }
    return conflicts;
  }

  getByPath(path: string): O3LinkType | undefined {
    const normalizedPath = String(path ?? "").trim();
    if (!normalizedPath) return undefined;
    return this.allLinkTypes.find((linkType) => linkType.file.path === normalizedPath);
  }

  private async loadFiles(files: readonly TFile[]): Promise<void> {
    for (const file of files) {
      const fm = await this.readFrontmatter(file);
      if (!frontmatterMatchesIdentifier(fm, this.identifiers.linkType)) continue;

      const linkType = new O3LinkType(file, fm, this.propertyKeys);
      const properties = linkType.properties
        .map((property) => String(property ?? "").trim().toLowerCase())
        .filter(Boolean);
      if (properties.length === 0) continue;
      this.allLinkTypes.push(linkType);
      for (const property of properties) {
        const list = this.byProperty.get(property) ?? [];
        list.push(linkType);
        this.byProperty.set(property, list);
      }
    }
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
/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- Re-enable dynamic-data lint rules after this module. */
