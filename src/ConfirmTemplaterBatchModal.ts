import { Modal, Setting, type App } from "obsidian";

/** Resolve cancellation on every close path, including Escape and backdrop clicks. */
export class ConfirmTemplaterBatchModal extends Modal {
  private confirmed = false;

  constructor(app: App, private readonly count: number, private readonly resolve: (confirmed: boolean) => void) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.createEl("h2", { text: "Apply template to selected nodes?" });
    this.contentEl.createEl("p", { text: `Apply one Templater template to ${this.count} selected node instances?` });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) => button.setButtonText("Continue").setCta().onClick(() => {
        this.confirmed = true;
        this.close();
      }));
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolve(this.confirmed);
  }

  static ask(app: App, count: number): Promise<boolean> {
    return new Promise((resolve) => new ConfirmTemplaterBatchModal(app, count, resolve).open());
  }
}
