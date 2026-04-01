/**
 * Collision detection utilities for grid layouts.
 *
 * These functions determine if and where layout items overlap.
 */

import type { Layout, LayoutItem } from "./types.js";

export interface CollisionBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function getCollisionBounds(
  item: Pick<LayoutItem, "x" | "y" | "w" | "h">
): CollisionBounds {
  return {
    left: item.x,
    right: item.x + item.w,
    top: item.y,
    bottom: item.y + item.h
  };
}

export function collidesBounds(
  bounds: CollisionBounds,
  item: Pick<LayoutItem, "x" | "y" | "w" | "h"> & Partial<Pick<LayoutItem, "i">>
): boolean {
  if (bounds.right <= item.x) return false;
  if (bounds.left >= item.x + item.w) return false;
  if (bounds.bottom <= item.y) return false;
  if (bounds.top >= item.y + item.h) return false;
  return true;
}

/**
 * Check if two layout items collide (overlap).
 *
 * Two items collide if their bounding boxes overlap and they are
 * not the same item.
 *
 * @param l1 - First layout item
 * @param l2 - Second layout item
 * @returns true if the items collide
 */
export function collides(l1: LayoutItem, l2: LayoutItem): boolean {
  // Same element - can't collide with itself
  if (l1.i === l2.i) return false;

  return collidesBounds(getCollisionBounds(l1), l2);
}

/**
 * Find the first item in the layout that collides with the given item.
 *
 * @param layout - Layout to search
 * @param layoutItem - Item to check for collisions
 * @returns The first colliding item, or undefined if none
 */
export function getFirstCollision(
  layout: Layout,
  layoutItem: LayoutItem
): LayoutItem | undefined {
  for (let i = 0; i < layout.length; i++) {
    const item = layout[i];
    if (item !== undefined && collides(item, layoutItem)) {
      return item;
    }
  }
  return undefined;
}

/**
 * Find all items in the layout that collide with the given item.
 *
 * @param layout - Layout to search
 * @param layoutItem - Item to check for collisions
 * @returns Array of all colliding items (may be empty)
 */
export function getAllCollisions(
  layout: Layout,
  layoutItem: LayoutItem
): LayoutItem[] {
  return layout.filter((l): l is LayoutItem => collides(l, layoutItem));
}
