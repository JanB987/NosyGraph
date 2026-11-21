export interface RelationshipEdgeDefinition {
  definitionId: string;
  property: string;
  properties?: readonly string[];
  semantic: "link" | "parent" | "lens";
}

export interface RelationshipEdgeCandidate<T extends RelationshipEdgeDefinition> {
  property: string;
  readProperties: readonly string[];
  definition?: T;
}

function normalize(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}

export function matchesRelationshipProperty(definition: RelationshipEdgeDefinition, property: string): boolean {
  return normalize(definition.property) === property
    || (definition.properties ?? []).some((readProperty) => normalize(readProperty) === property);
}

export function allowsRelationshipEdges(definition: RelationshipEdgeDefinition): boolean {
  return definition.semantic !== "lens";
}

export function resolveVisibleRelationshipSelector(
  value: string,
  registry: readonly (RelationshipEdgeDefinition & { key?: string; file?: { basename?: string } })[],
  resolveLinkPath: (path: string) => string | undefined
): string {
  const token = normalize(value);
  const exact = registry.find((definition) => normalize(definition.definitionId) === token);
  if (exact) return exact.definitionId;
  const wikiLink = value.match(/^\[\[([^|\]#]+)/);
  if (wikiLink) return resolveLinkPath(wikiLink[1].trim()) ?? value;
  if (registry.some((definition) => matchesRelationshipProperty(definition, token))) return token;
  const named = registry.find((definition) =>
    normalize(definition.key ?? "") === token || normalize(definition.file?.basename ?? "") === token
  );
  return named?.definitionId ?? token;
}

/** A definition reference is authoritative. Raw properties resolve only against this context's enabled definitions. */
export function resolveRelationshipEdgeCandidates<T extends RelationshipEdgeDefinition>(
  selectors: Iterable<string>,
  enabled: readonly T[],
  known: readonly T[] = enabled
): RelationshipEdgeCandidate<T>[] {
  const out: RelationshipEdgeCandidate<T>[] = [];
  const seen = new Set<string>();
  for (const raw of selectors) {
    const token = normalize(raw);
    if (!token || token.startsWith("[[")) continue;
    const exact = enabled.find((definition) => normalize(definition.definitionId) === token);
    const matches = exact ? [exact] : enabled.filter((definition) => matchesRelationshipProperty(definition, token));
    if (!exact && known.some((definition) => normalize(definition.definitionId) === token)) continue;
    for (const definition of matches) {
      const property = normalize(definition.property);
      const id = definition.definitionId || property;
      if (!property || seen.has(id) || !allowsRelationshipEdges(definition)) continue;
      seen.add(id);
      const readProperties = Array.from(new Set((definition.properties ?? []).map(normalize).filter(Boolean)));
      out.push({ property, readProperties: readProperties.length ? readProperties : [property], definition });
    }
    if (matches.length || known.some((definition) => matchesRelationshipProperty(definition, token)) || seen.has(token)) continue;
    seen.add(token);
    out.push({ property: token, readProperties: [token] });
  }
  return out;
}

/** Visible raw properties retain their legacy lookup when no Lens competes for that property. */
export function resolveVisibleRelationshipDefinitions<T extends RelationshipEdgeDefinition>(
  selectors: readonly string[],
  registry: readonly T[],
  active: readonly T[]
): T[] {
  const out = new Map<string, T>();
  for (const selector of selectors) {
    const token = normalize(selector);
    const exact = registry.find((definition) => normalize(definition.definitionId) === token);
    const matching = exact ? [exact] : registry.filter((definition) => matchesRelationshipProperty(definition, token));
    const ambiguousLens = !exact && matching.some((definition) => definition.semantic === "lens");
    for (const definition of matching) {
      if (ambiguousLens && allowsRelationshipEdges(definition)
        && !active.some((entry) => entry.definitionId === definition.definitionId)) continue;
      out.set(definition.definitionId, definition);
    }
  }
  return [...out.values()];
}
