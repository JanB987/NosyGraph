import type { LinkTypeId } from "./graph-identifiers";

export type GraphDirectionPlacement = "right" | "left" | "up" | "down";

export interface GraphForceLinkPolicy {
  mode: "force";
  preferredDistance: number;
  strength: number;
}

export interface GraphDirectionLinkPolicy {
  mode: "direction";
  direction: GraphDirectionPlacement;
  xSpacing: number;
  ySpacing: number;
}

export type GraphLinkPhysicsPolicy =
  | GraphForceLinkPolicy
  | GraphDirectionLinkPolicy;

export interface GraphLinkPhysicsDefinitionInput {
  mode?: "force" | "direction";
  preferredDistance?: number;
  strength?: number;
  direction?: string;
  xSpacing?: number;
  ySpacing?: number;
}

export interface GraphForceLinkPolicyInput {
  preferredDistance?: number;
  strength?: number;
}

export interface GraphLinkPhysicsPolicySources {
  activeDefinition?: GraphLinkPhysicsDefinitionInput;
  runtimeOverride?: GraphForceLinkPolicyInput;
}

export interface GraphPhysicsSettingsInput {
  repulsionStrength?: number;
  centerStrength?: number;
  nearRestVelocityThreshold?: number;
  restVelocityThreshold?: number;
  defaultLinkDistance?: number;
  defaultLinkStrength?: number;
  nodeContainerInfluenceDistance?: number;
  containerContainerInfluenceDistance?: number;
  linkPolicies?: ReadonlyMap<LinkTypeId, GraphLinkPhysicsPolicySources>;
}

/** Complete settings consumed by a host-neutral physics implementation. */
export interface GraphPhysicsSettings {
  repulsionStrength: number;
  centerStrength: number;
  damping: number;
  nearRestVelocityThreshold: number;
  restVelocityThreshold: number;
  settleFrameCount: number;
  activeFrameIntervalMs: number;
  nearSettleFrameIntervalMs: number;
  nodeContainerInfluenceDistance: number;
  containerContainerInfluenceDistance: number;
  defaultLinkPolicy: GraphForceLinkPolicy;
  linkPolicies: ReadonlyMap<LinkTypeId, GraphLinkPhysicsPolicy>;
}

export const DEFAULT_GRAPH_REPULSION_STRENGTH = 4000;
export const DEFAULT_GRAPH_CENTER_STRENGTH = 0;
export const DEFAULT_GRAPH_DAMPING = 0.85;
export const DEFAULT_GRAPH_REST_VELOCITY_THRESHOLD = 0.015;
export const DEFAULT_GRAPH_NEAR_REST_VELOCITY_THRESHOLD = 0.08;
export const DEFAULT_GRAPH_SETTLE_FRAME_COUNT = 24;
export const DEFAULT_GRAPH_ACTIVE_FRAME_INTERVAL_MS = 16;
export const DEFAULT_GRAPH_NEAR_SETTLE_FRAME_INTERVAL_MS = 50;
export const DEFAULT_GRAPH_LINK_DISTANCE = 120;
export const DEFAULT_GRAPH_LINK_STRENGTH = 0.01;
export const DEFAULT_NODE_CONTAINER_INFLUENCE_DISTANCE = 120;
export const DEFAULT_CONTAINER_CONTAINER_INFLUENCE_DISTANCE = 36;

