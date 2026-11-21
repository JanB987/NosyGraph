import { queueGraphDocumentMutation } from "./GraphDocumentMutationQueue";
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- NosyGraph parses Obsidian frontmatter, Bases data, and persisted graph JSON whose shapes are validated at runtime. */
import { Modal, TFile, type App } from "obsidian";
import { resolveWikiLinkArray } from "./linkResolver";
import { setStyle } from "./domStyle";
import type { GraphBadgeMembershipDestination, GraphBadgeMembershipItem, GraphBadgeMembershipResult } from "./graph-application/GraphLinkMutation";
import { getGraphMarkdownFile, graphPropertyContainsNote } from "./ObsidianGraphNoteLinkPaste";

export interface GraphRootPropertyMutationRequest {
  ownerPath: string;
  files: TFile[];
  propertyNames: string[];
}

export interface GraphRootPropertyMutationResult {
  added: number;
  property: string | null;
}

export class ObsidianGraphRootPropertyMutationHandler {
  constructor(private readonly app: App) {}

  async addFiles(request: GraphRootPropertyMutationRequest): Promise<GraphRootPropertyMutationResult> {
    const ownerFile = this.resolveFile(request.ownerPath);
    const files = this.normalizeFiles(request.files, ownerFile?.path ?? "");
    const propertyNames = this.normalizeProperties(request.propertyNames);
    if (!(ownerFile instanceof TFile) || files.length === 0 || propertyNames.length === 0) {
      return { added: 0, property: null };
    }

    const property = propertyNames.length === 1
      ? propertyNames[0]
      : await this.requestPropertySelection(propertyNames, ownerFile);
    if (!property) return { added: 0, property: null };

    const added = await this.addFilesToProperty(ownerFile, files, property);
    return { added, property };
  }

  async appendBadgeMembership(
    destination: GraphBadgeMembershipDestination,
    owner: TFile,
    reference: TFile,
    entries: readonly { path: string; file: TFile }[],
    propertyIsCurrent: (frontmatter: Record<string, unknown>) => boolean
  ): Promise<GraphBadgeMembershipResult> {
    const { ownerPath, referencePath, property } = destination;
    const notes = [...new Map(entries.map((entry) => [entry.path, entry])).values()];
    const stale = (): GraphBadgeMembershipItem[] => notes.map(({ path }) => ({
      path, status: "stale", reason: "The selected membership property or its parent changed. Review the destination before retrying."
    }));
    const identitiesMatch = () => getGraphMarkdownFile(this.app, ownerPath) === owner
      && getGraphMarkdownFile(this.app, referencePath) === reference;
    return queueGraphDocumentMutation(this.app, ownerPath, async () => {
      if (!identitiesMatch()) return { destination, items: stale(), changedFilePaths: [] };
      let items: GraphBadgeMembershipItem[] = [];
      await this.app.fileManager.processFrontMatter(owner, (frontmatter) => {
        items = [];
        if (!identitiesMatch() || !propertyIsCurrent(frontmatter)
          || !graphPropertyContainsNote(this.app, frontmatter[property], referencePath, ownerPath)) {
          items = stale();
          return;
        }
        const existing: unknown = frontmatter[property];
        const references: string[] = [];
        for (const { path, file } of notes) {
          if (path === ownerPath) {
            items.push({ path, status: "unavailable", reason: "A graph owner cannot be added as its own member." });
          } else if (getGraphMarkdownFile(this.app, path) !== file) {
            items.push({ path, status: "stale", reason: "The selected note changed or was deleted." });
          } else if (graphPropertyContainsNote(this.app, existing, path, ownerPath)) {
            items.push({ path, status: "already-present" });
          } else {
            references.push(this.app.fileManager.generateMarkdownLink(file, ownerPath));
            items.push({ path, status: "added" });
          }
        }
        if (references.length) {
          frontmatter[property] = [...(Array.isArray(existing) ? existing : [existing]), ...references];
        }
      });
      return { destination, items, changedFilePaths: items.some(({ status }) => status === "added") ? [ownerPath] : [] };
    }, "badge-membership");
  }

  private async requestPropertySelection(propertyNames: string[], ownerFile: TFile): Promise<string | null> {
    return new Promise((resolve) => {
      const modal = new RootPropertySelectionModal(
        this.app,
        propertyNames,
        ownerFile,
        (property) => resolve(property),
        () => resolve(null)
      );
      modal.open();
    });
  }

