import type { TFile } from "obsidian";
import { describe, expect, it } from "vitest";
import { O3LinkType } from "./O3LinkType";

function file(path: string): TFile {
  const name = path.split("/").pop() ?? path;
  return {
    path,
    name,
    basename: name.replace(/\.md$/i, "")
  } as TFile;
}

describe("O3LinkType baseline characterization", () => {
  it("parses a Force Based definition without changing its link semantics", () => {
    const definition = new O3LinkType(file("LinkTypes/Client.md"), {
      key: "Client",
      property: "client",
      linkType: "Force Based",
      LinkDiscoveryDirection: "outgoing",
      linkForce: 0.03,
      linkDistance: 180
    });

    expect(definition.key).toBe("Client");
    expect(definition.property).toBe("client");
    expect(definition.properties).toEqual(["client"]);
    expect(definition.writeProperty).toBe("client");
    expect(definition.linkType).toBe("Force Based");
    expect(definition.semantic).toBe("link");
    expect(definition.linkDiscoveryDirection).toBe("outgoing");
    expect(definition.linkForce).toBe(0.03);
    expect(definition.linkDistance).toBe(180);
  });

  it("keeps Direction Based layout distinct from relationship discovery direction", () => {
    const definition = new O3LinkType(file("LinkTypes/Children.md"), {
      key: "Children",
      property: "parents",
      linkType: "Direction Based",
      LinkDiscoveryDirection: "incoming",
      linkDirection: "down",
      linkXAxis: 40,
      linkYAxis: 160
    });

    expect(definition.linkType).toBe("Direction Based");
    expect(definition.semantic).toBe("link");
    expect(definition.linkDiscoveryDirection).toBe("incoming");
    expect(definition.linkDirection).toBe("down");
    expect(definition.linkXAxis).toBe(40);
    expect(definition.linkYAxis).toBe(160);
  });

  it("characterizes parent as a semantic mode over the force-layout fallback", () => {
    const definition = new O3LinkType(file("LinkTypes/Parent.md"), {
      key: "Parent",
      property: "parents",
      linkType: "parent"
    });

    expect(definition.semantic).toBe("parent");
    expect(definition.linkType).toBe("Force Based");
  });

  it("reads every configured property and uses the first one as the write target", () => {
    const definition = new O3LinkType(file("LinkTypes/Scope.md"), {
      key: "Scope",
      property: ["Parts", "Deliverables", "parts"],
      properties: ["Milestones", "deliverables"]
    });

    expect(definition.properties).toEqual([
      "parts",
      "deliverables",
      "milestones"
    ]);
    expect(definition.writeProperty).toBe("parts");
    expect(definition.property).toBe("scope");
  });

  it("documents that lens is not a distinct runtime mode before Iteration 2", () => {
    const definition = new O3LinkType(file("LinkTypes/Scope lens.md"), {
      key: "Scope lens",
      property: ["parts", "deliverables"],
      linkType: "lens"
    });

    expect(definition.linkType).toBe("Force Based");
    expect(definition.semantic).toBe("link");
    expect(definition.properties).toEqual(["parts", "deliverables"]);
    expect(definition.writeProperty).toBe("parts");
  });
});
