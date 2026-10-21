# Lens LinkType Iteration 1 contract

## Status

Release checkpoint (2026-10-21): Iterations 2-10 now have live implementation
and automated coverage in the 0.2.11 release candidate. The Iteration 1 language
below is historical; see [release notes](../releases/0.2.11.md) for current scope.

This document records the behavior contract and the released `0.2.10` baseline
for the planned Lens LinkType feature. No Lens LinkType runtime behavior is live
in Iteration 1. The production composition remains `GraphView -> GraphEngine`.

## Terminology

- **Lens LinkType definition**: a LinkType note whose `linkType` value is
  `lens`.
- **Lens instance**: one opened lens owned by a runtime node instance and one
  Lens LinkType definition.
- **Graph Lens viewport**: the movable and resizable visual viewport used to
  inspect a lens instance.

These concepts must remain separate. A LinkType definition is reusable note
configuration; a lens instance is runtime state; a Graph Lens viewport is UI.

## Provisional target contract

The following decisions are the working contract for Iteration 2 and later.
They may be revised before live behavior is implemented.

1. `linkType: lens` is the canonical serialized value. Parsing will be
   case-insensitive.
2. `property` may be a scalar or ordered list. A lens reads the union of links
   from every configured property and retains property provenance internally.
3. An optional `writeProperty` selects the mutation target. When it is absent,
   the first configured property remains the backward-compatible write target.
4. Lens LinkTypes may overlap each other and non-lens LinkTypes by property.
   Two active non-lens expansion LinkTypes may not overlap on any read property.
5. Each Lens type has one reusable LinkType note. Serialized references use
   Obsidian's configured link format rather than a forced full path. Runtime
   code resolves that link to the canonical file identity. Rename and move
   events must update graph-note and plugin-setting references before open
   instances are reconciled.
6. Multiple Lens LinkTypes, including definitions with identical properties,
   may be active and open on the same node simultaneously.
7. An unselected node shows a compact Lens badge when it has a qualifying
   relationship. Selecting the node also reveals active empty Lens badges so
   Alt-click can create the first relationship.
8. Lens badges use a type icon and accessible label. Low-zoom presentation may
   be icon-only, but icon/color must not be the only accessible distinction.
9. `LinkDiscoveryDirection` applies to Lens LinkTypes. Incoming Lens
   discovery is deferred from the first implementation.
10. Dropping onto the lens body uses the same add/remove toggle semantics as a
    normal LinkType badge. If a target is resolved through a non-write read
    property, every matching link in the Lens read-property set is removed.
11. A normal Lens badge click toggles a dedicated embedded Graph Lens
    viewport. Existing graph-capable-note lenses and their dedicated indicator
    coexist with Lens LinkTypes. Multiple Lens LinkType instances may be open
    for the same source node; combining them into one de-duplicated viewport is
    deferred.
12. Far-view items have a separate zoom threshold from labels. A graph note
    may override the threshold for its own badges and pins; the plugin setting
    supplies the default.
13. Existing graph-capable-note lenses and their dedicated indicator coexist
    with Lens LinkTypes during a compatibility period. They are not removed
    until migration and close/reopen evidence exist.
14. The graph-capable-parent Alt-click use case remains a two-write operation:
    normal LinkType mutation plus append to the graph-capable note property that
    introduced the parent node. That membership property is independent of the
    Lens LinkType write property.

## Released baseline characterized by tests

- `O3LinkType` recognizes Force Based and Direction Based layout modes and a
  parent semantic mode.
- Multiple read properties are already normalized and deduplicated. The first
  property is already the write target.
- Multi-property definitions currently derive their badge identity from the
  label/file name rather than from a resolved Lens LinkType note reference.
- `linkType: lens` is preserved as a distinct parsed mode and Lens badge
  runtime has its own viewport and mutation path. Graph-note persistence carries
  the canonical Lens definition identity and viewport state.
- Alt has precedence over Ctrl/Cmd badge-chain input.
- Badge-drop planning uses one resolved write property and rejects duplicate
  add or absent remove operations.
- Version 2 graph-note JSON stores badge states by property key.
- Embedded Lens persistence now carries the canonical LinkType note identity;
  runtime restoration and rename reconciliation are completed in Iteration 7.

Executable coverage is in:

- `src/O3LinkType.test.ts`
- `src/O3NodeBadge.test.ts`
- `src/graph-core/graph-interactions.test.ts`
- `src/O3GraphState.test.ts`
- `src/graph-application/GraphBadgeExpansionCoordinator.test.ts`
- `src/graph-application/ObsidianGraphLinkResolver.test.ts`

## Known gaps before Iteration 2

- Badge IDs, expansion keys, runtime configuration maps, and persisted badge
  state are still property-oriented.
- Badge definition normalization removes definitions that share an identity
  property.
