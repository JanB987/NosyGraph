import { describe, expect, it } from "vitest";
import { resolveO3NodeBadgeIntent } from "./O3NodeBadge";

const base = {
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false
};

describe("O3NodeBadge modifier characterization", () => {
  it("toggles for an ordinary click and Ctrl/Cmd+Shift", () => {
    expect(resolveO3NodeBadgeIntent(base)).toBe("toggle-badge");
    expect(resolveO3NodeBadgeIntent({ ...base, ctrlKey: true, shiftKey: true }))
      .toBe("toggle-badge");
    expect(resolveO3NodeBadgeIntent({ ...base, metaKey: true, shiftKey: true }))
      .toBe("toggle-badge");
  });

  it("opens link input for Alt with any other modifier", () => {
    expect(resolveO3NodeBadgeIntent({ ...base, altKey: true }))
      .toBe("open-badge-input");
    expect(resolveO3NodeBadgeIntent({
      ...base,
      altKey: true,
      ctrlKey: true,
      metaKey: true,
      shiftKey: true
    })).toBe("open-badge-input");
  });

  it("expands a chain for Ctrl or Cmd without Shift", () => {
    expect(resolveO3NodeBadgeIntent({ ...base, ctrlKey: true }))
      .toBe("expand-badge-chain");
    expect(resolveO3NodeBadgeIntent({ ...base, metaKey: true }))
      .toBe("expand-badge-chain");
  });

  it("gives Alt precedence over Ctrl/Cmd chain expansion", () => {
    expect(resolveO3NodeBadgeIntent({ ...base, altKey: true, ctrlKey: true }))
      .toBe("open-badge-input");
    expect(resolveO3NodeBadgeIntent({ ...base, altKey: true, metaKey: true }))
      .toBe("open-badge-input");
  });
});
