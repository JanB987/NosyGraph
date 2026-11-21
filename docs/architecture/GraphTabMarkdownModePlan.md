# Graph Tab: editable Markdown mode, selected-note menu, and source-tab linking

Release status (2026-11-21): implemented. The maintainer confirmed the features and manual Obsidian testing before the 0.3.0 release. Earlier planning and verification notes below are historical; see the [0.3.0 verification guide](../releases/0.3.0-release-guide.md) for the current release checks.

Status: implemented, 2026-11-21. Native Obsidian verification remains pending.

## Implementation notes

- The live Graph View and rendered embeds publish selection snapshots from the GraphStore subscription. Snapshots associate canonical paths with runtime instance IDs and keep each tab and embed’s context independent.
- The workspace controller serializes file and mode changes, saves through MarkdownView before replacing its file, and keeps the graph root separate from the native editor file. The Markdown variant keeps Obsidian’s content element and adds the selected-note list beside it.
- A Graph Tab that had an Obsidian group keeps it as an Automatic source filter. The controller removes that follower from native file synchronization so menu choices never navigate other group members. Plugin source linking uses the verified workspace leaf ID. Obsidian builds without a verifiable leaf ID still support Automatic mode.
- Workspace state stores the session, binding, selected paths and instance IDs. A bounded in-memory editor cache keeps native view and cursor state during the session. Graph layout restoration uses existing graph persistence and detached in-memory viewport, pin and lens state across mode switches.

## Confirmed behavior

- Keep the existing Open Graph Tab command and current graph-following behavior as the starting point.
- Add a toggle in the Graph Tab's upper-right header: Graph / Markdown. It remains available in both modes, in the same tab.
- Markdown mode supports editing and reading like a normal Obsidian note, including its normal properties, editor, saving, and reading/source/live-preview behavior. This is not just a rendered preview.
- Without a selected graph node, show the note whose graph is currently displayed. Keep the graph's source note distinct from the Markdown file being displayed.
- With selected nodes, show a selected note. With multiple selected notes, show all of them in a selection menu on the right side of this Graph Tab. Switching menu entries opens their Markdown in this same tab.
- In automatic mode, selections come from whichever NosyGraph pane the user last interacted with, including another pane. Include node instances in classic/nested lenses, Lens LinkType viewports, and property/discovered expansions.
- Add an explicit source-tab link. When linked, graph context and selected-note candidates come only from that exact source tab. Focusing/selecting in other tabs must not change the linked Graph Tab in either mode.
- Manual Obsidian testing belongs to the user. The implementation chat should run automated/static checks, build, and deploy to the installed plugin so the user only needs to reload the vault.

## Proposed interaction details

These are recommended defaults where the user has not specified a detail. They do not require another approval step.

1. New Graph Tabs start in Graph mode with automatic source following. Mode and source binding belong to each Graph Tab, not to one global plugin setting.
2. Use one header mode button with a clear destination tooltip and pressed state. Use a separate chain/source button to choose Automatic or Link to tab. Display the linked source name and make Unlink easy to reach. Reuse existing header actions rather than adding a duplicate Open as Markdown action in a Graph Tab.
3. In Markdown mode, render a compact right-side panel headed Selected notes when two or more distinct note paths are selected. Each entry shows a note name and enough folder/path information to distinguish duplicate basenames. Mark the currently displayed note. Keep the editor and the list independently scrollable; a narrow tab may use a compact right-aligned selector containing the same entries. Do not use Obsidian's global right sidebar.
4. Repeated instances of one note produce one menu entry. Preserve all instance IDs separately for graph selection restoration; canonical note paths are the menu identity. Keep stable selection order and retain the displayed note while it remains selected. On a new selection, prefer the most recently explicitly selected note if known; otherwise use the first valid entry. A single selection displays that note directly.
5. Changing the menu entry does not change graph selection, clipboard, graph root, or source binding. Returning to Graph restores the tab's graph context, not the selected Markdown note's graph. Source navigation may legitimately change the graph context; a menu click may not.
6. Background source updates must not focus or reveal the Graph Tab or source tab. Save edits through Obsidian before changing the displayed file. A failed save leaves the current editor intact and reports the failure.
7. Missing notes stay identifiable as unavailable rather than creating a new note on selection. Non-Markdown entries get an unavailable reason. Keep an explicit empty state if selected entries exist but none can be displayed; do not silently substitute the root note while claiming to display a selection. A genuinely empty selection uses the current graph source note.
8. A linked source's note navigation updates the follower even if another pane has focus. A source note without graph capability can still be edited in Markdown mode; Graph mode shows an explanatory unavailable state rather than another tab's graph or an automatically promoted graph note.
9. Closing a linked source leaves an explicit Source tab unavailable status and the last content available for reference. Stop automatic updates until the user relinks or unlinks. Never silently revert to Automatic or bind to another tab showing the same file. Keep this rule across workspace restoration failures.

