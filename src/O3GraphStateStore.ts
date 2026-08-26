/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- NosyGraph parses Obsidian frontmatter, Bases data, and persisted graph JSON whose shapes are validated at runtime. */
import type { App, TFile } from "obsidian";
import { O3GraphState } from "./O3GraphState";
import {
  DEFAULT_GRAPH_PROPERTY_KEYS,
  type GraphPropertyKeys,
  normalizeGraphPropertyKeys,
  readFrontmatterPropertyByKey,
  writeFrontmatterProperty
} from "./GraphPropertyKeys";

const GRAPH_STATE_BLOCK_LANGUAGE = "o3graph";
const GRAPH_STATE_BLOCK_REGEX = /```o3graph\s*([\s\S]*?)```/m;

export interface O3GraphSimulationSettings {
  repulsionStrength: number;
  centerStrength: number;
  nodeRadius: number;
  nodeConnectionSizeMultiplier: number;
  nearRestVelocityThreshold: number;
  restVelocityThreshold: number;
  textFadeThreshold: number;
}

export class O3GraphStateStore {
  private isWriting = false;
  private queuedWrite: {
    persistedState: Record<string, unknown>;
    options?: { forceEmptyOverwrite?: boolean; allowNodeRemoval?: boolean };
  } | null = null;

  constructor(
    private readonly app: App,
    private readonly file: TFile,
    private readonly graphPropertyKeys: Partial<GraphPropertyKeys> = DEFAULT_GRAPH_PROPERTY_KEYS
  ) {}

  async read(options: { cached?: boolean } = {}): Promise<O3GraphState> {
    const content = options.cached === false
      ? await this.app.vault.read(this.file)
      : await this.app.vault.cachedRead(this.file);
    O3GraphStateStore.assertReadableGraphStateBlock(content, this.file.path);
    const graphState = new O3GraphState(this.file);
    graphState.loadFromContent(content);
    return graphState;
  }

  readSimulationSettings(defaults: O3GraphSimulationSettings): O3GraphSimulationSettings {
    const frontmatter = this.app.metadataCache.getFileCache(this.file)?.frontmatter;
    return O3GraphStateStore.normalizeSimulationSettings(frontmatter, defaults, this.graphPropertyKeys);
  }

  async writeSimulationSettings(settings: O3GraphSimulationSettings): Promise<void> {
    const keys = normalizeGraphPropertyKeys(this.graphPropertyKeys);
    const normalized = O3GraphStateStore.normalizeSimulationSettings(settings, settings, keys);
    await this.app.fileManager.processFrontMatter(this.file, (frontmatter) => {
      writeFrontmatterProperty(frontmatter, keys, "graphForceGravity", normalized.centerStrength);
      writeFrontmatterProperty(frontmatter, keys, "graphForceRepellent", normalized.repulsionStrength);
      writeFrontmatterProperty(frontmatter, keys, "graphNodeSize", normalized.nodeRadius);
      writeFrontmatterProperty(frontmatter, keys, "graphNodeConnectionSizeMultiplier", normalized.nodeConnectionSizeMultiplier);
      writeFrontmatterProperty(frontmatter, keys, "graphVelocityNearRestThreshold", normalized.nearRestVelocityThreshold);
      writeFrontmatterProperty(frontmatter, keys, "graphVelocityRestThreshold", normalized.restVelocityThreshold);
      writeFrontmatterProperty(frontmatter, keys, "graphTextFadeThreshold", normalized.textFadeThreshold);
    });
  }

  async write(
    graphState: O3GraphState,
    options?: { forceEmptyOverwrite?: boolean; allowNodeRemoval?: boolean }
  ): Promise<boolean> {
    const persistedState = O3GraphStateStore.clonePersistedState(graphState.toPersistedState());
    if (this.isWriting) {
      this.queuedWrite = { persistedState, options };
      return false;
    }

    let wrote = false;
    try {
      this.isWriting = true;
      wrote = await this.writeOnce(persistedState, options);
    } finally {
      this.isWriting = false;
      const queued = this.queuedWrite;
      this.queuedWrite = null;
      if (queued) {
        void this.writePersistedState(queued.persistedState, queued.options);
      }
    }
    return wrote;
  }

  private async writePersistedState(
    persistedState: Record<string, unknown>,
    options?: { forceEmptyOverwrite?: boolean; allowNodeRemoval?: boolean }
  ): Promise<boolean> {
    if (this.isWriting) {
      this.queuedWrite = {
        persistedState: O3GraphStateStore.clonePersistedState(persistedState),
        options
      };
      return false;
    }
    try {
      this.isWriting = true;
      return await this.writeOnce(persistedState, options);
    } finally {
      this.isWriting = false;
      const queued = this.queuedWrite;
      this.queuedWrite = null;
      if (queued) {
        void this.writePersistedState(queued.persistedState, queued.options);
      }
    }
  }

  private async writeOnce(
    persistedState: Record<string, unknown>,
    options?: { forceEmptyOverwrite?: boolean; allowNodeRemoval?: boolean }
  ): Promise<boolean> {
    const content = await this.app.vault.read(this.file);
    if (!options?.forceEmptyOverwrite && O3GraphStateStore.isUnsafeGraphDocumentWriteTarget(content)) {
      console.warn("[GraphStateStore] Refused graph-state write because the current file content is empty.", {
        file: this.file.path
      });
      return false;
    }
    if (
      !options?.forceEmptyOverwrite
      && O3GraphStateStore.isUnsafeGraphStateOverwrite(content, persistedState, options?.allowNodeRemoval === true)
    ) {
      console.warn("[GraphStateStore] Refused unsafe graph-state overwrite.", {
        file: this.file.path
      });
      return false;
    }
    const newJson = JSON.stringify(persistedState, null, 2);
    const newContent = O3GraphStateStore.replaceGraphStateBlock(content, newJson);
    if (newContent === content) {
      return false;
    }
    await this.app.vault.modify(this.file, newContent);
    return true;
  }

