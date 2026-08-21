export interface LinkTypePropertyKeys {
  key: string;
  property: string;
  properties: string;
  linkType: string;
  direction: string;
  linkDiscoveryDirection: string;
  pointerDirection: string;
  color: string;
  linkLineColor: string;
  linkLineThickness: string;
  recursive: string;
  linkForce: string;
  linkDistance: string;
  linkDirection: string;
  linkYAxis: string;
  linkXAxis: string;
  linkDiscovery: string;
  linkDuplicateNodes: string;
}

export interface GroupPropertyKeys {
  property: string;
  operator: string;
  value: string;
  color: string;
  icon: string;
}

export const DEFAULT_LINK_TYPE_PROPERTY_KEYS: LinkTypePropertyKeys = {
  key: "key",
  property: "property",
  properties: "properties",
  linkType: "linkType",
  direction: "direction",
  linkDiscoveryDirection: "LinkDiscoveryDirection",
  pointerDirection: "PointerDirection",
  color: "color",
  linkLineColor: "linkLineColor",
  linkLineThickness: "linkLineThickness",
  recursive: "recursive",
  linkForce: "linkForce",
  linkDistance: "linkDistance",
  linkDirection: "linkDirection",
  linkYAxis: "linkYAxis",
  linkXAxis: "linkXAxis",
  linkDiscovery: "linkDiscovery",
  linkDuplicateNodes: "linkDuplicateNodes"
};

export const DEFAULT_GROUP_PROPERTY_KEYS: GroupPropertyKeys = {
  property: "property",
  operator: "operator",
  value: "value",
  color: "color",
  icon: "groupIcon"
};

export function normalizeLinkTypePropertyKeys(raw: unknown): LinkTypePropertyKeys {
  return normalizeKeys(raw, DEFAULT_LINK_TYPE_PROPERTY_KEYS);
}

export function normalizeGroupPropertyKeys(raw: unknown): GroupPropertyKeys {
  return normalizeKeys(raw, DEFAULT_GROUP_PROPERTY_KEYS);
}

export function readConfiguredProperty<T extends Record<string, string>>(
  frontmatter: Record<string, unknown> | null | undefined,
  keys: T,
  defaults: T,
  key: keyof T
): unknown {
  if (!frontmatter || typeof frontmatter !== "object") return undefined;
  const candidates = [keys[key], defaults[key]]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  for (const candidate of candidates) {
    if (Object.prototype.hasOwnProperty.call(frontmatter, candidate)) {
      return frontmatter[candidate];
    }
  }
  const normalized = new Set(candidates.map((value) => value.toLowerCase()));
  for (const [property, value] of Object.entries(frontmatter)) {
    if (normalized.has(String(property ?? "").trim().toLowerCase())) {
      return value;
    }
  }
  return undefined;
}

function normalizeKeys<T extends Record<string, string>>(raw: unknown, defaults: T): T {
  const source = raw && typeof raw === "object" ? raw as Partial<Record<keyof T, unknown>> : {};
  const out = { ...defaults };
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    const value = String(source[key] ?? "").trim();
    if (value) out[key] = value as T[keyof T];
  }
  return out;
}
