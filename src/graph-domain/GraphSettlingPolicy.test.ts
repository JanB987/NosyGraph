import { describe, expect, it } from "vitest";
import { normalizeGraphPhysicsSettings } from "./GraphPhysicsSettings";
import { GraphSettlingPolicy } from "./GraphSettlingPolicy";

function policy() {
  const policy = new GraphSettlingPolicy();
  policy.setSettings({
    ...normalizeGraphPhysicsSettings({
      restVelocityThreshold: 0.015,
      nearRestVelocityThreshold: 0.08
    }),
    settleFrameCount: 3,
    activeFrameIntervalMs: 16,
    nearSettleFrameIntervalMs: 50
  });
  return policy;
}

describe("GraphSettlingPolicy", () => {
  it("starts with active cadence and resets progress", () => {
    const settling = policy();
    expect(settling.getState()).toMatchObject({
      status: "stopped", settledFrameCount: 0, lastMaxVelocity: Infinity
    });
    settling.start();
    expect(settling.getStatus()).toBe("running");
    expect(settling.getTargetFrameInterval(false)).toBe(16);
    expect(settling.getTargetFrameInterval(true)).toBe(16);
  });

  it("uses near-settle cadence after a low-velocity frame", () => {
    const settling = policy();
    settling.start();
    const result = settling.observe(0.01, false);
    expect(result).toMatchObject({
      phase: "settling", status: "running", continueSimulation: true,
      settledFrameCount: 1, lastMaxVelocity: 0.01, targetFrameIntervalMs: 50
    });
    expect(settling.getTargetFrameInterval(false)).toBe(50);
  });

  it("stops only after the configured number of consecutive low frames", () => {
    const settling = policy();
    settling.start();
    expect(settling.observe(0.01, false).continueSimulation).toBe(true);
    expect(settling.observe(0.01, false).continueSimulation).toBe(true);
    const final = settling.observe(0.01, false);
    expect(final).toMatchObject({
      phase: "settled", status: "settled", continueSimulation: false,
      settledFrameCount: 3
    });
    expect(settling.observe(1, false).continueSimulation).toBe(false);
  });

  it("clears hysteresis when an active frame exceeds the rest threshold", () => {
    const settling = policy();
    settling.start();
    settling.observe(0.01, false);
    settling.observe(0.01, false);
    const active = settling.observe(0.02, false);
    expect(active).toMatchObject({
      phase: "active", status: "running", continueSimulation: true, settledFrameCount: 0
    });
    expect(settling.getTargetFrameInterval(false)).toBe(50);
  });

  it("keeps interaction active and uses the active cadence", () => {
    const settling = policy();
    settling.start();
    settling.observe(0.01, false);
    const result = settling.observe(0, true);
    expect(result).toMatchObject({
      phase: "active", status: "running", continueSimulation: true,
      settledFrameCount: 0, targetFrameIntervalMs: 16
    });
  });

  it("reheats only stopped or settled policies and ignores invalid amounts", () => {
    const settling = policy();
    settling.reheat(0);
    expect(settling.getStatus()).toBe("stopped");
    settling.reheat(0.2);
    expect(settling.getStatus()).toBe("running");
    settling.observe(0.01, false);
    settling.observe(0.01, false);
    settling.observe(0.01, false);
    expect(settling.getStatus()).toBe("settled");
    settling.reheat(0.2);
    expect(settling.getState()).toMatchObject({
      status: "running", settledFrameCount: 0, lastMaxVelocity: Infinity
    });
    settling.observe(0.01, false);
    settling.reheat(Number.NaN);
    expect(settling.getState().settledFrameCount).toBe(1);
  });

  it("freezes without advancing settling and resumes the same progress", () => {
    const settling = policy();
    settling.start();
    settling.observe(0.01, false);
    settling.freeze();
    expect(settling.observe(1, false)).toMatchObject({
      phase: "frozen", status: "frozen", continueSimulation: false, settledFrameCount: 1
    });
    settling.resume();
    expect(settling.observe(0.01, false).settledFrameCount).toBe(2);
  });

  it("normalizes unsafe cadence and threshold settings", () => {
    const settling = new GraphSettlingPolicy();
    settling.setSettings({
      nearRestVelocityThreshold: -1,
      restVelocityThreshold: -2,
      settleFrameCount: 0,
      activeFrameIntervalMs: 0,
      nearSettleFrameIntervalMs: NaN
    });
    settling.start();
    expect(settling.getTargetFrameInterval(false)).toBe(1);
    expect(settling.observe(0, false).continueSimulation).toBe(false);
  });
});

