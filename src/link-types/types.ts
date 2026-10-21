export type LinkTypeRenderStyle = "line" | "folder";
export type LinkTypeDirectionMode = "child" | "parent";
export type LinkTypeLayoutMode = "force" | "direction";
export type LinkTypeSemantic = "link" | "parent" | "lens";
export type LinkTypeIconKind = "force" | "direction" | "parent" | "lens";
export type LinkDiscoveryDirection = "outgoing" | "incoming" | "both";
export type LinkPointerDirection = "incoming" | "outgoing" | "none";

/**
 * A host-neutral reference to the LinkType note. The value is serialized in
 * Obsidian's configured link format and resolved to a canonical file identity
 * by the host adapter.
 */
export type LinkTypeDefinitionReference = string;

/** Rules that determine whether a definition can be active beside another. */
export interface LinkTypeActivationPolicy {
  allowsPropertyOverlap: boolean;
  allowsMultipleDefinitions: boolean;
}

export interface LinkTypeDefinition {
  id: string;
  /** Runtime identity; for note-backed definitions this is derived from the reference. */
  definitionReference?: LinkTypeDefinitionReference;
  label: string;
  property: string;
  /** Ordered read properties. `property` remains the primary compatibility value. */
  properties?: readonly string[];
  /** Explicit mutation property; defaults to the first read property. */
  writeProperty?: string;
  semantic?: LinkTypeSemantic;
  iconKind?: LinkTypeIconKind;
  discoveryDirection?: LinkDiscoveryDirection;
  pointerDirection?: LinkPointerDirection;
  layout: LinkTypeLayoutMode;
  color: string;
  renderStyle: LinkTypeRenderStyle;
  directionMode: LinkTypeDirectionMode;
  opacity: number;
  lineThickness: number;
  lineLengthMultiplier: number;
  forceStrength: number;
}

/** A note-backed Lens definition with validated multi-property behavior. */
export interface LensLinkTypeDefinition extends LinkTypeDefinition {
  semantic: "lens";
  iconKind: "lens";
  definitionReference: LinkTypeDefinitionReference;
  properties: readonly string[];
  writeProperty: string;
  discoveryDirection: LinkDiscoveryDirection;
  pointerDirection: LinkPointerDirection;
  activationPolicy: LinkTypeActivationPolicy;
}

/** Host-neutral badge metadata; runtime state lives in GraphBadge. */
export interface LinkTypeBadgeDefinition {
  id: string;
  linkTypeId: string;
  definitionReference?: LinkTypeDefinitionReference;
  label: string;
  semantic: LinkTypeSemantic;
  iconKind: LinkTypeIconKind;
  /** Lens badges may be visible on eligible unselected nodes. */
  showWhenUnselected: boolean;
  /** Ordinary badges require a relationship for the unselected exception. */
  requiresRelationshipForUnselected: boolean;
}

export interface LinkTypeActivationConflict {
  property: string;
  existingDefinitionId: string;
  requestedDefinitionId: string;
}

export type LinkTypeActivationResult =
  | { accepted: true }
  | { accepted: false; conflicts: readonly LinkTypeActivationConflict[] };

export interface LinkTypeRegistryData {
  version: number;
  linkTypes: LinkTypeDefinition[];
}
