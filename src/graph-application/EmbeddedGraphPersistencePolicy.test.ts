import { describe, expect, it } from "vitest";
import { shouldPersistEmbeddedGraphRuntime } from "./EmbeddedGraphPersistencePolicy";

describe("shouldPersistEmbeddedGraphRuntime", () => {
  it("persists formal embedded graph notes", () => {
    expect(shouldPersistEmbeddedGraphRuntime({
      ownerIsPersistentGraphNote: true,
      ownerHasReadableGraphState: false,
      parentIsPersistentGraphNote: false,
    })).toBe(true);
  });

  it("persists an embedded graph note with an existing state block", () => {
    expect(shouldPersistEmbeddedGraphRuntime({
      ownerIsPersistentGraphNote: false,
      ownerHasReadableGraphState: true,
      parentIsPersistentGraphNote: false,
    })).toBe(true);
  });

  it("initializes state for a graph-capable lens used by a persistent parent", () => {
    expect(shouldPersistEmbeddedGraphRuntime({
      ownerIsPersistentGraphNote: false,
      ownerHasReadableGraphState: false,
      parentIsPersistentGraphNote: true,
    })).toBe(true);
  });

  it("keeps an ordinary lens in an ephemeral parent ephemeral", () => {
    expect(shouldPersistEmbeddedGraphRuntime({
      ownerIsPersistentGraphNote: false,
      ownerHasReadableGraphState: false,
      parentIsPersistentGraphNote: false,
    })).toBe(false);
  });
});