/** Normalizes global settings and resolves every LinkType policy deterministically. */
export function normalizeGraphPhysicsSettings(
  input: GraphPhysicsSettingsInput = {}
): GraphPhysicsSettings {
  const restVelocityThreshold = Math.max(
    0,
    finiteOr(input.restVelocityThreshold, DEFAULT_GRAPH_REST_VELOCITY_THRESHOLD)
  );
  const nearRestVelocityThreshold = Math.max(
    restVelocityThreshold,
    Math.max(
      0,
      finiteOr(
        input.nearRestVelocityThreshold,
        DEFAULT_GRAPH_NEAR_REST_VELOCITY_THRESHOLD
      )
    )
  );
  const defaultLinkPolicy = normalizeForceLinkPolicy({
    preferredDistance: input.defaultLinkDistance,
    strength: input.defaultLinkStrength
  });
  const linkPolicies = new Map<LinkTypeId, GraphLinkPhysicsPolicy>();
  for (const [linkTypeId, sources] of input.linkPolicies ?? []) {
    linkPolicies.set(
      linkTypeId,
      resolveGraphLinkPhysicsPolicy(sources, defaultLinkPolicy)
    );
  }

  return {
    repulsionStrength: finiteOr(
      input.repulsionStrength,
      DEFAULT_GRAPH_REPULSION_STRENGTH
    ),
    centerStrength: finiteOr(input.centerStrength, DEFAULT_GRAPH_CENTER_STRENGTH),
    damping: DEFAULT_GRAPH_DAMPING,
    nearRestVelocityThreshold,
    restVelocityThreshold,
    settleFrameCount: DEFAULT_GRAPH_SETTLE_FRAME_COUNT,
    activeFrameIntervalMs: DEFAULT_GRAPH_ACTIVE_FRAME_INTERVAL_MS,
    nearSettleFrameIntervalMs: DEFAULT_GRAPH_NEAR_SETTLE_FRAME_INTERVAL_MS,
    nodeContainerInfluenceDistance: Math.max(DEFAULT_NODE_CONTAINER_INFLUENCE_DISTANCE, finiteOr(
      input.nodeContainerInfluenceDistance,
      DEFAULT_NODE_CONTAINER_INFLUENCE_DISTANCE
    )),
    containerContainerInfluenceDistance: Math.max(DEFAULT_CONTAINER_CONTAINER_INFLUENCE_DISTANCE, finiteOr(
      input.containerContainerInfluenceDistance,
      DEFAULT_CONTAINER_CONTAINER_INFLUENCE_DISTANCE
    )),
    defaultLinkPolicy,
    linkPolicies
  };
}

/** Preserves legacy precedence: active definition, runtime override, then defaults. */
export function resolveGraphLinkPhysicsPolicy(
  sources: GraphLinkPhysicsPolicySources = {},
  defaultPolicy: GraphForceLinkPolicy = normalizeForceLinkPolicy()
): GraphLinkPhysicsPolicy {
  const definition = sources.activeDefinition;
  if (definition?.mode === "direction") {
    return {
      mode: "direction",
      direction: normalizeDirection(definition.direction),
      xSpacing: normalizeDirectionSpacing(definition.xSpacing),
      ySpacing: normalizeDirectionSpacing(definition.ySpacing)
    };
  }

  return normalizeForceLinkPolicy({
    preferredDistance: firstFinite(
      definition?.preferredDistance,
      sources.runtimeOverride?.preferredDistance,
      defaultPolicy.preferredDistance
    ),
    strength: firstFinite(
      definition?.strength,
      sources.runtimeOverride?.strength,
      defaultPolicy.strength
    )
  });
}

function normalizeForceLinkPolicy(
  input: GraphForceLinkPolicyInput = {}
): GraphForceLinkPolicy {
  return {
    mode: "force",
    preferredDistance: clamp(
      finiteOr(input.preferredDistance, DEFAULT_GRAPH_LINK_DISTANCE),
      20,
      800
    ),
    strength: clamp(
      finiteOr(input.strength, DEFAULT_GRAPH_LINK_STRENGTH),
      0.001,
      0.3
    )
  };
}

function normalizeDirection(value: string | undefined): GraphDirectionPlacement {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "left" || normalized === "up" || normalized === "down"
    ? normalized
    : "right";
}

function normalizeDirectionSpacing(value: number | undefined): number {
  if (!Number.isFinite(value)) return 120;
  return Math.max(1, Math.abs(Number(value)) || 120);
}

function firstFinite(...values: Array<number | undefined>): number | undefined {
  return values.find((value) => Number.isFinite(value));
}

function finiteOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
