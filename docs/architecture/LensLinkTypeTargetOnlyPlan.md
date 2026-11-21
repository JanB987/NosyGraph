# Lens LinkType target-only viewport correction plan

Release status (2026-11-21): implemented. The maintainer confirmed the features and manual Obsidian testing before the 0.3.0 release. Earlier planning and verification notes below are historical; see the [0.3.0 verification guide](../releases/0.3.0-release-guide.md) for the current release checks.

Status: planning only, 2026-11-20. Source inspected; no implementation changes or test execution. The user will conduct testing. Preserve the implemented badge icons, clipboard input, membership toggle, and existing note-backed lens behavior.

## Required result

For a note `A` with `scope: ["[[B]]", "[[C]]"]`, opening its Lens LinkType badge must initially display **B and C inside the lens**. A remains the external node anchoring/owning that viewport; opening the badge must not create another visible A inside it.

Membership comes from the union of the Lens definition's configured read properties, deduplicated by note path, with property provenance retained. Zero targets means a valid empty lens, not an automatic parent-only lens. One target means exactly one initial member. Preserve the existing resolver's self-link exclusion; this correction does not introduce new self-link semantics.

This applies to Lens LinkType viewports in main views, rendered embeds, nested lenses, live refresh, close/reopen, and saved-state restoration. The old graph-capable-note lens icon continues to load that note's configured graph contents through its existing path.

The requirement concerns initial/direct lens membership. Preserve the user's ability to explicitly expand relationships on a valid member and restore those genuine descendant expansions. Do not globally hide every instance whose path equals A: that could remove an independently requested relationship elsewhere. Remove the automatically injected source member at its construction/restoration boundary.

## Confirmed source of the bug

`src/GraphEngine.ts`, `buildLensEmbeddedGraphDefinition`, currently:

1. Resolves outgoing Lens targets from the source note.
2. Starts `snapshots` with a synthetic root for `originNode.sourcePath` at `(0, 0)`, carrying the Lens badge as expanded.
3. Appends each target as an `origin.kind: "expansion"` whose `sourceNodeId` points to that synthetic parent.

`expandEmbeddedGraph` materializes every supplied snapshot as a visible node. It also reconstructs expansion ownership and source-to-child edges from those origin records. The parent appearance is therefore produced by the Lens-specific data builder, not by an icon, CSS, clipboard, or note-property write.

This was explicit historical behavior: `docs/architecture/LensLinkTypeIteration1.md` describes the viewport as containing the source node plus targets. The user's current requirement supersedes that earlier contract.

The old icon routes through `toggleEmbeddedGraph` and `onEmbeddedGraphExpansionRequested` to the note-backed graph definition. It does not use the synthetic-source construction in `buildLensEmbeddedGraphDefinition`, explaining the difference in behavior.

## Why deleting one snapshot is insufficient

- Leaving target origins as expansions of the now-absent source would create dangling provenance. Expansion reconstruction, normalization, descendant pruning, and save/restore use those origins.
- Saved lens entries can contain the old source root and old target-expansion origins. Reopening must reconcile against current membership rather than replay those snapshots unchanged.
- `GraphView.restoreEmbeddedGraphExpansions` currently uses the generic root merge even for LinkType-lens entries. The nested restore path in `GraphEngine` already branches to `reconcileLensMembershipSnapshots` for runtime Lens definitions; all entry paths need consistent semantics.
- Direct local members marked as roots can influence `embeddedRoot` behavior. This is useful for retaining members during ordinary badge collapse, but generic note-backed “Remove embedded root” commands must not mistake synthetic Lens paths for writable graph notes.
- Empty lenses currently have the injected source available for bounds/physics. Removing it exposes empty-container paths that need explicit verification.

## Recommended implementation

### Target-only snapshot construction

Change only the Lens LinkType builder to construct its initial snapshots from the resolved targets. Do not insert the source note or an automatically expanded source badge snapshot.