- Graph-note activation replaces an active definition with another definition
  using the same primary property.
- The LinkType create/edit modal now supports Lens mode, multiple properties,
  and an explicit write property. Badge semantics are live; the dedicated Lens
  viewport is introduced in Iteration 5.
- Embedded graph persistence includes Lens LinkType identity and rename/move
  reconciliation; unavailable definitions are retained for recovery.
- Existing graph-capable-note Lens opening still loads the source note's graph
  definition; Lens LinkType opening resolves the LinkType properties through
  the separate runtime path introduced in Iteration 5.

## Iteration 3 implementation status

Parser, registry, activation, authoring, and badge identity support now
recognize Lens definitions:

- `O3LinkType` preserves `linkType: lens`, unknown mode values, ordered read
  properties, and validated `writeProperty` values.
- `LinkTypeRegistry` indexes definitions by canonical runtime identity and by
  every read property. Multiple Lens definitions with the same properties stay
  distinct.
- Graph-note activation keeps overlapping Lens definitions and reports a clear
  conflict instead of silently replacing an overlapping non-Lens definition.
- LinkType references written to graph-note YAML use Obsidian's configured link
  generator and support both wiki-link and Markdown-link forms when resolving.
- The create/edit modal supports Lens mode, multi-property selection, and
  write-property selection while hiding unrelated physics controls.

The dedicated Lens viewport is implemented in Iteration 5, Lens-body mutation
in Iteration 6, and definition-keyed persistence in Iteration 7.

## Iteration 4 implementation status

Badge IDs now use the canonical LinkType note identity (`O3LinkType.definitionId`)
while retaining the normalized property as `legacyLinkTypeId` for 0.2.9 state
and command lookup. Same-property Lens definitions therefore produce separate
badge IDs and remain independently addressable at the command boundary; the
pre-viewport engine still uses its property expansion key until Iteration 5.

Badge snapshots carry Lens semantic and type-icon metadata. The live badge DOM
uses Obsidian `setIcon()` for Force Based, Direction Based, parent, and Lens
badges, with readable labels, titles, and ARIA labels preserved. Expanded,
empty, populated, Lens, and compact far-view states are expressed through CSS
classes and data attributes.

The current compact presentation uses a staged zoom boundary; the graph-note
override and plugin default setting still need to be wired after the exact
threshold is agreed.

Visibility is evaluated per definition. Ordinary badges remain selected-only;
eligible Lens badges may appear on unselected nodes when they have a resolved
outgoing target through any configured read property, while selected nodes also
expose empty active Lens badges. The detached renderer applies the same policy
and preserves independent same-property Lens hit regions.

Focused coverage includes Lens visibility exceptions, detached-renderer
filtering, same-property definition identity, and compatibility resolution of
legacy property-keyed badge commands.

## Iteration 5 implementation status

Lens badge toggles now route through the canonical LinkType definition identity
and use the existing embedded graph lifecycle to open a dedicated runtime
viewport. Each Lens definition gets its own definition-keyed pseudo path, so
same-property Lens definitions can be open independently and can coexist with
the existing graph-capable-note lens. The viewport contains the source node
and the de-duplicated outgoing targets resolved across all configured read
properties; incoming Lens definitions remain deliberately unsupported.

The existing embedded viewport layout, selection, dragging, and rendering
machinery are reused. Lens Alt-click input and body-drop mutations now use the
resolved write property; a Lens removal clears matching links from every read
property. An open Lens viewport is refreshed after a successful mutation.
Graph-note persistence now stores the Lens definition identity and viewport
state. Rename reconciliation is included in Iteration 7. Runtime Lens paths
remain internal pseudo paths; only the canonical LinkType identity is written
to graph-note state.

## Iteration 7 implementation status

Lens viewports now persist through the existing embedded-graph state boundary.
Each entry stores its internal runtime path together with `linkTypeId`, the
canonical LinkType note path. Graph restoration asks the engine to rebuild the
Lens definition from that identity and restores the stored viewport state
without replaying a badge command. Multiple same-property Lens instances stay
independent because their runtime paths and definition identities are stored
separately.

Vault rename reconciliation updates persisted Lens definition identities,
including nested entries, while ordinary embedded graph paths continue to be
handled by the existing note-path migration. Runtime Lens panning, resizing,
opening, and closing now use the same persistence callback with the definition
identity attached.

## Iteration 8 implementation status

Lens lifecycle changes now reconcile with open runtime viewports. A metadata
change in a Lens source note refreshes only the affected Lens instance, while
preserving its viewport geometry and nested expansions. A LinkType definition
change schedules deferred graph hydration, reloads the registry, and refreshes
all open Lens instances from the canonical definition identity.

If a Lens definition is renamed, moved, or temporarily unavailable, the
runtime viewport is closed when it cannot be rebuilt. The persisted graph-note
entry is retained rather than deleted, so a later definition repair can restore
the Lens without data loss. Nested runtime Lens entries carry their own
definition identities through the same lifecycle boundary.

