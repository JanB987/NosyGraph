import type {
  GraphLinkDirectionMode,
  GraphLinkRenderStyle,
  GraphLinkTypeCore,
  NormalizedGraphLinkTypeCore,
} from "./graph-types.js";

const DEFAULT_COLOR = "#7aa2ff";
const DEFAULT_RENDER_STYLE: GraphLinkRenderStyle = "line";
const DEFAULT_DIRECTION_MODE: GraphLinkDirectionMode = "child";
const DEFAULT_OPACITY = 1;
const DEFAULT_LINE_THICKNESS = 1.5;
const DEFAULT_LINE_LENGTH_MULTIPLIER = 1;
const DEFAULT_FORCE_STRENGTH = 1;

export function normalizeGraphLinkTypeCore(
  linkType: Partial<GraphLinkTypeCore> | undefined,
): NormalizedGraphLinkTypeCore | undefined {
  const id = String(linkType?.id ?? "").trim();
  const label = String(linkType?.label ?? "").trim();
  const property = String(linkType?.property ?? "").trim();
  if (!id || !label || !property) {
    return undefined;
  }

  return {
    id,
    label,
    property,
    color: normalizeGraphLinkColor(linkType?.color),
    renderStyle: normalizeGraphLinkRenderStyle(linkType?.renderStyle),
    directionMode: normalizeGraphLinkDirectionMode(linkType?.directionMode),
    opacity: normalizePositiveGraphNumber(linkType?.opacity, DEFAULT_OPACITY),
    lineThickness: normalizePositiveGraphNumber(linkType?.lineThickness, DEFAULT_LINE_THICKNESS),
    lineLengthMultiplier: normalizePositiveGraphNumber(
      linkType?.lineLengthMultiplier,
      DEFAULT_LINE_LENGTH_MULTIPLIER,
    ),
    forceStrength: normalizePositiveGraphNumber(linkType?.forceStrength, DEFAULT_FORCE_STRENGTH),
  };
}

export function normalizeGraphLinkColor(color: string | undefined): string {
  const normalized = String(color ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : DEFAULT_COLOR;
}

export function normalizeGraphLinkRenderStyle(
  value: GraphLinkRenderStyle | undefined,
): GraphLinkRenderStyle {
  return value === "folder" ? "folder" : DEFAULT_RENDER_STYLE;
}

export function normalizeGraphLinkDirectionMode(
  value: GraphLinkDirectionMode | undefined,
): GraphLinkDirectionMode {
  return value === "parent" ? "parent" : DEFAULT_DIRECTION_MODE;
}

export function normalizePositiveGraphNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}
