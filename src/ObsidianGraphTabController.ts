import { Menu, Notice, TFile, setTooltip, type App, type ItemView, type ViewState, type WorkspaceLeaf } from "obsidian";
import { BASES_GRAPH_VIEW, BasesGraphView, type GraphTabGraphReturn } from "./GraphView";
import { GRAPH_TAB_MARKDOWN_VIEW, GraphTabMarkdownView } from "./GraphTabMarkdownView";
import { graphTabLeafId, lookupGraphTabLeaf, resolveGraphTabLeaf } from "./ObsidianGraphTabIdentity";
import { GraphTabSourceRegistry } from "./graph-application/GraphTabSourceRegistry";
import {
  GraphTabTransitions, canLinkGraphTab, emptyGraphTabSelection, graphTabMarkdownTarget, graphTabRecord, readGraphTabSession,
  type GraphTabMode, type GraphTabSelection, type GraphTabSession
} from "./graph-application/GraphTabSession";

interface NativeNavigation {
  state: ViewState;
  ephemeral: unknown;
  path: string | null;
}

interface TabRuntime {
  session: GraphTabSession;
  mode: GraphTabMode;
  transitions: GraphTabTransitions;
  graphReturn?: GraphTabGraphReturn;
  consumedGraphReturn?: GraphTabGraphReturn;
  source?: { leaf: WorkspaceLeaf; path: string; selection: GraphTabSelection | null };
  sourceStatus: string;
  override?: string;
  native?: NativeNavigation;
  appliedState?: Record<string, unknown>;
  nativeHistory?: boolean;
  lastRequest?: string;
  layoutState: string;
  markdownMemory: Map<string, { state: Record<string, unknown>; ephemeral: unknown }>;
}

interface SourceSnapshot {
  leaf: WorkspaceLeaf;
  path: string;
  selection: GraphTabSelection | null;
}

type GraphTabLeafState = { path: string; type: string; session?: GraphTabSession };

export class ObsidianGraphTabController {
  private readonly tabs = new Map<WorkspaceLeaf, TabRuntime>();
  private readonly registry = new GraphTabSourceRegistry<WorkspaceLeaf>();
  private readonly surfaceKeys = new WeakMap<WorkspaceLeaf, symbol>();
  private readonly hooks = new Map<WorkspaceLeaf, () => void>();
  private readonly recentNotes = new Map<string, { leaf: WorkspaceLeaf; path: string; time: number }>();
  private scheduled = false;
  private disposed = false;

  constructor(private readonly app: App, private readonly isGraphCapable: (file: TFile) => boolean) {}

  isGraphTab(leaf: WorkspaceLeaf): boolean {
    if (this.tabs.get(leaf)?.appliedState) return true;
    const { type, state } = leaf.getViewState();
    return type === GRAPH_TAB_MARKDOWN_VIEW || type === BASES_GRAPH_VIEW && state?.graphTab === true;
  }

  graphSourcePath(leaf: WorkspaceLeaf): string | null {
    return this.readLeaf(leaf)?.session?.graphSourcePath ?? null;
  }

  sourceGroup(leaf: WorkspaceLeaf): string {
    return this.tabs.get(leaf)?.session.automaticGroup || this.group(leaf);
  }

  initializeView(leaf: WorkspaceLeaf, state: Record<string, unknown>, mode: GraphTabMode): GraphTabSession {
    const previous = this.tabs.get(leaf);
    if (previous && (previous.appliedState === state
      || graphTabRecord(state.graphTabSession).sessionId === previous.session.sessionId)) return previous.session;
    previous?.transitions.cancel();
    const newId = () => globalThis.crypto.randomUUID();
    const session = readGraphTabSession(state, mode, newId);
    if ([...this.tabs].some(([tab, entry]) => tab !== leaf && entry.session.sessionId === session.sessionId)) {
      session.sessionId = newId();
    }
    const runtime: TabRuntime = {
      session, mode, transitions: new GraphTabTransitions(), sourceStatus: "", layoutState: JSON.stringify(session),
      markdownMemory: new Map()
    };
    if (mode === "markdown" && session.activeMarkdownPath
      && session.activeMarkdownPath !== graphTabMarkdownTarget(session, path => !!this.markdownFile(path))) {
      runtime.override = session.activeMarkdownPath;
    }
    this.tabs.set(leaf, runtime);
    this.watchLeaf(leaf);
    this.refresh();
    return session;
  }

