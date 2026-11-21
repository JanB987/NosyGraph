import { extractInternalLinkCandidates } from "./linkResolver";

/** Inspect one real frontmatter key without altering ambiguous values or their surrounding data. */
export function inspectMembershipReference(value: unknown, referencePath: string, resolve: (reference: string) => string | undefined) {
  const values: readonly unknown[] = Array.isArray(value) ? value : [value];
  const entries = values.map(item => {
    const candidates = extractInternalLinkCandidates(item);
    const matches = candidates.some(reference => resolve(reference) === referencePath);
    const text = typeof item === "string" ? item.trim() : "";
    const safe = candidates.length === 1 && text !== "" && (
      /^\[\[[^[\]]+\]\]$/.test(text)
      || /^\[[^\]]*\]\([^()]+\)$/.test(text)
      || !/[\[\]{},;\n]/.test(text)
    );
    return { item, matches, safe };
  });
  return {
    matches: entries.some(entry => entry.matches),
    ambiguous: entries.some(entry => entry.matches && !entry.safe),
    remaining: entries.filter(entry => !entry.matches).map(entry => entry.item)
  };
}
