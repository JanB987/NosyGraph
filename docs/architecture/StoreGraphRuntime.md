# StoreGraphRuntime

`StoreGraphRuntime` composes one detached document runtime from the graph store, scene store, physics coordinator, renderer, controller, persistence repository, and optional lifecycle coordinator.

The runtime keeps two counters independent:

- `GraphStore.getRevision()` advances when semantic graph state or selection changes.
- `GraphKinematicsStore.getSequence()` advances when a physics frame is published.

A semantic revision change reconciles the current motion frame to the new node set, refreshes the physics input, redraws, and saves through the document repository. A motion step publishes and renders a new frame without saving the document. Render snapshots are composed only when the frame carries the current semantic revision.

`open()` establishes the lifecycle generation, subscribes to renderer intents, seeds physics input, and renders. `close()` detaches intents, stops physics, unmounts the renderer, and closes the lifecycle coordinator. Node and badge intents route through `GraphController`; no renderer method mutates semantic state.

The runtime is implemented and covered by host-neutral tests, but remains experimental. The live Obsidian view still owns production composition until the parity, interactive verification, and activation gates are complete.