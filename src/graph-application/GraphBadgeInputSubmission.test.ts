import { describe, expect, it, vi } from "vitest";
import { submitGraphBadgeInput } from "./GraphBadgeInputSubmission";
import { normalizeBadgeMembershipPreference } from "./BadgeMembershipPreference";
import type { GraphBadgeMembershipResult } from "./GraphLinkMutation";

describe("badge input submissions", () => {
  it("defaults to On and preserves saved boolean Off", () => {
    expect([undefined, null, "false", 0, true, false].map(normalizeBadgeMembershipPreference)).toEqual([
      true, true, true, true, true, false
    ]);
  });

  it("includes primary additions and existing relationships but excludes unsuccessful incoming notes", async () => {
    const entries = ["A.md", "B.md", "C.md", "D.md"].map((path) => ({ path, file: path, relationshipComplete: false }));
    const destination = { ownerPath: "Project.md", property: "Members", referencePath: "Parent.md" };
    const addRelationships = vi.fn(async () => ({
      added: ["A.md"], alreadyPresent: ["B.md"], removed: [], skipped: ["D.md"],
      failed: [{ path: "C.md", filePath: "C.md", reason: "Denied" }], changedFilePaths: ["A.md"]
    }));
    const onRelationshipsChanged = vi.fn();
    const onMembershipChanged = vi.fn();
    const addMembership = vi.fn(async (): Promise<GraphBadgeMembershipResult> => ({
      destination, items: [{ path: "A.md", status: "added" }, { path: "B.md", status: "already-present" }],
      changedFilePaths: [destination.ownerPath]
    }));
    const ports = { isCurrent: () => true, addRelationships, addMembership, onRelationshipsChanged, onMembershipChanged };
    const result = await submitGraphBadgeInput(entries, "clipboard-batch", { kind: "destination", destination }, ports);
    expect(result.added).toEqual(["A.md"]);
    expect(result.membership?.changedFilePaths).toEqual([destination.ownerPath]);
    expect(addMembership).toHaveBeenCalledExactlyOnceWith(destination, entries.slice(0, 2));
    expect(onRelationshipsChanged).toHaveBeenCalledOnce();
    expect(onMembershipChanged).toHaveBeenCalledOnce();
    addRelationships.mockClear();
    addMembership.mockClear();
    await submitGraphBadgeInput([{ ...entries[0], relationshipComplete: true }], "clipboard-batch", { kind: "off" }, ports);
    expect(addRelationships).not.toHaveBeenCalled();
    expect(addMembership).not.toHaveBeenCalled();
  });
});
