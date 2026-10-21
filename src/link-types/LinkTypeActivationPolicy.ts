import type {
  LinkTypeActivationConflict,
  LinkTypeActivationResult,
  LinkTypeDefinition,
} from "./types.js";

/** Returns the normalized read properties used for activation conflicts. */
export function getLinkTypeReadProperties(linkType: Pick<LinkTypeDefinition, "property" | "properties">): string[] {
  const values = [linkType.property, ...(linkType.properties ?? [])];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const property = String(value ?? "").trim().toLowerCase();
    if (!property || seen.has(property)) continue;
    seen.add(property);
    result.push(property);
  }
  return result;
}

/**
 * Lenses can overlap any property. Non-Lens definitions remain exclusive on
 * every read property and return conflicts instead of replacing existing data.
 */
export function evaluateLinkTypeActivation(
  activeDefinitions: readonly LinkTypeDefinition[],
  requestedDefinition: LinkTypeDefinition,
): LinkTypeActivationResult {
  if (requestedDefinition.semantic === "lens") return { accepted: true };

  const requestedProperties = new Set(getLinkTypeReadProperties(requestedDefinition));
  const conflicts: LinkTypeActivationConflict[] = [];
  for (const active of activeDefinitions) {
    if (active.semantic === "lens") continue;
    for (const property of getLinkTypeReadProperties(active)) {
      if (!requestedProperties.has(property)) continue;
      conflicts.push({
        property,
        existingDefinitionId: active.id,
        requestedDefinitionId: requestedDefinition.id,
      });
    }
  }

  return conflicts.length > 0
    ? { accepted: false, conflicts }
    : { accepted: true };
}