  viewState(leaf: WorkspaceLeaf, mode: GraphTabMode): Record<string, unknown> {
    const session = this.tabs.get(leaf)?.session;
    return { graphTab: true, ...(session && { graphTabSession: { ...session, mode } }) };
  }

  isApplying(leaf: WorkspaceLeaf, state: Record<string, unknown>): boolean {
    const applied = this.tabs.get(leaf)?.appliedState;
    return !!applied && (applied === state || applied.file === state.file
      && graphTabRecord(applied.graphTabSession).sessionId === graphTabRecord(state.graphTabSession).sessionId);
  }

  suppressHistory(leaf: WorkspaceLeaf, state: Record<string, unknown>): boolean {
    return this.isApplying(leaf, state) && !this.tabs.get(leaf)?.nativeHistory;
  }

  nativeFileLoaded(leaf: WorkspaceLeaf, path: string | null): void {
    const entry = this.tabs.get(leaf);
    if (!entry || entry.appliedState || entry.session.activeMarkdownPath === path) return;
    entry.session.activeMarkdownPath = path;
    entry.override = path ?? undefined;
    entry.lastRequest = undefined;
    this.refresh();
  }

  toggle(leaf: WorkspaceLeaf, mode?: GraphTabMode): void {
    const entry = this.tabs.get(leaf);
    if (!entry) return;
    entry.mode = mode ?? (entry.mode === "graph" ? "markdown" : "graph");
    entry.native = undefined;
    entry.lastRequest = undefined;
    this.refresh();
  }

  addHeaderActions(view: ItemView, mode: GraphTabMode): HTMLElement {
    const action = view.addAction(mode === "graph" ? "file-text" : "share-2",
      mode === "graph" ? "Switch to Markdown" : "Switch to graph",
      () => this.toggle(view.leaf));
    // Obsidian hides regular view headers in both sidebars.
    action.closest(".view-header")?.classList.add("view-header-always-show");
    action.setAttribute("aria-pressed", String(mode === "markdown"));
    action.setAttribute("aria-label", "Markdown mode");
    return view.addAction("link", "Graph Tab source", event => this.openSourceMenu(view.leaf, event));
  }

  updateSourceAction(leaf: WorkspaceLeaf, action: HTMLElement): void {
    const entry = this.tabs.get(leaf);
    if (!entry) return;
    const binding = entry.session.binding;
    const label = binding.kind === "linked"
      ? `Linked to ${binding.labelHint || "source tab"}` : "Automatic source";
    const title = entry.sourceStatus ? `${label} · ${entry.sourceStatus}` : label;
    setTooltip(action, title);
    action.setAttribute("aria-label", title);
    action.setAttribute("aria-pressed", String(binding.kind === "linked"));
    action.classList.toggle("is-active", binding.kind === "linked");
  }

  chooseNote(leaf: WorkspaceLeaf, path: string): void {
    const entry = this.tabs.get(leaf);
    if (!entry || !this.markdownFile(path) || !entry.session.selection.notes.some(note => note.path === path)) return;
    entry.override = path;
    entry.native = undefined;
    entry.lastRequest = undefined;
    this.refresh();
  }

  noteAvailability(path: string): string {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return "File unavailable";
    return file.extension === "md" ? "" : "Markdown file required";
  }

  observeActiveNote(leaf: WorkspaceLeaf | null, openedPath?: string): void {
    if (leaf && !this.isGraphTab(leaf)) {
      const path = this.readLeaf(leaf)?.path;
      const recent = this.recentNotes.get("");
      if (path && (!openedPath || openedPath === path && (recent?.leaf !== leaf || recent.path !== path))) {
        const note = { leaf, path, time: this.registry.markTime() };
        this.recentNotes.set("", note);
        const group = this.group(leaf);
        if (group) this.recentNotes.set(group, note);
      }
    }
    this.refresh();
  }

