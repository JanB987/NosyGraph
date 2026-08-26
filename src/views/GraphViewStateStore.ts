/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- NosyGraph parses Obsidian frontmatter, Bases data, and persisted graph JSON whose shapes are validated at runtime. */
import type { RuntimeState, RuntimeStateExpansion, RuntimeViewportState } from "../runtime/RuntimeStateStore.js";
import type { WorkspaceConfig } from "../workspace/WorkspaceState.js";
import {
  createDefaultViewFilterGroup,
  normalizeViewFilterExpression,
  type ViewFilterExpression,
} from "../core/views/ViewDocument.js";
import type {
  SharedTableGroupingDefinition,
  SharedTableQueryState,
  SharedTableSortDefinition,
  TableViewColumn,
} from "../core/views/TableView.js";
import type { TableDataSourceDescriptor } from "../core/views/TableDataSource.js";
import { normalizeTableDataSource } from "../core/views/TableDataSource.js";

export interface GraphViewNodePosition {
  x: number;
  y: number;
}

export interface GraphViewState {
  version: 1;
  view: {
    id: string;
    name: string;
    type: "graph";
  };
  roots: string[];
  activeLinkTypes: Record<string, string>;
  filters: ViewFilterExpression;
  centralGravity: number;
  repulsionForce: number;
  velocitySnapThreshold: number;
  dataSource?: TableDataSourceDescriptor;
  sorting: SharedTableSortDefinition[];
  grouping: SharedTableGroupingDefinition[];
  applySemanticGroups?: boolean;
  activeGroupIds?: string[];
  expansions: RuntimeStateExpansion[];
  nodePositions: Record<string, GraphViewNodePosition>;
  camera?: RuntimeViewportState;
  tables?: {
    filterRules?: SharedTableQueryState & { columns?: TableViewColumn[]; dataSource?: TableDataSourceDescriptor };
    groupRules?: SharedTableQueryState & { columns?: TableViewColumn[]; dataSource?: TableDataSourceDescriptor };
    roots?: SharedTableQueryState & { columns?: TableViewColumn[]; dataSource?: TableDataSourceDescriptor };
    links?: SharedTableQueryState & { columns?: TableViewColumn[]; dataSource?: TableDataSourceDescriptor };
  };
  ui?: {
    sidebar?: {
      width: number;
    };
    linkTypeMenu?: {
      width: number;
      height: number;
    };
  };
}

export interface GraphViewStateStorage {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
}

export class GraphViewStateStore {
  private state: GraphViewState = this.createDefaultState();
  private graphViewPath: string;

  constructor(
    private readonly storage: GraphViewStateStorage,
    graphViewPath = ".wm/views/graph/main.json",
  ) {
    this.graphViewPath = graphViewPath;
  }

  setGraphViewPath(graphViewPath: string): void {
    this.graphViewPath = graphViewPath;
  }

  async load(options: {
    legacyWorkspace?: WorkspaceConfig;
    legacyRuntime?: RuntimeState;
    fallbackState?: GraphViewState;
  } = {}): Promise<GraphViewState> {
    try {
      const raw = await this.storage.readFile(this.graphViewPath);
      if (typeof raw !== "string" || raw.trim().length === 0) {
        this.state = this.createStateFromFallback(options.fallbackState, options.legacyWorkspace, options.legacyRuntime);
        return this.state;
      }

      const parsed = JSON.parse(raw) as Partial<GraphViewState>;
      this.state = this.normalizeState(parsed);
      return this.state;
    } catch {
      this.state = this.createStateFromFallback(options.fallbackState, options.legacyWorkspace, options.legacyRuntime);
      return this.state;
    }
  }

  async save(state: GraphViewState): Promise<void> {
    this.state = this.normalizeState(state);
    await this.storage.writeFile(this.graphViewPath, JSON.stringify(this.state, null, 2));
  }

