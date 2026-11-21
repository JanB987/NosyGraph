# Paste note links into badge input: evaluation and implementation plan

Release status (2026-11-21): implemented. The maintainer confirmed the features and manual Obsidian testing before the 0.3.0 release. Earlier planning and verification notes below are historical; see the [0.3.0 verification guide](../releases/0.3.0-release-guide.md) for the current release checks.

Status as of 2026-11-20. The badge clipboard feature is implemented. The user confirmed the multi-node Cut → Alt-click badge → Ctrl+Y workflow in Obsidian after the installed bundle was updated. The remaining manual checklist scenarios are unconfirmed. The review below records the pre-implementation behavior. [Implemented badge clipboard flow](GraphBadge.md#clipboard-batch-input)

The original clipboard-only restriction on secondary graph membership is historical. The current badge input uses the global **Also add to graph membership** preference for all submission origins. [Membership toggle plan](BadgeInputMembershipTogglePlan.md)

Automated validation passed for all 669 tests, the architecture type check, the production build, and ESLint. The 29 focused tests passed again after deployment. The full-project TypeScript check reports 120 existing diagnostics, down from 138 in the baseline, with no new diagnostics. Automation used mocks and isolated fixtures for Obsidian, notes, and clipboard events.

On 2026-11-20 the user reported that Ctrl+Y inserted links as search text. The badge input now stages links inserted directly into the field as well as links received through paste events.

The next manual test reached an older installed bundle and created a note from the combined link text. The source workspace and the documented install folder both declare the `nosygraph` plugin ID. Running the build writes only to the source workspace. The two bundles were synchronized and checked by SHA-256. For later tests, deploy the rebuilt `main.js` to `.obsidian/plugins/nosygraph/` and verify that it matches the workspace build before reloading Obsidian.

## Confirmed interaction

Open the existing link input with Alt-click on a LinkType badge. Paste one or more note links into its input. **Show the parsed notes first and write only when the user presses Enter** (or an equivalent Add button). Escape/closing the preview before submission writes nothing.

**Follow existing badge direction rules**, including reverse writes to pasted notes for incoming-only badges. Outgoing and `both` use the clicked note's configured write property, as the existing add operation does. Do not confuse visual arrow `direction` with relationship `linkDiscoveryDirection`.

Support force, direction-based, parent, and lens badges through one property-mutation contract. Future types participate by supplying a property-write descriptor and their existing refresh behavior; the clipboard parser must not depend on a list of rendering types. Types without a property-write capability show a clear unavailable state rather than guessing a property.

Keep ordinary single-note search/create usable. Pasting recognized links must never create a note whose title is the concatenated clipboard text. Pasted missing links are reported in preview and are not automatically created in this feature.

## Current clipboard review

| Surface | Current behavior | Consequence for this feature |
| --- | --- | --- |
| Graph Copy/Cut | `GraphNodeClipboard.publishGraphNodeLinks` deduplicates paths, serializes each with `generateMarkdownLink` relative to the graph file (fallback wiki link for missing notes), writes newline-separated plain text, then registers paths and exact text. Cut uses the same publisher. | Preserve this compatible publication format and clipboard-first Cut ordering. Canonical paths are already available for reliable internal paste. |
| Registration | `main.ts` remembers only the last paths and text in memory through `rememberCopiedGraphNodeLinks`. | This is a one-entry, session-local association, not structured data on the OS clipboard. Exact-text equality is a heuristic; it cannot prove clipboard provenance or recover context after restart. |
| Source frontmatter paste | On `editor-paste`, matching registered text is regenerated relative to the destination note and inserted as quoted YAML list items with indentation handling. | Retain destination-aware generation and escaping. External/unregistered text is handled natively, not by this plugin path. |
| Property widget paste | A document capture listener recognizes a metadata property field and matching registered text, then calls `applyBadgeLinkAdd` with outgoing direction. | Existing integration uses canonical paths, preserves existing entries, and skips duplicates in the write property. It currently targets `workspace.getActiveFile`, which can be the wrong file in an inactive pane; this is a separate follow-up unless touched by shared extraction. |
| Note body paste | No plugin body-paste transformation; native paste receives the published plain text. | Link text is generated relative to the copying graph, not regenerated for the destination body. Relative-link preferences can therefore make cross-folder body paste resolve differently. This feature must preserve existing body behavior; destination-aware body paste is a separate improvement. |
| Badge input | `ObsidianGraphLinkInputHandler` opens a single-line search/create modal, selects one file, then calls `applyBadgeLinkAdd` with one source. No paste parser or batch preview exists. | A multiline clipboard list currently becomes search text and can reach the Create path. Add an explicit paste/preview mode instead. |

Important implementation gaps:

1. `GraphBadgeLinkInputRequest` currently contains only target, write property, discovery direction, and an optional graph-capable owner. Drag/drop also forwards definition identity, semantic, and read properties. Input therefore loses metadata needed for equivalent-property duplicate checks and extensibility.
2. `ObsidianGraphLinkMutationHandler.ts` redeclares narrower request/result types than `GraphEngine.ts`, while its implementation reads fields such as `semantic` and `readProperties` omitted from its own declaration. Consolidate the touched contracts; do not copy these inconsistencies into a new API.
3. Add mode checks only the write property. Lens toggle mode checks multiple read properties, but add mode can duplicate an already represented relationship into another equivalent property. Clipboard add needs explicit add-only, equivalent-property-aware behavior.
4. `GraphView.ts` and the rendered-embed path in `main.ts` both use `result.selected` to add selected notes to the graph owner's root property containing the clicked note. That is a second mutation beyond the badge relationship and can open another property chooser. Pasted batches must not accidentally acquire this side effect.
5. Incoming mutation writes multiple notes in a loop. A thrown error currently loses the aggregate result for preceding successful writes. Batch submission needs recoverable per-file outcomes.
6. `extractInternalLinkCandidates` is a relationship-value extractor with permissive plain-text fallback and regex-based Markdown handling. It does not provide clipboard diagnostics or full link-token handling. Reusing it alone would misinterpret prose, filenames with punctuation, and some encoded/heading links.

## Recommended clipboard architecture

Use a small shared read pipeline alongside the existing publisher. Keep reference identities, syntax recognition, host resolution, and destination formatting separate.

### 1. Detached clipboard association

Extract the registration state from `main.ts` into a small session-scoped helper, proposed `GraphNodeClipboardState` in `src/GraphNodeClipboard.ts` or an adjacent module. It holds an immutable snapshot of registered `paths` and exact `text`; recording source path is optional if useful for diagnostics. Existing frontmatter/property handlers and the new badge handler consult the same association.

Inject a read/match function when constructing the badge input handler in both `GraphView` and rendered embeds. Do not import the plugin singleton or poll `navigator.clipboard`. Keep existing publish behavior and callbacks compatible, updating every call site if the callback contract is extended.

Read pasted text from `ClipboardEvent.clipboardData.getData("text/plain")` on the modal input's actual paste event. Do not add clipboard access on Alt-click, focus, timers, or background work. A context-menu Paste and Ctrl/Cmd+V reach the same event. Missing/nontext data follows normal input behavior.

### 2. Pure syntax parser

Proposed `src/graph-application/GraphNoteLinkPaste.ts`: parse text into detached tokens plus diagnostics, without Obsidian/DOM/file objects or writes. Capture raw text, normalized link target, optional label/subpath, and source span/order. Return an explicit distinction between plain search text, link input, and invalid link input.

Initial supported forms:

- One or multiple wiki note links, including aliases and heading/block subpaths, separated by whitespace/newlines.
- Internal Markdown note links, including encoded spaces and balanced/escaped parentheses in destinations.
- Common list wrappers copied from note properties: bullet-prefixed links and quoted YAML list items. Parse this narrow wrapper syntax; do not deserialize arbitrary YAML or execute anything.
- Exact vault-relative `.md` paths may be supported as standalone lines when they resolve to existing notes; arbitrary plain note names continue through existing search. Do not split paths on spaces, commas, or semicolons indiscriminately.

Ignore external URLs, attachment links, and unsupported URI schemes as relationship targets, and show their diagnostic status when mixed with note links. Do not make an unrecognized blob a synthetic note title when structured link syntax was detected. Mixed prose can contribute recognized internal link tokens while its unused text is disclosed as ignored. Malformed structured syntax should produce a useful error rather than fall through to Create.

Aliases/subpaths help recognize references; property relationships remain note-level and are serialized by the existing destination-aware link generator. Do not preserve alias/subpath semantics by silently introducing a different relationship model.

### 3. Host resolver

The Obsidian boundary resolves parsed references and produces canonical note paths and status rows:

- If text matches the session association, use its canonical paths in order. Do not re-resolve source-relative serialization against the clicked note. Revalidate that each path still exists and is a Markdown note.
- For other text, resolve against the clicked note's path. External clipboard text does not expose its original source note; explicitly relative links consequently use this destination context. Show full resolved paths in preview. Do not guess between unresolved/ambiguous candidates or pick the first fuzzy result.
- Normalize wiki aliases/subpaths and Markdown percent-encoding with shared, tested link utilities. Decode once without turning encoded filename characters into fragment separators. Avoid divergent normalizers between preview and duplicate checks.
- Exclude self-links consistently with the current writer, deduplicate by canonical path in first-seen order, and preserve rows/reasons for missing, ambiguous, non-note, or invalid targets. Renamed/deleted paths are revalidated before submission; do not silently switch a preview row to another same-basename note.

Preview parsing and resolution are read-only. Tests must distinguish the canonical internal association from external destination-relative resolution, including the case where the same link text could resolve to a different note in another folder.

## Shared mutation descriptor and application flow

Move the touched input/mutation contracts into one host-neutral module, proposed `src/graph-application/GraphLinkMutation.ts`, imported by the engine, input handler, writer, and tests. This is a focused consolidation, not a runtime migration.

The badge descriptor should carry stable target note/runtime identity, definition ID, actual read-property names, write property, discovery direction, semantic/capability, and optional graph context used for refresh. Keep graph/root ownership context distinct from the relationship's write target. Never serialize a badge label or definition path as a YAML property name. Derive actual properties from the LinkType definition rather than assuming its runtime `property` identity is always a write property.

Use an explicit submission origin such as `single-note-input` versus `clipboard-batch`. Keep `selected` as selected note paths rather than overloading it to mean successful writes or using an empty value to suppress secondary behavior.

The clipboard batch operation must be add-only. **Do not call `applyBadgeDrop`, whose behavior is toggle.** Extend/reuse `applyBadgeLinkAdd` with a complete descriptor and per-file outcomes:

- Outgoing/`both`: add pasted targets to the clicked note's write property, once per batch. Check equivalent read properties to avoid adding a relationship already represented there. A repeated paste must not remove or duplicate links.
- Incoming: for each pasted note, add a reference to the clicked note under that pasted note's write property, checking equivalent read properties there. One atomic frontmatter callback per mutated note. Continue across independent file failures and return exact successful/failed paths.
- Preserve property-key casing, existing scalar/list/nonlink values, and entry order. Generate each added link relative to the file actually being modified. Recheck current values inside `processFrontMatter` to preserve concurrent edits.
- Return added/already-present/skipped/failed items and changed file paths. Keep additions, skips, and removals compatible for current callers; prefer additive optional detail fields or a deliberately migrated shared result contract over a second parallel result model.

The paste UI and application operation should not branch on force/direction/lens icon names. Existing engine refresh behavior can retain semantic-specific implementations. Future badge types supply the same write capability or explicitly decline mutation.

## Modal behavior and lifecycle

1. Preserve existing single-note search/create when no pasted batch is staged.
2. On recognized link paste, prevent native insertion into the one-line search field, stage parsed rows, and show each note's full path and status. Suppress the search Create row in batch mode. Display the destination write property and, for incoming badges, explain that the pasted notes will receive references to the clicked note.
3. Repeated pastes append distinct targets to the staged batch. Provide Clear/remove controls. Clearing the batch returns to normal search. Do not mix an active search suggestion with an implicit batch commit.
4. Enter/Add submits only eligible staged rows; invalid/missing rows are visibly skipped, and the action label/count makes the submitted subset clear. All-invalid input submits nothing. Escape/close before submission writes nothing.
5. Freeze the target/definition descriptor and staged list for submission. Revalidate existence and write configuration at commit; if target/definition changed incompatibly, require a new preview rather than redirecting writes silently.
6. Disable submission and editing during commit to prevent double Enter/click writes. Once writes start, closing the modal cannot undo them: finish the tracked operation and report outcomes. Settle the returned promise once. Route all failures through a handled result, not an unhandled async event rejection.
7. On complete success or all-already-present results, close with a concise summary. On partial failure, keep failed/skipped rows visible for correction/retry and mark successes as completed so they are not counted or written twice. Notify/refresh successful changes immediately, even if the modal remains open; do not delay all graph refresh until its final close.

The last requirement may require a result/progress callback in addition to the final modal promise. Keep mutation execution in the input adapter/application operation, not the renderer; have the host receive each committed batch result for refresh, including on a later Escape.

## Graph integration and scope control

Wire both live composition sites: `GraphView.ts` and the rendered graph embed in `main.ts`. The main production engine is `src/GraphEngine.ts`; `src/graph/GraphEngine.ts` is a separate path.

For clipboard-batch submissions, update only the relationship properties dictated by the badge. Skip the existing automatic `addFilesToReferenceProperty` root augmentation in both hosts using the explicit origin field. Preserve single-note input's existing behavior in this feature. This avoids adding every pasted note as a graph root or opening an unrelated chooser after Enter.

Forward all successful changed file paths to the existing metadata/graph refresh boundary, covering incoming source files as well as the clicked note. Refresh edges, badge presence, and applicable expanded containers across open views/embeds. Continue to use the engine's current lens/embedded/normal refresh adapters; do not use a UI badge toggle as the mechanism for writing relationships. Preserve the established collapsed/expanded behavior and surviving layout. If an existing refresh helper does rebuild a lens, test its retained state and document any existing limitation rather than redesigning lens layout here.

Use matching definition identity for the clicked badge even when two definitions read the same property. For equivalent-property handling, validate read properties as real property names and respect `writeProperty`. Keep root-note definitions, lens geometry, and clipboard Copy/Cut publishing unchanged.

This feature shares clipboard association and parsing infrastructure, but does **not** broaden all property/body paste interception. Existing source frontmatter/property paste remains restricted to the remembered Copy/Cut association. Reuse existing behavior through the extracted state helper and add regressions. Destination-aware body paste, external-link support in every property widget, inactive-pane property ownership repair, rich/custom clipboard MIME, missing-note creation from pasted batches, and broad link-parser replacement are follow-ups.

If a narrowly shared decoding/matching fix is necessary for the new batch writer, cover existing property-paste and drag/drop behavior with tests. Do not change unrelated relationship-discovery behavior without evidence that the feature requires it.

## Implementation sequence

1. Add shared mutation contracts and regression coverage for existing single-note input, add-only mutation, Copy/Cut publication, and existing frontmatter/property paste. Record pre-existing full-project TypeScript diagnostics around mismatched mutation types.
2. Extract the clipboard association helper without changing the published text or current paste behavior.
3. Implement pure clipboard syntax recognition and an injected resolver/preview model. Test internal canonical-path lookup and external note-link resolution.
4. Extend the existing writer for metadata-complete, equivalent-property-aware add batches and recoverable incoming failures.
5. Implement staged paste UI, Enter submission, partial-result retry, cancellation, and progress notifications while retaining ordinary search/create.
6. Integrate both composition sites, scope clipboard-origin root behavior, and verify live engine refresh routing with mocks.
7. Update README and architecture docs. Record completed automated checks and mark manual Obsidian verification pending the user.

## Automated acceptance checks

| Area | Required observations |
| --- | --- |
| Formats | Single/multiple wiki and Markdown links; aliases; headings/block refs; CRLF; property-list wrappers; spaces/commas/parentheses in filenames; encoded characters; malformed syntax; plain search text. |
| Clipboard identity | Graph Copy and Cut payloads work identically; internal canonical paths beat conflicting destination-relative text; external/unregistered links work in badge input; stale session paths and no session state are handled explicitly; no clipboard read on modal opening. |
| Preview | Paste performs zero writes; Enter submits the displayed subset; Escape before commit performs zero writes; all-invalid input has no add/create action; repeated paste deduplicates; Clear/remove works; batch strings cannot enter Create. |
| Write semantics | Force/direction/parent/lens use the same operation; actual `writeProperty` and equivalent properties honored; incoming writes only the pasted notes; `both` follows existing outgoing add behavior; duplicates never toggle off. |
| Data preservation | One callback per affected note; scalar/list and unrelated nonlink values preserved; matching property casing retained; destination-relative generation correct per actual mutated file; self-links skipped; concurrent value changes preserved. |
| Identity/lifecycle | Same note in two graph instances; nested lens context; two definitions sharing properties; target/definition changes during preview; double Enter; modal closes midcommit; promise settles once; file deleted between preview and commit. |
| Partial success | Incoming write failure after previous success reports both; successful rows are refreshed before retry/close; retry cannot toggle/remove or duplicate prior successes; invalid rows remain understandable. |
| Integration | Both main graph views and rendered embeds receive the shared clipboard state; clipboard batch does not add graph-root membership; single-note input keeps existing root behavior; correct changed-path refresh for incoming/outgoing; lens refresh preserves supported runtime state. |
| Regression | Copy/Cut payload, clipboard-first removal, native body paste, current source frontmatter formatting/escaping, current property widget paste, and normal search/create remain unchanged. |

Use Vitest with mocked clipboard events, isolated modal/host fixtures, and in-memory frontmatter callbacks. Run targeted suites, then `npm test`, `npm run typecheck`, `npx tsc --noEmit -p tsconfig.json`, `npm run build`, and applicable lint checks. The configured architecture typecheck alone does not cover the modified production host files. Distinguish existing diagnostics from new failures. No live clipboard changes, real vault-note mutations, or Obsidian control for testing.

## Manual checks for the user

The implementation chat must deliver concise steps and expected results for:

1. Copy and Cut several graph nodes, Alt-click a badge, paste, inspect preview, then Enter. No writes before Enter; relationship references appear in the correct property afterward.
2. Paste links copied from ordinary note text and property lists, including cross-folder links; verify the full preview paths before submission.
3. Try outgoing force, direction-based, parent, lens, and incoming badges; incoming updates the pasted notes as described in preview.
4. Repeat a paste, mix valid/missing/external/self links, clear a batch, and cancel a preview; verify no duplicates, unwanted files, or unconfirmed writes.
5. Test an expanded lens, nested lens, rendered embed, and another open pane. Verify refresh, stable target identity, and surviving layout.
6. Confirm pasted batches do not add graph roots or open a second property chooser; confirm ordinary single-note search/create still behaves as before.
7. Recheck existing body/frontmatter/property paste and Cut-last-node reopening behavior.

## Implementation chat recommendation

Use a **new implementation chat in the same project**, with this document as its handoff. This is a separate feature with its own parser, preview, and mutation contract, and the completed Cut work is already represented by current code and regression tests. This recommendation is about keeping the task scope clear, not a claim that starting a new chat always uses fewer tokens or benefits caching.

Recommended model: **GPT-6.2 Sol, High reasoning, Standard speed**. The saved review bounds the investigation; High is appropriate for the incoming-write, lifecycle, and lens integration details. Sol's published Standard token rates are one-quarter of Astra's, although total task tokens depend on investigation, retries, caching, and tool results. Reserve Astra High for a concrete unresolved architecture/debugging issue.

Official sources checked 2026-11-19: [Models](https://learn.chatgpt.com/docs/models?surface=codex), [Pricing](https://learn.chatgpt.com/docs/pricing).

## Ready-to-paste implementation prompt

> Implement the feature described in `C:\Users\janbe\OneDrive\Dokumentation\Test Vault\.obsidian\plugins\Bases - Graph-View\docs\architecture\BadgeClipboardPastePlan.md`. Read the full plan and applicable repository instructions first, then inspect the touched source. The Cut feature is already implemented and user-tested successfully; preserve it.
>
> Add clipboard note-link batches to the existing Alt-click badge input, with read-only preview and Enter/Add submission. Follow existing badge direction semantics, including incoming reverse writes. Reuse Copy/Cut clipboard identities and the existing add-only writer, supply complete definition/read/write metadata, and support force/direction/parent/lens through one property-write contract. Preserve ordinary search/create, current body/property/frontmatter paste, unrelated note content, and graph layout. Clipboard batches must not trigger the existing secondary graph-root additions.
>
> Implement the shared parser/resolver and preview state, both main-view and rendered-embed integration, partial-failure handling, meaningful automated regression tests, and documentation. Use the plan's implementation sequence and acceptance matrix. Adapt proposed file names/details to the source while preserving agreed behavior; avoid unrelated refactoring.
>
> All manual testing inside Obsidian will be done by me. Do not control/reload Obsidian or use real vault notes/system clipboard for test interactions. Use isolated fixtures and mocks. Run targeted tests, the full suite, architecture and full-project TypeScript checks, build, and applicable lint checks; distinguish existing failures from regressions. Proceed through implementation and automated validation. Finish with a concise summary, check results, limitations, and a manual test checklist with expected outcomes. Mark manual verification pending user testing. Keep reads/output focused and avoid redundant successful test runs.
