import { expect, it, vi } from "vitest";

const { notice } = vi.hoisted(() => ({ notice: vi.fn() }));
vi.mock("obsidian", () => ({
  FileView: class {}, Modal: class {}, Component: class {},
  TFile: class {}, TFolder: class {}, Menu: class {},
  Notice: class { constructor(message: string) { notice(message); } }
}));

import { BasesGraphView } from "./GraphView";

it("shows the unsupported-filter diagnostic instead of a zero-match notice", () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const message = 'Unsupported or invalid Base filter in "Filters/graph.base": unsupportedFunction()';
    const view = Object.assign(Object.create(BasesGraphView.prototype), {
      connectedBaseFilterResult: {
        baseFiles: [{ path: "Filters/graph.base" }], files: [], filterId: "Filters/graph.base#Test",
        results: [{
          status: "filter-unsupported", source: "base-yaml", files: [],
          baseFile: { path: "Filters/graph.base" }, filterId: "Filters/graph.base#Test",
          viewName: "Test", message
        }]
      },
      lastConnectedBaseFilterMessage: null
    });
    view.reportConnectedBaseFilterResult("[[Filters/graph.base#Test]]");
    view.reportConnectedBaseFilterResult("[[Filters/graph.base#Test]]");
    expect(notice).toHaveBeenCalledExactlyOnceWith(message);
    expect(warning).toHaveBeenCalledTimes(1);
  } finally {
    warning.mockRestore();
  }
});

it("identifies the failing connection while retaining another view's nodes", () => {
  notice.mockClear();
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const files = [{ path: "A.md" }];
    const view = Object.assign(Object.create(BasesGraphView.prototype), {
      connectedBaseFilterResult: {
        files, baseFiles: [{ path: "Good.base" }], filterId: "Good.base#View + Missing.base#View",
        results: [
          { files, status: "resolved", filterId: "Good.base#View" },
          { files: [], status: "base-unresolved", filterId: "Missing.base#View", message: "Base file could not be resolved." }
        ]
      },
      lastConnectedBaseFilterMessage: null
    });
    view.reportConnectedBaseFilterResult(["[[Good.base#View]]", "[[Missing.base#View]]"]);
    expect(notice).toHaveBeenCalledExactlyOnceWith("Missing.base#View: Base file could not be resolved.");
    expect(view.connectedBaseFilterResult.files).toEqual(files);
  } finally {
    warning.mockRestore();
  }
});
