import { describe, expect, it } from "vitest";
import { isExpansionSourceAvailable } from "./GraphExpansionRuntimeVisibility";

describe("isExpansionSourceAvailable", () => {
  it("accepts a canonical source path", () => {
    expect(
      isExpansionSourceAvailable(
        "Projects/Root.md",
        "Projects/Root.md",
        new Set(["Projects/Root.md"]),
        new Set(),
      ),
    ).toBe(true);
  });

  it("accepts a duplicate source represented by a runtime node", () => {
    expect(
      isExpansionSourceAvailable(
        "Projects/Child.md",
        "Projects/Child.md::duplicate::parent",
        new Set(),
        new Set(["Projects/Child.md::duplicate::parent"]),
      ),
    ).toBe(true);
  });

  it("rejects a source absent from both canonical and runtime state", () => {
    expect(
      isExpansionSourceAvailable(
        "Projects/Missing.md",
        "Projects/Missing.md::duplicate::stale",
        new Set(["Projects/Root.md"]),
        new Set(["Projects/Child.md::duplicate::parent"]),
      ),
    ).toBe(false);
  });
});