  getState(): GraphViewState {
    return {
      version: this.state.version,
      view: { ...this.state.view },
      roots: [...this.state.roots],
      activeLinkTypes: { ...this.state.activeLinkTypes },
      filters: normalizeViewFilterExpression(this.state.filters, "root"),
      centralGravity: this.normalizeCentralGravity(this.state.centralGravity),
      repulsionForce: this.normalizeRepulsionForce(this.state.repulsionForce),
      velocitySnapThreshold: this.normalizeVelocitySnapThreshold(this.state.velocitySnapThreshold),
      dataSource: this.state.dataSource ? { ...this.state.dataSource } : undefined,
      sorting: [...this.state.sorting],
      grouping: [...this.state.grouping],
      applySemanticGroups: this.state.applySemanticGroups !== false,
      activeGroupIds: this.state.activeGroupIds ? [...this.state.activeGroupIds] : undefined,
      expansions: [...this.state.expansions],
      nodePositions: Object.fromEntries(
        Object.entries(this.state.nodePositions).map(([nodeId, position]) => [nodeId, { ...position }]),
      ),
      camera: this.state.camera ? { ...this.state.camera } : undefined,
      tables: this.state.tables
        ? {
            links: this.state.tables.links
              ? this.cloneEmbeddedTableState(this.state.tables.links)
              : undefined,
            filterRules: this.state.tables.filterRules
              ? this.cloneEmbeddedTableState(this.state.tables.filterRules)
              : undefined,
            groupRules: this.state.tables.groupRules
              ? this.cloneEmbeddedTableState(this.state.tables.groupRules)
              : undefined,
            roots: this.state.tables.roots
              ? this.cloneEmbeddedTableState(this.state.tables.roots)
              : undefined,
          }
        : undefined,
      ui: this.state.ui
        ? {
            sidebar: this.state.ui.sidebar ? { ...this.state.ui.sidebar } : undefined,
            linkTypeMenu: this.state.ui.linkTypeMenu ? { ...this.state.ui.linkTypeMenu } : undefined,
          }
        : undefined,
    };
  }

  private createStateFromFallback(
    fallbackState?: GraphViewState,
    legacyWorkspace?: WorkspaceConfig,
    legacyRuntime?: RuntimeState,
  ): GraphViewState {
    const defaultState = this.createDefaultState();
    return this.normalizeState({
      ...defaultState,
      ...fallbackState,
      view: fallbackState?.view ?? defaultState.view,
      roots: fallbackState?.roots ?? legacyWorkspace?.roots ?? [],
      activeLinkTypes: fallbackState?.activeLinkTypes ?? legacyWorkspace?.activeLinkTypes ?? {},
      filters: fallbackState?.filters ?? createDefaultViewFilterGroup(),
      centralGravity: fallbackState?.centralGravity ?? defaultState.centralGravity,
      repulsionForce: fallbackState?.repulsionForce ?? defaultState.repulsionForce,
      velocitySnapThreshold: fallbackState?.velocitySnapThreshold ?? defaultState.velocitySnapThreshold,
      sorting: fallbackState?.sorting ?? [],
      grouping: fallbackState?.grouping ?? [],
      applySemanticGroups: fallbackState?.applySemanticGroups ?? defaultState.applySemanticGroups,
      activeGroupIds: fallbackState?.activeGroupIds ?? defaultState.activeGroupIds,
      expansions: fallbackState?.expansions ?? legacyRuntime?.expansions ?? [],
      nodePositions: fallbackState?.nodePositions ?? legacyRuntime?.pinned ?? {},
      camera: fallbackState?.camera ?? legacyRuntime?.viewport,
      tables: fallbackState?.tables ?? defaultState.tables,
      ui: {
        sidebar: fallbackState?.ui?.sidebar ?? defaultState.ui?.sidebar,
        linkTypeMenu: fallbackState?.ui?.linkTypeMenu ?? legacyRuntime?.linkTypeMenu,
      },
    });
  }

