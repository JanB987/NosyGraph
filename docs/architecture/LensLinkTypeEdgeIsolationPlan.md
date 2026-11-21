# Lens LinkType ordinary edge isolation plan

Release status (2026-11-21): implemented. The maintainer confirmed the features and manual Obsidian testing before the 0.3.0 release. Earlier planning and verification notes below are historical; see the [0.3.0 verification guide](../releases/0.3.0-release-guide.md) for the current release checks.

Status: implemented in the development workspace, 2026-11-21. Automated regression fixtures and manual Obsidian verification are pending user execution.

## Confirmed intended behavior

The user confirmed that **a Lens LinkType itself must never create ordinary node-to-node relationship edges**, including when both endpoint notes are already visible at the same level, or when the Lens definition is listed under Visible or Overlay LinkTypes. Its badge, membership resolution, viewport, and viewport connector remain available.

A separately enabled Force/Direction LinkType may read the same property and legitimately produce an edge. Preserve that independent edge and its ordinary physics. A property shared with a Lens must not become globally forbidden.

Example: graph `G` lists A, B, and C as roots. A.scope links B/C. With only a Lens definition reading scope, A/B/C remain roots and the Lens opens with B/C, but there are no ordinary A–B/A–C edges or relationship springs attributable to the Lens. Adding a separate Force definition reading scope can intentionally create those ordinary edges.

Do not confuse the viewport connector from A to its open lens frame, real edges between members authorized by other definitions, or genuine ordinary relationships between outer roots with the unwanted Lens membership edge.

## Source evaluation

The primary path is in the production `src/GraphEngine.ts`, not the experimental renderer:

1. `GraphView.onDataUpdated` maps every active definition, including Lens, to its legacy `property` identity and passes those values to `setSelectedLinkTypes`. The rendered embed in `main.ts` performs the same flattening.
2. `rebuildEdges` loops frontmatter links by property. It asks `GraphRenderVisibilityPolicy.shouldRenderRelationshipEdge` whether a selected relationship with an already-visible target should become an edge.
3. That policy receives only `parentSemantic`, not the definition's full semantic. `getLinkTypeSemantic` returns only `"link" | "parent"`; a Lens therefore falls through as an ordinary link. A visible target plus discovery-enabled/default configuration can admit it.
4. `pushEdge` creates a normal runtime edge with no Lens-specific semantic/definition provenance. There is then no reliable way to distinguish it from a legitimate Force relationship sharing the property.
5. `registerLinkTypeRuntimeConfig` registers every non-Direction definition through its force-config branch, including Lens. This can supply spring parameters for an admitted Lens edge, and can overwrite another definition's property-keyed configuration when properties overlap.
6. The live link-spring loop processes ordinary and visible edges; it skips overlay edges but has no Lens exclusion. Thus this is potentially a real attraction/physics bug, not only an unwanted line.

This explains why the symptom is exposed when the linked notes are also graph roots: the direct-edge policy requires the target to be already visible. The source does not prove that every visible edge in the user's graph comes from this route; an independently active ordinary LinkType could authorize a similar-looking edge. The implementation should isolate provenance with a minimal Lens-only fixture before drawing conclusions about mixed configurations.

Other admission/reintroduction paths need the same boundary:

- `addVisibleLinkTypeEdgesForContext` and `addVisibleLinkTypeEdgesForSourceNodes`, including their incremental source refresh callers.
- `addOverlayEdges`, which currently works from property names without a Lens semantic check.
- The `expandedByBadge` replay loop in `rebuildEdges`, which excludes parent but not Lens definitions.
- `addEdge`/`updateEdges`, metadata-driven canonical edge replacement, mutation-time visible-edge synchronization, and embedded snapshot expansion reconstruction where they admit ordinary relationship edges.
- Embedded/nested contexts that inherit visible definitions, including Lens viewports and old note-backed graph lenses.

