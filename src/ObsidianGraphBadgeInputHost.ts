import type { App } from "obsidian";
import { ObsidianGraphLinkInputHandler } from "./ObsidianGraphLinkInputHandler";
import { ObsidianGraphLinkMutationHandler } from "./ObsidianGraphLinkMutationHandler";
import { planGraphBadgeMembership, type BadgeMembershipConfig } from "./ObsidianGraphBadgeMembership";
import { getGraphMarkdownFile } from "./ObsidianGraphNoteLinkPaste";
import { submitGraphBadgeInput } from "./graph-application/GraphBadgeInputSubmission";
import type { MatchGraphNodeClipboard } from "./GraphNodeClipboard";
import type { BadgeMembershipPreferencePort } from "./graph-application/BadgeMembershipPreference";
import type { GraphBadgeBatchCommitted, GraphBadgeLinkInputRequest, GraphBadgeMembershipResult } from "./graph-application/GraphLinkMutation";

export interface GraphBadgeInputIntegration {
  matchClipboard: MatchGraphNodeClipboard;
  preference: BadgeMembershipPreferencePort;
  onBatchCommitted?: GraphBadgeBatchCommitted;
  onMembershipCommitted?(result: GraphBadgeMembershipResult): void;
}

export function requestGraphBadgeInput(
  app: App,
  request: GraphBadgeLinkInputRequest,
  host: GraphBadgeInputIntegration,
  membershipConfig: () => BadgeMembershipConfig
) {
  const write = request.write;
  const planner = planGraphBadgeMembership(app, request.membership, membershipConfig);
  const membership = write?.semantic === "lens" && request.membership.kind !== "lens" ? null : planner;
  const mutation = new ObsidianGraphLinkMutationHandler(app);
  const reportRefresh = (refresh: () => void) => {
    try {
      refresh();
    } catch (error) {
      console.error("[GraphLinkInput] Failed to refresh a graph after saving badge input:", error);
    }
  };
  const input = new ObsidianGraphLinkInputHandler(app, host.matchClipboard, host.preference, membership, (entries, origin, option) => {
    if (!write) throw new Error("The badge has no write property.");
    return submitGraphBadgeInput(entries, origin, membership ? option : { kind: "off" }, {
      isCurrent: ({ path, file }) => getGraphMarkdownFile(app, path) === file,
      addRelationships: (notes) => mutation.applyBadgeLinkAdd({
        ...write,
        sources: notes.map(({ path }) => ({ nodeId: path, path })),
        origin
      }),
      addMembership: planner.append,
      onRelationshipsChanged: (result) => reportRefresh(() => host.onBatchCommitted?.(write, result)),
      onMembershipChanged: (result) => reportRefresh(() => host.onMembershipCommitted?.(result))
    });
  });
  return input.requestLinkInput(request);
}
