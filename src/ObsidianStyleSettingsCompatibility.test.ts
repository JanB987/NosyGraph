import { describe, expect, it, vi } from "vitest";
import type { WorkspaceLeaf } from "obsidian";

vi.mock("obsidian", () => ({ requireApiVersion: vi.fn() }));

import { requestStyleSettingsReparse } from "./ObsidianCompatibility";

describe("Style Settings reparse", () => {
  it("waits while a restored Style Settings leaf exposes a deferred view", () => {
    const leaves = [{ view: {} }] as unknown as WorkspaceLeaf[];
    const workspace = { getLeavesOfType: vi.fn(() => leaves), trigger: vi.fn() };
    requestStyleSettingsReparse(workspace);
    expect(workspace.getLeavesOfType).toHaveBeenCalledWith("style-settings");
    expect(workspace.trigger).not.toHaveBeenCalled();

    leaves[0] = { view: { setSettings: vi.fn() } } as unknown as WorkspaceLeaf;
    requestStyleSettingsReparse(workspace);
    expect(workspace.trigger).toHaveBeenCalledExactlyOnceWith("parse-style-settings");
  });

  it("requests a reparse when Style Settings has no open view", () => {
    const workspace = { getLeavesOfType: vi.fn(() => []), trigger: vi.fn() };
    requestStyleSettingsReparse(workspace);
    expect(workspace.trigger).toHaveBeenCalledExactlyOnceWith("parse-style-settings");
  });
});
