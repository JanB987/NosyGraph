# LinkType badge icon implementation plan

Release status (2026-11-21): implemented. The maintainer confirmed the features and manual Obsidian testing before the 0.3.0 release. Earlier planning and verification notes below are historical; see the [0.3.0 verification guide](../releases/0.3.0-release-guide.md) for the current release checks.

Status: planning only, 2026-11-20. No implementation or test execution. The user will conduct testing. Preserve the current clipboard, membership-toggle, and lens features.

## Scope and behavior

Every Lens LinkType badge has a default icon. A LinkType note can override its badge icon through the `linkTypeIcon` frontmatter property. The override applies to all supported LinkType modes, not only lenses.

Confirmed icon formats: **Obsidian/Lucide registered icon names and emoji/text symbols**. Image references, SVG markup, icon pickers, and image-loading infrastructure are outside this scope.

Example:

```yaml
key: Project scope
linkType: lens
property:
  - parts
  - deliverables
writeProperty: parts
linkTypeIcon: telescope
```

Other examples, each an alternative value for the same property:

```yaml
linkTypeIcon: "🔭"
linkTypeIcon: "★"
linkTypeIcon: "text:ABC"
```

Proposed deterministic interpretation: a registered icon name selects its SVG; an explicit `text:` prefix selects literal text; a bare visible symbol or emoji selects literal text. Allow a single grapheme (including a letter) and sequences of emoji/symbol graphemes as bare symbols. Unrecognized multi-letter names such as `telescoppe` fall back rather than becoming accidental badge text. Use `text:` to disambiguate a literal that is also a registered icon name, such as `text:x`, or to render a short word/abbreviation. This prefix is an implementation-plan convention, not an additional user-confirmed requirement.

Precedence: a nonblank supported override replaces the type default. Missing, blank, invalid-type, empty `text:` values, or unknown icon names fall back to the default for that LinkType. Removing the property restores the default. An invalid override never invalidates the relationship definition or prevents a lens from opening. Quote emoji/symbol/text values in documentation examples, especially YAML-sensitive characters such as `#`, `*`, and `:`.

Keep the existing defaults: lens `scan-search`, force `zap`, direction `arrow-right`, parent `git-branch`. Do not write the fallback value into notes automatically. An icon is appearance only: it must not change the type semantic, badge identity, activation conflicts, discovery direction, or mutation behavior.

## Current source findings

- `O3NodeBadge.ts` already maps the lens semantic to `scan-search`; the live engine passes Obsidian's `setIcon` when constructing that badge. This feature extends that baseline rather than introducing a new lens semantic.
- `GraphEngine.setBadgeButtonVisualState` has a second independent type-to-icon mapping. Both paths need the same resolver so the override cannot be lost during an update.
- `O3LinkType` and `LinkTypePropertyKeys` do not currently read `linkTypeIcon`. A property added to a note therefore has no effect today.
- `setIcon` has no success return value and does nothing for an unknown ID, according to the installed Obsidian declarations. Unknown IDs need explicit fallback handling.
- Live badge presentation already uses an icon span and a separate label span. The installed stylesheet sizes badge SVG icons to 12px; lens badges have a separate dashed-border class. Text/emoji needs deliberate sizing and alignment in that same span. There is no stylesheet in this development folder, so do not silently edit the installed copy or introduce an unrelated stylesheet; prefer the existing DOM styling utilities for the few necessary text-icon styles.
- Definition identity is canonical note identity, while legacy property identity remains in some compatibility paths. Custom icons must be resolved per definition; two definitions reading the same property can have different icons.
- `buildActiveLinkTypeSignature` omits icon metadata. Its change flag also invalidates directional layout, so blindly using that signature for icon-only refresh would mix appearance and layout concerns.
- Detached `GraphBadge` and `LinkTypeBadgeDefinition` carry `iconKind` but no custom icon value. `LegacyGraphExpansionBadgeAdapter` also reconstructs badge metadata. The guarded replacement renderer currently draws textual badges; it is not the production runtime and should not be migrated as part of this task.

## Implementation architecture

### Frontmatter and configuration

Add `linkTypeIcon: string` to `LinkTypePropertyKeys`, defaulting to the exact user-facing name `linkTypeIcon`. Use the existing normalization and case-insensitive configured-key/default-key reader. Add an optional normalized icon value to `O3LinkType`.

Accept a scalar string and trim surrounding whitespace without lowercasing or splitting the text/symbol payload. Treat null, numbers, booleans, arrays, and objects as absent rather than stringifying them; a numeric symbol can be supplied as a quoted string through `text:`. Preserve a clean distinction between requested override and effective fallback; do not mix icon errors into `validationErrors` that disable the LinkType. Resolve icon availability at the Obsidian boundary rather than importing host APIs into domain/application code.

Expose the property-key mapping in the existing LinkType property settings section, consistent with badge color and write-property mappings. Existing installations gain the default key through `normalizeLinkTypePropertyKeys`; no migration of LinkType notes is required.

