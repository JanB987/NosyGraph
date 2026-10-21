import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";

const api = vi.hoisted(() => ({ modern: false }));
vi.mock("obsidian", () => ({ requireApiVersion: () => api.modern }));
import { loadGraphLocalStorage, parseGraphPropertyId, saveGraphLocalStorage } from "./ObsidianCompatibility";

describe("Obsidian minimum-version compatibility", () => {
  const values = new Map<string, string>();
  const modernValues = new Map<string, string>();
  function app(root: string): App {
    return {
      vault: { adapter: { getResourcePath: () => root } },
      loadLocalStorage: vi.fn((key: string) => modernValues.get(key) ?? null),
      saveLocalStorage: vi.fn((key: string, value: string) => { modernValues.set(key, value); })
    } as unknown as App;
  }
  beforeEach(() => {
    api.modern = false;
    values.clear();
    modernValues.clear();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); }
    } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("persists on older hosts without calling newer APIs", () => {
    const host = app("app://vault-a/");
    saveGraphLocalStorage(host, "config", '{"zoom":2}');
    expect(loadGraphLocalStorage(host, "config")).toBe('{"zoom":2}');
    expect(host.loadLocalStorage).not.toHaveBeenCalled();
    expect(host.saveLocalStorage).not.toHaveBeenCalled();
  });

  it("isolates fallback storage by vault resource root", () => {
    saveGraphLocalStorage(app("app://vault-a/"), "config", "A");
    saveGraphLocalStorage(app("app://vault-b/"), "config", "B");
    expect(loadGraphLocalStorage(app("app://vault-a/"), "config")).toBe("A");
    expect(loadGraphLocalStorage(app("app://vault-b/"), "config")).toBe("B");
  });

  it("retains existing modern storage and migrates fallback data after an upgrade", () => {
    const host = app("app://vault-a/");
    saveGraphLocalStorage(host, "config", "legacy");
    api.modern = true;
    expect(loadGraphLocalStorage(host, "config")).toBe("legacy");
    expect(host.saveLocalStorage).toHaveBeenCalledWith("config", "legacy");
    saveGraphLocalStorage(host, "config", "current");
    expect(loadGraphLocalStorage(host, "config")).toBe("current");
  });

  it.each(["note.status", "file.name", "formula.display.name"])("parses %s without the newer Bases API", (key) => {
    const separator = key.indexOf(".");
    expect(parseGraphPropertyId(key)).toEqual({ type: key.slice(0, separator), name: key.slice(separator + 1) });
  });

  it.each(["", "status", "unknown.status", "note."])("rejects invalid property ID %s", (key) => {
    expect(parseGraphPropertyId(key)).toBeNull();
  });
});
