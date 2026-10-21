/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- NosyGraph parses Obsidian frontmatter, Bases data, and persisted graph JSON whose shapes are validated at runtime. */
import { App, parseYaml, TFile } from "obsidian";

export interface BaseViewFilterResult {
  files: TFile[];
  baseFile: TFile | null;
  viewName: string | null;
  filterId: string | null;
  source: "bases-api" | "base-yaml" | "none";
  status: "empty" | "base-unresolved" | "base-unreadable" | "view-unresolved" | "filter-unsupported" | "resolved";
  message?: string;
  filterPreview?: unknown;
}

export interface ConnectedBaseFilterResult {
  files: TFile[];
  baseFiles: TFile[];
  results: BaseViewFilterResult[];
  filterId: string | null;
  source: BaseViewFilterResult["source"] | "mixed";
}

interface ParsedBaseViewLink {
  linkPath: string;
  viewName: string | null;
}

class UnsupportedBaseFilterError extends Error {}

type FilePredicate = (file: TFile) => boolean;

export class ObsidianBaseViewFilterResolver {
  constructor(private readonly app: App) {}

  async resolveAll(value: unknown, graphFile: TFile | null): Promise<ConnectedBaseFilterResult> {
    const seen = new Set<string>();
    const requests: Array<Promise<BaseViewFilterResult>> = [];
    const contentCache = new Map<string, Promise<string>>();
    for (const reference of this.collectStringValues(value)) {
      const parsed = this.parseBaseViewLink(reference);
      if (!parsed) continue;
      const baseFile = this.resolveBaseFile(parsed.linkPath, graphFile);
      const filterId = this.buildFilterId(baseFile?.path ?? parsed.linkPath, parsed.viewName);
      const identity = this.buildFilterId(baseFile?.path ?? parsed.linkPath, parsed.viewName?.toLowerCase() ?? null);
      if (seen.has(identity)) continue;
      seen.add(identity);
      requests.push(this.resolve(reference, graphFile, contentCache).catch((error: unknown): BaseViewFilterResult => ({
        ...this.empty(), baseFile, viewName: parsed.viewName, filterId,
        status: "base-unreadable",
        message: `Connected Base "${filterId}" could not be evaluated: ${error instanceof Error ? error.message : String(error)}`
      })));
    }
    const results = await Promise.all(requests);
    const baseFiles = Array.from(new Map(results.flatMap((result) => result.baseFile
      ? [[result.baseFile.path, result.baseFile] as const] : [])).values());
    const sources = new Set(results.map((result) => result.source));
    return {
      files: this.dedupeFiles(results.flatMap((result) => result.status === "resolved" ? result.files : [])),
      baseFiles,
      results,
      filterId: results.map((result) => result.filterId).filter(Boolean).join(" + ") || null,
      source: sources.size > 1 ? "mixed" : results[0]?.source ?? "none"
    };
  }

  async resolve(value: unknown, graphFile: TFile | null, contentCache?: Map<string, Promise<string>>): Promise<BaseViewFilterResult> {
    const parsed = this.parseBaseViewLink(value);
    if (!parsed) {
      return this.empty();
    }

    const baseFile = this.resolveBaseFile(parsed.linkPath, graphFile);
    if (!baseFile) {
      return {
        ...this.empty(),
        viewName: parsed.viewName,
        filterId: this.buildFilterId(parsed.linkPath, parsed.viewName),
        status: "base-unresolved",
        message: `Base file could not be resolved from "${parsed.linkPath}".`
      };
    }

    // A valid .base definition is the authoritative source for this graph's
    // requested Base/view pair. Obsidian does not expose a supported headless
    // Bases query API, and internal method probes can return a result belonging
    // to a previously displayed Base view. Evaluating the linked file directly
    // prevents one graph note from inheriting another graph note's nodes.
    const yamlResult = await this.resolveFromBaseYaml(baseFile, parsed.viewName, contentCache);
    if (yamlResult.viewFound) {
      return {
        files: this.dedupeFiles(yamlResult.files),
        baseFile,
        viewName: parsed.viewName,
        filterId: this.buildFilterId(baseFile.path, parsed.viewName),
        source: "base-yaml",
        status: yamlResult.unsupported ? "filter-unsupported" : "resolved",
        ...(yamlResult.message ? { message: yamlResult.message } : {}),
        ...(yamlResult.filterPreview !== undefined ? { filterPreview: yamlResult.filterPreview } : {})
      };
    }

    // Keep the compatibility probe for environments where the file cannot be
    // parsed or the requested view is not represented in YAML. It is never
    // preferred over a resolvable file-backed view.
    const apiFiles = await this.tryResolveWithBasesApi(baseFile, parsed.viewName);
    if (apiFiles) {
      return {
        files: this.dedupeFiles(apiFiles),
        baseFile,
        viewName: parsed.viewName,
        filterId: this.buildFilterId(baseFile.path, parsed.viewName),
        source: "bases-api",
        status: "resolved"
      };
    }

    return {
      files: this.dedupeFiles(yamlResult.files),
      baseFile,
      viewName: parsed.viewName,
      filterId: this.buildFilterId(baseFile.path, parsed.viewName),
      source: "base-yaml",
      status: yamlResult.viewFound ? "resolved" : "view-unresolved",
      ...(yamlResult.filterPreview !== undefined ? { filterPreview: yamlResult.filterPreview } : {}),
      ...(yamlResult.message ? { message: yamlResult.message } : {})
    };
  }

