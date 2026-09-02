import { describe, expect, it } from "vitest";
import { normalizeGraphPhysicsSettings } from "../graph-domain/GraphPhysicsSettings";
import { LegacyGraphPhysicsSettingsAdapter } from "./LegacyGraphPhysicsSettingsAdapter";

describe("LegacyGraphPhysicsSettingsAdapter", () => {
  it("maps globals and preserves active-definition precedence", () => {
    const input = new LegacyGraphPhysicsSettingsAdapter({
      simulation: { repulsionStrength: 2000, centerStrength: 0.01 },
      activeLinkTypes: [{
        property: " Parts ", linkType: "Force Based",
        linkDistance: 150, linkForce: 0.02
      }],
      runtimeOverrides: {
        parts: { preferredDistance: 300, strength: 0.04 }
      }
    }).getSettingsInput();
    const settings = normalizeGraphPhysicsSettings(input);

    expect(settings.repulsionStrength).toBe(2000);
    expect(settings.linkPolicies.get("parts")).toEqual({
      mode: "force", preferredDistance: 150, strength: 0.02
    });
  });

  it("maps direction fields into a distinct policy", () => {
    const input = new LegacyGraphPhysicsSettingsAdapter({
      simulation: {},
      activeLinkTypes: [{
        property: "children", linkType: "Direction Based",
        linkDirection: "up", linkXAxis: 80, linkYAxis: 90
      }],
      runtimeOverrides: { children: { preferredDistance: 500, strength: 0.1 } }
    }).getSettingsInput();

    expect(normalizeGraphPhysicsSettings(input).linkPolicies.get("children")).toEqual({
      mode: "direction", direction: "up", xSpacing: 80, ySpacing: 90
    });
  });

  it("retains runtime-only policies and ignores blank identities", () => {
    const input = new LegacyGraphPhysicsSettingsAdapter({
      simulation: {},
      activeLinkTypes: [{ property: " " }],
      runtimeOverrides: {
        " Related ": { preferredDistance: 220 },
        "": { strength: 0.2 }
      }
    }).getSettingsInput();

    expect(Array.from(input.linkPolicies?.keys() ?? [])).toEqual(["related"]);
    expect(normalizeGraphPhysicsSettings(input).linkPolicies.get("related")).toEqual({
      mode: "force", preferredDistance: 220, strength: 0.01
    });
  });
});