  graphSurfaceKey(leaf: WorkspaceLeaf): symbol {
    let key = this.surfaceKeys.get(leaf);
    if (!key) {
      key = Symbol();
      this.surfaceKeys.set(leaf, key);
    }
    return key;
  }

  publishGraph(leaf: WorkspaceLeaf, path: string, selection: GraphTabSelection | null, interacted: boolean): void {
    const entry = this.tabs.get(leaf);
    if (entry && selection && entry.session.graphSourcePath === path) entry.session.localSelection = selection;
    if (this.registry.publish(this.graphSurfaceKey(leaf), leaf, "graph", {
      ownerPath: path, graphPath: path, selection
    }, interacted)) this.refresh();
  }

  embedPublisher(key: symbol, container: HTMLElement): (graphPath: string, selection: GraphTabSelection, interacted: boolean) => void {
    let owner: WorkspaceLeaf | undefined;
    this.app.workspace.iterateAllLeaves(leaf => {
      if (leaf.view.containerEl.contains(container)) owner = leaf;
    });
    const leaf = owner;
    const ownerFile = leaf && this.markdownFile(this.embedOwnerPath(leaf) ?? null);
    return (graphPath, selection, interacted) => {
      if (!leaf || !ownerFile || this.embedOwnerPath(leaf) !== ownerFile.path) return;
      if (this.registry.publish(key, leaf, "embed", { ownerPath: ownerFile.path, graphPath, selection }, interacted)) this.refresh();
    };
  }

  removeEmbed(key: symbol): void {
    this.registry.remove(key);
    this.refresh();
  }

  takeGraphReturn(leaf: WorkspaceLeaf, path: string): GraphTabGraphReturn | undefined {
    const entry = this.tabs.get(leaf);
    if (!entry || entry.graphReturn?.path !== path || entry.consumedGraphReturn === entry.graphReturn) return;
    entry.consumedGraphReturn = entry.graphReturn;
    return entry.graphReturn;
  }

  localSelection(leaf: WorkspaceLeaf, path: string): GraphTabSelection | undefined {
    const session = this.tabs.get(leaf)?.session;
    return session?.graphSourcePath === path ? session.localSelection : undefined;
  }

  rename(oldPath: string, newPath: string): void {
    this.registry.rename(oldPath, newPath);
    const renamed = (path: string) => path === oldPath || path.startsWith(`${oldPath}/`)
      ? newPath + path.slice(oldPath.length) : path;
    const renameSelection = (selection: GraphTabSelection): GraphTabSelection => ({
      preferredPath: selection.preferredPath && renamed(selection.preferredPath),
      notes: selection.notes.map(note => ({
        path: renamed(note.path), instanceIds: note.instanceIds.map(renamed)
      }))
    });
    for (const recent of new Set(this.recentNotes.values())) recent.path = renamed(recent.path);
    for (const entry of this.tabs.values()) {
      const session = entry.session;
      if (session.graphSourcePath) session.graphSourcePath = renamed(session.graphSourcePath);
      if (session.activeMarkdownPath) session.activeMarkdownPath = renamed(session.activeMarkdownPath);
      session.selection = renameSelection(session.selection);
      session.localSelection = renameSelection(session.localSelection);
      if (entry.override) entry.override = renamed(entry.override);
      const memory = [...entry.markdownMemory];
      entry.markdownMemory.clear();
      for (const [path, state] of memory) entry.markdownMemory.set(renamed(path), state);
    }
    this.refresh();
  }

