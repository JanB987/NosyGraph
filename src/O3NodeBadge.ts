/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- Obsidian DOM helper return types are validated by runtime element creation in this small badge wrapper. */
import { O3LinkType } from "./O3LinkType";
import { setStyle } from "./domStyle";

export type O3NodeBadgeIntent =
  | "toggle-badge"
  | "open-badge-input"
  | "expand-badge-chain";

export class O3NodeBadge {
  private badgeElement: HTMLElement | null = null;

  constructor(
    private nodeElement: HTMLElement,
    private linkType: O3LinkType,
    private onIntent: (intent: O3NodeBadgeIntent) => void
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
    this.onIntent("toggle-badge");
  }

  private onAltClick(): void {
    this.onIntent("open-badge-input");
  }

  private onCtrlClick(): void {
    this.onIntent("expand-badge-chain");
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- Re-enable Obsidian DOM helper lint rules after this badge wrapper. */
