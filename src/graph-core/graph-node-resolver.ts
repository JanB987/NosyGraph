import { normalizeGraphPath } from "./graph-actions.js";
import type { GraphNodeLookupIndex } from "./graph-types.js";

export function resolveGraphRoots(roots: string[], index: GraphNodeLookupIndex): string[] {
  return roots
    .map((root) => resolveGraphNodeId(root, index))
    .filter((root): root is string => Boolean(root));
}

export function resolveGraphNodeId(root: string, index: GraphNodeLookupIndex): string | undefined {
  const normalizedRoot = normalizeGraphPath(root);
  const direct = index.getNode(normalizedRoot);
  if (direct) {
    return direct.id;
  }

  const rootWithoutExtension = normalizedRoot.replace(/\.md$/i, "");
  for (const node of index.getAllNodes()) {
    const normalizedNodePath = normalizeGraphPath(node.path);
    const nodeWithoutExtension = normalizedNodePath.replace(/\.md$/i, "");
    const normalizedRelativePath = normalizeGraphPath(node.relativePath);
    const relativeWithoutExtension = normalizedRelativePath.replace(/\.md$/i, "");
    const normalizedName = normalizeGraphPath(node.name);
    const nameWithoutExtension = normalizedName.replace(/\.md$/i, "");

    if (
      normalizedNodePath === normalizedRoot
      || nodeWithoutExtension === rootWithoutExtension
      || normalizedRelativePath === normalizedRoot
      || relativeWithoutExtension === rootWithoutExtension
      || normalizedName === normalizedRoot.split("/").pop()
      || nameWithoutExtension === rootWithoutExtension.split("/").pop()
    ) {
      return node.id;
    }
  }

  return undefined;
}