Key source references at inspection: `GraphEngine.ts` rebuild at approximately 1682, ordinary visibility call at 1747, overlay at 2201, visible builders at 2279/2311, spring loop at 7438, runtime-config registration at 11370, and two-valued semantic getter at 12462. `GraphRenderVisibilityPolicy.ts` defines the ordinary edge condition. Reinspect line numbers/current code before implementation.

## Options and tradeoffs

| Option | Result | Assessment |
| --- | --- | --- |
| Hide the line during drawing | Removes the visual symptom while the runtime edge can still affect springs, connection counts, and persisted/shadow snapshots | Insufficient. |
| Lower Lens linkForce or disable discovery as a workaround | Depends on unrelated settings; force is clamped and discovery/membership behavior can be affected | Does not enforce the requested semantics. |
| Remove Lens properties from one selected-property list | Can stop the most obvious main-view edge path | Incomplete alone: visible/overlay, refresh, embedded, stale state, and raw property fallbacks can reintroduce it. |
| Block every edge on any Lens read property | Simple blacklist | Incorrect when an ordinary definition legitimately shares the same property. |
| Add a shared, context-aware edge-admission policy based on definition semantics, preserving provenance until admission | Excludes Lens contributors consistently and preserves authorized ordinary contributors | Recommended bounded correction. |

The recommended approach is not a full graph-runtime migration. Retain existing LinkType notes, UI state, badge APIs, and the production engine while separating Lens membership capability from ordinary edge capability at the touched boundaries.

## Recommended architecture

### Separate capabilities and keep definition identity

Introduce a small host-neutral policy/helper, proposed `src/graph-application/GraphRelationshipEdgePolicy.ts`, or extend the existing visibility policy with a complete definition-aware input. Lens definitions have membership/viewport capability and **no ordinary-edge capability**. Parent definitions keep their existing specialized behavior. Force/Direction definitions retain normal edge behavior.

Resolve candidates from definitions enabled in the relevant graph context, not from all definitions merely present in the vault. Keep badge activation independent: do not remove Lens definitions from `activeNodeBadgeLinkTypes`, registry loading, target resolution, or the menu simply because they are ineligible to produce ordinary edges.

Where property-based legacy selection remains, map a property to the eligible definitions selected for that operation/context. A known Lens-only property/definition token produces no ordinary candidates. An explicit Lens definition reference must not silently become authorization for a different Force definition sharing its property. A truly unregistered legacy raw-property entry can retain its existing interpretation; it must not bypass a known Lens-only classification.

For ambiguous raw property selectors, preserve the existing documented compatibility behavior while allowing enabled ordinary candidates and excluding Lens candidates. Do not allow an inactive Force note elsewhere in the registry to authorize an edge. Add/remove/rename/type-change events must update the effective candidates rather than leave a stale property classification.

Retain enough origin metadata through edge admission to identify the authorizing definition. Existing `type`/`linkType` fields are sometimes property aliases rather than canonical definition IDs; do not overwrite these indiscriminately. Add optional provenance or use a scoped resolved-edge descriptor if needed, preserving downstream lookup and deduplication compatibility.

### Apply one policy to all runtime construction paths

Use the same eligibility rule in the full edge rebuild, visible/overlay builders, incremental metadata/mutation refresh, and restoration of ordinary expansion edges. Prefer filtering candidates before `pushEdge`/materialization rather than keeping an invisible-but-physical edge and relying only on the renderer to skip it.

Do not only add `semantic === "lens"` to the existing single property-keyed semantic map. Lens and ordinary definitions can intentionally overlap, so one winning semantic per property would make behavior depend on registration order. Keep ordinary property lookups compatible by deriving them from ordinary contributors, not Lens overwrites.

Inspect runtime registration: Lens definitions must not replace the physics, direction, or appearance selected for an ordinary edge sharing the property. Preserve Lens-specific parameters used for viewport/container centering. Avoid broadly disabling `linkForce` or removing relationship read/write metadata that Lens badges/input still need.

