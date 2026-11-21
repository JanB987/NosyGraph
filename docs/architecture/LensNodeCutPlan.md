# Cut nodes in lenses and property expansions

Release status (2026-11-21): implemented. The maintainer confirmed the features and manual Obsidian testing before the 0.3.0 release. Earlier planning and verification notes below are historical; see the [0.3.0 verification guide](../releases/0.3.0-release-guide.md) for the current release checks.

Implemented 2026-11-21. The shared Obsidian Cut host captures the selected runtime instances, batches authorized reference edits by holder note, and reconciles connected views and rendered embeds after the property writes. Runtime ownership and property truth govern restoration. Graph-state writes require an existing state block and use the graph note’s existing persistence path. Manual verification in Obsidian is pending.

## Confirmed scope and precedence

Extend the existing selection and Cut feature to nodes in **any open classic lens, Lens LinkType viewport, nested lens, and property-backed discovered/badge expansion**. The user's latest instruction supersedes the earlier answer limiting this extension to direct lens members.

The user also confirmed:

- Ctrl+A / Cmd+A continues to select **all runtime nodes across the current graph and its open lenses**, even when one lens is focused. Do not change it to lens-local Select All.
- This feature stays **property-based**. Explain and skip nodes supported only by note-body links or Base/filter membership. Do not remove body text, modify Base definitions, or delete note files.
- Manual Obsidian testing belongs to the user.
- Implementation must include deployment to the installed plugin, leaving vault reload as the user's only installation step.

Retain the existing menu Cut node / Cut nodes, Ctrl/Cmd+X on noneditable graph surfaces, and focused-graph Cut command. Use one captured selection and one operation regardless of entry point. Keep existing Copy-compatible clipboard data, paste behavior, and clipboard-before-removal ordering.

## Expected note changes

| Selected node/context | Property reference removed |
| --- | --- |
| Outer root B in graph G | B from G's effective root properties, as today |
| B directly inside classic lens D | B from D's effective root properties, even if another graph owns its saved layout |
| B directly inside Lens LinkType A.scope | B from every matching read property belonging to that Lens definition on A |
| C in a further/nested lens | C from that immediately defining lens's real note properties |
| C shown only by expanding B's outgoing property badge | C from B's actual introducing property/read-property set |
| C shown through an incoming expansion from B | The reference to B from C's actual introducing property/read-property set |
| C shown through a `both` expansion from B | The matching forward/reverse property references that authorize that represented relationship; report partial failure if only some files can be updated |
| Body-link-only or filter-only C | No note edit; a precise skip explanation |

Cut publishes links to the **selected note paths**. For the incoming example, clipboard C even though the removed property value points to B. Nodes that disappear merely because their selected parent/introducing branch disappeared are not implicitly added to the clipboard.

A Lens reading several properties resolves their union. Remove all matching occurrences of the selected member across that selected definition's read properties so an alternate matching property cannot immediately bring it back. This is removal behavior, not the single-destination chooser used by the Add-membership toggle.

Scope edits to captured selected runtime instances and their introducing contexts. Cutting B in one lens does not search every graph note or unrelated note for references to B. Shared underlying property data naturally affects every viewport reading that data, and those viewports must refresh. Selecting several instances may deliberately select several independent memberships, but the clipboard still contains B once.

For a node with direct graph/lens membership, preserve existing direct-membership Cut semantics rather than additionally deleting unrelated relationships pointing to it. For an expansion-only instance, collect its actual active introducing expansion owners in that context; if several active expansions jointly introduce the same merged instance, remove their represented property references rather than arbitrarily picking the first owner. Do not treat an ordinary visible/overlay edge as evidence that it introduced a node. An independently valid membership can keep a note visible, which should be reflected in the result instead of forcing a global node deletion.

## Current implementation assessment

