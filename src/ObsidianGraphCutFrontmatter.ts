import type { App, TFile } from "obsidian";

interface PendingFrontmatter {
  previous: unknown;
  current: Record<string, unknown>;
  expires: number;
}

const pending = new WeakMap<App, WeakMap<TFile, PendingFrontmatter>>();

/** Use the committed property values while Obsidian still exposes the previous cache entry. */
export function rememberGraphCutFrontmatter(app: App, file: TFile, current: Record<string, unknown>): void {
  const files = pending.get(app) ?? new WeakMap<TFile, PendingFrontmatter>();
  pending.set(app, files);
  files.set(file, { previous: app.metadataCache.getFileCache(file), current, expires: Date.now() + 2000 });
}

export function getGraphCutFrontmatter(app: App, file: TFile, cached: unknown): Record<string, unknown> | undefined {
  const files = pending.get(app);
  const entry = files?.get(file);
  if (entry && entry.previous === cached && Date.now() < entry.expires) return entry.current;
  files?.delete(file);
  return undefined;
}