Represent each direct target as a **root local to the Lens viewport** using the existing root origin shape. These roots are membership seeds for that viewport; they are not new roots of the containing graph note. Keep stable target node IDs, note paths, initial coordinates, badges, and `relationshipProperties` provenance. A direct member no longer has a fake expansion-parent dependency on A.

This uses existing `O3GraphNodeOrigin` shapes and should not require a persisted schema version change. Do not add a hidden source node to the graph store or renderer merely to keep the old expansion shape working.

The external source remains in `container.origin`/`originSourcePath`, and the canonical Lens definition remains in `linkTypeId`. Continue using those fields for the anchor/connector, title, lifecycle, persistence context, body-drop destination, and membership-toggle ownership. Keep the pseudo runtime graph path internal and definition-keyed. `runtimeOnly` describes this generated definition; it does not mean its parent-owned viewport state should stop persisting.

After the source snapshot is removed, internal source-to-child star edges should no longer be synthesized. Retain normal visible relationships between member notes according to the established visibility contract. Do not create a force spring to a hidden source copy; use existing container centering/physics.

### Read-property boundary

Keep direct membership limited to actual configured Lens read properties. `resolveLensTargets` currently calls `getLinkTypeExpansionProperties`, which also adds the legacy/runtime `linkType.property` identity. For a multi-property definition this identity can be a label alias rather than a real configured read property.

Audit this behavior in the touched builder/resolver: build the authoritative candidate set from normalized `linkType.properties`, with a compatibility fallback to `property` only for a legacy definition lacking the read-property list. Respect the existing equivalent-property resolver, labels, missing-note handling, and case-insensitive matches. Add a fixture where the display/runtime identity happens to match an unrelated source property so no out-of-contract target is included. Do not globally rewrite relationship discovery as part of this fix.

### Saved state and refresh reconciliation

Use `reconcileLensMembershipSnapshots` in `GraphRootSnapshotReconciliation.ts` as the shared Lens-specific boundary, adapting it only as needed for root-local members. Fresh resolved direct members are authoritative for membership and origin. Preserve compatible saved x/y coordinates, pinned state, and explicitly expanded badges for surviving member identities.

For old saved snapshots:

- Discard the synthetic source root because it is absent from fresh direct membership.
- Promote old direct child snapshots to the fresh local-root origin while retaining their layout and property provenance.
- Keep descendants rooted in surviving direct members when they still represent explicit member badge expansions.
- Drop old descendants/nested lens entries that depend only on the removed artificial source; do not attach those entries to the external parent as an implicit migration.
- Drop genuinely removed direct targets and their dependent runtime trees. Preserve independent valid member branches.

Apply this consistently to fresh opening, `refreshOpenLensContainer`, top-level `GraphView.restoreEmbeddedGraphExpansions`, nested restoration in `expandEmbeddedGraph`, replacement/rollback definitions, and any rendered-embed restoration path that consumes saved Lens snapshots. Identify the path by Lens definition identity/runtime-definition metadata, not by a string prefix alone. Reuse the helper rather than implement multiple slightly different filters.

Filter nested saved entries against surviving runtime member IDs before restore; a nested entry rooted on the obsolete source clone must not resurrect it. Preserve valid nested lens geometry and expansion state on surviving children.

Keep source-of-truth reconciliation at read/restore time so stale persisted entries cannot reintroduce A even if a later state write fails. Persist corrected runtime state through the existing allowed owner/lifecycle policy; do not touch user relationship frontmatter or initialize state on an otherwise ephemeral note just to migrate this presentation.

### Runtime assumptions to audit

