import { describe, expect, it } from "vitest";
import { evaluateLinkTypeActivation } from "./LinkTypeActivationPolicy";
import type { LinkTypeDefinition } from "./types";

function definition(
  id: string,
  properties: string[],
  semantic: "link" | "lens" = "link",
): LinkTypeDefinition {
  return {
    id,
    label: id,
    property: properties[0] ?? "",
    properties,
    semantic,
    layout: "force",
    color: "#7aa2ff",
    renderStyle: "line",
    directionMode: "child",
    opacity: 1,
    lineThickness: 1,
    lineLengthMultiplier: 1,
    forceStrength: 1,
  };
}

describe("LinkTypeActivationPolicy", () => {
  it("allows Lens definitions to overlap and coexist", () => {
    const result = evaluateLinkTypeActivation(
      [definition("[[Existing Lens]]", ["parts"], "lens")],
      definition("[[Second Lens]]", ["parts"], "lens"),
    );

    expect(result).toEqual({ accepted: true });
  });

  it("rejects overlapping non-Lens definitions with explicit conflicts", () => {
    const result = evaluateLinkTypeActivation(
      [definition("force-parts", ["parts"])],
      definition("direction-parts", ["parts", "deliverables"]),
    );

    expect(result).toEqual({
      accepted: false,
      conflicts: [{
        property: "parts",
        existingDefinitionId: "force-parts",
        requestedDefinitionId: "direction-parts",
      }],
    });
  });

  it("allows a Lens to overlap an existing non-Lens definition", () => {
    const result = evaluateLinkTypeActivation(
      [definition("force-parts", ["parts"])],
      definition("[[Parts Lens]]", ["parts"], "lens"),
    );

    expect(result).toEqual({ accepted: true });
  });
});
