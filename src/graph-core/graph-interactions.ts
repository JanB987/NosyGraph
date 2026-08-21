export type GraphLinkMutationAction = "add_or_create_link" | "remove_link";

export interface GraphLinkMutationCommandCore {
  action: GraphLinkMutationAction;
  parentReference: string;
  childReference: string;
  property: string;
}

export interface GraphLinkDropIntentCore {
  action: GraphLinkMutationAction;
  parentNodeId: string;
  childNodeId: string;
  linkTypeId: string;
}

export interface ResolveGraphLinkDropCoreOptions {
  intent: Pick<GraphLinkDropIntentCore, "action">;
  existingLink: boolean;
  parentReference: string;
  childReference: string;
  linkTypeProperty: string;
}

export interface ResolvedGraphLinkDropCore {
  shouldEnsureExpanded: boolean;
  command: GraphLinkMutationCommandCore;
}

export function resolveGraphLinkDropCore(
  options: ResolveGraphLinkDropCoreOptions,
): ResolvedGraphLinkDropCore | undefined {
  if (options.intent.action === "add_or_create_link" && options.existingLink) {
    return undefined;
  }
  if (options.intent.action === "remove_link" && !options.existingLink) {
    return undefined;
  }

  return {
    shouldEnsureExpanded: options.intent.action === "add_or_create_link",
    command: {
      action: options.intent.action,
      parentReference: options.parentReference,
      childReference: options.childReference,
      property: options.linkTypeProperty,
    },
  };
}
