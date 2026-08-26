/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- NosyGraph parses Obsidian frontmatter, Bases data, and persisted graph JSON whose shapes are validated at runtime. */
import { TFile } from "obsidian";
import {
  DEFAULT_GROUP_PROPERTY_KEYS,
  type GroupPropertyKeys,
  normalizeGroupPropertyKeys,
  readConfiguredProperty
} from "./NoteTypePropertyKeys";

export type GroupOperator = "equals" | "contains" | "exists";

export class O3GraphGroup {
  file: TFile;
  property: string;
  operator: GroupOperator;
  value: unknown;
  color: string;
  colorExplicit: boolean;
  icon: string;

  constructor(file: TFile, fm: unknown, propertyKeys: Partial<GroupPropertyKeys> = DEFAULT_GROUP_PROPERTY_KEYS) {
    const keys = normalizeGroupPropertyKeys(propertyKeys);
    const read = (key: keyof GroupPropertyKeys): unknown =>
      readConfiguredProperty(fm, keys, DEFAULT_GROUP_PROPERTY_KEYS, key);
    this.file = file;
    this.property = String(read("property") ?? "").trim();
    this.operator = (read("operator") ?? "equals") as GroupOperator;
    this.value = read("value");
    const rawColor = read("color");
    this.colorExplicit = rawColor !== undefined && rawColor !== null && String(rawColor).trim() !== "";
    this.color = String(rawColor ?? "#888888").trim() || "#888888";
    this.icon = String(read("icon") ?? "").trim();
  }

  matches(frontmatter: unknown): boolean {
    if (!frontmatter || typeof frontmatter !== "object") return false;

    const propValue = this.readPropertyValue(frontmatter as Record<string, unknown>);

    switch (this.operator) {
      case "exists":
        return propValue !== undefined;
      case "equals":
        return propValue === this.value;
      case "contains":
        if (Array.isArray(propValue)) {
          return propValue.includes(this.value);
        }
        if (typeof propValue === "string") {
          return propValue.includes(String(this.value ?? ""));
        }
        return false;
      default:
        return false;
    }
  }

  private readPropertyValue(frontmatter: Record<string, unknown>): unknown {
    const target = String(this.property ?? "").trim().toLowerCase();
    for (const [key, value] of Object.entries(frontmatter ?? {})) {
      if (String(key ?? "").trim().toLowerCase() === target) {
        return value;
      }
    }
    return undefined;
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- Re-enable dynamic-data lint rules after this module. */