The requested configuration surface is the LinkType note. A create/edit modal icon picker or new icon-edit field is unnecessary in this iteration. Verify that editing another LinkType field preserves a manually supplied `linkTypeIcon` value, including configured-key aliases and an unknown value that currently falls back.

### Shared icon resolution and rendering

Create one small shared module, proposed `src/LinkTypeBadgeIcon.ts`, for the existing default mapping and override selection. Return a detached discriminated presentation value such as `{ kind: "icon", name }` or `{ kind: "text", text }`, rather than passing emoji into `setIcon`. Keep the data-policy function host-neutral; inject icon availability/rendering or put the tiny Obsidian adapter beside it. Do not introduce a service hierarchy for this feature.

The host adapter must validate an icon-name candidate through Obsidian's registered icons (`getIcon` or equivalent registered-icon lookup) before rendering it. Explicit `text:` and supported literal-symbol values use the text branch instead. Unknown names select the type default. If that runtime lacks the preferred default, use a known available generic fallback rather than leaving an empty badge. Resolve once per badge update, not by enumerating the entire icon registry separately for every rendered node. Avoid repeated Notices for every invalid icon/node/frame.

Use Obsidian's icon APIs for SVG creation and `textContent`/Obsidian text helpers for the text branch. Replace the icon span contents on change so old SVG or text cannot accumulate; cover transitions in both directions. Never treat frontmatter as SVG/HTML markup or create an image from it. If an API-created SVG is reused or cached, clone it before attaching it to more than one badge.

Preserve emoji sequences intact, including variation selectors, skin tones, flags, combining marks, and ZWJ sequences. Do not use UTF-16 string length or `slice(0, 1)` to detect/truncate a symbol. Use a host-compatible grapheme-aware helper where needed, with a deliberate fallback rather than a new runtime dependency. Keep text single-line, centered, and within the established icon slot so a longer explicit text value does not overlap the badge label or alter hit regions. Clamp/clip its visual width without corrupting graphemes; recommend short symbols/abbreviations in the documentation. Keep the icon span decorative for accessibility because the existing badge label/ARIA label already describes its action.

Use the same resolver in `O3NodeBadge.render` and the live engine's badge-update path. Remove the duplicate default-name switch. Keep semantic styling and `iconKind` independent of the custom glyph: a telescope override still has lens classes and lens behavior. Keep the existing label, tooltip, ARIA label, plus/minus indicator, hit area, focus, compact display, and modifier handling.

Update the actual LinkType object resolved for a badge. Where a rendering helper still looks up only by property, pass the resolved definition or use the badge definition ID so same-property Lens definitions retain independent icons. Do not broaden activation or runtime identity rules just to select an icon.

### Metadata flow and refresh

Carry optional requested icon metadata through the definition/badge contracts used by the live snapshot boundary (`GraphBadge`, `LinkTypeBadgeDefinition`, legacy snapshot and expansion-badge adapters where they construct records). Keep `iconKind` as the semantic default kind. Do not silently lose custom icon metadata when a badge is reconstructed after expansion or hydration.

Keep the production path primary: `GraphView` constructs `src/GraphEngine.ts`. Do not add a full icon-rendering system to the experimental canvas/store renderer merely because its records now preserve icon metadata. If the shared detached normalizers are touched, ensure their explicit field reconstruction preserves the new optional metadata; avoid an unrelated registry/runtime redesign.

Changing only `linkTypeIcon` should update badges through the existing LinkType metadata/registry refresh path, including ordinary graph views, nested lenses, and rendered embeds. Confirm appearance is not discarded by a no-op comparison. Add a presentation-specific comparison/invalidation if needed; do not reset directional placements or force graph physics updates solely to redraw an icon. Preserve lens geometry, viewport, node positions, open states, and pending input state through the existing supported lifecycle.

The canonical LinkType note remains authoritative. Do not put an icon override into graph-note settings, relationship values, membership properties, or plugin-global appearance defaults. Runtime/snapshot metadata may carry it, but rehydration must take the current definition value rather than allow a saved stale override to win. No graph-state schema version change should be necessary for an optional presentation field.

## Implementation sequence

1. Add the property mapping and strict optional-string parsing, preserving existing note validity and defaults.
2. Centralize default names and add icon-name/text discrimination, Unicode-safe symbol handling, and validated override/fallback rendering with injected host access.
3. Wire both production badge rendering/update paths and retain correct definition identity for overlapping LinkTypes.
4. Pass the optional metadata through the touched detached badge/definition projections without changing renderer ownership.
5. Wire icon-only invalidation and confirm the existing reload path will refresh views, lenses, and embeds without newly resetting layout.
6. Add README examples/default documentation and the settings property-key entry. Prepare focused regression fixtures and the user test checklist below.

## Testing and static verification

The user will run tests. The implementation chat may prepare focused tests but **must not execute test suites, control/reload Obsidian, or edit real note properties for testing**. It may run production build, architecture/full-project TypeScript checks, syntax and applicable lint checks. Clearly report tests as prepared and unexecuted.

Prepare cases for:

