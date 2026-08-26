/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion */
import type {
  ExpandedNodeState,
  GraphSettings,
  GraphViewState,
  GroupingRule,
  LinkTypeConfigEntry
} from "./GraphState";

export type LegacyGroupingRule = {
  property: string;
  operator: "equals" | "contains" | "exists";
  value?: string;
  color: string;
};

type LegacyFlatExpandedParent = {
  origin?: unknown;
  linkType?: unknown;
  isVisible?: unknown;
};

type LegacyLinkTypePhysics = {
  preferredDistance?: unknown;
  strength?: unknown;
};

type LegacyRawState = Record<string, unknown> & {
  version?: unknown;
  rootNodes?: unknown;
  activeLinkTypes?: unknown;
  linkTypeFilter?: unknown;
  selectedLinkTypes?: unknown;
  linkTypeConfig?: unknown;
  linkTypeSemantics?: unknown;
  linkTypePhysics?: unknown;
  expandedParents?: unknown;
  groupingRules?: unknown;
  graphSettings?: unknown;
  layoutId?: unknown;
};

export class StateManager {
  static CURRENT_VERSION = 1;

  static createDefaultState(): GraphViewState {
    return {
      version: StateManager.CURRENT_VERSION,
      rootNodes: [],
      activeLinkTypes: [],
      linkTypeConfig: {},
      expandedParents: [],
      groupingRules: [],
      graphSettings: {
        repulsionStrength: 500,
        centerStrength: 0,
        nodeRadius: 20,
        nodeConnectionSizeMultiplier: 1,
        nearRestVelocityThreshold: 0.08,
        restVelocityThreshold: 0.015,
        textFadeThreshold: 97,
        layoutId: "force",
        hideNodesWithoutSelectedLinkTypes: false
      }
    };
  }

  static cloneState(raw: any): GraphViewState {
    const base = StateManager.createDefaultState();
    const source: LegacyRawState = (raw && typeof raw === "object")
      ? ({ ...(raw as Record<string, unknown>) } as LegacyRawState)
      : {};

    const activeLinkTypes = StateManager.readActiveLinkTypes(source);
    const linkTypeConfig = StateManager.readLinkTypeConfig(source);
    const expandedParents = StateManager.readExpandedParents(source);
    const groupingRules = StateManager.readGroupingRules(source);
    const graphSettings = StateManager.readGraphSettings(source, base.graphSettings);
    const rootNodes = StateManager.readRootNodes(source);

    return {
      version: Number.isFinite(Number(source.version))
        ? Math.max(1, Math.round(Number(source.version)))
        : base.version,
      rootNodes,
      activeLinkTypes,
      linkTypeConfig,
      expandedParents,
      groupingRules,
      graphSettings
    };
  }

  static serializeState(state: Partial<GraphViewState>): GraphViewState {
    const normalized = StateManager.cloneState(state);
    return {
      ...normalized,
      rootNodes: [...normalized.rootNodes],
      activeLinkTypes: [...normalized.activeLinkTypes],
      linkTypeConfig: Object.fromEntries(
        Object.entries(normalized.linkTypeConfig).map(([k, v]) => [k, StateManager.cloneLinkTypeConfigEntry(v)])
      ),
      expandedParents: normalized.expandedParents.map((entry) => ({
        origin: entry.origin,
        linkTypes: { ...entry.linkTypes }
      })),
      groupingRules: normalized.groupingRules.map((rule) => ({ ...rule })),
      graphSettings: { ...normalized.graphSettings }
    };
  }

  private static readRootNodes(source: LegacyRawState): string[] {
    if (!Array.isArray(source.rootNodes)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of source.rootNodes) {
      const value = String(raw ?? "").trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      out.push(value);
    }
    return out;
  }

