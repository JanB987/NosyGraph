import type { PropertyDefinition } from "../core/services/PropertyDefinitionStore";
import type { WorkspaceDocumentReference, WorkspacePaneId } from "../core/views/types";
import type { GraphViewState } from "../views/GraphViewStateStore";
import type { WorkspacePaneView } from "../ui/WorkspaceController";
import type { GraphViewSidebarService } from "../plugins/GraphViewSidebarService";
import type { LinkTypeDefinition } from "../link-types/types";
import type { GroupDefinition, GroupEffects } from "../groups/types";

const GRAPH_SIDEBAR_MIN_WIDTH = 220;
const GRAPH_SIDEBAR_MAX_WIDTH = 640;

export interface GraphSidebarControllerOptions {
  sidebarService: GraphViewSidebarService;
  graphSidebarCollapsed: Map<WorkspacePaneId, boolean>;
  getIndexedProperties: () => string[];
  getPropertyDefinitions: () => Record<string, PropertyDefinition>;
  getLinkTypes: () => LinkTypeDefinition[];
  getGroups: () => GroupDefinition[];
  getView: (documentPath: string) => GraphViewState | undefined;
  updateView: (
    document: WorkspaceDocumentReference,
    updater: (current: GraphViewState) => GraphViewState,
    options?: { skipPaneRender?: boolean },
  ) => Promise<void>;
  openRoot: (document: WorkspaceDocumentReference, path: string) => Promise<void>;
  createLinkType: (
    document: WorkspaceDocumentReference,
    draft: { label: string; property: string; color?: string; layout: "force" },
  ) => Promise<void>;
  updateLinkType: (
    linkTypeId: string,
    updates: { color?: string; renderStyle?: "line" | "folder"; directionMode?: "child" | "parent" },
  ) => Promise<void>;
  fitPaneToGraph: (pane: WorkspacePaneId) => void;
  createGroup: (
    document: WorkspaceDocumentReference,
    draft?: Partial<Pick<GroupDefinition, "label" | "enabled" | "priority" | "filter">> & {
      effects?: Partial<GroupEffects>;
    },
  ) => Promise<GroupDefinition>;
  updateGroup: (
    groupId: string,
    updates: Partial<Pick<GroupDefinition, "label" | "enabled" | "priority" | "filter">> & {
      effects?: Partial<GroupEffects>;
    },
  ) => Promise<GroupDefinition | undefined>;
  removeGroup: (groupId: string) => Promise<void>;
}

export class GraphSidebarController {
  private readonly lastSidebarRenderSignatures = new Map<WorkspacePaneId, string>();

  constructor(private readonly options: GraphSidebarControllerOptions) {}

