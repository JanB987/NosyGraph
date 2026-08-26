import { TFile } from "obsidian";

export interface O3GraphRuntimeExpansion {
  id: string;
  sourceNodeId: string;
  sourcePath: string;
  linkType: string;
  status: "expanded" | "collapsed";
  childrenExpansionIds: string[];
}

export type O3GraphNodeOrigin =
  | { kind: "root" }
  | { kind: "filter"; filterId?: string }
  | { kind: "expansion"; sourceNodeId: string; linkType: string; duplicate?: boolean };

export interface O3GraphRuntimeNode {
  noteId: string;
  runtimeId?: string;
  x?: number;
  y?: number;
  pinned?: boolean;
  origin?: O3GraphNodeOrigin;
  badges?: Record<string, "expanded" | "collapsed">;
}

export interface O3GraphRuntimeNodeSnapshot {
  nodeId: string;
  path: string;
  x: number;
  y: number;
  pinned: boolean;
  origin: O3GraphNodeOrigin;
  badges: Record<string, "expanded" | "collapsed">;
}

export interface O3GraphEmbeddedLensState {
  lensWidth?: number;
  lensHeight?: number;
  lensOffsetX?: number;
  lensOffsetY?: number;
  lensUserPositioned?: boolean;
  lensMaximized?: boolean;
  lensRestoreWidth?: number;
  lensRestoreHeight?: number;
  lensRestoreOffsetX?: number;
  lensRestoreOffsetY?: number;
  lensRestoreUserPositioned?: boolean;
  viewZoom?: number;
  viewPanX?: number;
  viewPanY?: number;
}

export interface O3GraphEmbeddedGraphState {
  graphPath: string;
  originNodeId: string;
  expanded: boolean;
  lens?: O3GraphEmbeddedLensState;
  embeddedGraphs?: O3GraphEmbeddedGraphState[];
}

export interface O3GraphRuntimeState {
  version: number;
  expansions?: O3GraphRuntimeExpansion[];
  pinned: Record<string, { x: number; y: number }>;
  viewport?: {
    zoom: number;
    x: number;
    y: number;
  };
  linkTypeMenu?: {
    width: number;
    height: number;
  };
  ui?: {
    linkTypeMenu?: {
      width: number;
      height: number;
    };
  };
  settings?: {
    layout?: string;
  };
  notes?: Record<string, { path: string }>;
  nodes?: Record<string, O3GraphRuntimeNode>;
  embeddedGraphs?: Record<string, O3GraphEmbeddedGraphState>;
}

export class O3GraphState {
  file: TFile;
  state: O3GraphRuntimeState;
  loadedFromGraphStateBlock = false;

  constructor(file: TFile) {
    this.file = file;
    this.state = {
      version: 2,
      expansions: [],
      pinned: {},
      linkTypeMenu: { width: 260, height: 360 }
    };
  }

  loadFromContent(content: string) {
    const blockRegex = /```o3graph\s*([\s\S]*?)```/m;
    const match = content.match(blockRegex);

    if (!match) {
      this.loadedFromGraphStateBlock = false;
      return;
    }

    try {
      const parsed = JSON.parse(match[1]);

      const parsedVersion = Number(parsed?.version);
      if (!(parsedVersion === 1 || parsedVersion === 2)) {
        this.loadedFromGraphStateBlock = false;
        return;
      }
      this.loadedFromGraphStateBlock = true;

      const legacyExpanded = Array.isArray(parsed.expanded)
        ? parsed.expanded
          .filter((entry: unknown): entry is [string, string] =>
            Array.isArray(entry) && entry.length === 2
          )
          .map(([source, linkType]) => [
            String(source ?? "").trim(),
            String(linkType ?? "").trim()
          ] as [string, string])
          .filter(([source, linkType]) => source.length > 0 && linkType.length > 0)
        : [];

      const legacyNodeSourceById = new Map<string, string>();
      if (Array.isArray(parsed.nodes)) {
        for (const item of parsed.nodes) {
          if (!item || typeof item !== "object") continue;
          const obj = item as Record<string, unknown>;
          const id = String(obj.id ?? "").trim();
          const source = String(obj.source ?? "").trim();
          if (!id || !source) continue;
          legacyNodeSourceById.set(id, source);
        }
      }

      const expansions = Array.isArray(parsed.expansions)
        ? parsed.expansions
          .map((item: unknown): O3GraphRuntimeExpansion | null => {
            if (!item || typeof item !== "object") return null;
            const obj = item as Record<string, unknown>;
            const id = String(obj.id ?? "").trim();
            const linkType = String(obj.linkType ?? "").trim().toLowerCase();
            const sourceNodeId = String(obj.sourceNodeId ?? obj.sourcePath ?? obj.source ?? "").trim();
            const sourcePath = String(
              obj.sourcePath
              ?? obj.source
              ?? legacyNodeSourceById.get(String(obj.sourceNodeId ?? "").trim())
              ?? ""
            ).trim();
            if (!id || !sourceNodeId || !sourcePath || !linkType) return null;
            const status = obj.status === "collapsed" ? "collapsed" : "expanded";
            const childrenExpansionIds = Array.isArray(obj.childrenExpansionIds)
              ? obj.childrenExpansionIds.map((c: unknown) => String(c ?? "").trim()).filter(Boolean)
              : [];
            return { id, sourceNodeId, sourcePath, linkType, status, childrenExpansionIds };
          })
          .filter((item): item is O3GraphRuntimeExpansion => Boolean(item))
        : [];

      const pinned = this.normalizePinned(parsed?.pinned);
      const linkTypeMenu = this.normalizeLinkTypeMenu(parsed?.linkTypeMenu ?? parsed?.ui?.linkTypeMenu);
      const settings = this.normalizeSettings(parsed?.settings);
      const notes = this.normalizeNotes(parsed?.notes);
      const nodes = this.normalizeNodes(parsed?.nodes);
      const embeddedGraphs = this.normalizeEmbeddedGraphs(parsed?.embeddedGraphs);

      this.state = {
        version: 2,
        pinned,
        ...(parsed.viewport && typeof parsed.viewport === "object"
          ? { viewport: parsed.viewport as { zoom: number; x: number; y: number } }
          : {}),
        expansions,
        ...(linkTypeMenu ? { linkTypeMenu, ui: { linkTypeMenu } } : {}),
        ...(settings ? { settings } : {}),
        ...(notes ? { notes } : {}),
        ...(nodes ? { nodes } : {}),
        ...(embeddedGraphs ? { embeddedGraphs } : {})
      };
      this.migrateLegacyExpandedToGraphModel(legacyExpanded);
      this.normalizeGraphModel();
    } catch (e) {
      console.error("Failed to parse o3graph block:", e);
    }
  }

