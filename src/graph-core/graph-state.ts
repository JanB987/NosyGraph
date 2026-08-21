export interface GraphViewportStateCore {
  zoom: number;
  x: number;
  y: number;
}

export interface GraphNodePositionCore {
  x: number;
  y: number;
}

export function normalizeGraphViewportState(
  viewport: Partial<GraphViewportStateCore> | undefined,
): GraphViewportStateCore | undefined {
  if (!viewport) {
    return undefined;
  }

  return {
    zoom: Number(viewport.zoom ?? 1),
    x: Number(viewport.x ?? 0),
    y: Number(viewport.y ?? 0),
  };
}

export function normalizeGraphNodePositions(
  nodePositions: Record<string, Partial<GraphNodePositionCore>> | undefined,
): Record<string, GraphNodePositionCore> {
  return Object.fromEntries(
    Object.entries(nodePositions ?? {})
      .map(([nodeId, position]) => [
        String(nodeId ?? "").replace(/\\/g, "/").trim(),
        {
          x: Number(position?.x ?? 0),
          y: Number(position?.y ?? 0),
        },
      ])
      .filter(([nodeId]) => Boolean(nodeId)),
  );
}