  refresh(): void {
    if (this.scheduled || this.disposed) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (!this.disposed && this.app.workspace.layoutReady) this.sync();
    });
  }

  dispose(): void {
    this.disposed = true;
    for (const entry of this.tabs.values()) entry.transitions.cancel();
    for (const off of this.hooks.values()) off();
    this.hooks.clear();
    this.tabs.clear();
    this.registry.prune(() => false);
    this.recentNotes.clear();
  }

  private sync(): void {
    const leaves = new Map<WorkspaceLeaf, GraphTabLeafState | null>();
    this.app.workspace.iterateAllLeaves(leaf => { leaves.set(leaf, this.readLeaf(leaf)); });
    const watched = new Set(this.tabs.keys());
    for (const info of leaves.values()) {
      const binding = info?.session?.binding;
      if (binding?.kind !== "linked" || binding.unavailable) continue;
      const source = resolveGraphTabLeaf(binding.sourceTabId, this.getLeaf);
      if (source && leaves.has(source)) watched.add(source);
    }
    for (const leaf of watched) if (leaves.has(leaf)) this.watchLeaf(leaf);
    for (const [leaf, off] of this.hooks) {
      if (leaves.has(leaf) && watched.has(leaf)) continue;
      off();
      this.hooks.delete(leaf);
    }
    this.registry.prune(surface => {
      const info = leaves.get(surface.tab);
      if (surface.kind === "embed") return !!info && this.embedOwnerPath(surface.tab) === surface.ownerPath;
      return info?.path === surface.ownerPath && (info.type === BASES_GRAPH_VIEW || info.type === GRAPH_TAB_MARKDOWN_VIEW);
    });
    for (const [group, note] of this.recentNotes) {
      if (!leaves.has(note.leaf)) this.recentNotes.delete(group);
    }
    for (const [leaf, entry] of this.tabs) {
      if (!leaves.has(leaf) || !entry.appliedState && !this.isGraphTab(leaf)) {
        entry.transitions.cancel();
        this.tabs.delete(leaf);
        continue;
      }
      this.isolateGroup(leaf, entry);
      void this.reconcile(leaf, entry, leaves);
    }
  }

  private watchLeaf(leaf: WorkspaceLeaf): void {
    if (this.hooks.has(leaf)) return;
    const original = leaf.setViewState;
    const own = Object.getOwnPropertyDescriptor(leaf, "setViewState");
    const originalOpen = leaf.openFile;
    const ownOpen = Object.getOwnPropertyDescriptor(leaf, "openFile");
    const wrapped = async (state: ViewState, ephemeral?: unknown): Promise<void> => {
      const entry = this.tabs.get(leaf);
      const file = state.state?.file ?? entry?.session.activeMarkdownPath ?? entry?.session.graphSourcePath;
      if (entry && !(entry.appliedState && entry.appliedState === state.state)
        && (state.type === "markdown" || state.type === GRAPH_TAB_MARKDOWN_VIEW)) {
        const path = typeof file === "string" && this.markdownFile(file) ? file : null;
        entry.mode = "markdown";
        entry.override = path ?? undefined;
        entry.native = { state, ephemeral, path };
        entry.lastRequest = undefined;
        await this.reconcile(leaf, entry);
        return;
      }
      await original.call(leaf, state, ephemeral);
      this.refresh();
    };
    const wrappedOpen: WorkspaceLeaf["openFile"] = (file, options) => {
      if (this.tabs.has(leaf) && file.extension === "md") {
        return wrapped({
          type: GRAPH_TAB_MARKDOWN_VIEW, state: { ...options?.state, file: file.path }, active: options?.active
        }, options?.eState);
      }
      return originalOpen.call(leaf, file, options);
    };
    leaf.setViewState = wrapped;
    if (typeof originalOpen === "function") leaf.openFile = wrappedOpen;
    this.hooks.set(leaf, () => {
      if (leaf.setViewState === wrapped) {
        if (own) Object.defineProperty(leaf, "setViewState", own);
        else Reflect.deleteProperty(leaf, "setViewState");
      }
      if (leaf.openFile === wrappedOpen) {
        if (ownOpen) Object.defineProperty(leaf, "openFile", ownOpen);
        else Reflect.deleteProperty(leaf, "openFile");
      }
    });
  }

  private readLeaf(leaf: WorkspaceLeaf): GraphTabLeafState | null {
    const { type, state } = leaf.getViewState();
    const entry = this.tabs.get(leaf);
    if (entry?.appliedState) {
      const mode = graphTabRecord(entry.appliedState.graphTabSession).mode;
      return { path: entry.session.graphSourcePath ?? "",
        type: mode === "markdown" ? GRAPH_TAB_MARKDOWN_VIEW : BASES_GRAPH_VIEW, session: entry.session };
    }
    if (type === GRAPH_TAB_MARKDOWN_VIEW || type === BASES_GRAPH_VIEW && state?.graphTab === true) {
      const session = entry?.session ?? readGraphTabSession(state ?? {},
        type === GRAPH_TAB_MARKDOWN_VIEW ? "markdown" : "graph", () => "");
      return { path: session.graphSourcePath ?? "", type, session };
    }
    const view = leaf.view as ItemView & { file?: unknown };
    const file = view.file instanceof TFile ? view.file.path : state?.file ?? state?.filePath;
    return typeof file === "string" && file ? { path: file, type } : null;
  }

  private embedOwnerPath(leaf: WorkspaceLeaf): string | undefined {
    const { type, state } = leaf.getViewState();
    if (type !== "markdown" && type !== GRAPH_TAB_MARKDOWN_VIEW) return;
    const view = leaf.view as ItemView & { file?: unknown };
    const file = view.file instanceof TFile ? view.file.path : state?.file;
    return typeof file === "string" ? file : undefined;
  }

  private markdownFile(path: string | null): TFile | null {
    const file = path ? this.app.vault.getAbstractFileByPath(path) : null;
    return file instanceof TFile && file.extension === "md" ? file : null;
  }

  private getLeaf = (id: string): WorkspaceLeaf | null => lookupGraphTabLeaf(this.app.workspace, id);

  private group(leaf: WorkspaceLeaf): string {
    const group: unknown = leaf.getViewState().group;
    return typeof group === "string" ? group : group ? graphTabLeafId(group as WorkspaceLeaf, this.getLeaf) ?? "" : "";
  }

  private isolateGroup(leaf: WorkspaceLeaf, entry: TabRuntime): void {
    const group = this.group(leaf);
    if (!group) return;
    // Workspace groups synchronize files both ways. Keep their automatic source filter,
    // while this follower's editor can navigate independently of its former group.
    entry.session.automaticGroup = group;
    leaf.setGroup("");
  }

  private sourceFor(leaf: WorkspaceLeaf, info: GraphTabLeafState): SourceSnapshot {
    const graph = info.type === BASES_GRAPH_VIEW;
    const surface = this.registry.forTab(leaf, info.path, graph ? "graph" : "embed");
    const selection = graph ? surface?.selection ?? (info.session?.localSelection ?? null)
      : info.session?.localSelection ?? surface?.selection ?? emptyGraphTabSelection;
    return { leaf, path: info.path, selection };
  }

  private checkLink(follower: WorkspaceLeaf, id: string): boolean {
    return canLinkGraphTab(graphTabLeafId(follower, this.getLeaf) ?? "", id, nextId => {
      const leaf = resolveGraphTabLeaf(nextId, this.getLeaf);
      const binding = leaf && this.readLeaf(leaf)?.session?.binding;
      return binding && binding.kind === "linked" ? binding.sourceTabId : undefined;
    });
  }

  private resolveSource(leaf: WorkspaceLeaf, entry: TabRuntime, leaves?: ReadonlyMap<WorkspaceLeaf, GraphTabLeafState | null>): SourceSnapshot | undefined {
    const { binding, automaticGroup } = entry.session;
    const read = (tab: WorkspaceLeaf) => leaves ? leaves.get(tab) : this.readLeaf(tab);
    entry.sourceStatus = "";
    if (binding.kind === "linked") {
      const target = !binding.unavailable && resolveGraphTabLeaf(binding.sourceTabId, this.getLeaf);
      const info = target && this.checkLink(leaf, binding.sourceTabId) && read(target);
      if (!target || !info) {
        if ((!target || leaves && !leaves.has(target)) && this.app.workspace.layoutReady) binding.unavailable = true;
        entry.sourceStatus = "Source tab unavailable";
        return;
      }
      if (!info.path) {
        entry.sourceStatus = "Source tab has no file";
        return;
      }
      binding.labelHint = info.path;
      return this.sourceFor(target, info);
    }

    const groupMatches = (tab: WorkspaceLeaf) => !automaticGroup
      || automaticGroup === (this.tabs.get(tab)?.session.automaticGroup || this.group(tab)) || tab === leaf;
    const graph = this.registry.automatic(surface => {
      if (!groupMatches(surface.tab)) return false;
      const info = read(surface.tab);
      return !!info && (surface.kind === "graph" ? info.path === surface.ownerPath
        : surface.tab !== leaf && this.embedOwnerPath(surface.tab) === surface.ownerPath);
    });
    const active = this.recentNotes.get(automaticGroup);
    const activeInfo = active && read(active.leaf);
    const activeFile = activeInfo && activeInfo.path === active?.path && this.markdownFile(activeInfo.path);
    const activeGraph = active && activeInfo && activeFile && groupMatches(active.leaf) && this.isGraphCapable(activeFile)
      ? { ...this.sourceFor(active.leaf, activeInfo), time: active.time } : undefined;
    if (graph && (!activeGraph || graph.interaction >= activeGraph.time
        || graph.tab === activeGraph.leaf && graph.ownerPath === activeGraph.path)) {
      return { leaf: graph.tab, path: graph.graphPath, selection: graph.selection };
    }
    return activeGraph;
  }

  private reconcile(leaf: WorkspaceLeaf, entry: TabRuntime, leaves?: ReadonlyMap<WorkspaceLeaf, GraphTabLeafState | null>): Promise<void> {
    const { session } = entry;
    const source = this.resolveSource(leaf, entry, leaves);
    if (source) {
      const contextChanged = source.path !== session.graphSourcePath || (entry.source
        ? source.leaf !== entry.source.leaf : session.binding.kind === "automatic");
      const selection = source.selection ?? (contextChanged ? emptyGraphTabSelection : session.selection);
      if ((contextChanged && entry.source) || JSON.stringify(selection) !== JSON.stringify(session.selection)) {
        if (!entry.native) entry.override = undefined;
      }
      if (source.path !== session.graphSourcePath) session.localSelection = emptyGraphTabSelection;
      entry.source = source;
      session.graphSourcePath = source.path;
      session.selection = selection;
    } else if (entry.source) {
      entry.source = undefined;
      if (session.binding.kind === "automatic") {
        session.selection = emptyGraphTabSelection;
        entry.override = undefined;
      }
    }

    const graphFile = this.markdownFile(session.graphSourcePath);
    const graphProblem = !graphFile ? "Graph source note unavailable"
      : !this.isGraphCapable(graphFile) ? "This source note has no NosyGraph graph" : "";
    const target = entry.native ? entry.native.path : entry.mode === "graph" ? graphFile?.path ?? null
      : entry.override && this.markdownFile(entry.override) ? entry.override
        : graphTabMarkdownTarget(session, path => !!this.markdownFile(path));
    const request = JSON.stringify([entry.mode, target, entry.mode === "graph" ? graphProblem : ""]);
    this.render(leaf, entry);
    this.saveLayout(entry);
    if (entry.lastRequest === request && !entry.native) return Promise.resolve();
    entry.lastRequest = request;
    const native = entry.native;
    entry.native = undefined;
    return entry.transitions.submit(async current => {
      try {
        await this.transition(leaf, entry, target, graphProblem, native, current);
      } catch (error) {
        if (!current() || this.tabs.get(leaf) !== entry || this.disposed) return;
        entry.mode = session.mode;
        entry.override = session.activeMarkdownPath ?? undefined;
        console.error("[NosyGraph] Graph Tab transition failed", error);
        new Notice("Graph Tab could not save or switch views.");
      }
    });
  }

  private async transition(leaf: WorkspaceLeaf, entry: TabRuntime, target: string | null, graphProblem: string,
    native: NativeNavigation | undefined, current: () => boolean): Promise<void> {
    const mode = entry.mode;
    const view = leaf.view;
    const session = entry.session;
    const currentFile = view instanceof GraphTabMarkdownView || view instanceof BasesGraphView ? view.file?.path ?? null : null;
    if (mode === "markdown" && view instanceof GraphTabMarkdownView && currentFile === target && !native
      || mode === "graph" && view instanceof BasesGraphView && currentFile === target && view.graphTabProblem === graphProblem) return;

    if (view instanceof GraphTabMarkdownView && (target !== currentFile || mode !== "markdown") && view.file) {
      await view.save();
      if (!current() || view !== leaf.view) return;
      if (currentFile) {
        entry.markdownMemory.delete(currentFile);
        entry.markdownMemory.set(currentFile, {
          state: view.getNativeState(), ephemeral: view.getEphemeralState()
        });
        if (entry.markdownMemory.size > 12) {
          const oldest = entry.markdownMemory.keys().next().value;
          if (oldest) entry.markdownMemory.delete(oldest);
        }
      }
    } else if (view instanceof BasesGraphView && !view.graphTabProblem && currentFile) {
      const captured = view.captureGraphTabReturn();
      if (!current() || view !== leaf.view) return;
      if (captured && session.graphSourcePath === captured.path) {
        entry.graphReturn = captured;
        entry.consumedGraphReturn = undefined;
        session.localSelection = captured.selection;
      }
    }

    if (!current() || view !== leaf.view || this.tabs.get(leaf) !== entry) return;
    const memory = target ? entry.markdownMemory.get(target) : undefined;
    const state = {
      ...(mode === "markdown" ? memory?.state ?? (view instanceof GraphTabMarkdownView ? view.getNativeState() : {}) : {}),
      ...native?.state.state,
      ...this.viewState(leaf, mode),
      file: target,
      ...(mode === "graph" && { graphTabProblem: graphProblem })
    };
    entry.appliedState = state;
    entry.nativeHistory = !!native;
    try {
      const outer = leaf.getViewState();
      // The state identity bypasses the native-navigation watcher for this transition.
      await leaf.setViewState({
        ...outer, ...native?.state, type: mode === "graph" ? BASES_GRAPH_VIEW : GRAPH_TAB_MARKDOWN_VIEW,
        state, active: native?.state.active ?? false, group: undefined
      }, native ? native.ephemeral : mode === "markdown" ? memory?.ephemeral ?? false : false);
      session.mode = mode;
      if (mode === "markdown") session.activeMarkdownPath = target;
    } finally {
      entry.appliedState = undefined;
      entry.nativeHistory = undefined;
    }
    this.render(leaf, entry);
    this.saveLayout(entry);
    this.refresh();
  }

  private render(leaf: WorkspaceLeaf, entry: TabRuntime): void {
    if (leaf.view instanceof GraphTabMarkdownView) {
      leaf.view.renderGraphTab(entry.session.selection.notes, entry.sourceStatus);
    } else if (leaf.view instanceof BasesGraphView && leaf.view.isGraphTab()) {
      leaf.view.renderGraphTabStatus(entry.sourceStatus);
    }
  }

  private saveLayout(entry: TabRuntime): void {
    const state = JSON.stringify(entry.session);
    if (entry.layoutState === state) return;
    entry.layoutState = state;
    void this.app.workspace.requestSaveLayout();
  }

  private openSourceMenu(leaf: WorkspaceLeaf, event: MouseEvent): void {
    const entry = this.tabs.get(leaf);
    if (!entry) return;
    const menu = new Menu();
    const binding = entry.session.binding;
    menu.addItem(item => item.setTitle(binding.kind === "linked" ? "Unlink and follow automatically" : "Automatic")
      .setIcon("unlink").setChecked(binding.kind === "automatic").onClick(() => {
        entry.session.binding = { kind: "automatic" };
        entry.session.selection = emptyGraphTabSelection;
        entry.source = undefined;
        entry.override = undefined;
        entry.lastRequest = undefined;
        this.refresh();
      }));
    menu.addSeparator();
    let position = 0;
    this.app.workspace.iterateAllLeaves(source => {
      ++position;
      const info = this.readLeaf(source);
      const id = graphTabLeafId(source, this.getLeaf);
      if (source === leaf || !info?.path || !id || !this.checkLink(leaf, id)) return;
      const label = `${info.path} · ${info.session ? "Graph Tab" : info.type} · Tab ${position}`;
      menu.addItem(item => item.setTitle(label).setIcon("link")
        .setChecked(binding.kind === "linked" && binding.sourceTabId === id).onClick(() => {
          entry.session.binding = { kind: "linked", sourceTabId: id, labelHint: info.path };
          entry.session.selection = emptyGraphTabSelection;
          entry.source = undefined;
          entry.override = undefined;
          entry.lastRequest = undefined;
          this.refresh();
        }));
    });
    menu.showAtMouseEvent(event);
  }
}
