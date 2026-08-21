// Indexed representation of vault nodes and link relationships.

import type { GraphNode } from "../core/types.js";

export interface VaultIndexSnapshot {
  version: 1;
  nodes: GraphNode[];
  outgoingLinks: Array<[string, string[]]>;
  propertyOutgoingLinks: Array<[string, Array<[string, string[]]>]>;
  properties: string[];
}

export class VaultIndex {
  private nodes = new Map<string, GraphNode>();
  private outgoingLinks = new Map<string, Set<string>>();
  private incomingLinks = new Map<string, Set<string>>();
  private propertyOutgoingLinks = new Map<string, Map<string, Set<string>>>();
  private propertyIncomingLinks = new Map<string, Map<string, Set<string>>>();
  private properties = new Set<string>();

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
    if (!this.outgoingLinks.has(node.id)) {
      this.outgoingLinks.set(node.id, new Set<string>());
    }
    if (!this.incomingLinks.has(node.id)) {
      this.incomingLinks.set(node.id, new Set<string>());
    }
  }

  removeNode(nodeId: string): void {
    this.nodes.delete(nodeId);

    const outgoingTargets = this.outgoingLinks.get(nodeId);
    if (outgoingTargets) {
      for (const target of outgoingTargets) {
        this.incomingLinks.get(target)?.delete(nodeId);
      }
    }
    this.outgoingLinks.delete(nodeId);

    const incomingSources = this.incomingLinks.get(nodeId);
    if (incomingSources) {
      for (const source of incomingSources) {
        this.outgoingLinks.get(source)?.delete(nodeId);
      }
    }
    this.incomingLinks.delete(nodeId);

    for (const [property, outgoingBySource] of this.propertyOutgoingLinks.entries()) {
      const propertyTargets = outgoingBySource.get(nodeId);
      if (propertyTargets) {
        for (const target of propertyTargets) {
          this.propertyIncomingLinks.get(property)?.get(target)?.delete(nodeId);
        }
        outgoingBySource.delete(nodeId);
      }

      for (const [source, targets] of outgoingBySource.entries()) {
        if (targets.delete(nodeId) && targets.size === 0) {
          outgoingBySource.delete(source);
        }
      }
    }

    for (const incomingByTarget of this.propertyIncomingLinks.values()) {
      incomingByTarget.delete(nodeId);
    }

    this.refreshPropertiesFromNodes();
  }

  addEdge(source: string, target: string): void {
    if (!this.outgoingLinks.has(source)) {
      this.outgoingLinks.set(source, new Set<string>());
    }
    if (!this.incomingLinks.has(target)) {
      this.incomingLinks.set(target, new Set<string>());
    }
    this.outgoingLinks.get(source)!.add(target);
    this.incomingLinks.get(target)!.add(source);
  }

  addProperty(property: string): void {
    const normalizedProperty = property.trim();
    if (!normalizedProperty) {
      return;
    }

    this.properties.add(normalizedProperty);
    if (!this.propertyOutgoingLinks.has(normalizedProperty)) {
      this.propertyOutgoingLinks.set(normalizedProperty, new Map<string, Set<string>>());
    }
    if (!this.propertyIncomingLinks.has(normalizedProperty)) {
      this.propertyIncomingLinks.set(normalizedProperty, new Map<string, Set<string>>());
    }
  }

  addPropertyEdge(property: string, source: string, target: string): void {
    const normalizedProperty = property.trim();
    if (!normalizedProperty) {
      return;
    }

    this.addProperty(normalizedProperty);
    const outgoing = this.propertyOutgoingLinks.get(normalizedProperty)!;
    const incoming = this.propertyIncomingLinks.get(normalizedProperty)!;

    if (!outgoing.has(source)) {
      outgoing.set(source, new Set<string>());
    }
    if (!incoming.has(target)) {
      incoming.set(target, new Set<string>());
    }

    outgoing.get(source)!.add(target);
    incoming.get(target)!.add(source);
  }

  getNode(nodeId: string): GraphNode | undefined {
    return this.nodes.get(nodeId);
  }

  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  // Backward-compatible alias for older callers.
  getNodes(): GraphNode[] {
    return this.getAllNodes();
  }

  getOutgoingLinks(nodeId: string): string[] {
    return Array.from(this.outgoingLinks.get(nodeId) ?? []);
  }

  getIncomingLinks(nodeId: string): string[] {
    return Array.from(this.incomingLinks.get(nodeId) ?? []);
  }

  getProperties(): string[] {
    return Array.from(this.properties).sort((left, right) => left.localeCompare(right));
  }

  getPropertyOutgoingLinks(property: string, nodeId: string): string[] {
    return Array.from(this.propertyOutgoingLinks.get(property)?.get(nodeId) ?? []);
  }

  getPropertyIncomingLinks(property: string, nodeId: string): string[] {
    return Array.from(this.propertyIncomingLinks.get(property)?.get(nodeId) ?? []);
  }

  getEdgeCount(): number {
    let count = 0;
    for (const targets of this.outgoingLinks.values()) {
      count += targets.size;
    }
    for (const sourceMap of this.propertyOutgoingLinks.values()) {
      for (const targets of sourceMap.values()) {
        count += targets.size;
      }
    }
    return count;
  }

  replaceNode(node: GraphNode): void {
    this.addNode(node);
    this.refreshPropertiesFromNodes();
  }

  replaceRelationsForSource(
    source: string,
    markdownTargets: string[],
    propertyTargets: Record<string, string[]>,
  ): void {
    const previousOutgoing = this.outgoingLinks.get(source);
    if (previousOutgoing) {
      for (const target of previousOutgoing) {
        this.incomingLinks.get(target)?.delete(source);
      }
    }
    this.outgoingLinks.set(source, new Set<string>());
    for (const target of markdownTargets) {
      this.addEdge(source, target);
    }

    for (const [property, sourceMap] of this.propertyOutgoingLinks.entries()) {
      const previousTargets = sourceMap.get(source);
      if (!previousTargets) {
        continue;
      }

      for (const target of previousTargets) {
        this.propertyIncomingLinks.get(property)?.get(target)?.delete(source);
      }
      sourceMap.delete(source);
    }

    for (const [property, targets] of Object.entries(propertyTargets)) {
      for (const target of targets) {
        this.addPropertyEdge(property, source, target);
      }
    }

    this.refreshPropertiesFromNodes();
  }

  replaceAllPropertyRelations(propertyTargetsBySource: Record<string, Record<string, string[]>>): void {
    this.propertyOutgoingLinks = new Map<string, Map<string, Set<string>>>();
    this.propertyIncomingLinks = new Map<string, Map<string, Set<string>>>();
    this.refreshPropertiesFromNodes();

    for (const [source, propertyTargets] of Object.entries(propertyTargetsBySource)) {
      for (const [property, targets] of Object.entries(propertyTargets)) {
        for (const target of targets) {
          this.addPropertyEdge(property, source, target);
        }
      }
    }

    this.refreshPropertiesFromNodes();
  }

  toSnapshot(): VaultIndexSnapshot {
    return {
      version: 1,
      nodes: this.getAllNodes().map((node) => ({
        ...node,
        metadata: { ...node.metadata },
      })),
      outgoingLinks: Array.from(this.outgoingLinks.entries()).map(([source, targets]) => [
        source,
        Array.from(targets),
      ]),
      propertyOutgoingLinks: Array.from(this.propertyOutgoingLinks.entries()).map(
        ([property, sourceMap]) => [
          property,
          Array.from(sourceMap.entries()).map(([source, targets]) => [source, Array.from(targets)]),
        ],
      ),
      properties: this.getProperties(),
    };
  }

  static fromSnapshot(snapshot: VaultIndexSnapshot): VaultIndex {
    const index = new VaultIndex();

    for (const node of snapshot.nodes ?? []) {
      index.addNode({
        ...node,
        metadata: { ...(node.metadata ?? {}) },
      });
    }

    for (const [source, targets] of snapshot.outgoingLinks ?? []) {
      for (const target of targets) {
        index.addEdge(source, target);
      }
    }

    for (const property of snapshot.properties ?? []) {
      index.addProperty(property);
    }

    for (const [property, sourceEntries] of snapshot.propertyOutgoingLinks ?? []) {
      for (const [source, targets] of sourceEntries) {
        for (const target of targets) {
          index.addPropertyEdge(property, source, target);
        }
      }
    }

    return index;
  }

  private refreshPropertiesFromNodes(): void {
    this.properties = new Set<string>();
    for (const propertyMap of this.propertyOutgoingLinks.values()) {
      for (const targets of propertyMap.values()) {
        if (targets.size > 0) {
          break;
        }
      }
    }

    for (const node of this.nodes.values()) {
      for (const property of Object.keys(node.metadata ?? {})) {
        const normalizedProperty = property.trim();
        if (!normalizedProperty) {
          continue;
        }
        this.properties.add(normalizedProperty);
        if (!this.propertyOutgoingLinks.has(normalizedProperty)) {
          this.propertyOutgoingLinks.set(normalizedProperty, new Map<string, Set<string>>());
        }
        if (!this.propertyIncomingLinks.has(normalizedProperty)) {
          this.propertyIncomingLinks.set(normalizedProperty, new Map<string, Set<string>>());
        }
      }
    }

    for (const property of this.propertyOutgoingLinks.keys()) {
      this.properties.add(property);
    }
  }
}