- `GraphEngine` already selects runtime node IDs through `GraphController`; ordinary clicks, Shift multiselection, Alt-marquee, context-menu selection, and global Select All operate on `nodeMap`/the store. Verify and repair lens hit-testing/store synchronization where needed instead of building a second selection model.
- `getSelectedNodeCutRefs` currently projects `ownerPath` from `embeddedDefinitionPath`. This is valid for a classic note-backed lens, but Lens LinkTypes use a synthetic `__nosygraph_lens__/...` definition path, not a writable note.
- `BasesGraphView.canCutSelectedNodes` and `cutSelectedNodesToClipboard` plan only effective root-property removals. They cannot plan arbitrary introducing relationship-property removals, incoming writes, or Lens read-property unions.
- Existing Cut identity/deduplication is `(ownerPath, selectedPath)`. That can collapse distinct property/definition edits on the same owner and cannot represent an incoming removal whose value target differs from the selected clipboard note.
- `getBadgeMembershipContext` and `ObsidianGraphBadgeMembership.ts` already distinguish note-backed contexts from a Lens source/definition and retain real read properties/provenance. Reuse this ownership knowledge for direct lens Cut; do not reuse the Add chooser or append operation as a removal implementation.
- Expansion provenance is spread across `embeddedOrigin`, `expandedVia`, `nodeOwners`, `expansionNodes`, expansion records and ordinary edges carrying definition IDs. `getPrimaryNodeOwner` intentionally chooses a first owner; it is not a complete Cut provenance resolver.
- The shared `GraphNodeCutService` already provides planning/publication/removal ordering and partial-failure buckets. Extend its plan/result contracts and ports rather than duplicate this logic per lens or renderer.
- `GraphRootMembership.ts` safely removes reference-only entries but limits candidate keys to root properties. Extract/reuse its value-preservation behavior with explicit allowed property keys for Lens/expansion removal.
- The current orchestration and app-wide in-flight guard live on `BasesGraphView`. Rendered graph embeds in `main.ts` lack Cut callbacks, despite already supporting badge property mutations. A shared host boundary is needed for consistent selection/Cut across supported graph surfaces.
- Existing root reconciliation and the newer Lens membership reconciliation cover classic and Lens contents. Current root-only `persistRootMembershipTruth` must not be blindly applied to every relationship owner: an ordinary source note is not necessarily a graph note or the owner of the runtime snapshots that need updating.

## Proposed architecture

### Selection and provenance projection

Extend the detached Cut selection contract with a discriminated origin/context, keeping note identity separate from runtime node ID:

- `graph-membership`: real graph definition note path and graph context.
- `lens-membership`: real Lens source note path, canonical enclosing Lens definition ID, declared read properties, instance identity, and member property provenance.
- `relationship-expansion`: actual source runtime/note identity, selected target note identity, introducing definition/read properties, discovery direction, and expansion/context identity. Collect all actual introducing owners for a merged expansion-only instance.
- Unavailable provenance with an explanatory reason, including body-only/filter-only or ambiguous stale ownership.

Use actual definition IDs and properties, not a badge label, pseudo path, `depth`, `isBase`, or saved-layout owner. Legacy expansion keys can be resolved against definitions enabled in that context. If an old key is ambiguous, report that target as ambiguous rather than choose the first registry entry.

Generalize the existing direct membership projection into a small reusable resolver callable by badge input and Cut where appropriate. Keep expansion-removal projection separate from Add-membership semantics. No body-link editing capability is introduced.

Preserve one selection store and stable runtime IDs. Validate selection via transformed lens node positions, clipping, and topmost hit regions; a foreground lens click must not select a hidden background node or its external parent by fallback. Preserve the existing global Select All behavior. Do not reinterpret an Alt-drag rectangle as a new lens-local command. If marquee currently includes obscured/clipped nodes unintentionally, apply existing hit/visibility rules and cover that behavior explicitly rather than changing gestures silently.

### Plan concrete reference removals

Represent planned edits as explicit references, for example `holderPath`, actual property key, referenced note identity, selected clipboard note path(s), contributing context/definition, and an operation identity. The selected note and the value being removed are different for incoming discovery.

Compute candidate keys from fresh configuration:

- Graph/classic lens: `resolveEffectiveRootProperties`, including defaults and configured/canonical root-key fallback.
- Lens LinkType: the captured canonical definition's current real read-property set on its source note.
- Outgoing/incoming/both expansion: the introducing definition's read-property set, constrained to the files and orientation of that particular relationship. A legacy discovered raw property is supported only when provenance identifies that real property unambiguously.

Use canonical note-relative link resolution, including wiki/Markdown aliases, headings, encoding, and unresolved targets where the existing Cut resolver can identify the missing-note reference. An outgoing missing-note member can be removed from its real owner; an incoming removal requiring a missing holder file is unavailable.

Deduplicate edits by actual `(holderPath, propertyKey, referencedIdentity)`, retaining the mappings back to every selected instance. Do not collapse two selected Lens definitions on the same source file before unioning their authorized edits. Do not remove a target from a property outside the captured context merely because another LinkType in the vault uses it.

Report fully unlinked, partially unlinked, skipped and failed selections separately. Count unique clipboard notes independently from edited references and property memberships.

### Shared application/host coordination

