/**
 * ResponsiveGridLayout component
 *
 * A responsive grid layout that automatically adjusts to container width.
 */

import React, {
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type ReactElement
} from "react";
import { deepEqual } from "fast-equals";

import type {
  Layout,
  LayoutItem,
  Breakpoint,
  Breakpoints,
  ResponsiveLayouts,
  Compactor
} from "../../core/types.js";
import { cloneLayout, correctBounds, bottom } from "../../core/layout.js";
import { getIndentationValue } from "../../core/responsive.js";
import { getCompactor } from "../../core/compactors.js";

import {
  useResponsiveLayout,
  DEFAULT_BREAKPOINTS,
  DEFAULT_COLS
} from "../hooks/useResponsiveLayout.js";
import { GridLayout, type GridLayoutProps } from "./GridLayout.js";

// ============================================================================
// Types
// ============================================================================

export interface ResponsiveGridLayoutProps<
  B extends Breakpoint = string
> extends Omit<GridLayoutProps, "gridConfig" | "layout" | "onLayoutChange"> {
  /** Current breakpoint (optional, auto-detected from width) */
  breakpoint?: B;
  /** Breakpoint definitions (name → min-width) */
  breakpoints?: Breakpoints<B>;
  /** Column counts per breakpoint */
  cols?: Breakpoints<B>;
  /** Layouts for each breakpoint */
  layouts?: ResponsiveLayouts<B>;
  /** Row height (default: 150) */
  rowHeight?: number;
  /** Maximum rows (default: Infinity) */
  maxRows?: number;
  /** Margin between items - can be fixed or per-breakpoint */
  margin?:
    | readonly [number, number]
    | Partial<Record<B, readonly [number, number]>>;
  /** Container padding - can be fixed or per-breakpoint */
  containerPadding?:
    | readonly [number, number]
    | Partial<Record<B, readonly [number, number] | null>>
    | null;
  /** Compactor for layout compaction */
  compactor?: Compactor;
  /** Called when breakpoint changes */
  onBreakpointChange?: (newBreakpoint: B, cols: number) => void;
  /** Called when layout changes */
  onLayoutChange?: (layout: Layout, layouts: ResponsiveLayouts<B>) => void;
  /** Called when width changes */
  onWidthChange?: (
    containerWidth: number,
    margin: readonly [number, number],
    cols: number,
    containerPadding: readonly [number, number] | null
  ) => void;
}

const noop = () => {};

function synchronizeLayoutWithChildren(
  initialLayout: Layout,
  children: React.ReactNode,
  cols: number,
  compactor: Compactor
): Layout {
  const layout: LayoutItem[] = [];

  React.Children.forEach(children, child => {
    if (!React.isValidElement(child) || child.key === null) return;
    const key = String(child.key);

    // Find existing layout item
    const existingItem = initialLayout.find(l => l.i === key);

    if (existingItem) {
      layout.push({
        ...existingItem,
        i: key
      });
      return;
    }

    const childProps = child.props as { "data-grid"?: Partial<LayoutItem> };
    const dataGrid = childProps["data-grid"];

    if (dataGrid) {
      layout.push({
        i: key,
        x: dataGrid.x ?? 0,
        y: dataGrid.y ?? 0,
        w: dataGrid.w ?? 1,
        h: dataGrid.h ?? 1,
        minW: dataGrid.minW,
        maxW: dataGrid.maxW,
        minH: dataGrid.minH,
        maxH: dataGrid.maxH,
        static: dataGrid.static,
        isDraggable: dataGrid.isDraggable,
        isResizable: dataGrid.isResizable,
        resizeHandles: dataGrid.resizeHandles,
        isBounded: dataGrid.isBounded
      });
      return;
    }

    layout.push({
      i: key,
      x: 0,
      y: bottom(layout),
      w: 1,
      h: 1
    });
  });

  // Correct bounds and compact - use compactor.compact() (#2213)
  const corrected = correctBounds(layout, { cols });
  return compactor.compact(corrected, cols);
}

// ============================================================================
// Component
// ============================================================================

/**
 * ResponsiveGridLayout - A responsive grid layout that adjusts to container width.
 */
