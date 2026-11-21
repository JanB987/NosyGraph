import { MarkdownView, Notice, type TFile, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { setStyle, setStyles } from "./domStyle";
import { graphTabRecord, type GraphTabNote } from "./graph-application/GraphTabSession";
import { constrainGraphTabPanelWidth, MIN_GRAPH_TAB_PANEL_WIDTH, MAX_GRAPH_TAB_PANEL_WIDTH } from "./graph-application/GraphTabPanelWidths";
import type { ObsidianGraphTabController } from "./ObsidianGraphTabController";

export const GRAPH_TAB_MARKDOWN_VIEW = "nosygraph-tab-markdown";
const EDITOR_WIDTH_RESERVE = 192;
const PANEL_WIDTH_LIMIT = `max(50%, calc(100% - ${EDITOR_WIDTH_RESERVE}px))`;

interface GraphTabPanelWidths {
  read(path: string): number | undefined;
  save(path: string, width: number): Promise<void>;
}

interface PanelResize {
  pointerId: number;
  path: string;
  startX: number;
  startWidth: number;
  maximum: number;
  direction: number;
  width: number;
}

export class GraphTabMarkdownView extends MarkdownView {
  private sourceAction?: HTMLElement;
  private panel?: HTMLElement;
  private resizeHandle?: HTMLElement;
  private resize?: PanelResize;
  private status?: HTMLElement;
  private header?: HTMLElement;
  private lastRender = "";

  constructor(leaf: WorkspaceLeaf, private readonly graphTabs: ObsidianGraphTabController, private readonly panelWidths: GraphTabPanelWidths) {
    super(leaf);
    this.allowNoFile = true;
  }

  getViewType(): string {
    return GRAPH_TAB_MARKDOWN_VIEW;
  }

  getNativeState(): Record<string, unknown> {
    return super.getState();
  }

  getState(): Record<string, unknown> {
    return { ...this.getNativeState(), ...this.graphTabs?.viewState(this.leaf, "markdown") };
  }

  async setState(raw: unknown, result: ViewStateResult): Promise<void> {
    const state = graphTabRecord(raw);
    const controlled = this.graphTabs.isApplying(this.leaf, state);
    const session = this.graphTabs.initializeView(this.leaf, state, "markdown");
    const { graphTab: _graphTab, graphTabSession: _session, ...native } = state;
    const file = typeof native.file === "string" && !this.graphTabs.noteAvailability(native.file) ? native.file : null;
    await super.setState({ ...native, file }, result);
    if (this.graphTabs.suppressHistory(this.leaf, state)) result.history = false;
    if (!controlled && session.activeMarkdownPath !== (this.file?.path ?? null)) {
      this.graphTabs.nativeFileLoaded(this.leaf, this.file?.path ?? null);
    }
    this.graphTabs.refresh();
  }

  async onLoadFile(file: TFile): Promise<void> {
    await super.onLoadFile(file);
    this.graphTabs.nativeFileLoaded(this.leaf, file.path);
  }

  protected async onOpen(): Promise<void> {
    await super.onOpen();
    this.sourceAction = this.graphTabs.addHeaderActions(this, "markdown");
    const sibling = this.contentEl.previousElementSibling;
    if (sibling?.classList.contains("view-header")) this.header = sibling as HTMLElement;

    // Both elements sit beside Obsidian's content element. The editor and
    // properties stay where MarkdownView mounted them.
    this.panel = this.containerEl.createEl("aside", { cls: "nosygraph-selected-notes" });
    this.panel.setAttribute("aria-label", "Selected notes");
    setStyles(this.panel, {
      gridColumn: "3", gridRow: "2", minHeight: "0", overflow: "auto", padding: "var(--size-4-2)"
    });
    this.mountResizeHandle();
    this.status = this.containerEl.createDiv({ cls: "nosygraph-markdown-status" });
    this.status.setAttribute("role", "status");
    setStyles(this.status, {
      gridColumn: "1 / -1", gridRow: "3", padding: "var(--size-4-2)", color: "var(--text-muted)"
    });
    this.graphTabs.refresh();
  }

  protected async onClose(): Promise<void> {
    this.finishResize(false);
    this.panel?.remove();
    this.resizeHandle?.remove();
    this.status?.remove();
    this.sourceAction?.remove();
    this.setLayout(false, false, true);
    await super.onClose();
    this.graphTabs.refresh();
  }

  renderGraphTab(notes: readonly GraphTabNote[], sourceStatus: string): void {
    if (this.sourceAction) this.graphTabs.updateSourceAction(this.leaf, this.sourceAction);
    const panel = this.panel;
    const status = this.status;
    if (!panel || !status) return;
    const path = this.file?.path;
    const entries = notes.map(note => [note.path, this.graphTabs.noteAvailability(note.path)] as const);
    const message = [sourceStatus, path ? "" : notes.length ? "No selected Markdown note is available" : "Graph source note unavailable"]
      .filter(Boolean).join(" · ");
    const graphPath = this.graphTabs.graphSourcePath(this.leaf);
    const signature = JSON.stringify([entries, path, message, graphPath]);
    if (signature === this.lastRender) return;
    this.lastRender = signature;
    const focused: Element | null = panel.ownerDocument.activeElement;
    const focusedPath = focused && panel.contains(focused) ? focused.getAttribute("data-note-path") : null;
    panel.empty();
    // A single unavailable selection still needs an identifiable entry.
    panel.hidden = entries.length < 2 && !entries.some(([, reason]) => !!reason);
    if (this.resize && (panel.hidden || this.resize.path !== graphPath)) this.finishResize(false);
    if (this.resizeHandle) this.resizeHandle.hidden = panel.hidden || !graphPath;
    status.hidden = !message;
    status.setText(message);
    this.setLayout(!panel.hidden, !status.hidden, !!path);
    if (panel.hidden) return;
    panel.createDiv({ text: "Selected notes", cls: "setting-item-name" });
    for (const [note, reason] of entries) {
      const name = note.split("/").pop()?.replace(/\.md$/i, "") ?? note;
      const button = panel.createEl("button", { attr: { type: "button", "data-note-path": note } });
      button.disabled = !!reason;
      button.title = reason ? `${note} · ${reason}` : note;
      if (note === path) {
        button.setAttribute("aria-current", "true");
        button.classList.add("mod-cta");
      }
      setStyles(button, {
        display: "block", height: "auto", width: "100%", textAlign: "start",
        overflowWrap: "anywhere", whiteSpace: "normal", marginBlockStart: "var(--size-4-1)"
      });
      button.createDiv({ text: name });
      const location = button.createEl("small", { text: reason ? `${note} · ${reason}` : note });
      setStyles(location, { opacity: "0.75" });
      button.addEventListener("click", () => this.graphTabs.chooseNote(this.leaf, note));
      if (focusedPath === note && !button.disabled) button.focus({ preventScroll: true });
    }
  }

  private setLayout(panel: boolean, status: boolean, hasFile: boolean): void {
    const grid = panel || status;
    setStyles(this.containerEl, {
      display: grid ? "grid" : null,
      gridTemplateColumns: panel ? this.panelColumns() : grid ? "minmax(0, 1fr)" : null,
      gridTemplateRows: grid ? "auto minmax(0, 1fr) auto" : null
    });
    if (this.header) setStyles(this.header, { gridColumn: grid ? "1 / -1" : null, gridRow: grid ? "1" : null });
    setStyles(this.contentEl, {
      gridColumn: grid ? "1" : null, gridRow: grid ? "2" : null, minWidth: grid ? "0" : null,
      visibility: hasFile ? null : "hidden"
    });
  }

  private panelColumns(width?: number): string {
    const path = this.graphTabs.graphSourcePath(this.leaf);
    const preferred = width ?? this.resize?.width ?? (path ? this.panelWidths.read(path) : undefined);
    const panelWidth = preferred === undefined ? "clamp(6rem, 32%, 17rem)" : `${preferred}px`;
    return `minmax(0, 1fr) 8px min(${panelWidth}, ${PANEL_WIDTH_LIMIT})`;
  }

  private applyPanelWidth(width?: number): void {
    if (this.panel?.hidden) return;
    setStyle(this.containerEl, "gridTemplateColumns", this.panelColumns(width));
    this.resizeHandle?.setAttribute("aria-valuenow", String(Math.round(width ?? this.panel?.getBoundingClientRect().width ?? 0)));
  }

  private mountResizeHandle(): void {
    const handle = this.containerEl.createDiv({ cls: "nosygraph-selected-notes-resize" });
    this.resizeHandle = handle;
    handle.hidden = true;
    handle.tabIndex = 0;
    handle.title = "Resize selected notes";
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-label", handle.title);
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("aria-valuemin", String(MIN_GRAPH_TAB_PANEL_WIDTH));
    handle.setAttribute("aria-valuemax", String(MAX_GRAPH_TAB_PANEL_WIDTH));
    setStyles(handle, {
      gridColumn: "2", gridRow: "2", cursor: "col-resize", touchAction: "none", userSelect: "none",
      borderInlineEnd: "1px solid var(--background-modifier-border)"
    });
    handle.addEventListener("focus", () => {
      if (this.panel) handle.setAttribute("aria-valuenow", String(Math.round(this.panel.getBoundingClientRect().width)));
    });
    handle.addEventListener("pointerdown", event => {
      const path = this.graphTabs.graphSourcePath(this.leaf);
      if (event.button !== 0 || this.resize || !path || !this.panel) return;
      const maximum = this.maximumPanelWidth();
      if (maximum < MIN_GRAPH_TAB_PANEL_WIDTH) return;
      const startWidth = this.panel.getBoundingClientRect().width;
      this.resize = {
        pointerId: event.pointerId, path, startX: event.clientX, startWidth, width: Math.round(startWidth),
        maximum, direction: this.panelDirection()
      };
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", event => {
      const resize = this.resize;
      if (!resize || resize.pointerId !== event.pointerId) return;
      const width = constrainGraphTabPanelWidth(resize.startWidth + (event.clientX - resize.startX) * resize.direction, resize.maximum);
      if (width === resize.width) return;
      resize.width = width;
      this.applyPanelWidth(width);
    });
    handle.addEventListener("pointerup", event => {
      if (this.resize?.pointerId === event.pointerId) this.finishResize(true);
    });
    const cancel = (event: PointerEvent) => {
      if (this.resize?.pointerId === event.pointerId) this.finishResize(false);
    };
    handle.addEventListener("pointercancel", cancel);
    handle.addEventListener("lostpointercapture", cancel);
    handle.addEventListener("keydown", event => {
      const delta = event.key === "ArrowLeft" ? -16 : event.key === "ArrowRight" ? 16 : 0;
      const path = this.graphTabs.graphSourcePath(this.leaf);
      if (!delta || !path || !this.panel || this.resize) return;
      const maximum = this.maximumPanelWidth();
      if (maximum < MIN_GRAPH_TAB_PANEL_WIDTH) return;
      event.preventDefault();
      event.stopPropagation();
      const current = this.panel.getBoundingClientRect().width;
      const width = constrainGraphTabPanelWidth(current + delta * this.panelDirection(), maximum);
      if (width !== Math.round(current)) this.savePanelWidth(path, width);
    });
  }

  private panelDirection(): number {
    return this.containerEl.ownerDocument.defaultView?.getComputedStyle(this.containerEl).direction === "rtl" ? 1 : -1;
  }

  private maximumPanelWidth(): number {
    const width = this.containerEl.getBoundingClientRect().width;
    return Math.max(width * 0.5, width - EDITOR_WIDTH_RESERVE);
  }

  private finishResize(save: boolean): void {
    const resize = this.resize;
    if (!resize) return;
    this.resize = undefined;
    if (this.resizeHandle?.hasPointerCapture(resize.pointerId)) this.resizeHandle.releasePointerCapture(resize.pointerId);
    if (save && resize.width !== Math.round(resize.startWidth) && resize.path === this.graphTabs.graphSourcePath(this.leaf)) {
      this.savePanelWidth(resize.path, resize.width);
    } else {
      this.applyPanelWidth();
    }
  }

  private savePanelWidth(path: string, width: number): void {
    this.applyPanelWidth(width);
    void this.panelWidths.save(path, width).catch(error => {
      console.error("[NosyGraph] Could not save selected-notes width", error);
      new Notice("Could not save the selected-notes width.");
    });
  }
}
