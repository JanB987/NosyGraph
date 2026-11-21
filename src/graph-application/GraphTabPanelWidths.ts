import { graphTabRecord } from "./GraphTabSession";

export const MIN_GRAPH_TAB_PANEL_WIDTH = 96;
export const MAX_GRAPH_TAB_PANEL_WIDTH = 1200;

export function constrainGraphTabPanelWidth(width: number, maximum = MAX_GRAPH_TAB_PANEL_WIDTH): number {
  return Math.round(Math.max(MIN_GRAPH_TAB_PANEL_WIDTH, Math.min(width, maximum, MAX_GRAPH_TAB_PANEL_WIDTH)));
}

export function readGraphTabPanelWidths(raw: unknown): Record<string, number> {
  return Object.fromEntries(Object.entries(graphTabRecord(raw)).flatMap(([path, width]) =>
    path.trim() && typeof width === "number" && Number.isFinite(width)
      ? [[path, constrainGraphTabPanelWidth(width)]]
      : []
  ));
}

export function renameGraphTabPanelWidths(widths: Record<string, number>, from: string, to: string): Record<string, number> {
  const moved = Object.entries(widths).filter(([path]) => path === from || path.startsWith(`${from}/`));
  if (!moved.length) return widths;
  const oldPaths = new Set(moved.map(([path]) => path));
  return Object.fromEntries([
    ...Object.entries(widths).filter(([path]) => !oldPaths.has(path)),
    ...moved.map(([path, width]) => [to + path.slice(from.length), width] as const)
  ]);
}