The pure visibility policy can accept full semantic/edge capability as an additional gate while preserving its existing selected/parent/duplicate/discovery/visibility rules. Every caller must resolve the right contributing definition; an optional flag defaulting to ordinary everywhere would hide the original classification bug rather than fix it.

### Visible/overlay selection retains user data

The confirmed rule also applies if a Lens note is explicitly listed under Visible/Overlay LinkTypes. Keep the saved frontmatter value intact, retain the definition for its badge/viewport if otherwise active, but do not emit ordinary edges from it. A concise unavailable/no-edge explanation in an existing diagnostic/menu surface is sufficient if needed; do not introduce a new settings workflow or rewrite the user's configuration.

Review `GraphView.resolveVisibleLinkTypeProperty` and the embed's visible-definition resolution: they can reduce note identity to a property before semantic filtering. Filter/provide definition-aware metadata before that irreversible flattening so an explicit Lens reference does not accidentally activate an ordinary definition sharing the property.

### Refresh, stale edges, and physics

Rebuild/incrementally reconcile runtime edges under the corrected policy after definition loading and changes. Prune old Lens-attributed ordinary edges, including surviving embedded edges preserved across full rebuilds, without deleting the note instances or authorized ordinary edges on the same endpoints/property. When an old edge lacks trustworthy provenance, reconstruct the eligible edge set from current context/configuration instead of deleting every edge with that property.

Confirm absence from all relevant consumers: live edge collection, canonical edge reconciliation, connection counts/node-size multipliers, edge highlighting, snapshot adapters, and force/spring input. A draw-only assertion is not enough. Excluding the edge before materialization is the primary fix; a narrow assertion/defensive filter at a physical projection boundary can be added if existing migration paths can still supply stale invalid edges. Do not redesign the experimental physics/store runtime.

Persisted runtime may contain old expanded badges or graph snapshots, but it must not authorize Lens edges when rebuilt. Preserve valid Lens windows, geometry, source anchors, and target-only membership on reopen. No frontmatter relationship deletion or broad graph-data clearing is needed.

### Preserve boundaries

- Keep the existing parent-to-lens-frame connector and container centering/repulsion; these are viewport presentation/layout, not ordinary member relationship edges.
- Preserve the target-only Lens contents correction already present in current source and its regression cases.
- Real Force/Direction relationships between Lens members or outer roots remain eligible according to their own definitions.
- Keep the membership toggle: adding C alongside A can make C a graph root, but that must not itself authorize an ordinary Lens edge from A to C.
- Preserve Copy/Cut, badge input, icon overrides, old note-backed lens behavior, grouping, and the current unsupported incoming/`both` Lens viewport limits.
- Do not change raw relationship data or canonical note discovery facts solely to prevent a rendering/runtime edge. The stored A.scope links remain the Lens's source of truth.

## Implementation sequence

1. Prepare an isolated production-path fixture with roots A/B/C and exactly one Lens definition reading A.scope. Assert candidate classification and ordinary-edge absence; keep a separate Force-overlap control.
2. Add the small definition/context-aware policy and resolved candidate/provenance shape. Keep it detached from Obsidian.
3. Wire main-view/embed configuration resolution and the primary full rebuild, preserving Lens badge activation.
4. Cover visible/overlay and incremental refresh/replay paths using that same policy; eliminate property-only Lens fallthrough.
5. Prevent Lens registration from overriding ordinary edge configuration; verify both definition registration orders.
6. Reconcile stale runtime edges and audit snapshots/physics/connection counts without resetting valid nodes or viewports.
7. Prepare regression coverage, update the relationship/Lens architecture docs and user-facing behavior description, and deliver verification instructions.

## Validation matrix

All manual Obsidian testing is assigned to the user. Following the established handoff convention, prepare automated fixtures/test commands without executing suites in the implementation chat; build/static checks are allowed. Do not control/reload Obsidian or change real notes/clipboard for test interactions.

