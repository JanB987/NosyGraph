import { describe, expect, it } from "vitest";
import { getRemovableLegacyOwnership, LEGACY_OWNERSHIP_AUDIT } from "./LegacyOwnershipAudit";

describe("legacy ownership audit", () => {
  it("does not remove legacy owners while live or parity dependents remain", () => {
    expect(LEGACY_OWNERSHIP_AUDIT.length).toBeGreaterThan(0);
    expect(getRemovableLegacyOwnership()).toEqual([]);
    expect(LEGACY_OWNERSHIP_AUDIT.every((entry) => entry.blockers.length > 0)).toBe(true);
  });

  it("records the blockers that prevent the D6 cleanup", () => {
    expect(LEGACY_OWNERSHIP_AUDIT.map((entry) => entry.id)).toEqual([
      "semantic-collections",
      "interaction-state",
      "badge-executor",
      "physics-loop",
      "legacy-read-adapters",
      "view-hydration"
    ]);
  });
});