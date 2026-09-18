# ObsidianGraphLinkResolver

## Purpose

`ObsidianGraphLinkResolver` owns synchronous relationship discovery needed by the legacy renderer while keeping metadata-cache parsing and linkpath resolution outside `GraphEngine`.

Current implementation: `src/graph-application/ObsidianGraphLinkResolver.ts`

## Responsibilities

- Read frontmatter links and YAML values by normalized property.
- Resolve aliases configured for a LinkType.
- Resolve outgoing, incoming, or bidirectional targets.
- Preserve unresolved internal links as missing targets.
- Maintain and invalidate the incoming-link index.
- Return detached target records with labels and resolved files.

The resolver receives an injected file guard and label/configuration providers. It does not import runtime Obsidian classes, own graph nodes, mutate expansion state, or render badges.

## Connections

`GraphEngine` delegates edge discovery, badge relationship checks, and target lookup to this class during the legacy transition. `ObsidianNoteRepository` and `ObsidianRelationshipTargetReader` use a separate asynchronous repository boundary for badge planning. Both paths now keep Obsidian reads outside badge and renderer logic.

## Migration state

The resolver is a compatibility adapter for synchronous legacy graph rebuilding. Once store-mode rendering consumes detached snapshots, its edge-discovery responsibilities can move fully behind the repository and relationship-reader interfaces.