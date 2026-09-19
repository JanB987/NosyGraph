import { describe, expect, it } from "vitest";
import { resolveGraphLinkDropCore } from "./graph-interactions";

describe("resolveGraphLinkDropCore baseline characterization", () => {
  it("creates an add command using the supplied LinkType write property", () => {
    expect(resolveGraphLinkDropCore({
      intent: { action: "add_or_create_link" },
      existingLink: false,
      parentReference: "Parent.md",
      childReference: "Child.md",
      linkTypeProperty: "parts"
    })).toEqual({
      shouldEnsureExpanded: true,
      command: {
        action: "add_or_create_link",
        parentReference: "Parent.md",
        childReference: "Child.md",
        property: "parts"
      }
    });
  });

  it("does not add a duplicate relationship", () => {
    expect(resolveGraphLinkDropCore({
      intent: { action: "add_or_create_link" },
      existingLink: true,
      parentReference: "Parent.md",
      childReference: "Child.md",
      linkTypeProperty: "parts"
    })).toBeUndefined();
  });

  it("creates a removal command only for an existing relationship", () => {
    expect(resolveGraphLinkDropCore({
      intent: { action: "remove_link" },
      existingLink: true,
      parentReference: "Parent.md",
      childReference: "Child.md",
      linkTypeProperty: "parts"
    })).toEqual({
      shouldEnsureExpanded: false,
      command: {
        action: "remove_link",
        parentReference: "Parent.md",
        childReference: "Child.md",
        property: "parts"
      }
    });

    expect(resolveGraphLinkDropCore({
      intent: { action: "remove_link" },
      existingLink: false,
      parentReference: "Parent.md",
      childReference: "Child.md",
      linkTypeProperty: "parts"
    })).toBeUndefined();
  });
});