## Current source and gaps

- `src/main.ts`: `openGraphTab()` already creates `BASES_GRAPH_VIEW` with `{file, graphTab: true}`. `followActiveLeafInGraphTabs()` follows external Markdown/graph-capable notes, observes existing group restrictions, and excludes Graph Tabs as sources. It discovers only `BASES_GRAPH_VIEW` leaves, so a second mode needs explicit discovery. Its global in-progress flag can also discard newer asynchronous follow requests; the new controller must serialize transitions and apply the latest request.
- `src/GraphView.ts`: `graphTabMode`, `getState()`, `setState()`, and `getDisplayText()` carry Graph Tab identity. `onOpen()` adds an Open as Markdown action, but `switchToMarkdownView()` replaces the leaf with plain `markdown` and drops the Graph Tab context. It targets the bound graph note, not selected nodes. Reusing that action unchanged does not implement the requested feature.
- `src/GraphView.ts`: `getSelectedGraphNodeRefs()` exposes runtime instances. `src/GraphEngine.ts`: `getSelectedNodePaths()` already produces deduplicated canonical note paths; `getSelectedNodeRefs()` preserves repeated instances. Selection lives in `graph-application/GraphStore.ts` and is mutated through `GraphController`; there is no general selection subscription for another pane.
- `GraphEngine` has selection paths for single click, Shift toggle, context-menu selection, Select All, marquee, hydration/pruning, and Cut reconciliation. A mouse-click-only callback would miss valid changes.
- `src/main.ts`: `rememberGraphTabSourceLeaf()` and `openGraphTabNodeInMarkdown()` support the existing node-open routing into another Markdown pane. Preserve that behavior unless the new mode action explicitly changes modes. Audit `isGraphTabLeaf`, source resolution, the generic Markdown graph-switch action, and open/toggle commands for the new registered Markdown variant.
- `src/ObsidianGraphNodeCutHost.ts` already resolves focused Cut surfaces, including rendered embeds. Its focus memory is operation-specific, not a durable source-selection service. Do not use retained Cut focus to dispatch Cut while the new editor has focus.
- The live graph runtime is still `GraphView -> GraphEngine`; the architecture documents explicitly keep StoreGraphRuntime experimental. This feature must not switch production runtime or refactor the graph architecture broadly.
- The installed `obsidian.d.ts` exposes `MarkdownView(leaf)`, normal editor/view state, `TextFileView.save()`, `WorkspaceLeaf.setViewState`, `getLeafById`, workspace layout access and save requests. It does not expose a typed public `WorkspaceLeaf.id` field. Source-tab identity therefore needs a small explicit compatibility adapter, not an assumed typed field or a note-path match.

## Architecture

### Separate graph context, note selection, and displayed file

Create a small host-neutral reducer/model for Graph Tab sessions. Suggested fields, not a mandated exact shape:

```ts
type GraphTabSource =
  | { kind: "automatic" }
  | { kind: "linked"; sourceTabId: string; labelHint?: string };

interface GraphTabSession {
  version: 1;
  sessionId: string;
  mode: "graph" | "markdown";
  source: GraphTabSource;
  graphSourcePath: string | null;
  selectedNotes: Array<{ path: string; instanceIds: string[] }>;
  activeMarkdownPath: string | null;
  // Detached return state only; no engine, view, leaf, or TFile objects.
  graphReturnState: Record<string, unknown> | null;
}
```

