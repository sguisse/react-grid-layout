/**
 * useContainerWidth hook
 *
 * Observes container width using ResizeObserver and provides
 * reactive width updates for responsive layouts.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type RefObject } from
"react";

export interface UseContainerWidthOptions {
  /**
   * If true, delays initial render until width is measured.
   * Useful for SSR or when you need accurate initial measurements.
   */
  measureBeforeMount?: boolean;

  /**
   * Initial width to use before measurement.
   * Defaults to 1280.
   */
  initialWidth?: number;
}

export interface UseContainerWidthResult {
  /**
   * Current container width in pixels.
   */
  width: number;

  /**
   * Whether the container has been measured at least once.
   */
  mounted: boolean;

  /**
   * Ref to attach to the container element.
   */
  containerRef: RefObject<HTMLDivElement | null>;

  /**
   * Manually trigger a width measurement.
   * Useful when the container size might change without a resize event.
   */
  measureWidth: () => void;
}

/**
 * Hook to observe and track container width.
 *
 * Replaces the WidthProvider HOC with a more composable approach.
 *
 * @example
 * ```tsx
 * function MyGrid() {
 *   const { width, containerRef, mounted } = useContainerWidth();
 *
 *   return (
 *     <div ref={containerRef}>
 *       {mounted && <GridLayout width={width} {...props} />}
 *     </div>
 *   );
 * }
 * ```
 */export function useContainerWidth(options: UseContainerWidthOptions = {}): UseContainerWidthResult {interface ContainerWidthSnapshot {width: number;mounted: boolean;measured: boolean;}function readContainerWidth(node: HTMLDivElement | null, fallback: number): number {return node ? node.offsetWidth : fallback;}function createContainerWidthSnapshot(width: number, mounted: boolean): ContainerWidthSnapshot {return { width, mounted, measured: mounted };}const { measureBeforeMount = false, initialWidth = 1280 } = options;const [width, setWidth] = useState(initialWidth);const [mounted, setMounted] = useState(!measureBeforeMount);const containerRef = useRef<HTMLDivElement | null>(null);const observerRef = useRef<ResizeObserver | null>(null);const measureWidth = useCallback(() => {const node = containerRef.current;if (node) {const newWidth = readContainerWidth(node, initialWidth);setWidth(newWidth);if (!mounted) {setMounted(true);}}}, [mounted, initialWidth]);useEffect(() => {const node = containerRef.current;if (!node) return;measureWidth();if (typeof ResizeObserver !== "undefined") {let rafId: number | null = null;observerRef.current = new ResizeObserver((entries) => {const entry = entries[0];if (entry) {const newWidth = entry.contentRect.width;if (rafId !== null) {cancelAnimationFrame(rafId);}rafId = requestAnimationFrame(() => {setWidth(newWidth);rafId = null;});}});observerRef.current.observe(node);

        return () => {
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
          }
          if (observerRef.current) {
            observerRef.current.disconnect();
            observerRef.current = null;
          }
        };
      }

      return () => {
        if (observerRef.current) {
          observerRef.current.disconnect();
          observerRef.current = null;
        }
      };
    }, [measureWidth]);

  const containerWidthSnapshot = createContainerWidthSnapshot(width, mounted);

  return {
    width: containerWidthSnapshot.width,
    mounted: containerWidthSnapshot.mounted,
    containerRef,
    measureWidth
  };
}



















































export default useContainerWidth;