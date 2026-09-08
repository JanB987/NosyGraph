import type { GroupId } from "./graph-identifiers";

export type GraphGroupOperator = "equals" | "contains" | "exists";

/** Detached grouping configuration independent of Obsidian files. */
export interface GraphGroup {
  id: GroupId;
  label: string;
  property: string;
  operator: GraphGroupOperator;
  value?: string;
  color: string;
  icon?: string;
  priority: number;
}