Keep source availability and transition generations in runtime state. Session IDs are plugin-owned stable identities. Keep graph selection instance/context information separate from note-path deduplication. Ordinary selection restoration must not select every instance merely because it shares a selected note's path.

Mode changes and menu navigation do not alter vault frontmatter or graph membership. Save the per-tab session through the registered views' state and workspace layout, with validation/version defaults for existing `{graphTab: true}` workspaces. Do not rely on native Markdown getState preserving arbitrary unknown fields. Persist small detached UI state, not a second full graph model or note body. Cursor/scroll state can be held in a bounded per-note session cache using native view/ephemeral state, without promising to serialize entire undo histories.

### Shared source and selection service

Add a plugin-owned source registry, e.g. `GraphTabSourceRegistry`, with host-neutral snapshots and an Obsidian adapter. Cache current context/selection **per source tab and per graph surface**, plus a last-user-interacted source pointer for Automatic mode. A single global last-selection array cannot implement a linked tab.

- Register graph surfaces from normal graph views, Graph Tabs in Graph mode, and rendered graph embeds with their owning workspace leaf. A rendered embed is a surface within its note tab, not a separate tab.
- A genuine graph interaction activates its source, including clicking an already selected node or focusing a different graph with an unchanged selection. Menu/header interactions and Markdown editor focus must not become graph selections. Passive metadata updates or hydration must not steal Automatic ownership.
- Publish normalized selection/context changes from the common selection boundary and refresh/pruning paths. Prefer a small selection subscription/callback on the live store/controller boundary plus an engine projection that resolves canonical paths after the node map is current. Unsubscribe on teardown and coalesce marquee bursts. No animation-frame polling, DOM scraping of node labels, or broad snapshot copying per render.
- Update inactive source caches too, without marking them last-used. A linked follower needs source truth even while another graph is active.
- For native Markdown tabs, the current file is their note context. If that tab contains an interacted-with NosyGraph embed, use that embed's selection; navigation to a different file invalidates the previous file's embed selection. Distinguish a genuinely empty selection from a surface that is not hydrated yet.
- In Automatic mode, preserve the existing external active-note graph-following behavior, including its existing group rules, and additionally use the most recently interacted NosyGraph selection for Markdown candidates. Apply context changes atomically: a selection snapshot carries its source note/tab, so stale selections from a previous note do not get combined with a new graph context.
- In Linked mode, select both context and candidates from the linked tab only. Ignore the Automatic pointer completely. A source's empty selection must produce the source-note fallback, not revive the last selection from a different tab.
- Root following and selected-note following must have one arbiter/controller. Remove the competing direct mutation path from the old follow handler or delegate it to this controller; do not let both race to call setViewState.

### Exact source-tab binding

Use an explicit one-way plugin source binding. Do not implement this by joining Obsidian's native linked-tab groups: native file synchronization could make a Markdown menu choice navigate the source tab or replace the graph root. Keep existing native group behavior compatible in Automatic mode; plugin linking takes precedence for this Graph Tab without changing other tabs' group membership.

The source picker enumerates actual open eligible file-backed tabs, with title/path/view type and a location/instance hint for two tabs showing the same note. Binding is to a tab, not a file, and survives navigation within that tab. Exclude the follower itself. If Graph Tabs are eligible sources, reject self-links and transitive cycles, including invalid cycles restored from saved state. Resolve a Graph Tab source from its session context rather than treating its selected Markdown file as its graph root.

