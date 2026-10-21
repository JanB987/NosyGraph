export interface GraphGroupingRule {
  property: string;
  operator: "equals" | "contains" | "exists";
  value?: string;
  color: string;
  colorExplicit?: boolean;
  icon?: string;
  iconSourcePath?: string;
}

export function normalizeGraphGroupingRules(raw: unknown): GraphGroupingRule[] {
  if (!Array.isArray(raw)) return [];
  const out: GraphGroupingRule[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const property = String(obj.property ?? "").trim();
    if (!property) continue;
    const operator = obj.operator === "contains" || obj.operator === "exists" ? obj.operator : "equals";
    const color = String(obj.color ?? "#4caf50").trim() || "#4caf50";
    const colorExplicit = typeof obj.colorExplicit === "boolean"
      ? obj.colorExplicit
      : Object.prototype.hasOwnProperty.call(obj, "color");
    const icon = String(obj.icon ?? "").trim();
    const iconSourcePath = String(obj.iconSourcePath ?? "").trim();
    out.push({
      property, operator, color, colorExplicit,
      ...(operator === "exists" ? {} : { value: String(obj.value ?? "").trim() }),
      ...(icon ? { icon } : {}),
      ...(iconSourcePath ? { iconSourcePath } : {})
    });
  }
  return out;
}
