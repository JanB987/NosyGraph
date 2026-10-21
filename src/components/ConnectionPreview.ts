import { setStyles } from "../domStyle";

/** DOM-only drag overlay used by the extracted canvas engine. */
export class ConnectionPreview {
  private line?: HTMLDivElement;
  private tooltip?: HTMLDivElement;

  constructor(private readonly container: HTMLElement) {}

  showLine(options: { startX: number; startY: number; endX: number; endY: number; color: string; dashed: boolean }): void {
    this.line ??= this.container.createDiv({ cls: "nosygraph-connection-preview" });
    const dx = options.endX - options.startX;
    const dy = options.endY - options.startY;
    setStyles(this.line, {
      position: "absolute", pointerEvents: "none", zIndex: 10,
      left: `${options.startX}px`, top: `${options.startY}px`,
      width: `${Math.hypot(dx, dy)}px`, height: "0",
      borderTop: `2px ${options.dashed ? "dashed" : "solid"} ${options.color}`,
      transformOrigin: "0 0", transform: `rotate(${Math.atan2(dy, dx)}rad)`
    });
  }

  showTooltip(options: { text: string; x: number; y: number; tone: "default" | "remove" | "highlight" }): void {
    this.tooltip ??= this.container.createDiv({ cls: "nosygraph-connection-tooltip" });
    this.tooltip.textContent = options.text;
    this.tooltip.dataset.tone = options.tone;
    setStyles(this.tooltip, {
      position: "absolute", pointerEvents: "none", zIndex: 11,
      left: `${options.x + 12}px`, top: `${options.y + 12}px`,
      background: "var(--background-primary)", color: "var(--text-normal)",
      padding: "4px 8px", borderRadius: "4px"
    });
  }

  hideTooltip(): void {
    this.tooltip?.remove();
    this.tooltip = undefined;
  }

  clear(): void {
    this.line?.remove();
    this.line = undefined;
    this.hideTooltip();
  }
}
