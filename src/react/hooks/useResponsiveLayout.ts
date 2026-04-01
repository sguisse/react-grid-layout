/**
 * useResponsiveLayout hook
 *
 * Manages responsive breakpoints and layout generation for different screen sizes.
 * Extracts state management from ResponsiveReactGridLayout into a reusable hook.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { deepEqual } from "fast-equals";

import type {
  Layout,
  Breakpoint,
  Breakpoints,
  ResponsiveLayouts,
  Compactor
} from "../../core/types.js";
import { cloneLayout } from "../../core/layout.js";
import {
  getBreakpointFromWidth,
  getColsFromBreakpoint,
  findOrGenerateResponsiveLayout,
  sortBreakpoints
} from "../../core/responsive.js";
import { verticalCompactor } from "../../core/compactors.js";

export type DefaultBreakpoints = "lg" | "md" | "sm" | "xs" | "xxs";

export const DEFAULT_BREAKPOINTS: Breakpoints<DefaultBreakpoints> = {
  lg: 1200,
  md: 996,
  sm: 768,
  xs: 480,
  xxs: 0
};

export const DEFAULT_COLS: Breakpoints<DefaultBreakpoints> = {
  lg: 12,
  md: 10,
  sm: 6,
  xs: 4,
  xxs: 2
};

export interface UseResponsiveLayoutOptions<
  B extends Breakpoint = DefaultBreakpoints
> {
  width: number;
  breakpoint?: B;
  breakpoints?: Breakpoints<B>;
  cols?: Breakpoints<B>;
  layouts?: ResponsiveLayouts<B>;
  compactor?: Compactor;
  onBreakpointChange?: (newBreakpoint: B, cols: number) => void;
  onLayoutChange?: (layout: Layout, layouts: ResponsiveLayouts<B>) => void;
  onWidthChange?: (
    width: number,
    margin: readonly [number, number],
    cols: number,
    containerPadding: readonly [number, number] | null
  ) => void;
}

export interface UseResponsiveLayoutResult<
  B extends Breakpoint = DefaultBreakpoints
> {
  layout: Layout;
  layouts: ResponsiveLayouts<B>;
  breakpoint: B;
  cols: number;
  setLayoutForBreakpoint: (breakpoint: B, layout: Layout) => void;
  setLayouts: (layouts: ResponsiveLayouts<B>) => void;
  sortedBreakpoints: B[];
}

function cloneResponsiveLayouts<B extends Breakpoint>(
  layouts: ResponsiveLayouts<B>
): ResponsiveLayouts<B> {
  const cloned = {} as ResponsiveLayouts<B>;

  for (const breakpoint of Object.keys(layouts) as B[]) {
    const layout = layouts[breakpoint];
    if (layout) {
      (cloned as Record<B, Layout>)[breakpoint] = cloneLayout(layout);
    }
  }

  return cloned;
}

export function useResponsiveLayout<B extends Breakpoint = DefaultBreakpoints>(
  options: UseResponsiveLayoutOptions<B>
): UseResponsiveLayoutResult<B> {
  const {
    width,
    breakpoint: breakpointProp,
    breakpoints = DEFAULT_BREAKPOINTS as unknown as Breakpoints<B>,
    cols: colsConfig = DEFAULT_COLS as unknown as Breakpoints<B>,
    layouts: propsLayouts = {} as ResponsiveLayouts<B>,
    compactor = verticalCompactor,
    onBreakpointChange,
    onLayoutChange,
    onWidthChange
  } = options;

  const sortedBreakpoints = useMemo(
    () => sortBreakpoints(breakpoints) as B[],
    [breakpoints]
  );
  const initialBreakpoint = useMemo(
    () => breakpointProp ?? getBreakpointFromWidth(breakpoints, width),
    []
  );
  const [layoutsState, setLayoutsState] = useState<ResponsiveLayouts<B>>(() =>
    cloneResponsiveLayouts(propsLayouts)
  );

  const prevWidthRef = useRef(width);
  const prevBreakpointRef = useRef(initialBreakpoint);
  const prevBreakpointsRef = useRef(breakpoints);
  const prevColsRef = useRef(colsConfig);
  const prevPropsLayoutsRef = useRef(propsLayouts);
  const prevLayoutsRef = useRef(layoutsState);
  const layoutsRef = useRef(layoutsState);

  const currentBreakpoint = breakpointProp ?? getBreakpointFromWidth(breakpoints, width);
  const currentCols = getColsFromBreakpoint(currentBreakpoint, colsConfig);
  const propsLayoutsChanged = !deepEqual(propsLayouts, prevPropsLayoutsRef.current);

  const sourceLayouts = useMemo(
    () =>
      propsLayoutsChanged ? cloneResponsiveLayouts(propsLayouts) : layoutsState,
    [propsLayoutsChanged, propsLayouts, layoutsState]
  );

  const layout = useMemo(
    () =>
      findOrGenerateResponsiveLayout(
        sourceLayouts,
        breakpoints,
        currentBreakpoint,
        prevBreakpointRef.current,
        currentCols,
        compactor
      ),
    [sourceLayouts, breakpoints, currentBreakpoint, currentCols, compactor]
  );

  const effectiveLayouts = useMemo(() => {
    const currentLayout = sourceLayouts[currentBreakpoint];
    if (currentLayout && deepEqual(currentLayout, layout)) {
      return sourceLayouts;
    }

    return {
      ...sourceLayouts,
      [currentBreakpoint]: cloneLayout(layout)
    } as ResponsiveLayouts<B>;
  }, [sourceLayouts, currentBreakpoint, layout]);

  const setLayoutForBreakpoint = useCallback((breakpoint: B, layout: Layout) => {
    setLayoutsState((previousLayouts) => ({
      ...previousLayouts,
      [breakpoint]: cloneLayout(layout)
    }));
  }, []);

  const setLayouts = useCallback((layouts: ResponsiveLayouts<B>) => {
    setLayoutsState(cloneResponsiveLayouts(layouts));
  }, []);

  useEffect(() => {
    layoutsRef.current = layoutsState;
  }, [layoutsState]);

  useEffect(() => {
    if (!propsLayoutsChanged) {
      return;
    }

    const nextLayouts = cloneResponsiveLayouts(propsLayouts);
    setLayoutsState(nextLayouts);
    layoutsRef.current = nextLayouts;
    prevPropsLayoutsRef.current = propsLayouts;
  }, [propsLayoutsChanged, propsLayouts]);

  useEffect(() => {
    const widthChanged = width !== prevWidthRef.current;
    const breakpointChanged = currentBreakpoint !== prevBreakpointRef.current;
    const breakpointsChanged = !deepEqual(breakpoints, prevBreakpointsRef.current);
    const colsChanged = !deepEqual(colsConfig, prevColsRef.current);
    const layoutsChanged = !deepEqual(effectiveLayouts, layoutsRef.current);

    if (layoutsChanged) {
      setLayoutsState(effectiveLayouts);
      layoutsRef.current = effectiveLayouts;
    }

    if (widthChanged || breakpointChanged || breakpointsChanged || colsChanged) {
      onWidthChange?.(width, [10, 10], currentCols, null);

      if (breakpointChanged || breakpointsChanged || colsChanged) {
        onBreakpointChange?.(currentBreakpoint, currentCols);
      }
    }

    if (layoutsChanged && !propsLayoutsChanged) {
      onLayoutChange?.(layout, effectiveLayouts);
    }

    prevWidthRef.current = width;
    prevBreakpointRef.current = currentBreakpoint;
    prevBreakpointsRef.current = breakpoints;
    prevColsRef.current = colsConfig;
    prevLayoutsRef.current = effectiveLayouts;
    if (!propsLayoutsChanged) {
      prevPropsLayoutsRef.current = propsLayouts;
    }
  }, [
    width,
    currentBreakpoint,
    currentCols,
    breakpoints,
    colsConfig,
    effectiveLayouts,
    layout,
    onBreakpointChange,
    onLayoutChange,
    onWidthChange,
    propsLayouts,
    propsLayoutsChanged
  ]);

  return {
    layout,
    layouts: effectiveLayouts,
    breakpoint: currentBreakpoint,
    cols: currentCols,
    setLayoutForBreakpoint,
    setLayouts,
    sortedBreakpoints
  };
}

export default useResponsiveLayout;
