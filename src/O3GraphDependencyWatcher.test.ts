import { describe, expect, it } from "vitest";
import type { TFile } from "obsidian";
import { O3GraphDependencyWatcher } from "./O3GraphDependencyWatcher";

function file(path: string): TFile {
  return { path } as unknown as TFile;
}

describe("O3GraphDependencyWatcher", () => {
  it("emits one metadata event for the changed source file", () => {
    const graphFile = file("Graph.md");
    const first = file("A.md");
    const second = file("B.md");
    const metadataCache = {
      getFileCache: () => ({ frontmatter: {} })
    } as never;
    const watcher = new O3GraphDependencyWatcher();

    watcher.updateDependencies({
      graphFile,
      linkTypeFiles: [],
      groupFiles: [],
      nodeFiles: [first, second],
      linkTypeFolder: "",
      watchedProperties: ["related"],
      metadataCache
    });

    expect(watcher.emitGraphEvents(first, metadataCache)).toEqual([
      { type: "NODE_METADATA_CHANGED", path: "A.md" }
    ]);
  });
});
