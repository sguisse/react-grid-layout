/**
 * Tests for resize visual constraints (#2235)
 *
 * The live implementation now owns resize interactions directly, so these tests
 * assert the integrated resize results instead of props passed to an external
 * wrapper.
 */

import React from "react";
import { act, render } from "@testing-library/react";

import ReactGridLayout, { type LayoutItem } from "../../src/legacy";
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

function getResizedItem(callback: jest.Mock): LayoutItem {
  const lastCall = callback.mock.calls[callback.mock.calls.length - 1] as [
    LayoutItem[],
    LayoutItem | null,
    LayoutItem | null
  ];
  const [, , newItem] = lastCall;
  expect(newItem).not.toBeNull();
  return newItem as LayoutItem;
}

describe("Resize Visual Constraints (#2235)", () => {
  beforeAll(() => {
    setNativeFallbackOverride(true);
  });

  afterAll(() => {
    setNativeFallbackOverride(null);
  });

  it("clamps width growth to maxW", () => {
    const onResize = jest.fn();
    const { container } = render(
      <ReactGridLayout
        cols={12}
        rowHeight={30}
        width={1200}
        onResize={onResize}
        resizeHandles={["w"]}
      >
        <div key="a" data-grid={{ x: 2, y: 0, w: 3, h: 2, minW: 2, maxW: 4 }}>
          a
        </div>
      </ReactGridLayout>
    );

    const handle = container.querySelector(".react-resizable-handle-w");
    expect(handle).toBeTruthy();

    simulateResize(handle!, { x: 200, y: 30 }, { x: -600, y: 30 });

    expect(onResize).toHaveBeenCalled();
    expect(getResizedItem(onResize)).toEqual(
      expect.objectContaining({ w: 4, h: 2 })
    );
  });

  it("clamps width shrinkage to minW", () => {
    const onResize = jest.fn();
    const { container } = render(
      <ReactGridLayout
        cols={12}
        rowHeight={30}
        width={1200}
        onResize={onResize}
        resizeHandles={["e"]}
      >
        <div key="a" data-grid={{ x: 0, y: 0, w: 3, h: 2, minW: 2 }}>
          a
        </div>
      </ReactGridLayout>
    );

    const handle = container.querySelector(".react-resizable-handle-e");
    expect(handle).toBeTruthy();

    simulateResize(handle!, { x: 200, y: 30 }, { x: -600, y: 30 });

    expect(onResize).toHaveBeenCalled();
    expect(getResizedItem(onResize)).toEqual(
      expect.objectContaining({ w: 2, h: 2 })
    );
  });

  it("clamps height growth to maxH", () => {
    const onResize = jest.fn();
    const { container } = render(
      <ReactGridLayout
        cols={12}
        rowHeight={30}
        width={1200}
        onResize={onResize}
        resizeHandles={["s"]}
      >
        <div key="a" data-grid={{ x: 0, y: 0, w: 3, h: 2, minH: 1, maxH: 3 }}>
          a
        </div>
      </ReactGridLayout>
    );

    const handle = container.querySelector(".react-resizable-handle-s");
    expect(handle).toBeTruthy();

    simulateResize(handle!, { x: 100, y: 60 }, { x: 100, y: 1000 });

    expect(onResize).toHaveBeenCalled();
    expect(getResizedItem(onResize)).toEqual(
      expect.objectContaining({ w: 3, h: 3 })
    );
  });

  it("allows unconstrained height growth when maxH is not set", () => {
    const onResize = jest.fn();
    const { container } = render(
      <ReactGridLayout
        cols={12}
        rowHeight={30}
        width={1200}
        onResize={onResize}
        resizeHandles={["s"]}
      >
        <div key="a" data-grid={{ x: 0, y: 0, w: 3, h: 2 }}>
          a
        </div>
      </ReactGridLayout>
    );

    const handle = container.querySelector(".react-resizable-handle-s");
    expect(handle).toBeTruthy();

    simulateResize(handle!, { x: 100, y: 60 }, { x: 100, y: 1000 });

    expect(onResize).toHaveBeenCalled();
    expect(getResizedItem(onResize).h).toBeGreaterThan(2);
  });
});
