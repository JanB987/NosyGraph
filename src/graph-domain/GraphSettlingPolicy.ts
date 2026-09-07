import type { GraphPhysicsSettings } from "./GraphPhysicsSettings";

export type GraphSettlingStatus = "stopped" | "running" | "settled" | "frozen";
export type GraphSettlingPhase = "active" | "near-rest" | "settling" | "settled" | "frozen" | "stopped";

export interface GraphSettlingPolicyState {
  status: GraphSettlingStatus;
  settledFrameCount: number;
  lastMaxVelocity: number;
}

export interface GraphSettlingObservation {
  phase: GraphSettlingPhase;
  status: GraphSettlingStatus;
  continueSimulation: boolean;
  settledFrameCount: number;
  lastMaxVelocity: number;
  targetFrameIntervalMs: number;
}

/** Encapsulates legacy cadence, rest hysteresis, freeze, and reheat behavior. */
export class GraphSettlingPolicy {
  private settings: Pick<
    GraphPhysicsSettings,
    | "nearRestVelocityThreshold"
    | "restVelocityThreshold"
    | "settleFrameCount"
    | "activeFrameIntervalMs"
    | "nearSettleFrameIntervalMs"
  > = {
    nearRestVelocityThreshold: 0.08,
    restVelocityThreshold: 0.015,
    settleFrameCount: 24,
    activeFrameIntervalMs: 16,
    nearSettleFrameIntervalMs: 50
  };
  private state: GraphSettlingPolicyState = {
    status: "stopped",
    settledFrameCount: 0,
    lastMaxVelocity: Number.POSITIVE_INFINITY
  };

  setSettings(settings: Pick<
    GraphPhysicsSettings,
    | "nearRestVelocityThreshold"
    | "restVelocityThreshold"
    | "settleFrameCount"
    | "activeFrameIntervalMs"
    | "nearSettleFrameIntervalMs"
  >): void {
    this.settings = {
      nearRestVelocityThreshold: finiteOr(settings.nearRestVelocityThreshold, 0.08),
      restVelocityThreshold: Math.max(0, finiteOr(settings.restVelocityThreshold, 0.015)),
      settleFrameCount: Math.max(1, Math.floor(finiteOr(settings.settleFrameCount, 24))),
      activeFrameIntervalMs: Math.max(1, finiteOr(settings.activeFrameIntervalMs, 16)),
      nearSettleFrameIntervalMs: Math.max(1, finiteOr(settings.nearSettleFrameIntervalMs, 50))
    };
    this.resetProgress();
  }

  start(): void {
    if (this.state.status === "frozen" || this.state.status === "running") return;
    this.resetProgress();
    this.state.status = "running";
  }

  resetProgress(): void {
    this.state = {
      ...this.state,
      settledFrameCount: 0,
      lastMaxVelocity: Number.POSITIVE_INFINITY
    };
  }

  freeze(): void {
    this.state = { ...this.state, status: "frozen" };
  }

  resume(): void {
    if (this.state.status === "frozen") this.state = { ...this.state, status: "running" };
  }

  stop(): void {
    this.state = { ...this.state, status: "stopped" };
  }

  reheat(amount = 0.15): void {
    if (!Number.isFinite(amount) || amount <= 0 || this.state.status === "frozen") return;
    if (this.state.status !== "running") this.start();
  }

  getStatus(): GraphSettlingStatus {
    return this.state.status;
  }

  getState(): GraphSettlingPolicyState {
    return { ...this.state };
  }

  getTargetFrameInterval(interactionActive: boolean): number {
    if (interactionActive) return this.settings.activeFrameIntervalMs;
    return this.state.lastMaxVelocity <= this.effectiveNearRestVelocityThreshold()
      ? this.settings.nearSettleFrameIntervalMs
      : this.settings.activeFrameIntervalMs;
  }

  observe(maxVelocity: number, interactionActive: boolean): GraphSettlingObservation {
    if (this.state.status !== "running") {
      return this.observation(
        this.state.status === "frozen" ? "frozen" : this.state.status === "settled" ? "settled" : "stopped",
        false,
        false
      );
    }

    this.state = { ...this.state, lastMaxVelocity: maxVelocity };
    if (interactionActive) {
      this.state = { ...this.state, settledFrameCount: 0 };
      return this.observation("active", true, interactionActive);
    }
    if (maxVelocity > this.effectiveRestVelocityThreshold()) {
      this.state = { ...this.state, settledFrameCount: 0 };
      return this.observation("active", true, interactionActive);
    }

    const settledFrameCount = this.state.settledFrameCount + 1;
    const continueSimulation = settledFrameCount < this.settings.settleFrameCount;
    this.state = {
      ...this.state,
      settledFrameCount,
      status: continueSimulation ? "running" : "settled"
    };
    return this.observation(continueSimulation ? "settling" : "settled", continueSimulation, interactionActive);
  }

  private observation(
    phase: GraphSettlingPhase,
    continueSimulation: boolean,
    interactionActive: boolean
  ): GraphSettlingObservation {
    return {
      phase,
      status: this.state.status,
      continueSimulation,
      settledFrameCount: this.state.settledFrameCount,
      lastMaxVelocity: this.state.lastMaxVelocity,
      targetFrameIntervalMs: this.getTargetFrameInterval(interactionActive)
    };
  }

  private effectiveRestVelocityThreshold(): number {
    return Math.max(0, this.settings.restVelocityThreshold);
  }

  private effectiveNearRestVelocityThreshold(): number {
    return Math.max(
      this.effectiveRestVelocityThreshold(),
      Math.max(0, this.settings.nearRestVelocityThreshold)
    );
  }
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}
