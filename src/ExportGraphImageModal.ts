import { App, Modal, Setting } from "obsidian";
import type { GraphImageExportArea } from "./GraphEngine";
import type { GraphImageExportRequest } from "./GraphView";

type GraphImageBackgroundMode = "graph" | "transparent" | "custom";

export class ExportGraphImageModal extends Modal {
  private area: GraphImageExportArea = "fit-to-content";
  private outputPath: string;
  private backgroundMode: GraphImageBackgroundMode = "graph";
  private customBackgroundColor: string;

  constructor(
    app: App,
    options: {
      defaultOutputPath: string;
      defaultBackgroundColor: string | null;
      onSubmit: (request: GraphImageExportRequest) => Promise<void> | void;
    }
  ) {
    super(app);
    this.outputPath = options.defaultOutputPath;
    this.customBackgroundColor = options.defaultBackgroundColor ?? "#ffffff";
    this.onSubmit = options.onSubmit;
  }

  private readonly onSubmit: (request: GraphImageExportRequest) => Promise<void> | void;

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Export Graph as Image" });

    new Setting(contentEl)
      .setName("Area")
      .setDesc("Choose which part of the graph canvas should be exported.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("fit-to-content", "Fit to content")
          .addOption("current-viewport", "Current viewport")
          .setValue(this.area)
          .onChange((value) => {
            this.area = value === "current-viewport" ? "current-viewport" : "fit-to-content";
          });
      });

    new Setting(contentEl)
      .setName("Output path")
      .setDesc("Vault-relative PNG path. Missing folders are created.")
      .addText((text) => {
        text
          .setPlaceholder("Exports/Graph.png")
          .setValue(this.outputPath)
          .onChange((value) => {
            this.outputPath = value;
          });
      });

    new Setting(contentEl)
      .setName("Background")
      .setDesc("Use the graph note background, transparent, or a custom CSS color.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("graph", "Graph note background")
          .addOption("transparent", "Transparent")
          .addOption("custom", "Custom color")
          .setValue(this.backgroundMode)
          .onChange((value) => {
            this.backgroundMode = value === "transparent" || value === "custom" ? value : "graph";
          });
      });

    new Setting(contentEl)
      .setName("Custom background color")
      .setDesc("Used only when Background is set to Custom color.")
      .addText((text) => {
        text
          .setPlaceholder("#F7AA34")
          .setValue(this.customBackgroundColor)
          .onChange((value) => {
            this.customBackgroundColor = value;
          });
      });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText("Export")
          .setCta()
          .onClick(async () => {
            const backgroundColor = this.backgroundMode === "graph"
              ? undefined
              : this.backgroundMode === "transparent"
                ? null
                : this.customBackgroundColor;
            await this.onSubmit({
              area: this.area,
              outputPath: this.outputPath,
              backgroundColor
            });
            this.close();
          });
      })
      .addButton((button) => {
        button
          .setButtonText("Cancel")
          .onClick(() => this.close());
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
