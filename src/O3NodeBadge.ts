/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- Obsidian DOM helper return types are validated by runtime element creation in this small badge wrapper. */
import { App, TFile } from "obsidian";
import { O3LinkType } from "./O3LinkType";
import type { GraphEngine } from "./GraphEngine";
import { setStyle } from "./domStyle";

export class O3NodeBadge {
  private badgeElement: HTMLElement | null = null;

  constructor(
    private nodeElement: HTMLElement,
    private nodeFile: TFile,
    private sourceNodeId: string,
    private linkType: O3LinkType,
    private app: App,
    private graphEngine: GraphEngine
  ) {}

  render(): void {
    const badgeElement = this.nodeElement.createEl("div");
    badgeElement.addClass("o3-node-badge");
    badgeElement.textContent = this.linkType.key;
    this.badgeElement = badgeElement;
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
/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- Re-enable Obsidian DOM helper lint rules after this badge wrapper. */
