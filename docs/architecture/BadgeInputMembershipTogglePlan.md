# Badge input membership toggle implementation plan

Release status (2026-11-21): implemented. The maintainer confirmed the features and manual Obsidian testing before the 0.3.0 release. Earlier planning and verification notes below are historical; see the [0.3.0 verification guide](../releases/0.3.0-release-guide.md) for the current release checks.

Status as of 2026-11-20. Implemented in the development workspace. User deployment and Obsidian testing are pending. This feature applies the shared membership preference to clipboard batches as well as single-note input.

The production build, bundle syntax check, architecture type check, and ESLint passed. The full-project TypeScript check reported the same 120 diagnostics as the pre-change baseline. Focused regression fixtures are prepared for user execution.

## Confirmed requirements

Add a persistent toggle to the Alt-click badge input and the plugin settings. It applies equally to ordinary note selection, note creation, and clipboard batches.

- **On:** perform the normal badge relationship addition and also add successful note references alongside the badge's parent node in its current graph/lens membership property.
- **Off:** perform only the normal badge relationship addition.
- **Default On** when no saved preference exists.
- Save changes immediately from either settings or the input. Closing/cancelling the input does not revert an explicitly changed preference. Future inputs retain it until it is changed again.
- When multiple membership properties contain the parent, **let the user choose one**. Do not add to all of them.
- Inside a Lens LinkType opened from `A.scope`, if its member `B` owns the clicked badge, secondary membership is **`A.scope`**, alongside `B`. The user explicitly confirmed this behavior.
- A Lens LinkType badge in a note-backed graph uses the clicked Lens's write property. Its input omits the graph-root membership controls.

The clicked badge's parent means the note owning that badge, not the node that happens to be selected elsewhere, a graph runtime ID, or the lens definition note. In the examples below that note is `B` and the new note is `C`.

## Observable behavior

| Context | Existing membership | Primary addition | Secondary addition when On |
| --- | --- | --- | --- |
| Graph note `G` | `G.rootNodes` contains `B` | Badge on `B`: add `C` under its write property | Add `C` to `G.rootNodes` |
| Graph-capable note `G` | `G.members` contains `B` | Same badge operation | Add `C` to `G.members` |
| Embedded graph-note/note lens `D` | `D.members` contains `B` | Same badge operation inside that lens | Add `C` to `D.members`, even if another graph owns saved lens layout |
| Lens LinkType from `A` | Lens read property `A.scope` contains `B` | Badge on `B`: add `C` under its write property | Add `C` to `A.scope` |
| Lens badge on `B` in a note-backed graph | The graph lists `B` | Add `C` to the clicked Lens definition's write property on `B` | No graph-root write |
| Lens badge on `B` inside a LinkType Lens | The enclosing Lens lists `B` | Add `C` to the clicked Lens definition's write property on `B` | Add `C` alongside `B` in the enclosing Lens membership property |
| Incoming badge on `B` | Current graph/lens lists `B` | Existing direction rule writes a reference to `B` into `C` | Still add a reference to `C` alongside `B` in the enclosing membership property |

Primary addition retains the established LinkType rules: outgoing and `both` write to the clicked note; incoming writes reverse references to the added notes. The toggle does not change these rules or add incoming lens visualization support.

The two properties are independent. A lens definition's `writeProperty` controls the clicked badge's relationship. It does not override which property currently lists the parent in the enclosing lens. For example, if a multi-property lens reads `scope` and `deliverables`, writes new direct lens links to `deliverables`, and `B` appears only under `A.scope`, this toggle adds siblings to `A.scope`.

## Current implementation and gaps

| Location | Current responsibility | Required change |
| --- | --- | --- |
| `src/ObsidianGraphLinkInputHandler.ts` | Modal search/create, clipboard preview, add/retry, lifecycle | Show the toggle and resolved membership destination; submit both phases before considering a row complete. |
| `src/ObsidianGraphBadgeInputHost.ts` | Shared host for views/embeds; after the modal resolves, augments roots only for `single-note-input` | Replace the origin-based policy and post-close mutation with explicit preference-controlled orchestration for every submission origin. |
| `src/graph-application/GraphLinkMutation.ts` | Detached badge descriptor and primary mutation results | Add membership context/options and separate membership outcomes without hiding primary successes. |
| `src/ObsidianGraphRootPropertyMutationHandler.ts` | Adds files to the root property containing a reference; opens a chooser if several match | Reuse a hardened explicit-destination writer and separate read-only destination planning from mutation. |
| `src/GraphEngine.ts` | Captures badge target, LinkType descriptor and runtime context | Project actual enclosing membership ownership, including runtime Lens LinkTypes. |
| `src/GraphView.ts` and rendered embed in `src/main.ts` | Compose shared host and refresh graph changes | Inject the live global preference port and membership resolver into both. |
| `src/main.ts` | Plugin settings, persistence, settings tab, cross-view refresh | Own the new preference and update path; add settings control and durable normalization. |

