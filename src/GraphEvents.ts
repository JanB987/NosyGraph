export type GraphEvent =
  | { type: "NODE_METADATA_CHANGED"; path: string }
  | { type: "NODE_REMOVED"; path: string }
  | { type: "LINKTYPE_CHANGED"; path: string }
  | { type: "GROUP_CHANGED"; path: string }
  | { type: "BASE_FILTER_CHANGED"; path: string }
  | { type: "GRAPH_FILE_CHANGED"; path: string };
