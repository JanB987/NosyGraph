# Lens LinkType Iteration 1 contract

## Status

This document records the behavior contract and the released `0.2.9` baseline
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
5. LinkType note path is the stable definition identity. Badge and lens instance
   identity include graph context, runtime source node ID, and definition ID.
6. Multiple Lens LinkTypes, including definitions with identical properties,
   may be active and open on the same node simultaneously.
7. An unselected node shows a compact Lens badge when it has a qualifying
   relationship. Selecting the node also reveals active empty Lens badges so
   Alt-click can create the first relationship.
8. Lens badges use a type icon and accessible label. Low-zoom presentation may
   be icon-only, but icon/color must not be the only accessible distinction.
9. `LinkDiscoveryDirection` applies to Lens LinkTypes. Incoming mutations use
   the existing reversed-write semantics.
10. Dropping onto the lens body is add-only. Dropping onto a normal LinkType
    badge keeps the existing add/remove behavior.
11. Existing graph-capable-note lenses and their dedicated indicator coexist
    with Lens LinkTypes during a compatibility period. They are not removed
    until migration and close/reopen evidence exist.
12. The graph-capable-parent Alt-click use case remains a two-write operation:
    normal LinkType mutation plus append to the graph-capable note property that
    introduced the parent node. That membership property is independent of the
    Lens LinkType write property.

## Released baseline characterized by tests

- `O3LinkType` recognizes Force Based and Direction Based layout modes and a
  parent semantic mode.
- Multiple read properties are already normalized and deduplicated. The first
  property is already the write target.
- Multi-property definitions currently derive their badge identity from the
  label/file name rather than from a stable definition ID.
- `linkType: lens` currently falls back to Force Based behavior; it is not a
  distinct runtime mode.
- Alt has precedence over Ctrl/Cmd badge-chain input.
- Badge-drop planning uses one resolved write property and rejects duplicate
  add or absent remove operations.
- Version 2 graph-note JSON stores badge states by property key.
- Embedded lens persistence currently stores one entry per origin node and
  graph path, so it cannot distinguish two Lens LinkTypes for the same pair.

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
- The LinkType create/edit modal supports only one property and has no Lens
  mode or explicit write-property control.
- Embedded graph persistence lacks Lens LinkType definition identity.
- Existing Graph Lens opening requires a graph-capable source note and loads
  the source note's graph definition rather than resolving a Lens LinkType's
  properties.

## Iteration 1 acceptance

- No production interaction or persistence behavior changes.
- The current property-keyed limitations are explicit and executable.
- The target contract is recorded in the use-case and architecture support
  documents.
- The normal validation suite remains green.