Important existing details:

1. The old host uses `result.selected`, not confirmed primary successes, and runs after the modal closes. Extending that block with a boolean would mishandle partial batches and membership retries.
2. Ordinary single-note input currently augments graph membership; clipboard input deliberately does not. The new default On changes clipboard behavior intentionally and Off must now suppress ordinary augmentation too. Update the existing origin-specific regression expectation.
3. `graphCapableOwnerPath` uses `embeddedDefinitionPath`, which is a real note path for ordinary embedded graphs but a synthetic `__nosygraph_lens__/...` path for Lens LinkTypes. That field alone cannot identify a valid secondary write destination.
4. `stateOwnerPath` identifies runtime persistence ownership. It is not a valid substitute for the note/property defining membership.
5. The current root helper resolves some links without the owner note's source path and stringifies arbitrary existing values. Its membership use needs source-relative matching and value preservation. Avoid changing unrelated removal workflows.
6. The main view uses `resolveEffectiveRootProperties`; the rendered embed's root-property helper still has different fallback behavior. Both new membership planners must use the shared resolver, including direct/remapped `rootNodes` and plugin defaults.

## Preference architecture

Add one boolean setting, proposed name `badgeInputAddToMembership`, to `BasesGraphPluginSettings`, `DEFAULT_SETTINGS`, and `loadPluginSettings`. Use strict boolean normalization: missing/invalid values fall back to true; explicitly saved false remains false. Do not infer a value from whether the previous interaction was a clipboard or ordinary selection.

Expose a small shared port with a current-value getter, asynchronous setter, and change subscription. The plugin owns this port. Both the settings tab and every modal use the same setter; no modal-local copy becomes a second source of truth. Pass the port through the existing host composition rather than another positional boolean constructor parameter on `BasesGraphView`.

Use `savePluginSettings`/`saveData` so unrelated settings survive. Serialize preference saves and guard rapid/multi-window changes against an older save overwriting the newest value. Read current settings when persisting; avoid saving a stale whole-settings snapshot. If a new persistence queue is needed, integrate with the existing settings save path rather than creating independent writers to the same file.

Show updated values in idle open modals/settings controls through the subscription. Disable mutation submission while that modal's preference update is unsettled. On save failure, surface the error and revert only if the failed change is still the latest revision; an older failure must not undo a newer successful change. Release subscriptions when controls/modal are disposed.

At submission, capture the current saved preference and destination as immutable options. Another window changing the preference during a commit affects the next submission, not the in-flight operation. A retry is a new attempt and must show which unfinished phases it will execute under the then-current option.

Do not persist this preference in graph-note frontmatter, runtime snapshots, LinkType notes, or per-lens state. Do not modify the separate auto-expand-after-drop setting.

## Membership context and destination resolution

Add a detached context to `GraphBadgeLinkInputRequest` or its host options. Distinguish at least:

- A note-backed graph context: real definition note path, clicked reference path, and optional runtime instance identity.
- A Lens LinkType context: enclosing lens source note path, enclosing Lens definition ID, clicked reference path, instance identity, and read-property provenance where available.
- An unavailable context with a reason.

The live engine can resolve a runtime Lens container's `origin` back to its source note and its `linkTypeId` back to the enclosing definition. Use that context instead of the synthetic container path. For nested lenses, use the immediately enclosing context that actually lists the clicked node. Do not search all ancestors, all graph notes, or all occurrences of the note path for a convenient destination.

For a note-backed graph, limit candidates to the effective configured root properties. Respect explicit `rootNodeProperties`, plugin defaults, direct/configured/canonical `rootNodes` fallback, and actual key casing. Ignore `None-type links`, which denotes body links rather than an editable membership property.

