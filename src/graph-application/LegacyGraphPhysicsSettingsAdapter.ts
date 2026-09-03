import type { LinkTypeId } from "../graph-domain/graph-identifiers";
import type {
  GraphLinkPhysicsPolicySources,
  GraphPhysicsSettingsInput
} from "../graph-domain/GraphPhysicsSettings";

export interface LegacyGraphSimulationSettingsRead {
  repulsionStrength?: number;
  centerStrength?: number;
  nearRestVelocityThreshold?: number;
  restVelocityThreshold?: number;
  nodeRadius?: number;
}

export interface LegacyGraphLinkTypePhysicsRead {
  property: string;
  linkType?: string;
  linkDistance?: number;
  linkForce?: number;
  linkDirection?: string;
  linkXAxis?: number;
  linkYAxis?: number;
}

export interface LegacyGraphPhysicsSettingsReadState {
  simulation: LegacyGraphSimulationSettingsRead;
  activeLinkTypes: readonly LegacyGraphLinkTypePhysicsRead[];
  runtimeOverrides: Readonly<Record<string, {
    preferredDistance?: number;
    strength?: number;
  }>>;
}

/** Converts legacy configuration shapes without importing GraphEngine or Obsidian. */
export class LegacyGraphPhysicsSettingsAdapter {
  constructor(private readonly source: LegacyGraphPhysicsSettingsReadState) {}

  getSettingsInput(): GraphPhysicsSettingsInput {
    const { nodeRadius, ...simulation } = this.source.simulation;
    const linkPolicies = new Map<LinkTypeId, GraphLinkPhysicsPolicySources>();
    const normalizedOverrides = new Map(
      Object.entries(this.source.runtimeOverrides)
        .map(([id, value]) => [normalizeLinkTypeId(id), value] as const)
        .filter(([id]) => id.length > 0)
    );

    for (const linkType of this.source.activeLinkTypes) {
      const id = normalizeLinkTypeId(linkType.property);
      if (!id) continue;
      const directionBased = linkType.linkType === "Direction Based";
      linkPolicies.set(id, {
        activeDefinition: directionBased
          ? {
              mode: "direction",
              direction: linkType.linkDirection,
              xSpacing: linkType.linkXAxis,
              ySpacing: linkType.linkYAxis
            }
          : {
              mode: "force",
              preferredDistance: linkType.linkDistance,
              strength: linkType.linkForce
            },
        runtimeOverride: normalizedOverrides.get(id)
      });
      normalizedOverrides.delete(id);
    }

    for (const [id, runtimeOverride] of normalizedOverrides) {
      linkPolicies.set(id, { runtimeOverride });
    }

    return {
      ...simulation,
      ...(Number.isFinite(nodeRadius)
        ? {
            nodeContainerInfluenceDistance: Math.max(120, Number(nodeRadius) * 16),
            containerContainerInfluenceDistance: Math.max(36, Number(nodeRadius) * 4)
          }
        : {}),
      linkPolicies
    };
  }
}

function normalizeLinkTypeId(value: string): LinkTypeId {
  return String(value ?? "").trim().toLowerCase();
}