Implement a narrow `ObsidianGraphTabIdentity` adapter. In the current runtime, guarded access to a leaf's string ID can be verified by `workspace.getLeafById(id) === leaf`; isolate and document this untyped compatibility read. Store only the ID and a display hint. Re-resolve live leaves when needed instead of retaining view objects. Restore the source after layout readiness and account for deferred views. Never write workspace.json manually. If exact identity is unavailable or a restored ID cannot be resolved, retain an unavailable binding and offer relinking; do not approximate by file path. Add adapter tests for missing/invalid IDs and duplicate-file tabs. Do not raise minAppVersion merely to use a newer convenience method without checking compatibility.

When source files rename or move, resolve the same tab and update its context plus snapshot paths. A source tab closure releases listeners and references but does not silently change the follower's source mode. Reopening the same file in another tab is not the same binding.

### Native Markdown integration

Recommended implementation: register a dedicated `GraphTabMarkdownView extends MarkdownView` with a unique view type, sharing a detached session/controller with the graph-mode view. Switch the **same leaf** between `BASES_GRAPH_VIEW` and this Markdown variant using Obsidian's view lifecycle. Keep `{graphTab: true}` and the session in both registered views' getState/setState. The native editor owns note data, properties, saves, and normal reading/editing modes.

The first implementation step is a small compatibility check of this registered subclass against the installed API and production wiring. Extending MarkdownView is an architectural recommendation, not evidence that every native command/plugin recognizes a custom view type. Audit literal `getViewType() === "markdown"` checks and native note navigation explicitly. Use automated adapter coverage, then leave actual editor behavior marked for the user's manual verification. Do not claim full native editor compatibility from mocks.

- Add the right-side list beside native editor content using plugin-owned DOM/classes without emptying, cloning, or moving native editor internals. Preserve the native content lifecycle and call inherited methods correctly. Avoid undocumented embedded editors, hidden WorkspaceLeaves, leaf.view reassignment, and a raw textarea with custom saving.
- Do not keep an offscreen graph engine running simply to preserve its selection. Capture detached state, use existing graph persistence/rehydration, and restore applicable local instance selections once hydration completes. Keep viewport, pins and open lenses through the existing persistence paths. Restore ephemeral graph-capable views too without promoting them into persisted graph notes.
- Serialize save/file/mode transitions per follower leaf; a generation/revision makes newer source changes win after awaited work. Never allow stale saves or file loads to overwrite the newer target/session. Await native save/unload before replacing an edited file, and handle failure before navigation. Keep file buffers out of the graph model.
- A source update while editing may request a different note; perform the same safe transition without stealing focus. Repeated notifications for the same effective file do not reload its editor or reset cursor/undo state.
- Preserve Graph Tab identity on in-place native file navigation and normal link opening; use the adapter/view's lifecycle to adopt the new displayed file or deliberately leave follower mode only on an explicit conversion command. Do not lose the session merely because a native path opens a plain Markdown view. New-tab/modifier link opens keep normal Obsidian behavior. Native navigation must not mutate graph selection or the linked source.
- The return button must work even when the selected note is not graph-capable. It returns to graphSourcePath, not to the editor's file. Source deletion or loss of graph capability gives a recoverable empty state.
- Generic Open as NosyGraph header actions must not duplicate/override the follower toggle or convert a selected note into the follower's graph root. Keep ordinary Markdown tabs and ordinary graph-to-Markdown conversion unchanged.
- Maintain source binding/mode across workspace restoration. Distinguish old view teardown during a mode switch from source closure, so followers do not briefly declare the source lost. Clean up sessions/listeners when a tab is actually detached. Do not retain closed view instances in plugin maps.
- Editor Ctrl/Cmd+A/X/C/V must retain native text behavior. The source-selection registry must never cause Cut to target the last graph while the editor or selected-note menu is focused. Test this against the completed shared Cut host.

Obsidian's [official API declarations](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts) describe MarkdownView, TextFileView.save and leaf state operations. The [official view guide](https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Plugins/User%20interface/Views.md) describes registered view lifecycle and discovery. Native editor subclass behavior and source-ID compatibility still require the user's Obsidian verification.

## Implementation sequence