For a Lens LinkType, limit candidates to that enclosing definition's actual read properties on the source note. Existing `relationshipProperties` provenance is useful for presenting candidates, but verify current property contents before commit. The badge's own properties and the enclosing lens properties can be different definitions.

In either context, match candidates by resolving their current values relative to the owner note and finding the clicked parent path. One match is automatic. Several matches require an inline property selector in the original modal, using the existing chooser semantics; selection is mandatory before an On submission that has multiple candidates. Persist only the global boolean, not the property choice. Keep the chosen property stable within the session and revalidate it for retries.

Recommended unavailable behavior: if there is no real owner or no membership property currently lists the parent, retain the saved toggle value and show a disabled/unavailable membership indicator with the explanation **“Only the badge link will be added; this node has no property-backed membership here.”** The primary link action remains usable and the result reports membership as unavailable. Do not invent a property, edit body text, write a synthetic file, or silently use another graph. This covers filter-only/expanded nodes and the visual source node included inside a Lens viewport when it is not itself listed in a membership property.

If a previously available destination disappears or changes after preview, mark the secondary phase stale and report it; do not silently pick a new property. Changing note/definition identity before any submission uses the existing reopen/review guard.

## Input control design

Use a clearly labeled toggle button such as **“Also add to graph membership”**, with a visible On/Off state and accessible `aria-pressed`. In settings, use the same label and explanation. The default is On. The button is independent of the search field, so Enter/Space on it changes the preference without accidentally submitting note links.

When On and available, show the real destination beneath it, for example `Project.md → members`. For Lens contexts this may be `Area.md → scope`. When several matching properties exist, show their selector here before notes are committed. Off can hide/disable the destination selector without deleting a session choice. Re-enabling recomputes/revalidates candidates.

Keep the control visible in search, create, and clipboard preview modes. Changing it saves the preference but performs no relationship or membership writes. Preserve search focus, clipboard staging, ordinary Enter behavior, and existing keyboard protections. Disable it while the modal is committing, while another modal may still change the global next-submission preference.

Closing an unsubmitted input cancels note writes. It does not cancel an already saved preference change. Existing “create a new note” behavior remains explicit; a later relationship/membership failure must not create the same new note again on retry.

## Submission and partial failure model

Move both mutation phases into one submission boundary shared by ordinary selection, creation, and clipboard batches. Keep the modal a presenter; put context planning and two-phase orchestration in an injected application operation/host service. A proposed module is `src/graph-application/GraphBadgeInputSubmission.ts` with host ports, composed in `ObsidianGraphBadgeInputHost.ts`.

1. Validate target/definition, freeze the toggle value, and resolve/choose the membership destination before any primary mutation. Opening a secondary property modal after primary success is no longer the normal path.
2. Execute the existing add-only badge writer using its original write descriptor and direction rules. Preserve `origin` as provenance, not as permission to add membership.
3. Derive membership candidates from **primary added plus already-present note paths**, excluding failed/missing/self/invalid paths. An already-existing badge relationship must still allow repair of a missing graph membership. Do not use raw `selected` for this decision.
4. With Off, never call a membership writer. With On and an available destination, add these note references in one queued frontmatter callback per membership owner, checking the parent is still listed under the chosen key inside that callback.
5. Use destination-relative link generation, canonical path deduplication, actual key casing, and idempotent append behavior. Preserve arbitrary unselected values/types and order. Reuse existing matching utilities without stringifying or dropping unrelated values. If both phases happen to target the same file/property, avoid duplicate entries and report the resulting state accurately.
6. Refresh primary successes and membership successes using exact changed file paths. Settle final modal success only after both applicable phases have completed or their separate outcomes are visible.

Extend the result with a separate membership outcome: destination, added/already-present paths, failed/stale/unavailable paths, and changed files. Keep primary `added`/`alreadyPresent`/`failed` meanings intact for existing refresh consumers. A membership failure must not appear as a failed primary relationship or erase the primary result.

There is no transaction across multiple files. If primary succeeds and membership fails, preserve the primary write and show **“Link added; graph membership failed.”** Offer a retry of membership only. Successful rows should not be resubmitted to the primary writer or recreated. For incoming batches, propagate membership only for individual primary successes/already-present relationships; keep other rows retryable.

The preview row state needs to track phase completion, not just the existing `added`/`failed` badge status. Auto-close only when all requested phases for eligible rows are complete. With partial failure, retain rows and their precise outcomes. When the user changes the toggle to Off before retry, show that unresolved membership will be skipped for that attempt; never remove membership already written while On. Changing On/Off affects subsequent submissions, not existing relationships.

