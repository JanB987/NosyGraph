/**
 * Returns whether an expansion source can contribute runtime edges during a
 * rebuild. Canonical sources are represented by their file path; duplicate
 * expansion sources may only exist as runtime nodes and therefore need the
 * node identity fallback.
 */
export function isExpansionSourceAvailable(
  sourcePathRaw: string,
  sourceNodeIdRaw: string,
  visibleFilePaths: ReadonlySet<string>,
  runtimeNodeIds: ReadonlySet<string>,
): boolean {
  const sourcePath = String(sourcePathRaw ?? "").trim();
  const sourceNodeId = String(sourceNodeIdRaw ?? "").trim();
  if (!sourcePath || !sourceNodeId) return false;
  return visibleFilePaths.has(sourcePath) || runtimeNodeIds.has(sourceNodeId);
}
