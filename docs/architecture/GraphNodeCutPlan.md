# Cut selected graph nodes: implementation and architecture plan

Release status (2026-11-21): implemented. The maintainer confirmed the features and manual Obsidian testing before the 0.3.0 release. Earlier planning and verification notes below are historical; see the [0.3.0 verification guide](../releases/0.3.0-release-guide.md) for the current release checks.

This document records the original root-property implementation. [Lens and expansion Cut](LensNodeCutPlan.md) supersedes its scope and describes the current ownership, host, and persistence rules.



Status: implementation completed on 2026-11-19. Automated verification results are recorded below. Manual Obsidian verification is pending user testing. The user has superseded this plan’s live smoke-check instruction with isolated automated tests only.



## Implemented composition



- The production `GraphEngine` projects selected instances with definition ownership and captures the context-menu selection. The canvas shortcut and the focused-graph command call `BasesGraphView.cutSelectedNodesToClipboard`. A per-App guard prevents overlapping cuts across panes.

- `graph-application/GraphNodeCutService.ts` owns publication-before-removal ordering, deterministic owner batches, source lifecycle validation, and separate results for property, refresh, and persistence failures. Its ports and contracts have no Obsidian or DOM dependencies.

- `GraphNodeClipboard.ts` is shared by Copy and Cut. It deduplicates paths in selection order, writes plain text, then registers the existing paste payload. Source frontmatter and property widgets continue through the existing plugin paste handlers.

- `GraphRootPropertyResolver.ts` supplies the live reader and mutation adapter with effective property selection. `GraphRootMembership.ts` plans safe removals and `ObsidianGraphRootPropertyMutationHandler` revalidates inside one frontmatter callback per owner. Ambiguous compound strings and objects are skipped intact.

- `GraphRootSnapshotReconciliation.ts` reconciles configured roots with saved and live lens snapshots, including nested restoration. Main graph reloads prune obsolete roots before graph construction, and explicitly configured empty graphs bypass the legacy snapshot-file fallback. Empty property keys retain graph capability. Empty lenses can be replaced and reopened.

- `GraphDocumentMutationQueue.ts` coordinates per-owner frontmatter removals with document-state writes. Cut drains pending runtime writes, suppresses new automatic runtime writes during execution, refreshes all open views and instances, and reconciles existing state blocks using note-truth-reconciliation. The deliberate empty overwrite is confined to a successfully hydrated, nonempty owner with an existing readable state block. Ephemeral definitions keep the existing persistence policy.



The operating-system clipboard and owner files remain separate transactions. Partial failures retain the original eligible payload. No rollback is attempted. Manual interaction and visual layout behavior require the user checklist below.



## Automated verification record



- Targeted membership, clipboard, orchestration, live interaction/paste, root refresh, graph-state, and lens-persistence suites passed during implementation.

- Final full Vitest suite passed with 109 test files and 642 tests.

- Architecture typecheck passed.

- Full-project `npx tsc --noEmit -p tsconfig.json` ran and failed with 138 existing diagnostics. Normalized file/code/message comparison against the repository’s `current-tsc.txt` baseline found zero new diagnostics. Existing findings include missing modules in the separate architecture tree and live-host typing issues.

- Production build passed and regenerated `main.js`.

- Full repository lint passed with zero warnings.

- Verification used mocks and isolated in-memory note fixtures. Manual Obsidian behavior remains pending user testing.



## Installation correction after initial user test

The first user shortcut/paste test used the older active installation. The vault enables plugin ID `nosygraph`, whose bundle is `.obsidian/plugins/nosygraph/main.js`. The source workspace builds `.obsidian/plugins/Bases - Graph-View/main.js`. The active bundle lacked both the Cut command and handler. The verified build was copied to the active plugin directory and its SHA-256 was checked against the source build. The user must reload the plugin and repeat manual verification. Source behavior was not changed during this diagnosis.

## Manual verification pending user testing



1. Select one and several property-backed roots. Use the context-menu Cut item, Ctrl+X / Cmd+X, and the command. Expect one operation per invocation, references removed from the owning properties, and links available for paste. Right-clicking an unselected node selects it. Right-clicking a selected node preserves the multiselection.

2. Paste repeatedly into a note body, source frontmatter, and a property widget. Expect normal note links in the body, YAML entries in source frontmatter, and link values in the widget. Verify Copy still behaves the same.

3. Mix property-backed roots with expansion, filter, or body-only nodes. Expect eligible references removed and an explanatory skipped count. An entirely ineligible selection leaves properties and clipboard unchanged. Text fields retain native cutting.