  bindPane(args: {
    pane: WorkspacePaneId;
    paneView: WorkspacePaneView;
    document: WorkspaceDocumentReference;
    view: GraphViewState;
  }): void {
    const { pane, paneView, document, view } = args;
    paneView.graphViewport.classList.toggle("is-sidebar-collapsed", this.options.graphSidebarCollapsed.get(pane) === true);
    const applyGraphSidebarWidth = (width: number) => {
      const normalizedWidth = Math.min(
        GRAPH_SIDEBAR_MAX_WIDTH,
        Math.max(GRAPH_SIDEBAR_MIN_WIDTH, Math.round(width)),
      );
      paneView.graphSidebar.style.width = `${normalizedWidth}px`;
    };
    applyGraphSidebarWidth(view.ui?.sidebar?.width ?? 320);

    const buildSidebarRenderSignature = (currentView: GraphViewState, availableProperties: string[]): string => JSON.stringify({
      documentPath: document.path,
      availableProperties,
      propertyDefinitions: Object.values(this.options.getPropertyDefinitions())
        .map((definition) => ({
          name: definition.name,
          type: definition.type,
        }))
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" })),
      linkTypes: this.options.getLinkTypes()
        .map((linkType) => ({
          id: linkType.id,
          property: linkType.property,
          label: linkType.label,
          color: linkType.color,
          renderStyle: linkType.renderStyle,
          directionMode: linkType.directionMode,
        }))
        .sort((left, right) => left.id.localeCompare(right.id, undefined, { sensitivity: "base" })),
      groups: this.options.getGroups()
        .map((group) => ({
          id: group.id,
          label: group.label,
          enabled: group.enabled,
          priority: group.priority,
          nodeColor: group.effects.nodeColor,
          nodeSize: group.effects.nodeSize,
          icon: group.effects.icon,
          filter: group.filter,
        }))
        .sort((left, right) => left.id.localeCompare(right.id, undefined, { sensitivity: "base" })),
      view: {
        roots: currentView.roots,
        activeLinkTypes: currentView.activeLinkTypes,
        activeGroupIds: currentView.activeGroupIds,
        applySemanticGroups: currentView.applySemanticGroups,
        filters: currentView.filters,
        sorting: currentView.sorting,
        grouping: currentView.grouping,
        tables: currentView.tables,
        ui: currentView.ui,
      },
    });

    const renderGraphSidebarControls = (force = false) => {
      const latestView = this.options.getView(document.path) ?? view;
      const availableProperties = this.options.getIndexedProperties();
      const signature = buildSidebarRenderSignature(latestView, availableProperties);
      if (!force && this.lastSidebarRenderSignatures.get(pane) === signature) {
        return;
      }
      this.lastSidebarRenderSignatures.set(pane, signature);
      this.options.sidebarService.render(
        paneView.graphToolbarActions,
        document.path,
        latestView,
        availableProperties,
        {
          propertyDefinitions: this.options.getPropertyDefinitions(),
          linkTypes: this.options.getLinkTypes(),
          groups: this.options.getGroups(),
          activeGraphLinkTypes: latestView.activeLinkTypes,
        },
      );
      this.options.sidebarService.attach(
        paneView.graphToolbarActions,
        document,
        latestView,
        availableProperties,
        {
          propertyDefinitions: this.options.getPropertyDefinitions(),
          linkTypes: this.options.getLinkTypes(),
          groups: this.options.getGroups(),
          activeGraphLinkTypes: latestView.activeLinkTypes,
        },
        {
          rerender: () => renderGraphSidebarControls(true),
          updateView: (updater) => this.options.updateView(document, updater),
          openRoot: (path) => this.options.openRoot(document, path),
          removeRoot: (path) => this.options.updateView(document, (current) => {
            current.roots = (current.roots ?? []).filter((entry) => entry.replace(/\\/g, "/").trim() !== path.replace(/\\/g, "/").trim());
            return current;
          }),
          createLinkType: (draft) => this.options.createLinkType(document, draft),
          updateLinkType: (linkTypeId, updates) => this.options.updateLinkType(linkTypeId, updates),
          createGroup: (draft) => this.options.createGroup(document, draft),
          updateGroup: (groupId, updates) => this.options.updateGroup(groupId, updates),
          removeGroup: (groupId) => this.options.removeGroup(groupId),
          setActiveLinkType: (property, linkTypeId) => this.options.updateView(document, (current) => ({
            ...current,
            activeLinkTypes: {
              ...current.activeLinkTypes,
              [property.trim()]: linkTypeId,
            },
          })),
          deactivateLinkType: (property) => this.options.updateView(document, (current) => {
            const nextActiveLinkTypes = { ...current.activeLinkTypes };
            delete nextActiveLinkTypes[property.trim()];
            return {
              ...current,
              activeLinkTypes: nextActiveLinkTypes,
            };
          }),
        },
      );
    };

    renderGraphSidebarControls();
    paneView.graphSidebarToggle.onclick = () => {
      this.options.graphSidebarCollapsed.set(pane, true);
      paneView.graphViewport.classList.add("is-sidebar-collapsed");
    };
    paneView.graphSidebarCollapsedButton.onclick = () => {
      this.options.graphSidebarCollapsed.set(pane, false);
      paneView.graphViewport.classList.remove("is-sidebar-collapsed");
    };
    paneView.graphSidebarResizeHandle.onmousedown = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = paneView.graphSidebar.getBoundingClientRect().width;
      let nextWidth = startWidth;
      const handleMove = (moveEvent: MouseEvent) => {
        nextWidth = Math.min(
          GRAPH_SIDEBAR_MAX_WIDTH,
          Math.max(GRAPH_SIDEBAR_MIN_WIDTH, startWidth + (moveEvent.clientX - startX)),
        );
        applyGraphSidebarWidth(nextWidth);
      };
      const handleUp = () => {
        globalThis.removeEventListener("mousemove", handleMove);
        globalThis.removeEventListener("mouseup", handleUp);
        void this.options.updateView(document, (current) => ({
          ...current,
          ui: {
            ...current.ui,
            sidebar: {
              width: Math.round(nextWidth),
            },
          },
        }), { skipPaneRender: true });
      };
      globalThis.addEventListener("mousemove", handleMove);
      globalThis.addEventListener("mouseup", handleUp);
    };
    paneView.graphRefocusButton.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.options.fitPaneToGraph(pane);
    };
  }
}
