import type { GraphTabSelection } from "./GraphTabSession";

export interface GraphTabSurfaceSnapshot {
  ownerPath: string;
  graphPath: string;
  selection: GraphTabSelection | null;
}

interface Surface<Tab> extends GraphTabSurfaceSnapshot {
  tab: Tab;
  kind: "graph" | "embed";
  interaction: number;
}

/** The owner path invalidates an embed or graph selection as soon as its tab navigates. */
export class GraphTabSourceRegistry<Tab> {
  private readonly surfaces = new Map<symbol, Surface<Tab>>();
  private lastUsed: symbol | undefined;
  private clock = 0;

  markTime(): number {
    return ++this.clock;
  }

  publish(key: symbol, tab: Tab, kind: Surface<Tab>["kind"], snapshot: GraphTabSurfaceSnapshot, interacted: boolean): boolean {
    const previous = this.surfaces.get(key);
    const sameContext = previous?.tab === tab && previous.ownerPath === snapshot.ownerPath;
    const interaction = interacted ? this.markTime() : sameContext ? previous.interaction : 0;
    if (interacted) this.lastUsed = key;
    if (!sameContext && !interacted && this.lastUsed === key) this.lastUsed = undefined;
    this.surfaces.set(key, { ...snapshot, tab, kind, interaction });
    return interacted || !sameContext || previous.graphPath !== snapshot.graphPath
      || JSON.stringify(previous.selection) !== JSON.stringify(snapshot.selection);
  }

  automatic(matches?: (surface: Surface<Tab>) => boolean): Surface<Tab> | undefined {
    const last = this.lastUsed ? this.surfaces.get(this.lastUsed) : undefined;
    if (!matches || last && matches(last)) return last;
    let best: Surface<Tab> | undefined;
    for (const surface of this.surfaces.values()) {
      if (surface.interaction && matches(surface) && (!best || surface.interaction > best.interaction)) best = surface;
    }
    return best;
  }

  forTab(tab: Tab, path: string, kind: Surface<Tab>["kind"]): Surface<Tab> | undefined {
    let best: Surface<Tab> | undefined;
    for (const surface of this.surfaces.values()) {
      if (surface.tab !== tab || surface.ownerPath !== path || surface.kind !== kind) continue;
      if (kind === "embed" && !surface.interaction) continue;
      if (!best || surface.interaction >= best.interaction) best = surface;
    }
    return best;
  }

  rename(oldPath: string, newPath: string): void {
    const renamed = (path: string) => path === oldPath || path.startsWith(`${oldPath}/`)
      ? newPath + path.slice(oldPath.length) : path;
    for (const surface of this.surfaces.values()) {
      surface.ownerPath = renamed(surface.ownerPath);
      surface.graphPath = renamed(surface.graphPath);
      const selection = surface.selection;
      if (selection) surface.selection = {
        notes: selection.notes.map(note => ({ ...note, path: renamed(note.path) })),
        preferredPath: selection.preferredPath && renamed(selection.preferredPath)
      };
    }
  }

  remove(key: symbol): void {
    this.surfaces.delete(key);
    if (this.lastUsed === key) this.lastUsed = undefined;
  }

  prune(isCurrent: (surface: Surface<Tab>) => boolean): void {
    for (const [key, surface] of this.surfaces) {
      if (!isCurrent(surface)) this.remove(key);
    }
  }
}
