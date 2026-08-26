/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- NosyGraph parses Obsidian frontmatter, Bases data, and persisted graph JSON whose shapes are validated at runtime. */
import { TFile } from "obsidian";
import {
  DEFAULT_LINK_TYPE_PROPERTY_KEYS,
  type LinkTypePropertyKeys,
  normalizeLinkTypePropertyKeys,
  readConfiguredProperty
} from "./NoteTypePropertyKeys";

export class O3LinkType {
  file: TFile;
  key: string;
  property: string;
  properties: string[];
  writeProperty: string;
  semantic: "link" | "parent";
  linkType: "Force Based" | "Direction Based";
  direction: "incoming" | "outgoing" | "both" | "none";
  linkDiscoveryDirection: "incoming" | "outgoing" | "both";
  pointerDirection: "incoming" | "outgoing" | "none";
  color?: string;
  linkLineColor?: string;
  linkLineThickness?: number;
  recursive: boolean;
  linkForce: number;
  linkDistance: number;
  linkDirection: string;
  linkYAxis: number;
  linkXAxis: number;
  linkDiscovery: boolean;
  linkDuplicateNodes: boolean;

  constructor(file: TFile, fm: unknown, propertyKeys: Partial<LinkTypePropertyKeys> = DEFAULT_LINK_TYPE_PROPERTY_KEYS) {
    const keys = normalizeLinkTypePropertyKeys(propertyKeys);
    const read = (key: keyof LinkTypePropertyKeys): unknown =>
      readConfiguredProperty(fm, keys, DEFAULT_LINK_TYPE_PROPERTY_KEYS, key);
    this.file = file;
    this.key = String(read("key") ?? file.basename).trim();
    this.properties = O3LinkType.normalizeProperties(read("property"), read("properties"));
    this.writeProperty = this.properties[0] ?? "";
    this.property = this.resolveBadgeIdentity(file, this.key, this.properties);
    const linkTypeRaw = String(read("linkType") ?? "").trim();
    this.semantic = linkTypeRaw.toLowerCase() === "parent" ? "parent" : "link";
    this.linkType = linkTypeRaw === "Direction Based" ? "Direction Based" : "Force Based";
    const direction = String(read("direction") ?? "outgoing").trim().toLowerCase();
    this.direction = direction === "incoming" || direction === "both" || direction === "none" ? direction : "outgoing";
    const linkDiscoveryDirection = String(read("linkDiscoveryDirection") ?? "outgoing").trim().toLowerCase();
    this.linkDiscoveryDirection = linkDiscoveryDirection === "incoming" || linkDiscoveryDirection === "both"
      ? linkDiscoveryDirection
      : "outgoing";
    const pointerDirection = String(read("pointerDirection") ?? read("direction") ?? "outgoing").trim().toLowerCase();
    this.pointerDirection = pointerDirection === "incoming" || pointerDirection === "none" ? pointerDirection : "outgoing";
    this.color = String(read("color") ?? "").trim() || undefined;
    this.linkLineColor = String(read("linkLineColor") ?? read("color") ?? "").trim() || undefined;
    const linkLineThickness = Number(read("linkLineThickness"));
    this.linkLineThickness = Number.isFinite(linkLineThickness) && linkLineThickness > 0
      ? linkLineThickness
      : undefined;
    this.recursive = read("recursive") === true;
    const linkForce = Number(read("linkForce"));
    const linkDistance = Number(read("linkDistance"));
    this.linkForce = Number.isFinite(linkForce) ? linkForce : 0.01;
    this.linkDistance = Number.isFinite(linkDistance) ? linkDistance : 120;
    this.linkDirection = String(read("linkDirection") ?? "outgoing").trim().toLowerCase() || "outgoing";
    const linkYAxis = Number(read("linkYAxis"));
    const linkXAxis = Number(read("linkXAxis"));
    this.linkYAxis = Number.isFinite(linkYAxis) ? linkYAxis : 1;
    this.linkXAxis = Number.isFinite(linkXAxis) ? linkXAxis : 0;
    this.linkDuplicateNodes = read("linkDuplicateNodes") === true;
    this.linkDiscovery = this.linkDuplicateNodes ? false : (read("linkDiscovery") === false ? false : true);
  }

  private static normalizeProperties(rawProperty: unknown, rawAdditionalProperties: unknown): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (value: unknown): void => {
      const property = String(value ?? "").trim().toLowerCase();
      if (!property || seen.has(property)) return;
      seen.add(property);
      out.push(property);
    };

    if (Array.isArray(rawProperty)) {
      for (const item of rawProperty) {
        add(item);
      }
    } else if (typeof rawProperty === "string") {
      for (const item of rawProperty.split(",")) {
        add(item);
      }
    } else {
      add(rawProperty);
    }

    if (Array.isArray(rawAdditionalProperties)) {
      for (const item of rawAdditionalProperties) {
        add(item);
      }
    } else if (typeof rawAdditionalProperties === "string") {
      for (const item of rawAdditionalProperties.split(",")) {
        add(item);
      }
    } else {
      add(rawAdditionalProperties);
    }

    return out;
  }

  private resolveBadgeIdentity(file: TFile, key: string, properties: string[]): string {
    if (properties.length <= 1) return properties[0] ?? "";

    const keyIdentity = O3LinkType.normalizeIdentity(key);
    const fileIdentity = O3LinkType.normalizeIdentity(file.basename);
    const matchingKeyProperty = properties.find((property) => O3LinkType.normalizeIdentity(property) === keyIdentity);
    if (matchingKeyProperty) return matchingKeyProperty;
    const matchingFileProperty = properties.find((property) => O3LinkType.normalizeIdentity(property) === fileIdentity);
    if (matchingFileProperty) return matchingFileProperty;
    return keyIdentity || fileIdentity || (properties[0] ?? "");
  }

  private static normalizeIdentity(raw: unknown): string {
    return String(raw ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- Re-enable dynamic-data lint rules after this module. */
