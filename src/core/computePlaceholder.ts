/**
 * computePlaceholder.ts
 *
 * Pure helper to compute where an external-drop placeholder would land
 * without mutating layout state or emitting events. Returns a LayoutItem
 * representing the computed placement.
 */
import type {
  Layout,
  LayoutItem,
  Compactor
} from "./types.js";
import type { PositionParams } from "./calculate.js";
import {
  calcGridColWidth,
  calcGridItemWHPx,
  calcXY
} from "./calculate.js";
import { cloneLayout, cloneLayoutItem, correctBounds } from "./layout.js";

/**
 * Options for computePlaceholder
 */
export interface ComputePlaceholderOptions {
  dragOffsetX?: number;
  dragOffsetY?: number;
  transformScale?: number;
}

/**
 * Compute a passive placeholder position for an external drop without mutating
 * library state. The algorithm:
 *  - Map client coordinates -> pixel offset inside the grid
 *  - Convert pixels -> grid units (x,y) using calcXY
 *  - Insert a synthetic placeholder into a cloned layout and run the
 *    configured compactor on the clone to resolve collisions
 *  - Return the resulting placeholder item from the compacted layout
 */
export function computePlaceholder(
  layout: Layout,
  droppingItem: LayoutItem,
  positionParams: PositionParams,
  compactor: Compactor,
  opts: {
    clientX: number;
    clientY: number;
    containerRect: DOMRect;
    dragOffsetX?: number;
    dragOffsetY?: number;
    transformScale?: number;
  }
): LayoutItem {
  const { clientX, clientY, containerRect, dragOffsetX = 0, dragOffsetY = 0 } =
    opts ?? ({} as any);

  // Compute the pixel size & center offsets for the dropping item
  const colWidth = calcGridColWidth(positionParams);
  const itemPixelWidth = calcGridItemWHPx(
    droppingItem.w,
    colWidth,
    positionParams.margin[0]
  );
  const itemPixelHeight = calcGridItemWHPx(
    droppingItem.h,
    positionParams.rowHeight,
    positionParams.margin[1]
  );
  const itemCenterOffsetX = itemPixelWidth / 2;
  const itemCenterOffsetY = itemPixelHeight / 2;

  // Pointer relative to grid container (unscaled pixels)
  const rawGridX =
    clientX - containerRect.left + dragOffsetX - itemCenterOffsetX;
  const rawGridY =
    clientY - containerRect.top + dragOffsetY - itemCenterOffsetY;

  const clampedGridX = Math.max(0, rawGridX);
  const clampedGridY = Math.max(0, rawGridY);

  // Convert pixel coords -> grid units
  const { x: initialX, y: initialY } = calcXY(
    positionParams,
    clampedGridY,
    clampedGridX,
    droppingItem.w,
    droppingItem.h
  );

  const placeholderId = "__external-placeholder__";
  const placeholder: LayoutItem = {
    i: placeholderId,
    x: initialX,
    y: initialY,
    w: droppingItem.w,
    h: droppingItem.h
  };

  // Run compaction on a clone of the layout + placeholder so we don't mutate
  // anything in the live state. Use correctBounds before compaction.
  const cloned = cloneLayout(layout);
  const injected = [...cloned, cloneLayoutItem(placeholder)];
  // correctBounds mutates the provided items for performance; it's safe here
  // because we operate on a clone.
  const corrected = correctBounds(injected as any, { cols: positionParams.cols });
  const compacted = compactor.compact(corrected, positionParams.cols);

  // Find computed placeholder (fallback to the initial projection)
  const computed = compacted.find((it) => it?.i === placeholderId);
  if (computed) return cloneLayoutItem(computed);
  return placeholder;
}

export default computePlaceholder;
