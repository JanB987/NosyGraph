/// <reference types="node" />

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ARCHITECTURE_AUDIT, getArchitectureAuditBlockers } from "./ArchitectureAudit";
import { GraphKinematicsStore } from "./GraphKinematicsStore";
import { GraphPhysicsCoordinator } from "./GraphPhysicsCoordinator";
import type { GraphPhysicsEngine } from "./GraphPhysicsEngine";
import type { GraphPhysicsRuntimeInput } from "../graph-domain/GraphPhysicsRuntimeInput";

const root = resolve(process.cwd());
const sourcePath = (...parts: string[]) => resolve(root, ...parts);
function readSource(path: string): string { return readFileSync(sourcePath(path), "utf8"); }
function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(sourcePath(directory), { withFileTypes: true }).flatMap((entry) => {
    const path = entry.name;
    if (entry.isDirectory()) return listTypeScriptFiles(directory + "/" + path);
    return path.endsWith(".ts") ? [directory + "/" + path] : [];
  });
}

describe("architecture audit", () => {
  it("records each required boundary and keeps incomplete cutover visible", () => {
    expect(ARCHITECTURE_AUDIT.map((entry) => entry.id)).toEqual([
      "graph-view-orchestration", "graph-controller-boundary", "replaceable-physics",
      "host-neutral-domain", "documentation-alignment"
    ]);
    expect(getArchitectureAuditBlockers().map((entry) => entry.id)).toEqual([
      "graph-view-orchestration", "replaceable-physics"
    ]);
  });

  it("guards the domain against host and live-engine dependencies", () => {
const forbidden = ["obsidian", "GraphEngine", "HTMLElement", "HTMLCanvasElement", "CanvasRenderingContext2D"];
    const offenders = listTypeScriptFiles("src/graph-domain").filter((path) => forbidden.some((marker) => readSource(path).includes(marker)));
    expect(offenders).toEqual([]);
  });

  it("keeps GraphController free of host and legacy-engine imports", () => {
    const imports = readSource("src/graph-application/GraphController.ts").split(/\r?\n/).filter((line) => line.trimStart().startsWith("import"));
    expect(imports.some((line) => line.includes('from "obsidian"') || line.includes("from 'obsidian'"))).toBe(false);
    expect(imports.some((line) => line.includes("GraphView") || line.includes("GraphEngine"))).toBe(false);
    expect(imports.some((line) => line.includes("HTMLElement") || line.includes("HTMLCanvasElement") || line.includes("TFile"))).toBe(false);
  });

  it("keeps the live composition claim explicit", () => {
    expect(readSource("src/GraphView.ts")).toContain("new GraphEngine(");
    expect(readSource("docs/architecture/GraphView.md")).toContain("still constructs");
    expect(readSource("docs/architecture/GraphController.md")).toContain("not yet the live GraphView orchestrator");
  });

  it("proves physics can be replaced behind the coordinator port", () => {
    class ProbePhysics implements GraphPhysicsEngine {
      private input?: GraphPhysicsRuntimeInput;
      setInput(input: GraphPhysicsRuntimeInput): void { this.input = input; }
      getStatus(): "stopped" | "running" | "frozen" { return this.input ? "running" : "stopped"; }
      start(): void {} reheat(): void {} freeze(): void {} resume(): void {} stop(): void {}
      step(): ReturnType<GraphPhysicsEngine["step"]> {
        return { structuralRevision: this.input?.graph.structuralRevision ?? 0, positions: new Map(), velocities: new Map() };
      }
      setNodePosition(): boolean { return false; }
    }
    const kinematics = new GraphKinematicsStore({ structuralRevision: 4, positions: new Map(), velocities: new Map() });
    const coordinator = new GraphPhysicsCoordinator(new ProbePhysics(), kinematics);
    const input = {
      graph: { structuralRevision: 4, frameSequence: 0, nodes: [], edges: [] },
      settings: { enabled: true, linkDistance: 100, linkStrength: 1, repulsionStrength: 1, centerStrength: 1, collisionRadius: 1, velocityDecay: 0.9, alphaDecay: 0.02, alphaMin: 0.001 },
      constraints: { pinned: [], transient: [], simulationFrozen: false }, containers: { containers: [] }, frameSequence: 0
    } as unknown as GraphPhysicsRuntimeInput;
    coordinator.setInput(input);
    expect(coordinator.step(1)).toEqual({ applied: true, sequence: 1 });
  });
});
