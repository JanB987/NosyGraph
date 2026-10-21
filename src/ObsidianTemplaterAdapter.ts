import { FuzzySuggestModal, Notice, TFile, normalizePath, type App } from "obsidian";

interface TemplaterRuntime {
  write_template_to_file?: (template: TFile, target: TFile) => Promise<void>;
}

interface TemplaterPluginLike {
  templater?: TemplaterRuntime;
  settings?: { templates_folder?: string };
}

interface AppWithPlugins extends App {
  plugins: {
    getPlugin(id: string): unknown;
  };
}

class TemplaterTemplatePicker extends FuzzySuggestModal<TFile> {
  private settled = false;

  constructor(
    app: App,
    private readonly templates: TFile[],
    private readonly resolveSelection: (file: TFile | null) => void
  ) {
    super(app);
    this.setPlaceholder("Choose a Templater template...");
    this.emptyStateText = "No Templater templates found.";
  }

  getItems(): TFile[] {
    return this.templates;
  }

  onOpen(): void {
    void super.onOpen();
    this.inputEl?.focus();
  }

  getItemText(item: TFile): string {
    return item.path;
  }

  onChooseItem(item: TFile): void {
    this.finish(item);
    this.close();
  }

  onClose(): void {
    super.onClose();
    // Obsidian may close the modal immediately after dispatching the choice
    // callback. Defer cancellation so a selected template wins that race.
    window.setTimeout(() => this.finish(null), 0);
  }

  private finish(file: TFile | null): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveSelection(file);
  }
}

/**
 * Boundary around the installed Templater runtime. NosyGraph owns target
 * selection, while Templater owns parsing, tp context, and note mutation.
 */
export class ObsidianTemplaterAdapter {
  constructor(private readonly app: App) {}

  private getPlugin(): TemplaterPluginLike | null {
    const plugin = (this.app as AppWithPlugins).plugins.getPlugin("templater-obsidian");
    return plugin && typeof plugin === "object" ? plugin : null;
  }

  isAvailable(): boolean {
    return typeof this.getPlugin()?.templater?.write_template_to_file === "function";
  }

  async chooseTemplate(): Promise<TFile | null> {
    const plugin = this.getPlugin();
    if (!plugin) return null;
    const folder = normalizePath(String(plugin.settings?.templates_folder ?? "").trim()).replace(/\/$/, "");
    const templates = this.app.vault.getMarkdownFiles()
      .filter((file) => !folder || file.path === folder || file.path.startsWith(`${folder}/`))
      .sort((a, b) => a.path.localeCompare(b.path));
    if (templates.length === 0) return null;
    return await new Promise<TFile | null>((resolve) => {
      const picker = new TemplaterTemplatePicker(this.app, templates, resolve);
      picker.open();
    });
  }

  async applyTemplate(template: TFile, target: TFile): Promise<void> {
    const runtime = this.getPlugin()?.templater;
    if (typeof runtime?.write_template_to_file !== "function") {
      throw new Error("Templater's file execution API is unavailable.");
    }
    await runtime.write_template_to_file(template, target);
  }

  showUnavailableNotice(): void {
    new Notice("Install and enable the Templater plugin before applying templates to graph nodes.");
  }
}
