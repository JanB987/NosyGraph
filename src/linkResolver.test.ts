import { describe, expect, it } from "vitest";
import { extractLinkPath } from "./linkResolver";

describe("LinkType reference parsing", () => {
  it("accepts wiki and Markdown internal links", () => {
    expect(extractLinkPath("[[LinkTypes/Scope Lens]]")).toBe("LinkTypes/Scope Lens");
    expect(extractLinkPath("[Scope Lens](LinkTypes/Scope%20Lens.md)")).toBe("LinkTypes/Scope Lens.md");
  });
});
