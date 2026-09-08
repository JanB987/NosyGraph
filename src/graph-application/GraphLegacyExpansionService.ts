export interface GraphLegacyExpansionNode {
  id: string;
}

export interface GraphLegacyExpansionTarget {
  path: string;
  label: string;
  missing: boolean;
}

export interface GraphLegacyExpansionToggleEvent {
  sourceNodeId: string;
  sourcePath: string;
  linkType: string;
  expanded: boolean;
  expansionId: string;
  parentExpansionId: string | null;
}

export interface GraphLegacyExpansionServiceOptions<TNode extends GraphLegacyExpansionNode, TFile> {
  expandedByBadge: Map<string, Set<string>>;
  expansionNodes: Map<string, Set<string>>;
  nodeOwners: Map<string, Set<string>>;
  expansionParent: Map<string, string | null>;
  rootFilePaths: ReadonlySet<string>;
  getFile(source: TFile | string): TFile | undefined;
  getSourcePath(file: TFile): string;
  resolveTargets(file: TFile, property: string): readonly GraphLegacyExpansionTarget[];
  getNode(nodeId: string): TNode | undefined;
  ensureTarget(
    target: GraphLegacyExpansionTarget,
    sourceNodeId: string,
    property: string,
    anchorNode: TNode | null,
    preferExistingVisibleTarget: boolean
  ): string;
  isVisibleLinkType(property: string): boolean;
  isDuplicateNodesEnabled(property: string): boolean;
  addCurrentFile(path: string): void;
  removeCurrentFileIfUnowned(path: string): void;
  getHoveredExpansionKey(): string | null;
  clearHoveredExpansion(): void;
  refreshHoveredHighlightNodes(): void;
  reconcileCurrentFilesFromVisibleState(): void;
  getCurrentFiles(): TFile[];
  setLastFiles(files: TFile[]): void;
  rebuildEdges(): void;
  onToggle?(event: GraphLegacyExpansionToggleEvent): void;
}

/**
 * Applies legacy expansion ownership and collapse ordering behind a runtime
 * port. It contains no Obsidian API calls and no renderer or physics state.
 */
export class GraphLegacyExpansionService<TNode extends GraphLegacyExpansionNode, TFile> {
  constructor(private readonly options: GraphLegacyExpansionServiceOptions<TNode, TFile>) {}

