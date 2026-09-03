import { describe, expect, it } from "vitest";
import {
  normalizeGraphPhysicsSettings,
  resolveGraphLinkPhysicsPolicy
} from "./GraphPhysicsSettings";

describe("normalizeGraphPhysicsSettings", () => {
  it("makes every observed legacy default explicit", () => {
    expect(normalizeGraphPhysicsSettings()).toEqual({
      repulsionStrength: 4000,
      centerStrength: 0,
      damping: 0.85,
      nearRestVelocityThreshold: 0.08,
      restVelocityThreshold: 0.015,
      settleFrameCount: 24,
      activeFrameIntervalMs: 16,
      nearSettleFrameIntervalMs: 50,
      nodeContainerInfluenceDistance: 120,
      containerContainerInfluenceDistance: 36,
      defaultLinkPolicy: {
        mode: "force",
        preferredDistance: 120,
        strength: 0.01
      },
      linkPolicies: new Map()
    });
  });

  it("normalizes explicit derived container influence distances", () => {
    const settings = normalizeGraphPhysicsSettings({
      nodeContainerInfluenceDistance: 160,
      containerContainerInfluenceDistance: -5
    });
    expect(settings.nodeContainerInfluenceDistance).toBe(160);
    expect(settings.containerContainerInfluenceDistance).toBe(0);
  });

  it("preserves finite force values and applies effective threshold rules", () => {
    const settings = normalizeGraphPhysicsSettings({
      repulsionStrength: -10,
      centerStrength: -0.2,
      restVelocityThreshold: 0.2,
      nearRestVelocityThreshold: 0.1
    });

    expect(settings.repulsionStrength).toBe(-10);
    expect(settings.centerStrength).toBe(-0.2);
    expect(settings.restVelocityThreshold).toBe(0.2);
    expect(settings.nearRestVelocityThreshold).toBe(0.2);
  });

  it("normalizes custom default link values through legacy clamps", () => {
    const settings = normalizeGraphPhysicsSettings({
      defaultLinkDistance: 900,
      defaultLinkStrength: 0
    });
    expect(settings.defaultLinkPolicy).toEqual({
      mode: "force",
      preferredDistance: 800,
      strength: 0.001
    });
  });

  it("copies and resolves the LinkType source map", () => {
    const source = new Map([[
      "parts",
      { runtimeOverride: { preferredDistance: 200, strength: 0.02 } }
    ]]);
    const settings = normalizeGraphPhysicsSettings({ linkPolicies: source });
    source.clear();

    expect(settings.linkPolicies.get("parts")).toEqual({
      mode: "force",
      preferredDistance: 200,
      strength: 0.02
    });
  });
});

describe("resolveGraphLinkPhysicsPolicy", () => {
  it("uses active force values before runtime overrides and clamps the result", () => {
    expect(resolveGraphLinkPhysicsPolicy({
      activeDefinition: {
        mode: "force",
        preferredDistance: 5,
        strength: 2
      },
      runtimeOverride: {
        preferredDistance: 300,
        strength: 0.02
      }
    })).toEqual({
      mode: "force",
      preferredDistance: 20,
      strength: 0.3
    });
  });

  it("uses runtime values when active force values are absent or non-finite", () => {
    expect(resolveGraphLinkPhysicsPolicy({
      activeDefinition: {
        mode: "force",
        preferredDistance: Number.NaN
      },
      runtimeOverride: {
        preferredDistance: 250,
        strength: 0.025
      }
    })).toEqual({
      mode: "force",
      preferredDistance: 250,
      strength: 0.025
    });
  });

  it("normalizes direction policy independently of force overrides", () => {
    expect(resolveGraphLinkPhysicsPolicy({
      activeDefinition: {
        mode: "direction",
        direction: "outgoing",
        xSpacing: 0,
        ySpacing: -0.5
      },
      runtimeOverride: {
        preferredDistance: 300,
        strength: 0.02
      }
    })).toEqual({
      mode: "direction",
      direction: "right",
      xSpacing: 120,
      ySpacing: 1
    });
  });
});
