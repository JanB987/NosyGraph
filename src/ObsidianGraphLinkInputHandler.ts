/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- NosyGraph parses Obsidian frontmatter, Bases data, and persisted graph JSON whose shapes are validated at runtime. */
import { Modal, Notice, TFile, type App } from "obsidian";
import type {
  GraphBadgeLinkInputRequest,
  GraphBadgeInputResult,
  GraphBadgeMembershipDestination,
  GraphBadgeMembershipItem,
  GraphLinkInputOrigin
} from "./graph-application/GraphLinkMutation";
import { setStyle } from "./domStyle";
import type { MatchGraphNodeClipboard } from "./GraphNodeClipboard";
import { getGraphMarkdownFile, readGraphNoteLinkPaste, type GraphNoteLinkPasteRow } from "./ObsidianGraphNoteLinkPaste";
import type { BadgeMembershipPlanner } from "./ObsidianGraphBadgeMembership";
import { BADGE_MEMBERSHIP_LABEL, type BadgeMembershipPreferencePort } from "./graph-application/BadgeMembershipPreference";
import type { BadgeInputEntry, BadgeMembershipOption } from "./graph-application/GraphBadgeInputSubmission";

type LinkInputItem =
  | { kind: "file"; file: TFile; score: number }
  | { kind: "create"; title: string; score: number };

type LinkInputRow = GraphNoteLinkPasteRow & { membership?: GraphBadgeMembershipItem };
type SubmitLinkInput = (entries: readonly BadgeInputEntry<TFile>[], origin: GraphLinkInputOrigin, membership: BadgeMembershipOption) => Promise<GraphBadgeInputResult>;

const pasteStatus: Record<GraphNoteLinkPasteRow["status"], string> = {
  ready: "Ready to add", missing: "Note missing", ambiguous: "Ambiguous link — use its full path",
  self: "Self-link", invalid: "Invalid link syntax", external: "External link", attachment: "Attachment",
  ignored: "Ignored text", added: "Added", "already-present": "Already present",
  failed: "Write failed — retry available", skipped: "Skipped — paste again to revalidate"
};

export class ObsidianGraphLinkInputHandler {
  constructor(
    private readonly app: App,
    private readonly matchClipboard: MatchGraphNodeClipboard,
    private readonly preference: BadgeMembershipPreferencePort,
    private readonly membership: BadgeMembershipPlanner | null,
    private readonly submit: SubmitLinkInput
  ) {}

  requestLinkInput(request: GraphBadgeLinkInputRequest): Promise<GraphBadgeInputResult> {
    return new Promise((resolve) => {
      const targetFile = getGraphMarkdownFile(this.app, request.target.path);
      const isCurrent = () => {
        try {
          return Boolean(targetFile && getGraphMarkdownFile(this.app, request.target.path) === targetFile
            && request.isCurrent());
        } catch (error) {
          console.error("[GraphLinkInput] Failed to verify the target or LinkType:", error);
          return false;
        }
      };
      const modal = new GraphLinkInputModal(this.app, request,
        (text, source) => readGraphNoteLinkPaste(this.app, text, request.target.path, this.matchClipboard, source),
        isCurrent, this.preference, this.membership, this.submit, resolve);
      modal.open();
    });
  }
}

class GraphLinkInputModal extends Modal {
  private inputEl!: HTMLInputElement;
  private listEl!: HTMLDivElement;
  private query = "";
  private items: LinkInputItem[] = [];
  private selectedIndex = 0;
  private rows?: LinkInputRow[];
  private origin: GraphLinkInputOrigin = "clipboard-batch";
  private controlsEl!: HTMLDivElement;
  private messageEl!: HTMLDivElement;
  private busy = false;
  private closed = false;
  private settled = false;
  private needsReopen = false;
  private lastResult: GraphBadgeInputResult = { added: [], removed: [], skipped: [] };
  private membershipToggle!: HTMLButtonElement;
  private destinationEl!: HTMLDivElement;
  private unsubscribePreference?: () => void;
  private destinations: GraphBadgeMembershipDestination[] = [];
  private selectedDestination?: GraphBadgeMembershipDestination;