Extract the reusable host orchestration from `BasesGraphView` into a small plugin-composed coordinator, proposed `ObsidianGraphNodeCutHost.ts`, while keeping `graph-application/GraphNodeCutService.ts` free of Obsidian/DOM. Give graph views and rendered embeds thin lifecycle/selection/refresh ports. Reuse the existing plugin `GraphNodeClipboardState` and publisher so cut links paste into all established destinations unchanged.

Move the app-wide Cut guard/write-suppression state behind that shared coordinator. Update existing graph-view persistence checks that currently consult `BasesGraphView.cuttingApps`. A Cut started in an embed must prevent a simultaneous Cut in another pane and participate in the same state-write ordering.

Wire the engine's `onCutSelectedNodes`, `canCutSelectedNodes`, and Copy publication support in both main views and rendered embeds. Route the command-palette action to the graph host that actually owns keyboard focus, not an arbitrary other graph leaf. Keep command/menu availability checks read-only; use cached planning hints for UI and authoritative validation for execution.

Do not enable unrelated embedded layout persistence just because Cut now works there. Existing embed property mutations and the authoritative runtime writer policies remain the boundary.

### Commit ordering, failures and concurrent edits

1. Capture all selected instances/provenance once, including mixed outer roots and lens members, before awaiting anything.
2. Plan actual file/property edits from fresh data and validate source lifecycle/definition identities. Skip unsupported/ambiguous entries with reasons.
3. Publish the deduplicated eligible **selected note paths** through the existing clipboard publisher. If publication fails, remove nothing.
4. Group edits by actual holder file and use one queued `processFrontMatter` callback per file. Recheck current definitions/allowed keys and matching values at commit. Preserve concurrent additions, original key casing, unrelated values/types/order, and leave emptied membership properties as `[]`.
5. Only remove safely isolated references. Preserve ambiguous compound strings/objects intact and explain their skip; do not drop an entire value merely because it contains a selected link. Record successful removals only after the file mutation promise succeeds.
6. Reconcile successful edits and persist through the appropriate runtime owners, independently of any failed file. For a two-direction relationship spanning files, report a partial unlink accurately if only one side succeeds.
7. Show one result summary and clear stale selection references. Retain the originally published recovery payload on partial failure; it may include notes that could not be fully unlinked. Do not overwrite concurrent files or attempt to restore an old clipboard.

Global Ctrl+A may select both a lens source and its contents. A successful earlier group can remove the runtime container before another captured group is processed. Continue to honor the captured, still-valid note/property edits; do not treat runtime teardown caused by this same Cut as an unrelated stale-source error. External file/definition replacement remains a real revalidation failure.

Coordinate existing graph-document queues without nested waits on the same queue. No vault note deletion, body rewriting, implicit creation, membership-toggle changes, or confirmation dialog for routine Cut is required.

## Runtime refresh and persistence

Treat property truth as authoritative. Apply the correct refresh for each successful delta rather than assume every changed holder file defines graph roots:

- Graph/classic membership: reconcile configured roots, all instances of that note-backed lens, nested saved entries, and any outer views of the same graph note.
- Lens membership: reconcile target-only Lens members for the matching source/definition, preserve surviving layout and legitimate descendants, and refresh every other context actually reading the changed properties.
- Expanded relationship: refresh the introducing badge/expansion in its context, remove the lost expansion-owned instances/edges and unreachable descendants, and preserve independent roots or other ownership that still legitimately keeps a note visible. Handle incoming updates using all actual changed file paths.

Do not physically delete every runtime node sharing the selected source path. Selecting a specific duplicated instance only targets its represented association(s). Other lenses can show the same note if their backing properties remain; shared properties naturally update all dependent instances.

Prune corresponding stale runtime snapshots and nested lens entries so removed nodes cannot return after close/reopen/restart. For regular source notes changed by expansion/Lens unlinking, save the existing parent-owned graph snapshot where allowed; do not create an `o3graph` block in those regular notes or run graph-root reconciliation against arbitrary relationship properties.

Reuse `reconcileRootSnapshots`, `reconcileLensMembershipSnapshots`, metadata revalidation, and the existing queue/persistence policies. Permit intentional empty-state writes only through the current validated reconciliation path. Empty classic lenses remain graph-capable; an emptied Lens LinkType stays a valid empty target-only viewport. Preserve remaining node coordinates, viewport/lens geometry, icons, pins, badge state, and the newly implemented rule excluding ordinary Lens membership edges/springs.

## Implementation order

