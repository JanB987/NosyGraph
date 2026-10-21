import type {
  LensLinkTypeDefinition,
  LinkDiscoveryDirection,
  LinkPointerDirection,
  LinkTypeActivationPolicy,
  LinkTypeDefinitionReference,
  LinkTypeIconKind,
  LinkTypeRenderStyle,
} from "./types.js";

export interface LensLinkTypeDefinitionInput {
  id?: unknown;
  definitionReference?: unknown;
  label?: unknown;
  property?: unknown;
  properties?: unknown;
  writeProperty?: unknown;
  discoveryDirection?: unknown;
  pointerDirection?: unknown;
  color?: unknown;
  renderStyle?: unknown;
  opacity?: unknown;
  lineThickness?: unknown;
  lineLengthMultiplier?: unknown;
  forceStrength?: unknown;
}

export interface LensLinkTypeValidation {
  definition?: LensLinkTypeDefinition;
  errors: readonly string[];
}

export const LENS_LINK_TYPE_ACTIVATION_POLICY: LinkTypeActivationPolicy = {
  allowsPropertyOverlap: true,
  allowsMultipleDefinitions: true,
};

/**
 * Normalizes a note-backed Lens without importing Obsidian or mutating input.
 * The serialized reference remains the configured Obsidian link text; `id` is
 * only a runtime key and defaults to that reference.
 */
export function validateLensLinkTypeDefinition(
  input: LensLinkTypeDefinitionInput | undefined,
): LensLinkTypeValidation {
  const errors: string[] = [];
  const definitionReference = normalizeText(input?.definitionReference);
  if (!definitionReference) errors.push("A Lens definition reference is required.");

  const properties = normalizeProperties(input?.property, input?.properties);
  if (properties.length === 0) errors.push("At least one Lens read property is required.");

  const explicitWriteProperty = normalizeText(input?.writeProperty).toLowerCase();
  const writeProperty = explicitWriteProperty || properties[0] || "";
  if (explicitWriteProperty && !properties.includes(explicitWriteProperty)) {
    errors.push("writeProperty must be one of the configured read properties.");
  }

  const discoveryDirection = normalizeDiscoveryDirection(input?.discoveryDirection);
  const pointerDirection = normalizePointerDirection(input?.pointerDirection);

  if (errors.length > 0) return { errors };

  const id = normalizeText(input?.id) || definitionReference;
  const label = normalizeText(input?.label) || definitionReference;
  const iconKind: LinkTypeIconKind = "lens";
  return {
    errors: [],
    definition: {
      id,
      definitionReference: definitionReference as LinkTypeDefinitionReference,
      label,
      property: properties[0],
      properties,
      writeProperty,
      semantic: "lens",
      iconKind,
      directionMode: "child",
      discoveryDirection,
      pointerDirection,
      activationPolicy: LENS_LINK_TYPE_ACTIVATION_POLICY,
      layout: "force",
      color: normalizeColor(input?.color),
      renderStyle: normalizeRenderStyle(input?.renderStyle),
      opacity: normalizePositiveNumber(input?.opacity, 1),
      lineThickness: normalizePositiveNumber(input?.lineThickness, 1.5),
      lineLengthMultiplier: normalizePositiveNumber(input?.lineLengthMultiplier, 1),
      forceStrength: normalizePositiveNumber(input?.forceStrength, 1),
    },
  };
}

export function normalizeLensLinkTypeDefinition(
  input: LensLinkTypeDefinitionInput | undefined,
): LensLinkTypeDefinition | undefined {
  return validateLensLinkTypeDefinition(input).definition;
}

export function normalizeLensReadProperties(...values: unknown[]): string[] {
  return normalizeProperties(...values);
}

function normalizeProperties(...values: unknown[]): string[] {
  const properties: string[] = [];
  const seen = new Set<string>();
  const add = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }
    const normalized = normalizeText(value).toLowerCase();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    properties.push(normalized);
  };
  values.forEach(add);
  return properties;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeDiscoveryDirection(value: unknown): LinkDiscoveryDirection {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === "incoming" || normalized === "both" ? normalized : "outgoing";
}

function normalizePointerDirection(value: unknown): LinkPointerDirection {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === "incoming" || normalized === "none" ? normalized : "outgoing";
}

function normalizeColor(value: unknown): string {
  const normalized = normalizeText(value);
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : "#7aa2ff";
}

function normalizeRenderStyle(value: unknown): LinkTypeRenderStyle {
  return normalizeText(value).toLowerCase() === "folder" ? "folder" : "line";
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}
