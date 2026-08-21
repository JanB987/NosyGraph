export interface NoteTypeIdentifier {
  property: string;
  value: string;
}

export interface NoteTypeIdentifierSettings {
  graph: NoteTypeIdentifier;
  linkType: NoteTypeIdentifier;
  group: NoteTypeIdentifier;
}

export const DEFAULT_NOTE_TYPE_IDENTIFIERS: NoteTypeIdentifierSettings = {
  graph: { property: "o3Graph", value: "true" },
  linkType: { property: "o3LinkType", value: "true" },
  group: { property: "type", value: "graphGroup" }
};

export function normalizeNoteTypeIdentifiers(raw: unknown): NoteTypeIdentifierSettings {
  const source = raw && typeof raw === "object" ? raw as Partial<Record<keyof NoteTypeIdentifierSettings, unknown>> : {};
  return {
    graph: normalizeIdentifier(source.graph, DEFAULT_NOTE_TYPE_IDENTIFIERS.graph),
    linkType: normalizeIdentifier(source.linkType, DEFAULT_NOTE_TYPE_IDENTIFIERS.linkType),
    group: normalizeIdentifier(source.group, DEFAULT_NOTE_TYPE_IDENTIFIERS.group)
  };
}

export function frontmatterMatchesIdentifier(
  frontmatter: Record<string, unknown> | null | undefined,
  identifier: NoteTypeIdentifier
): boolean {
  if (!frontmatter || typeof frontmatter !== "object") return false;
  const property = String(identifier.property ?? "").trim();
  const expected = normalizeIdentifierValue(identifier.value);
  if (!property || !expected) return false;

  const actual = readCaseInsensitiveProperty(frontmatter, property);
  if (actual === undefined) return false;
  return valueContainsNormalized(actual, expected);
}

export function identifierFrontmatterValue(identifier: NoteTypeIdentifier): unknown {
  const value = String(identifier.value ?? "").trim();
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return value;
}

function normalizeIdentifier(raw: unknown, fallback: NoteTypeIdentifier): NoteTypeIdentifier {
  const source = raw && typeof raw === "object" ? raw as Partial<NoteTypeIdentifier> : {};
  const property = String(source.property ?? "").trim() || fallback.property;
  const value = String(source.value ?? "").trim() || fallback.value;
  return { property, value };
}

function readCaseInsensitiveProperty(frontmatter: Record<string, unknown>, property: string): unknown {
  if (Object.prototype.hasOwnProperty.call(frontmatter, property)) {
    return frontmatter[property];
  }
  const normalizedProperty = normalizeProperty(property);
  for (const [key, value] of Object.entries(frontmatter)) {
    if (normalizeProperty(key) === normalizedProperty) {
      return value;
    }
  }
  return undefined;
}

function valueContainsNormalized(actual: unknown, expected: string): boolean {
  if (Array.isArray(actual)) {
    return actual.some((item) => valueContainsNormalized(item, expected));
  }
  if (actual && typeof actual === "object") {
    return normalizeIdentifierValue(JSON.stringify(actual)).includes(expected);
  }
  return normalizeIdentifierValue(actual).includes(expected);
}

function normalizeIdentifierValue(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeProperty(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}
