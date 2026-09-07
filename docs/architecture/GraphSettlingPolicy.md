# GraphSettlingPolicy

## Purpose and status

[GraphSettlingPolicy](../../src/graph-domain/GraphSettlingPolicy.ts) extracts the legacy simulation-loop policy without timers or browser APIs. It decides cadence, rest hysteresis, settled status, interaction wake-up, freeze/resume, and reheat behavior from detached settings and one observed maximum velocity.

The policy is now used by [StagedGraphPhysicsEngine](StagedGraphPhysicsEngine.md). The live GraphEngine animation loop remains unchanged.

## Legacy rules

- Starting a stopped or settled simulation resets the low-velocity counter and last maximum velocity to infinity.
- While interaction is active, cadence is active-frame cadence (16 ms by default), the low-velocity counter is cleared, and stepping continues.
- Without interaction, last maximum velocity at or below the near-rest threshold selects near-settle cadence (50 ms by default); otherwise active cadence is selected.
- A frame above the rest threshold clears the counter and continues.
- A frame at or below the rest threshold increments the counter. The simulation remains active until the configured 24-frame count is reached; the 24th low frame transitions to settled.
- A settled policy does not observe further frames until start or positive reheat.
- Freeze preserves counter and velocity history. Frozen observations do not advance settling; resume continues from that progress.
- Reheat starts stopped or settled policies for positive finite amounts. Reheating an already-running policy does not reset its hysteresis. Nonpositive and nonfinite amounts are ignored.

The policy normalizes unsafe thresholds and cadence values at its boundary. It retains the legacy distinction between rest and near-rest thresholds.

## Detached state

GraphSettlingPolicyState contains status, consecutive low-velocity frame count, and last maximum velocity. GraphSettlingObservation reports phase, status, continuation decision, count, last velocity, and the selected target interval. No requestAnimationFrame, timer, DOM, or host state is involved.

The staged engine exposes detached settling state and the selected target interval for experiments. Its step diagnostics include the observation that caused each state transition. The final confinement and anchoring stages still run before settling observes the integration maximum velocity, matching the legacy solver's maximum-velocity ownership.

## Limitations

Interaction must be supplied explicitly to the staged engine through setInteractionActive. The legacy adapter does not yet project that browser interaction state into GraphPhysicsRuntimeInput. Settling cadence is therefore experimentally available but not a live-loop replacement. A later application boundary should connect host interaction and timer scheduling.
