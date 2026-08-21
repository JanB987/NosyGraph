type StyleValue = string | number | null | undefined;

function toCssPropertyName(property: string): string {
  return property.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

export function setStyle(element: HTMLElement | SVGElement, property: string, value: StyleValue): void {
  element.style.setProperty(toCssPropertyName(property), value == null ? "" : String(value));
}

export function setStyles(element: HTMLElement | SVGElement, styles: Record<string, StyleValue>): void {
  Object.entries(styles).forEach(([property, value]) => {
    setStyle(element, property, value);
  });
}
