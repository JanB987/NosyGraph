export type LinkTypeRenderStyle = "line" | "folder";
export type LinkTypeDirectionMode = "child" | "parent";

export interface LinkTypeDefinition {
  id: string;
  label: string;
  property: string;
  layout: "force";
  color: string;
  renderStyle: LinkTypeRenderStyle;
  directionMode: LinkTypeDirectionMode;
  opacity: number;
  lineThickness: number;
  lineLengthMultiplier: number;
  forceStrength: number;
}

export interface LinkTypeRegistryData {
  version: number;
  linkTypes: LinkTypeDefinition[];
}
