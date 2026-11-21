import { describe, expect, it } from "vitest";
import { parseNoteLinkPaste } from "./GraphNoteLinkPaste";

describe("note link clipboard syntax", () => {
  it("preserves order and source spans across wiki links, CRLF, aliases and property-list wrappers", () => {
    const text = '  - "[[Folder/Name, with spaces (2)#Heading|Label]]"\r\n* [[Other#^block]] [[#Here]]';
    const parsed = parseNoteLinkPaste(text);
    expect(parsed.kind).toBe("links");
    if (parsed.kind === "search") throw new Error("Expected links");
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.tokens).toMatchObject([
      { target: "Folder/Name, with spaces (2)", label: "Label", subpath: "#Heading" },
      { target: "Other", subpath: "#^block" },
      { target: "", subpath: "#Here" }
    ]);
    expect(parsed.tokens.map(({ raw, start, end }) => text.slice(start, end) === raw)).toEqual([true, true, true]);
  });

  it("decodes Markdown exactly once after separating literal fragments", () => {
    const text = String.raw`[a](./A%20B%23C%2520(2).md#heading) [b](Other\(3\).md) [nested [label]](<C, D (4).md> "Title")`;
    expect(parseNoteLinkPaste(text)).toMatchObject({
      kind: "links",
      tokens: [
        { target: "./A B#C%20(2).md", label: "a", subpath: "#heading" },
        { target: "Other(3).md" },
        { target: "C, D (4).md", label: "nested [label]" }
      ],
      diagnostics: []
    });
    expect(parseNoteLinkPaste('- "[label](Other\\\\(3\\\\).md)"')).toMatchObject({
      kind: "links", tokens: [{ target: "Other(3).md" }], diagnostics: []
    });
    expect(parseNoteLinkPaste("[bad](%ZZ.md)")).toMatchObject({ kind: "invalid", tokens: [{ issue: "invalid" }] });
  });

  it("reports URI offsets in the original clipboard across text slices and decoded wrappers", () => {
    const first = "HTTPS://first.test";
    const second = "//second.test/file";
    const third = "custom+scheme:third";
    const fourth = 'https://fourth.test/a\\"b';
    const fifth = "https://fifth.test/it''s";
    const text = first + "\t  " + second + " \tprose [[Internal]]" + third + "\r\n"
      + '  - "[[A|\\"Alias\\"]] \t' + fourth + '"\r\n'
      + "  - '[[B|It''s a label]]  " + fifth + "'";
    const parsed = parseNoteLinkPaste(text);
    expect(parsed.kind).toBe("links");
    if (parsed.kind === "search") throw new Error("Expected links");
    expect(parsed.tokens.map(({ target, label }) => ({ target, label }))).toEqual([
      { target: "Internal" }, { target: "A", label: '"Alias"' }, { target: "B", label: "It's a label" }
    ]);
    expect(parsed.diagnostics).toEqual(
      [first, second, "prose", third, fourth, fifth].map(raw => ({
        raw, start: text.indexOf(raw), end: text.indexOf(raw) + raw.length,
        status: raw === "prose" ? "ignored" : "external"
      }))
    );
    for (const { raw, start, end } of [...parsed.tokens, ...parsed.diagnostics]) {
      expect(text.slice(start, end)).toBe(raw);
    }
  });

  it("recovers a Markdown link after malformed wiki syntax and decodes escaped punctuation", () => {
    const link = "[nested](Folder/A\\[B\\]\\(C\\)\\\\\\\x60D.md)";
    const text = "[[broken " + link;
    expect(parseNoteLinkPaste(text)).toMatchObject({
      kind: "links",
      tokens: [{ raw: link, start: 9, end: text.length, target: "Folder/A[B](C)\\\x60D.md" }],
      diagnostics: [{ raw: "[[broken ", start: 0, end: 9, status: "invalid" }]
    });
  });

  it("reports malformed syntax, stray prose and external URIs without swallowing later links", () => {
    expect(parseNoteLinkPaste("See https://example.org [[broken [[Valid]]\n[bad](broken\n[other](obsidian://open?file=X)"))
      .toMatchObject({
        kind: "links",
        tokens: [{ target: "Valid" }, { issue: "external" }],
        diagnostics: [
          { raw: "See", status: "ignored" }, { raw: "https://example.org", status: "external" },
          { status: "invalid" }, { status: "invalid" }
        ]
      });
    expect(parseNoteLinkPaste("[label] (broken")).toMatchObject({ kind: "invalid" });
    expect(parseNoteLinkPaste("Name, with (punctuation); and spaces")).toEqual({ kind: "search" });
    expect(parseNoteLinkPaste("https://example.org")).toMatchObject({ kind: "invalid", diagnostics: [{ status: "external" }] });
  });
});
