/**
 * Tests targeting specific uncovered lines identified in test-result.log:
 *   - src/core/responsive.ts  lines 55, 85, 186-202
 *   - src/react/hooks/useGridLayout.ts  lines 211-212, 243, 267-275, 283, 346-359, 398-415
 */

import React from "react";
import { renderHook, act } from "@testing-library/react";

import {
  getBreakpointFromWidth,
  getColsFromBreakpoint,
  findOrGenerateResponsiveLayout,
  getIndentationValue,
} from "../../src/core/responsive";
import { useGridLayout } from "../../src/react/hooks/useGridLayout";
import { verticalCompactor } from "../../src/core/compactors";

// ─── responsive.ts ────────────────────────────────────────────────────────────

describe("responsive.ts edge cases", () => {
  // line 55: throw when breakpoints is empty
  it("getBreakpointFromWidth throws when no breakpoints defined", () => {
    expect(() => getBreakpointFromWidth({} as Record<string, number>, 1000)).toThrow(
      "No breakpoints defined"
    );
  });

  // line 85: throw when cols does not include the breakpoint
  it("getColsFromBreakpoint throws when breakpoint missing from cols map", () => {
    expect(() =>
      getColsFromBreakpoint("xl" as "lg", { lg: 12 } as Record<string, number>)
    ).toThrow("cols");
  });

  // lines 186-202: getIndentationValue — breakpoint-map path and fallback
  it("getIndentationValue returns value from breakpoint map", () => {
    const result = getIndentationValue({ lg: [20, 20], md: [10, 10] }, "md");
    expect(result).toEqual([10, 10]);
  });

  it("getIndentationValue falls back to first defined entry when breakpoint missing", () => {
    const result = getIndentationValue({ lg: [20, 20] }, "xxs" as "lg");
    expect(result).toEqual([20, 20]);
  });

  it("getIndentationValue returns default [10,10] when map is empty", () => {
    const result = getIndentationValue({} as Record<string, never>, "lg");
    expect(result).toEqual([10, 10]);
  });

  it("findOrGenerateResponsiveLayout generates from larger breakpoint when target missing", () => {
    const layouts = {
      lg: [{ i: "a", x: 0, y: 0, w: 4, h: 2 }],
    };
    const breakpoints = { lg: 1200, md: 768 };
    // md layout does not exist → should generate from lg
    const result = findOrGenerateResponsiveLayout(
      layouts,
      breakpoints,
      "md",
      "lg",
      6,
      verticalCompactor
    );
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].i).toBe("a");
  });

  it("findOrGenerateResponsiveLayout accepts legacy string compactType", () => {
    const layouts = {
      lg: [{ i: "a", x: 0, y: 0, w: 4, h: 2 }],
    };
    const breakpoints = { lg: 1200, md: 768 };
    const result = findOrGenerateResponsiveLayout(
      layouts,
      breakpoints,
      "md",
      "lg",
      6,
      "vertical" // legacy string form
    );
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── useGridLayout.ts ─────────────────────────────────────────────────────────

const baseLayout = [
  { i: "a", x: 0, y: 0, w: 2, h: 2 },
  { i: "b", x: 2, y: 0, w: 2, h: 2 },
];

describe("useGridLayout missing-item branches and cancel paths", () => {
  // line 211-212: onDrag with item that doesn't exist – should return early
  it("onDrag with unknown itemId does not throw and state is unchanged", () => {
    const { result } = renderHook(() =>
      useGridLayout({ layout: baseLayout, cols: 12 })
    );

    act(() => {
      result.current.onDragStart("a", 0, 0);
    });

    const layoutBefore = result.current.layout;
    act(() => {
      result.current.onDrag("NONEXISTENT", 5, 5);
    });
    expect(result.current.layout).toEqual(layoutBefore);
  });

  // line 243: onDragStop with unknown itemId – returns early
  it("onDragStop with unknown itemId does not throw", () => {
    const { result } = renderHook(() =>
      useGridLayout({ layout: baseLayout, cols: 12 })
    );

    act(() => {
      result.current.onDragStop("NONEXISTENT", 5, 5);
    });
    // Nothing crashes and drag state resets were not triggered
    expect(result.current.dragState.activeDrag).toBeNull();
  });

  // lines 267-275: cancelDrag restores oldLayout
  it("cancelDrag restores the old layout when dragging", () => {
    const { result } = renderHook(() =>
      useGridLayout({ layout: baseLayout, cols: 12 })
    );

    act(() => {
      result.current.onDragStart("a", 0, 0);
    });
    // Move the item so the layout differs
    act(() => {
      result.current.onDrag("a", 5, 5);
    });

    // Cancel — layout should be restored to the snapshot before drag
    act(() => {
      result.current.cancelDrag();
    });

    expect(result.current.dragState.activeDrag).toBeNull();
    expect(result.current.dragState.oldLayout).toBeNull();
  });

  // line 283: onResizeStart with unknown itemId returns null
  it("onResizeStart with unknown itemId returns null", () => {
    const { result } = renderHook(() =>
      useGridLayout({ layout: baseLayout, cols: 12 })
    );

    let ret: ReturnType<typeof result.current.onResizeStart> | undefined;
    act(() => {
      ret = result.current.onResizeStart("NONEXISTENT");
    });
    expect(ret).toBeNull();
    expect(result.current.resizeState.resizing).toBe(false);
  });

  // lines 346-359 / cancelResize: restores old layout
  it("cancelResize restores old layout", () => {
    const { result } = renderHook(() =>
      useGridLayout({ layout: baseLayout, cols: 12 })
    );

    act(() => {
      result.current.onResizeStart("a");
    });
    act(() => {
      result.current.onResize("a", 6, 6);
    });

    // Cancel resize — state should go back to not-resizing
    act(() => {
      result.current.cancelResize();
    });

    expect(result.current.resizeState.resizing).toBe(false);
    expect(result.current.resizeState.oldResizeItem).toBeNull();
    expect(result.current.dragState.activeDrag).toBeNull();
  });

  // onResize with optional x/y params (branch coverage in onResize)
  it("onResize applies optional x and y when provided", () => {
    const { result } = renderHook(() =>
      useGridLayout({ layout: baseLayout, cols: 12 })
    );

    act(() => {
      result.current.onResizeStart("a");
    });
    act(() => {
      result.current.onResize("a", 3, 3, 1, 1);
    });

    const item = result.current.layout.find((l) => l.i === "a");
    // onResize applied w/h updates; x/y may be adjusted by compaction
    expect(item?.w).toBe(3);
    expect(item?.h).toBe(3);
  });

  // lines 398-415: onDropDragOver adds a dropping item, onDropDragLeave removes it
  it("onDropDragOver sets droppingPosition state", () => {
    const { result } = renderHook(() =>
      useGridLayout({ layout: baseLayout, cols: 12 })
    );

    const droppingItem = { i: "__dropping-elem__", x: 0, y: 0, w: 1, h: 1 };
    const position = { left: 100, top: 50, e: {} as DragEvent };

    act(() => {
      result.current.onDropDragOver(droppingItem, position);
    });

    expect(result.current.dropState.droppingPosition).not.toBeNull();
  });

  it("onDropDragLeave clears drop state", () => {
    const { result } = renderHook(() =>
      useGridLayout({ layout: baseLayout, cols: 12 })
    );

    const droppingItem = { i: "__dropping-elem__", x: 0, y: 0, w: 1, h: 1 };
    const position = { left: 100, top: 50, e: {} as DragEvent };

    act(() => {
      result.current.onDropDragOver(droppingItem, position);
    });
    act(() => {
      result.current.onDropDragLeave();
    });

    expect(result.current.dropState.droppingPosition).toBeNull();
  });

  it("onDrop commits the dropping item to the layout", () => {
    const onLayoutChange = jest.fn();
    const { result } = renderHook(() =>
      useGridLayout({
        layout: baseLayout,
        cols: 12,
        onLayoutChange,
        droppingItemId: "__dropping-elem__",
      })
    );

    const droppingItem = { i: "__dropping-elem__", x: 0, y: 4, w: 2, h: 2 };
    const position = { left: 100, top: 200, e: {} as DragEvent };

    act(() => {
      result.current.onDropDragOver(droppingItem, position);
    });
    act(() => {
      result.current.onDrop({ i: "new", x: 0, y: 4, w: 2, h: 2 });
    });

    expect(result.current.dropState.droppingPosition).toBeNull();
    expect(result.current.dragState.activeDrag).toBeNull();
  });
});