- `expandEmbeddedGraph`: source/target ID maps, root flags, expansion reconstruction, edges, visible-link refresh, and an empty `memberIds` set.
- Container bounds, fit/centering, minimum dimensions, view transforms, collision/physics loops, and maximum/restore behavior for zero or one member. Existing division guards should remain finite; no NaN/Infinity coordinates or placeholder parent nodes.
- `refreshEmbeddedBadgeExpansionAfterMutation`: local direct roots must survive a member's badge collapse; only true descendants should be removed.
- Snapshot serialization: local member roots and their property provenance survive a round trip without re-creating parent expansion ownership.
- Generic “Remove embedded root” menu entries: suppress the note-backed root-removal action for runtime Lens LinkType containers if it would target a pseudo file. Do not add a new removal feature to this correction.
- Membership toggle: `A.scope → B`, then add C through a badge on B with membership On, still appends C to A.scope even though no A copy is visible inside the lens. Off remains primary-only. Preserve the existing real source/definition projection rather than inferring the owner from visible local roots.
- The parent/its lens badge remains present outside the lens and owns open/close state. Do not remove the outer source note from the main graph, change its selection/pin, or alter same-property Lens definition identity.

Do not change the generic note-backed lens builder, root-property resolution, discovery directions, icon precedence, or clipboard syntax. Incoming/`both` lens visualization remains outside scope.

## Implementation order

1. Prepare a production-builder regression fixture demonstrating the unwanted source snapshot and expected target-only membership. Existing refresh tests often mock the builder, so they cannot alone detect this bug.
2. Build direct Lens targets as local roots, retaining external owner metadata and property provenance.
3. Verify the read-property boundary and remove accidental legacy-alias inclusion locally if the fixture confirms it.
4. Make Lens-specific reconciliation consistent across top-level/nested restore and live refresh; preserve layout and migrate old snapshot roles.
5. Audit empty-container, expansion, and generic-root menu assumptions without redesigning the runtime.
6. Prepare regression coverage and the user checklist, update the Lens behavior documentation, and run only permitted build/static verification.

## Regression coverage for user execution

The user will conduct testing. The implementation chat may prepare tests/fixtures but **must not execute test suites, control/reload Obsidian, or mutate live vault notes/clipboard for testing**. It may build, syntax-check, typecheck, and lint; report prepared tests as unexecuted.

| Scenario | Expected observation |
| --- | --- |
| A.scope links B and C | Direct Lens snapshots/members contain B and C, with no synthetic A. The outer A remains. |
| Zero/one target | Empty lens or one member, respectively; finite transforms and functional controls. |
| Multi-property overlap | One instance per target, complete actual-property provenance, no target from an unrelated property matching the badge label/runtime alias. |
| Existing relationship between children | Normal member-to-member edges render; no artificial internal parent star. |
| Production builder/materializer | Instantiate/read the real builder output through embedded materialization; assert visible instance membership and origin references, not just rendering visibility. |
| Old saved parent-plus-child state | Reopen excludes synthetic A, preserves surviving child positions/pins/badges and lens geometry, and normalizes old direct-expansion origins. |
| Source property additions/removals | Only current targets are direct members after refresh, including removal of the last target; parent never returns automatically. |
| Genuine descendants and nested lenses | Surviving child expansions/nested viewports remain; obsolete source-clone branches are pruned without affecting other contexts. |
| Multiple same-property definitions | Independent target-only viewports and independent saved state. |
| New member through badge input | Clipboard/single/create and membership On/Off retain their existing property writes; refreshed Lens targets remain source-free. |
| Body/badge drop | Existing add/remove semantics refresh the correct Lens without creating a parent snapshot. |
| Member badge collapse | Direct local members remain; only its expanded descendants disappear. |
| Old lens icon | Its note-backed membership/loading and runtime behavior remain unchanged. |
| Reopen/restart/embed | No saved source clone reappears, including nested persisted entries and rendered embeds where persistence is supported. |
| Icons and controls | Default/custom icon, Alt-click input, membership preference, close/open, fit, pan/zoom, and lens geometry retain their established behavior. |