  private async addFilesToProperty(ownerFile: TFile, files: TFile[], property: string): Promise<number> {
    let added = 0;
    await this.app.fileManager.processFrontMatter(ownerFile, (frontmatter) => {
      const propertyKey = this.findFrontmatterPropertyKey(frontmatter, property) ?? property;
      const existingPaths = new Set(resolveWikiLinkArray(this.app, frontmatter[propertyKey]).map((file) => file.path));
      const current = this.normalizeFrontmatterStringArray(frontmatter[propertyKey]);
      const next = [...current];
      for (const file of files) {
        if (existingPaths.has(file.path)) continue;
        existingPaths.add(file.path);
        next.push(this.app.fileManager.generateMarkdownLink(file, ownerFile.path));
        added += 1;
      }
      if (added > 0) {
        frontmatter[propertyKey] = next;
      }
    });
    return added;
  }

  private normalizeFiles(files: TFile[], ownerPath: string): TFile[] {
    const seen = new Set<string>();
    const out: TFile[] = [];
    for (const file of files) {
      if (!(file instanceof TFile) || file.extension !== "md" || file.path === ownerPath || seen.has(file.path)) continue;
      seen.add(file.path);
      out.push(file);
    }
    return out;
  }

  private normalizeProperties(properties: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of properties ?? []) {
      const value = String(raw ?? "").trim();
      const normalized = value.toLowerCase();
      if (!value || normalized === "none-type links" || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(value);
    }
    return out;
  }

  private normalizeFrontmatterStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      const single = String(value ?? "").trim();
      return single ? [single] : [];
    }
    return value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
  }

  private findFrontmatterPropertyKey(frontmatter: Record<string, unknown>, property: string): string | null {
    const normalizedProperty = this.normalizeProperty(property);
    return Object.keys(frontmatter).find((key) => this.normalizeProperty(key) === normalizedProperty) ?? null;
  }

  private resolveFile(path: string): TFile | null {
    const file = this.app.vault.getAbstractFileByPath(String(path ?? "").trim());
    return file instanceof TFile ? file : null;
  }

  private normalizeProperty(property: string): string {
    return String(property ?? "").trim().toLowerCase();
  }
}

class RootPropertySelectionModal extends Modal {
  private selectedIndex = 0;
  private completed = false;

  constructor(
    app: App,
    private readonly propertyNames: string[],
    private readonly ownerFile: TFile,
    private readonly onSelect: (property: string) => void,
    private readonly onCancel: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.modalEl.addClass("o3-graph-root-property-modal");
    this.contentEl.createEl("h3", { text: "Add node under property" });
    const note = this.contentEl.createDiv({ text: this.ownerFile.basename });
    setStyle(note, "color", "var(--text-muted)");
    setStyle(note, "marginBottom", "8px");
    this.renderItems();
    this.scope.register([], "ArrowDown", (event) => {
      event.preventDefault();
      this.selectedIndex = Math.min(this.selectedIndex + 1, this.propertyNames.length - 1);
      this.renderItems();
    });
    this.scope.register([], "ArrowUp", (event) => {
      event.preventDefault();
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
      this.renderItems();
    });
    this.scope.register([], "Enter", (event) => {
      event.preventDefault();
      this.choose(this.propertyNames[this.selectedIndex]);
    });
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.completed) this.onCancel();
  }

  private renderItems(): void {
    const existing = this.contentEl.querySelector(".o3-graph-root-property-list");
    existing?.remove();
    const list = this.contentEl.createDiv({ cls: "o3-graph-root-property-list" });
    for (let index = 0; index < this.propertyNames.length; index++) {
      const property = this.propertyNames[index];
      const row = list.createDiv({ text: property });
      setStyle(row, "padding", "6px 8px");
      setStyle(row, "borderRadius", "6px");
      setStyle(row, "cursor", "pointer");
      setStyle(row, "background", index === this.selectedIndex ? "var(--background-modifier-hover)" : "");
      row.addEventListener("mouseenter", () => {
        this.selectedIndex = index;
        this.renderItems();
      });
      row.addEventListener("mousedown", (event) => {
        event.preventDefault();
        this.choose(property);
      });
    }
  }

  private choose(property: string | undefined): void {
    const normalized = String(property ?? "").trim();
    if (!normalized) return;
    this.completed = true;
    this.onSelect(normalized);
    this.close();
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- Re-enable dynamic-data lint rules after this module. */