4. Open the same definition in multiple panes and duplicate or nested lenses, including an ephemeral definition persisted by a parent graph. Expect each affected instance to refresh, the correct definition’s properties to change, and surviving positions, pins, badges, viewport, and lens geometry to remain usable.

5. Cut the last root, close and reopen the graph and its parent lenses, then restart Obsidian if desired. Expect the empty graph/lens to remain usable, the root property to remain an empty array, and removed roots to stay absent. Referenced files and unrelated note content remain present.





## Agreed behavior



Provide **Cut node** / **Cut nodes** beside Copy in the graph context menu, and **Ctrl+X** (also Cmd+X, consistent with Copy) while the graph canvas has keyboard focus. Both entry points and an Obsidian command invoke the same operation.



The user explicitly confirmed: **Cut only nodes backed by root-property entries; skip other selected nodes with an explanation.** Relationship expansion nodes and Base/filter results without such entries remain unchanged. Body-derived roots through `None-type links` are also outside this property-only operation.



Cut immediately removes selected note references from the owning graph note's or graph-capable note's effective root properties and writes note links to the clipboard. Paste behaves exactly like Copy: ordinary Markdown links in note bodies, the existing YAML insertion in source frontmatter, and the existing property-value paste integration. Paste may be repeated; it does not trigger or finish the removal.



Remove references, never the referenced note files. Leave graph configuration (including the `rootNodeProperties` list), unrelated property values, and note bodies intact. Removing the last reference leaves that root property as an empty array. A node that remains legitimately visible through another relationship or filter can remain in the graph, but its removed root membership must not return.



## Existing implementation and constraints



| Concern | Current live location | Planning consequence |

| --- | --- | --- |

| Copy serialization and clipboard write | `src/GraphView.ts`, `copySelectedNodeLinksToClipboard` | Extract and share this behavior with Cut; preserve formatting and link-generation preferences. |

| Clipboard path/text registration and paste | `src/main.ts`, `rememberCopiedGraphNodeLinks`, `handleGraphNodeLinksFrontmatterPaste`, `handleGraphNodeLinksPropertiesPaste` | Cut must register through the same callback after clipboard success. No new clipboard format or separate paste implementation. Body paste currently uses the clipboard's plain text. |

| Keyboard and context menu | `src/GraphEngine.ts`, `onContainerKeyDown`, `onContextMenu` | Extend the live engine, including its editable-target guard and existing right-click selection behavior. |

| Selection | `getSelectedNodePaths`, `getSelectedNodeRefs` in the live engine | Paths deduplicate note identities; refs preserve runtime instances but do not include property ownership. Neither alone is a sufficient Cut request. |

| Embedded membership owner | `GraphNode.embeddedDefinitionPath` | This identifies the note whose properties define lens membership. `stateOwnerPath`/persistence ownership may instead identify a parent graph and must not select the property mutation target. |

| Root-property resolution | `GraphView.resolveRootNodeFilesFromGraphFrontmatter`, `getRootNodePropertyNamesForFile`; `GraphPropertyKeys.ts` | Preserve the reader's precedence: explicit `rootNodeProperties`, then plugin defaults, then configured/canonical `rootNodes` fallback. The second helper alone misses the direct `rootNodes` fallback. |

| Existing removal | `removeEmbeddedRootNode`, `synchronizeEmbeddedRootRemoval`; `O3GraphState.removeVisibleRoot` | The existing menu removal handles direct embedded `rootNodes`, not the full required property selection or batched cuts. Reuse runtime primitives where valid, rather than looping this UI method. |

| Runtime restoration | `mergeConfiguredRootSnapshots`, `refreshEmbeddedGraphDocument`, `restoreEmbeddedGraphExpansions`, `reloadFromFile` | Existing merges retain obsolete roots; empty file-mode graphs can restore snapshot files. A property edit plus reload alone cannot implement reliable Cut. |

| Persistence guard | `O3GraphDocumentStore.writeState`, `O3GraphStateStore.isUnsafeGraphStateOverwrite` | `note-truth-reconciliation` permits removals but still refuses an overwrite that empties populated state unless explicitly authorized with the existing empty-overwrite option. |



Production `GraphView` constructs `src/GraphEngine.ts`. `src/graph/GraphEngine.ts` and the guarded `StoreGraphRuntime` are separate architecture paths. Implement and verify the production path; keep new application contracts host-neutral so store mode can reuse them later. This feature does not require a runtime migration.



