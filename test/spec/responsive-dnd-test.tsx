import React from "react";
import { act, render } from "@testing-library/react";

import {
  ResponsiveGridLayout,
  type Layout,
  type LayoutItem
} from "../../src/react/index";
import { setNativeFallbackOverride } from "../../src/react/dnd/runtime";

function dispatchMouseEvent(
  target: EventTarget,
  type: string,
  overrides: MouseEventInit = {}
) {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      ...overrides
    })
  );
}

function simulateDrag(
  element: Element,
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  act(() => {
    dispatchMouseEvent(element, "mousedown", {
      clientX: start.x,
      clientY: start.y
    });
    dispatchMouseEvent(document, "mousemove", {
      clientX: end.x,
      clientY: end.y
    });
    dispatchMouseEvent(document, "mouseup", {
      clientX: end.x,
      clientY: end.y
    });
  });
}

function simulateResize(
  handle: Element,
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  act(() => {
    dispatchMouseEvent(handle, "mousedown", {
      clientX: start.x,
      clientY: start.y
    });
    dispatchMouseEvent(document, "mousemove", {
      clientX: end.x,
      clientY: end.y
    });
    dispatchMouseEvent(document, "mouseup", {
      clientX: end.x,
      clientY: end.y
    });
  });
}

function getLastLayoutsArg(callback: jest.Mock) {
  const lastCall = callback.mock.calls[callback.mock.calls.length - 1] as [
    Layout,
    Record<string, Layout>
  ];
  expect(lastCall).toBeDefined();
  return lastCall[1];
}

describe("ResponsiveGridLayout dnd integration", () => {
  beforeAll(() => {
    setNativeFallbackOverride(true);
  });

  afterAll(() => {
    setNativeFallbackOverride(null);
  });

  const breakpoints = { md: 996, lg: 1200 } as const;
  const cols = { md: 10, lg: 12 } as const;
  const layouts = {
    lg: [{ i: "a", x: 0, y: 0, w: 2, h: 2 }]
  };

  it("forwards drag lifecycle and updates the current breakpoint layout", () => {
    const onDragStart = jest.fn();
    const onDragStop = jest.fn();
    const onLayoutChange = jest.fn();

    const { container } = render(
      <ResponsiveGridLayout
        width={1300}
        breakpoints={breakpoints}
        cols={cols}
        layouts={layouts}
        onDragStart={onDragStart}
        onDragStop={onDragStop}
        onLayoutChange={onLayoutChange}
        dragConfig={{ threshold: 0 }}
      >
        <div key="a">a</div>
      </ResponsiveGridLayout>
    );

    onDragStart.mockClear();
    onDragStop.mockClear();
    onLayoutChange.mockClear();

    const gridItem = container.querySelector(".react-grid-item");
    expect(gridItem).toBeTruthy();

    simulateDrag(gridItem!, { x: 40, y: 40 }, { x: 260, y: 40 });

    expect(onDragStart).toHaveBeenCalled();
    expect(onDragStop).toHaveBeenCalled();
    expect(onLayoutChange).toHaveBeenCalled();

    const responsiveLayouts = getLastLayoutsArg(onLayoutChange);
    expect(responsiveLayouts.lg).toEqual(
      expect.arrayContaining([expect.objectContaining({ i: "a" })])
    );
  });

  it("forwards resize lifecycle callbacks for the current breakpoint layout", () => {
    const onResizeStart = jest.fn();
    const onResize = jest.fn();
    const onResizeStop = jest.fn();

    const { container } = render(
      <ResponsiveGridLayout
        width={1300}
        breakpoints={breakpoints}
        cols={cols}
        layouts={layouts}
        onResizeStart={onResizeStart}
        onResize={onResize}
        onResizeStop={onResizeStop}
        resizeConfig={{ handles: ["e"] }}
      >
        <div key="a">a</div>
      </ResponsiveGridLayout>
    );

    onResizeStart.mockClear();
    onResizeStop.mockClear();

    const handle = container.querySelector(".react-resizable-handle-e");
    expect(handle).toBeTruthy();

    simulateResize(handle!, { x: 100, y: 30 }, { x: 1000, y: 30 });

    expect(onResizeStart).toHaveBeenCalled();
    expect(onResize).toHaveBeenCalled();
    expect(onResizeStop).toHaveBeenCalled();
    const lastResizeStop = onResizeStop.mock.calls[
      onResizeStop.mock.calls.length - 1
    ] as [Layout, LayoutItem | null, LayoutItem | null];
    const [, , resizedItem] = lastResizeStop;
    expect(resizedItem).toEqual(expect.objectContaining({ i: "a" }));
  });

  it("retains the interacted lg layout when switching to a generated md breakpoint", () => {
    const onLayoutChange = jest.fn();
    const onBreakpointChange = jest.fn();

    const { container, rerender } = render(
      <ResponsiveGridLayout
        width={1300}
        breakpoints={breakpoints}
        cols={cols}
        layouts={layouts}
        onLayoutChange={onLayoutChange}
        onBreakpointChange={onBreakpointChange}
        dragConfig={{ threshold: 0 }}
      >
        <div key="a">a</div>
      </ResponsiveGridLayout>
    );

    onLayoutChange.mockClear();
    onBreakpointChange.mockClear();

    const gridItem = container.querySelector(".react-grid-item");
    expect(gridItem).toBeTruthy();

    simulateDrag(gridItem!, { x: 40, y: 40 }, { x: 260, y: 40 });
    expect(onLayoutChange).toHaveBeenCalled();

    rerender(
      <ResponsiveGridLayout
        width={1000}
        breakpoints={breakpoints}
        cols={cols}
        layouts={layouts}
        onLayoutChange={onLayoutChange}
        onBreakpointChange={onBreakpointChange}
        dragConfig={{ threshold: 0 }}
      >
        <div key="a">a</div>
      </ResponsiveGridLayout>
    );

    expect(onBreakpointChange).toHaveBeenCalledWith("md", 10);

    const responsiveLayouts = getLastLayoutsArg(onLayoutChange);
    expect(responsiveLayouts.lg).toBeDefined();
    expect(responsiveLayouts.md).toBeDefined();

    const lgItem = responsiveLayouts.lg?.find((item) => item.i === "a");
    const mdItem = responsiveLayouts.md?.find((item) => item.i === "a");
    expect(lgItem?.x).toBeGreaterThan(0);
    expect(mdItem).toBeDefined();
  });
});
