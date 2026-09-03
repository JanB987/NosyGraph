import type {
  GraphPhysicsContainer,
  GraphPhysicsContainerState
} from "../graph-domain/GraphPhysicsContainers";

export interface LegacyGraphPhysicsContainerRead {
  key: string;
  kind: "parent" | "embedded";
  originNodeId: string;
  memberNodeIds: readonly string[];
  left: number;
  top: number;
  right: number;
  bottom: number;
  linkForce?: number;
}

/** Converts legacy container records and derives nesting through origin membership. */
export class LegacyGraphPhysicsContainerAdapter {
  constructor(private readonly source: readonly LegacyGraphPhysicsContainerRead[]) {}

  getContainerCandidates(): GraphPhysicsContainerState {
    const normalized: GraphPhysicsContainer[] = this.source.map((container) => {
      const base = {
        id: String(container.key ?? "").trim(),
        originNodeId: String(container.originNodeId ?? "").trim(),
        memberNodeIds: container.memberNodeIds.map((id) => String(id ?? "").trim()),
        bounds: {
          left: Number(container.left),
          top: Number(container.top),
          right: Number(container.right),
          bottom: Number(container.bottom)
        },
        parentContainerIds: []
      };
      return container.kind === "embedded"
        ? { ...base, kind: "embedded", gravityStrength: Number(container.linkForce) }
        : { ...base, kind: "parent" };
    });

    return {
      containers: normalized.map((container) => {
        const parentContainerIds = normalized
          .filter((candidate) => candidate.id !== container.id)
          .filter((candidate) => candidate.memberNodeIds.includes(container.originNodeId))
          .map((candidate) => candidate.id);
        return { ...container, parentContainerIds };
      })
    };
  }
}
