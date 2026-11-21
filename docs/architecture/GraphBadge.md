# GraphBadge

## Purpose

`GraphBadge` describes one link-type expansion control attached to a [GraphNodeInstance](GraphNodeInstance.md).

Current read model: [`src/graph-domain/GraphBadge.ts`](../../src/graph-domain/GraphBadge.ts)

`createGraphBadgeId(nodeId, linkTypeId)` provides the stable identity used by legacy snapshots and newly materialized target-node badges.

## Core data

```ts
interface GraphBadge {
  id: BadgeId;
  nodeId: NodeInstanceId;
  linkTypeId: LinkTypeId;
  contextId: GraphContextId;
  label: string;
  color: string;
  state: "collapsed" | "expanded";
  semantic: "link" | "parent";
  hasRelationships: boolean;
  duplicateNodes: boolean;
  expansionId?: ExpansionId;
}
```

## Functions

```ts
buildNodeBadges(node, note, linkTypes): readonly GraphBadge[];
createGraphBadgeId(nodeId, linkTypeId): BadgeId;
```

## Click flow

1. The temporary `O3NodeBadge` DOM wrapper emits a badge intent.
2. [GraphController](GraphController.md) resolves the command and creates a [GraphBadgeRequest](GraphBadgeRequest.md).
3. `GraphController` delegates the request to the badge application boundary. `GraphBadgeExpansionCoordinator` selects the runtime operation while the legacy adapter remains temporary.
4. A later extraction will move that operation into [GraphExpansion](GraphExpansion.md) functions and apply its result to [GraphStore](GraphStore.md).

The badge itself does not mutate graph or note state.

## Clipboard batch input

Alt-click opens the existing Obsidian search/create modal. The input previews links from the paste event or from text inserted directly into the field. If the field changes without an input event, Enter first opens the preview. The last successful graph Copy or Cut publication is retained as exact text and canonical paths for the current plugin session. When checking the badge field value, the association also accepts the published text with line breaks removed by the single-line input. The existing source-frontmatter and property-widget paste handlers still match exact text. [Clipboard state](../../src/GraphNodeClipboard.ts)

The parser recognizes wiki and Markdown links, aliases, subpaths, and common bullet and quoted property-list wrappers. It reports malformed syntax and ignored text with source spans. The Obsidian resolver validates registered paths or resolves external references using the clicked note as context. Full paths and row statuses are visible before submission. An external clipboard contains no source-note context, and ambiguous shorthand links require a full path. Exact standalone Markdown paths are recognized when at least one pasted path identifies an existing note. [Parser](../../src/graph-application/GraphNoteLinkPaste.ts), [resolver](../../src/ObsidianGraphNoteLinkPaste.ts)

The live engine captures the runtime node, its context, and the exact LinkType definition. The write contract supplies the actual read and write properties and `linkDiscoveryDirection`. The modal revalidates the target, definition, and selected note identities on Enter or Add. The add-only writer checks equivalent properties inside each frontmatter callback. Outgoing and both write on the clicked note. Incoming writes independently on each selected note and exposes per-file failures for retry. Links use Obsidian's formatter with the destination file as context, and relationships are note-level. [Engine](../../src/GraphEngine.ts), [write contract](../../src/graph-application/GraphLinkMutation.ts), [writer](../../src/ObsidianGraphLinkMutationHandler.ts)

Both hosts use the same submission flow for search, creation, and clipboard input. The global **Also add to graph membership** preference defaults to On and saves immediately from settings or the modal. Where offered, On makes primary additions and already-present relationships qualify for membership. The modal displays the enclosing note and property and requires one choice when several properties contain the clicked note. Input on a Lens LinkType badge in a note-backed graph writes the clicked Lens property. Inside an enclosing LinkType Lens, the secondary destination is a read property on the immediate enclosing Lens source. [Host integration](../../src/ObsidianGraphBadgeInputHost.ts), [membership toggle plan](BadgeInputMembershipTogglePlan.md)

The two write phases return separate outcomes and refresh paths. A retry can finish membership after a successful primary write, and turning Off skips the outstanding membership on the next submission. Frontmatter changes revalidate the chosen property and note identities inside the file queue. Note-backed views reconcile configured roots. Lens refresh uses the enclosing source and definition identities and restores surviving viewport state and expansions.

Clipboard batches skip missing notes, attachments, external URIs, self-links, and unresolved or ambiguous references. Missing notes can still be created through ordinary single-note search. Source-frontmatter and property-widget interception remains scoped to the remembered text. Native body paste uses the published text and therefore retains the copying graph's formatting context.

## Current migration state

[LegacyGraphSnapshotAdapter](LegacyGraphSnapshotAdapter.md) exposes configured badges for outer and embedded nodes. [LegacyGraphExpansionBadgeAdapter](LegacyGraphExpansionBadgeAdapter.md) creates the same host-neutral records for nodes that a new expansion will make visible. Normal, parent, and duplicate-node semantics are preserved. `GraphQueries` can return all badges, one badge by stable ID, or the badges belonging to a node.

All current graph-node badge clicks now enter [GraphController](GraphController.md) as stable-ID commands. `O3NodeBadge` knows only how to render and emit one of three intents; it no longer imports Obsidian files, the Obsidian app, or `GraphEngine`. [LegacyBadgeCommandAdapter](LegacyBadgeCommandAdapter.md) temporarily implements the output port so expansion behavior remains unchanged.

The older orbiting parent badges and parent-actions overlay use the same `toggle-badge` command. This means normal badges and both parent-specific controls now share one application entry point even though their drawing code has not yet been unified.

## Live visibility policy

The live engine delegates badge visibility decisions to [GraphRenderVisibilityPolicy](GraphRenderVisibilityPolicy.md). Badges are hidden on unselected nodes during normal viewing. Selecting a node reveals its configured badges; the configured show-all key and an active drag target retain their explicit reveal behavior. Marquee and active dragged-node suppression remain unchanged.