  private normalizeState(value: Partial<GraphViewState>): GraphViewState {
    const defaultState = this.createDefaultState();
    return {
      version: 1,
      view: {
        id: value.view?.id?.trim() || defaultState.view.id,
        name: value.view?.name?.trim() || defaultState.view.name,
        type: "graph",
      },
      roots: this.normalizeRoots(value.roots ?? defaultState.roots),
      activeLinkTypes: this.normalizeActiveLinkTypes(value.activeLinkTypes ?? defaultState.activeLinkTypes),
      filters: normalizeViewFilterExpression(value.filters ?? defaultState.filters, "root"),
      centralGravity: this.normalizeCentralGravity(value.centralGravity ?? defaultState.centralGravity),
      repulsionForce: this.normalizeRepulsionForce(value.repulsionForce ?? defaultState.repulsionForce),
      velocitySnapThreshold: this.normalizeVelocitySnapThreshold(
        value.velocitySnapThreshold ?? defaultState.velocitySnapThreshold,
      ),
      dataSource: normalizeTableDataSource(value.dataSource, "graph-query"),
      sorting: this.normalizeSorting(value.sorting ?? defaultState.sorting),
      grouping: this.normalizeGrouping(value.grouping ?? defaultState.grouping),
      applySemanticGroups: value.applySemanticGroups !== false,
      activeGroupIds: this.normalizeActiveGroupIds(value.activeGroupIds),
      expansions: Array.isArray(value.expansions) ? [...value.expansions] : [],
      nodePositions: this.normalizeNodePositions(value.nodePositions ?? defaultState.nodePositions),
      camera: this.normalizeCamera(value.camera),
      tables: {
        filterRules: this.normalizeEmbeddedTableState(value.tables?.filterRules, [
          {
            id: "graph-filter-rules-group-kind",
            columnId: "filter-kind",
            mode: "flat",
          },
        ], "graph-filter-rules", [
          { id: "filter-kind", label: "Type", width: 110, resizable: true },
          { id: "filter-field", label: "Field", width: 180, resizable: true },
          { id: "filter-operator", label: "Operator", width: 150, resizable: true },
          { id: "filter-value", label: "Value", width: 180, resizable: true },
          { id: "filter-actions", label: "Actions", width: 220, resizable: true },
        ]),
        groupRules: this.normalizeEmbeddedTableState(value.tables?.groupRules, [
          {
            id: "graph-group-rules-group-field",
            columnId: "group-field",
            mode: "flat",
          },
        ], "graph-group-rules", [
          { id: "group-field", label: "Field", width: 220, resizable: true },
          { id: "group-mode", label: "Mode", width: 140, resizable: true },
          { id: "group-actions", label: "Actions", width: 160, resizable: true },
        ]),
        roots: this.normalizeEmbeddedTableState(value.tables?.roots, [
          {
            id: "graph-roots-group-name",
            columnId: "root-name",
            mode: "flat",
          },
        ], "graph-roots", [
          { id: "root-name", label: "Root Note", width: 180, resizable: true },
          { id: "root-path", label: "Path", width: 280, resizable: true },
          { id: "root-actions", label: "Actions", width: 140, resizable: true },
        ]),
        links: this.normalizeEmbeddedTableState(value.tables?.links, undefined, "graph-links", [
          { id: "active-state", label: "Active", width: 76, textAlign: "center", resizable: true },
          { id: "link-type-name", label: "Link Type Name", width: 180, resizable: true },
          { id: "link-type-type", label: "Link Type Type", width: 320, resizable: true },
          { id: "link-color", label: "Color", width: 180, resizable: true },
          { id: "link-render-style", label: "Link Render", width: 180, resizable: true },
          { id: "link-direction-mode", label: "Link Direction", width: 180, resizable: true },
        ]),
      },
      ui: {
        sidebar: this.normalizeSidebar(value.ui?.sidebar),
        linkTypeMenu: this.normalizeLinkTypeMenu(value.ui?.linkTypeMenu),
      },
    };
  }

  private createDefaultState(): GraphViewState {
    return {
      version: 1,
      view: {
        id: "main",
        name: "Main Graph",
        type: "graph",
      },
      roots: [],
      activeLinkTypes: {},
      filters: createDefaultViewFilterGroup(),
      centralGravity: 0.0025,
      repulsionForce: 5000,
      velocitySnapThreshold: 0.12,
      dataSource: {
        kind: "graph-query",
      },
      sorting: [],
      grouping: [],
      applySemanticGroups: true,
      activeGroupIds: undefined,
      expansions: [],
      nodePositions: {},
      camera: {
        zoom: 1,
        x: 0,
        y: 0,
      },
      tables: {
        filterRules: {
          filters: createDefaultViewFilterGroup(),
          sorting: [],
          grouping: [
            {
              id: "graph-filter-rules-group-kind",
              columnId: "filter-kind",
              mode: "flat",
            },
          ],
          columns: [
            { id: "filter-kind", label: "Type", width: 110, resizable: true },
            { id: "filter-field", label: "Field", width: 180, resizable: true },
            { id: "filter-operator", label: "Operator", width: 150, resizable: true },
            { id: "filter-value", label: "Value", width: 180, resizable: true },
            { id: "filter-actions", label: "Actions", width: 220, resizable: true },
          ],
          dataSource: { kind: "graph-filter-rules" },
        },
        groupRules: {
          filters: createDefaultViewFilterGroup(),
          sorting: [],
          grouping: [
            {
              id: "graph-group-rules-group-field",
              columnId: "group-field",
              mode: "flat",
            },
          ],
          columns: [
            { id: "group-field", label: "Field", width: 220, resizable: true },
            { id: "group-mode", label: "Mode", width: 140, resizable: true },
            { id: "group-actions", label: "Actions", width: 160, resizable: true },
          ],
          dataSource: { kind: "graph-group-rules" },
        },
        roots: {
          filters: createDefaultViewFilterGroup(),
          sorting: [],
          grouping: [
            {
              id: "graph-roots-group-name",
              columnId: "root-name",
              mode: "flat",
            },
          ],
          dataSource: { kind: "graph-roots" },
        },
        links: {
          filters: createDefaultViewFilterGroup(),
          sorting: [],
          grouping: [
            {
              id: "graph-links-group-active",
              columnId: "active-state",
              mode: "flat",
            },
          ],
          columns: [
            { id: "active-state", label: "Active", width: 76, textAlign: "center", resizable: true },
            { id: "link-type-name", label: "Link Type Name", width: 180, resizable: true },
            { id: "link-type-type", label: "Link Type Type", width: 320, resizable: true },
            { id: "link-color", label: "Color", width: 180, resizable: true },
            { id: "link-render-style", label: "Link Render", width: 180, resizable: true },
            { id: "link-direction-mode", label: "Link Direction", width: 180, resizable: true },
          ],
          dataSource: { kind: "graph-links" },
        },
      },
      ui: {
        sidebar: {
          width: 320,
        },
        linkTypeMenu: {
          width: 264,
          height: 302,
        },
      },
    };
  }

