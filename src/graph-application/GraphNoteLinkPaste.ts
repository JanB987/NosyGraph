export interface NoteLinkToken {
  raw: string;
  start: number;
  end: number;
  syntax: "wiki" | "markdown";
  target: string;
  label?: string;
  subpath?: string;
  issue?: "invalid" | "external";
}

export interface NoteLinkPasteDiagnostic {
  raw: string;
  start: number;
  end: number;
  status: "invalid" | "ignored" | "external";
}

export type NoteLinkPaste =
  | { kind: "search" }
  | { kind: "links" | "invalid"; tokens: NoteLinkToken[]; diagnostics: NoteLinkPasteDiagnostic[] };

export function parseNoteLinkPaste(text: string): NoteLinkPaste {
  const tokens: NoteLinkToken[] = [];
  const diagnostics: NoteLinkPasteDiagnostic[] = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    scanLine(line, offset, tokens, diagnostics);
    offset += line.length + 1;
  }
  const hasStructuredText = tokens.length > 0 || diagnostics.some(({ status }) => status !== "ignored");
  if (!hasStructuredText) return { kind: "search" };
  return { kind: tokens.some((token) => !token.issue) ? "links" : "invalid", tokens, diagnostics };
}

function scanLine(
  line: string,
  offset: number,
  tokens: NoteLinkToken[],
  diagnostics: NoteLinkPasteDiagnostic[]
): void {
  const prefix = line.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)?/)?.[0].length ?? 0;
  const content = line.slice(prefix).trimEnd();
  const quote = content[0];
  const quoted = (quote === '"' || quote === "'") && content.endsWith(quote)
    && /^(?:['"]!?\[)/.test(content);
  let value = "";
  const positions: number[] = [];
  for (let index = quoted ? 1 : 0; index < content.length - (quoted ? 1 : 0); index++) {
    positions.push(prefix + index);
    const char = content[index];
    const next = content[index + 1];
    if (quoted && ((quote === '"' && char === "\\" && (next === '"' || next === "\\"))
      || (quote === "'" && char === "'" && next === "'"))) {
      value += next;
      index++;
    } else {
      value += char;
    }
  }
  positions.push(prefix + content.length - (quoted ? 1 : 0));

  const span = (start: number, end: number) => ({
    raw: line.slice(positions[start], positions[end]),
    start: offset + positions[start],
    end: offset + positions[end]
  });
  const reportText = (start: number, end: number) => {
    const addIgnored = (first: number, last: number) => {
      const part = value.slice(first, last);
      const trimmed = part.trim();
      if (!trimmed) return;
      const begin = first + part.indexOf(trimmed);
      diagnostics.push({ ...span(begin, begin + trimmed.length), status: "ignored" });
    };
    let cursor = start;
    for (const match of value.slice(start, end).matchAll(/(^|\s)((?:[a-z][a-z\d+.-]*:|\/\/)\S+)/gi)) {
      const begin = start + match.index + match[1].length;
      addIgnored(cursor, begin);
      cursor = begin + match[2].length;
      diagnostics.push({ ...span(begin, cursor), status: "external" });
    }
    addIgnored(cursor, end);
  };
  let unusedStart = 0;
  for (let index = 0; index < value.length; index++) {
    if (value[index] === "\\") {
      index++;
      continue;
    }
    const embedded = value[index] === "!" && value[index + 1] === "[";
    const start = index + Number(embedded);
    if (value[start] !== "[") continue;
    const parsed = readLink(value, start);
    if (!parsed) continue;
    reportText(unusedStart, index);
    const end = parsed.end;
    if (parsed.kind === "invalid") {
      diagnostics.push({ ...span(index, end), status: "invalid" });
    } else {
      const { syntax, destination, label } = parsed;
      const fragment = findUnescaped(destination, "#");
      const path = (fragment < 0 ? destination : destination.slice(0, fragment)).trim();
      const subpath = fragment < 0 ? undefined : destination.slice(fragment);
      const target = syntax === "markdown" ? decodeMarkdownPath(path) : path;
      const issue = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target ?? "")
        ? "external"
        : target === null || (!target && !subpath) ? "invalid" : undefined;
      tokens.push({ ...span(index, end), syntax, target: target ?? path, label, subpath, issue });
    }
    unusedStart = end;
    index = end - 1;
  }
  reportText(unusedStart, value.length);
}

type ParsedLink =
  | { kind: "invalid"; end: number }
  | { kind: "link"; end: number; syntax: NoteLinkToken["syntax"]; destination: string; label?: string };

function readLink(value: string, start: number): ParsedLink | undefined {
  const recover = () => {
    const nextWiki = value.indexOf("[[", start + 2);
    const nextMarkdown = /!?\[(?!\[)[^[\]]*\]\s*\(/.exec(value.slice(start + 2));
    return { kind: "invalid" as const, end: Math.min(
      nextWiki < 0 ? value.length : nextWiki,
      nextMarkdown ? start + 2 + nextMarkdown.index : value.length
    ) };
  };
  if (value[start + 1] === "[") {
    const close = value.indexOf("]]", start + 2);
    const nested = value.indexOf("[[", start + 2);
    if (close < 0 || (nested >= 0 && nested < close)) return recover();
    const body = value.slice(start + 2, close);
    const alias = body.indexOf("|");
    return {
      kind: "link", syntax: "wiki", end: close + 2,
      destination: alias < 0 ? body : body.slice(0, alias),
      label: alias < 0 ? undefined : body.slice(alias + 1)
    };
  }

  const labelEnd = findBalancedEnd(value, start, "[", "]");
  if (labelEnd < 0) {
    return value.slice(start).includes("](") || /^\[[^[\]]*\(/.test(value.slice(start)) ? recover() : undefined;
  }
  if (value[labelEnd + 1] !== "(") {
    return /^\s+\(/.test(value.slice(labelEnd + 1)) ? recover() : undefined;
  }
  const open = labelEnd + 1;
  const bodyStart = open + 1 + (value.slice(open + 1).match(/^\s*/)?.[0].length ?? 0);
  let close: number;
  let body: string;
  if (value[bodyStart] === "<") {
    const angle = findUnescaped(value, ">", bodyStart + 1);
    if (angle < 0) return recover();
    const tail = value.slice(angle + 1).match(/^\s*(?:(?:"[^"]*"|'[^']*'|\([^)]*\))\s*)?\)/);
    if (!tail) return recover();
    close = angle + tail[0].length;
    body = value.slice(bodyStart + 1, angle);
  } else {
    close = findBalancedEnd(value, open, "(", ")");
    if (close < 0) return recover();
    body = value.slice(bodyStart, close).trimEnd()
      .replace(/\s+(?:"[^"]*"|'[^']*')$/, "");
  }
  return { kind: "link", syntax: "markdown", end: close + 1, destination: body, label: value.slice(start + 1, labelEnd) };
}

function findBalancedEnd(value: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let index = start; index < value.length; index++) {
    const char = value[index];
    if (char === "\\") index++;
    else if (char === open) depth++;
    else if (char === close && --depth === 0) return index;
  }
  return -1;
}

function findUnescaped(value: string, char: string, start = 0): number {
  for (let index = start; index < value.length; index++) {
    if (value[index] === "\\") index++;
    else if (value[index] === char) return index;
  }
  return -1;
}

function decodeMarkdownPath(path: string): string | null {
  try {
    return decodeURIComponent(path.replace(/\\([!-/:-@[-`{-~])/g, "$1"));
  } catch {
    return null;
  }
}