## Iteration 6 implementation status

Lens mutations now retain the definition boundary through the drop and input
paths. Canonical definition IDs resolve to their active `O3LinkType`, so a
drop onto a Lens badge or Lens body writes to the configured `writeProperty`
instead of treating the definition path as a YAML property. Toggle removal
checks the complete Lens read-property set and removes every matching link,
which prevents a target from remaining visible through another Lens property.

The runtime recognizes the body of a runtime Lens viewport as a Lens drop
target, while its title and control buttons remain viewport controls. Open
Lens instances are rebuilt after a confirmed mutation so newly added or
removed targets are reflected without requiring a graph reload. The mutation
handler remains host-specific; the graph engine passes only the resolved
definition metadata across its command boundary.

## Iteration 2 implementation status

The host-neutral contract is now implemented in the LinkType and graph-domain
boundaries:

- `LensLinkTypeDefinition` validates one serialized Obsidian note reference,
  ordered read properties, default or explicit `writeProperty`, and Lens
  activation semantics without importing Obsidian.
- `LinkTypeActivationPolicy` returns explicit conflicts for overlapping
  non-Lens definitions while allowing Lens definitions to overlap and coexist.
- `LinkTypeBadgeDefinition` separates badge identity and type presentation from
  property names and runtime badge state.
- `GraphRelationship` carries host-neutral source, target, direction, and
  property provenance.

The live parser, registry activation, rendering, mutations, and persistence
still use compatibility paths where the migration is incomplete. Iterations 3--8
now cover the implemented Lens runtime, mutation, persistence, and lifecycle
boundaries.

Focused coverage is in:

- `src/link-types/LensLinkTypeDefinition.test.ts`
- `src/link-types/LinkTypeActivationPolicy.test.ts`

## Confirmed decisions — 2026-09-20

- A normal Lens badge click opens or closes that Lens LinkType's dedicated
  embedded Graph Lens viewport.
- A Lens LinkType lens may coexist with the existing graph-capable-note lens on
  the same node. Multiple Lens LinkType lenses may be open for one node. A
  future combined viewport without duplicate nodes is out of scope for this
  iteration.
- Incoming Lens LinkTypes are out of scope for the first implementation.
- Lens-body drops use add/remove behavior, matching ordinary badge drops.
- Far-view badges and pins use a separate configurable zoom threshold. The
  graph-note value overrides the plugin default.
- Each Lens type is represented by one reusable LinkType note. References are
  stored using Obsidian's configured link format, and rename/move handling
  updates graph-note and plugin-setting references automatically.
- First-scope eligibility is at least one valid outgoing target through any
  configured read property for an unselected node; selected nodes also show an
  empty active Lens badge.
- Missing `writeProperty` falls back to the first read property. Empty,
  ambiguous, or out-of-set write properties deactivate the definition with
  visible validation feedback. Read properties are normalized and deduplicated.
- Multi-property removal removes every matching link in the Lens read-property
  set so the target disappears from the resolved Lens union.

## Iteration 9 implementation status

Far-view presentation now has an explicit zoom threshold. The plugin setting
`defaultBadgeFarViewThreshold` supplies the default value (`0.55`), while a
graph note may override it with the configured
`graphBadgeFarViewThreshold` property. The same threshold drives compact Lens
badges and pin indicators; label fading remains controlled independently by
`graphTextFadeThreshold`.

The threshold is normalized to the usable camera range, reapplied when the
plugin setting changes, and read again during graph-note hydration. Boundary
behavior is therefore deterministic for both compact and expanded views.

## Remaining contract checks for later iterations

The live badge policy now hides ordinary badges on unselected nodes while
eligible Lens badges remain discoverable. The persisted Lens identity is now
separate from the internal runtime path. Resolve these remaining contract
points before later migrations:

- how unknown `linkType` values are represented and surfaced;
Additional regressions are required for Lens/ordinary property overlap,
definition rename/delete, read/write-property changes, nested same-property
replay, immediate drop-refresh-undo behavior, graph-capable parent two-write
behavior, and large-vault far-view badge performance.

## Iteration 10 implementation status

Multi-property Lens targets remain one visible node per resolved note path,
while retaining normalized read-property provenance. Provenance is carried from
the Obsidian resolver into Lens runtime snapshots and through graph-state save
and restore, so duplicate target resolution no longer loses its source
properties. Existing ordinary expansion snapshots remain compatible because
the field is optional.

## Iteration 1 acceptance

- No production interaction or persistence behavior changes.
- Remaining property-keyed limitations are explicit and executable while the
  compatibility migration is in progress.
- The target contract is recorded in the use-case and architecture support
  documents.
- The normal validation suite remains green.
