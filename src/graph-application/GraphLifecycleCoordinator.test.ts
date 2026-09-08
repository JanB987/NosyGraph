import { describe, expect, it, vi } from "vitest";
import type { GraphHostEvent, GraphHostEventSource } from "./ObsidianGraphWatcher";
import { GraphLifecycleCoordinator } from "./GraphLifecycleCoordinator";

function source() {
  let listener: ((event: GraphHostEvent) => void) | undefined;
  let subscriptions = 0;
  let unsubscriptions = 0;
  const value: GraphHostEventSource & {
    emit(event: GraphHostEvent): void;
    getSubscriptions(): number;
    getUnsubscriptions(): number;
  } = {
    subscribe(next) {
      listener = next;
      subscriptions += 1;
      return () => {
        listener = undefined;
        unsubscriptions += 1;
      };
    },
    emit(event) {
      listener?.(event);
    },
    getSubscriptions: () => subscriptions,
    getUnsubscriptions: () => unsubscriptions
  };
  return value;
}

describe("GraphLifecycleCoordinator", () => {
  it("drops stale async results and aborts work on close and reopen", async () => {
    const coordinator = new GraphLifecycleCoordinator();
    coordinator.open("A.md");
    let resolveWork!: (value: string) => void;
    let signal!: AbortSignal;
    const pending = coordinator.run("A.md", async (nextSignal) => {
      signal = nextSignal;
      return await new Promise<string>((resolve) => { resolveWork = resolve; });
    });

    coordinator.reopen("B.md");
    expect(signal.aborted).toBe(true);
    resolveWork("stale");
    await expect(pending).resolves.toBeUndefined();

    coordinator.open("B.md");
    const current = await coordinator.run("B.md", async () => "current");
    expect(current).toBe("current");
  });

  it("runs only the latest scheduled work and releases timers on close", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const coordinator = new GraphLifecycleCoordinator();
    coordinator.open("A.md");
    coordinator.schedule("hydrate", "A.md", 100, () => { calls.push("first"); });
    coordinator.schedule("hydrate", "A.md", 100, () => { calls.push("second"); });
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toEqual(["second"]);

    coordinator.schedule("hydrate", "A.md", 100, () => { calls.push("closed"); });
    coordinator.close();
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toEqual(["second"]);
    vi.useRealTimers();
  });

  it("retargets live work across rename and closes on deletion", () => {
    const fake = source();
    const events: GraphHostEvent[] = [];
    const coordinator = new GraphLifecycleCoordinator();
    coordinator.open("A.md");
    const stop = coordinator.watch(fake, (event) => events.push(event));
    expect(fake.getSubscriptions()).toBe(1);

    fake.emit({ type: "note-renamed", path: "Folder/A.md", oldPath: "A.md" });
    expect(coordinator.getActivePath()).toBe("Folder/A.md");
    expect(coordinator.isOpen()).toBe(true);
    expect(events).toHaveLength(1);

    fake.emit({ type: "note-deleted", path: "Folder/A.md" });
    expect(events).toHaveLength(2);
    expect(coordinator.isOpen()).toBe(false);
    expect(fake.getUnsubscriptions()).toBe(1);

    stop();
    expect(fake.getUnsubscriptions()).toBe(1);
  });

  it("filters self-write events for the suppression window and accepts later host changes", () => {
    let clock = 1000;
    const fake = source();
    const events: GraphHostEvent[] = [];
    const coordinator = new GraphLifecycleCoordinator({ now: () => clock });
    coordinator.open("A.md");
    coordinator.watch(fake, (event) => events.push(event));
    coordinator.suppressWrite("A.md", 500);
    fake.emit({ type: "note-changed", path: "A.md" });
    fake.emit({ type: "note-created", path: "A.md" });
    expect(events).toEqual([]);
    clock = 1500;
    fake.emit({ type: "note-changed", path: "A.md" });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("note-changed");
  });

  it("cleans up subscriptions and pending work on explicit close", () => {
    const fake = source();
    const coordinator = new GraphLifecycleCoordinator();
    coordinator.open("A.md");
    coordinator.watch(fake, () => {});
    coordinator.close();
    expect(coordinator.isOpen()).toBe(false);
    expect(coordinator.getActivePath()).toBeNull();
    expect(fake.getUnsubscriptions()).toBe(1);
    expect(coordinator.getGeneration()).toBe(2);
  });
});

  it("invalidates pending reads when metadata changes", async () => {
    const fake = source();
    const coordinator = new GraphLifecycleCoordinator();
    coordinator.open("A.md");
    coordinator.watch(fake, () => {});
    let resolveWork!: (value: string) => void;
    let signal!: AbortSignal;
    const pending = coordinator.run("A.md", async (nextSignal) => {
      signal = nextSignal;
      return await new Promise<string>((resolve) => { resolveWork = resolve; });
    });
    fake.emit({ type: "note-changed", path: "B.md" });
    expect(signal.aborted).toBe(true);
    resolveWork("stale");
    await expect(pending).resolves.toBeUndefined();
  });

  it("re-subscribes on reopen and accepts work only for the reopened path", () => {
    const fake = source();
    const events: GraphHostEvent[] = [];
    const coordinator = new GraphLifecycleCoordinator();
    const stop = coordinator.watch(fake, (event) => events.push(event));
    coordinator.open("A.md");
    expect(fake.getSubscriptions()).toBe(1);
    coordinator.close();
    expect(fake.getUnsubscriptions()).toBe(1);
    coordinator.reopen("B.md");
    expect(fake.getSubscriptions()).toBe(2);
    fake.emit({ type: "note-changed", path: "B.md" });
    expect(events).toHaveLength(1);
    stop();
    expect(fake.getUnsubscriptions()).toBe(2);
  });

  it("marks self-writes before awaiting storage and returns the committed result", async () => {
    const fake = source();
    const events: GraphHostEvent[] = [];
    const coordinator = new GraphLifecycleCoordinator();
    coordinator.open("A.md");
    coordinator.watch(fake, (event) => events.push(event));
    const result = await coordinator.runWrite("A.md", async () => {
      fake.emit({ type: "note-changed", path: "A.md" });
      return "saved";
    });
    expect(result).toBe("saved");
    expect(events).toEqual([]);
    expect(coordinator.isWriteSuppressed("A.md")).toBe(true);
  });
