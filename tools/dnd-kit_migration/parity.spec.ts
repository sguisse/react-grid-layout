import { test, expect } from "@playwright/test";

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

require("ts-node").register({
  transpileOnly: true,
  compilerOptions: {
    module: "commonjs",
    jsx: "react-jsx",
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    moduleResolution: "node"
  }
});

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (
    typeof request === "string" &&
    parent?.filename &&
    /^\.{1,2}\//.test(request) &&
    request.endsWith(".js")
  ) {
    const base = path.resolve(path.dirname(parent.filename), request);
    const candidates = [
      base.replace(/\.js$/, ".ts"),
      base.replace(/\.js$/, ".tsx"),
      path.join(base.replace(/\.js$/, ""), "index.ts"),
      path.join(base.replace(/\.js$/, ""), "index.tsx")
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const ROOT = process.cwd();
const load = relPath => require(path.join(ROOT, relPath));
const clone = value => JSON.parse(JSON.stringify(value));
const ids = layout => layout.map(item => item.i);

test("smoke import migrated react modules", () => {
  const modules = [
    ["dnd-react-layout/src/react/components/GridItem.tsx", "GridItem"],
    ["dnd-react-layout/src/react/components/GridLayout.tsx", "GridLayout"],
    ["dnd-react-layout/src/react/components/ResponsiveGridLayout.tsx", "ResponsiveGridLayout"],
    ["dnd-react-layout/src/react/hooks/useGridLayout.ts", "useGridLayout"],
    ["dnd-react-layout/src/react/hooks/useResponsiveLayout.ts", "useResponsiveLayout"],
    ["dnd-react-layout/src/react/hooks/useContainerWidth.ts", "useContainerWidth"]
  ];

  for (const [modulePath, exportName] of modules) {
    const mod = load(modulePath);
    expect(mod).toBeTruthy();
    expect(typeof (mod[exportName] ?? mod.default)).toBe("function");
  }
});

test("collision parity", () => {
  const original = load("src/core/collision.ts");
  const migrated = load("dnd-react-layout/src/core/collision.ts");

  const a = { i: "a", x: 0, y: 0, w: 2, h: 2 };
  const b = { i: "b", x: 1, y: 1, w: 2, h: 2 };
  const c = { i: "c", x: 2, y: 0, w: 3, h: 2 };
  const query = { i: "q", x: 0, y: 1, w: 2, h: 2 };
  const layout = [c, b, a, { i: "d", x: 5, y: 5, w: 1, h: 1 }];

  expect({
    ab: migrated.collides(a, b),
    ac: migrated.collides(a, c),
    self: migrated.collides(a, a)
  }).toEqual({
    ab: original.collides(a, b),
    ac: original.collides(a, c),
    self: original.collides(a, a)
  });

  expect(migrated.getFirstCollision(layout, query)).toEqual(
    original.getFirstCollision(layout, query)
  );
  expect(migrated.getAllCollisions(layout, query)).toEqual(
    original.getAllCollisions(layout, query)
  );
  expect(ids(migrated.getAllCollisions(layout, query))).toEqual(["b", "a"]);
});

test("calculate parity", () => {
  const original = load("src/core/calculate.ts");
  const migrated = load("dnd-react-layout/src/core/calculate.ts");

  const params = {
    margin: [7, 9],
    containerPadding: [5, 11],
    containerWidth: 1001,
    cols: 6,
    rowHeight: 30,
    maxRows: 20
  };

  const pack = mod => {
    const colWidth = mod.calcGridColWidth(params);
    return {
      colWidth,
      whPx: mod.calcGridItemWHPx(2, colWidth, 7),
      position: mod.calcGridItemPosition(params, 1, 2, 2, 3),
      dragPosition: mod.calcGridItemPosition(
        params,
        1,
        2,
        2,
        3,
        { left: 123.6, top: 87.2 },
        null
      ),
      resizePosition: mod.calcGridItemPosition(
        params,
        1,
        2,
        2,
        3,
        null,
        { left: 10.2, top: 20.6, width: 111.7, height: 222.2 }
      ),
      xy: mod.calcXY(params, 89, 171, 2, 3),
      whSe: mod.calcWH(params, 326, 108, 1, 2, "se"),
      whNw: mod.calcWH(params, 2000, 2000, 5, 19, "nw")
    };
  };

  expect(pack(migrated)).toEqual(pack(original));

  const marginParams = {
    margin: [1, 1],
    containerPadding: [10, 10],
    containerWidth: 1200,
    cols: 12,
    rowHeight: 30,
    maxRows: Infinity
  };
  const gaps = mod =>
    Array.from({ length: 11 }, (_, i) => {
      const current = mod.calcGridItemPosition(marginParams, i, 0, 1, 1);
      const next = mod.calcGridItemPosition(marginParams, i + 1, 0, 1, 1);
      return next.left - (current.left + current.width);
    });

  expect(gaps(migrated)).toEqual(gaps(original));
  expect(gaps(migrated).every(gap => gap === 1)).toBeTruthy();
});

test("compactors parity", () => {
  const original = load("src/core/compactors.ts");
  const migrated = load("dnd-react-layout/src/core/compactors.ts");

  const runVertical = mod => {
    const compareWith = clone([{ i: "a", x: 0, y: 0, w: 2, h: 2 }]);
    const item = clone({ i: "b", x: 0, y: 5, w: 2, h: 2 });
    return mod.compactItemVertical(compareWith, item, clone([...compareWith, item]), 10);
  };

  const runHorizontal = mod => {
    const compareWith = clone([{ i: "a", x: 0, y: 0, w: 10, h: 1 }]);
    const item = clone({ i: "b", x: 10, y: 0, w: 3, h: 1 });
    return mod.compactItemHorizontal(compareWith, item, 12, clone([...compareWith, item]));
  };

  const runResolver = mod => {
    const layout = clone([
      { i: "a", x: 0, y: 0, w: 2, h: 2 },
      { i: "b", x: 0, y: 2, w: 2, h: 2 },
      { i: "c", x: 0, y: 4, w: 2, h: 2 }
    ]);
    mod.resolveCompactionCollision(layout, layout[0], 2, "y");
    return layout;
  };

  expect(runVertical(migrated)).toEqual(runVertical(original));
  expect(runHorizontal(migrated)).toEqual(runHorizontal(original));
  expect(runResolver(migrated)).toEqual(runResolver(original));
});
