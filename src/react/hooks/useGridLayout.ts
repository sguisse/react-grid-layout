/**
 * useGridLayout hook
 *
 * Core hook for managing grid layout state, including drag, resize, and drop operations.
 * This extracts the state management logic from ReactGridLayout into a reusable hook.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { deepEqual } from "fast-equals";
import { logDebug } from "../utils/log.js";

import type {
  Layout,
  LayoutItem,
  DroppingPosition,
  Compactor,
  Mutable
} from "../../core/types.js";
import {
  cloneLayout,
  cloneLayoutItem,
  moveElement,
  correctBounds,
  bottom,
  getLayoutItem
} from "../../core/layout.js";
import { verticalCompactor } from "../../core/compactors.js";

export interface DragState {
  activeDrag: LayoutItem | null;
  oldDragItem: LayoutItem | null;
  oldLayout: Layout | null;
}

export interface ResizeState {
  resizing: boolean;
  oldResizeItem: LayoutItem | null;
  oldLayout: Layout | null;
}

export interface DropState {
  droppingDOMNode: React.ReactElement | null;
  droppingPosition: DroppingPosition | null;
}

export interface UseGridLayoutOptions {
  layout: Layout;
  cols: number;
  preventCollision?: boolean;
  onLayoutChange?: (layout: Layout) => void;
  compactor?: Compactor;
  droppingItemId?: string;
}

export interface UseGridLayoutResult {
  layout: Layout;
  setLayout: (layout: Layout) => void;
  dragState: DragState;
  resizeState: ResizeState;
  dropState: DropState;
  onDragStart: (itemId: string, x: number, y: number) => LayoutItem | null;
  onDrag: (itemId: string, x: number, y: number) => void;
  onDragStop: (itemId: string, x: number, y: number) => void;
  cancelDrag: () => void;
  onResizeStart: (itemId: string) => LayoutItem | null;
  onResize: (
    itemId: string,
    w: number,
    h: number,
    x?: number,
    y?: number
  ) => void;
  onResizeStop: (
    itemId: string,
    w: number,
    h: number,
    x?: number,
    y?: number
  ) => void;
  cancelResize: () => void;
  onDropDragOver: (droppingItem: LayoutItem, position: DroppingPosition) => void;
  onDropDragLeave: () => void;
  onDrop: (droppingItem: LayoutItem) => void;
  containerHeight: number;
  isInteracting: boolean;
  compactor: Compactor;
}

interface GridLayoutInteractionSnapshot {
  isDragging: boolean;
  isResizing: boolean;
  isDropping: boolean;
  isInteracting: boolean;
  activeDragId: string | null;
}

function createGridLayoutInteractionSnapshot(
  dragState: DragState,
  resizeState: ResizeState,
  dropState: DropState
): GridLayoutInteractionSnapshot {
  const isDragging = dragState.activeDrag !== null;
  const isResizing = resizeState.resizing;
  const isDropping = dropState.droppingPosition !== null;

  return {
    isDragging,
    isResizing,
    isDropping,
    isInteracting: isDragging || isResizing || isDropping,
    activeDragId: dragState.activeDrag?.i ?? null
  };
}

export function useGridLayout(
  options: UseGridLayoutOptions
): UseGridLayoutResult {
  const {
    layout: propsLayout,
    cols,
    preventCollision = false,
    onLayoutChange,
    compactor = verticalCompactor,
    droppingItemId = "__dropping-elem__"
  } = options;

  const isDraggingRef = useRef(false);

  const [layout, setLayoutState] = useState<Layout>(() => {
    const corrected = correctBounds(cloneLayout(propsLayout), { cols });
    return compactor.compact(corrected, cols);
  });

  const [dragState, setDragState] = useState<DragState>({
    activeDrag: null,
    oldDragItem: null,
    oldLayout: null
  });
  const [resizeState, setResizeState] = useState<ResizeState>({
    resizing: false,
    oldResizeItem: null,
    oldLayout: null
  });
  const [dropState, setDropState] = useState<DropState>({
    droppingDOMNode: null,
    droppingPosition: null
  });
  const prevLayoutRef = useRef<Layout>(layout);

  const setLayout = useCallback(
    (newLayout: Layout) => {
      const corrected = correctBounds(cloneLayout(newLayout), { cols });
      const compacted = compactor.compact(corrected, cols);
      setLayoutState(compacted);
    },
    [cols, compactor]
  );

  useEffect(() => {
    if (isDraggingRef.current) {
      return;
    }

    if (!deepEqual(propsLayout, prevLayoutRef.current)) {
      setLayout(propsLayout);
    }
  }, [propsLayout, setLayout]);

  useEffect(() => {
    if (!deepEqual(layout, prevLayoutRef.current)) {
      prevLayoutRef.current = layout;

      if (!layout.some((item) => item.i === droppingItemId)) {
        onLayoutChange?.(layout);
      }
    }
  }, [layout, onLayoutChange, droppingItemId]);

  const onDragStart = useCallback(
    (itemId: string, x: number, y: number): LayoutItem | null => {
      const item = getLayoutItem(layout, itemId);
      if (!item) {
        return null;
      }

      isDraggingRef.current = true;
      const placeholder: LayoutItem = {
        ...cloneLayoutItem(item),
        x,
        y,
        static: false,
        moved: false
      };

      setDragState({
        activeDrag: placeholder,
        oldDragItem: cloneLayoutItem(item),
        oldLayout: cloneLayout(layout)
      });

      return placeholder;
    },
    [layout]
  );

  const onDrag = useCallback(
    (itemId: string, x: number, y: number) => {
      logDebug('[useGridLayout] onDrag received', { itemId, x, y });
      const item = getLayoutItem(layout, itemId);
      if (!item) {
        logDebug('[useGridLayout] onDrag: item not found', itemId);
        return;
      }

      setDragState((prev) => ({
        ...prev,
        activeDrag: prev.activeDrag ? { ...prev.activeDrag, x, y } : null
      }));

      const newLayout = moveElement(
        layout,
        item,
        x,
        y,
        true,
        preventCollision,
        compactor.type,
        cols,
        compactor.allowOverlap
      );
      logDebug('[useGridLayout] onDrag: moveElement computed', { itemId, x, y });
      const compacted = compactor.compact(newLayout, cols);
      setLayoutState(compacted);
      logDebug('[useGridLayout] onDrag: setLayoutState applied', { length: compacted.length });
    },
    [layout, cols, compactor, preventCollision]
  );

  const onDragStop = useCallback(
    (itemId: string, x: number, y: number) => {
      const item = getLayoutItem(layout, itemId);
      if (!item) {
        return;
      }

      const newLayout = moveElement(
        layout,
        item,
        x,
        y,
        true,
        preventCollision,
        compactor.type,
        cols,
        compactor.allowOverlap
      );
      const compacted = compactor.compact(newLayout, cols);

      isDraggingRef.current = false;
      setDragState({ activeDrag: null, oldDragItem: null, oldLayout: null });
      setLayoutState(compacted);
    },
    [layout, cols, compactor, preventCollision]
  );

  const cancelDrag = useCallback(() => {
    isDraggingRef.current = false;
    setDragState((prev) => {
      if (prev.oldLayout) {
        const corrected = correctBounds(cloneLayout(prev.oldLayout), { cols });
        const compacted = compactor.compact(corrected, cols);
        setLayoutState(compacted);
      }

      return { activeDrag: null, oldDragItem: null, oldLayout: null };
    });
  }, [cols, compactor]);

  const onResizeStart = useCallback(
    (itemId: string): LayoutItem | null => {
      const item = getLayoutItem(layout, itemId);
      if (!item) {
        return null;
      }

      setResizeState({
        resizing: true,
        oldResizeItem: cloneLayoutItem(item),
        oldLayout: cloneLayout(layout)
      });

      return item;
    },
    [layout]
  );

  const onResize = useCallback(
    (itemId: string, w: number, h: number, x?: number, y?: number) => {
      const newLayout = layout.map((item) => {
        if (item.i !== itemId) {
          return item;
        }

        const updated: Mutable<LayoutItem> = {
          ...item,
          w,
          h
        };
        if (x !== undefined) {
          updated.x = x;
        }
        if (y !== undefined) {
          updated.y = y;
        }
        return updated;
      });

      const corrected = correctBounds(newLayout, { cols });
      const compacted = compactor.compact(corrected, cols);
      const activeResizeItem = getLayoutItem(compacted, itemId);

      setLayoutState(compacted);
      setDragState((prev) => ({
        ...prev,
        activeDrag: activeResizeItem ? cloneLayoutItem(activeResizeItem) : prev.activeDrag
      }));
    },
    [layout, cols, compactor]
  );

  const onResizeStop = useCallback(
    (itemId: string, w: number, h: number, x?: number, y?: number) => {
      onResize(itemId, w, h, x, y);

      setResizeState({
        resizing: false,
        oldResizeItem: null,
        oldLayout: null
      });
      setDragState({ activeDrag: null, oldDragItem: null, oldLayout: null });
    },
    [onResize]
  );

  const cancelResize = useCallback(() => {
    setResizeState((prev) => {
      if (prev.oldLayout) {
        const corrected = correctBounds(cloneLayout(prev.oldLayout), { cols });
        const compacted = compactor.compact(corrected, cols);
        setLayoutState(compacted);
      }

      return {
        resizing: false,
        oldResizeItem: null,
        oldLayout: null
      };
    });
    setDragState({ activeDrag: null, oldDragItem: null, oldLayout: null });
  }, [cols, compactor]);

  const onDropDragOver = useCallback(
    (droppingItem: LayoutItem, position: DroppingPosition) => {
      const existingItem = getLayoutItem(layout, droppingItem.i);

      isDraggingRef.current = true;
      if (!existingItem) {
        const newLayout = [...layout, droppingItem];
        const corrected = correctBounds(newLayout, { cols });
        setLayoutState(corrected);
      }

      setDropState({
        droppingDOMNode: null,
        droppingPosition: position
      });
    },
    [layout, cols]
  );

  const onDropDragLeave = useCallback(() => {
    const newLayout = layout.filter((item) => item.i !== droppingItemId);
    setLayout(newLayout);
    isDraggingRef.current = false;
    setDragState({ activeDrag: null, oldDragItem: null, oldLayout: null });
    setResizeState((prev) => ({
      ...prev,
      resizing: false
    }));
    setDropState({
      droppingDOMNode: null,
      droppingPosition: null
    });
  }, [layout, droppingItemId, setLayout]);

  const onDrop = useCallback(
    (droppingItem: LayoutItem) => {
      const newLayout = layout.map((item) => {
        if (item.i !== droppingItemId) {
          return item;
        }

        return {
          ...item,
          i: droppingItem.i,
          static: false
        };
      });

      const corrected = correctBounds(newLayout, { cols });
      const compacted = compactor.compact(corrected, cols);
      setLayoutState(compacted);
      isDraggingRef.current = false;
      setDragState({ activeDrag: null, oldDragItem: null, oldLayout: null });
      setDropState({
        droppingDOMNode: null,
        droppingPosition: null
      });
    },
    [layout, droppingItemId, cols, compactor]
  );

  const containerHeight = useMemo(() => bottom(layout), [layout]);
  const interactionSnapshot = useMemo(
    () => createGridLayoutInteractionSnapshot(dragState, resizeState, dropState),
    [dragState, resizeState, dropState]
  );

  return {
    layout,
    setLayout,
    dragState,
    resizeState,
    dropState,
    onDragStart,
    onDrag,
    onDragStop,
    cancelDrag,
    onResizeStart,
    onResize,
    onResizeStop,
    cancelResize,
    onDropDragOver,
    onDropDragLeave,
    onDrop,
    containerHeight,
    isInteracting: interactionSnapshot.isInteracting,
    compactor
  };
}

export default useGridLayout;