  private static isUnsafeGraphDocumentWriteTarget(content: string): boolean {
    const text = String(content ?? "");
    return text.trim().length === 0;
  }

  static replaceGraphStateBlock(content: string, json: string): string {
    const block = "```" + GRAPH_STATE_BLOCK_LANGUAGE + "\n" + json + "\n```";
    if (GRAPH_STATE_BLOCK_REGEX.test(content)) {
      return content.replace(GRAPH_STATE_BLOCK_REGEX, block);
    }
    return content + "\n\n## Graph Data\n" + block + "\n";
  }

  private static isUnsafeGraphStateOverwrite(
    content: string,
    nextState: Record<string, unknown>,
    allowNodeRemoval: boolean
  ): boolean {
    const nextNodes = nextState.nodes && typeof nextState.nodes === "object"
      ? Object.keys(nextState.nodes as Record<string, unknown>).length
      : 0;
    const nextNotes = nextState.notes && typeof nextState.notes === "object"
      ? Object.keys(nextState.notes as Record<string, unknown>).length
      : 0;
    if (nextNodes > 0 && nextNotes > 0) return false;

    const match = GRAPH_STATE_BLOCK_REGEX.exec(content);
    if (!match) return false;
    try {
      const previous = JSON.parse(match[1] ?? "{}") as Record<string, unknown>;
      const previousNodes = previous.nodes && typeof previous.nodes === "object"
        ? Object.keys(previous.nodes as Record<string, unknown>).length
        : 0;
      const previousNotes = previous.notes && typeof previous.notes === "object"
        ? Object.keys(previous.notes as Record<string, unknown>).length
        : 0;
      const wouldEmptyPreviouslyPopulatedGraph = (previousNodes > 0 && nextNodes === 0) || (previousNotes > 0 && nextNotes === 0);
      if (wouldEmptyPreviouslyPopulatedGraph) {
        return true;
      }
      if (!allowNodeRemoval && (nextNodes < previousNodes || nextNotes < previousNotes)) {
        return true;
      }
      return false;
    } catch {
      return true;
    }
  }

  private static clonePersistedState(state: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
  }

  private static assertReadableGraphStateBlock(content: string, filePath: string): void {
    const match = GRAPH_STATE_BLOCK_REGEX.exec(content);
    if (!match) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1] ?? "");
    } catch (error) {
      throw new Error(`Refusing to hydrate invalid o3graph data in ${filePath}: ${String(error)}`);
    }
    const version = Number((parsed as Record<string, unknown> | null)?.version);
    if (version !== 1 && version !== 2) {
      throw new Error(`Refusing to hydrate unsupported o3graph version in ${filePath}: ${String(version)}`);
    }
  }

  static normalizeSimulationSettings(
    raw: unknown,
    defaults: O3GraphSimulationSettings,
    graphPropertyKeys: Partial<GraphPropertyKeys> = DEFAULT_GRAPH_PROPERTY_KEYS
  ): O3GraphSimulationSettings {
    const keys = normalizeGraphPropertyKeys(graphPropertyKeys);
    const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const repulsionStrength = Number(readFrontmatterPropertyByKey(source, keys, "graphForceRepellent") ?? source.repulsionStrength);
    const centerStrength = Number(readFrontmatterPropertyByKey(source, keys, "graphForceGravity") ?? source.centerStrength);
    const nodeRadius = Number(readFrontmatterPropertyByKey(source, keys, "graphNodeSize") ?? source.nodeRadius);
    const nodeConnectionSizeMultiplier = Number(
      readFrontmatterPropertyByKey(source, keys, "graphNodeConnectionSizeMultiplier")
      ?? source.nodeConnectionSizeMultiplier
    );
    const nearRestVelocityThreshold = Number(
      readFrontmatterPropertyByKey(source, keys, "graphVelocityNearRestThreshold")
      ?? source.nearRestVelocityThreshold
    );
    const restVelocityThreshold = Number(
      readFrontmatterPropertyByKey(source, keys, "graphVelocityRestThreshold")
      ?? source.restVelocityThreshold
    );
    const textFadeThreshold = Number(
      readFrontmatterPropertyByKey(source, keys, "graphTextFadeThreshold")
      ?? source.textFadeThreshold
    );
    return {
      repulsionStrength: Number.isFinite(repulsionStrength)
        ? repulsionStrength
        : defaults.repulsionStrength,
      centerStrength: Number.isFinite(centerStrength)
        ? centerStrength
        : defaults.centerStrength,
      nodeRadius: Number.isFinite(nodeRadius)
        ? nodeRadius
        : defaults.nodeRadius,
      nodeConnectionSizeMultiplier: Number.isFinite(nodeConnectionSizeMultiplier)
        ? nodeConnectionSizeMultiplier
        : defaults.nodeConnectionSizeMultiplier,
      nearRestVelocityThreshold: Number.isFinite(nearRestVelocityThreshold)
        ? nearRestVelocityThreshold
        : defaults.nearRestVelocityThreshold,
      restVelocityThreshold: Number.isFinite(restVelocityThreshold)
        ? restVelocityThreshold
        : defaults.restVelocityThreshold,
      textFadeThreshold: Number.isFinite(textFadeThreshold)
        ? Math.max(0, Math.min(100, textFadeThreshold))
        : (Number.isFinite(Number(defaults.textFadeThreshold)) ? defaults.textFadeThreshold : 97)
    };
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- Re-enable dynamic-data lint rules after this module. */
