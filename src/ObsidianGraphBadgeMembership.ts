import type { App, TFile } from "obsidian";
import type { GraphPropertyKeys } from "./GraphPropertyKeys";
import type { LinkTypePropertyKeys } from "./NoteTypePropertyKeys";
import { resolveEffectiveRootProperties } from "./GraphRootPropertyResolver";
import { O3LinkType } from "./O3LinkType";
import { getGraphMarkdownFile, graphPropertyContainsNote } from "./ObsidianGraphNoteLinkPaste";
import { ObsidianGraphRootPropertyMutationHandler } from "./ObsidianGraphRootPropertyMutationHandler";
import { MEMBERSHIP_UNAVAILABLE } from "./graph-application/GraphBadgeInputSubmission";
import type { GraphBadgeMembershipContext, GraphBadgeMembershipDestination, GraphBadgeMembershipResult } from "./graph-application/GraphLinkMutation";

export interface BadgeMembershipConfig {
  graphPropertyKeys: GraphPropertyKeys;
  defaultRootNodeProperties: readonly string[];
  linkTypePropertyKeys: LinkTypePropertyKeys;
}

export interface BadgeMembershipPlanner {
  destinations(): GraphBadgeMembershipDestination[];
  unavailableReason: string;
  append(destination: GraphBadgeMembershipDestination, entries: readonly { path: string; file: TFile }[]): Promise<GraphBadgeMembershipResult>;
}

export function planGraphBadgeMembership(
  app: App,
  context: GraphBadgeMembershipContext,
  getConfig: () => BadgeMembershipConfig
): BadgeMembershipPlanner {
  const owner = context.kind === "unavailable" ? undefined : getGraphMarkdownFile(app, context.ownerPath);
  const reference = context.kind === "unavailable" ? undefined : getGraphMarkdownFile(app, context.referencePath);
  const lensDefinition = context.kind === "lens" ? getGraphMarkdownFile(app, context.definitionId) : undefined;
  const reasons = context.kind === "unavailable" ? context.reason : "";
  const normalized = (name: string) => name.trim().toLowerCase();
  const candidateKeys = (frontmatter: Record<string, unknown>): string[] => {
    if (context.kind === "unavailable") return [];
    const config = getConfig();
    if (context.kind === "note") {
      return resolveEffectiveRootProperties(frontmatter, config.graphPropertyKeys, config.defaultRootNodeProperties).propertyKeys;
    }
    if (!lensDefinition || getGraphMarkdownFile(app, context.definitionId) !== lensDefinition) return [];
    const current = new O3LinkType(lensDefinition, app.metadataCache.getFileCache(lensDefinition)?.frontmatter, config.linkTypePropertyKeys);
    if (current.semantic !== "lens" || !current.isValid || current.linkDiscoveryDirection !== "outgoing") return [];
    const expected = new Set(context.readProperties.map(normalized));
    const properties = new Set(current.properties.map(normalized));
    if (expected.size !== properties.size || [...expected].some((key) => !properties.has(key))) return [];
    return Object.keys(frontmatter).filter((key) => properties.has(normalized(key)) && normalized(key) !== "none-type links")
      .sort((a, b) => Number(context.provenance.includes(normalized(b))) - Number(context.provenance.includes(normalized(a))));
  };
  return {
    unavailableReason: reasons ? `${MEMBERSHIP_UNAVAILABLE} ${reasons}` : MEMBERSHIP_UNAVAILABLE,
    destinations: () => {
      if (context.kind === "unavailable" || !owner || !reference
        || getGraphMarkdownFile(app, context.ownerPath) !== owner
        || getGraphMarkdownFile(app, context.referencePath) !== reference) return [];
      const frontmatter = app.metadataCache.getFileCache(owner)?.frontmatter ?? {};
      return candidateKeys(frontmatter)
        .filter((property) => graphPropertyContainsNote(app, frontmatter[property], context.referencePath, context.ownerPath))
        .map((property) => Object.freeze({
          ownerPath: context.ownerPath, referencePath: context.referencePath, property,
          ...(context.kind === "lens" ? { lensDefinitionId: context.definitionId } : {})
        }));
    },
    append: async (destination, entries) => {
      if (!owner || !reference || context.kind === "unavailable"
        || destination.ownerPath !== context.ownerPath || destination.referencePath !== context.referencePath
        || destination.lensDefinitionId !== (context.kind === "lens" ? context.definitionId : undefined)) {
        return { destination, items: entries.map(({ path }) => ({ path, status: "stale" })), changedFilePaths: [] };
      }
      return new ObsidianGraphRootPropertyMutationHandler(app).appendBadgeMembership(
        destination, owner, reference, entries,
        (frontmatter) => candidateKeys(frontmatter).includes(destination.property)
      );
    }
  };
}