  private empty(): BaseViewFilterResult {
    return {
      files: [],
      baseFile: null,
      viewName: null,
      filterId: null,
      source: "none",
      status: "empty"
    };
  }

  private parseBaseViewLink(value: unknown): ParsedBaseViewLink | null {
    const raw = this.firstStringValue(value);
    if (!raw) return null;

    const match = raw.match(/\[\[([^[\]|]+)(?:\|[^\]]*)?\]\]/);
    const linkText = (match ? match[1] : raw).trim();
    if (!linkText) return null;

    const [rawPath, ...headingParts] = linkText.split("#");
    const linkPath = this.safeDecodeURIComponent(String(rawPath ?? "").trim());
    if (!linkPath) return null;

    const viewName = this.safeDecodeURIComponent(headingParts.join("#").trim()) || null;
    return { linkPath, viewName };
  }

  private firstStringValue(value: unknown): string | null {
    const values = this.collectStringValues(value);
    return values[0] ?? null;
  }

  private collectStringValues(value: unknown): string[] {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed ? [trimmed] : [];
    }
    if (Array.isArray(value)) {
      const out: string[] = [];
      for (const item of value) {
        out.push(...this.collectStringValues(item));
      }
      return out;
    }
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      for (const key of ["link", "path", "display", "value"]) {
        const nested = this.collectStringValues(obj[key]);
        if (nested.length > 0) return nested;
      }
    }
    return [];
  }

  private resolveBaseFile(linkPath: string, graphFile: TFile | null): TFile | null {
    const candidates = this.buildBaseLinkCandidates(linkPath);

    for (const candidate of candidates) {
      const direct = this.app.vault.getAbstractFileByPath(candidate);
      if (direct instanceof TFile) return direct;
    }

    for (const candidate of candidates) {
      const resolvedFromGraph = this.app.metadataCache.getFirstLinkpathDest(candidate, graphFile?.path ?? "");
      if (resolvedFromGraph instanceof TFile) return resolvedFromGraph;
      const resolvedFromVault = this.app.metadataCache.getFirstLinkpathDest(candidate, "");
      if (resolvedFromVault instanceof TFile) return resolvedFromVault;
    }

    const baseFiles = this.app.vault.getFiles().filter((file) => file.extension === "base");
    const normalizedCandidates = candidates.map((candidate) => this.normalizePath(candidate));

    const pathMatch = baseFiles.find((file) =>
      normalizedCandidates.some((candidate) => this.normalizePath(file.path) === candidate)
    );
    if (pathMatch instanceof TFile) return pathMatch;

    const suffixMatches = baseFiles.filter((file) =>
      normalizedCandidates.some((candidate) =>
        this.normalizePath(file.path).endsWith(`/${candidate}`)
      )
    );
    if (suffixMatches.length === 1) return suffixMatches[0];

    const normalizedBasename = this.normalizeBaseName(linkPath);
    const basenameMatches = baseFiles.filter((file) =>
      file.basename.toLowerCase() === normalizedBasename
    );
    if (basenameMatches.length === 1) return basenameMatches[0];
    return null;
  }

  private buildBaseLinkCandidates(linkPath: string): string[] {
    const decoded = this.safeDecodeURIComponent(String(linkPath ?? "").trim()).replace(/\\/g, "/").replace(/^\/+/, "");
    const withoutExtension = decoded.replace(/\.base$/i, "");
    const rawCandidates = [
      decoded,
      decoded.endsWith(".base") ? decoded : `${decoded}.base`,
      withoutExtension,
      `${withoutExtension}.base`
    ];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const candidate of rawCandidates) {
      const normalized = candidate.trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
    }
    return out;
  }

  private normalizeBaseName(linkPath: string): string {
    const decoded = this.safeDecodeURIComponent(String(linkPath ?? "").trim()).replace(/\\/g, "/");
    const basename = decoded.split("/").filter(Boolean).pop() ?? decoded;
    return basename.replace(/\.base$/i, "").toLowerCase();
  }

  private normalizePath(path: string): string {
    return this.safeDecodeURIComponent(String(path ?? "").trim())
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .toLowerCase();
  }

  private async tryResolveWithBasesApi(baseFile: TFile, viewName: string | null): Promise<TFile[] | null> {
    const bases = this.getBasesApiCandidate();
    if (!bases) return null;

    const viewRef = { baseFile, basePath: baseFile.path, viewName };
    const methodNames = [
      "queryBaseView",
      "getBaseViewResults",
      "getViewResults",
      "resolveBaseView",
      "getViewData"
    ];

    for (const methodName of methodNames) {
      const method = bases?.[methodName];
      if (typeof method !== "function") continue;
      try {
        const result = await method.call(bases, viewRef);
        const files = this.extractFilesFromUnknownResult(result);
        if (files) return files;
      } catch {
        // Fall through to the next known candidate. Obsidian does not currently
        // expose a documented callable Bases query API in this plugin context.
      }
    }

    return null;
  }

  private getBasesApiCandidate(): unknown {
    const appAny = this.app as unknown as {
      internalPlugins?: { plugins?: { bases?: { instance?: unknown } } };
      plugins?: { plugins?: { bases?: unknown } };
      bases?: unknown;
    };
    return appAny.internalPlugins?.plugins?.bases?.instance
      ?? appAny.plugins?.plugins?.bases
      ?? appAny.bases
      ?? null;
  }

  private extractFilesFromUnknownResult(result: unknown): TFile[] | null {
    if (!result) return null;

    if (Array.isArray(result)) {
      const files = this.extractFilesFromEntries(result);
      return files.length > 0 ? files : null;
    }

    if (typeof result !== "object") return null;
    const obj = result as Record<string, unknown>;

    for (const key of ["files", "entries", "data", "rows", "results", "items", "values"]) {
      const value = obj[key];
      if (Array.isArray(value)) {
        const files = this.extractFilesFromEntries(value);
        if (files.length > 0) return files;
      }
    }

    const grouped = obj.groupedData;
    if (Array.isArray(grouped)) {
      const entries: unknown[] = [];
      for (const group of grouped) {
        const groupEntries = (group as Record<string, unknown> | null)?.entries;
        if (Array.isArray(groupEntries)) {
          entries.push(...groupEntries);
        }
      }
      const files = this.extractFilesFromEntries(entries);
      return files.length > 0 ? files : null;
    }

    return null;
  }

  private extractFilesFromEntries(entries: unknown[]): TFile[] {
    const files: TFile[] = [];
    const seen = new Set<string>();
    const addFile = (file: TFile | null): void => {
      if (!(file instanceof TFile)) return;
      if (file.extension !== "md") return;
      if (seen.has(file.path)) return;
      seen.add(file.path);
      files.push(file);
    };
    for (const entry of entries) {
      if (entry instanceof TFile) {
        addFile(entry);
        continue;
      }
      const file = this.resolveFileFromBaseResultEntry(entry);
      if (file instanceof TFile) {
        addFile(file);
      }
    }
    return files;
  }

  private resolveFileFromBaseResultEntry(entry: unknown, depth = 0): TFile | null {
    if (!entry || depth > 3) return null;
    if (entry instanceof TFile) return entry;
    if (typeof entry === "string") return this.resolveMarkdownFilePath(entry);
    if (typeof entry !== "object") return null;

    const obj = entry as Record<string, unknown>;
    for (const key of ["file", "sourceFile", "targetFile", "tfile"]) {
      const nested = this.resolveFileFromBaseResultEntry(obj[key], depth + 1);
      if (nested) return nested;
    }
    for (const key of ["path", "filePath", "vaultPath", "sourcePath"]) {
      const value = obj[key];
      if (typeof value !== "string") continue;
      const file = this.resolveMarkdownFilePath(value);
      if (file) return file;
    }
    const cells = obj.cells ?? obj.values ?? obj.data;
    if (cells && typeof cells === "object") {
      const nested = this.resolveFileFromBaseResultEntry(cells, depth + 1);
      if (nested) return nested;
    }
    return null;
  }

  private resolveMarkdownFilePath(value: string): TFile | null {
    const raw = this.safeDecodeURIComponent(String(value ?? "").trim()).replace(/\\/g, "/").replace(/^\/+/, "");
    if (!raw) return null;
    const candidates = [
      raw,
      raw.endsWith(".md") ? raw : `${raw}.md`
    ];
    for (const candidate of candidates) {
      const direct = this.app.vault.getAbstractFileByPath(candidate);
      if (direct instanceof TFile && direct.extension === "md") return direct;
    }
    const resolved = this.app.metadataCache.getFirstLinkpathDest(raw.replace(/\.md$/i, ""), "");
    return resolved instanceof TFile && resolved.extension === "md" ? resolved : null;
  }

  private async resolveFromBaseYaml(baseFile: TFile, viewName: string | null, contentCache?: Map<string, Promise<string>>): Promise<{ files: TFile[]; viewFound: boolean; unsupported?: boolean; message?: string; filterPreview?: unknown }> {
    let contentPromise = contentCache?.get(baseFile.path);
    if (!contentPromise) {
      contentPromise = this.app.vault.read(baseFile);
      contentCache?.set(baseFile.path, contentPromise);
    }
    const content = await contentPromise;
    const parsed = parseYaml(content);
    if (!parsed || typeof parsed !== "object") {
      return { files: [], viewFound: false, message: `Base file "${baseFile.path}" could not be parsed as YAML.` };
    }

    const views = Array.isArray((parsed as Record<string, unknown>).views)
      ? (parsed as Record<string, unknown>).views as Record<string, unknown>[]
      : [];
    const view = this.findBaseView(views, viewName);
    if (!view) {
      return {
        files: [],
        viewFound: false,
        message: viewName
          ? `View "${viewName}" was not found in "${baseFile.path}".`
          : `No view was found in "${baseFile.path}".`
      };
    }

    const base = parsed as Record<string, unknown>;
    const globalFilter = base.filters ?? base.filter;
    const viewFilter = view.filters ?? view.filter;
    // Bases applies both scopes. Preserve explicit false filters, and use the
    // same combined expression for validation, matching, and diagnostics.
    const filter = globalFilter != null && viewFilter != null
      ? { and: [globalFilter, viewFilter] }
      : globalFilter ?? viewFilter;
    let predicate: FilePredicate;
    try {
      // Compile every branch before evaluating files, so unsupported syntax is
      // reported even in an empty vault or a short-circuited boolean branch.
      predicate = this.compileFilter(filter);
    } catch (error) {
      if (!(error instanceof UnsupportedBaseFilterError)) throw error;
      return {
        files: [], viewFound: true, unsupported: true,
        message: `Unsupported or invalid Base filter in "${baseFile.path}": ${error.message}`,
        filterPreview: this.previewFilter(filter)
      };
    }
    const files = this.app.vault.getMarkdownFiles().filter(predicate);
    const limit = Number(view.limit);
    return {
      files: Number.isFinite(limit) && limit > 0 ? files.slice(0, Math.floor(limit)) : files,
      viewFound: true,
      filterPreview: this.previewFilter(filter)
    };
  }

  private previewFilter(filter: unknown): unknown {
    if (typeof filter === "string") return filter;
    try {
      return JSON.parse(JSON.stringify(filter));
    } catch {
      return String(filter ?? "");
    }
  }

  private findBaseView(views: Record<string, unknown>[], viewName: string | null): Record<string, unknown> | null {
    if (viewName) {
      const normalizedName = viewName.trim().toLowerCase();
      const named = views.find((view) => String(view.name ?? "").trim().toLowerCase() === normalizedName);
      return named ?? null;
    }
    return views[0] ?? null;
  }

  private compileFilter(filter: unknown): FilePredicate {
    if (filter === undefined || filter === null) return () => true;
    if (typeof filter === "boolean") return () => filter;

    if (typeof filter === "string") {
      return this.compileFilterExpression(filter);
    }

    if (Array.isArray(filter)) {
      const children = filter.map((child) => this.compileFilter(child));
      return (file) => children.every((child) => child(file));
    }

    if (typeof filter !== "object") throw new UnsupportedBaseFilterError(JSON.stringify(filter));
    const obj = filter as Record<string, unknown>;

    if (Array.isArray(obj.and)) {
      const children = obj.and.map((child) => this.compileFilter(child));
      return (file) => children.every((child) => child(file));
    }
    if (Array.isArray(obj.or)) {
      const children = obj.or.map((child) => this.compileFilter(child));
      return (file) => children.some((child) => child(file));
    }
    if (obj.not !== undefined) {
      if (Array.isArray(obj.not)) {
        // Bases' not group means none of its children may match. Compile all
        // children first so invalid syntax cannot hide behind short circuiting.
        const children = obj.not.map((child) => this.compileFilter(child));
        return (file) => !children.some((child) => child(file));
      }
      const child = this.compileFilter(obj.not);
      return (file) => !child(file);
    }
    const structured = this.compileStructuredFilter(obj);
    if (structured !== null) {
      return structured;
    }

    throw new UnsupportedBaseFilterError(JSON.stringify(filter));
  }

  private compileStructuredFilter(filter: Record<string, unknown>): FilePredicate | null {
    const rawField = filter.field ?? filter.property ?? filter.key ?? filter.name ?? filter.column;
    const rawOperator = filter.operator ?? filter.op ?? filter.condition ?? filter.type;
    const rawValue = filter.value ?? filter.query ?? filter.text ?? filter.values;
    if (rawField === undefined || rawOperator === undefined) {
      return null;
    }
    this.assertSupportedField(String(rawField));
    this.assertSupportedOperator(String(rawOperator));
    return (file) => this.compareValues(
      this.readFieldValue(file, String(rawField)),
      String(rawOperator),
      rawValue,
      String(rawField)
    );
  }

  private compileFilterExpression(expression: string): FilePredicate {
    const normalizedExpression = expression.trim();
    const closingOuterParen = this.validateExpressionDelimiters(normalizedExpression);
    if (normalizedExpression.startsWith("(") && closingOuterParen === normalizedExpression.length - 1) {
      return this.compileFilterExpression(normalizedExpression.slice(1, -1));
    }
    if (normalizedExpression.startsWith("!") && !normalizedExpression.startsWith("!=")) {
      const operand = this.compileFilterExpression(normalizedExpression.slice(1));
      return (file) => !operand(file);
    }
    if (normalizedExpression === "true") return () => true;
    if (normalizedExpression === "false") return () => false;
    const inFolderMatch = normalizedExpression.match(/^file\.(?:inFolder|folderContains)\((.*)\)$/i);
    if (inFolderMatch) {
      const expected = this.unquote(String(inFolderMatch[1] ?? "").trim());
      return (file) => this.valueToText(this.readFieldValue(file, "file.folder")).includes(expected);
    }

    const hasTagMatch = normalizedExpression.match(/^file\.hasTag\((.*)\)$/i);
    if (hasTagMatch) {
      const expected = this.normalizeTag(this.unquote(String(hasTagMatch[1] ?? "").trim()));
      return (file) => this.readFileTags(file).has(expected);
    }

    const fileLinksContainsCurrentMatch = normalizedExpression.match(/^file\((.*)\)\.links\.contains\(file\)$/i);
    if (fileLinksContainsCurrentMatch) {
      const sourceLinkText = this.unquote(String(fileLinksContainsCurrentMatch[1] ?? "").trim());
      return (file) => this.fileLinksContainFile(sourceLinkText, file);
    }

    const methodMatch = normalizedExpression.match(/^(.+?)\.(contains|icontains|startsWith|endsWith)\((.*)\)$/i);
    if (methodMatch) {
      const field = String(methodMatch[1] ?? "").trim();
      this.assertSupportedField(field);
      const operator = String(methodMatch[2] ?? "").trim().toLowerCase();
      const expected = this.parseLiteral(String(methodMatch[3] ?? "").trim());
      if (operator === "contains") {
        return (file) => this.compareValues(this.readFieldValue(file, field), "contains", expected, field);
      }
      if (operator === "icontains") {
        return (file) => this.compareValues(this.readFieldValue(file, field), "icontains", expected, field);
      }
      if (operator === "startswith") {
        return (file) => this.compareValues(this.readFieldValue(file, field), "startsWith", expected, field);
      }
      if (operator === "endswith") {
        return (file) => this.compareValues(this.readFieldValue(file, field), "endsWith", expected, field);
      }
    }

    const match = normalizedExpression.match(/^(.+?)\s*(==|=|!=|>=|<=|>|<|contains|icontains|startsWith|endsWith|is|is-not|does-not-contain)\s*(.+)$/i);
    if (!match) throw new UnsupportedBaseFilterError(expression);

    const field = String(match[1] ?? "").trim();
    this.assertSupportedField(field);
    const operator = String(match[2] ?? "").trim().toLowerCase();
    const expected = this.parseLiteral(String(match[3] ?? "").trim());
    return (file) => this.compareValues(this.readFieldValue(file, field), operator, expected, field);
  }

  private assertSupportedField(field: string): void {
    if (!/^[\p{L}_][\p{L}\p{N}_ -]*(?:\.[\p{L}\p{N}_ -]+|\[['"][^'"]+['"]\])*$/u.test(field)) {
      throw new UnsupportedBaseFilterError(`Field expression: ${field}`);
    }
  }

  private assertSupportedOperator(operator: string): void {
    if (!["equals", "not-equals", "contains", "not-contains", "icontains", "starts-with", "ends-with", "gt", "gte", "lt", "lte"].includes(this.normalizeOperator(operator))) {
      throw new UnsupportedBaseFilterError(`Operator: ${operator}`);
    }
  }

  private validateExpressionDelimiters(expression: string): number {
    let depth = 0;
    let quote = "";
    let escaped = false;
    let closingOuterParen = -1;
    for (let index = 0; index < expression.length; index += 1) {
      const char = expression[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = "";
        continue;
      }
      if (char === '"' || char === "'") quote = char;
      else if (char === "(") depth += 1;
      else if (char === ")") {
        depth -= 1;
        if (depth < 0) throw new UnsupportedBaseFilterError(expression);
        if (depth === 0 && closingOuterParen < 0) closingOuterParen = index;
      } else if (char === "&" || char === "|") {
        throw new UnsupportedBaseFilterError(`Use YAML and/or filters for compound expressions: ${expression}`);
      } else if (char === ",") {
        throw new UnsupportedBaseFilterError(`Multiple function arguments: ${expression}`);
      }
    }
    if (depth !== 0 || quote) throw new UnsupportedBaseFilterError(expression);
    return closingOuterParen;
  }

  private readFieldValue(file: TFile, field: string): unknown {
    const normalized = this.normalizeFieldName(field);
    if (normalized === "file.folder") {
      const separator = file.path.lastIndexOf("/");
      return separator >= 0 ? file.path.slice(0, separator) : "";
    }
    if (normalized === "file.path") return file.path;
    if (normalized === "file.name") return file.basename;
    if (normalized === "file.ext" || normalized === "file.extension") return file.extension;

    if (normalized === "file.tags" || normalized === "tags") {
      return Array.from(this.readFileTags(file));
    }

    const property = normalized.startsWith("note.") ? normalized.slice("note.".length) : normalized;
    const propertyParts = property.split(".").map((part) => part.trim()).filter(Boolean);
    const propertyKey = propertyParts[0] ?? property;
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const key = Object.keys(frontmatter).find((candidate) =>
      candidate.trim().toLowerCase() === propertyKey.trim().toLowerCase()
    );
    const value = key ? (frontmatter as Record<string, unknown>)[key] : undefined;
    if (propertyParts.length <= 1) return value;
    return this.readNestedFieldValue(value, propertyParts.slice(1));
  }

  private fileLinksContainFile(sourceLinkText: string, targetFile: TFile): boolean {
    const sourceFile = this.resolveMarkdownFilePath(sourceLinkText);
    if (!(sourceFile instanceof TFile)) return false;
    const targetPath = String(targetFile.path ?? "").trim();
    if (!targetPath) return false;

    const linkedPaths = new Set<string>();
    const cache = this.app.metadataCache.getFileCache(sourceFile);
    for (const link of cache?.links ?? []) {
      const rawLink = String((link as Record<string, unknown>).link ?? "").trim();
      if (!rawLink) continue;
      const linkedFile = this.app.metadataCache.getFirstLinkpathDest(rawLink, sourceFile.path);
      if (linkedFile instanceof TFile) {
        linkedPaths.add(linkedFile.path);
      }
    }
    for (const linkedFile of this.extractFrontmatterLinkFiles(sourceFile)) {
      linkedPaths.add(linkedFile.path);
    }
    return linkedPaths.has(targetPath);
  }

  private extractFrontmatterLinkFiles(sourceFile: TFile): TFile[] {
    const frontmatter = this.app.metadataCache.getFileCache(sourceFile)?.frontmatter;
    if (!frontmatter || typeof frontmatter !== "object") return [];
    const files: TFile[] = [];
    const seen = new Set<string>();
    const visit = (value: unknown): void => {
      if (typeof value === "string") {
        const wikiRegex = /\[\[([^[\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
        for (const match of value.matchAll(wikiRegex)) {
          const linkText = String(match[1] ?? "").trim();
          if (!linkText) continue;
          const file = this.app.metadataCache.getFirstLinkpathDest(linkText, sourceFile.path);
          if (!(file instanceof TFile) || file.extension !== "md" || seen.has(file.path)) continue;
          seen.add(file.path);
          files.push(file);
        }
        return;
      }
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (value && typeof value === "object") {
        for (const nested of Object.values(value as Record<string, unknown>)) {
          visit(nested);
        }
      }
    };
    visit(frontmatter);
    return files;
  }

  private readNestedFieldValue(value: unknown, parts: string[]): unknown {
    let current = value;
    for (const part of parts) {
      const normalizedPart = part.trim().toLowerCase();
      if (!normalizedPart) continue;
      if (normalizedPart === "month" || normalizedPart === "day" || normalizedPart === "year") {
        current = this.readDatePart(current, normalizedPart);
        continue;
      }
      if (current && typeof current === "object" && !Array.isArray(current)) {
        const obj = current as Record<string, unknown>;
        const key = Object.keys(obj).find((candidate) => candidate.trim().toLowerCase() === normalizedPart);
        current = key ? obj[key] : undefined;
        continue;
      }
      return undefined;
    }
    return current;
  }

  private readDatePart(value: unknown, part: "month" | "day" | "year"): number | undefined {
    const date = this.coerceDate(value);
    if (!date) return undefined;
    if (part === "month") return date.getMonth() + 1;
    if (part === "day") return date.getDate();
    return date.getFullYear();
  }

  private normalizeFieldName(field: string): string {
    let normalized = String(field ?? "").trim();
    normalized = normalized.replace(/^note\[['"](.+?)['"]\]$/i, "note.$1");
    normalized = normalized.replace(/^properties\[['"](.+?)['"]\]$/i, "$1");
    normalized = normalized.replace(/^properties\./i, "");
    return normalized;
  }

  private compareValues(actual: unknown, operator: string, expectedRaw: unknown, field: string): boolean {
    const normalizedOperator = this.normalizeOperator(operator);
    const expected = this.valueToText(expectedRaw);
    const actualText = this.valueToText(actual);
    const actualItems = Array.isArray(actual) ? actual.map((item) => this.valueToText(item)) : [actualText];
    const expectedComparable = this.normalizeComparableText(expected, field);
    const actualComparableItems = actualItems.map((item) => this.normalizeComparableText(item, field));

    if (normalizedOperator === "equals") {
      return actualComparableItems.some((item) => item === expectedComparable);
    }
    if (normalizedOperator === "not-equals") {
      return actualComparableItems.every((item) => item !== expectedComparable);
    }
    if (normalizedOperator === "contains") {
      const lowerExpected = expectedComparable.toLowerCase();
      return actualComparableItems.some((item) => item.toLowerCase().includes(lowerExpected));
    }
    if (normalizedOperator === "not-contains") {
      const lowerExpected = expectedComparable.toLowerCase();
      return actualComparableItems.every((item) => !item.toLowerCase().includes(lowerExpected));
    }
    if (normalizedOperator === "icontains") {
      const lowerExpected = expectedComparable.toLowerCase();
      return actualComparableItems.some((item) => item.toLowerCase().includes(lowerExpected));
    }
    if (normalizedOperator === "starts-with") {
      return actualItems.some((item) => item.startsWith(expected));
    }
    if (normalizedOperator === "ends-with") {
      return actualItems.some((item) => item.endsWith(expected));
    }

    const actualDate = this.coerceDate(actual);
    const expectedDate = this.coerceDate(expectedRaw);
    if (actualDate && expectedDate) {
      const actualTime = this.startOfDayTime(actualDate);
      const expectedTime = this.startOfDayTime(expectedDate);
      if (normalizedOperator === "gt") return actualTime > expectedTime;
      if (normalizedOperator === "gte") return actualTime >= expectedTime;
      if (normalizedOperator === "lt") return actualTime < expectedTime;
      if (normalizedOperator === "lte") return actualTime <= expectedTime;
    }

    const actualNumber = Number(actualText);
    const expectedNumber = Number(expected);
    if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) {
      return false;
    }
    if (normalizedOperator === "gt") return actualNumber > expectedNumber;
    if (normalizedOperator === "gte") return actualNumber >= expectedNumber;
    if (normalizedOperator === "lt") return actualNumber < expectedNumber;
    if (normalizedOperator === "lte") return actualNumber <= expectedNumber;
    return false;
  }

  private normalizeOperator(operator: string): string {
    const normalized = String(operator ?? "").trim().toLowerCase();
    if (normalized === "==" || normalized === "=" || normalized === "is" || normalized === "equals") return "equals";
    if (normalized === "!=" || normalized === "is-not" || normalized === "not-equals") return "not-equals";
    if (normalized === "contains") return "contains";
    if (normalized === "does-not-contain" || normalized === "not-contains") return "not-contains";
    if (normalized === "icontains") return "icontains";
    if (normalized === "startswith" || normalized === "starts-with") return "starts-with";
    if (normalized === "endswith" || normalized === "ends-with") return "ends-with";
    if (normalized === ">") return "gt";
    if (normalized === ">=") return "gte";
    if (normalized === "<") return "lt";
    if (normalized === "<=") return "lte";
    return normalized;
  }

  private valueToText(value: unknown): string {
    if (Array.isArray(value)) {
      return value.map((item) => this.valueToText(item)).join(", ");
    }
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      if (typeof obj.path === "string") return obj.path;
      if (typeof obj.link === "string") return obj.link;
      if (typeof obj.value === "string" || typeof obj.value === "number" || typeof obj.value === "boolean") {
        return String(obj.value);
      }
      return Object.values(obj).map((item) => this.valueToText(item)).filter(Boolean).join(", ");
    }
    if (value == null) return "";
    return String(value);
  }

  private parseLiteral(value: string): unknown {
    const linkMatch = value.match(/^link\((.*)\)$/i);
    if (linkMatch) {
      const target = String(linkMatch[1] ?? "").trim();
      this.assertLiteralText(target);
      return this.unquote(target);
    }
    const todayPartMatch = value.match(/^today\(\)\.(month|day|year)$/i);
    if (todayPartMatch) {
      const part = String(todayPartMatch[1] ?? "").toLowerCase() as "month" | "day" | "year";
      return this.readDatePart(new Date(), part);
    }
    if (/^today\(\)$/i.test(value.trim())) {
      return this.formatDate(new Date());
    }
    this.assertLiteralText(value);
    const unquoted = this.unquote(value);
    if (/^(true|false)$/i.test(unquoted)) {
      return unquoted.toLowerCase() === "true";
    }
    const numberValue = Number(unquoted);
    if (unquoted.trim() !== "" && Number.isFinite(numberValue)) {
      return numberValue;
    }
    return unquoted;
  }

  private assertLiteralText(value: string): void {
    const quoted = (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"));
    if (!quoted && /[()]/.test(value)) {
      throw new UnsupportedBaseFilterError(`Literal expression: ${value}`);
    }
  }

  private normalizeComparableText(value: string, field: string): string {
    // File fields are literal metadata, not note links. In particular, paths
    // and folders must retain directories, extensions, and trailing slashes.
    if (this.normalizeFieldName(field).startsWith("file.")) return value;
    let text = String(value ?? "").trim();
    const wikiMatch = text.match(/^\[\[([^|\]#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]$/);
    if (wikiMatch) {
      text = String(wikiMatch[1] ?? "").trim();
    }
    const pathParts = text.replace(/\\/g, "/").split("/").filter(Boolean);
    const basename = pathParts[pathParts.length - 1] ?? text;
    return basename.replace(/\.md$/i, "").trim();
  }

  private coerceDate(value: unknown): Date | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const text = this.valueToText(value).trim();
    if (!text) return null;
    const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateOnly) {
      const year = Number(dateOnly[1]);
      const month = Number(dateOnly[2]);
      const day = Number(dateOnly[3]);
      const date = new Date(year, month - 1, day);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private startOfDayTime(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private unquote(value: string): string {
    return value.replace(/^["']|["']$/g, "");
  }

  private readFileTags(file: TFile): Set<string> {
    const tags = new Set<string>();
    const cache = this.app.metadataCache.getFileCache(file);
    for (const tag of cache?.tags ?? []) {
      tags.add(this.normalizeTag(tag.tag));
    }
    const frontmatterTags = (cache?.frontmatter ?? {})["tags"];
    const values = Array.isArray(frontmatterTags) ? frontmatterTags : [frontmatterTags];
    for (const value of values) {
      const text = String(value ?? "").trim();
      if (text) tags.add(this.normalizeTag(text));
    }
    return tags;
  }

  private normalizeTag(tag: string): string {
    const normalized = String(tag ?? "").trim();
    if (!normalized) return "";
    return normalized.startsWith("#") ? normalized : `#${normalized}`;
  }

  private safeDecodeURIComponent(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  private dedupeFiles(files: TFile[]): TFile[] {
    const out: TFile[] = [];
    const seen = new Set<string>();
    for (const file of files) {
      if (!(file instanceof TFile)) continue;
      if (file.extension !== "md") continue;
      if (seen.has(file.path)) continue;
      seen.add(file.path);
      out.push(file);
    }
    return out;
  }

  private buildFilterId(basePath: string, viewName: string | null): string {
    return `${basePath}${viewName ? `#${viewName}` : ""}`;
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- Re-enable dynamic-data lint rules after this module. */
