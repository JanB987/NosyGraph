# GraphRuntimeModeSelector

`GraphRuntimeModeSelector` is the guarded creation boundary for the two exclusive runtime modes. It chooses `legacy` by default and can create a store trial only when the caller explicitly enables `storeTrialEnabled`.

A selector owns at most one open handle. A second `open` call returns `runtime-already-open`, so a graph cannot change modes or maintain two mutable owners while it is open. Factory results are checked for both the requested mode and normalized document path; mismatches are closed and rejected visibly.

`rollbackToLegacy()` closes the active store handle and then invokes the legacy factory for the same document path. It does not copy store state into legacy state. The legacy factory must load its own persisted or host-adapted state, which makes rollback equivalent to closing and reopening the graph in legacy mode.

The selector and its rollback tests are implemented as an experimental host-neutral boundary. Production `GraphView` creation remains legacy until the manual parity and interactive activation gates are complete.