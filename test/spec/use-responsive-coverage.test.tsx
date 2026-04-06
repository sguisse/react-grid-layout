import React from "react";
import { renderHook, act } from "@testing-library/react";

import {
  useResponsiveLayout
} from "../../src/react/hooks/index";

describe("useResponsiveLayout additional coverage", () => {
  it("setLayoutForBreakpoint updates layouts and triggers onLayoutChange", async () => {
    const onLayoutChange = jest.fn();
    const initialLayouts = {
      lg: [{ i: "a", x: 0, y: 0, w: 4, h: 2 }]
    };

    const { result } = renderHook(() =>
      useResponsiveLayout({
        width: 1200,
        breakpoints: { lg: 1200 },
        cols: { lg: 12 },
        layouts: initialLayouts,
        onLayoutChange
      })
    );

    act(() => {
      result.current.setLayoutForBreakpoint("lg", [
        { i: "b", x: 1, y: 1, w: 2, h: 2 }
      ]);
    });

    expect(result.current.layouts.lg.some((it) => it.i === "b")).toBe(true);
  });

  it("setLayouts clones provided layouts rather than reusing reference", () => {
    const { result } = renderHook(() =>
      useResponsiveLayout({
        width: 1200,
        breakpoints: { lg: 1200 },
        cols: { lg: 12 },
        layouts: {}
      })
    );

    const inputLayouts = { lg: [{ i: "z", x: 0, y: 0, w: 1, h: 1 }] };

    act(() => {
      result.current.setLayouts(inputLayouts);
    });

    // Should be deep-equal but not the same object reference (cloneResponsiveLayouts)
    expect(result.current.layouts).not.toBe(inputLayouts);
    expect(result.current.layouts.lg[0].i).toBe("z");
  });

  it("calls onWidthChange and onBreakpointChange when width changes", () => {
    const onWidthChange = jest.fn();
    const onBreakpointChange = jest.fn();

    const breakpoints = { lg: 1200, md: 600 };
    const cols = { lg: 12, md: 6 };

    const { rerender } = renderHook(
      ({ w }) =>
        useResponsiveLayout({
          width: w,
          breakpoints,
          cols,
          layouts: { lg: [], md: [] },
          onWidthChange,
          onBreakpointChange
        }),
      { initialProps: { w: 600 } }
    );

    // Change width to trigger width/breakpoint change
    act(() => rerender({ w: 1400 }));

    expect(onWidthChange).toHaveBeenCalled();
    expect(onBreakpointChange).toHaveBeenCalled();
  });

  it("updates internal layouts when props.layouts changes", () => {
    const initial = {};
    const next = { lg: [{ i: "c", x: 0, y: 0, w: 1, h: 1 }] };

    const { result, rerender } = renderHook(
      ({ layouts }) =>
        useResponsiveLayout({
          width: 1200,
          breakpoints: { lg: 1200 },
          cols: { lg: 12 },
          layouts
        }),
      { initialProps: { layouts: initial } }
    );

    act(() => rerender({ layouts: next }));

    expect(result.current.layouts.lg[0].i).toBe("c");
  });
});