1. Add detached provenance/concrete-removal contracts and focused fixtures for classic, Lens LinkType, nested and property expansion cases.
2. Generalize reference-value removal with explicit allowed properties and actual mutation-holder identities; support incoming/both without confusing clipboard identity.
3. Adapt the existing Cut service's deduplication/results to concrete edits and per-selected-instance outcomes, retaining clipboard-before-write ordering.
4. Extract the shared host/guard and wire main views, rendered embeds and focused commands.
5. Complete selection hit-testing/store synchronization where needed, preserving global Ctrl+A and existing gestures.
6. Implement context-specific runtime/saved-state refresh, including mixed global selections and last-node cuts.
7. Run isolated automated verification, static checks and build; update README and architecture docs to supersede the old direct-root-only Cut scope.
8. Back up and deploy the verified bundle to the installed plugin, compare hashes, and hand over only vault reload plus manual test steps to the user.

## Automated verification by the implementation chat

The current request assigns **manual testing in Obsidian** to the user and requires a reload-only handoff. Execute meaningful isolated automated tests, builds and static checks in the implementation chat; do not carry forward older prompts' instruction to leave all automated suites unexecuted. Use mocks/in-memory files and do not exercise live notes or the real clipboard.

| Coverage | Required result |
| --- | --- |
| Selection | Click/Shift/right-click/Alt-marquee select intended runtime instances inside classic/new/nested lenses; clipping/foreground handling is correct. Ctrl+A remains global. Editable fields keep native Cut. |
| Direct membership | Correct classic definition note or Lens source/read-property union is changed, never a pseudo path or layout owner. Multiple matching read properties cannot resurrect a member. |
| Expanded nodes | Outgoing, incoming and both discovery unlink actual introducing properties; clipboard always holds the selected child note. Body/filter-only entries skip with explanations. |
| Multiple introducing owners | Expansion-only merged instances use captured introducing provenance, not arbitrary first-owner lookup or all visible graph edges. Direct roots retain direct-membership semantics. |
| Mixed global selection | Roots plus lens sources/members/expanded nodes complete from captured plans even when early refresh tears down containers. |
| Duplicate identities | One clipboard link per note; independent properties/definitions/contexts do not collapse into one lost edit. One note can legitimately remain elsewhere. |
| Failures | Clipboard rejection causes zero edits; stale target/definition, ambiguous value and failed holder files are reported; multi-file partial unlink retains recovery links and successful changes. |
| Persistence | Cut some/all/last members, close/reopen and fresh reload cannot restore obsolete membership or orphan branches. No unwanted state block appears in ordinary notes. |
| Regression | Copy/Cut paste destinations, input membership toggle, icon overrides, target-only Lens contents, Lens edge isolation, ordinary Force/Direction behavior and classic lenses remain intact. |
| Hosts and queues | View/embed/command use one operation and guard; exact changed paths refresh all relevant panes/embeds; no queue deadlock or in-flight duplicate. |

Extend the existing `GraphNodeCut.test.ts`, `GraphNodeCutInteraction.test.ts`, root refresh/snapshot and lens persistence tests; add focused lens/expansion Cut and host integration tests. Test the real provenance projection with isolated runtime fixtures as well as pure planners, so mocked ownership cannot hide the current pseudo-path bug.

Run targeted suites, `npm test`, `npm run build`, `node --check main.js`, `npm run typecheck`, `npx tsc --noEmit -p tsconfig.json`, and applicable lint. Compare current full-project diagnostics to a captured pre-change baseline. Fix new failures; report unrelated baseline failures accurately. Do not repeatedly rerun passed broad suites without a new change/reason.

## Deployment is part of completion

The user explicitly requests that the implementation chat leave only vault reload before testing. Merely returning a development build/hash does not complete this task.

Verified planning-time locations:

- Development bundle: `C:\Users\janbe\OneDrive\Dokumentation\Test Vault\.obsidian\plugins\Bases - Graph-View\main.js`
- Installed bundle: `C:\Users\janbe\OneDrive\Dokumentation\Test Vault\.obsidian\plugins\nosygraph\main.js`
- Both manifests use plugin ID `nosygraph`; the enabled community-plugin IDs include `nosygraph`. The two bundles matched when inspected, but recheck at deployment time.

After code and automated verification:

