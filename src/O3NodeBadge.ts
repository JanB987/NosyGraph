import { App, TFile } from "obsidian";
import { O3LinkType } from "./O3LinkType";
import type { GraphEngine } from "./GraphEngine";
import { setStyle } from "./domStyle";

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
    this.badgeElement = this.nodeElement.createDiv({
      cls: "o3-node-badge",
      text: this.linkType.key
    });
    setStyle(this.badgeElement, "left", "0");
    setStyle(this.badgeElement, "top", "0");
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
  }

  private onClick(): void {
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
