import { describe, expect, it, vi } from "vitest";
import { resolveLinkTypeBadgeIcon } from "./LinkTypeBadgeIcon";
import type { LinkTypeIconKind } from "./link-types/types";

const registeredIcons = new Set(["scan-search", "zap", "git-branch", "arrow-right", "link", "telescope", "x"]);
const hasIcon = (name: string) => registeredIcons.has(name);

describe("LinkType badge icon resolution", () => {
  it.each<[LinkTypeIconKind, string]>([
    ["lens", "scan-search"],
    ["force", "zap"],
    ["direction", "arrow-right"],
    ["parent", "git-branch"]
  ])("uses the %s default when an override is absent or unusable", (kind, name) => {
    for (const value of [undefined, "", "   ", "text: ", "text:\u200D", "telescoppe", "<svg></svg>"]) {
      expect(resolveLinkTypeBadgeIcon(kind, value, hasIcon)).toEqual({ kind: "icon", name });
    }
    expect(resolveLinkTypeBadgeIcon(kind, "telescope", hasIcon)).toEqual({ kind: "icon", name: "telescope" });
  });

  it("uses registered x unless the override explicitly requests literal x", () => {
    expect(resolveLinkTypeBadgeIcon("lens", "x", hasIcon)).toEqual({ kind: "icon", name: "x" });
    const lookup = vi.fn(hasIcon);
    expect(resolveLinkTypeBadgeIcon("lens", "text:x", lookup)).toEqual({ kind: "text", text: "x" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each(["★", "🔭", "👩🏽‍🔬", "🇩🇪🇫🇷", "✌️", "e\u0301", "1️⃣", "1️⃣#️⃣", "#", "*", ":", "Q"])(
    "preserves the entire bare symbol string %s", (text) => {
      expect(resolveLinkTypeBadgeIcon("lens", text, hasIcon)).toEqual({ kind: "text", text });
    }
  );

  it.each(["ABC", "7", "Hello World", "<svg></svg>"])("treats explicit text %s literally", (text) => {
    expect(resolveLinkTypeBadgeIcon("lens", `text:${text}`, hasIcon)).toEqual({ kind: "text", text });
  });

  it("keeps the badge visible when the host lacks its preferred default", () => {
    expect(resolveLinkTypeBadgeIcon("lens", "telescoppe", (name) => name === "link"))
      .toEqual({ kind: "icon", name: "link" });
    expect(resolveLinkTypeBadgeIcon("lens", undefined, () => false))
      .toEqual({ kind: "text", text: "•" });
  });
});