1. Resolve and verify the exact source and destination paths and matching plugin IDs. Confirm the destination is the installed plugin for this vault; do not deploy to every folder sharing an ID.
2. Back up the installed `main.js` to a timestamped file in the workspace (for example a deployment-backup subdirectory). Preserve settings, notes, manifest, styles and unrelated files. No directory deletion is required.
3. Copy the final verified build to the installed `nosygraph/main.js` using a native single-shell file operation and literal paths. The user's reload-only instruction authorizes this deployment. If the sandbox requires escalation for this outside-workspace destination, request the narrowly scoped tool escalation for that exact file rather than stop at a copy command for the user.
4. Compare source and installed SHA-256 and verify destination bundle syntax. If the deployed file does not match, resolve or restore the backup safely and report the actual outcome; do not claim ready-for-reload on a failed deploy.
5. Record installed path, hash, backup path and check results. Do not reload/control Obsidian; the user will reload the vault and test.

If automatic approval review blocks deployment, finish the unaffected work and explicitly identify the exact blocked action and review reason. Do not silently replace the requested reload-only handoff with manual installation instructions. Avoid any broader write escalation than this one installed artifact.

## Manual checklist for the user after vault reload

1. Classic lens: select one member, Shift-select several, Cut by menu and Ctrl/Cmd+X. Verify its real defining property loses only those references; paste produces those selected note links.
2. Lens LinkType A.scope: repeat with one/multiple read properties and confirm all matching selected-member references are removed while unrelated properties survive.
3. Nested lenses: cut from a lens inside a lens and from a lens opened on an expanded/discovered node. Verify the immediately defining source/property is changed.
4. Expanded nodes: expand B's property badge inside either lens type, select C and Cut. Verify outgoing/incoming property orientation and that clipboard C pastes correctly.
5. Global Ctrl+A: verify selection spans the graph and open lenses; Cut the mixed selection in a disposable test setup and inspect the expected affected properties. Do not use real project notes for this destructive manual scenario.
6. Last member: cut it, close/reopen and reload; empty lenses stay valid and removed nodes do not return. Other instances with independent backing links may remain legitimately visible.
7. Mix valid members with body/filter-only or ambiguous entries and confirm skip explanations. Check a separate pane and rendered embed refresh, surviving layout, icons, and Lens edge isolation.

## Chat and model recommendation

Use a **new implementation chat in the same project** with this complete handoff. This is a broader ownership/Cut extension than the completed edge-isolation correction. Preserve all current source changes; do not replay earlier feature plans as if they were unimplemented.

Recommended **GPT-6.2 Sol, High reasoning, Standard speed**. Incoming ownership, merged expansion provenance, partial writes, nested persistence and deployment justify High. The detailed handoff bounds investigation and keeps Sol the usage-conscious starting point. [Model guidance](https://learn.chatgpt.com/docs/models).

## Ready-to-paste implementation prompt

> Implement the full plan at `C:\Users\janbe\OneDrive\Dokumentation\Test Vault\.obsidian\plugins\Bases - Graph-View\docs\architecture\LensNodeCutPlan.md`. Read applicable repository instructions and inspect current source first. This is an implementation and deployment task.
>
> Extend selection/Cut to classic lenses, Lens LinkType viewports, nested lenses and property-backed discovered/badge expansions. The latest scope includes expanded nodes; body-link-only/filter-only nodes remain skipped with explanations. Preserve global Ctrl+A across the graph and open lenses. Resolve actual introducing note properties, including incoming/both orientation, using concrete provenance rather than pseudo paths, saved-layout ownership, or a first-owner guess. Use the existing shared clipboard/Cut flow, publish selected note links before removal, preserve unrelated data, report partial failures, and reconcile runtime/saved state across main views and embeds so removed nodes do not return.
>
> Preserve all implemented clipboard, membership-toggle, icon, target-only Lens and edge-isolation behavior. Run isolated automated regression suites, build, syntax, type and lint checks; compare existing diagnostics with baseline. I will do manual Obsidian testing, so do not control/reload Obsidian or use live notes/clipboard for test interactions.
>
> Complete deployment, not just a build: verify plugin IDs/paths, back up the installed main.js, copy the verified final build to `C:\Users\janbe\OneDrive\Dokumentation\Test Vault\.obsidian\plugins\nosygraph\main.js`, and verify matching SHA-256 plus bundle syntax. This exact deployment is authorized so I only need to reload the vault for testing. Use narrow sandbox escalation for that file if needed; preserve installed data.json, styles, manifest and all notes. Do not reload the vault yourself.
>
> Finish with implemented scope, automated/static results, actual deployment and backup paths/hash, limitations, and my short manual checklist with expected outcomes. Mark manual verification pending my vault reload/testing. Keep scope focused and avoid redundant broad reads/test runs.
