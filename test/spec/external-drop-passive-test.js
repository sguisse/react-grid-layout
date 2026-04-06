// @flow
/* eslint-env jest */
import React from "react";
import TestUtils from "react-dom/test-utils";
import { render, act } from "@testing-library/react";
import { GridLayout as GridLayoutV2 } from "../../src/react/components/GridLayout";

describe("GridLayout external drop passive preview", function () {
  it("calls onExternalPreview during dragOver and does not inject placeholder into public layout", function () {
    const onLayoutChange = jest.fn();
    const onExternalPreview = jest.fn();

    const { container } = render(
      <GridLayoutV2
        gridConfig={{ cols: 12, rowHeight: 30 }}
        width={1200}
        layout={[{ i: "a", x: 0, y: 0, w: 2, h: 2 }]}
        dropConfig={{ enabled: true, defaultItem: { w: 1, h: 1 } }}
        externalDropMode={"passive"}
        onExternalPreview={onExternalPreview}
        onLayoutChange={onLayoutChange}
      >
        <div key="a">a</div>
      </GridLayoutV2>
    );

    // Clear initial mount call
    onLayoutChange.mockClear();

    const grid = container.querySelector(".react-grid-layout");

    act(() => {
      TestUtils.Simulate.dragEnter(grid, {
        clientX: 200,
        clientY: 100
      });
    });

    act(() => {
      TestUtils.Simulate.dragOver(grid, {
        currentTarget: {
          getBoundingClientRect: () => ({ left: 0, top: 0 })
        },
        clientX: 200,
        clientY: 100,
        nativeEvent: {
          target: document.createElement("div")
        }
      });
    });

    expect(onExternalPreview).toHaveBeenCalled();

    const layoutCalls = onLayoutChange.mock.calls;
    const hasDroppedItem = layoutCalls.some(call =>
      call[0].some(item => item.i === "__dropping-elem__")
    );

    expect(hasDroppedItem).toBe(false);
  });
});
