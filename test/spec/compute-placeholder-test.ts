import { computePlaceholder } from "../../src/core/computePlaceholder";
import { getCompactor } from "../../src/core/compactors";

describe("computePlaceholder", () => {
  it("does not mutate the original layout and returns a placeholder item", () => {
    const layout = [
      { i: "a", x: 0, y: 0, w: 1, h: 1 },
      { i: "b", x: 1, y: 0, w: 1, h: 1 }
    ];

    const droppingItem = { i: "__drop", x: 0, y: 0, w: 1, h: 1 };

    const positionParams = {
      cols: 12,
      margin: [10, 10] as [number, number],
      maxRows: Infinity,
      rowHeight: 30,
      containerWidth: 1200,
      containerPadding: [10, 10] as [number, number]
    } as any;

    const compactor = getCompactor("vertical");

    // Freeze layout to ensure helper is pure
    Object.freeze(layout);

    const placeholder = computePlaceholder(
      layout as any,
      droppingItem as any,
      positionParams,
      compactor,
      {
        clientX: 100,
        clientY: 100,
        containerRect: { left: 0, top: 0 } as any
      }
    );

    expect(placeholder).toBeDefined();
    expect(placeholder.i).toBe("__external-placeholder__");
    // Original layout must remain unchanged
    expect(layout).toEqual([
      { i: "a", x: 0, y: 0, w: 1, h: 1 },
      { i: "b", x: 1, y: 0, w: 1, h: 1 }
    ]);
  });
});