## Ownership and selection rules



1. Capture selected runtime instances once at invocation, before awaiting clipboard or disk work. A context-menu invocation captures the menu's selection; later selection changes do not retarget an open menu action.

2. Project each instance to a detached reference containing `nodeId`, canonical note `path`, membership `ownerPath`, and optional lens/context identity. Resolve main-graph ownership from the file bound to that view. Resolve embedded ownership from the defining graph-capable note, including nested lenses.

3. Eligibility is established by a removable reference in that owner's effective root properties, not by `depth`, `isBase`, `embeddedRoot`, or note path alone. An expansion/filter instance with a matching root-property entry is eligible; an instance with no entry is skipped.

4. Deduplicate mutations by `(ownerPath, path)`. Selecting the same note in two different graph definitions cuts its membership from both definitions. Selecting two lenses of one definition changes that note once; all instances of that definition refresh.

5. Deduplicate clipboard links by note path, preserving selection order, as Copy does. Include eligible selected notes only. Descendants that disappear because their introducing root was removed are not implicitly copied.

6. Scope eligibility to each selected instance's owner. Do not search other graph notes for matching references, and do not remove incoming/outgoing LinkType relationships as a substitute.

7. With no eligible targets, leave clipboard and files unchanged and explain the skipped selection. A mixed selection cuts the eligible subset and reports how many were skipped and why.



Missing-note nodes should use the same normalized unresolved target identity and fallback clipboard link as the existing graph/copy path. A matching root-property reference can therefore be cut without requiring the target note to exist. If identity cannot be established unambiguously, skip that target.



## Proposed component boundaries



Keep a small application operation with injected host ports. Avoid putting YAML rules, clipboard writes, or asynchronous mutation sequences in the renderer or engine.



### Selection projection and UI: `src/GraphEngine.ts`



Add a selection projection that retains membership ownership, plus `onCutSelectedNodes` and a cheap availability check for the context menu. Use current cached membership information for menu presentation and perform authoritative validation again during execution. No disk writes occur while building menus or checking command availability.



Cut is shown for a nonempty selection; disable it when no target is cuttable, with a short explanation where the menu supports one. Keyboard invocation with only ineligible nodes produces an explanatory Notice. Follow the current right-click rule: an unselected clicked node becomes the selection; clicking a selected node preserves the multiselection.



Handle Ctrl/Cmd+X only in the graph's noneditable surface, without Alt or Shift. Do not intercept native text cutting in inputs, textareas, contenteditable elements, editors, or property fields. Ignore repeated keydown events and suppress duplicate invocations while a cut is running. Keep lifecycle event registration/disposal paired with the current handlers.



### Shared clipboard helper: proposed `src/GraphNodeClipboard.ts`



Extract Copy's path deduplication, link serialization, clipboard write, and registration callback into a shared helper accepting an explicit path snapshot and source note path. Inject the write function for tests. The registration callback runs only after the system clipboard write succeeds. Copy and Cut own their respective Notices.



Retain `generateMarkdownLink`, newline-separated plain text, unresolved-link fallback, and the existing `onGraphNodeLinksCopied` callback contract. Renaming that callback to a neutral name is optional and should be done only if all construction sites are updated together. Preserve current body-paste behavior rather than introducing destination rewriting for bodies in this feature.



### Application operation: proposed `src/graph-application/GraphNodeCutService.ts`



Own execution order, results, and per-owner grouping through injected ports for planning/removing memberships, publishing clipboard data, and reconciling changed owners. Import no `App`, `TFile`, DOM, `navigator`, or Notice APIs.



Suggested contract shapes, not implementation code:



- `GraphNodeCutSelection`: immutable runtime node ID, note path, membership owner path, optional context ID.

- `GraphNodeCutPlan`: captured targets, eligible owner/path pairs, unique clipboard paths, skipped targets with reason.

- `GraphNodeCutResult`: removed owner/path pairs, skipped/stale targets, failed owners, runtime-refresh failures, and clipboard publication status.



Use explicit skip reasons such as `no-property-membership`, `body-derived-root`, `no-file-owner`, `ambiguous-reference`, and `owner-unavailable`. Keep node/link counts distinct from the number of property entries removed.



### Membership adapter: extend `src/ObsidianGraphRootPropertyMutationHandler.ts`



Add noninteractive planning and batch removal methods. Use one `processFrontMatter` mutation per owner, including all selected paths and all effective root properties. Recheck matches against the callback's current frontmatter, rather than overwriting a snapshot read before the clipboard await. Return exact removed pairs and changed keys.



