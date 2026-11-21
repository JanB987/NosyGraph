import { setStyles } from "./domStyle";
import type { O3LinkType } from "./O3LinkType";
import type { LinkTypeIconKind } from "./link-types/types";

const defaultIcons: Record<LinkTypeIconKind, string> = {
  lens: "scan-search",
  force: "zap",
  direction: "arrow-right",
  parent: "git-branch"
};

export type LinkTypeBadgeIcon =
  | { kind: "icon"; name: string }
  | { kind: "text"; text: string };

export type LinkTypeBadgeIconLookup = (name: string) => SVGSVGElement | null;

export function normalizeLinkTypeBadgeIcon(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

export function getLinkTypeBadgeIconKind(
  definition: Pick<O3LinkType, "semantic" | "linkType">
): LinkTypeIconKind {
  if (definition.semantic === "lens" || definition.semantic === "parent") return definition.semantic;
  return definition.linkType === "Direction Based" ? "direction" : "force";
}

// Intl.Segmenter is optional on hosts that predate the grapheme API.
const Segmenter = (Intl as typeof Intl & {
  Segmenter?: new (locales: undefined, options: { granularity: "grapheme" }) => {
    segment(value: string): Iterable<unknown>;
  };
}).Segmenter;
const graphemes = Segmenter && new Segmenter(undefined, { granularity: "grapheme" });

// Accept punctuation, symbols, and emoji components, including keycaps, flags,
// modifiers, joiners, and emoji tags. Require a visible base in every sequence.
const bareSymbols = /^(?:(?:[0-9]\uFE0F?\u20E3|[\p{P}\p{S}][\p{M}\u{E0020}-\u{E007F}]*)\u200D?)+$/u;

function isBareText(value: string): boolean {
  if (!value.endsWith("\u200D") && bareSymbols.test(value)) return true;
  if (!/[\p{L}\p{N}\p{P}\p{S}]/u.test(value)) return false;
  // Keep common base-plus-mark characters working on older hosts. Never
  // truncate a string to simulate segmentation.
  if (!graphemes) return /^[\p{L}\p{N}]\p{M}*$/u.test(value);
  const segments = graphemes.segment(value)[Symbol.iterator]();
  segments.next();
  return segments.next().done === true;
}

export function resolveLinkTypeBadgeIcon(
  kind: LinkTypeIconKind,
  requested: string | undefined,
  hasIcon: (name: string) => boolean
): LinkTypeBadgeIcon {
  const value = normalizeLinkTypeBadgeIcon(requested);
  if (value?.startsWith("text:")) {
    const text = value.slice("text:".length).trim();
    if (/[^\s\p{C}\p{M}]/u.test(text)) return { kind: "text", text };
  } else if (value) {
    if (hasIcon(value)) return { kind: "icon", name: value };
    if (isBareText(value)) return { kind: "text", text: value };
  }

  const preferred = defaultIcons[kind];
  if (value !== preferred && hasIcon(preferred)) return { kind: "icon", name: preferred };
  if (value !== "link" && hasIcon("link")) return { kind: "icon", name: "link" };
  return { kind: "text", text: "•" };
}

const textStyles = {
  display: "inline-block",
  width: "12px",
  maxWidth: "12px",
  height: "12px",
  flex: "0 0 12px",
  verticalAlign: "middle",
  lineHeight: "12px",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textAlign: "center",
  fontSize: "12px"
};
const clearTextStyles = Object.fromEntries(Object.keys(textStyles).map((key) => [key, null]));

export function renderLinkTypeBadgeIcon(
  element: HTMLElement,
  kind: LinkTypeIconKind,
  requested: string | undefined,
  getIcon: LinkTypeBadgeIconLookup
): void {
  let svg: SVGSVGElement | null = null;
  const presentation = resolveLinkTypeBadgeIcon(kind, requested, (name) => {
    svg = getIcon(name);
    return svg !== null;
  });
  element.setAttribute("aria-hidden", "true");
  if (presentation.kind === "text") {
    element.classList.add("o3-node-badge-icon--text");
    // Shrink short Latin abbreviations to fit the same slot as a single glyph.
    const fontSize = /^[A-Za-z0-9]{3}$/.test(presentation.text) ? "6px"
      : /^[A-Za-z0-9]{2}$/.test(presentation.text) ? "8px" : textStyles.fontSize;
    setStyles(element, { ...textStyles, fontSize });
    element.textContent = presentation.text;
  } else {
    if (element.classList.contains("o3-node-badge-icon--text")) {
      element.classList.remove("o3-node-badge-icon--text");
      setStyles(element, clearTextStyles);
    }
    if (svg) element.replaceChildren(svg);
  }
}
