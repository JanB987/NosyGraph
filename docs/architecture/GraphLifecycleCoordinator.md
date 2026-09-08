# Graph lifecycle coordinator

## Purpose

GraphLifecycleCoordinator owns document lifetime and asynchronous work at the application boundary. Each opened document has a generation and active path. Closing, reopening, renaming, deleting, or receiving a note-change event invalidates pending work so late promises cannot publish into a different runtime.

## Responsibilities

- abort the active generation signal on close, reopen, rename, delete, and note metadata changes;
- run async reads and writes only while their captured path and generation remain current;
- schedule keyed delayed work with replacement and close-time timer cleanup;
- normalize host event subscriptions and release them on close or explicit unsubscribe;
- mark writes before awaiting storage and suppress the resulting self-change events for a bounded window;
- retarget the active document across rename and close it when the active note is deleted.

The coordinator does not own graph state or decide how a host event changes the graph. Its event listener remains responsible for refresh and restoration commands.

## Current status

The coordinator and characterization tests are implemented as a host-neutral lifecycle boundary. GraphView still owns the live legacy timers and suppression maps until lifecycle composition is migrated behind this contract.
