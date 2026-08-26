/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion */
import { Modal, Notice, TFile, type App } from "obsidian";
import { setStyle } from "./domStyle";

type RootInputItem =
  | { kind: "file"; file: TFile; score: number }
  | { kind: "create"; title: string; score: number };

export class ObsidianGraphRootInputHandler {
  constructor(private readonly app: App) {}

  requestRootFile(sourcePath: string): Promise<TFile | null> {
    return new Promise((resolve) => {
      const modal = new GraphRootInputModal(
        this.app,
        sourcePath,
        (file) => resolve(file),
        () => resolve(null)
      );
      modal.open();
    });
  }
}

class GraphRootInputModal extends Modal {
  private inputEl!: HTMLInputElement;
  private listEl!: HTMLDivElement;
  private query = "";
  private items: RootInputItem[] = [];
  private selectedIndex = 0;
  private completed = false;

  constructor(
    app: App,
    private readonly sourcePath: string,
    private readonly onFileSelected: (file: TFile) => void,
    private readonly onCancel: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.modalEl.addClass("o3-graph-root-input-modal");

    this.contentEl.createEl("h3", { text: "Add root node" });
    this.inputEl = this.contentEl.createEl("input", {
      type: "text",
      placeholder: "Type a note name..."
    });
    setStyle(this.inputEl, "width", "100%");
    setStyle(this.inputEl, "boxSizing", "border-box");
    setStyle(this.inputEl, "marginBottom", "8px");

    this.listEl = this.contentEl.createDiv();
    setStyle(this.listEl, "maxHeight", "320px");
    setStyle(this.listEl, "overflowY", "auto");

    this.inputEl.addEventListener("input", () => {
      this.query = this.inputEl.value;
      this.selectedIndex = 0;
      this.refreshItems();
    });
    this.inputEl.addEventListener("keydown", (event) => this.handleKeyDown(event));

    this.refreshItems();
    this.inputEl.focus();
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.completed) {
      this.onCancel();
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.selectedIndex = Math.min(this.selectedIndex + 1, Math.max(this.items.length - 1, 0));
      this.renderItems();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
      this.renderItems();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = this.items[this.selectedIndex];
      if (item) {
        void this.chooseItem(item);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
    }
  }

  private refreshItems(): void {
    const files = this.app.vault.getMarkdownFiles()
      .map((file) => {
        const score = this.scoreFile(file, this.query);
        return score === null ? null : { kind: "file" as const, file, score };
      })
      .filter((item): item is RootInputItem => item !== null)
      .sort((a, b) => b.score - a.score || this.getItemTitle(a).localeCompare(this.getItemTitle(b)))
      .slice(0, 30);

    const createTitle = this.getCreateTitle();
    const createItem = createTitle && !this.exactFileExists(createTitle)
      ? [{ kind: "create" as const, title: createTitle, score: Number.MAX_SAFE_INTEGER }]
      : [];

    this.items = [...createItem, ...files];
    if (this.selectedIndex >= this.items.length) {
      this.selectedIndex = Math.max(this.items.length - 1, 0);
    }
    this.renderItems();
  }

  private renderItems(): void {
    this.listEl.empty();

    if (this.items.length === 0) {
      const empty = this.listEl.createDiv({ text: "Type a note name to search or create a note." });
      setStyle(empty, "color", "var(--text-muted)");
      setStyle(empty, "padding", "8px 4px");
      return;
    }

    for (let index = 0; index < this.items.length; index++) {
      const item = this.items[index];
      const row = this.listEl.createDiv();
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
        void this.chooseItem(item);
      });

