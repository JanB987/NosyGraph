import { type GraphPropertyKeys, hasFrontmatterProperty, readFrontmatterPropertyByKey } from "./GraphPropertyKeys";

export function resolveEffectiveRootProperties(frontmatter: Record<string, unknown>, keys: GraphPropertyKeys, defaults: readonly string[]) {
  const explicit = hasFrontmatterProperty(frontmatter, keys, "rootNodeProperties");
  const raw = explicit ? readFrontmatterPropertyByKey(frontmatter, keys, "rootNodeProperties") : defaults;
  const propertyNames: string[] = [];
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      collect(record.property ?? record.name ?? record.key ?? record.value ?? record.path ?? record.link);
      return;
    }
    const text = String(value ?? "").trim();
    const parts = text.toLowerCase() === "none-type links" ? [text] : text.split(/[\s,;]+/);
    for (const part of parts) {
      if (part && !propertyNames.some(name => name.toLowerCase() === part.toLowerCase())) propertyNames.push(part);
    }
  };
  collect(raw);
  if (!explicit && propertyNames.length === 0) propertyNames.push(keys.rootNodes);
  const fallback = !explicit && defaults.length === 0;
  const names = new Set(propertyNames.map(name => name.toLowerCase()));
  if (fallback) names.add("rootnodes");
  const propertyKeys = Object.keys(frontmatter).filter(key => names.has(key.trim().toLowerCase()) && key.trim().toLowerCase() !== "none-type links");
  return { propertyNames, propertyKeys, usesConfiguredProperties: !fallback,
    authoritative: explicit || propertyKeys.length > 0 };
}