Coordinate writes through `queueGraphDocumentMutation` where applicable. Acquire only one per-file queue at a time; never wait for a queued operation on the same file from inside its own task. Preserve live frontmatter against concurrent writes. Recheck file identity and note existence rather than redirecting to a replacement file at the same runtime path.

## Refresh and persistence

Notify existing badge refresh consumers of primary writes, and the graph/root/lens membership refresh boundary of secondary writes. Refresh all affected instances/panes/rendered embeds, not just the modal's originating view. Include secondary owner paths in metadata revalidation so cache lag cannot restore an old membership view.

Note-backed membership uses normal configured-root reconciliation. Lens LinkType membership refreshes every open viewport with the matching source/definition identity while preserving surviving positions, geometry, zoom, pins, and expansions. Do not resolve its synthetic path as a `TFile` or feed it into the note-backed root-state writer. Distinguish the clicked badge's lens refresh from refresh of the enclosing lens whose membership changed.

Regular note property writes are allowed even when the note is not a persistent graph note. The existing policy for saving graph/lens runtime state remains unchanged: do not promote a note or create an `o3graph` block solely because this toggle is On.

## Implementation sequence

1. Extend detached context/options/results and add the plugin-owned preference port, On default, saved-value normalization, setter, and settings control.
2. Add read-only membership planning for note-backed and Lens LinkType contexts, using the shared effective-root resolver in both main views and rendered embeds.
3. Implement idempotent explicit-destination membership append, with atomic revalidation, value preservation, and per-file queue coordination.
4. Move the old post-close root augmentation into the shared submission operation. Apply the captured toggle to all input origins and add phase-specific partial results/retries.
5. Add the modal toggle, destination display/selector, saved-preference subscription, and row completion states.
6. Wire primary and secondary refresh across main views, embeds, and enclosing lenses. Remove the obsolete single-note-only host branch so it cannot add membership twice.
7. Update README/settings documentation and the old clipboard plan's historical scope reference. Prepare the regression cases and user checklist below. Record static-check results and user testing as pending.

## Regression cases and user testing

Testing is assigned to the user. The implementation chat may prepare focused automated regression cases and fixtures, but **must not execute test suites, control/reload Obsidian, or manipulate the live clipboard/vault for testing**. It may build and run static type/lint checks, distinguishing existing diagnostics from regressions. Do not claim unexecuted tests passed.

| Case | Expected result |
| --- | --- |
| First install/no saved key | Toggle starts On. |
| Explicit saved Off and restart | Both settings and input remain Off. Invalid saved values normalize to On. |
| Change from settings/input; open another input | Same current preference everywhere; cancel input does not revert a saved change. Rapid updates preserve the last saved value. |
| Search/select/create/paste, On then Off | On adds badge relationship plus available membership; Off adds only the badge relationship. Existing memberships are never removed. |
| Several matching properties | User chooses one before commit; additions go only there. Cancelling before commit writes no links. |
| Note-backed graph/lens | Real owner receives links under the actual property containing the parent; defaults/remapped keys and relative references work in main views and embeds. |
| Lens LinkType `A.scope → B`, badge on `B` | On adds new notes to `A.scope` plus `B`'s badge property; no synthetic file or unrelated outer membership write. |
| Enclosing multi-property lens | User chooses among actual properties containing `B`; the clicked badge's write property does not override that selection. |
| Clicked badge itself is a Lens LinkType | The clicked Lens's write property receives the links. Secondary membership is available inside an enclosing LinkType Lens. |
| Incoming badge | Each successful added note receives the reverse badge reference; the enclosing membership owner receives links to those notes. |
| Existing badge link, missing membership | On repairs membership without duplicating or toggling off the primary link. |
| No property-backed membership | Preference stays unchanged; UI explains that only the badge link can be added; no invented property. |
| Parent removed from chosen property after preview | No secondary write to that stale destination; primary and membership outcomes are reported separately. |
| Partial failure and retry | Successful primary links remain. Retry can repair membership alone, without duplicate notes/links or loss of previous results. |
| Other windows change preference during commit | Current submission follows its captured option; the next follows the new saved setting. |
| Cancel/close/reopen mid-flow | Preference persists; unsubmitted links do not write; committed outcomes settle once and remain visible after reopening. |
| Cross-pane/embedded/nested refresh | Both affected relationship views and membership views refresh; surviving runtime layout remains intact. |
| Regression | Copy/Cut, source frontmatter/property/body paste, drag/drop toggles, search/create, lens direction limits, and Cut-last-node reopening retain existing behavior. |

