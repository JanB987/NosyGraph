/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- Obsidian DOM helper return types are validated by runtime element creation in this small badge wrapper. */
import type { O3LinkType } from "./O3LinkType";
import { getLinkTypeBadgeIconKind, renderLinkTypeBadgeIcon, type LinkTypeBadgeIconLookup } from "./LinkTypeBadgeIcon";
import { setStyle } from "./domStyle";

export type O3NodeBadgeIntent =
  | "toggle-badge"
  | "open-badge-input"
  | "expand-badge-chain";

export interface O3NodeBadgeModifiers {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export function resolveO3NodeBadgeIntent(
  modifiers: O3NodeBadgeModifiers
): O3NodeBadgeIntent {
  if (modifiers.altKey) return "open-badge-input";
  if ((modifiers.ctrlKey || modifiers.metaKey) && !modifiers.shiftKey) {
    return "expand-badge-chain";
  }
  return "toggle-badge";
}

/**
 * DOM badge interaction boundary. Definition identity and semantic type stay
 * on the LinkType; this class owns only icon/label presentation and modifier
 * event capture.
 */
export class O3NodeBadge {
  private badgeElement: HTMLElement | null = null;

  constructor(
    private nodeElement: HTMLElement,
    private linkType: O3LinkType,
    private onIntent: (intent: O3NodeBadgeIntent, modifiers?: O3NodeBadgeModifiers) => void,
    private getIcon: LinkTypeBadgeIconLookup
  ) {}

  render(): void {
    const badgeElement = this.nodeElement.createDiv();
    badgeElement.addClass("o3-node-badge");
    const iconKind = getLinkTypeBadgeIconKind(this.linkType);
    badgeElement.addClass(`o3-node-badge--${iconKind}`);
    badgeElement.dataset.o3BadgeSemantic = this.linkType.semantic;
    badgeElement.dataset.o3BadgeIcon = iconKind;
    const iconElement = badgeElement.createSpan({ cls: ["o3-node-badge-icon", `o3-node-badge-icon--${iconKind}`] });
    renderLinkTypeBadgeIcon(iconElement, iconKind, this.linkType.linkTypeIcon, this.getIcon);
    badgeElement.createSpan({
      cls: "o3-node-badge-label",
      text: this.linkType.key
    });
    this.badgeElement = badgeElement;
    setStyle(this.badgeElement, "left", "0");
    setStyle(this.badgeElement, "top", "0");
    this.badgeElement.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const modifiers = {
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey
      };
      this.onIntent(resolveO3NodeBadgeIntent(modifiers), modifiers);
    });
  }
}

/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- Re-enable Obsidian DOM helper lint rules after this badge wrapper. */