| Scenario | Expected result |
| --- | --- |
| Lens-only, A/B/C all graph roots | No ordinary A–B/A–C edges, connection-count contributions, or link springs attributable to Lens; badge and viewport connector remain. |
| Linked target initially absent from outer roots | Opening Lens shows its proper inner instance; no new cross-context ordinary edge to it. |
| Target added as root by membership toggle | Still no Lens ordinary edge before/after metadata refresh. |
| Lens plus active Force on same property | Force edge and its correct force/distance/color remain. Both registration orders produce the same result. |
| Lens plus inactive Force in vault | The inactive definition does not authorize an ordinary edge. |
| Lens plus Direction/parent behavior | Ordinary direction parameters/specialized parent behavior remain owned by their actual definitions. |
| Multiple Lens definitions/multiple read properties | No ordinary edges solely from any Lens alias/read property; independent lens instances retain proper members. |
| Explicit Visible/Overlay Lens note | No ordinary edge and no user frontmatter deletion; no accidental switch to another definition sharing the property. |
| Raw property selectors | Lens-only is excluded; valid ordinary/unknown legacy selection remains compatible under the specified resolution rule. |
| Full rebuild vs incremental | Metadata changes, clipboard input, membership additions, drops, graph rehydration, and definition reload all obey the same admission rule. |
| Old expanded/saved runtime | Reopen removes stale Lens-only edges while retaining authorized overlapping Force edges, nodes, layout, and Lens state. |
| Embedded/nested/rendered graph | Context-specific eligibility prevents leakage from another graph/lens; real internal ordinary member relationships remain. |
| Type change Lens ↔ Force | Current semantics determine edges after refresh; no stale blocked/allowed classification or lens-overwritten physics remains. |
| Physics/snapshots | Corrected runtime/snapshot edge collection produces no Lens springs or edge-count effects; rendering-only suppression cannot pass the fixture. |

Candidate files: extend `GraphRenderVisibilityPolicy.test.ts`, add `LensLinkTypeEdgeIsolation.test.ts` for the real builder/admission boundary, extend `GraphLinkPropertyCasing.test.ts` with typed overlap cases, and reuse `LensLinkTypeContents.test.ts`, metadata refresh, clipboard graph integration, and relevant physics projection fixtures. Preserve existing ordinary visible/overlay tests; do not satisfy this fix by disabling all visible edges.

For the manual checklist, provide G.rootNodes = A/B/C, A.scope = B/C, one Lens definition, and an optional separate Force definition. Have the user inspect closed/open Lens states, add/remove the Force definition, change a property, use membership On, save/reopen, and repeat in an embed/nested context. State expected lines and configuration ownership for each step. Absence of visible attraction alone cannot prove edge exclusion because other graph forces remain; automated fixtures should inspect actual runtime/physics input.

## Static verification and deployment

Run the production build, bundle syntax check, architecture typecheck, full-project `tsc --noEmit`, and applicable lint. Compare current diagnostics with a pre-change baseline. Mark prepared automated tests and manual Obsidian verification pending the user.

Provide the rebuilt development `main.js` absolute path and SHA-256. The installed `.obsidian/plugins/nosygraph/` copy must match before the user reloads; a build in this development folder alone does not update it. Do not deploy outside the authorized workspace, overwrite settings, or reload Obsidian under this prompt.

## Manual testing

Create a graph note G with `rootNodes: ["[[A]]", "[[B]]", "[[C]]"]`. In A, set `scope: ["[[B]]", "[[C]]"]`. Add a Lens LinkType note with `linkType: lens` and `property: scope`, and select it under G's Active LinkTypes. Create a separate Force Based LinkType with `property: scope`, a distinctive line color, and a different `linkDistance` and `linkForce`. Start with the Force definition inactive.

