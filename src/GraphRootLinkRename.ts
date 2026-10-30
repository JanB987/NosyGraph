export interface RootLinkRename {
  oldPath: string;
  newPath: string;
  sourcePath: string;
  resolveLinkpath: (linkpath: string, sourcePath: string) => string | null;
}

function normalize(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function withoutExtension(path: string): string {
  return path.replace(/\.md$/i, "");
}

function referencesOldPath(raw: string, options: RootLinkRename): boolean {
  let linkpath: string;
  try { linkpath = decodeURIComponent(raw.trim()); }
  catch { linkpath = raw.trim(); }
  if (!linkpath || /^[a-z][a-z\d+.-]*:/i.test(linkpath)) return false;
  const oldPath = withoutExtension(normalize(options.oldPath));
  const sourceFolder = options.sourcePath.replace(/\\/g, "/").split("/").slice(0, -1).join("/");
  const relative = withoutExtension(normalize(sourceFolder + "/" + linkpath));
  const explicitRelative = /^\.\.?\//.test(linkpath);
  if (relative === oldPath && !linkpath.startsWith("/")) return true;
  if (explicitRelative) return false;
  const target = withoutExtension(normalize(linkpath));
  if (target === oldPath) return true;
  if (!oldPath.endsWith("/" + target)) return false;
  // After the rename, a formerly valid short link may no longer resolve.
  // A different existing destination takes precedence over a basename guess.
  const resolved = options.resolveLinkpath(linkpath, options.sourcePath);
  return !resolved || resolved === options.oldPath || resolved === options.newPath;
}

function relativeMarkdownPath(source: string, destination: string): string {
  const from = normalize(source).split("/").slice(0, -1);
  const to = normalize(destination).split("/");
  while (from.length && to.length && from[0] === to[0]) { from.shift(); to.shift(); }
  return [...from.map(() => ".."), ...to]
    .map((part) => encodeURIComponent(part).replace(/[()]/g, (character) => character === "(" ? "%28" : "%29"))
    .join("/");
}

function renameLink(value: string, options: RootLinkRename): string {
  const wiki = value.match(/^\[\[([^#|\]]+)([^\]]*)\]\]$/);
  if (wiki) {
    if (!referencesOldPath(wiki[1], options)) return value;
    const extension = /\.md$/i.test(wiki[1]) ? ".md" : "";
    return `[[${withoutExtension(normalize(options.newPath))}${extension}${wiki[2]}]]`;
  }
  const markdown = value.match(/^(\[[^\]]*\]\()([^#)]+)(#[^)]*)?\)$/);
  if (markdown) {
    if (!referencesOldPath(markdown[2], options)) return value;
    return `${markdown[1]}${relativeMarkdownPath(options.sourcePath, options.newPath)}${markdown[3] ?? ""})`;
  }
  const tokens = value.match(/\[\[[^\]]+\]\]|\[[^\]]*\]\([^)]+\)/g);
  if (tokens) {
    return value.replace(/\[\[[^\]]+\]\]|\[[^\]]*\]\([^)]+\)/g, (link) => renameLink(link, options));
  }
  if (/[\[\]]/.test(value)) return value;
  const [linkpath, ...fragment] = value.split("#");
  if (!referencesOldPath(linkpath, options)) return value;
  return (/\.md$/i.test(linkpath) ? normalize(options.newPath) : withoutExtension(normalize(options.newPath)))
    + (fragment.length ? "#" + fragment.join("#") : "");
}

/** Rename root links without coercing YAML values or dropping aliases/subpaths. */
export function renameRootLinkValue(value: unknown, options: RootLinkRename): unknown {
  if (Array.isArray(value)) return value.map((item) => renameRootLinkValue(item, options));
  return typeof value === "string" ? renameLink(value, options) : value;
}
