import { describe, expect, it } from "vitest";
import { TemplaterBatchService } from "./TemplaterBatchService";

describe("TemplaterBatchService", () => {
  it("executes every captured runtime node instance in order", async () => {
    const calls: string[] = [];
    const targets = [
      { nodeId: "instance-1", path: "Notes/A.md" },
      { nodeId: "instance-2", path: "Notes/A.md" },
      { nodeId: "instance-3", path: "Notes/B.md" }
    ];
    const result = await new TemplaterBatchService().execute(targets, async (target) => {
      calls.push(target.nodeId);
    });

    expect(calls).toEqual(["instance-1", "instance-2", "instance-3"]);
    expect(result.succeeded.map((target) => target.nodeId)).toEqual(calls);
    expect(result.failed).toBeUndefined();
  });

  it("stops at the first failure and reports the failed target", async () => {
    const calls: string[] = [];
    const targets = [
      { nodeId: "first", path: "Notes/A.md" },
      { nodeId: "second", path: "Notes/B.md" },
      { nodeId: "third", path: "Notes/C.md" }
    ];
    const result = await new TemplaterBatchService().execute(targets, async (target) => {
      calls.push(target.nodeId);
      if (target.nodeId === "second") throw new Error("template failed");
    });

    expect(calls).toEqual(["first", "second"]);
    expect(result.succeeded.map((target) => target.nodeId)).toEqual(["first"]);
    expect(result.failed?.target.nodeId).toBe("second");
    expect(result.failed?.error).toEqual(new Error("template failed"));
  });
});