  setExpansionStatus(
    sourceNodeIdRaw: string,
    sourcePathRaw: string,
    linkType: string,
    expanded: boolean,
    parentExpansionId: string | null
  ): boolean {
    const sourceNodeId = String(sourceNodeIdRaw ?? "").trim();
    const sourcePath = String(sourcePathRaw ?? "").trim() || this.sourcePathFromNodeId(sourceNodeId);
    const linkTypeName = String(linkType ?? "").trim().toLowerCase();
    const parentId = String(parentExpansionId ?? "").trim() || null;
    if (!sourceNodeId || !sourcePath || !linkTypeName) return false;

    const expansionId = this.expansionId(sourceNodeId, linkTypeName);
    const expansions = this.state.expansions ?? (this.state.expansions = []);
    let changed = false;

    if (!expanded) {
      const removedExpansionIds = this.getExpansionSubtreeIds(expansionId);
      if (removedExpansionIds.size === 0) {
        this.normalizeGraphModel();
        return true;
      }

      this.state.expansions = expansions
        .filter((candidate) => !removedExpansionIds.has(candidate.id))
        .map((candidate) => ({
          ...candidate,
          childrenExpansionIds: (candidate.childrenExpansionIds ?? [])
            .filter((childId) => !removedExpansionIds.has(childId))
        }));
      this.normalizeGraphModel();
      return true;
    }

    let expansion = expansions.find((e) => e.id === expansionId);
    if (!expansion) {
      expansion = {
        id: expansionId,
        sourceNodeId,
        sourcePath,
        linkType: linkTypeName,
        status: "expanded",
        childrenExpansionIds: []
      };
      expansions.push(expansion);
      changed = true;
    } else {
      if (expansion.sourceNodeId !== sourceNodeId) {
        expansion.sourceNodeId = sourceNodeId;
        changed = true;
      }
      if (expansion.sourcePath !== sourcePath) {
        expansion.sourcePath = sourcePath;
        changed = true;
      }
      if (expansion.linkType !== linkTypeName) {
        expansion.linkType = linkTypeName;
        changed = true;
      }
      if (expansion.status !== "expanded") {
        expansion.status = "expanded";
        changed = true;
      }
    }

    for (const candidate of expansions) {
      const before = candidate.childrenExpansionIds.length;
      candidate.childrenExpansionIds = candidate.childrenExpansionIds.filter((id) => id !== expansionId);
      if (candidate.childrenExpansionIds.length !== before) {
        changed = true;
      }
    }

    if (parentId) {
      const parent = expansions.find((e) => e.id === parentId);
      if (parent && !parent.childrenExpansionIds.includes(expansionId)) {
        parent.childrenExpansionIds.push(expansionId);
        changed = true;
      }
    }

    this.normalizeGraphModel();
    return changed;
  }

  renameNotePath(oldPathRaw: string, newPathRaw: string): boolean {
    const oldPath = String(oldPathRaw ?? "").trim();
    const newPath = String(newPathRaw ?? "").trim();
    if (!oldPath || !newPath || oldPath === newPath) return false;

    let changed = false;
    for (const note of Object.values(this.state.notes ?? {})) {
      if (String(note?.path ?? "").trim() !== oldPath) continue;
      note.path = newPath;
      changed = true;
    }

    for (const expansion of this.state.expansions ?? []) {
      if (String(expansion.sourcePath ?? "").trim() !== oldPath) continue;
      expansion.sourcePath = newPath;
      changed = true;
    }

    const pinned = this.state.pinned ?? {};
    if (pinned[oldPath]) {
      if (!pinned[newPath]) {
        pinned[newPath] = pinned[oldPath];
      }
      delete pinned[oldPath];
      changed = true;
    }

    const embeddedGraphs = this.state.embeddedGraphs ?? {};
    const renamedEmbeddedGraphs: NonNullable<O3GraphRuntimeState["embeddedGraphs"]> = {};
    for (const entry of Object.values(embeddedGraphs)) {
      if (!entry) continue;
      const wasRenamed = String(entry.graphPath ?? "").trim() === oldPath;
      const graphPath = wasRenamed ? newPath : entry.graphPath;
      const next = { ...entry, graphPath };
      const key = this.embeddedGraphKey(next.originNodeId, graphPath);
      renamedEmbeddedGraphs[key] = next;
      changed = changed || wasRenamed;
    }
    if (changed && Object.keys(embeddedGraphs).length > 0) {
      this.state.embeddedGraphs = renamedEmbeddedGraphs;
    }

    return changed;
  }

  listExpandedGraphEntries(): Array<{ sourceNodeId: string; sourcePath: string; linkType: string; id: string }> {
    this.annotateRuntimeNodeIds();
    return (this.state.expansions ?? [])
      .filter((e) => e.status === "expanded")
      .map((e) => ({
        sourceNodeId: this.runtimeNodeIdFromPersistedNodeId(String(e.sourceNodeId ?? "").trim()),
        sourcePath: String(e.sourcePath ?? "").trim(),
        linkType: String(e.linkType ?? "").trim().toLowerCase(),
        id: e.id
      }))
      .filter((e) => e.sourceNodeId.length > 0 && e.sourcePath.length > 0 && e.linkType.length > 0);
  }

  getExpansionParentId(expansionId: string): string | null {
    const id = String(expansionId ?? "").trim();
    if (!id) return null;
    for (const expansion of this.state.expansions ?? []) {
      if ((expansion.childrenExpansionIds ?? []).includes(id)) {
        return expansion.id;
      }
    }
    return null;
  }

