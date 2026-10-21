import { describe, expect, it } from "vitest";
import {
  normalizeLensLinkTypeDefinition,
  validateLensLinkTypeDefinition,
} from "./LensLinkTypeDefinition";

describe("LensLinkTypeDefinition", () => {
  it("normalizes one reusable Obsidian link reference and ordered read properties", () => {
    const definition = normalizeLensLinkTypeDefinition({
      definitionReference: "[[LinkTypes/Project Scope]]",
      label: "Project scope",
      property: ["Parts", "Deliverables", "parts"],
      properties: ["Milestones", "deliverables"],
      writeProperty: "Deliverables",
    });

    expect(definition).toMatchObject({
      id: "[[LinkTypes/Project Scope]]",
      definitionReference: "[[LinkTypes/Project Scope]]",
      label: "Project scope",
      property: "parts",
      properties: ["parts", "deliverables", "milestones"],
      writeProperty: "deliverables",
      semantic: "lens",
      iconKind: "lens",
    });
    expect(definition?.activationPolicy).toEqual({
      allowsPropertyOverlap: true,
      allowsMultipleDefinitions: true,
    });
  });

  it("uses the first read property when writeProperty is absent", () => {
    const definition = normalizeLensLinkTypeDefinition({
      definitionReference: "[[Scope Lens]]",
      property: ["parts", "deliverables"],
    });

    expect(definition?.writeProperty).toBe("parts");
  });

  it("rejects an empty or out-of-set write property with actionable errors", () => {
    expect(validateLensLinkTypeDefinition({
      definitionReference: "[[Invalid Lens]]",
      property: ["parts"],
      writeProperty: "status",
    })).toEqual({
      errors: ["writeProperty must be one of the configured read properties."],
    });

    expect(validateLensLinkTypeDefinition({
      definitionReference: "[[No Properties Lens]]",
    })).toEqual({
      errors: ["At least one Lens read property is required."],
    });
  });

  it("does not turn a note reference into a forced full path", () => {
    const definition = normalizeLensLinkTypeDefinition({
      definitionReference: "[[Scope Lens]]",
      property: "parts",
    });

    expect(definition?.definitionReference).toBe("[[Scope Lens]]");
    expect(definition?.id).toBe("[[Scope Lens]]");
  });
});