1. Read repository instructions and capture the actual current test/type/lint baseline. Inspect live Graph Tab, native Markdown lifecycle, and source identity paths; preserve all completed features. Confirm the registered Markdown approach before expanding UI code.
2. Add the pure session/source arbitration model and focused tests: Automatic versus Linked precedence, note candidate identity, empty selection, unavailable source, mode/menu transitions, and stale async requests. Keep Obsidian/DOM out of application/domain logic.
3. Add per-surface selection notifications and source registry wiring to live GraphEngine/GraphView and embeds. Test every selection family, inactive caches, and source activation without changing graph gestures or Cut semantics.
4. Add the exact source-tab adapter, picker, binding lifecycle, restoration and cycle guards. Prove that a second tab showing the same file cannot replace a closed linked source.
5. Add the shared tab controller and native Markdown variant; replace the Graph Tab header action with the reversible mode toggle, then add the right-side menu. Reuse inherited native saving and normal view transitions.
6. Route the existing graph-follow events through the controller; adapt mode/source discovery and native navigation/header commands. Preserve graph return context, independent Graph Tab sessions, linked isolation, and latest-request behavior.
7. Run meaningful automated regression/static checks, update architecture/user documentation, build and deploy. Do not control Obsidian for testing.

Suggested modules are `graph-application/GraphTabSession.ts`, `GraphTabSourceRegistry.ts`, `ObsidianGraphTabController.ts`, `ObsidianGraphTabIdentity.ts`, and `GraphTabMarkdownView.ts`, plus a small selected-note panel component. Names/locations can follow local conventions; do not add every module if a smaller implementation preserves these boundaries. Avoid extending the already-large GraphView/main with unrelated feature logic.

## Verification

Run focused tests for the model and adapters, then the appropriate full regression suite, production build, bundle syntax, architecture typecheck, lint and full-project TypeScript comparison. The preceding implementation reported 730 tests passing and 119 existing full-project diagnostics; inspect the current baseline rather than hard-code those counts or attempt an unrelated type cleanup. No live-note edits, OS clipboard manipulation, or automated Obsidian interactions for tests.

Required automated scenarios include:

- Zero/one/many selected paths; duplicate instances and duplicate basenames; invalid/missing files; currently displayed note removed from selection; canonical paths in nested lenses and expansions.
- Automatic selection from another pane; focusing a graph with unchanged selection; empty selection superseding old selection; background graph updates not becoming the automatic source.
- Linked A while graph B is focused/selected; source A changes file while inactive; two tabs showing the same file; link/unlink/retarget; source closure; self/cycle rejection; deferred or missing source on restoration.
- The bound root G remains G when Markdown A/B are selected; switching modes preserves session and applicable graph state; two Graph Tabs have independent modes/bindings; old workspace state defaults safely.
- Rapid A/B/C selection, file/mode requests during asynchronous saves, save failures, stale hydration, source rename/deletion; no stale content write, extra leaf, duplicate actions/listeners, or focus theft.
- Native editor paste integration and text hotkeys are not redirected to graph selection/Cut. Existing normal graph/Markdown actions, clipboard, Lens Cut, Lens contents/edge isolation and badge editing remain covered.

Automated mocks cannot verify actual native editor properties layout, editor commands or subclass rendering. Report these as pending manual validation.

## Build and deployment completion

Use the existing reload-only handoff convention. Verify these paths and plugin IDs before copying:

- Build: `C:\Users\janbe\OneDrive\Dokumentation\Test Vault\.obsidian\plugins\Bases - Graph-View\main.js`
- Installed: `C:\Users\janbe\OneDrive\Dokumentation\Test Vault\.obsidian\plugins\nosygraph\main.js`

After checks, back up installed main.js to a timestamped workspace backup, copy the verified final bundle with native PowerShell literal-path operations, compare SHA-256, and run destination syntax verification. Prefer the existing scoped style mechanism; if the implementation introduces a required external stylesheet, explicitly include and verify that exact artifact instead of leaving an undeployed dependency. Preserve installed settings, manifest and unrelated files, notes and existing styles. Use narrow sandbox escalation for exact installed artifacts if required; deployment is part of the user's established implementation handoff. Never copy the development directory or data.json wholesale.

