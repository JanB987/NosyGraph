import { TFile, type App } from "obsidian";
import { parseNoteLinkPaste, type NoteLinkToken } from "./graph-application/GraphNoteLinkPaste";
import type { MatchGraphNodeClipboard } from "./GraphNodeClipboard";
import { extractInternalLinkCandidates } from "./linkResolver";

export interface GraphNoteLinkPasteRow {
  text: string;
  path?: string;
  file?: TFile;
  status: "ready" | "missing" | "ambiguous" | "self" | "invalid" | "external" | "attachment" | "ignored"
    | "added" | "already-present" | "failed" | "skipped";
  reason?: string;
}

export function getGraphMarkdownFile(app: App, path: string): TFile | undefined {
  const file = app.vault.getAbstractFileByPath(path);
  return file instanceof TFile && file.extension.toLowerCase() === "md" ? file : undefined;
}

export function graphPropertyContainsNote(app: App, value: unknown, targetPath: string, sourcePath: string): boolean {
  if (Array.isArray(value)) {
    return value.some((entry: unknown) => graphPropertyContainsNote(app, entry, targetPath, sourcePath));
  }
  return resolveGraphPropertyReferences(app, value, sourcePath).some((file) => file.path === targetPath);
}

export function resolveGraphPropertyFiles(app: App, value: unknown, sourcePath: string): TFile[] {
  const files = Array.isArray(value)
    ? value.flatMap((entry: unknown) => resolveGraphPropertyFiles(app, entry, sourcePath))
    : resolveGraphPropertyReferences(app, value, sourcePath);
  return [...new Map(files.map((file) => [file.path, file])).values()];
}

function resolveGraphPropertyReferences(app: App, value: unknown, sourcePath: string): TFile[] {
  if (typeof value === "string") {
    const parsed = parseNoteLinkPaste(value);
    if (parsed.kind !== "search") {
      return parsed.tokens.flatMap((token) => {
        const file = !token.issue && resolveGraphNoteLink(app, token, sourcePath).file;
        return file ? [file] : [];
      });
    }
  }
  return extractInternalLinkCandidates(value).flatMap((candidate) => {
    const file = app.metadataCache.getFirstLinkpathDest(candidate, sourcePath);
    return file ? [file] : [];
  });
}

export function readGraphNoteLinkPaste(
  app: App,
  text: string,
  targetPath: string,
  matchClipboard: MatchGraphNodeClipboard,
  source?: "input-field"
): GraphNoteLinkPasteRow[] | undefined {
  if (!text) return undefined;
  const rowForPath = (path: string, file?: TFile): GraphNoteLinkPasteRow => ({
    text: path, path, file,
    status: !file ? "missing" : path === targetPath ? "self" : "ready"
  });
  const registered = matchClipboard(text, source);
  if (registered) return registered.map((path) => {
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile && file.extension.toLowerCase() !== "md") {
      return { text: path, path, status: "attachment" };
    }
    return rowForPath(path, file instanceof TFile ? file : undefined);
  });

  const parsed = parseNoteLinkPaste(text);
  if (parsed.kind === "search") {
    // A plain field value can be an ordinary search, even when it names a file.
    if (source === "input-field") return undefined;
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const files = lines.map((line) => /\.md$/i.test(line) ? getGraphMarkdownFile(app, line) : undefined);
    if (!files.some(Boolean)) return undefined;
    return lines.map((line, index) => /\.md$/i.test(line)
      ? rowForPath(line, files[index]) : { text: line, status: "ignored" });
  }
  const filesByBasename = new Map<string, TFile[]>();
  for (const file of app.vault.getMarkdownFiles()) {
    const basename = file.basename.toLowerCase();
    const files = filesByBasename.get(basename) ?? [];
    files.push(file);
    filesByBasename.set(basename, files);
  }
  return [
    ...parsed.tokens.map((token) => {
      let row: GraphNoteLinkPasteRow = { text: token.raw, status: token.issue ?? "missing" };
      if (!token.issue) {
        const basename = token.target.split(/[\\/]/).pop()?.toLowerCase().replace(/\.md$/, "") ?? "";
        const { file, ambiguous } = resolveGraphNoteLink(app, token, targetPath, filesByBasename.get(basename) ?? []);
        if (ambiguous) row.status = "ambiguous";
        else if (file?.extension.toLowerCase() === "md") row = rowForPath(file.path, file);
        else if (file) row.status = "attachment";
      }
      return { order: token.start, row };
    }),
    ...parsed.diagnostics.map(({ raw, status, start }) => ({ order: start, row: { text: raw, status } }))
  ].sort((a, b) => a.order - b.order).map(({ row }) => row);
}

/** Existing property values use the host's resolution for shorthand; preview also checks for ambiguity. */
export function resolveGraphNoteLink(
  app: App,
  token: NoteLinkToken,
  sourcePath: string,
  previewFiles?: readonly TFile[]
): { file?: TFile; ambiguous?: boolean } {
  const reference = token.target.replace(/\\/g, "/");
  if (!reference) return { file: getGraphMarkdownFile(app, sourcePath) };
  const findExact = (path: string) => {
    const exact = app.vault.getAbstractFileByPath(path);
    if (exact instanceof TFile) return exact;
    return getGraphMarkdownFile(app, `${path}.md`);
  };
  const explicitRelative = /^\.{1,2}\//.test(reference);
  if (explicitRelative || (token.syntax === "markdown" && !reference.startsWith("/"))) {
    const relative = resolveRelativePath(reference, sourcePath);
    const file = relative === undefined ? undefined : findExact(relative);
    if (file || explicitRelative) return { file };
  }
  const vaultPath = reference.replace(/^\//, "");
  if (reference.includes("/")) {
    const file = findExact(vaultPath);
    if (file || reference.startsWith("/")) return { file };
  }
  const candidate = vaultPath.toLowerCase().replace(/\.md$/, "");
  const matches = previewFiles?.filter((file) => {
    const path = file.path.toLowerCase().replace(/\.md$/, "");
    return path === candidate || path.endsWith(`/${candidate}`);
  });
  if (matches && matches.length > 1) return { ambiguous: true };
  // A decoded literal # or % belongs to the filename. Exact path matching above
  // and the unique Markdown candidate preserve it when the host strips subpaths.
  if (matches?.length === 1) return { file: matches[0] };
  // Preserve literal filename characters even if the host interprets them as a fragment or encoding.
  if (/[#%]/.test(vaultPath)) {
    const file = findExact(vaultPath);
    if (file) return { file };
    const resolved = app.metadataCache.getFirstLinkpathDest(vaultPath, sourcePath);
    if (!resolved) return {};
    const path = resolved.path.replace(/\.md$/i, "").toLowerCase();
    return path === candidate || path.endsWith(`/${candidate}`) ? { file: resolved } : {};
  }
  return { file: app.metadataCache.getFirstLinkpathDest(vaultPath, sourcePath) ?? undefined };
}

function resolveRelativePath(path: string, sourcePath: string): string | undefined {
  const parts = sourcePath.split("/").slice(0, -1);
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part !== "..") parts.push(part);
    else if (parts.length) parts.pop();
    else return undefined;
  }
  return parts.join("/");
}