  private static readActiveLinkTypes(source: LegacyRawState): string[] {
    const raw = Array.isArray(source.activeLinkTypes)
      ? source.activeLinkTypes
      : (Array.isArray(source.linkTypeFilter)
          ? source.linkTypeFilter
          : (Array.isArray(source.selectedLinkTypes) ? source.selectedLinkTypes : []));
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of raw) {
      const value = String(item ?? "").trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      out.push(value);
    }
    return out;
  }

  private static readLinkTypeConfig(source: LegacyRawState): Record<string, LinkTypeConfigEntry> {
    const out: Record<string, LinkTypeConfigEntry> = {};

    if (source.linkTypeConfig && typeof source.linkTypeConfig === "object") {
      for (const [key, value] of Object.entries(source.linkTypeConfig as Record<string, unknown>)) {
        const type = String(key ?? "").trim();
        if (!type || !value || typeof value !== "object") continue;
        const obj = value as Record<string, unknown>;
        const entry: LinkTypeConfigEntry = {
          semantic: obj.semantic === "parent" ? "parent" : "normal"
        };
        if (obj.physics && typeof obj.physics === "object") {
          const physicsObj = obj.physics as Record<string, unknown>;
          const strength = Number(physicsObj.strength);
          const distance = Number(physicsObj.distance);
          if (Number.isFinite(strength) && Number.isFinite(distance)) {
            entry.physics = { strength, distance };
          }
        }
        out[type] = entry;
      }
    }

    const legacySemantics = (source.linkTypeSemantics && typeof source.linkTypeSemantics === "object")
      ? (source.linkTypeSemantics as Record<string, unknown>)
      : {};
    for (const [key, value] of Object.entries(legacySemantics)) {
      const type = String(key ?? "").trim();
      if (!type) continue;
      const role = value === "parent" ? "parent" : "normal";
      out[type] = {
        ...(out[type] ?? { semantic: "normal" }),
        semantic: role
      };
    }

    const legacyPhysics = (source.linkTypePhysics && typeof source.linkTypePhysics === "object")
      ? (source.linkTypePhysics as Record<string, LegacyLinkTypePhysics>)
      : {};
    for (const [key, rawConfig] of Object.entries(legacyPhysics)) {
      const type = String(key ?? "").trim();
      if (!type || !rawConfig || typeof rawConfig !== "object") continue;
      const strength = Number(rawConfig.strength);
      const distance = Number(rawConfig.preferredDistance);
      if (!Number.isFinite(strength) && !Number.isFinite(distance)) continue;
      const existing = out[type] ?? { semantic: "normal" as const };
      out[type] = {
        ...existing,
        physics: {
          strength: Number.isFinite(strength) ? strength : (existing.physics?.strength ?? 0),
          distance: Number.isFinite(distance) ? distance : (existing.physics?.distance ?? 0)
        }
      };
      if (!Number.isFinite(out[type].physics?.strength)) {
        delete out[type].physics;
      }
    }

    return out;
  }

  private static readExpandedParents(source: LegacyRawState): ExpandedNodeState[] {
    const raw = Array.isArray(source.expandedParents) ? source.expandedParents : [];
    const byOrigin = new Map<string, Record<string, boolean>>();

    const isLegacyFlat = raw.length > 0 && raw.some((entry) => {
      if (!entry || typeof entry !== "object") return false;
      return "linkType" in (entry as Record<string, unknown>);
    });

    if (isLegacyFlat) {
      for (const item of raw as LegacyFlatExpandedParent[]) {
        const origin = String(item?.origin ?? "").trim();
        const linkType = String(item?.linkType ?? "").trim();
        if (!origin || !linkType) continue;
        const current = byOrigin.get(origin) ?? {};
        const isVisible = typeof item?.isVisible === "boolean" ? Boolean(item.isVisible) : true;
        current[linkType] = Boolean(current[linkType]) || isVisible;
        byOrigin.set(origin, current);
      }
      return Array.from(byOrigin.entries()).map(([origin, linkTypes]) => ({
        origin,
        linkTypes: { ...linkTypes }
      }));
    }

    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      const origin = String(obj.origin ?? "").trim();
      if (!origin) continue;
      const linkTypesRaw = (obj.linkTypes && typeof obj.linkTypes === "object")
        ? (obj.linkTypes as Record<string, unknown>)
        : {};
      const linkTypes: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(linkTypesRaw)) {
        const type = String(key ?? "").trim();
        if (!type) continue;
        linkTypes[type] = Boolean(value);
      }
      if (Object.keys(linkTypes).length === 0) continue;
      const current = byOrigin.get(origin) ?? {};
      for (const [type, isVisible] of Object.entries(linkTypes)) {
        current[type] = Boolean(current[type]) || Boolean(isVisible);
      }
      byOrigin.set(origin, current);
    }

    return Array.from(byOrigin.entries()).map(([origin, linkTypes]) => ({
      origin,
      linkTypes: { ...linkTypes }
    }));
  }

  private static readGroupingRules(source: LegacyRawState): GroupingRule[] {
    const raw = Array.isArray(source.groupingRules) ? source.groupingRules : [];
    const out: GroupingRule[] = [];
    for (const item of raw as LegacyGroupingRule[]) {
      const property = String(item?.property ?? "").trim();
      if (!property) continue;
      if (item?.operator === "exists") continue;
      const operator = item?.operator === "contains" ? "contains" : "equals";
      const value = String(item?.value ?? "").trim();
      const color = String(item?.color ?? "").trim() || "#4caf50";
      out.push({ property, operator, value, color });
    }
    return out;
  }

  private static readGraphSettings(
    source: LegacyRawState,
    fallback: GraphSettings
  ): GraphSettings {
    const raw = (source.graphSettings && typeof source.graphSettings === "object")
      ? (source.graphSettings as Record<string, unknown>)
      : {};

    const repulsionStrength = Number(
      raw.repulsionStrength ?? source.repulsionStrength ?? fallback.repulsionStrength
    );
    const centerStrength = Number(
      raw.centerStrength ?? source.centerStrength ?? fallback.centerStrength
    );
    const nodeRadius = Number(
      raw.nodeRadius ?? source.nodeRadius ?? fallback.nodeRadius
    );
    const nodeConnectionSizeMultiplier = Number(
      raw.nodeConnectionSizeMultiplier
      ?? source.nodeConnectionSizeMultiplier
      ?? fallback.nodeConnectionSizeMultiplier
    );
    const nearRestVelocityThreshold = Number(
      raw.nearRestVelocityThreshold ?? source.nearRestVelocityThreshold ?? fallback.nearRestVelocityThreshold
    );
    const restVelocityThreshold = Number(
      raw.restVelocityThreshold ?? source.restVelocityThreshold ?? fallback.restVelocityThreshold
    );
    const textFadeThreshold = Number(
      raw.textFadeThreshold ?? source.textFadeThreshold ?? fallback.textFadeThreshold
    );
    const hideNodes = typeof raw.hideNodesWithoutSelectedLinkTypes === "boolean"
      ? raw.hideNodesWithoutSelectedLinkTypes
      : (typeof source.hideNodesWithoutSelectedLinkTypes === "boolean"
          ? source.hideNodesWithoutSelectedLinkTypes
          : fallback.hideNodesWithoutSelectedLinkTypes);
    const layoutIdRaw = raw.layoutId ?? source.layoutId ?? fallback.layoutId;
    const layoutId = String(layoutIdRaw ?? "").trim() || fallback.layoutId;

    return {
      repulsionStrength: Number.isFinite(repulsionStrength) ? repulsionStrength : fallback.repulsionStrength,
      centerStrength: Number.isFinite(centerStrength) ? centerStrength : fallback.centerStrength,
      nodeRadius: Number.isFinite(nodeRadius) ? nodeRadius : fallback.nodeRadius,
      nodeConnectionSizeMultiplier: Number.isFinite(nodeConnectionSizeMultiplier)
        ? nodeConnectionSizeMultiplier
        : fallback.nodeConnectionSizeMultiplier,
      nearRestVelocityThreshold: Number.isFinite(nearRestVelocityThreshold) ? nearRestVelocityThreshold : fallback.nearRestVelocityThreshold,
      restVelocityThreshold: Number.isFinite(restVelocityThreshold) ? restVelocityThreshold : fallback.restVelocityThreshold,
      textFadeThreshold: Number.isFinite(textFadeThreshold)
        ? Math.max(0, Math.min(100, textFadeThreshold))
        : fallback.textFadeThreshold,
      layoutId,
      hideNodesWithoutSelectedLinkTypes: hideNodes
    };
  }

  private static cloneLinkTypeConfigEntry(entry: LinkTypeConfigEntry): LinkTypeConfigEntry {
    return {
      semantic: entry.semantic === "parent" ? "parent" : "normal",
      ...(entry.physics
        && Number.isFinite(Number(entry.physics.strength))
        && Number.isFinite(Number(entry.physics.distance))
        ? {
            physics: {
              strength: Number(entry.physics.strength),
              distance: Number(entry.physics.distance)
            }
          }
        : {})
    };
  }
}
