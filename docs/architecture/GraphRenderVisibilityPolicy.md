# GraphRenderVisibilityPolicy

## Purpose

`GraphRenderVisibilityPolicy` is the host-neutral presentation boundary used by the live `GraphEngine` for relationship-line and badge visibility decisions.

Current implementation: [`src/graph-application/GraphRenderVisibilityPolicy.ts`](../../src/graph-application/GraphRenderVisibilityPolicy.ts)

It deliberately does not discover notes, mutate expansion ownership, read Obsidian metadata, or access canvas and DOM objects.

## Relationship-line contract

An ordinary active LinkType relationship is renderable when:

- the LinkType is selected and permits discovery;
- it is neither parent-semantic nor duplicate-node based; and
- both endpoint notes already belong to the visible graph.

This decision remains valid when persistent graph-note mode disables global LinkType node discovery. The discovery guard controls whether another note enters the graph; it must not suppress the line between two nodes already present. Parent and duplicate-node relationships remain owned by their specialized render paths.

The policy also calculates a minimum one-screen-pixel relationship width after zoom and embedded scaling. Highlighted edges retain their stronger minimum width.

## Badge contract

Outside marquee and drag suppression, a node renders badges when it is selected, is the current drop target, show-all mode is held, or it has at least one renderable badge backed by YAML relationships. This keeps populated badges visible as relationship indicators while selection still exposes empty badges for creating a first link.

## Runtime status

The policy is live through `GraphView -> GraphEngine`. It is a presentation extraction only and does not change runtime ownership: the legacy engine still owns live nodes, edges, badges, persistence, and drawing.
