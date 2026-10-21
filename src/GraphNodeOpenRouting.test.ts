import { describe, expect, it } from "vitest";
import { resolveGraphNodeOpenRoute } from "./GraphNodeOpenRouting";

describe("resolveGraphNodeOpenRoute", () => {
  it("replaces an unpinned graph leaf with Markdown for an ordinary note", () => {
    expect(resolveGraphNodeOpenRoute({
      graphCapable: false,
      graphTab: false,
      newTab: false,
      sourcePinned: false
    })).toBe("source-markdown");
  });

  it("preserves a pinned graph leaf and opens an ordinary note elsewhere", () => {
    expect(resolveGraphNodeOpenRoute({
      graphCapable: false,
      graphTab: false,
      newTab: false,
      sourcePinned: true
    })).toBe("unpinned-markdown");
  });

  it("keeps a follower Graph Tab on its last valid graph", () => {
    expect(resolveGraphNodeOpenRoute({
      graphCapable: false,
      graphTab: true,
      newTab: false,
      sourcePinned: false
    })).toBe("graph-tab-markdown");
  });

  it("keeps a pinned follower Graph Tab on its last valid graph", () => {
    expect(resolveGraphNodeOpenRoute({
      graphCapable: false,
      graphTab: true,
      newTab: false,
      sourcePinned: true
    })).toBe("graph-tab-markdown");
  });

  it("preserves graph-view opening for graph-capable targets", () => {
    expect(resolveGraphNodeOpenRoute({
      graphCapable: true,
      graphTab: false,
      newTab: false,
      sourcePinned: false
    })).toBe("source-graph");
  });

  it("preserves a pinned graph leaf and opens a graph-capable target elsewhere", () => {
    expect(resolveGraphNodeOpenRoute({
      graphCapable: true,
      graphTab: false,
      newTab: false,
      sourcePinned: true
    })).toBe("unpinned-graph");
  });

  it("honors an explicit new-tab request as Markdown", () => {
    expect(resolveGraphNodeOpenRoute({
      graphCapable: true,
      graphTab: false,
      newTab: true,
      sourcePinned: false
    })).toBe("new-markdown");
  });

  it("keeps explicit new-tab routing distinct from pinned fallback", () => {
    expect(resolveGraphNodeOpenRoute({
      graphCapable: false,
      graphTab: false,
      newTab: true,
      sourcePinned: true
    })).toBe("new-markdown");
  });
});
