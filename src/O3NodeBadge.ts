import { App, TFile } from "obsidian";
import { O3LinkType } from "./O3LinkType";
import type { GraphEngine } from "./GraphEngine";
const DEBUG_LOGS = false;

export class O3NodeBadge {
  private badgeElement: HTMLDivElement | null = null;

  constructor(
    private nodeElement: HTMLElement,
    private nodeFile: TFile,
    private sourceNodeId: string,
    private linkType: O3LinkType,
    private app: App,
    private graphEngine: GraphEngine
  ) {}

  render(): void {
    this.badgeElement = document.createElement("div");
    this.badgeElement.className = "o3-node-badge";
    this.badgeElement.textContent = this.linkType.key;
    this.badgeElement.style.left = "0";
    this.badgeElement.style.top = "0";
    this.badgeElement.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.altKey) {
        this.onAltClick();
      } else if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
        this.onCtrlClick();
      } else {
        this.onClick();
      }
    });

    this.nodeElement.appendChild(this.badgeElement);
  }

  private onClick(): void {
    if (DEBUG_LOGS) {
      console.log(`[Badge] Clicked ${this.linkType.key} on ${this.nodeFile.name}`);
    }

    this.graphEngine.expandFromNode(
      this.nodeFile,
      this.linkType,
      this.sourceNodeId
    );
  }

  private onAltClick(): void {
    this.graphEngine.requestBadgeLinkInput(this.sourceNodeId, this.linkType);
  }

  private onCtrlClick(): void {
    void this.graphEngine.expandLinkTypeChainFromNode(
      this.nodeFile,
      this.linkType,
      this.sourceNodeId
    );
  }
}