Extract a shared effective-root-property resolver, proposed `src/GraphRootPropertyResolver.ts`, from the live view's logic. Both the root reader and removal adapter consume it. It accepts detached frontmatter and settings, distinguishes property-backed roots from body-link roots, and preserves explicit-empty configuration and fallback precedence. Only active root properties are candidates; an inactive `rootNodes` property must not be edited when configured properties override it.



Match links by resolved target identity relative to the owner note, covering aliases, headings, Markdown links, relative paths, plain supported references, and unresolved targets. Preserve actual property-key casing. Handle case-equivalent keys and configured/canonical fallback aliases consistently so a retained alias cannot resurrect the same removed membership.



For standard scalar links and lists of link entries, remove all matching occurrences while preserving unselected entries verbatim, their order, and their types. Preserve scalar form when untouched; write `[]` when emptied. Never drop an entire compound string or object merely because it contains one selected link. Remove a supported compound reference only when its selected part can be isolated without losing other content; otherwise mark that target ambiguous and skip it consistently in planning and commit. A target is eligible only if all root-property occurrences needed to remove its membership are safely editable.



The generic `graph-application/ObsidianNoteWriter.removeRelationship` illustrates injected host access but currently writes per relationship, requires both files to exist, and drops whole matching values. Repeated calls to it would not meet these batching and preservation requirements. Share narrow matching utilities if useful; do not expand this into a general note-writer refactor.



### Composition and refresh: `src/GraphView.ts` and `src/main.ts`



Expose `cutSelectedNodesToClipboard` and compose the operation in the view. Register an Obsidian command beside `copy-selected-graph-node-links-from-focused-graph`, using the focused graph and a read-only availability check. The graph-local hotkey invokes the same operation; avoid a second global Ctrl+X handler.



Keep one plugin-scoped in-flight guard for cuts across views so overlapping commands cannot interleave clipboard publication and removals. Coordinate membership mutations and runtime reconciliation with pending graph-state writes for each affected owner. Reuse the existing graph/lens write queues and introduce only the minimum shared coordination needed; avoid waiting on a queue from inside its own task.



After commit, notify all open graph views for every changed owner through the existing frontmatter refresh boundary. Refresh all lens instances of that definition, including those in other panes, and remove invalid selection/active-node references through the existing controller/store lifecycle. Preserve surviving coordinates, pins, viewport, lens geometry, and badge states.



## Execution sequence and failures



1. Capture the selection and originating view/document identity; reject an empty selection or a duplicate invocation.

2. Plan against fresh owner data, resolve effective properties, and compute eligible targets and clipboard links. Revalidate lifecycle before beginning writes if the source view closed or changed documents during planning.

3. Write the complete eligible payload to the clipboard and register it with the existing paste integration. **No property removal may occur before this succeeds.** On clipboard failure, report failure and leave graph membership unchanged.

4. Process owner groups in a deterministic order, serializing writes per owner. Revalidate against live frontmatter inside each mutation. Record stale memberships as skipped, and collect failures without losing results for other owners.

5. Reconcile runtime state only for actual successful removals, persist permitted runtime changes, invalidate affected caches, and refresh open graphs/lenses. Do not treat a successful property edit as a failure just because a later runtime refresh fails.

6. Show one final Notice: successful unique note count, optional membership count when owners differ, skipped count/reasons, and any failed owner updates. Use explicit wording for clipboard-only or partial success.



The operating-system clipboard and multiple note files do not form one atomic transaction. On stale membership, write failure, or partial success after clipboard publication, retain the original eligible clipboard payload. It may contain links whose memberships were not removed; say so. Do not attempt to restore an old clipboard or overwrite concurrent note edits with a whole-file rollback. Catch failures at all entry points so no fire-and-forget promise rejection escapes.



## Runtime reconciliation is required



Implement this before considering the feature complete:



- Make effective property membership authoritative over saved root snapshots. Reconcile both additions and removals instead of extending the current additive merge. Prune expansions and nested lenses whose introducing root disappeared, while preserving independently valid roots/filter membership and expansion paths. Reuse `removeVisibleRoot` where its descendant ownership semantics are correct; do not blindly remove every instance sharing a path.

- Apply the same reconciliation to the main graph state, the embedded definition state, live per-instance snapshots, and restored parent/nested lens snapshots. Keep membership ownership separate from the policy that chooses where runtime snapshots are persisted.