- Default `scan-search` on lenses and unchanged defaults on force/direction/parent badges.
- Custom registered icon, emoji, Unicode symbols, explicit `text:` values, blank/removal, unknown name, null/nonstring input, and host fallback behavior.
- Registered names versus literal-symbol ambiguity (`x` versus `text:x`), empty `text:`, quoted YAML-sensitive symbols, ZWJ emoji, skin tones, flags, combining marks, and safe literal rendering of markup-like text.
- Case-insensitive/configurable property key handling and preservation during unrelated LinkType edits.
- Two same-property lens definitions using different icon-name/text values, including nested lens instances.
- Expanded/collapsed/populated/empty and compact badges keeping their labels, styling, interactions, and default/override.
- An icon-only metadata update replacing SVG with text and text with SVG once, without changing identity, relationships, node layout, or lens state; long explicit text stays in its slot.
- Snapshot/adapter reconstruction retaining requested icon metadata and reloading the latest definition value.

Use mocked icon availability/renderers and existing lightweight badge DOM fixtures. Relevant files include `O3LinkType.test.ts`, `O3NodeBadge.test.ts`, the definition/property-key tests, and the touched legacy adapter tests. Keep tests tied to visible fallback and propagation behavior rather than mirroring switch statements.

Provide the user these manual checks with expected outcomes:

1. Open a default lens badge: the lens glyph is present with no `linkTypeIcon` property.
2. Set `linkTypeIcon: telescope` on that definition: all its visible badges show the override; clicking and Alt-clicking still work.
3. Change it to `"🔭"`, then `"★"`, then `"text:ABC"`, then another registered ID: the correct presentation replaces the old one without duplicate icons or leftover text. Remove/blank it to return to `scan-search`.
4. Use an invalid ID: the default remains visible and the LinkType still opens/accepts links.
5. Compare two lens definitions using the same properties but different icons, including one inside another lens.
6. Check low zoom, selected/unselected eligible nodes, empty/populated badges, rendered embeds, light/dark themes, emoji alignment, and text bounds.
7. Edit another LinkType field using its existing modal, reopen the plugin, and verify the custom property and lens runtime state survive.

Build/static commands: `npm run build`, `node --check main.js`, `npm run typecheck`, `npx tsc --noEmit -p tsconfig.json`, and applicable lint checks. Distinguish pre-existing full-project diagnostics from regressions. Supply exact focused/full test commands for the user without executing them.

## Deployment handoff

The development folder and installed `.obsidian/plugins/nosygraph/` share a plugin ID. Give the user the rebuilt development `main.js` path and SHA-256 and explain that the installed bundle must match before the user reloads/tests. Do not overwrite installed `data.json`, add/delete stylesheets, deploy outside the authorized workspace, or control Obsidian in this task. Preserve existing SVG styling and use the existing DOM style utilities for necessary text/emoji sizing; report a concrete styling gap if one remains.

## Chat and model

Use a **new implementation chat in the same project**. This is a bounded badge-presentation feature with its own handoff, separate from the membership-writing work. Check the latest workspace instructions/current code and preserve any already implemented membership-toggle changes.

Recommended **GPT-6.2 Sol, Medium reasoning, Standard speed**. The parser/renderer/default work is smaller and more localized than the preceding two-phase membership change. Medium is a reasonable usage-conscious starting point; escalate only for a concrete unresolved issue. Sol has lower published per-token rates than Astra; this is not a guarantee about total task tokens.

Official references checked 2026-11-20: [Model guidance](https://learn.chatgpt.com/docs/models?surface=codex), [Pricing](https://learn.chatgpt.com/docs/pricing). Obsidian icon API behavior was reviewed in the installed package's `obsidian.d.ts`.

## Implementation prompt

> Implement `C:\Users\janbe\OneDrive\Dokumentation\Test Vault\.obsidian\plugins\Bases - Graph-View\docs\architecture\LinkTypeBadgeIconPlan.md`. Read the complete plan and applicable repository instructions first, then inspect current source.
>
> Preserve the existing lens default `scan-search` and add a note-level `linkTypeIcon` override for all LinkType badges, supporting registered Obsidian/Lucide icon names and emoji/text symbols. Follow the plan's deterministic name-versus-text interpretation, including explicit `text:` values; render text safely and preserve full emoji sequences. Missing, blank, invalid, or unknown icon names fall back to the type default without disabling the LinkType. Share resolution between the live badge-rendering paths, keep semantic styling and definition identity independent of the glyph, propagate metadata through the touched badge projections, and refresh icon-only edits correctly. Add the existing settings property-key mapping and README examples; do not add an icon picker, image support, or a runtime migration.
>
> Preserve the current lens, clipboard, Cut, and membership-toggle implementations. I will conduct testing: prepare focused regression fixtures and my manual checklist, but do not execute test suites, control/reload Obsidian, or manipulate real notes for testing. Run build/static type/lint checks and distinguish existing diagnostics. Supply the rebuilt main.js path/hash and exact user test commands; remind me to update the installed nosygraph bundle before reloading. Do not deploy outside the authorized workspace. Finish with changes, static-check results, limitations, and expected manual outcomes. Mark testing pending user verification.
