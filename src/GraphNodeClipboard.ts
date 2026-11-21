export interface GraphNodeClipboardPorts {
  serialize(path: string, sourcePath: string): string;
  write(text: string): Promise<void>;
  register(paths: string[], text: string): void;
}

export async function publishGraphNodeLinks(paths: readonly string[], sourcePath: string, ports: GraphNodeClipboardPorts): Promise<number> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return 0;
  const text = unique.map(path => ports.serialize(path, sourcePath)).join("\n");
  await ports.write(text);
  ports.register(unique, text);
  return unique.length;
}

export type MatchGraphNodeClipboard = (text: string, source?: "input-field") => readonly string[] | undefined;

export class GraphNodeClipboardState {
  private snapshot?: Readonly<{ paths: readonly string[]; text: string }>;

  remember(paths: readonly string[], text: string): void {
    this.snapshot = Object.freeze({
      paths: Object.freeze([...new Set(paths.map((path) => path.trim()).filter(Boolean))]),
      text
    });
  }

  match: MatchGraphNodeClipboard = (text, source) => {
    const snapshot = this.snapshot;
    if (!text || !snapshot?.paths.length) return undefined;
    // Single-line inputs may remove CR/LF before delivering an input event.
    const matches = snapshot.text === text
      || (source === "input-field" && snapshot.text.replace(/[\r\n]/g, "") === text);
    return matches ? snapshot.paths : undefined;
  };
}