export function ResponsiveGridLayout<B extends Breakpoint = string>(
  props: ResponsiveGridLayoutProps<B>
): ReactElement {
  const {
    children,
    width,
    breakpoint: breakpointProp,
    breakpoints = DEFAULT_BREAKPOINTS as unknown as Breakpoints<B>,
    cols: colsConfig = DEFAULT_COLS as unknown as Breakpoints<B>,
    layouts: propsLayouts = {} as ResponsiveLayouts<B>,
    rowHeight = 150,
    maxRows = Infinity,
    margin: marginProp = [10, 10] as readonly [number, number],
    containerPadding: containerPaddingProp = null,
    compactor: compactorProp,
    onBreakpointChange = noop,
    onLayoutChange = noop,
    onWidthChange = noop,
    ...restProps
  } = props;

  // Get compactor (use provided or default to vertical)
  const compactor = compactorProp ?? getCompactor("vertical");

  const {
    layout: responsiveLayout,
    layouts,
    breakpoint,
    cols,
    setLayouts
  } = useResponsiveLayout({
    width,
    breakpoint: breakpointProp,
    breakpoints,
    cols: colsConfig,
    layouts: propsLayouts,
    compactor
  });

  const prevWidthRef = useRef(width);
  const prevBreakpointRef = useRef(breakpoint);
  const prevBreakpointsRef = useRef(breakpoints);
  const prevColsRef = useRef(colsConfig);
  const prevCompactTypeRef = useRef(compactor.type);

  const currentMargin = useMemo(
    () =>
      getIndentationValue(
        marginProp as Parameters<typeof getIndentationValue>[0],
        breakpoint
      ),
    [marginProp, breakpoint]
  );

  const currentContainerPadding = useMemo(() => {
    if (containerPaddingProp === null) {
      return null;
    }

    return getIndentationValue(
      containerPaddingProp as Parameters<typeof getIndentationValue>[0],
      breakpoint
    );
  }, [containerPaddingProp, breakpoint]);

  const synchronizedLayout = useMemo(
    () =>
      synchronizeLayoutWithChildren(responsiveLayout, children, cols, compactor),
    [responsiveLayout, children, cols, compactor]
  );

  const effectiveLayouts = useMemo(() => {
    const currentLayout = layouts[breakpoint];
    if (currentLayout && deepEqual(currentLayout, synchronizedLayout)) {
      return layouts;
    }

    return {
      ...layouts,
      [breakpoint]: cloneLayout(synchronizedLayout)
    } as ResponsiveLayouts<B>;
  }, [layouts, breakpoint, synchronizedLayout]);

  useEffect(() => {
    if (deepEqual(effectiveLayouts, layouts)) {
      return;
    }

    setLayouts(effectiveLayouts);
  }, [effectiveLayouts, layouts, setLayouts]);

  useEffect(() => {
    const widthChanged = width !== prevWidthRef.current;
    const breakpointChanged = breakpoint !== prevBreakpointRef.current;
    const breakpointsChanged = !deepEqual(breakpoints, prevBreakpointsRef.current);
    const colsChanged = !deepEqual(colsConfig, prevColsRef.current);

    if (widthChanged || breakpointChanged || breakpointsChanged || colsChanged) {
      if (breakpointChanged || breakpointsChanged || colsChanged) {
        onBreakpointChange(breakpoint, cols);
        onLayoutChange(synchronizedLayout, effectiveLayouts);
      }

      onWidthChange(width, currentMargin, cols, currentContainerPadding);
    }

    prevWidthRef.current = width;
    prevBreakpointRef.current = breakpoint;
    prevBreakpointsRef.current = breakpoints;
    prevColsRef.current = colsConfig;
  }, [
    width,
    breakpoint,
    cols,
    breakpoints,
    colsConfig,
    currentMargin,
    currentContainerPadding,
    effectiveLayouts,
    synchronizedLayout,
    onBreakpointChange,
    onLayoutChange,
    onWidthChange
  ]);

  useEffect(() => {
    if (compactor.type === prevCompactTypeRef.current) {
      return;
    }

    prevCompactTypeRef.current = compactor.type;
    onLayoutChange(synchronizedLayout, effectiveLayouts);
  }, [compactor.type, synchronizedLayout, effectiveLayouts, onLayoutChange]);

  const handleLayoutChange = useCallback(
    (layout: Layout) => {
      const nextLayouts = {
        ...effectiveLayouts,
        [breakpoint]: cloneLayout(layout)
      } as ResponsiveLayouts<B>;

      setLayouts(nextLayouts);
      onLayoutChange(layout, nextLayouts);
    },
    [effectiveLayouts, breakpoint, setLayouts, onLayoutChange]
  );

  const gridConfig = useMemo(
    () => ({
      cols,
      rowHeight,
      maxRows,
      margin: currentMargin,
      containerPadding: currentContainerPadding
    }),
    [cols, rowHeight, maxRows, currentMargin, currentContainerPadding]
  );

  return (
    <GridLayout
      {...restProps}
      width={width}
      gridConfig={gridConfig}
      compactor={compactor}
      onLayoutChange={handleLayoutChange}
      layout={synchronizedLayout}
    >
      {children}
    </GridLayout>
  );
}

export default ResponsiveGridLayout;
