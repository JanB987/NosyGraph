import { requireApiVersion, type App } from "obsidian";

/** Bases property IDs split at the first dot; property names may contain dots. */
export function parseGraphPropertyId(key: string): { type: "note" | "file" | "formula"; name: string } | null {
  const separator = key.indexOf(".");
  const type = key.slice(0, separator);
  const name = key.slice(separator + 1);
  if (separator < 0 || !name || (type !== "note" && type !== "file" && type !== "formula")) return null;
  return { type, name };
}

function legacyStorageKey(app: App, key: string): string {
  // The adapter resource root distinguishes vaults with the same display name.
  const root = app.vault.adapter.getResourcePath("").split("?")[0];
  return `nosygraph:legacy:${encodeURIComponent(root)}:${key}`;
}

export function loadGraphLocalStorage(app: App, key: string): string | null {
  if (requireApiVersion("1.8.7")) {
    const value: unknown = app.loadLocalStorage(key);
    if (typeof value === "string") return value;
    const legacyValue = window.localStorage.getItem(legacyStorageKey(app, key));
    if (legacyValue !== null) app.saveLocalStorage(key, legacyValue);
    return legacyValue;
  }
  return window.localStorage.getItem(legacyStorageKey(app, key));
}

export function saveGraphLocalStorage(app: App, key: string, value: string): void {
  if (requireApiVersion("1.8.7")) {
    app.saveLocalStorage(key, value);
  } else {
    window.localStorage.setItem(legacyStorageKey(app, key), value);
  }
}