  private normalizeRoots(roots: string[]): string[] {
    const seen = new Set<string>();
    const normalizedRoots: string[] = [];

    for (const root of roots) {
      const normalizedRoot = this.normalizePath(root);
      if (!normalizedRoot || seen.has(normalizedRoot)) {
        continue;
      }

      seen.add(normalizedRoot);
      normalizedRoots.push(normalizedRoot);
    }

    return normalizedRoots;
  }

  private normalizeActiveLinkTypes(activeLinkTypes: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
      Object.entries(activeLinkTypes)
        .map(([property, linkTypeId]) => [property.trim(), String(linkTypeId).trim()])
        .filter(([property, linkTypeId]) => Boolean(property) && Boolean(linkTypeId)),
    );
  }

  private normalizeActiveGroupIds(activeGroupIds: string[] | undefined): string[] | undefined {
    if (!Array.isArray(activeGroupIds)) {
      return undefined;
    }
    const normalized = Array.from(new Set(
      activeGroupIds
        .map((groupId) => (typeof groupId === "string" ? groupId.trim() : ""))
        .filter(Boolean),
    ));
    return normalized.length > 0 ? normalized : undefined;
  }

  private normalizeCentralGravity(value: unknown): number {
    if (!Number.isFinite(value)) {
      return 0.0025;
    }
    return Math.min(0.05, Math.max(0, Number(value)));
  }

  private normalizeRepulsionForce(value: unknown): number {
    if (!Number.isFinite(value)) {
      return 5000;
    }
    return Math.min(50000, Math.max(0, Number(value)));
  }

  private normalizeVelocitySnapThreshold(value: unknown): number {
    if (!Number.isFinite(value)) {
      return 0.12;
    }
    return Math.min(2, Math.max(0, Number(value)));
  }

  private normalizeSorting(value: SharedTableSortDefinition[]): SharedTableSortDefinition[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((entry, index) => {
        if (typeof entry !== "object" || entry === null) {
          return undefined;
        }
        const raw = entry as Partial<SharedTableSortDefinition>;
        const columnId = typeof raw.columnId === "string" ? raw.columnId.trim() : "";
        if (!columnId) {
          return undefined;
        }
        return {
          id: typeof raw.id === "string" && raw.id.trim().length > 0 ? raw.id.trim() : `graph-sort-${index}`,
          columnId,
          direction: raw.direction === "desc" ? "desc" : "asc",
        } satisfies SharedTableSortDefinition;
      })
      .filter((entry): entry is SharedTableSortDefinition => Boolean(entry));
  }

  private normalizeGrouping(value: SharedTableGroupingDefinition[]): SharedTableGroupingDefinition[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((entry, index) => {
        if (typeof entry !== "object" || entry === null) {
          return undefined;
        }
        const raw = entry as Partial<SharedTableGroupingDefinition>;
        const columnId = typeof raw.columnId === "string" ? raw.columnId.trim() : "";
        if (!columnId) {
          return undefined;
        }
        return {
          id: typeof raw.id === "string" && raw.id.trim().length > 0 ? raw.id.trim() : `graph-group-${index}`,
          columnId,
          mode: raw.mode === "tree" ? "tree" : "flat",
        } satisfies SharedTableGroupingDefinition;
      })
      .filter((entry): entry is SharedTableGroupingDefinition => Boolean(entry));
  }

  private normalizeNodePositions(
    nodePositions: Record<string, GraphViewNodePosition>,
  ): Record<string, GraphViewNodePosition> {
    return Object.fromEntries(
      Object.entries(nodePositions)
        .map(([nodeId, position]) => [
          this.normalizePath(nodeId),
          {
            x: Number(position?.x ?? 0),
            y: Number(position?.y ?? 0),
          },
        ])
        .filter(([nodeId]) => Boolean(nodeId)),
    );
  }

  private normalizeCamera(camera?: RuntimeViewportState): RuntimeViewportState | undefined {
    if (!camera) {
      return undefined;
    }

    return {
      zoom: Number(camera.zoom ?? 1),
      x: Number(camera.x ?? 0),
      y: Number(camera.y ?? 0),
    };
  }

  private normalizeLinkTypeMenu(
    linkTypeMenu?: { width: number; height: number },
  ): { width: number; height: number } {
    return {
      width: Number(linkTypeMenu?.width ?? 264),
      height: Number(linkTypeMenu?.height ?? 302),
    };
  }

  private normalizeSidebar(
    sidebar?: { width: number },
  ): { width: number } {
    const rawWidth = Number(sidebar?.width ?? 320);
    const width = Number.isFinite(rawWidth) ? rawWidth : 320;
    return {
      width: Math.min(720, Math.max(220, width)),
    };
  }

  private normalizeEmbeddedTableState(
    value?: Partial<SharedTableQueryState & { columns?: TableViewColumn[]; dataSource?: TableDataSourceDescriptor }>,
    defaultGrouping?: SharedTableGroupingDefinition[],
    defaultDataSourceKind?: TableDataSourceDescriptor["kind"],
    defaultColumns?: TableViewColumn[],
  ): SharedTableQueryState & { columns?: TableViewColumn[]; dataSource?: TableDataSourceDescriptor } {
    return {
      filters: normalizeViewFilterExpression(value?.filters ?? createDefaultViewFilterGroup(), "root"),
      sorting: this.normalizeSorting(value?.sorting ?? []),
      grouping: this.normalizeGrouping(value?.grouping ?? defaultGrouping ?? [
        {
          id: "graph-links-group-active",
          columnId: "active-state",
          mode: "flat",
        },
      ]),
      columns: this.normalizeEmbeddedTableColumns(value?.columns, defaultColumns),
      dataSource: defaultDataSourceKind ? normalizeTableDataSource(value?.dataSource, defaultDataSourceKind) : value?.dataSource,
    };
  }

  private cloneEmbeddedTableState(
    value: SharedTableQueryState & { columns?: TableViewColumn[]; dataSource?: TableDataSourceDescriptor },
  ): SharedTableQueryState & { columns?: TableViewColumn[]; dataSource?: TableDataSourceDescriptor } {
    return {
      filters: normalizeViewFilterExpression(value.filters, "root"),
      sorting: value.sorting.map((entry) => ({ ...entry })),
      grouping: value.grouping.map((entry) => ({ ...entry })),
      columns: value.columns?.map((entry) => ({ ...entry })),
      dataSource: value.dataSource ? { ...value.dataSource } : undefined,
    };
  }

  private normalizeEmbeddedTableColumns(value?: TableViewColumn[], defaultColumns?: TableViewColumn[]): TableViewColumn[] | undefined {
    const normalized = (Array.isArray(value) ? value : [])
      .filter((entry) => entry && typeof entry.id === "string" && typeof entry.label === "string")
      .map((entry) => ({
        id: entry.id.trim(),
        label: entry.label.trim(),
        width: Number.isFinite(entry.width) ? Number(entry.width) : undefined,
        className: entry.className,
        resizable: entry.resizable,
        headerHtml: entry.headerHtml,
        activeFilterText: entry.activeFilterText,
        textAlign: entry.textAlign,
        wrapText: entry.wrapText,
      }))
      .filter((entry) => entry.id.length > 0 && entry.label.length > 0);
    if (!Array.isArray(defaultColumns) || defaultColumns.length === 0) {
      return normalized.length > 0 ? normalized : undefined;
    }
    const merged = [...normalized];
    const seen = new Set(merged.map((entry) => entry.id));
    for (const entry of defaultColumns) {
      if (!entry?.id || !entry?.label || seen.has(entry.id)) {
        continue;
      }
      merged.push({ ...entry });
      seen.add(entry.id);
    }
    return merged.length > 0 ? merged : undefined;
  }

  private normalizePath(value: string): string {
    return String(value ?? "").replace(/\\/g, "/").trim();
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- Re-enable dynamic-data lint rules after this module. */
