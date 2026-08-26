/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- NosyGraph parses Obsidian frontmatter, Bases data, and persisted graph JSON whose shapes are validated at runtime. */
export interface GraphPropertyKeys {
  graphMarker: string;
  rootNodes: string;
  rootNodeProperties: string;
  activeLinkTypes: string;
  activeOverlayLinkTypes: string;
  visibleLinkTypes: string;
  visibleLinkTypeLineStyle: string;
  discoveredLinkLineStyle: string;
  autoExpandDroppedLinkTypes: string;
  activeGroups: string;
  activeFilters: string;
  connectedBaseFilter: string;
  graphForceGravity: string;
  graphForceRepellent: string;
  graphNodeSize: string;
  graphNodeConnectionSizeMultiplier: string;
  graphVelocityNearRestThreshold: string;
  graphVelocityRestThreshold: string;
  graphTextFadeThreshold: string;
  graphBackgroundColor: string;
  graphLayout: string;
  graphContainerColor: string;
  graphContainerLinkForce: string;
  showNodeIcons: string;
  nodeIndividualSize: string;
  graphIcon: string;
}

export const DEFAULT_GRAPH_PROPERTY_KEYS: GraphPropertyKeys = {
  graphMarker: "o3Graph",
  rootNodes: "rootNodes",
  rootNodeProperties: "rootNodeProperties",
  activeLinkTypes: "activeLinkTypes",
  activeOverlayLinkTypes: "activeOverlayLinkTypes",
  visibleLinkTypes: "visibleLinkTypes",
  visibleLinkTypeLineStyle: "visibleLinkTypeLineStyle",
  discoveredLinkLineStyle: "discoveredLinkLineStyle",
  autoExpandDroppedLinkTypes: "autoExpandDroppedLinkTypes",
  activeGroups: "activeGroups",
  activeFilters: "activeFilters",
  connectedBaseFilter: "connected_base_filter",
  graphForceGravity: "graphForce_Gravity",
  graphForceRepellent: "graphForce_Repellent",
  graphNodeSize: "graphNode_Size",
  graphNodeConnectionSizeMultiplier: "graphNode_ConnectionSizeMultiplier",
  graphVelocityNearRestThreshold: "graphVelocity_NearRestThreshold",
  graphVelocityRestThreshold: "graphVelocity_RestThreshold",
  graphTextFadeThreshold: "graphText_FadeThreshold",
  graphBackgroundColor: "graph_background_color",
  graphLayout: "layoutId",
  graphContainerColor: "graphContainer_Color",
  graphContainerLinkForce: "graphContainer_LinkForce",
  showNodeIcons: "showNodeIcons",
  nodeIndividualSize: "graphNodeSize",
  graphIcon: "graphIcon"
};

export function normalizeGraphPropertyKeys(raw: unknown): GraphPropertyKeys {
  const source = raw && typeof raw === "object" ? raw as Partial<Record<keyof GraphPropertyKeys, unknown>> : {};
  const out = { ...DEFAULT_GRAPH_PROPERTY_KEYS };
  for (const key of Object.keys(DEFAULT_GRAPH_PROPERTY_KEYS) as (keyof GraphPropertyKeys)[]) {
    const value = String(source[key] ?? "").trim();
    if (value) {
      out[key] = value;
    }
  }
  return out;
}

export function readFrontmatterProperty(
  frontmatter: Record<string, unknown> | null | undefined,
  configuredProperty: string,
  defaultProperty?: string
): unknown {
  if (!frontmatter || typeof frontmatter !== "object") return undefined;
  const candidates = buildPropertyCandidates(configuredProperty, defaultProperty);
  for (const candidate of candidates) {
    const direct = (frontmatter as Record<string, unknown>)[candidate];
    if (direct !== undefined) return direct;
  }
  const normalized = new Set(candidates.map((candidate) => normalizePropertyName(candidate)));
  for (const [key, value] of Object.entries(frontmatter)) {
    if (normalized.has(normalizePropertyName(key))) {
      return value;
    }
  }
  return undefined;
}

export function readFrontmatterPropertyByKey(
  frontmatter: Record<string, unknown> | null | undefined,
  keys: GraphPropertyKeys,
  key: keyof GraphPropertyKeys
): unknown {
  return readFrontmatterProperty(frontmatter, keys[key], DEFAULT_GRAPH_PROPERTY_KEYS[key]);
}

export function writeFrontmatterProperty(
  frontmatter: Record<string, unknown>,
  keys: GraphPropertyKeys,
  key: keyof GraphPropertyKeys,
  value: unknown
): void {
  frontmatter[keys[key]] = value;
  const configured = normalizePropertyName(keys[key]);
  const canonical = DEFAULT_GRAPH_PROPERTY_KEYS[key];
  if (normalizePropertyName(canonical) !== configured && Object.prototype.hasOwnProperty.call(frontmatter, canonical)) {
    delete frontmatter[canonical];
  }
}

export function hasFrontmatterProperty(
  frontmatter: Record<string, unknown> | null | undefined,
  keys: GraphPropertyKeys,
  key: keyof GraphPropertyKeys
): boolean {
  return readFrontmatterPropertyByKey(frontmatter, keys, key) !== undefined;
}

function buildPropertyCandidates(configuredProperty: string, defaultProperty?: string): string[] {
  const out: string[] = [];
  for (const raw of [configuredProperty, defaultProperty]) {
    const value = String(raw ?? "").trim();
    if (!value || out.includes(value)) continue;
    out.push(value);
  }
  return out;
}

function normalizePropertyName(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}
/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- Re-enable dynamic-data lint rules after this module. */
