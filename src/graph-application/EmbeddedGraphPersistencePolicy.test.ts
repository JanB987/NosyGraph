import { describe, expect, it } from "vitest";
import {
  resolveEmbeddedGraphPersistenceOwner,
  shouldPersistEmbeddedGraphRuntime,
} from "./EmbeddedGraphPersistencePolicy";

describe("shouldPersistEmbeddedGraphRuntime", () => {
  it("persists formal embedded graph notes", () => {
    expect(shouldPersistEmbeddedGraphRuntime({
      ownerIsPersistentGraphNote: true,
      ownerHasReadableGraphState: false,
      parentIsPersistentGraphNote: false,
    })).toBe(true);
  });

  it("does not write a retained state block without the graph-note identifier", () => {
    expect(shouldPersistEmbeddedGraphRuntime({
      ownerIsPersistentGraphNote: false,
      ownerHasReadableGraphState: true,
      parentIsPersistentGraphNote: false,
    })).toBe(false);
  });

  it("does not let a persistent parent authorize writes into a graph-capable lens target", () => {
    expect(shouldPersistEmbeddedGraphRuntime({
      ownerIsPersistentGraphNote: false,
      ownerHasReadableGraphState: false,
      parentIsPersistentGraphNote: true,
    })).toBe(false);
  });

  it("keeps an ordinary lens in an ephemeral parent ephemeral", () => {
    expect(shouldPersistEmbeddedGraphRuntime({
      ownerIsPersistentGraphNote: false,
      ownerHasReadableGraphState: false,
      parentIsPersistentGraphNote: false,
    })).toBe(false);
  });
});

describe("resolveEmbeddedGraphPersistenceOwner", () => {
  it("keeps a graph-capable Lens target owned by the original graph note", () => {
    expect(resolveEmbeddedGraphPersistenceOwner({
      targetPath: "Graph capable.md",
      targetIsPersistentGraphNote: false,
      parentOwnerPath: "Original graph.md",
    })).toBe("Original graph.md");
  });

  it("lets an explicitly identified graph note own its embedded runtime", () => {
    expect(resolveEmbeddedGraphPersistenceOwner({
      targetPath: "Promoted graph.md",
      targetIsPersistentGraphNote: true,
      parentOwnerPath: "Original graph.md",
    })).toBe("Promoted graph.md");
  });

  it("keeps an ephemeral Lens without a persistence owner", () => {
    expect(resolveEmbeddedGraphPersistenceOwner({
      targetPath: "Graph capable.md",
      targetIsPersistentGraphNote: false,
    })).toBeNull();
  });
});
