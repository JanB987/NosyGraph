import type { GraphViewState } from "../views/GraphViewStateStore.js";
import {
  addGraphRoot,
  ensureGraphExpansion,
  getGraphExpansionId,
  removeGraphRoot,
  toggleGraphExpansion,
} from "../graph-core/graph-actions.js";
import type { GraphLinkMutationCommandCore } from "../graph-core/graph-interactions.js";

export type GraphLinkMutationCommand = GraphLinkMutationCommandCore;

export interface GraphExpansionSource {
  nodeId: string;
  sourcePath: string;
  linkTypeId: string;
}

export class GraphMutationService {
  addRoot(viewState: GraphViewState, rootPath: string): boolean {
    return addGraphRoot(viewState, rootPath);
  }

  removeRoot(viewState: GraphViewState, rootPath: string): boolean {
    return removeGraphRoot(viewState, rootPath);
  }

  toggleLinkTypeExpansion(viewState: GraphViewState, source: GraphExpansionSource): boolean {
    return toggleGraphExpansion(viewState, source);
  }

  ensureLinkTypeExpanded(viewState: GraphViewState, source: GraphExpansionSource): boolean {
    return ensureGraphExpansion(viewState, source);
  }

  getExpansionId(nodeId: string, linkTypeId: string): string {
    return getGraphExpansionId(nodeId, linkTypeId);
  }
}
