import { App, TFile } from "obsidian";

export const NONE_LINK_TYPE = "None-type links";

/**
 * Extracts link path from a string like "[[Note Name]]".
 * Returns null if format is invalid.
 */
export function extractLinkPath(linkText: string): string | null {
  if (typeof linkText !== "string") return null;

  const text = linkText.trim();
  const match = text.match(/^\[\[(.+?)\]\]$/);
  if (!match) return null;

  const raw = String(match[1] ?? "").trim();
  if (!raw) return null;
  const withoutAlias = raw.split("|")[0]?.trim() ?? raw;
  const withoutHeading = withoutAlias.split("#")[0]?.trim() ?? withoutAlias;
  return withoutHeading || null;
}

/**
 * Resolves a wiki-style link string like "[[Note]]" to a TFile.
 */
export function resolveWikiLink(app: App, linkText: string): TFile | null {
  const linkPath = extractLinkPath(linkText);
  if (!linkPath) return null;

  return app.metadataCache.getFirstLinkpathDest(linkPath, "") ?? null;
}

/**
 * Parses an array of quoted wiki links from YAML frontmatter.
 * Returns array of resolved TFiles.
 */
export function resolveWikiLinkArray(app: App, values: unknown): TFile[] {
  if (!values) return [];

  const rawValues: string[] = [];

  if (typeof values === "string") {
    rawValues.push(
      ...values.split(",").map(v => v.trim()).filter(Boolean)
    );
  } else if (Array.isArray(values)) {
    for (const v of values) {
      if (typeof v === "string") {
        rawValues.push(v.trim());
      }
    }
  } else {
    return [];
  }

  const results: TFile[] = [];
  const seen = new Set<string>();

  for (const raw of rawValues) {
    if (!raw) continue;

    const match = raw.match(/^\[\[([^|\]]+)/);
    const linkPath = (match ? match[1] : raw)?.trim();
    if (!linkPath) continue;

    const file = app.metadataCache.getFirstLinkpathDest(linkPath, "");
    if (!file) continue;

    if (seen.has(file.path)) continue;
    seen.add(file.path);

    results.push(file);
  }

  return results;
}

export function extractInternalLinkCandidates(value: unknown): string[] {
  const out = new Set<string>();
  collectCandidates(value, out);
  return Array.from(out);
}

function collectCandidates(value: unknown, out: Set<string>) {
  if (value == null) return;

  if (Array.isArray(value)) {
    for (const item of value) {
      collectCandidates(item, out);
    }
    return;
  }

  if (typeof value === "string") {
    collectFromString(value, out);
    return;
  }

  if (typeof value === "object") {
    const maybePath = (value as Record<string, unknown>).path;
    if (typeof maybePath === "string") {
      collectFromString(maybePath, out);
      return;
    }

    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectCandidates(nested, out);
    }
  }
}

function collectFromString(raw: string, out: Set<string>) {
  const text = raw.trim();
  if (!text) return;

  let hadStructuredMatch = false;

  const wikiRegex = /\[\[([^[\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  for (const match of text.matchAll(wikiRegex)) {
    const candidate = match[1]?.trim();
    if (candidate) {
      out.add(candidate);
      hadStructuredMatch = true;
    }
  }

  const markdownRegex = /\[[^\]]*]\(([^)]+)\)/g;
  for (const match of text.matchAll(markdownRegex)) {
    const href = match[1]?.trim();
    if (!href || isExternalHref(href)) continue;
    out.add(href);
    hadStructuredMatch = true;
  }

  if (hadStructuredMatch) {
    return;
  }

  // Fallback for plain frontmatter values (single note names or comma/newline-separated lists).
  const parts = splitCandidateParts(text);
  for (const part of parts) {
    if (!part || isExternalHref(part)) continue;
    out.add(part);
  }
}

function isExternalHref(href: string): boolean {
  return /^(?:[a-z]+:)?\/\//i.test(href);
}

function looksLikeInternalPath(text: string): boolean {
  return text.includes("/") || text.endsWith(".md");
}

function splitCandidateParts(text: string): string[] {
  if (looksLikeInternalPath(text)) {
    return [text];
  }

  const split = text
    .split(/[\n,;]+/)
    .map(part => part.trim())
    .filter(Boolean);

  if (split.length > 1) {
    return split;
  }

  return [text];
}