      if (item.kind === "create") {
        row.createDiv({ text: `Create ${item.title}` });
        const note = row.createDiv({ text: "New markdown note" });
        setStyle(note, "color", "var(--text-muted)");
        setStyle(note, "fontSize", "12px");
      } else {
        row.createDiv({ text: item.file.basename });
        const path = row.createDiv({ text: item.file.path });
        setStyle(path, "color", "var(--text-muted)");
        setStyle(path, "fontSize", "12px");
      }
    }
  }

  private async chooseItem(item: RootInputItem): Promise<void> {
    this.completed = true;
    try {
      const file = item.kind === "file" ? item.file : await this.createMarkdownFile(item.title);
      this.onFileSelected(file);
      this.close();
    } catch (error) {
      this.completed = false;
      console.error("[GraphRootInput] Failed to add root node:", error);
      new Notice("Failed to add graph root node.");
    }
  }

  private scoreFile(file: TFile, query: string): number | null {
    const normalizedQuery = this.normalize(query);
    if (!normalizedQuery) return 1;

    const basename = this.normalize(file.basename);
    const path = this.normalize(file.path);
    const basenameIndex = basename.indexOf(normalizedQuery);
    if (basenameIndex >= 0) return 1000 - basenameIndex;
    const pathIndex = path.indexOf(normalizedQuery);
    if (pathIndex >= 0) return 500 - pathIndex;

    const fuzzyScore = Math.max(
      this.scoreFuzzyMatch(basename, normalizedQuery),
      this.scoreFuzzyMatch(path, normalizedQuery)
    );
    return fuzzyScore > 0 ? fuzzyScore : null;
  }

  private scoreFuzzyMatch(value: string, query: string): number {
    let score = 0;
    let valueIndex = 0;
    let streak = 0;
    for (const char of query) {
      const foundAt = value.indexOf(char, valueIndex);
      if (foundAt < 0) return 0;
      streak = foundAt === valueIndex ? streak + 1 : 1;
      score += 10 + streak * 2 - Math.min(foundAt - valueIndex, 8);
      valueIndex = foundAt + 1;
    }
    return score;
  }

  private getCreateTitle(): string {
    return this.query
      .replace(/\\/g, "/")
      .replace(/\.md$/i, "")
      .trim();
  }

  private exactFileExists(title: string): boolean {
    const normalizedTitle = this.normalize(title.replace(/\.md$/i, ""));
    return this.app.vault.getMarkdownFiles().some((file) =>
      this.normalize(file.basename) === normalizedTitle ||
      this.normalize(file.path.replace(/\.md$/i, "")) === normalizedTitle
    );
  }

  private async createMarkdownFile(title: string): Promise<TFile> {
    const targetPath = this.buildNewFilePath(title);
    await this.ensureFolderExists(targetPath);
    return this.app.vault.create(targetPath, "");
  }

  private buildNewFilePath(title: string): string {
    const sanitized = this.sanitizePath(title);
    const basePath = sanitized.includes("/")
      ? sanitized
      : `${this.getParentFolderPath(this.sourcePath)}${sanitized}`;
    return this.buildUniquePath(`${basePath}.md`);
  }

  private sanitizePath(title: string): string {
    return title
      .replace(/\\/g, "/")
      .replace(/\.md$/i, "")
      .split("/")
      .map((part) => part.replace(/[\\:*?"<>|#^[\]]/g, "").trim())
      .filter(Boolean)
      .join("/") || "Untitled";
  }

  private getParentFolderPath(path: string): string {
    const index = path.lastIndexOf("/");
    return index >= 0 ? `${path.slice(0, index + 1)}` : "";
  }

  private buildUniquePath(path: string): string {
    if (!this.app.vault.getAbstractFileByPath(path)) return path;
    const extension = ".md";
    const base = path.slice(0, -extension.length);
    let index = 2;
    let candidate = `${base} ${index}${extension}`;
    while (this.app.vault.getAbstractFileByPath(candidate)) {
      index += 1;
      candidate = `${base} ${index}${extension}`;
    }
    return candidate;
  }

  private async ensureFolderExists(filePath: string): Promise<void> {
    const folderPath = this.getParentFolderPath(filePath).replace(/\/$/, "");
    if (!folderPath || this.app.vault.getAbstractFileByPath(folderPath)) return;

    const segments = folderPath.split("/").filter(Boolean);
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  private getItemTitle(item: RootInputItem): string {
    return item.kind === "create" ? item.title : item.file.path;
  }

  private normalize(value: string): string {
    return String(value ?? "").trim().toLowerCase();
  }
}