Likely files: a new focused `LensLinkTypeContents.test.ts`, `GraphRootSnapshotReconciliation` coverage, `GraphRootRefresh.test.ts`, `GraphLensPersistence.test.ts`, `BadgeClipboardGraphIntegration.test.ts`, and relevant existing nested-lens cases. Use mocked Obsidian services/in-memory snapshots and real pure reconciliation. Prepare exact focused and full `npm test` commands for the user.

## Manual Obsidian checklist

1. Use A with a Lens LinkType reading `scope` and `deliverables`, containing overlapping links to B/C. Open A's badge: inside is B/C once each; A remains only outside.
2. Compare with the old lens icon on a graph-capable note; its established contents remain unchanged.
3. Close/reopen and reload after saving an old parent-containing layout: A does not reappear; surviving member/lens layout is retained.
4. Remove all targets, then add one target: empty/one-node lenses work without an injected parent or invalid fit/zoom behavior.
5. Open a nested lens on a member and expand/collapse that member's ordinary badge. Confirm direct members and independent nested states survive appropriately.
6. Add a note through member badge input, with membership On and Off, then via existing drop behavior. Inspect expected property values and confirm the parent is not re-inserted inside the Lens.
7. Check two definitions sharing properties, another open pane, rendered embeds, custom badge icons, and saved geometry.

## Static checks and deployment handoff

Permitted implementation checks: `npm run build`, `node --check main.js`, `npm run typecheck`, `npx tsc --noEmit -p tsconfig.json`, and applicable lint. Compare full-project diagnostics to the current baseline; do not assume prior reports still describe today's code.

Supply the rebuilt development `main.js` absolute path and SHA-256. The development plugin folder and installed `.obsidian/plugins/nosygraph/` have shared the same plugin ID; the installed bundle must match before the user reloads/tests. Do not deploy outside the authorized workspace, change installed settings, or control Obsidian under this prompt.

## Chat and model recommendation

Use a **new implementation chat in the same project**, scoped to this runtime membership correction. The appearance and membership-toggle features are already represented in current source; preserve them and avoid combining their previous task history with the fix.

Recommended: **GPT-6.2 Sol, High reasoning, Standard speed**. The construction change is small, but root/expansion ownership and saved-state reconciliation make this more reasoning-intensive than the icon feature. Sol remains the usage-conscious model choice; use High for the restoration invariants rather than raising it to Extra High/Max by default. [Model guidance](https://learn.chatgpt.com/docs/models?surface=codex).

## Implementation prompt

> Implement the correction in `C:\Users\janbe\OneDrive\Dokumentation\Test Vault\.obsidian\plugins\Bases - Graph-View\docs\architecture\LensLinkTypeTargetOnlyPlan.md`. Read the full plan and applicable repository instructions first, then inspect current source.
>
> A Lens LinkType badge must open a viewport whose direct members are only the deduplicated notes linked under its configured read properties. Remove the synthetic source root inserted by `buildLensEmbeddedGraphDefinition`; represent direct members without expansion references to an absent source. Keep the external source as the container owner/anchor. Reconcile old saved parent-plus-child snapshots across live refresh, top-level/nested restoration, and supported embeds so the source clone cannot return. Preserve valid child layouts, pins, badges, explicit descendant expansions, and nested lenses. Cover zero/one member and the generic-root action implications. Do not change the old note-backed lens icon behavior, lens direction support, relationship truth, or implemented icons/clipboard/membership toggle.
>
> I will conduct testing. Prepare focused regression fixtures and my manual checklist with expected results; do not execute test suites, control/reload Obsidian, or use real notes/clipboard for testing. Run build/static type/lint checks and distinguish existing diagnostics. Provide the rebuilt main.js path/hash and exact focused/full test commands, with a reminder to update the installed nosygraph bundle before I reload/test. Do not deploy outside the authorized workspace. Finish with the cause, changes, static results, limitations, and my verification steps. Mark testing pending user verification.