If deployment is blocked by automatic approval review, report the exact action/reason and actual readiness; do not claim deployed. Do not reload Obsidian yourself. Report the backup path, installed path/hash, checks and manual checklist so the user only needs to reload and test when deployment succeeds.

## Manual Obsidian checklist for the user

1. Open a Graph Tab using the existing command. With no selection, toggle to Markdown: the graph's source note appears and can be edited, including properties. Toggle back: the original graph and layout return.
2. Select one node in another graph pane, including a lens member; the automatic Graph Tab shows its Markdown. Select several: the right-side menu lists each distinct note, handles identical basenames, and switches notes without changing the graph's root or selection.
3. Edit, immediately switch notes/modes and reload later. Confirm text saved to the correct notes, normal reading/live preview works, undo/cursor behave normally, and graph-node clipboard paste still works in bodies/properties. Verify editor Ctrl+A/X affects text only.
4. Link Graph Tab T to source tab A. Select/navigate in A, then focus/select unrelated graph B. T follows only A in both modes. Clear A's selection: Markdown falls back to A's current graph note. Repeat with two source tabs showing the same file to prove the binding is to the tab.
5. Change A's file while it is inactive, rename a note, then close A. Confirm correct updates and an explicit unavailable-source state without switching to B. Relink and unlink; automatic following resumes only after unlinking.
6. Open two Graph Tabs with different sources/modes, reload the vault, and check restored modes, menu contents and exact bindings. Check that missing restored sources require relinking and that a self-link/cycle cannot be created.
7. Exercise a note tab containing a rendered graph embed, nested lenses/expansions, rapid selection, and a narrow tab/popout if used. Check no editor/graph overlap, accidental focus movement, duplicated controls or lost Lens Cut functionality.

## Chat/model recommendation and handover

Use a **new implementation chat in the same project**, with **GPT-6.2 Sol, High reasoning, Standard speed**. This is a new tab/navigation feature rather than a continuation of Lens Cut. High is appropriate for native editor lifecycle, cross-pane provenance, exact source binding, async saves and workspace restoration; the bounded plan keeps Sol the usage-conscious starting point.

Ready-to-paste prompt:

> Implement `C:\Users\janbe\OneDrive\Dokumentation\Test Vault\.obsidian\plugins\Bases - Graph-View\docs\architecture\GraphTabMarkdownModePlan.md`. Read applicable repository instructions and inspect the current live code first. This is implementation plus deployment; preserve all completed Lens, clipboard, badge and Cut behavior.
>
> Add the upper-right Graph/Markdown toggle to the existing Graph Tab, using Obsidian's editable native Markdown lifecycle in the same tab. With no graph selection, show the graph's source note. For multiple selected notes, add a right-side menu of all distinct selected note paths. The automatic source is the NosyGraph pane I last interacted with, including another pane and lenses/expansions. Preserve graph root/context separately from the displayed Markdown file.
>
> Also add explicit linking to another exact tab. When linked, both graph context and Markdown candidates must come only from that tab, regardless of focus/selection elsewhere. Persist per-tab mode/binding, safely restore exact identity, and show an unavailable source rather than silently following another tab. Keep menu navigation one-way and preserve native editing/saving, graph state, and source isolation.
>
> Implement the session/source controller and actual production wiring, not only detached modules. Run meaningful isolated automated tests, build and static checks; compare existing TypeScript diagnostics with baseline. I will perform all manual Obsidian tests, so do not control/reload Obsidian or test through live note edits/clipboard interactions.
>
> Back up and deploy the verified final build to `C:\Users\janbe\OneDrive\Dokumentation\Test Vault\.obsidian\plugins\nosygraph\main.js`, with verified plugin IDs/paths, matching SHA-256 and destination syntax. This exact deployment is authorized so I only need to reload the vault. Preserve settings and unrelated artifacts; use narrow sandbox escalation if needed. Report changes, checks, actual deployment/backup/hash, limitations and my short manual checklist. Mark native editor and manual behavior pending my verification.