| Action | Expected result |
| --- | --- |
| Open G and toggle A's Lens badge. | B and C remain graph roots. The lens contains B and C once each, with A outside and the connector running from A to the frame. A–B and A–C ordinary lines are absent in both open and closed states. |
| List the Lens note under Visible LinkTypes and Overlay LinkTypes, including while the separate Force note exists in the vault. Then try the visible raw property `scope`. | The Lens entries produce zero ordinary edges. The inactive Force definition supplies no edges or spring settings. |
| Enable the Force definition under Active LinkTypes, test both list orders, then move Force to Visible and Overlay individually. | The Force definition authorizes the corresponding edges with its configured appearance and layout. Active and Visible edges use ordinary spring settings. Overlay lines remain spring-free. Removing Force restores the Lens-only result. |
| Add or remove a target in A's `scope`, use Lens badge input or a drop, and add a target as a root with membership On. | Membership and graph roots reflect the configured writes. Lens-only additions produce no ordinary edges before or after metadata refresh. With Force enabled, eligible lines follow the current links. |
| Save an open Lens and reopen the graph. Repeat in a rendered embed and within a note-backed or nested lens with its own LinkTypes. | Lens membership and the source/frame connector remain. Lens-only edges are absent after replay. Ordinary edges follow each context's own enabled definitions, even when the same notes also appear in the outer graph. |
| Change an active definition between Lens and Force or Direction. Check a separately configured Parent relationship. | The updated definition's semantics take effect on reload or definition refresh. Direction and Parent retain their specialized behavior. |

The regression fixtures inspect the live edge collection, connection counts, and projected physics input. Obsidian's container forces can still move nodes while a Lens is open.

Run from the development plugin folder.

```powershell
npm test -- LensLinkTypeEdgeIsolation LensLinkTypeContents GraphLinkPropertyCasing GraphRenderVisibilityPolicy GraphLensPersistence GraphRootRefresh BadgeClipboardGraphIntegration ObsidianGraphBadgeMembership GraphNodeCutInteraction LinkTypeBadgeIcon GraphPhysicsInputProjector
npm test
```

## Chat and model recommendation

Continue the **Lens target-only correction implementation chat**, if available: it already handles the distinction between Lens membership, the external parent anchor, and ordinary internal edges. Treat this as a separate scoped follow-up and read current source rather than assuming previous changes are still pending. If that chat is unavailable, open a new implementation chat in the same project with this plan.

Use **GPT-6.2 Sol, High reasoning, Standard speed**. The difficult parts are overlapping definitions, context identity, incremental reconstruction, and physical edge effects. High is appropriate; avoid Extra High/Max by default to limit usage. [Model guidance](https://learn.chatgpt.com/docs/models?surface=codex).

## Implementation prompt

> Implement the correction in `C:\Users\janbe\OneDrive\Dokumentation\Test Vault\.obsidian\plugins\Bases - Graph-View\docs\architecture\LensLinkTypeEdgeIsolationPlan.md`. Read the full plan and applicable repository instructions before editing.
>
> Lens LinkTypes must never authorize ordinary node-to-node edges or link springs, even when both endpoints are roots or the Lens is explicitly listed as Visible/Overlay. Keep their badges, target-only viewport contents, property truth, source/frame connectors, and container layout. Preserve ordinary edges from separately enabled Force/Direction definitions, including definitions sharing the same property. Implement definition/context-aware edge admission across full rebuild, incremental refresh, embedded/visible/overlay/replay paths; prevent Lens configuration from overwriting ordinary edge physics. Reconcile stale runtime edges without deleting valid overlapping edges or user notes/configuration. Do not use a draw-only fix or a global property blacklist.
>
> Preserve the implemented clipboard, membership-toggle, icon, and target-only Lens features. I will do Obsidian testing. Prepare focused regression cases and exact test commands; do not execute suites, control/reload Obsidian, or manipulate real notes/clipboard for testing. Run build/static type/lint checks and distinguish existing diagnostics. Supply the rebuilt main.js path/hash and installed-bundle handoff instructions. Finish with the cause, implemented boundary, static results, limitations, and my manual checklist. Mark testing pending user verification. Do not deploy outside the authorized workspace.
