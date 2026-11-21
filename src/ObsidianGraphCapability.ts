import { TFile, type App } from "obsidian";
import { readFrontmatterProperty, readFrontmatterPropertyByKey, type GraphPropertyKeys } from "./GraphPropertyKeys";
import { resolveEffectiveRootProperties } from "./GraphRootPropertyResolver";
import { frontmatterMatchesIdentifier, type NoteTypeIdentifier } from "./NoteTypeIdentifier";
import { NONE_LINK_TYPE, resolveWikiLinkArray } from "./linkResolver";

export function hasNonEmptyGraphValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasNonEmptyGraphValue);
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

export function isObsidianGraphCapable(app: App, file: TFile, frontmatter: Record<string, unknown>,
  keys: GraphPropertyKeys, defaults: readonly string[], identifier: NoteTypeIdentifier): boolean {
  if (frontmatterMatchesIdentifier(frontmatter, identifier)
    || resolveEffectiveRootProperties(frontmatter, keys, defaults).authoritative
    || hasNonEmptyGraphValue(readFrontmatterPropertyByKey(frontmatter, keys, "connectedBaseFilter"))) return true;
  return defaults.some(raw => {
    const property = String(raw ?? "").trim();
    if (!property) return false;
    if (property.toLowerCase() === NONE_LINK_TYPE.toLowerCase()) {
      return app.metadataCache.getFileCache(file)?.links?.some(link =>
        !!link.link.trim() && app.metadataCache.getFirstLinkpathDest(link.link.trim(), file.path) instanceof TFile) ?? false;
    }
    return resolveWikiLinkArray(app, readFrontmatterProperty(frontmatter, property)).length > 0;
  });
}