  constructor(
    app: App,
    private readonly request: GraphBadgeLinkInputRequest,
    private readonly readPaste: (text: string, source?: "input-field") => GraphNoteLinkPasteRow[] | undefined,
    private readonly isCurrent: () => boolean,
    private readonly preference: BadgeMembershipPreferencePort,
    private readonly membership: BadgeMembershipPlanner | null,
    private readonly submit: SubmitLinkInput,
    private readonly finish: (result: GraphBadgeInputResult) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.modalEl.addClass("o3-graph-link-input-modal");

    const write = this.request.write;
    if (!write) {
      this.contentEl.createDiv({ text: "Adding links is unavailable for this badge. It has no valid write property." });
      return;
    }
    this.contentEl.createEl("h3", {
      text: this.membership ? `Link note under ${write.property}` : `Add notes to Lens through ${write.property}`
    });
    this.inputEl = this.contentEl.createEl("input", {
      type: "text",
      placeholder: "Type a note name..."
    });
    setStyle(this.inputEl, "width", "100%");
    setStyle(this.inputEl, "boxSizing", "border-box");
    setStyle(this.inputEl, "marginBottom", "8px");
    this.inputEl.setAttribute("aria-label", "Search for a note or paste note links");

    if (this.membership) this.mountMembershipControls();

    this.listEl = this.contentEl.createDiv();
    setStyle(this.listEl, "maxHeight", "320px");
    setStyle(this.listEl, "overflowY", "auto");
    this.messageEl = this.contentEl.createDiv({ attr: { role: "status" } });
    this.controlsEl = this.contentEl.createDiv();

    this.inputEl.addEventListener("beforeinput", (event) => {
      if (this.busy || this.needsReopen) event.preventDefault();
    });
    this.inputEl.addEventListener("input", (event) => {
      if (this.busy || this.needsReopen) {
        this.inputEl.value = "";
        return;
      }
      if ("isComposing" in event && event.isComposing) return;
      const inserted = "data" in event && typeof event.data === "string" ? event.data : "";
      if (inserted.length > 1 && inserted !== this.inputEl.value && this.stageLinks(inserted, "input-field")) return;
      this.syncInputValue();
    });
    this.inputEl.addEventListener("paste", (event) => this.handlePaste(event));
    this.contentEl.addEventListener("keydown", this.handleKeyDown);

    this.renderMembership();
    this.refreshItems();
    this.inputEl.focus();
  }

  onClose(): void {
    this.closed = true;
    this.unsubscribePreference?.();
    this.contentEl.removeEventListener("keydown", this.handleKeyDown);
    this.contentEl.empty();
    if (!this.busy) this.settle();
  }