  private getExpansionSubtreeIds(rootExpansionId: string): Set<string> {
    const root = String(rootExpansionId ?? "").trim();
    const expansions = this.state.expansions ?? [];
    const byId = new Map(expansions.map((expansion) => [expansion.id, expansion]));
    const subtree = new Set<string>();
    if (!root || !byId.has(root)) return subtree;

    const queue: string[] = [root];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (subtree.has(id)) continue;
      subtree.add(id);
      const expansion = byId.get(id);
      for (const childId of expansion?.childrenExpansionIds ?? []) {
        if (byId.has(childId) && !subtree.has(childId)) {
          queue.push(childId);
        }
      }
    }
    return subtree;
  }

  applyRuntimeNodeSnapshots(snapshots: O3GraphRuntimeNodeSnapshot[]): void {
    const previousNodes = this.state.nodes ?? {};
    const previousNotes = this.state.notes ?? {};
    const previousEmbeddedGraphs = Object.values(this.state.embeddedGraphs ?? {}).map((entry) => {
      const originNode = previousNodes[entry.originNodeId]
        ?? Object.values(previousNodes).find((node) =>
          String(node?.runtimeId ?? "").trim() === entry.originNodeId
        );
      return {
        entry,
        runtimeId: String(originNode?.runtimeId ?? entry.originNodeId ?? "").trim(),
        path: String(previousNotes[originNode?.noteId ?? ""]?.path ?? entry.graphPath ?? "").trim(),
        x: Number(originNode?.x),
        y: Number(originNode?.y)
      };
    });
    const normalizedSnapshots = snapshots
      .map((snapshot) => ({
        ...snapshot,
        nodeId: String(snapshot.nodeId ?? "").trim(),
        path: String(snapshot.path ?? "").trim()
      }))
      .filter((snapshot) => snapshot.nodeId.length > 0 && snapshot.path.length > 0);

    const noteIdsByPath = new Map<string, string>();
    const notes: NonNullable<O3GraphRuntimeState["notes"]> = {};
    for (const [noteId, note] of Object.entries(this.state.notes ?? {})) {
      const id = String(noteId ?? "").trim();
      const path = String(note?.path ?? "").trim();
      if (!id || !path || noteIdsByPath.has(path)) continue;
      noteIdsByPath.set(path, id);
    }

    let nextNoteIndex = this.getNextGeneratedNoteIndex(this.state.notes ?? {});
    const ensureNoteId = (path: string): string => {
      const existing = noteIdsByPath.get(path);
      if (existing) {
        notes[existing] = { path };
        return existing;
      }
      let noteId = `file_${nextNoteIndex++}`;
      while (notes[noteId]) {
        noteId = `file_${nextNoteIndex++}`;
      }
      noteIdsByPath.set(path, noteId);
      notes[noteId] = { path };
      return noteId;
    };

    const existingNodeIds = this.buildExistingNodeIdLookup(this.state.nodes ?? {}, this.state.notes ?? {});
    const nodes: NonNullable<O3GraphRuntimeState["nodes"]> = {};
    const pinned: Record<string, { x: number; y: number }> = {};
    const runtimeIdToPersistedNodeId = new Map<string, string>();
    const usedNodeIds = new Set<string>();
    let nextNodeIndex = this.getNextGeneratedNodeIndex(this.state.nodes ?? {});

    const ensureNodeId = (snapshot: O3GraphRuntimeNodeSnapshot): string => {
      const existingByRuntimeId = existingNodeIds.byRuntimeId.get(snapshot.nodeId);
      if (existingByRuntimeId && !usedNodeIds.has(existingByRuntimeId)) {
        usedNodeIds.add(existingByRuntimeId);
        runtimeIdToPersistedNodeId.set(snapshot.nodeId, existingByRuntimeId);
        return existingByRuntimeId;
      }

      const existingBySignature = existingNodeIds.bySignature.get(this.buildSnapshotSignature(snapshot, runtimeIdToPersistedNodeId));
      if (existingBySignature && !usedNodeIds.has(existingBySignature)) {
        usedNodeIds.add(existingBySignature);
        runtimeIdToPersistedNodeId.set(snapshot.nodeId, existingBySignature);
        return existingBySignature;
      }

      let nodeId = `node_${nextNodeIndex++}`;
      while (usedNodeIds.has(nodeId) || nodes[nodeId]) {
        nodeId = `node_${nextNodeIndex++}`;
      }
      usedNodeIds.add(nodeId);
      runtimeIdToPersistedNodeId.set(snapshot.nodeId, nodeId);
      return nodeId;
    };

    for (const snapshot of normalizedSnapshots) {
      ensureNodeId(snapshot);
    }

    for (const snapshot of normalizedSnapshots) {
      const noteId = ensureNoteId(snapshot.path);
      const badges = this.normalizeNodeBadges(snapshot.badges) ?? {};
      const nodeId = runtimeIdToPersistedNodeId.get(snapshot.nodeId) ?? snapshot.nodeId;
      const node: O3GraphRuntimeNode = {
        noteId,
        runtimeId: snapshot.nodeId,
        x: Number(snapshot.x),
        y: Number(snapshot.y),
        pinned: Boolean(snapshot.pinned),
        origin: this.normalizeRuntimeNodeOrigin(snapshot.origin, runtimeIdToPersistedNodeId) ?? { kind: "root" },
        ...(Object.keys(badges).length > 0 ? { badges } : {})
      };
      nodes[nodeId] = node;
      if (node.pinned && Number.isFinite(node.x) && Number.isFinite(node.y)) {
        pinned[nodeId] = { x: node.x!, y: node.y! };
      }
    }

    this.state.version = 2;
    this.state.notes = notes;
    this.state.nodes = nodes;
    this.state.pinned = pinned;
    this.state.expansions = [];
    if (previousEmbeddedGraphs.length > 0) {
      const claimedRuntimeIds = new Set<string>();
      const embeddedGraphs: NonNullable<O3GraphRuntimeState["embeddedGraphs"]> = {};
      for (const previous of previousEmbeddedGraphs) {
        const exact = normalizedSnapshots.find((snapshot) =>
          snapshot.nodeId === previous.runtimeId
          && !claimedRuntimeIds.has(snapshot.nodeId)
        );
        const fallback = exact ?? normalizedSnapshots
          .filter((snapshot) =>
            snapshot.path === previous.path
            && !claimedRuntimeIds.has(snapshot.nodeId)
          )
          .sort((a, b) => {
            if (!Number.isFinite(previous.x) || !Number.isFinite(previous.y)) {
              return a.nodeId.localeCompare(b.nodeId);
            }
            return Math.hypot(a.x - previous.x, a.y - previous.y)
              - Math.hypot(b.x - previous.x, b.y - previous.y);
          })[0];
        if (!fallback) continue;
        claimedRuntimeIds.add(fallback.nodeId);
        const graphPath = String(previous.entry.graphPath ?? "").trim();
        if (!graphPath) continue;
        embeddedGraphs[this.embeddedGraphKey(fallback.nodeId, graphPath)] = {
          originNodeId: fallback.nodeId,
          graphPath,
          expanded: true,
          ...(previous.entry.lens ? { lens: previous.entry.lens } : {}),
          ...(previous.entry.embeddedGraphs && previous.entry.embeddedGraphs.length > 0
            ? { embeddedGraphs: previous.entry.embeddedGraphs.map((child) => this.cloneEmbeddedGraphState(child)) }
            : {})
        };
      }
      this.state.embeddedGraphs = Object.keys(embeddedGraphs).length > 0
        ? embeddedGraphs
        : undefined;
    }
    this.normalizeGraphModel();
  }

  migrateToCurrentLayout(snapshots?: O3GraphRuntimeNodeSnapshot[]): void {
    if (Array.isArray(snapshots)) {
      this.applyRuntimeNodeSnapshots(snapshots);
      return;
    }
    this.state.version = 2;
    this.normalizeGraphModel();
  }

  pruneToCorePaths(corePathsRaw: Iterable<string>): boolean {
    this.normalizeGraphModel();

    const corePaths = new Set(
      Array.from(corePathsRaw ?? [])
        .map((path) => String(path ?? "").trim())
        .filter(Boolean)
    );
    const nodes = this.state.nodes ?? {};
    const notes = this.state.notes ?? {};
    const before = JSON.stringify({
      notes: this.state.notes ?? {},
      nodes: this.state.nodes ?? {},
      pinned: this.state.pinned ?? {},
      expansions: this.state.expansions ?? []
    });

    const pathByNodeId = new Map<string, string>();
    const nodeIdByRuntimeId = new Map<string, string>();
    for (const [nodeIdRaw, node] of Object.entries(nodes)) {
      const nodeId = String(nodeIdRaw ?? "").trim();
      if (!nodeId) continue;
      const path = String(notes[node.noteId]?.path ?? "").trim();
      if (path) {
        pathByNodeId.set(nodeId, path);
      }
      const runtimeId = String(node.runtimeId ?? "").trim();
      if (runtimeId) {
        nodeIdByRuntimeId.set(runtimeId, nodeId);
      }
    }

    const removedNodeIds = new Set<string>();
    const removedPaths = new Set<string>();
    const markRemoved = (nodeId: string): void => {
      const normalizedNodeId = String(nodeId ?? "").trim();
      if (!normalizedNodeId || removedNodeIds.has(normalizedNodeId)) return;
      removedNodeIds.add(normalizedNodeId);
      const path = pathByNodeId.get(normalizedNodeId);
      if (path) {
        removedPaths.add(path);
      }
    };

    for (const [nodeId, node] of Object.entries(nodes)) {
      const origin = this.normalizeNodeOrigin(node.origin) ?? { kind: "root" as const };
      if (origin.kind !== "root" && origin.kind !== "filter") continue;
      const path = pathByNodeId.get(nodeId);
      if (!path || !corePaths.has(path)) {
        markRemoved(nodeId);
      }
    }

    let changed = true;
    while (changed) {
      changed = false;
      for (const [nodeId, node] of Object.entries(nodes)) {
        if (removedNodeIds.has(nodeId)) continue;
        const origin = this.normalizeNodeOrigin(node.origin);
        if (origin?.kind !== "expansion") continue;
        const sourceNodeId = this.resolvePersistedSourceNodeId(origin.sourceNodeId, nodes, nodeIdByRuntimeId);
        const sourcePath = sourceNodeId
          ? pathByNodeId.get(sourceNodeId)
          : this.sourcePathFromNodeId(origin.sourceNodeId);
        if (!sourceNodeId || !nodes[sourceNodeId] || removedNodeIds.has(sourceNodeId) || (sourcePath && removedPaths.has(sourcePath))) {
          markRemoved(nodeId);
          changed = true;
        }
      }
    }

    if (removedNodeIds.size > 0) {
      const nextNodes: NonNullable<O3GraphRuntimeState["nodes"]> = {};
      for (const [nodeId, node] of Object.entries(nodes)) {
        if (!removedNodeIds.has(nodeId)) {
          nextNodes[nodeId] = node;
        }
      }
      this.state.nodes = nextNodes;
    }

    const remainingNodes = this.state.nodes ?? {};
    const usedNoteIds = new Set(
      Object.values(remainingNodes)
        .map((node) => String(node.noteId ?? "").trim())
        .filter(Boolean)
    );
    const nextNotes: NonNullable<O3GraphRuntimeState["notes"]> = {};
    for (const [noteId, note] of Object.entries(notes)) {
      if (usedNoteIds.has(noteId)) {
        nextNotes[noteId] = note;
      }
    }
    this.state.notes = nextNotes;

    const nextPinned: Record<string, { x: number; y: number }> = {};
    for (const [nodeId, value] of Object.entries(this.state.pinned ?? {})) {
      if (remainingNodes[nodeId]) {
        nextPinned[nodeId] = value;
      }
    }
    this.state.pinned = nextPinned;

    const remainingNodeIds = new Set(Object.keys(remainingNodes));
    this.state.expansions = (this.state.expansions ?? [])
      .filter((expansion) => remainingNodeIds.has(String(expansion.sourceNodeId ?? "").trim()))
      .map((expansion) => ({
        ...expansion,
        childrenExpansionIds: (expansion.childrenExpansionIds ?? [])
          .filter((id) => {
            const sourceNodeId = String((this.state.expansions ?? []).find((candidate) => candidate.id === id)?.sourceNodeId ?? "").trim();
            return sourceNodeId && remainingNodeIds.has(sourceNodeId);
          })
      }));

    this.normalizeGraphModel();
    const after = JSON.stringify({
      notes: this.state.notes ?? {},
      nodes: this.state.nodes ?? {},
      pinned: this.state.pinned ?? {},
      expansions: this.state.expansions ?? []
    });
    return before !== after;
  }

  toPersistedState(): Record<string, unknown> {
    this.normalizeGraphModel();
    return {
      version: 2,
      ...(this.state.viewport ? { viewport: this.state.viewport } : {}),
      ui: {
        ...(this.state.ui?.linkTypeMenu ? { linkTypeMenu: this.state.ui.linkTypeMenu } : {})
      },
      ...(this.state.settings ? { settings: this.state.settings } : {}),
      ...(this.state.embeddedGraphs && Object.keys(this.state.embeddedGraphs).length > 0
        ? { embeddedGraphs: this.state.embeddedGraphs }
        : {}),
      notes: this.state.notes ?? {},
      nodes: this.toPersistedNodes(this.state.nodes ?? {})
    };
  }

  setEmbeddedGraphExpansion(
    originNodeIdRaw: string,
    graphPathRaw: string,
    expanded: boolean,
    lens?: O3GraphEmbeddedLensState,
    parentChainRaw: O3GraphEmbeddedGraphState[] = []
  ): boolean {
    const originNodeId = String(originNodeIdRaw ?? "").trim();
    const graphPath = String(graphPathRaw ?? "").trim();
    if (!originNodeId || !graphPath) return false;
    const key = this.embeddedGraphKey(originNodeId, graphPath);
    const embeddedGraphs = this.state.embeddedGraphs ?? (this.state.embeddedGraphs = {});
    const parentChain = this.normalizeEmbeddedGraphChain(parentChainRaw);
    if (parentChain.length > 0) {
      return this.setNestedEmbeddedGraphExpansion(embeddedGraphs, parentChain, originNodeId, graphPath, expanded, lens);
    }
    if (!expanded) {
      if (!embeddedGraphs[key]) return false;
      delete embeddedGraphs[key];
      return true;
    }
    const current = embeddedGraphs[key];
    const normalizedLens = this.normalizeEmbeddedLens(lens);
    const next = {
      originNodeId,
      graphPath,
      expanded: true,
      ...(normalizedLens ? { lens: normalizedLens } : current?.lens ? { lens: current.lens } : {}),
      ...(current?.embeddedGraphs && current.embeddedGraphs.length > 0
        ? { embeddedGraphs: current.embeddedGraphs.map((child) => this.cloneEmbeddedGraphState(child)) }
        : {})
    };
    if (JSON.stringify(current ?? null) === JSON.stringify(next)) {
      return false;
    }
    embeddedGraphs[key] = next;
    return true;
  }

  listExpandedEmbeddedGraphs(): O3GraphEmbeddedGraphState[] {
    return Object.values(this.state.embeddedGraphs ?? {})
      .filter((entry) => entry?.expanded === true)
      .map((entry) => ({
        graphPath: String(entry.graphPath ?? "").trim(),
        originNodeId: String(entry.originNodeId ?? "").trim(),
        expanded: true,
        ...(entry.lens ? { lens: entry.lens } : {}),
        ...(entry.embeddedGraphs && entry.embeddedGraphs.length > 0
          ? { embeddedGraphs: entry.embeddedGraphs.map((child) => this.cloneEmbeddedGraphState(child)) }
          : {})
      }))
      .filter((entry) => entry.graphPath.length > 0 && entry.originNodeId.length > 0);
  }

  toRuntimeNodeSnapshots(): O3GraphRuntimeNodeSnapshot[] {
    this.normalizeGraphModel();
    const nodes = this.state.nodes ?? {};
    const notes = this.state.notes ?? {};
    this.annotateRuntimeNodeIds(nodes, notes);
    return Object.entries(nodes).flatMap(([nodeId, node]) => {
      const path = String(notes[node.noteId]?.path ?? "").trim();
      const runtimeId = String(node.runtimeId ?? nodeId ?? "").trim();
      if (!path || !runtimeId) return [];
      const normalizedOrigin = this.normalizeNodeOrigin(node.origin);
      const origin = normalizedOrigin?.kind === "expansion"
        ? {
            ...normalizedOrigin,
            sourceNodeId: this.resolveRuntimeSourceNodeId(
              normalizedOrigin.sourceNodeId,
              nodes,
              notes
            )
          }
        : normalizedOrigin ?? { kind: "root" as const };
      return [{
        nodeId: runtimeId,
        path,
        x: Number.isFinite(Number(node.x)) ? Number(node.x) : 0,
        y: Number.isFinite(Number(node.y)) ? Number(node.y) : 0,
        pinned: Boolean(node.pinned),
        origin,
        badges: this.normalizeNodeBadges(node.badges) ?? {}
      }];
    });
  }

  private resolveRuntimeSourceNodeId(
    sourceNodeIdRaw: string,
    nodes: NonNullable<O3GraphRuntimeState["nodes"]>,
    notes: NonNullable<O3GraphRuntimeState["notes"]>
  ): string {
    const sourceNodeId = String(sourceNodeIdRaw ?? "").trim();
    if (!sourceNodeId) return sourceNodeId;
    if (nodes[sourceNodeId]) {
      return this.runtimeNodeIdFromPersistedNodeId(sourceNodeId, nodes, notes);
    }
    const matchingNode = Object.values(nodes).find((node) =>
      String(node.runtimeId ?? "").trim() === sourceNodeId
    );
    return String(matchingNode?.runtimeId ?? sourceNodeId).trim();
  }

  addVisibleRoot(pathRaw: string): boolean {
    const path = String(pathRaw ?? "").trim();
    if (!path) return false;
    const snapshots = this.toRuntimeNodeSnapshots();
    if (snapshots.some((snapshot) => snapshot.path === path && snapshot.origin.kind === "root")) {
      return false;
    }
    const index = snapshots.length;
    snapshots.push({
      nodeId: path,
      path,
      x: (index % 4) * 90,
      y: Math.floor(index / 4) * 90,
      pinned: false,
      origin: { kind: "root" },
      badges: {}
    });
    this.applyRuntimeNodeSnapshots(snapshots);
    return true;
  }

  removeVisibleRoot(pathRaw: string): boolean {
    const path = String(pathRaw ?? "").trim();
    if (!path) return false;
    const snapshots = this.toRuntimeNodeSnapshots();
    const removedIds = new Set(
      snapshots
        .filter((snapshot) => snapshot.path === path && snapshot.origin.kind === "root")
        .map((snapshot) => snapshot.nodeId)
    );
    if (removedIds.size === 0) return false;
    let changed = true;
    while (changed) {
      changed = false;
      for (const snapshot of snapshots) {
        if (removedIds.has(snapshot.nodeId) || snapshot.origin.kind !== "expansion") continue;
        if (removedIds.has(snapshot.origin.sourceNodeId)) {
          removedIds.add(snapshot.nodeId);
          changed = true;
        }
      }
    }
    this.applyRuntimeNodeSnapshots(snapshots.filter((snapshot) => !removedIds.has(snapshot.nodeId)));
    const embeddedGraphs = this.state.embeddedGraphs ?? {};
    for (const [key, entry] of Object.entries(embeddedGraphs)) {
      if (removedIds.has(entry.originNodeId)) {
        delete embeddedGraphs[key];
      }
    }
    return true;
  }

  private embeddedGraphKey(originNodeId: string, graphPath: string): string {
    return `${encodeURIComponent(originNodeId)}::${encodeURIComponent(graphPath)}`;
  }

  private normalizeEmbeddedGraphs(raw: unknown): Record<string, O3GraphEmbeddedGraphState> | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const out: Record<string, O3GraphEmbeddedGraphState> = {};
    for (const [keyRaw, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const entry = value as Record<string, unknown>;
      const graphPath = String(entry.graphPath ?? "").trim();
      const originNodeId = String(entry.originNodeId ?? "").trim();
      if (!graphPath || !originNodeId || entry.expanded === false) continue;
      const key = String(keyRaw ?? "").trim() || this.embeddedGraphKey(originNodeId, graphPath);
      const lens = this.normalizeEmbeddedLens(entry.lens);
      out[key] = {
        graphPath,
        originNodeId,
        expanded: true,
        ...(lens ? { lens } : {}),
        ...(Array.isArray(entry.embeddedGraphs)
          ? {
              embeddedGraphs: entry.embeddedGraphs
                .map((child) => this.normalizeEmbeddedGraphEntry(child))
                .filter((child): child is O3GraphEmbeddedGraphState => Boolean(child))
            }
          : {})
      };
      if (out[key].embeddedGraphs?.length === 0) {
        delete out[key].embeddedGraphs;
      }
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }

  private normalizeEmbeddedGraphEntry(raw: unknown): O3GraphEmbeddedGraphState | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const entry = raw as Record<string, unknown>;
    const graphPath = String(entry.graphPath ?? "").trim();
    const originNodeId = String(entry.originNodeId ?? "").trim();
    if (!graphPath || !originNodeId || entry.expanded === false) return null;
    const lens = this.normalizeEmbeddedLens(entry.lens);
    const children = Array.isArray(entry.embeddedGraphs)
      ? entry.embeddedGraphs
        .map((child) => this.normalizeEmbeddedGraphEntry(child))
        .filter((child): child is O3GraphEmbeddedGraphState => Boolean(child))
      : [];
    return {
      graphPath,
      originNodeId,
      expanded: true,
      ...(lens ? { lens } : {}),
      ...(children.length > 0 ? { embeddedGraphs: children } : {})
    };
  }

  private normalizeEmbeddedGraphChain(raw: O3GraphEmbeddedGraphState[]): O3GraphEmbeddedGraphState[] {
    return (raw ?? [])
      .map((entry) => this.normalizeEmbeddedGraphEntry(entry))
      .filter((entry): entry is O3GraphEmbeddedGraphState => Boolean(entry));
  }

  private cloneEmbeddedGraphState(entry: O3GraphEmbeddedGraphState): O3GraphEmbeddedGraphState {
    return {
      graphPath: entry.graphPath,
      originNodeId: entry.originNodeId,
      expanded: true,
      ...(entry.lens ? { lens: { ...entry.lens } } : {}),
      ...(entry.embeddedGraphs && entry.embeddedGraphs.length > 0
        ? { embeddedGraphs: entry.embeddedGraphs.map((child) => this.cloneEmbeddedGraphState(child)) }
        : {})
    };
  }

  private setNestedEmbeddedGraphExpansion(
    roots: Record<string, O3GraphEmbeddedGraphState>,
    parentChain: O3GraphEmbeddedGraphState[],
    originNodeId: string,
    graphPath: string,
    expanded: boolean,
    lens?: O3GraphEmbeddedLensState
  ): boolean {
    let currentMap = roots;
    let parent: O3GraphEmbeddedGraphState | undefined;
    for (const parentEntry of parentChain) {
      const parentKey = this.embeddedGraphKey(parentEntry.originNodeId, parentEntry.graphPath);
      parent = currentMap[parentKey];
      if (!parent) return false;
      const children = parent.embeddedGraphs ?? (parent.embeddedGraphs = []);
      currentMap = Object.fromEntries(children.map((child) => [
        this.embeddedGraphKey(child.originNodeId, child.graphPath),
        child
      ]));
    }
    if (!parent) return false;
    const children = parent.embeddedGraphs ?? (parent.embeddedGraphs = []);
    const childIndex = children.findIndex((child) =>
      child.originNodeId === originNodeId && child.graphPath === graphPath
    );
    if (!expanded) {
      if (childIndex < 0) return false;
      children.splice(childIndex, 1);
      if (children.length === 0) delete parent.embeddedGraphs;
      return true;
    }
    const current = childIndex >= 0 ? children[childIndex] : undefined;
    const normalizedLens = this.normalizeEmbeddedLens(lens);
    const next: O3GraphEmbeddedGraphState = {
      originNodeId,
      graphPath,
      expanded: true,
      ...(normalizedLens ? { lens: normalizedLens } : current?.lens ? { lens: current.lens } : {}),
      ...(current?.embeddedGraphs && current.embeddedGraphs.length > 0
        ? { embeddedGraphs: current.embeddedGraphs.map((child) => this.cloneEmbeddedGraphState(child)) }
        : {})
    };
    if (JSON.stringify(current ?? null) === JSON.stringify(next)) return false;
    if (childIndex >= 0) {
      children[childIndex] = next;
    } else {
      children.push(next);
    }
    return true;
  }

  private normalizeEmbeddedLens(raw: unknown): O3GraphEmbeddedLensState | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const entry = raw as Record<string, unknown>;
    const out: O3GraphEmbeddedLensState = {};
    for (const key of [
      "lensWidth",
      "lensHeight",
      "lensOffsetX",
      "lensOffsetY",
      "lensRestoreWidth",
      "lensRestoreHeight",
      "lensRestoreOffsetX",
      "lensRestoreOffsetY",
      "viewZoom",
      "viewPanX",
      "viewPanY"
    ] as const) {
      const value = Number(entry[key]);
      if (Number.isFinite(value)) out[key] = value;
    }
    if (entry.lensUserPositioned === true) out.lensUserPositioned = true;
    if (entry.lensMaximized === true) out.lensMaximized = true;
    if (entry.lensRestoreUserPositioned === true) out.lensRestoreUserPositioned = true;
    return Object.keys(out).length > 0 ? out : undefined;
  }

  private expansionId(sourceNodeId: string, linkType: string): string {
    return `${String(sourceNodeId ?? "").trim()}::${String(linkType ?? "").trim().toLowerCase()}`;
  }

  private resolvePersistedSourceNodeId(
    sourceNodeIdRaw: string,
    nodes: NonNullable<O3GraphRuntimeState["nodes"]>,
    nodeIdByRuntimeId: Map<string, string>
  ): string | null {
    const sourceNodeId = String(sourceNodeIdRaw ?? "").trim();
    if (!sourceNodeId) return null;
    if (nodes[sourceNodeId]) return sourceNodeId;
    return nodeIdByRuntimeId.get(sourceNodeId) ?? null;
  }

  private toPersistedNodes(nodes: NonNullable<O3GraphRuntimeState["nodes"]>): NonNullable<O3GraphRuntimeState["nodes"]> {
    const out: NonNullable<O3GraphRuntimeState["nodes"]> = {};
    for (const [nodeId, node] of Object.entries(nodes)) {
      const { runtimeId: _runtimeId, ...persistedNode } = node;
      out[nodeId] = persistedNode;
    }
    return out;
  }

  private buildExistingNodeIdLookup(
    nodes: NonNullable<O3GraphRuntimeState["nodes"]>,
    notes: NonNullable<O3GraphRuntimeState["notes"]>
  ): {
    byRuntimeId: Map<string, string>;
    bySignature: Map<string, string>;
  } {
    const byRuntimeId = new Map<string, string>();
    const bySignature = new Map<string, string>();
    this.annotateRuntimeNodeIds(nodes, notes);

    for (const [nodeId, node] of Object.entries(nodes)) {
      const normalizedNodeId = String(nodeId ?? "").trim();
      if (!normalizedNodeId) continue;
      const runtimeId = String(node.runtimeId ?? "").trim();
      if (runtimeId) {
        byRuntimeId.set(runtimeId, this.toGeneratedNodeId(normalizedNodeId, byRuntimeId.size + 1));
      }
      const path = String(notes[node.noteId]?.path ?? "").trim();
      if (!path) continue;
      const signature = this.buildPersistedNodeSignature(nodeId, node, nodes, notes);
      if (signature && !bySignature.has(signature)) {
        bySignature.set(signature, this.toGeneratedNodeId(normalizedNodeId, bySignature.size + 1));
      }
    }

    return { byRuntimeId, bySignature };
  }

  private toGeneratedNodeId(existingNodeId: string, fallbackIndex: number): string {
    return /^node_\d+$/.test(existingNodeId) ? existingNodeId : `node_${Math.max(1, fallbackIndex)}`;
  }

  private buildSnapshotSignature(
    snapshot: O3GraphRuntimeNodeSnapshot,
    runtimeIdToPersistedNodeId: Map<string, string>
  ): string {
    const origin = snapshot.origin;
    if (origin?.kind === "expansion") {
      const sourceNodeId = runtimeIdToPersistedNodeId.get(origin.sourceNodeId) ?? origin.sourceNodeId;
      return [
        snapshot.path,
        "expansion",
        sourceNodeId,
        String(origin.linkType ?? "").trim().toLowerCase(),
        origin.duplicate === true ? "duplicate" : "single"
      ].join("|");
    }
    if (origin?.kind === "filter") {
      return [snapshot.path, "filter", String(origin.filterId ?? "").trim()].join("|");
    }
    return [snapshot.path, "root"].join("|");
  }

  private buildPersistedNodeSignature(
    nodeId: string,
    node: O3GraphRuntimeNode,
    nodes: NonNullable<O3GraphRuntimeState["nodes"]>,
    notes: NonNullable<O3GraphRuntimeState["notes"]>
  ): string | null {
    const path = String(notes[node.noteId]?.path ?? "").trim();
    if (!path) return null;
    const origin = node.origin;
    if (origin?.kind === "expansion") {
      return [
        path,
        "expansion",
        String(origin.sourceNodeId ?? "").trim() || this.runtimeNodeIdFromPersistedNodeId(String(nodeId ?? "").trim(), nodes, notes),
        String(origin.linkType ?? "").trim().toLowerCase(),
        origin.duplicate === true ? "duplicate" : "single"
      ].join("|");
    }
    if (origin?.kind === "filter") {
      return [path, "filter", String(origin.filterId ?? "").trim()].join("|");
    }
    return [path, "root"].join("|");
  }

  private normalizeRuntimeNodeOrigin(
    origin: O3GraphNodeOrigin,
    runtimeIdToPersistedNodeId: Map<string, string>
  ): O3GraphNodeOrigin | null {
    const normalized = this.normalizeNodeOrigin(origin);
    if (!normalized) return null;
    if (normalized.kind !== "expansion") return normalized;
    return {
      kind: "expansion",
      sourceNodeId: runtimeIdToPersistedNodeId.get(normalized.sourceNodeId) ?? normalized.sourceNodeId,
      linkType: normalized.linkType
    };
  }

  private migrateLegacyExpandedToGraphModel(legacyExpanded: [string, string][]): void {
    const expansions = this.state.expansions ?? (this.state.expansions = []);
    if (expansions.length > 0) return;
    for (const [source, linkType] of legacyExpanded) {
      const sourcePath = String(source ?? "").trim();
      const linkTypeName = String(linkType ?? "").trim().toLowerCase();
      if (!sourcePath || !linkTypeName) continue;
      const sourceNodeId = sourcePath;
      expansions.push({
        id: this.expansionId(sourceNodeId, linkTypeName),
        sourceNodeId,
        sourcePath,
        linkType: linkTypeName,
        status: "expanded",
        childrenExpansionIds: []
      });
    }
  }

  private normalizeGraphModel(): void {
    this.annotateRuntimeNodeIds();
    const expansions = this.state.expansions ?? (this.state.expansions = []);
    const expansionById = new Map<string, O3GraphRuntimeExpansion>();
    const visibleNodeIds = new Set(Object.keys(this.state.nodes ?? {}));
    for (const expansion of expansions) {
      const id = String(expansion.id ?? "").trim();
      const sourceNodeId = String(expansion.sourceNodeId ?? "").trim();
      const sourcePath = String(expansion.sourcePath ?? "").trim();
      const linkType = String(expansion.linkType ?? "").trim().toLowerCase();
      if (!id || !sourceNodeId || !sourcePath || !linkType) continue;
      if (expansion.status === "collapsed") continue;
      if (visibleNodeIds.size > 0 && !visibleNodeIds.has(sourceNodeId)) continue;
      const children = Array.isArray(expansion.childrenExpansionIds)
        ? expansion.childrenExpansionIds.map((c) => String(c ?? "").trim()).filter(Boolean)
        : [];
      if (!expansionById.has(id)) {
        expansionById.set(id, {
          id,
          sourceNodeId,
          sourcePath,
          linkType,
          status: "expanded",
          childrenExpansionIds: Array.from(new Set(children))
        });
      }
    }

    const validIds = new Set(expansionById.keys());
    for (const expansion of expansionById.values()) {
      expansion.childrenExpansionIds = expansion.childrenExpansionIds.filter((id) => validIds.has(id) && id !== expansion.id);
    }
    this.state.expansions = Array.from(expansionById.values());
    this.deriveExpansionsFromNodeBadges();

    const normalizedLinkTypeMenu = this.normalizeLinkTypeMenu(this.state.linkTypeMenu);
    if (normalizedLinkTypeMenu) {
      this.state.linkTypeMenu = normalizedLinkTypeMenu;
      this.state.ui = {
        ...(this.state.ui ?? {}),
        linkTypeMenu: normalizedLinkTypeMenu
      };
    } else {
      delete this.state.linkTypeMenu;
      if (this.state.ui) {
        delete this.state.ui.linkTypeMenu;
      }
    }
    this.syncPinnedFromNodes();
  }

  private deriveExpansionsFromNodeBadges(): void {
    const nodes = this.state.nodes;
    const notes = this.state.notes;
    if (!nodes || !notes) return;

    const expansions = [...(this.state.expansions ?? [])];
    const expansionsById = new Map(expansions.map((expansion) => [expansion.id, expansion]));
    for (const [nodeId, node] of Object.entries(nodes)) {
      const notePath = notes[node.noteId]?.path;
      if (!notePath) continue;
      for (const [linkType, status] of Object.entries(node.badges ?? {})) {
        if (status !== "expanded") continue;
        const normalizedLinkType = String(linkType ?? "").trim().toLowerCase();
        if (!normalizedLinkType) continue;
        const id = this.expansionId(nodeId, normalizedLinkType);
        if (!expansionsById.has(id)) {
          expansionsById.set(id, {
            id,
            sourceNodeId: nodeId,
            sourcePath: notePath,
            linkType: normalizedLinkType,
            status: "expanded",
            childrenExpansionIds: []
          });
        }
      }
    }

    for (const [nodeId, node] of Object.entries(nodes)) {
      if (node.origin?.kind !== "expansion") continue;
      const parentId = this.expansionId(node.origin.sourceNodeId, node.origin.linkType);
      const parent = expansionsById.get(parentId);
      if (!parent) continue;
      for (const [linkType, status] of Object.entries(node.badges ?? {})) {
        if (status !== "expanded") continue;
        const childId = this.expansionId(nodeId, linkType);
        if (expansionsById.has(childId) && !parent.childrenExpansionIds.includes(childId)) {
          parent.childrenExpansionIds.push(childId);
        }
      }
    }

    this.state.expansions = Array.from(expansionsById.values());
  }

  private syncPinnedFromNodes(): void {
    const nodes = this.state.nodes;
    if (!nodes || Object.keys(nodes).length === 0) return;
    const pinned: Record<string, { x: number; y: number }> = {};
    for (const [nodeId, node] of Object.entries(nodes)) {
      if (!node?.pinned) continue;
      const x = Number(node.x);
      const y = Number(node.y);
      const id = String(nodeId ?? "").trim();
      if (!id || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      pinned[id] = { x, y };
    }
    this.state.pinned = pinned;
  }

  private normalizeLinkTypeMenu(raw: unknown): { width: number; height: number } | null {
    if (!raw || typeof raw !== "object") return null;
    const obj = raw as Record<string, unknown>;
    const width = Number(obj.width);
    const height = Number(obj.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    return {
      width: Math.max(220, Math.min(900, Math.round(width))),
      height: Math.max(180, Math.min(900, Math.round(height)))
    };
  }

  private normalizePinned(raw: unknown): Record<string, { x: number; y: number }> {
    if (!raw || typeof raw !== "object") return {};
    const out: Record<string, { x: number; y: number }> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const obj = value as Record<string, unknown>;
      const x = Number(obj.x);
      const y = Number(obj.y);
      const id = String(key ?? "").trim();
      if (!id || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      out[id] = { x, y };
    }
    return out;
  }

  private normalizeSettings(raw: unknown): O3GraphRuntimeState["settings"] | null {
    if (!raw || typeof raw !== "object") return null;
    const obj = raw as Record<string, unknown>;
    const layout = String(obj.layout ?? "").trim();
    return layout ? { layout } : null;
  }

  private normalizeNotes(raw: unknown): O3GraphRuntimeState["notes"] | null {
    if (!raw || typeof raw !== "object") return null;
    const out: NonNullable<O3GraphRuntimeState["notes"]> = {};
    for (const [noteId, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const path = String((value as Record<string, unknown>).path ?? "").trim();
      const id = String(noteId ?? "").trim();
      if (!id || !path) continue;
      out[id] = { path };
    }
    return Object.keys(out).length > 0 ? out : null;
  }

  private normalizeNodes(raw: unknown): O3GraphRuntimeState["nodes"] | null {
    if (!raw || typeof raw !== "object") return null;
    const out: NonNullable<O3GraphRuntimeState["nodes"]> = {};
    for (const [nodeId, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const obj = value as Record<string, unknown>;
      const noteId = String(obj.noteId ?? obj.noteID ?? "").trim();
      const id = String(nodeId ?? "").trim();
      if (!id || !noteId) continue;
      const x = Number(obj.x);
      const y = Number(obj.y);
      const origin = this.normalizeNodeOrigin(obj.origin);
      const badges = this.normalizeNodeBadges(obj.badges);
      out[id] = {
        noteId,
        ...(Number.isFinite(x) ? { x } : {}),
        ...(Number.isFinite(y) ? { y } : {}),
        ...(typeof obj.pinned === "boolean" ? { pinned: obj.pinned } : {}),
        ...(origin ? { origin } : {}),
        ...(badges ? { badges } : {})
      };
    }
    return Object.keys(out).length > 0 ? out : null;
  }

  private normalizeNodeOrigin(raw: unknown): O3GraphNodeOrigin | null {
    if (!raw || typeof raw !== "object") return null;
    const obj = raw as Record<string, unknown>;
    const kind = String(obj.kind ?? "").trim();
    if (kind !== "root" && kind !== "filter" && kind !== "expansion") return null;
    const sourceNodeId = String(obj.sourceNodeId ?? "").trim();
    const linkType = String(obj.linkType ?? "").trim().toLowerCase();
    const filterId = String(obj.filterId ?? "").trim();
    if (kind === "root") return { kind };
    if (kind === "filter") {
      return { kind, ...(filterId ? { filterId } : {}) };
    }
    if (!sourceNodeId || !linkType) return null;
    return {
      kind,
      sourceNodeId,
      linkType,
      ...(obj.duplicate === true ? { duplicate: true } : {})
    };
  }

  private normalizeNodeBadges(raw: unknown): Record<string, "expanded" | "collapsed"> | null {
    if (!raw || typeof raw !== "object") return null;
    const out: Record<string, "expanded" | "collapsed"> = {};
    for (const [linkType, value] of Object.entries(raw as Record<string, unknown>)) {
      const key = String(linkType ?? "").trim().toLowerCase();
      if (!key) continue;
      out[key] = value === "expanded" ? "expanded" : "collapsed";
    }
    return Object.keys(out).length > 0 ? out : null;
  }

  private annotateRuntimeNodeIds(
    nodes: NonNullable<O3GraphRuntimeState["nodes"]> = this.state.nodes ?? {},
    notes: NonNullable<O3GraphRuntimeState["notes"]> = this.state.notes ?? {}
  ): void {
    const visiting = new Set<string>();
    for (const nodeId of Object.keys(nodes)) {
      const node = nodes[nodeId];
      if (!node) continue;
      node.runtimeId = this.runtimeNodeIdFromPersistedNodeId(nodeId, nodes, notes, visiting);
    }
  }

  private runtimeNodeIdFromPersistedNodeId(
    nodeId: string,
    nodes: NonNullable<O3GraphRuntimeState["nodes"]> = this.state.nodes ?? {},
    notes: NonNullable<O3GraphRuntimeState["notes"]> = this.state.notes ?? {},
    visiting: Set<string> = new Set<string>()
  ): string {
    const id = String(nodeId ?? "").trim();
    if (!id) return "";
    const node = nodes[id];
    if (!node) return id;

    const path = String(notes[node.noteId]?.path ?? "").trim();
    if (!path) return id;
    if (visiting.has(id)) return path;

    const origin = node.origin;
    if (origin?.kind !== "expansion") return path;

    visiting.add(id);
    const sourceRuntimeId = this.runtimeNodeIdFromPersistedNodeId(origin.sourceNodeId, nodes, notes, visiting);
    visiting.delete(id);
    if (!sourceRuntimeId) return path;
    const sameNoteCount = Object.values(nodes).filter((candidate) => candidate.noteId === node.noteId).length;
    if (origin.duplicate !== true && sameNoteCount <= 1) return path;
    return this.duplicateRuntimeNodeId(sourceRuntimeId, path, origin.linkType);
  }

  private duplicateRuntimeNodeId(sourceNodeId: string, targetPath: string, linkType: string): string {
    const from = encodeURIComponent(String(sourceNodeId ?? "").trim());
    const to = encodeURIComponent(String(targetPath ?? "").trim());
    const type = encodeURIComponent(String(linkType ?? "").trim().toLowerCase());
    return `__o3dup__::${to}::${from}::${type}`;
  }

  private sourcePathFromNodeId(sourceNodeId: string): string {
    const raw = String(sourceNodeId ?? "").trim();
    if (!raw.startsWith("__o3dup__::")) return raw;
    const parts = raw.split("::");
    if (parts.length < 4) return raw;
    try {
      return decodeURIComponent(parts[1] ?? "").trim() || raw;
    } catch {
      return raw;
    }
  }

  private getNextGeneratedNoteIndex(notes: NonNullable<O3GraphRuntimeState["notes"]>): number {
    let max = 0;
    for (const noteId of Object.keys(notes)) {
      const match = /^file_(\d+)$/.exec(noteId);
      if (!match) continue;
      max = Math.max(max, Number(match[1]));
    }
    return max + 1;
  }

  private getNextGeneratedNodeIndex(nodes: NonNullable<O3GraphRuntimeState["nodes"]>): number {
    let max = 0;
    for (const nodeId of Object.keys(nodes)) {
      const match = /^node_(\d+)$/.exec(nodeId);
      if (!match) continue;
      max = Math.max(max, Number(match[1]));
    }
    return max + 1;
  }
}
