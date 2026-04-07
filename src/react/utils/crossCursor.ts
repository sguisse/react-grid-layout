/**
 * Cross-grid cursor utilities
 *
 * Provides functions to apply and remove a lucide "arrow-right-left" cursor
 * during cross-grid drag operations. Kept as module-scoped state so callers
 * can import and call these functions without needing React refs.
 */

let crossCursorStyle: HTMLStyleElement | null = null;
let crossCursorPrev: { html?: string; body?: string } | null = null;

export function applyCrossCursor(): void {
  if (typeof document === "undefined") return;
  if (crossCursorStyle) return;
  const css = `* { cursor: move !important; }`;
  const style = document.createElement("style");
  // maps to data-rgl-cross-cursor
  (style as any).dataset.rglCrossCursor = "true";
  style.textContent = css;
  document.head.appendChild(style);
  crossCursorStyle = style;

  // Save previous inline cursor styles so we can restore later
  crossCursorPrev = {
    html: document.documentElement.style.cursor || undefined,
    body: document.body.style.cursor || undefined
  };

  document.documentElement.style.setProperty("cursor", "move", "important");
  document.body.style.setProperty("cursor", "move", "important");
}

export function removeCrossCursor(): void {
  if (!crossCursorStyle && !crossCursorPrev) return;

  if (crossCursorStyle) crossCursorStyle.remove();
  crossCursorStyle = null;

  if (crossCursorPrev) {
    const prev = crossCursorPrev;
    if (prev.html) {
      document.documentElement.style.cursor = prev.html;
    } else {
      document.documentElement.style.removeProperty("cursor");
    }
    if (prev.body) {
      document.body.style.cursor = prev.body;
    } else {
      document.body.style.removeProperty("cursor");
    }
  } else {
    document.documentElement.style.removeProperty("cursor");
    document.body.style.removeProperty("cursor");
  }

  crossCursorPrev = null;
}
