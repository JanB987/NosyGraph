// Shared vault definitions for workspace configuration and indexing.

export type WorkspaceVault = {
  id: string;
  name: string;
  path: string;
};

export type VaultDocumentKind =
  | "markdown-note"
  | "graph-view"
  | "list-view"
  | "table-view"
  | "settings-view"
  | "table-settings-view"
  | "explorer-view"
  | "properties-view"
  | "context-panel-view"
  | "unknown";

export type VaultFileEntry = {
  path: string;
  relativePath: string;
  name: string;
  kind?: VaultDocumentKind;
  title?: string;
  modifiedTimeMs?: number;
};