  toggle(
    sourceFile: TFile | string,
    linkTypeName: string,
    settings: { persist?: boolean; sourceNodeId?: string } = {}
  ): void {
    const persist = settings.persist !== false;
    const source = this.options.getFile(sourceFile);
    if (!source) return;

    const property = String(linkTypeName ?? "").trim().toLowerCase();
    if (!property) return;
    const expansionSourceNodeId = String(settings.sourceNodeId ?? "").trim() || this.options.getSourcePath(source);
    const badgeKey = `${expansionSourceNodeId}::${property}`;
    let changed = false;
    let toggleEvent: GraphLegacyExpansionToggleEvent | null = null;

    if (this.options.expandedByBadge.has(badgeKey)) {
      const subtree = this.getExpansionSubtree(badgeKey);
      const adjacency = new Map<string, Set<string>>();
      for (const key of subtree) adjacency.set(key, new Set<string>());
      for (const [child, parent] of this.options.expansionParent.entries()) {
        if (!parent || !subtree.has(child) || !subtree.has(parent)) continue;
        adjacency.get(parent)?.add(child);
      }
      const depthMap = new Map<string, number>([[badgeKey, 0]]);
      const queue: string[] = [badgeKey];
      while (queue.length > 0) {
        const current = queue.shift()!;
        const currentDepth = depthMap.get(current) ?? 0;
        for (const child of adjacency.get(current) ?? []) {
          if (!depthMap.has(child)) {
            depthMap.set(child, currentDepth + 1);
            queue.push(child);
          }
        }
      }
      const collapseOrder = Array.from(subtree).sort((left, right) =>
        (depthMap.get(right) ?? 0) - (depthMap.get(left) ?? 0)
      );

      for (const subKey of collapseOrder) {
        for (const nodePath of this.options.expansionNodes.get(subKey) ?? []) {
          const owners = this.options.nodeOwners.get(nodePath);
          if (!owners) continue;
          owners.delete(subKey);
          if (owners.size === 0) {
            this.options.nodeOwners.delete(nodePath);
            if (!this.options.rootFilePaths.has(nodePath)) {
              this.options.removeCurrentFileIfUnowned(nodePath);
            }
          }
        }
        this.options.expansionNodes.delete(subKey);
        this.options.expandedByBadge.delete(subKey);
        this.options.expansionParent.delete(subKey);
      }
      if (subtree.has(this.options.getHoveredExpansionKey() ?? "")) {
        this.options.clearHoveredExpansion();
      }
      changed = true;
    } else {
      const targets = this.options.resolveTargets(source, property);
      const targetPaths = new Set<string>();
      const expansionNodes = this.options.expansionNodes.get(badgeKey) ?? new Set<string>();
      this.options.expansionNodes.set(badgeKey, expansionNodes);
      if (!this.options.expansionParent.has(badgeKey)) {
        let parentKey: string | null = null;
        if (!this.options.rootFilePaths.has(expansionSourceNodeId)) {
          const owners = this.options.nodeOwners.get(expansionSourceNodeId);
          parentKey = owners ? Array.from(owners).sort((left, right) => left.localeCompare(right))[0] ?? null : null;
        }
        this.options.expansionParent.set(badgeKey, parentKey);
      }
      const anchorNode = this.options.getNode(expansionSourceNodeId) ?? null;
      for (const target of targets) {
        targetPaths.add(target.path);
        const childNodeId = this.options.ensureTarget(
          target,
          expansionSourceNodeId,
          property,
          anchorNode,
          this.options.isVisibleLinkType(property)
        );
        if (!this.options.isDuplicateNodesEnabled(property)) {
          this.options.addCurrentFile(target.path);
        }
        expansionNodes.add(childNodeId);
        const owners = this.options.nodeOwners.get(childNodeId) ?? new Set<string>();
        owners.add(badgeKey);
        this.options.nodeOwners.set(childNodeId, owners);
      }
      this.options.expandedByBadge.set(badgeKey, targetPaths);
      changed = true;
    }

    if (persist && changed) {
      toggleEvent = {
        sourceNodeId: expansionSourceNodeId,
        sourcePath: this.options.getSourcePath(source),
        linkType: property,
        expanded: this.options.expandedByBadge.has(badgeKey),
        expansionId: badgeKey,
        parentExpansionId: this.options.expansionParent.get(badgeKey) ?? null
      };
    }
    this.options.refreshHoveredHighlightNodes();
    this.options.reconcileCurrentFilesFromVisibleState();
    const files = this.options.getCurrentFiles();
    this.options.setLastFiles(files);
    this.options.rebuildEdges();
    if (toggleEvent) this.options.onToggle?.(toggleEvent);
  }

  getExpansionSubtree(rootKey: string): Set<string> {
    const root = String(rootKey ?? "").trim();
    const subtree = new Set<string>();
    if (!root) return subtree;
    const adjacency = new Map<string, Set<string>>();
    for (const [child, parent] of this.options.expansionParent.entries()) {
      if (!parent) continue;
      const children = adjacency.get(parent) ?? new Set<string>();
      children.add(child);
      adjacency.set(parent, children);
    }
    const queue: string[] = [root];
    while (queue.length > 0) {
      const key = queue.shift()!;
      if (subtree.has(key)) continue;
      subtree.add(key);
      for (const child of adjacency.get(key) ?? []) {
        if (!subtree.has(child)) queue.push(child);
      }
    }
    return subtree;
  }
}