Suggested automated files: extend `ObsidianGraphLinkInputHandler.test.ts` (including the existing ordinary-only root test), add focused host/application membership tests, preference serialization tests, and main/embed context projection tests. Use mocks and in-memory frontmatter callbacks. Provide exact commands for the user, such as the relevant `npm test -- ...` invocations and `npm test` for the full suite.

The user-facing Obsidian checklist should use a small graph where `G.members` lists `B`, two candidate membership properties, and a Lens LinkType where `A.scope` lists `B`. For each, compare On and Off with single selection and clipboard batches, inspect the changed frontmatter, reopen the plugin to verify the saved preference, and exercise one failure/retry. Include expected property contents rather than only visual assertions.

## Build and deployment handoff

Use `npm run build`, `npm run typecheck`, `npx tsc --noEmit -p tsconfig.json`, and applicable lint checks as static/build validation. The architecture typecheck alone omits production host/UI files. Report existing full-project diagnostics separately.

The preceding feature exposed two folders with the same plugin ID: this development folder and `.obsidian/plugins/nosygraph/`. A development build alone does not update the installed bundle. Give the user the rebuilt `main.js` path and SHA-256, and explain that the installed copy must match it before the user reloads and tests. Preserve installed settings and other files. Do not copy outside the authorized workspace or reload Obsidian as part of this implementation prompt; deployment/testing is the user's handoff step unless separately authorized.

## Chat and model recommendation

Continue the **existing badge clipboard implementation chat** if available. This is a direct extension of its modal, shared host, batch outcomes, and deployment lesson. The current code and this plan remain authoritative if earlier instructions conflict, especially the old rule that clipboard batches never add membership.

Use **GPT-6.2 Sol, High reasoning, Standard speed**. The change looks small in the UI but needs careful membership ownership and two-phase retry handling. Sol is the usage-conscious choice: its published Standard token rates are one-quarter of Astra's; actual total tokens still depend on context, retries, and tool output. If that chat is unavailable, use a new chat in the same project with this plan. No new chat is created by this planning task.

Sources checked 2026-11-20: [Model guidance](https://learn.chatgpt.com/docs/models?surface=codex), [Pricing](https://learn.chatgpt.com/docs/pricing).

## Implementation prompt

> Implement `C:\Users\janbe\OneDrive\Dokumentation\Test Vault\.obsidian\plugins\Bases - Graph-View\docs\architecture\BadgeInputMembershipTogglePlan.md`. Read the complete plan and applicable repository instructions, then inspect the touched source. This is a follow-up to the implemented badge clipboard feature; it intentionally replaces the old single-note-only membership augmentation rule.
>
> Add one global persistent On-by-default “Also add to graph membership” toggle in the badge input and plugin settings. Apply it consistently to note selection, creation, and clipboard batches. When On, add confirmed primary successes/already-present links alongside the badge's parent under one matching membership property; let the user choose if several match. When Off, perform only the normal badge relationship addition. For Lens LinkType contexts, use the enclosing lens source note and the property through which the parent appears, never a synthetic runtime path. Keep badge write properties, enclosing membership properties, and runtime persistence ownership distinct.
>
> Use the existing shared input host and add-only writers with explicit membership context, separate phase outcomes, idempotent retries, value-preserving appends, and cross-view refresh. Save changes from settings or the input immediately through one plugin-owned preference path. Preserve clipboard preview/Enter submission, incoming direction rules, ordinary search/create, Copy/Cut, unrelated content, and surviving graph/lens layout. Do not implement incoming lens visualization or unrelated refactoring.
>
> I will conduct testing. Prepare focused regression tests and a manual checklist with expected results, but do not execute test suites, control/reload Obsidian, or use real clipboard/vault test interactions. Build and run static type/lint checks; distinguish existing diagnostics from regressions. Supply the built main.js path and hash and remind me to update the installed nosygraph bundle before reloading. Do not deploy outside the authorized workspace. Finish with changes, static verification results, remaining limitations, exact test commands, and my manual checklist. Mark testing pending user verification.