- Prevent `reloadFromFile`'s snapshot fallback from repopulating a deliberately empty configured graph. Test empty membership after a normal reopen as well as immediately after the command; a transient in-memory flag is insufficient.

- Keep the currently opened graph-capable note/lens usable when its last member is cut. Retaining an empty root property provides a durable signal: an explicitly configured graph, or a note with an existing configured/default root-property key whose value is now `[]`, can remain graph-capable. Do not classify every note as graph-capable merely because global defaults exist. Cover this recognition change with tests.

- Use the existing `note-truth-reconciliation` write reason. Permit a validated deliberate empty-state reconciliation with the narrow existing `forceEmptyOverwrite` option, after confirming the actual note is present, nonempty, and successfully hydrated. Never enable this option for ordinary viewport/hydration writes. Avoid creating an `o3graph` block on an ephemeral graph-capable note solely because it was cut; respect existing persistence ownership and policy.

- Reconcile before rendering/restoring stale snapshots, including after restart. If runtime persistence fails after the property write, current property truth must still prevent removed roots returning on the next load. Report the persistence failure separately and retain clipboard recovery links.



Do not route Cut through vault deletion, generic `engine.removeNode(path)`, local-storage-only `removeRootNode`, or one asynchronous `removeEmbeddedRootNode` invocation per selected node. Each misses part of membership ownership, batch safety, or restoration semantics.



## Implementation order



1. Add host-neutral contracts, effective-property resolution, and membership-planning/removal tests.

2. Extract the shared clipboard helper and keep Copy behavior passing unchanged.

3. Implement the cut orchestration and batch membership adapter, with explicit partial-failure results.

4. Implement and verify removal-aware runtime reconciliation, including intentional empty graphs and graph-capable-note recognition.

5. Wire live engine selection projection, menu, local keyboard shortcut, view method, and Obsidian command to the same operation; connect refresh across panes.

6. Update README interaction/privacy wording for explicit Copy/Cut clipboard actions and describe the root-property-only scope. Update architecture documentation to describe the final live composition.



## Validation and acceptance



Use focused Vitest suites and extend `GraphRootRefresh.test.ts`, `O3GraphState.test.ts`, and persistence-policy/state-store tests where appropriate. Tests should verify observable membership, clipboard, restored runtime, and preserved note content.



| Area | Required cases |

| --- | --- |

| Root properties | Direct/configured/remapped `rootNodes`; explicit/custom root properties; defaults; explicit empty override; several properties; case variants/fallbacks; same note repeated in a property or several root properties. |

| Reference preservation | Scalar/list; aliases/headings; Markdown/relative references resolved from the owner folder; missing note; unrelated mixed values retained; ambiguous compound values skipped without content loss. |

| Selection and ownership | Single/multiple; selected/unselected right click; duplicate instances in one owner; same note in different owners; nested lenses whose property owner differs from runtime persistence owner; source document changes during planning. |

| Eligibility | Expansion/filter/body-only roots skipped; mixed selections explain skips; no eligible targets do not touch clipboard/files; root-backed selection removes only its owner's membership. |

| Clipboard/paste | Exact Copy-equivalent text; one link per note; registration only after successful clipboard write; body, source frontmatter, and property widget paste; repeated paste remains possible; existing Copy remains unchanged. |

| Failures and ordering | Clipboard rejection causes zero removals; owner write failure; partial multi-owner failure; live property edits between planning and commit; repeated hotkey/in-flight invocation; runtime persistence failure after successful membership removal. |

| Runtime | Cut some/all/last roots; immediate refresh and restart/reopen; stale definition and parent lens snapshots; all open lens instances/panes refresh; unaffected layout and badges retained; independent membership can keep a node visible; no unwanted state block created. |

| Interaction | Ctrl/Cmd+X invokes once; editable fields retain native cut; no Alt/Shift interception; command availability checks are read-only; menu/keyboard/command use the same operation. |



Run targeted suites during development, then `npm test`, `npm run typecheck`, `npm run build`, and the applicable lint check. The configured `typecheck` covers only the domain/application tree: also run `npx tsc --noEmit -p tsconfig.json` for the modified live host/UI files and distinguish existing diagnostics from new ones. Complete a live Obsidian smoke check of the menu, shortcut, all three paste destinations, multiple panes/lenses, and cutting the last node.



No custom undo stack, deferred move-on-paste, new clipboard MIME type, note-file deletion, LinkType relationship cutting, Base/filter exclusion rules, or store-runtime cutover is included in this feature.
