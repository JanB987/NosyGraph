export interface ExpandedNodeState {
  origin: string;
  linkTypes: Record<string, boolean>;
}

export interface LinkTypeConfigEntry {
  semantic: "parent" | "normal";
  physics?: {
    strength: number;
    distance: number;
  };
}

export interface GroupingRule {
  property: string;
  operator: "equals" | "contains";
  value: string;
  color: string;
  colorExplicit?: boolean;
  icon?: string;
  iconSourcePath?: string;
}

export interface GraphSettings {
  repulsionStrength: number;
  centerStrength: number;
  nodeRadius: number;
  nodeConnectionSizeMultiplier: number;
  nearRestVelocityThreshold: number;
  restVelocityThreshold: number;
  textFadeThreshold: number;
  layoutId: string;
  hideNodesWithoutSelectedLinkTypes: boolean;
}

export interface GraphViewState {
  version: number;
  rootNodes: string[];
  activeLinkTypes: string[];
  linkTypeConfig: Record<string, LinkTypeConfigEntry>;
  expandedParents: ExpandedNodeState[];
  groupingRules: GroupingRule[];
  graphSettings: GraphSettings;
}
