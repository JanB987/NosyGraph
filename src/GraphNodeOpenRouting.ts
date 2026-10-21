export type GraphNodeOpenRoute =
  | "source-graph"
  | "source-markdown"
  | "unpinned-graph"
  | "unpinned-markdown"
  | "new-markdown"
  | "graph-tab-markdown";

export interface GraphNodeOpenRouteInput {
  graphCapable: boolean;
  graphTab: boolean;
  newTab: boolean;
  sourcePinned: boolean;
}

/**
 * Keeps note-kind and leaf-state routing independent from Obsidian APIs.
 * The host adapter remains responsible for performing the chosen navigation.
 */
export function resolveGraphNodeOpenRoute(input: GraphNodeOpenRouteInput): GraphNodeOpenRoute {
  if (input.newTab) return "new-markdown";
  if (input.graphTab) return input.graphCapable ? "source-graph" : "graph-tab-markdown";
  if (input.sourcePinned) return input.graphCapable ? "unpinned-graph" : "unpinned-markdown";
  return input.graphCapable ? "source-graph" : "source-markdown";
}
