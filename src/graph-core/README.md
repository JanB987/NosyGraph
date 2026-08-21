# Graph Core

This folder is the host-neutral boundary for graph behavior that should run in
both Obsidian and Working Memory.

Keep host APIs out of this layer. Obsidian-specific access belongs in
`host-adapters/obsidian`, and Working Memory index/file access belongs in
`host-adapters/working-memory` or existing application services.

Current shared surface:

- root and expansion state mutations
- root/node id resolution over a generic graph-node lookup index
- link-type direction semantics
- link-type normalization defaults
- badge and folder-group render metadata derived from graph state
- link mutation and drop intent contracts
- property relationship lookup through `GraphRelationshipIndex`
- normalized viewport and pinned-node coordinate helpers
