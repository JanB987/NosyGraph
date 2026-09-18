import { describe, expect, it } from "vitest";
import { ObsidianGraphWatcher, type GraphHostEvent } from "./ObsidianGraphWatcher";

function host() {
  const handlers = new Map<string, (...args: any[]) => void>();
  const options = {
    onCreate: (handler: (path: string) => void) => register("create", handler),
    onChange: (handler: (path: string) => void) => register("change", handler),
    onRename: (handler: (path: string, oldPath: string) => void) => register("rename", handler),
    onDelete: (handler: (path: string) => void) => register("delete", handler),
    onActiveNoteChange: (handler: (path: string | null) => void) => register("active", handler)
  };
  function register(name: string, handler: (...args: any[]) => void) {
    handlers.set(name, handler);
    return () => handlers.delete(name);
  }
  return { handlers, options };
}

describe("ObsidianGraphWatcher", () => {
  it("normalizes host events and unsubscribes cleanly", () => {
    const fake = host();
    const watcher = new ObsidianGraphWatcher(fake.options);
    const events: GraphHostEvent[] = [];
    const unsubscribe = watcher.subscribe((event) => events.push(event));
    fake.handlers.get("create")?.(" Folder\\A.md ");
    fake.handlers.get("change")?.("B.md");
    fake.handlers.get("rename")?.("C.md", "old.md");
    fake.handlers.get("delete")?.("D.md");
    fake.handlers.get("active")?.(" ");
    expect(events).toEqual([
      { type: "note-created", path: "Folder/A.md" },
      { type: "note-changed", path: "B.md" },
      { type: "note-renamed", path: "C.md", oldPath: "old.md" },
      { type: "note-deleted", path: "D.md" },
      { type: "active-note-changed", path: null }
    ]);
    unsubscribe();
    fake.handlers.get("create")?.("E.md");
    expect(events).toHaveLength(5);
  });

  it("registers host handlers only while subscribed", () => {
    const fake = host();
    const watcher = new ObsidianGraphWatcher(fake.options);
    const unsubscribe = watcher.subscribe(() => {});
    expect(fake.handlers.size).toBe(5);
    unsubscribe();
    expect(fake.handlers.size).toBe(0);
  });
});