  private settle(): void {
    if (this.settled) return;
    this.settled = true;
    this.finish(this.lastResult);
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.isComposing || event.target !== this.inputEl) return;
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat || this.busy || this.needsReopen) return;
      // Changes made without dispatching input still need a preview before submission.
      if (this.inputEl.value !== this.query && this.syncInputValue()) return;
      if (this.rows) void this.runSubmission();
      else {
        const item = this.items[this.selectedIndex];
        if (item) void this.chooseItem(item);
      }
      return;
    }
    if (this.rows || this.busy || this.needsReopen) return;
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
  };

  private handlePaste(event: ClipboardEvent): void {
    if (event.defaultPrevented) return;
    if (this.busy || this.needsReopen) {
      event.preventDefault();
      return;
    }
    const text = event.clipboardData?.getData("text/plain");
    if (text && (this.stageLinks(text) || this.rows)) event.preventDefault();
  }

  private syncInputValue(): boolean {
    const value = this.inputEl.value;
    if (this.stageLinks(value, "input-field")) return true;
    if (this.rows) {
      this.inputEl.value = "";
      return false;
    }
    this.query = value;
    this.selectedIndex = 0;
    this.refreshItems();
    return false;
  }

  private stageLinks(text: string, source?: "input-field"): boolean {
    if (!text) return false;
    let pasted: GraphNoteLinkPasteRow[] | undefined;
    try {
      pasted = this.readPaste(text, source);
    } catch (error) {
      this.inputEl.value = this.query;
      this.messageEl.setText("Could not preview the pasted note links.");
      console.error("[GraphLinkInput] Failed to preview pasted links:", error);
      return true;
    }
    if (!pasted) return false;
    if (this.rows && this.origin === "single-note-input") {
      this.inputEl.value = "";
      return true;
    }
    const rows = this.rows ?? [];
    for (const row of pasted) {
      const index = rows.findIndex((existing) => row.path
        ? existing.path === row.path
        : !existing.path && existing.text === row.text && existing.status === row.status);
      if (index < 0) rows.push(row);
      else if (row.status === "ready" && ["missing", "skipped", "failed"].includes(rows[index].status)) rows[index] = row;
    }
    this.rows = rows;
    this.origin = "clipboard-batch";
    this.query = this.inputEl.value = "";
    this.items = [];
    this.renderBatch();
    return true;
  }

  private mountMembershipControls(): void {
    this.membershipToggle = this.contentEl.createEl("button", { attr: { type: "button", "aria-label": BADGE_MEMBERSHIP_LABEL } });
    this.destinationEl = this.contentEl.createDiv({ attr: { role: "status" } });
    this.membershipToggle.addEventListener("click", () => {
      if (this.busy || this.closed) return;
      void this.preference.set(!this.preference.get().value).catch((error) => {
        console.error("[GraphLinkInput] Failed to save the membership preference:", error);
        new Notice("Could not save the graph membership preference.");
      });
    });
    let wasOn = this.preference.get().value;
    if (wasOn) this.refreshDestinations();
    this.unsubscribePreference = this.preference.subscribe(({ value }) => {
      const turnedOn = value && !wasOn;
      wasOn = value;
      if (this.busy) return;
      if (turnedOn) this.refreshDestinations();
      this.renderMembership();
      if (this.rows) this.renderBatch();
    });
  }

  private refreshDestinations(): void {
    if (!this.membership) return;
    this.destinations = this.membership.destinations();
    if (!this.selectedDestination && this.destinations.length === 1) {
      this.selectedDestination = this.destinations[0];
    }
  }

  private captureMembership(): BadgeMembershipOption | undefined {
    if (!this.membership) return { kind: "off" };
    const { value, saving } = this.preference.get();
    if (saving) return undefined;
    if (!value) return { kind: "off" };
    if (this.selectedDestination) return { kind: "destination", destination: this.selectedDestination };
    if (this.destinations.length > 1) return undefined;
    return { kind: "unavailable", reason: this.membership.unavailableReason };
  }

  private renderMembership(): void {
    if (!this.membership) return;
    const { value, saving } = this.preference.get();
    this.membershipToggle.setText(`${BADGE_MEMBERSHIP_LABEL} · ${value ? "On" : "Off"}`);
    this.membershipToggle.setAttribute("aria-pressed", String(value));
    this.membershipToggle.disabled = this.busy;
    this.destinationEl.empty();
    if (saving) this.destinationEl.createDiv({ text: "Saving membership preference…" });
    if (!value) {
      if (this.rows?.some((row) => this.hasPendingMembership(row))) {
        this.destinationEl.createDiv({ text: "Retry will skip unfinished graph membership." });
      }
      return;
    }
    const selected = this.selectedDestination;
    const available = selected && this.destinations.some(({ property }) => property === selected.property);
    if (selected) {
      const suffix = available ? "" : " (stale)";
      this.destinationEl.createDiv({ text: `${selected.ownerPath} → ${selected.property}${suffix}` });
    } else if (!this.destinations.length) {
      this.destinationEl.createDiv({ text: this.membership.unavailableReason });
    } else {
      this.destinationEl.createDiv({ text: "Choose one membership property before adding links." });
    }
    if (this.destinations.length > 1 || (this.destinations.length && !available)) {
      const select = this.destinationEl.createEl("select", { attr: { "aria-label": "Graph membership property" } });
      select.createEl("option", { text: "Choose a property", value: "" });
      for (const destination of this.destinations) {
        select.createEl("option", { text: `${destination.ownerPath} → ${destination.property}`, value: destination.property });
      }
      select.value = available ? selected.property : "";
      select.disabled = this.busy || this.needsReopen;
      select.addEventListener("change", () => {
        if (this.busy || this.needsReopen || !select.value) return;
        this.selectedDestination = this.destinations.find(({ property }) => property === select.value);
        this.renderMembership();
        if (this.rows) this.renderBatch();
        this.inputEl.focus();
      });
    }
  }

  private renderBatch(): void {
    this.listEl.empty();
    this.controlsEl.empty();
    this.inputEl.disabled = this.busy || this.needsReopen;
    this.inputEl.placeholder = this.origin === "clipboard-batch" ? "Paste more note links" : "Review the selected note";
    const write = this.request.write;
    const rows = this.rows ?? [];
    const count = rows.filter((row) => this.canSubmitRow(row)).length;
    this.messageEl.setText(this.needsReopen
      ? "The note or LinkType changed. Reopen the badge input to review it."
      : this.busy ? "Adding note links…"
        : write?.discoveryDirection === "incoming"
          ? `Selected notes will link to ${write.target.path} in their ${write.property} property.`
          : `Links will be added to ${write?.target.path} in its ${write?.property} property.`);
    for (const row of rows) {
      const element = this.listEl.createDiv();
      element.createDiv({ text: row.path ?? row.text });
      element.createDiv({ text: `${pasteStatus[row.status]}${row.reason ? ` · ${row.reason}` : ""}` });
      if (row.membership && row.membership.status !== "off") {
        const status = row.membership.status;
        const label = status === "added" ? "Graph membership added" : status === "already-present" ? "Graph membership already present"
          : status === "failed" ? "Link saved. Graph membership failed." : status === "stale" ? "Graph membership destination or note changed"
            : "Graph membership unavailable";
        element.createDiv({ text: `${label}${row.membership.reason ? ` · ${row.membership.reason}` : ""}` });
      }
      const remove = element.createEl("button", { text: "Remove", attr: { "aria-label": `Remove ${row.path ?? row.text}` } });
      remove.disabled = this.busy || this.needsReopen;
      remove.addEventListener("click", () => this.changeBatch(rows.filter((entry) => entry !== row)));
    }
    const clear = this.controlsEl.createEl("button", { text: "Clear" });
    clear.disabled = this.busy || this.needsReopen;
    clear.addEventListener("click", () => this.changeBatch([]));
    if (!count) return;
    const membershipOnly = rows.filter((row) => this.canSubmitRow(row)).every((row) => this.hasPendingMembership(row));
    const add = this.controlsEl.createEl("button", {
      text: membershipOnly ? (this.preference.get().value ? "Retry membership" : "Finish without membership")
        : count === 1 ? "Add 1 note" : `Add ${count} notes`,
      cls: "mod-cta"
    });
    add.disabled = this.busy || this.needsReopen || !this.captureMembership();
    add.addEventListener("click", () => { void this.runSubmission(); });
  }

  private changeBatch(rows: LinkInputRow[]): void {
    if (this.busy || this.needsReopen) return;
    this.rows = rows.length ? rows : undefined;
    if (this.rows) this.renderBatch();
    else {
      this.controlsEl.empty();
      this.messageEl.empty();
      this.inputEl.placeholder = "Type a note name...";
      this.selectedIndex = 0;
      this.refreshItems();
    }
    this.renderMembership();
    this.inputEl.focus();
  }

  private hasPendingMembership(row: LinkInputRow): boolean {
    return row.membership?.status === "failed" || row.membership?.status === "stale";
  }

  private canSubmitRow(row: LinkInputRow): boolean {
    return row.status === "ready" || row.status === "failed" || this.hasPendingMembership(row);
  }

  private recordResult(result: GraphBadgeInputResult): void {
    const previous = this.lastResult;
    const added = new Set([...previous.added, ...result.added]);
    const alreadyPresent = new Set([...(previous.alreadyPresent ?? []), ...(result.alreadyPresent ?? [])]);
    const attempted = new Set(result.selected ?? []);
    const membership = new Map([...(previous.membership?.items ?? []), ...(result.membership?.items ?? [])]
      .map((item) => [item.path, item]));
    this.lastResult = {
      ...result,
      selected: [...new Set([...(previous.selected ?? []), ...(result.selected ?? [])])],
      added: [...added],
      alreadyPresent: [...alreadyPresent].filter((path) => !added.has(path)),
      skipped: [...new Set([...previous.skipped, ...result.skipped])].filter((path) => !added.has(path)),
      failed: [...(previous.failed ?? []).filter(({ path }) => !attempted.has(path)), ...(result.failed ?? [])],
      changedFilePaths: [...new Set([...(previous.changedFilePaths ?? []), ...(result.changedFilePaths ?? [])])],
      ...(membership.size ? { membership: {
        destination: result.membership?.destination ?? previous.membership?.destination,
        items: [...membership.values()],
        changedFilePaths: [...new Set([...(previous.membership?.changedFilePaths ?? []), ...(result.membership?.changedFilePaths ?? [])])]
      } } : {})
    };
  }

  private async runSubmission(item?: LinkInputItem): Promise<void> {
    if (this.busy || this.closed || this.needsReopen || (!item && !this.rows?.some((row) => this.canSubmitRow(row)))) return;
    const option = this.captureMembership();
    if (!option) return;
    if (!this.isCurrent()) {
      this.needsReopen = true;
      this.inputEl.disabled = true;
      this.messageEl.setText("The note or LinkType changed. Reopen the badge input to review it.");
      if (this.rows) this.renderBatch();
      return;
    }
    this.busy = this.inputEl.disabled = true;
    this.renderMembership();
    if (this.rows) this.renderBatch();
    try {
      if (item) {
        const file = item.kind === "file" ? item.file : await this.createMarkdownFile(item.title);
        this.rows = [{ text: file.path, path: file.path, file, status: "ready" }];
        this.origin = "single-note-input";
        this.query = this.inputEl.value = "";
        if (!this.isCurrent()) {
          this.needsReopen = true;
          throw new Error("The target or LinkType changed.");
        }
      }
      const rows = this.rows ?? [];
      const pending = rows.filter((row) => this.canSubmitRow(row));
      const entries = pending.flatMap(({ path, file, status }) => path && file
        ? [{ path, file, relationshipComplete: status === "added" || status === "already-present" }] : []);
      const result = await this.submit(entries, this.origin, option);
      this.recordResult(result);
      this.applyResult(pending, result);
      if (!this.closed && rows.every((row) => !this.canSubmitRow(row) && (row.status === "added" || row.status === "already-present"))) this.close();
    } catch (error) {
      console.error("[GraphLinkInput] Failed to submit badge input:", error);
      new Notice(this.needsReopen ? "The note or LinkType changed. Reopen the badge input." : "Failed to save badge input.");
    } finally {
      this.busy = false;
      if (this.closed) this.settle();
      else {
        if (this.preference.get().value) this.refreshDestinations();
        this.inputEl.disabled = this.needsReopen;
        this.renderMembership();
        if (this.rows) this.renderBatch();
        this.inputEl.focus();
      }
    }
  }

  private applyResult(pending: LinkInputRow[], result: GraphBadgeInputResult): void {
    const added = new Set(result.added);
    const alreadyPresent = new Set(result.alreadyPresent);
    const failures = new Map(result.failed?.map((failure) => [failure.path, failure.reason]));
    const membership = new Map(result.membership?.items.map((item) => [item.path, item]));
    for (const row of pending) {
      if (!row.path) continue;
      if (row.status !== "added" && row.status !== "already-present") {
        row.status = added.has(row.path) ? "added" : alreadyPresent.has(row.path) ? "already-present"
          : failures.has(row.path) ? "failed" : "skipped";
        row.reason = failures.get(row.path);
        if (row.status === "skipped") row.reason = "Note changed or was deleted after preview";
      }
      row.membership = membership.get(row.path) ?? row.membership;
    }
    if ([...membership.values()].some(({ status }) => status === "failed" || status === "stale")) {
      new Notice("Badge links were saved. Some graph memberships could not be added.");
      return;
    }
    const membershipsAdded = [...membership.values()].filter(({ status }) => status === "added").length;
    const skipped = this.rows?.filter((row) => !["added", "already-present", "failed"].includes(row.status)).length ?? 0;
    const unavailable = [...membership.values()].filter(({ status }) => status === "unavailable").length;
    const summary = `${added.size} badge links added, ${alreadyPresent.size} already present, ${skipped} skipped, ${failures.size} failed.`;
    new Notice(`${summary}${membershipsAdded ? ` Added ${membershipsAdded} graph memberships.` : ""}${unavailable ? " Graph membership was unavailable for some notes." : ""}`);
  }

  private refreshItems(): void {
    const files = this.app.vault.getMarkdownFiles()
      .filter((file) => file.path !== this.request.target.path)
      .map((file) => {
        const score = this.scoreFile(file, this.query);
        return score === null ? null : { kind: "file" as const, file, score };
      })
      .filter((item) => item !== null)
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

  private async chooseItem(item: LinkInputItem): Promise<void> {
    if (this.busy || this.rows || this.closed || this.needsReopen) return;
    if (this.inputEl.value !== this.query) {
      this.syncInputValue();
      return;
    }
    await this.runSubmission(item);
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
      : `${this.getParentFolderPath(this.request.target.path)}${sanitized}`;
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

  private getItemTitle(item: LinkInputItem): string {
    return item.kind === "create" ? item.title : item.file.path;
  }

  private normalize(value: string): string {
    return String(value ?? "").trim().toLowerCase();
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- Re-enable dynamic-data lint rules after this module. */
