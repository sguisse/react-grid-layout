/**
 * GridLayout component
 *
 * A reactive, fluid grid layout with draggable, resizable components.
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  type ReactElement,
  type CSSProperties,
  type DragEvent as ReactDragEvent
} from "react";
import { createPortal } from "react-dom";
import { deepEqual } from "fast-equals";
import clsx from "clsx";
import {
  DragDropProvider,
  DragOverlay,
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor
} from "../dnd/runtime.js";

import type {
  Layout,
  LayoutItem,
  CompactType,
  DroppingPosition,
  GridDragEvent,
  GridResizeEvent,
  Mutable,
  GridConfig,
  DragConfig,
  ResizeConfig,
  DropConfig,
  PositionStrategy,
  Compactor,
  LayoutConstraint,
  EventCallback,
  DragMoveMode,
  DragModeChangeCallback
} from "../../core/types.js";
import {
  defaultGridConfig,
  defaultDragConfig,
  defaultResizeConfig,
  defaultDropConfig
} from "../../core/types.js";
import type { PositionParams } from "../../core/calculate.js";
import {
  bottom,
  cloneLayoutItem,
  getLayoutItem,
  moveElement,
  withLayoutItem,
  correctBounds
} from "../../core/layout.js";
import { getAllCollisions } from "../../core/collision.js";
import { getCompactor } from "../../core/compactors.js";
import {
  calcXY,
  calcXYRaw,
  calcGridColWidth,
  calcGridItemPosition,
  calcGridItemWHPx,
  getGridPixelSteps
} from "../../core/calculate.js";
import { computePlaceholder } from "../../core/computePlaceholder.js";
import { defaultPositionStrategy } from "../../core/position.js";
import {
  applyPositionConstraints,
  defaultConstraints
} from "../../core/constraints.js";

import {
  GridItem,
  type GridItemDragData,
  type ResizeHandle
} from "./GridItem.js";
import { useGridLayout } from "../hooks/useGridLayout.js";
import { logDebug } from "../utils/log.js";
import CrossPlus from "./CrossPlus.js";
import { applyCrossCursor, removeCrossCursor } from "../utils/crossCursor.js";
import { useCrossPlus } from "../hooks/useCrossPlus.js";

export interface GridLayoutProps {
  children: React.ReactNode;
  width: number;
  gridConfig?: Partial<GridConfig>;
  dragConfig?: Partial<DragConfig>;
  resizeConfig?: Partial<ResizeConfig>;
  dropConfig?: Partial<DropConfig>;
  positionStrategy?: PositionStrategy;
  compactor?: Compactor;
  constraints?: LayoutConstraint[];
  layout?: Layout;
  droppingItem?: LayoutItem;
  autoSize?: boolean;
  className?: string;
  style?: CSSProperties;
  innerRef?: React.Ref<HTMLDivElement>;
  onLayoutChange?: (layout: Layout) => void;
  onDragStart?: EventCallback;
  onDrag?: EventCallback;
  onDragStop?: EventCallback;
  onResizeStart?: EventCallback;
  onResize?: EventCallback;
  onResizeStop?: EventCallback;
  /**
   * Called when the drag move mode changes via CTRL/CMD key press or release
   * while the drag handle is held down (before dragging has started).
   * Mode is CROSS_GRID_MOVE when CTRL/CMD is pressed, INNER_GRID_MOVE when released.
   */
  onDragModeChange?: DragModeChangeCallback;
  /** Custom icon/node to render for the cross-grid '+' indicator. If omitted, a simple "+" is used. */
  crossGridIcon?: React.ReactNode;
  /** Called when a cross-grid drag is cancelled because the drop wasn't over a different grid. */
  onCrossDropRejected?: (
    fromLayout: Layout,
    item: LayoutItem | null,
    pointer?: { x: number; y: number } | null,
    e?: Event | null
  ) => void;
  onDrop?: (layout: Layout, item: LayoutItem | undefined, e: Event) => void;
  onDropDragOver?: (
    e: ReactDragEvent
  ) =>
    | { w?: number; h?: number; dragOffsetX?: number; dragOffsetY?: number }
    | false
    | void;
  /**
   * How to handle external (cross-container) drops. When 'passive' the
   * library will NOT inject a persistent placeholder into layout state and
   * instead exposes a passive preview API via `onExternalPreview`.
   * When 'inject-placeholder' (legacy) the placeholder is inserted into
   * internal layout state (no public layout emission) as before.
   */
  externalDropMode?: "passive" | "inject-placeholder";
  /**
   * Called during external drag-over with a computed placeholder item.
   * Consumers can render an overlay preview and decide when/if to commit.
   */
  onExternalPreview?: (placeholder: LayoutItem | null) => void;
}

const noop = () => {};
const layoutClassName = "react-grid-layout";

let isFirefox = false;
try {
  isFirefox = /firefox/i.test(navigator.userAgent);
} catch {
  /* Ignore */
}

function childrenEqual(a: React.ReactNode, b: React.ReactNode): boolean {
  const aArr = React.Children.toArray(a);
  const bArr = React.Children.toArray(b);

  if (aArr.length !== bArr.length) {
    return false;
  }

  for (let i = 0; i < aArr.length; i++) {
    const aChild = aArr[i] as ReactElement;
    const bChild = bArr[i] as ReactElement;
    if (aChild?.key !== bChild?.key) {
      return false;
    }
  }

  return true;
}

function synchronizeLayoutWithChildren(
  initialLayout: Layout,
  children: React.ReactNode,
  cols: number,
  compactor: Compactor
): Layout {
  const layout: LayoutItem[] = [];
  const childKeys = new Set<string>();

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child) || child.key === null) {
      return;
    }

    const key = String(child.key);
    childKeys.add(key);
    const existingItem = initialLayout.find((l) => l.i === key);

    if (existingItem) {
      layout.push(cloneLayoutItem(existingItem));
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

  const corrected = correctBounds(layout, { cols });
  return compactor.compact(corrected, cols);
}

interface GridDropPlaceholderConfig {
  defaultItem: { w: number; h: number };
  override?: LayoutItem | null;
}

function createGridDropPlaceholder(config: GridDropPlaceholderConfig): LayoutItem {
  return (
    config.override ?? {
      i: "__dropping-elem__",
      x: 0,
      y: 0,
      ...config.defaultItem
    }
  );
}

function createGridInteractionState(
  activeDrag: LayoutItem | null,
  resizing: boolean,
  droppingPosition: DroppingPosition | undefined
): {
  isInteracting: boolean;
  activeDrag: LayoutItem | null;
  resizing: boolean;
  droppingPosition: DroppingPosition | undefined;
} {
  return {
    isInteracting:
      activeDrag !== null || resizing || droppingPosition !== undefined,
    activeDrag,
    resizing,
    droppingPosition
  };
}

interface ActiveDndDragSession {
  itemId: string;
  node: HTMLElement | null;
  /** Pointer coordinates (clientX/Y) captured at drag-start, used to compute
   * real-time delta in onDragMove. dnd-kit v0.3.2 dispatches the dragmove event
   * BEFORE it updates operation.transform (the update happens in a queueMicrotask),
   * so event.operation.transform is always one step behind. Using
   * (event.to - initialPointer) gives the correct current delta instead. */
  initialPointer: { x: number; y: number };
  origin: {
    left: number;
    top: number;
    x: number;
    y: number;
    w: number;
    h: number;
  };
  /** Drag move mode locked at the time dnd-kit activates the drag. */
  mode: DragMoveMode;
}

function getGridItemDragData(
  value: unknown
): GridItemDragData | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const kind = (value as { kind?: unknown }).kind;
  const itemId = (value as { itemId?: unknown }).itemId;
  return kind === "drag" && typeof itemId === "string"
    ? { kind: "drag", itemId }
    : null;
}

export function GridLayout(props: GridLayoutProps): ReactElement {
  const {
    children,
    width,
    gridConfig: gridConfigProp,
    dragConfig: dragConfigProp,
    resizeConfig: resizeConfigProp,
    dropConfig: dropConfigProp,
    positionStrategy = defaultPositionStrategy,
    compactor: compactorProp,
    constraints = defaultConstraints,
    layout: propsLayout = [],
    droppingItem: droppingItemProp,
    autoSize = true,
    className = "",
    style = {},
    innerRef,
    onLayoutChange = noop,
    onDragStart: onDragStartProp = noop,
    onDrag: onDragProp = noop,
    onDragStop: onDragStopProp = noop,
    onResizeStart: onResizeStartProp = noop,
    onResize: onResizeProp = noop,
    onResizeStop: onResizeStopProp = noop,
    onDrop: onDropProp = noop,
    onDropDragOver: onDropDragOverProp = noop,
    externalDropMode = "passive",
    onExternalPreview: onExternalPreviewProp = noop,
    onDragModeChange: onDragModeChangeProp,
    crossGridIcon,
    onCrossDropRejected: onCrossDropRejectedProp = noop
  } = props;

  const gridConfig: GridConfig = useMemo(
    () => ({ ...defaultGridConfig, ...gridConfigProp }),
    [gridConfigProp]
  );
  const dragConfig: DragConfig = useMemo(
    () => ({ ...defaultDragConfig, ...dragConfigProp }),
    [dragConfigProp]
  );
  const resizeConfig: ResizeConfig = useMemo(
    () => ({ ...defaultResizeConfig, ...resizeConfigProp }),
    [resizeConfigProp]
  );
  const dropConfig: DropConfig = useMemo(
    () => ({ ...defaultDropConfig, ...dropConfigProp }),
    [dropConfigProp]
  );

  const { cols, rowHeight, maxRows, margin, containerPadding } = gridConfig;
  const {
    enabled: isDraggable,
    bounded: isBounded,
    handle: draggableHandle,
    cancel: draggableCancel,
    threshold: dragThreshold
  } = dragConfig;
  const {
    enabled: isResizable,
    handles: resizeHandles,
    handleComponent: resizeHandle
  } = resizeConfig;
  const {
    enabled: isDroppable,
    defaultItem: defaultDropItem,
    onDragOver: dropConfigOnDragOver
  } = dropConfig;

  const compactor = compactorProp ?? getCompactor("vertical");
  const compactType = compactor.type;
  const allowOverlap = compactor.allowOverlap;
  const preventCollision = compactor.preventCollision ?? false;

  const droppingItem = useMemo(
    () =>
      createGridDropPlaceholder({
        defaultItem: defaultDropItem,
        override: droppingItemProp
      }),
    [droppingItemProp, defaultDropItem]
  );

  const useCSSTransforms = positionStrategy.type === "transform";
  const transformScale = positionStrategy.scale;
  const effectiveContainerPadding = containerPadding ?? margin;
  const positionParams: PositionParams = useMemo(
    () => ({
      cols,
      margin: margin as [number, number],
      maxRows,
      rowHeight,
      containerWidth: width,
      containerPadding: effectiveContainerPadding as [number, number]
    }),
    [cols, margin, maxRows, rowHeight, width, effectiveContainerPadding]
  );
  const { stepX, stepY } = useMemo(
    () => getGridPixelSteps(positionParams),
    [positionParams]
  );
  const synchronizedLayout = useMemo(
    () => synchronizeLayoutWithChildren(propsLayout, children, cols, compactor),
    [propsLayout, children, cols, compactor]
  );

  const [mounted, setMounted] = useState(false);
  const [droppingDOMNode, setDroppingDOMNode] = useState<ReactElement | null>(
    null
  );
  const [dragOverlayId, setDragOverlayId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeDndDragRef = useRef<ActiveDndDragSession | null>(null);

  // Cross-plus overlay state/behavior handled by a dedicated hook (initialized
  // after the refs it depends on).
  const { showCrossPlus, plusPortalCoords } = useCrossPlus(
    dragOverlayId,
    activeDndDragRef,
    containerRef
  );
  const setContainerNode = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;

      if (typeof innerRef === "function") {
        innerRef(node);
        return;
      }

      if (innerRef && "current" in innerRef) {
        // Avoid modifying the `innerRef` parameter directly to satisfy
        // react-hooks/immutability lint rules. Assign to a local variable
        // reference and update its .current property instead.
        const mutableRef = innerRef as Mutable<{ current: HTMLDivElement | null }>;
        mutableRef.current = node;
      }
    },
    [innerRef]
  );
  const dndSensors = useMemo(
    () => [
      PointerSensor.configure({
        activationConstraints: [
          new PointerActivationConstraints.Distance({
            value: Math.max(3, dragThreshold)
          })
        ],
        preventActivation: (event: PointerEvent, source: unknown) => {
          // Resize handle draggables must always be allowed to activate —
          // they ARE on .react-resizable-handle elements by design.
          const sourceData = (source as { data?: { kind?: unknown } } | null)
            ?.data;
          if (sourceData?.kind === "resize") return false;

          const target =
            event.target instanceof HTMLElement ? event.target : null;
          return Boolean(
            target &&
              target.closest(
                [".react-resizable-handle", draggableCancel]
                  .filter(Boolean)
                  .join(",")
              )
          );
        }
      }),
      KeyboardSensor.configure({
        offset: {
          x: stepX,
          y: stepY
        }
      })
    ],
    [dragThreshold, draggableCancel, stepX, stepY]
  );

  const {
    layout,
    setLayout,
    dragState,
    resizeState,
    dropState,
    onDragStart: beginDragState,
    onDrag: updateDragState,
    onDragStop: stopDragState,
    cancelDrag: cancelDragState,
    onResizeStart: beginResizeState,
    onResize: updateResizeState,
    onResizeStop: stopResizeState,
    cancelResize: cancelResizeState,
    onDropDragOver: updateDropPlaceholder,
    onDropDragLeave: clearDropPlaceholder
  } = useGridLayout({
    layout: synchronizedLayout,
    cols,
    preventCollision,
    compactor,
    droppingItemId: droppingItem.i
  });

  const activeDrag = dragState.activeDrag;
  const resizing = resizeState.resizing;
  const droppingPosition = dropState.droppingPosition ?? undefined;
  const interactionState = useMemo(
    () => createGridInteractionState(activeDrag, resizing, droppingPosition),
    [activeDrag, resizing, droppingPosition]
  );

  const oldDragItemRef = useRef<LayoutItem | null>(null);
  const oldResizeItemRef = useRef<LayoutItem | null>(null);
  const oldLayoutRef = useRef<Layout | null>(null);
  const dragEnterCounterRef = useRef(0);
  const prevLayoutRef = useRef<Layout>(layout);
  const prevPropsLayoutRef = useRef<Layout>(propsLayout);
  const prevChildrenRef = useRef<React.ReactNode>(children);
  const prevCompactTypeRef = useRef<CompactType>(compactType);
  const layoutRef = useRef<Layout>(layout);
  layoutRef.current = layout;
  // Tracks whether CTRL or CMD key is held. Read at dnd-kit drag-start to determine mode.
  const ctrlMetaKeyRef = useRef(false);
  // Stable ref for onDragModeChangeProp so the GridItem callback always calls the latest fn.
  const onDragModeChangePropRef = useRef(onDragModeChangeProp);
  onDragModeChangePropRef.current = onDragModeChangeProp;
  const childMap = useMemo(() => {
    const next = new Map<string, ReactElement>();
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child) || child.key === null) {
        return;
      }

      next.set(String(child.key), child);
    });
    return next;
  }, [children]);
  const createConstraintContext = useCallback(
    (currentLayout: Layout) => ({
      cols,
      maxRows,
      containerWidth: width,
      containerHeight: containerRef.current?.clientHeight ?? 0,
      rowHeight,
      margin,
      layout: currentLayout
    }),
    [cols, maxRows, width, rowHeight, margin]
  );
  const getDragEventNativeEvent = useCallback(
    (event: { nativeEvent?: Event; operation: { activatorEvent: Event | null } }) =>
      event.nativeEvent ?? event.operation.activatorEvent ?? new Event("drag"),
    []
  );
  const getDragSourceElement = useCallback(
    (source: unknown): HTMLElement | null => {
      const element = (source as { element?: Element | undefined } | null)?.element;
      return element instanceof HTMLElement ? element : null;
    },
    []
  );


  const getDraggedGridPosition = useCallback(
    (
      session: ActiveDndDragSession,
      currentItem: LayoutItem,
      transform: { x: number; y: number }
    ) => {
      const newPosition = {
        left: session.origin.left + transform.x / transformScale,
        top: session.origin.top + transform.y / transformScale
      };
      const rawPosition = calcXYRaw(
        positionParams,
        newPosition.top,
        newPosition.left
      );
      const constrained = applyPositionConstraints(
        constraints,
        currentItem,
        rawPosition.x,
        rawPosition.y,
        createConstraintContext(layoutRef.current)
      );

      return {
        x: constrained.x,
        y: constrained.y,
        newPosition
      };
    },
    [constraints, createConstraintContext, positionParams, transformScale]
  );

  useEffect(() => {
    setMounted(true);
    if (!deepEqual(layout, propsLayout)) {
      onLayoutChange(layout);
    }
  }, []);

  // Track CTRL/CMD key state globally so the correct drag mode is captured
  // when dnd-kit fires dragStart (at threshold-exceeded time).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") {
        ctrlMetaKeyRef.current = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") {
        ctrlMetaKeyRef.current = false;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Ensure cursor override is removed on unmount.
  useEffect(() => {
    return () => {
      removeCrossCursor();
    };
  }, []);

  useEffect(() => {
    if (activeDrag || droppingDOMNode) {
      return;
    }

    const layoutChanged = !deepEqual(propsLayout, prevPropsLayoutRef.current);
    const childrenChanged = !childrenEqual(children, prevChildrenRef.current);
    const compactTypeChanged = compactType !== prevCompactTypeRef.current;

    if (layoutChanged || childrenChanged || compactTypeChanged) {
      // Use the ref for current layout so 'layout' state itself is not a dep
      // (avoids re-running this effect on every drag-move layout update).
      const baseLayout = layoutChanged ? propsLayout : layoutRef.current;
      const nextLayout = synchronizeLayoutWithChildren(
        baseLayout,
        children,
        cols,
        compactor
      );
      if (!deepEqual(nextLayout, layoutRef.current)) {
        setLayout(nextLayout);
      }
    }

    prevPropsLayoutRef.current = propsLayout;
    prevChildrenRef.current = children;
    prevCompactTypeRef.current = compactType;
  }, [
    propsLayout,
    children,
    cols,
    compactType,
    compactor,
    activeDrag,
    droppingDOMNode
    // 'layout' intentionally omitted: we access it via layoutRef.current to avoid
    // re-running on every drag-move. 'setLayout' omitted because it only changes
    // when cols/compactor change, which are already in the deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  useEffect(() => {
    if (!activeDrag && !deepEqual(layout, prevLayoutRef.current)) {
      prevLayoutRef.current = layout;
      const publicLayout = layout.filter((l) => l.i !== droppingItem.i);
      onLayoutChange(publicLayout);
    }
  }, [layout, activeDrag, onLayoutChange, droppingItem.i]);

  const containerHeight = useMemo((): string | undefined => {
    if (!autoSize) {
      return undefined;
    }

    const nbRow = bottom(layout);
    const containerPaddingY = effectiveContainerPadding[1];
    return (
      nbRow * rowHeight +
      (nbRow - 1) * margin[1] +
      containerPaddingY * 2 +
      "px"
    );
  }, [autoSize, layout, rowHeight, margin, effectiveContainerPadding]);

  const onDragStart = useCallback(
    (i: string, x: number, y: number, data: GridDragEvent) => {
      const currentLayout = layoutRef.current;
      const item = getLayoutItem(currentLayout, i);
      if (!item) {
        return;
      }

      oldDragItemRef.current = cloneLayoutItem(item);
      oldLayoutRef.current = currentLayout;
      beginDragState(i, x, y);
      onDragStartProp(currentLayout, item, item, null, data.e, data.node, data.mode);
    },
    [beginDragState, onDragStartProp]
  );

  const onDrag = useCallback(
    (i: string, x: number, y: number, data: GridDragEvent) => {
      const currentLayout = layoutRef.current;
      const oldDragItem = oldDragItemRef.current;
      const item = getLayoutItem(currentLayout, i);
      if (!item) {
        return;
      }

      const placeholder: LayoutItem = {
        w: item.w,
        h: item.h,
        x: item.x,
        y: item.y,
        i
      };
      const newLayout = moveElement(
        currentLayout,
        item,
        x,
        y,
        true,
        preventCollision,
        compactType,
        cols,
        allowOverlap
      );

      onDragProp(newLayout, oldDragItem, item, placeholder, data.e, data.node, data.mode);
      updateDragState(i, x, y);
    },
    [
      preventCollision,
      compactType,
      cols,
      allowOverlap,
      onDragProp,
      updateDragState
    ]
  );

  const onDragStop = useCallback(
    (i: string, x: number, y: number, data: GridDragEvent) => {
      const currentLayout = layoutRef.current;
      const oldDragItem = oldDragItemRef.current;
      const item = getLayoutItem(currentLayout, i);
      if (!item) {
        return;
      }

      const newLayout = moveElement(
        currentLayout,
        item,
        x,
        y,
        true,
        preventCollision,
        compactType,
        cols,
        allowOverlap
      );
      const finalLayout = compactor.compact(newLayout, cols);

      onDragStopProp(finalLayout, oldDragItem, item, null, data.e, data.node, data.mode);

      oldDragItemRef.current = null;
      oldLayoutRef.current = null;
      stopDragState(i, x, y);
      // NOTE: do NOT call onLayoutChange here directly. The third useEffect
      // (watching `layout`) handles it once the layout state settles. A direct
      // call here would double-fire onLayoutChange, causing extra parent renders
      // which keep dnd-kit's renderer.rendering promise pending and prevent
      // dragOperation.reset() from running — leaving the manager non-idle so
      // the next drag attempt is silently blocked.
    },
    [
      preventCollision,
      compactType,
      cols,
      allowOverlap,
      compactor,
      onDragStopProp,
      stopDragState
    ]
  );

  /**
   * Passed to each GridItem as its `onDragModeChange` prop.
   * Forwards the mode-change notification to the consumer's callback.
   */
  const onGridItemDragModeChange = useCallback(
    (itemId: string, mode: DragMoveMode, event: Event | null) => {
      const currentLayout = layoutRef.current;
      const item = getLayoutItem(currentLayout, itemId);
      // Change global cursor when cross-grid mode is activated (even
      // before an actual drag starts) so the user sees the special cursor.
      if (mode === "CROSS_GRID_MOVE") {
        applyCrossCursor();
      } else {
        removeCrossCursor();
      }
      onDragModeChangePropRef.current?.(currentLayout, item ?? null, mode, event);
    },
    [applyCrossCursor, removeCrossCursor]
  );

  // Cross-plus overlay is handled by `useCrossPlus` hook above.

  const handleDndKitDragStart = useCallback(
    (
      event: {
        operation: {
          source: { data?: unknown } | null;
          activatorEvent: Event | null;
        };
        nativeEvent?: Event;
      }
    ) => {
      logDebug("[GridLayout] handleDndKitDragStart", {
        sourceData: event.operation.source?.data,
        activatorEvent: event.operation.activatorEvent,
        nativeEvent: event.nativeEvent
      });
      const dragData = getGridItemDragData(event.operation.source?.data);
      if (!dragData) {
        logDebug("[GridLayout] handleDndKitDragStart: no dragData");
        return;
      }

      const currentLayout = layoutRef.current;
      const item = getLayoutItem(currentLayout, dragData.itemId);
      if (!item) {
        logDebug("[GridLayout] handleDndKitDragStart: item not found", dragData);
        return;
      }

      const originPosition = calcGridItemPosition(
        positionParams,
        item.x,
        item.y,
        item.w,
        item.h
      );
      const node = getDragSourceElement(event.operation.source);
      // Capture the pointer position at drag start so we can compute a real-time
      // delta in handleDndKitDragMove without depending on the stale
      // operation.transform (which is updated asynchronously in dnd-kit v0.3.2).
      const activatorEvent = event.operation.activatorEvent as (MouseEvent | null);
      const initialPointer = activatorEvent
        ? { x: activatorEvent.clientX ?? 0, y: activatorEvent.clientY ?? 0 }
        : { x: 0, y: 0 };
      activeDndDragRef.current = {
        itemId: item.i,
        node,
        initialPointer,
        origin: {
          left: originPosition.left,
          top: originPosition.top,
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h
        },
        // Lock mode at dnd-kit drag-start using the current CTRL/CMD key state.
        mode: ctrlMetaKeyRef.current ? "CROSS_GRID_MOVE" : "INNER_GRID_MOVE"
      };
      logDebug("[GridLayout] activeDndDragRef set", activeDndDragRef.current);
      setDragOverlayId(item.i);

      // Apply cross-grid cursor if mode locked to CROSS_GRID_MOVE at drag-start
      if (activeDndDragRef.current?.mode === "CROSS_GRID_MOVE") {
        applyCrossCursor();
      } else {
        removeCrossCursor();
      }

      // Log ctrl/meta key state for debugging cross-grid activation
      logDebug("[GridLayout] handleDndKitDragStart ctrl/meta", { ctrlMetaKey: ctrlMetaKeyRef.current, mode: activeDndDragRef.current.mode });

      logDebug("[GridLayout] invoking onDragStart callback", item.i, item.x, item.y);
      onDragStart(item.i, item.x, item.y, {
        e: getDragEventNativeEvent(event),
        node: node ?? containerRef.current ?? document.body,
        newPosition: {
          left: originPosition.left,
          top: originPosition.top
        },
        mode: activeDndDragRef.current.mode
      });
    },
    [getDragEventNativeEvent, getDragSourceElement, onDragStart, positionParams]
  );

  const handleDndKitDragMove = useCallback(
    (
      event: {
        operation: {
          source: { data?: unknown } | null;
          transform: { x: number; y: number };
          activatorEvent: Event | null;
        };
        /** Absolute pointer coordinates from the sensor (real-time, not delayed). */
        to?: { x: number; y: number };
        by?: { x: number; y: number };
        nativeEvent?: Event;
      }
    ) => {
      logDebug("[GridLayout] handleDndKitDragMove", {
        transform: event.operation.transform,
        to: event.to,
        sourceData: event.operation.source?.data
      });
      const session = activeDndDragRef.current;
      const dragData = getGridItemDragData(event.operation.source?.data);
      if (!session || !dragData || session.itemId !== dragData.itemId) {
        logDebug("[GridLayout] handleDndKitDragMove: session mismatch", { session, dragData });
        return;
      }

      // Ensure cross-grid cursor persists during drag-move (re-assert in case
      // another library overrides cursor styles during active drags).
      if (session.mode === "CROSS_GRID_MOVE") {
        applyCrossCursor();
      }

      const currentLayout = layoutRef.current;
      const item = getLayoutItem(currentLayout, session.itemId);
      if (!item) {
        logDebug("[GridLayout] handleDndKitDragMove: item not found", session.itemId);
        return;
      }

      // In dnd-kit v0.3.2, monitor.dispatch("dragmove") fires synchronously but
      // position.current is updated in a queueMicrotask AFTER the event. This means
      // event.operation.transform is stale (always 0 on the first move, one step
      // behind on subsequent moves). Use event.to (real-time pointer coords from
      // the sensor) with the stored initialPointer to get the true delta.
      const transform = event.to
        ? {
            x: event.to.x - session.initialPointer.x,
            y: event.to.y - session.initialPointer.y
          }
        : event.operation.transform;

      const { x, y, newPosition } = getDraggedGridPosition(
        session,
        item,
        transform
      );
      const node = getDragSourceElement(event.operation.source) ?? session.node;

      logDebug("[GridLayout] invoking onDrag", session.itemId, { x, y, newPosition });
      onDrag(session.itemId, x, y, {
        e: getDragEventNativeEvent(event),
        node: node ?? containerRef.current ?? document.body,
        newPosition,
        mode: session.mode
      });
    },
    [getDragEventNativeEvent, getDragSourceElement, getDraggedGridPosition, onDrag]
  );

  const handleDndKitDragEnd = useCallback(
    (
      event: {
        canceled: boolean;
        operation: {
          source: { data?: unknown } | null;
          transform: { x: number; y: number };
          activatorEvent: Event | null;
        };
        /** Absolute pointer coordinates from the sensor (real-time, not delayed). */
        to?: { x: number; y: number };
        by?: { x: number; y: number };
        nativeEvent?: Event;
      }
    ) => {
      logDebug("[GridLayout] handleDndKitDragEnd", {
        canceled: event.canceled,
        transform: event.operation.transform,
        sourceData: event.operation.source?.data
      });
      const session = activeDndDragRef.current;
      const dragData = getGridItemDragData(event.operation.source?.data);
      activeDndDragRef.current = null;
      setDragOverlayId(null);
      // Remove any injected cross-grid cursor now that drag ended
      removeCrossCursor();

      if (!session || !dragData || session.itemId !== dragData.itemId) {
        logDebug("[GridLayout] handleDndKitDragEnd: session or dragData mismatch", { session, dragData });
        return;
      }

      if (event.canceled) {
        logDebug("[GridLayout] drag canceled for", session.itemId);
        oldDragItemRef.current = null;
        oldLayoutRef.current = null;
        cancelDragState();
        return;
      }

      const currentLayout = layoutRef.current;
      const item = getLayoutItem(currentLayout, session.itemId);
      if (!item) {
        logDebug("[GridLayout] handleDndKitDragEnd: item not found", session.itemId);
        cancelDragState();
        return;
      }

      // At dragend time, operation.transform is unreliable because:
      // 1. The dragend event has no `event.to` field (only dragmove does)
      // 2. scheduler.schedule uses requestAnimationFrame, so if pointerup fires
      //    in the same rAF cycle as the last pointermove, handleMove hasn't run
      //    yet → position.current was never updated with the final pointer position
      // Fix: use the nativeEvent (the raw PointerEvent for pointerup) which always
      //    carries the exact final clientX/Y, consistent with initialPointer.
      const nativePointerEnd =
        event.nativeEvent instanceof PointerEvent ? event.nativeEvent : null;

      // If this was a cross-grid drag, ensure the final pointer is over a
      // different grid than the origin. If not, cancel the move (no transfer).
      const endX = nativePointerEnd ? nativePointerEnd.clientX : event.to?.x ?? null;
      const endY = nativePointerEnd ? nativePointerEnd.clientY : event.to?.y ?? null;
      if (session.mode === "CROSS_GRID_MOVE" && endX !== null && endY !== null) {
        const elAtEnd = document.elementFromPoint(endX, endY);
        const gridElAtEnd = elAtEnd?.closest?.(".react-grid-layout") as HTMLElement | null;
        const isOverOtherGrid = Boolean(
          gridElAtEnd && containerRef.current && gridElAtEnd !== containerRef.current
        );
        logDebug("[GridLayout] handleDndKitDragEnd: cross-grid end hover", { endX, endY, gridElClass: gridElAtEnd?.className ?? null, isOverOtherGrid });
        if (!isOverOtherGrid) {
          logDebug("[GridLayout] handleDndKitDragEnd: cross-grid drop not over other grid — canceling move");
          try {
            onCrossDropRejectedProp?.(currentLayout, item, { x: endX, y: endY }, nativePointerEnd ?? getDragEventNativeEvent(event));
          } catch (err) {
            logDebug("[GridLayout] onCrossDropRejected callback threw", err);
          }
          oldDragItemRef.current = null;
          oldLayoutRef.current = null;
          cancelDragState();
          return;
        }
      }

      const endTransform = nativePointerEnd
        ? {
            x: nativePointerEnd.clientX - session.initialPointer.x,
            y: nativePointerEnd.clientY - session.initialPointer.y
          }
        : event.operation.transform;

      const { x, y, newPosition } = getDraggedGridPosition(
        session,
        item,
        endTransform
      );
      const node = getDragSourceElement(event.operation.source) ?? session.node;

      logDebug("[GridLayout] invoking onDragStop", session.itemId, { x, y, newPosition });
      onDragStop(session.itemId, x, y, {
        e: getDragEventNativeEvent(event),
        node: node ?? containerRef.current ?? document.body,
        newPosition,
        mode: session.mode
      });
    },
    [
      cancelDragState,
      getDragEventNativeEvent,
      getDragSourceElement,
      getDraggedGridPosition,
      onDragStop
    ]
  );

  const onResizeStart = useCallback(
    (i: string, _w: number, _h: number, data: GridResizeEvent) => {
      const currentLayout = layoutRef.current;
      const item = getLayoutItem(currentLayout, i);
      if (!item) {
        return;
      }

      oldResizeItemRef.current = cloneLayoutItem(item);
      oldLayoutRef.current = currentLayout;
      beginResizeState(i);
      onResizeStartProp(currentLayout, item, item, null, data.e, data.node);
    },
    [beginResizeState, onResizeStartProp]
  );

  const onResize = useCallback(
    (i: string, w: number, h: number, data: GridResizeEvent) => {
      const currentLayout = layoutRef.current;
      const oldResizeItem = oldResizeItemRef.current;
      const { handle } = data;

      let shouldMoveItem = false;
      let newX: number | undefined;
      let newY: number | undefined;

      const [newLayout, item] = withLayoutItem(currentLayout, i, (layoutItem) => {
        newX = layoutItem.x;
        newY = layoutItem.y;

        if (["sw", "w", "nw", "n", "ne"].includes(handle)) {
          if (["sw", "nw", "w"].includes(handle)) {
            newX = layoutItem.x + (layoutItem.w - w);
            w = layoutItem.x !== newX && newX < 0 ? layoutItem.w : w;
            newX = newX < 0 ? 0 : newX;
          }

          if (["ne", "n", "nw"].includes(handle)) {
            newY = layoutItem.y + (layoutItem.h - h);
            h = layoutItem.y !== newY && newY < 0 ? layoutItem.h : h;
            newY = newY < 0 ? 0 : newY;
          }

          shouldMoveItem = true;
        }

        if (preventCollision && !allowOverlap) {
          const collisions = getAllCollisions(currentLayout, {
            ...layoutItem,
            w,
            h,
            x: newX ?? layoutItem.x,
            y: newY ?? layoutItem.y
          }).filter((layoutEntry) => layoutEntry.i !== layoutItem.i);

          if (collisions.length > 0) {
            newY = layoutItem.y;
            h = layoutItem.h;
            newX = layoutItem.x;
            w = layoutItem.w;
            shouldMoveItem = false;
          }
        }

        (layoutItem as Mutable<LayoutItem>).w = w;
        (layoutItem as Mutable<LayoutItem>).h = h;
        return layoutItem;
      });

      if (!item) {
        return;
      }

      let finalLayout = newLayout;
      if (shouldMoveItem && newX !== undefined && newY !== undefined) {
        finalLayout = moveElement(
          newLayout,
          item,
          newX,
          newY,
          true,
          preventCollision,
          compactType,
          cols,
          allowOverlap
        );
      }

      const placeholder: LayoutItem = {
        w: item.w,
        h: item.h,
        x: item.x,
        y: item.y,
        i,
        static: true
      };

      onResizeProp(
        finalLayout,
        oldResizeItem,
        item,
        placeholder,
        data.e,
        data.node
      );
      updateResizeState(i, w, h, newX, newY);
    },
    [
      preventCollision,
      allowOverlap,
      compactType,
      cols,
      onResizeProp,
      updateResizeState
    ]
  );

  const onResizeStop = useCallback(
    (i: string, w: number, h: number, data: GridResizeEvent) => {
      const currentLayout = layoutRef.current;
      const oldResizeItem = oldResizeItemRef.current;
      const item = getLayoutItem(currentLayout, i);
      const finalLayout = compactor.compact(currentLayout, cols);

      onResizeStopProp(
        finalLayout,
        oldResizeItem,
        item ?? null,
        null,
        data.e,
        data.node
      );

      oldResizeItemRef.current = null;
      oldLayoutRef.current = null;
      stopResizeState(
        i,
        item?.w ?? w,
        item?.h ?? h,
        item?.x,
        item?.y
      );
      // NOTE: do NOT call onLayoutChange here directly (same reason as onDragStop).
    },
    [cols, compactor, onResizeStopProp, stopResizeState]
  );
  const onResizeCancel = useCallback(
    (_i: string) => {
      oldResizeItemRef.current = null;
      oldLayoutRef.current = null;
      cancelResizeState();
    },
    [cancelResizeState]
  );

  const removeDroppingPlaceholder = useCallback(() => {
    clearDropPlaceholder();
    setDroppingDOMNode(null);
  }, [clearDropPlaceholder]);

  const handleDragOver = useCallback(
    (e: ReactDragEvent): void | false => {
      e.preventDefault();
      e.stopPropagation();

      // If an internal dnd-kit drag overlay is active (we're performing an
      // internal drag), skip the external passive preview. Consumers using
      // `externalDropMode: 'passive'` receive previews via
      // `onExternalPreview` — clear that preview while an internal drag is
      // active so the UI doesn't show competing previews.
      if (dragOverlayId) {
        if (externalDropMode === "passive") {
          try {
            onExternalPreviewProp(null);
          } catch (err) {
            logDebug("onExternalPreview callback threw while clearing preview", err);
          }
        }
        return;
      }

      if (
        isFirefox &&
        !(e.nativeEvent.target as HTMLElement)?.classList.contains(layoutClassName)
      ) {
        return false;
      }

      const rawResult = dropConfigOnDragOver
        ? dropConfigOnDragOver(e.nativeEvent as DragEvent)
        : onDropDragOverProp(e);
      if (rawResult === false) {
        if (droppingDOMNode) {
          removeDroppingPlaceholder();
        }
        return false;
      }

      const safeDragOverResult = (rawResult ?? {}) as {
        w?: number;
        h?: number;
        dragOffsetX?: number;
        dragOffsetY?: number;
      };
      const {
        dragOffsetX = 0,
        dragOffsetY = 0,
        ...onDragOverResult
      } = safeDragOverResult;

      const finalDroppingItem = { ...droppingItem, ...onDragOverResult };
      const gridRect = e.currentTarget.getBoundingClientRect();
      const positionParams: PositionParams = {
        cols,
        margin: margin as [number, number],
        maxRows,
        rowHeight,
        containerWidth: width,
        containerPadding: effectiveContainerPadding as [number, number]
      };

      const actualColWidth = calcGridColWidth(positionParams);
      const itemPixelWidth = calcGridItemWHPx(
        finalDroppingItem.w,
        actualColWidth,
        margin[0]
      );
      const itemPixelHeight = calcGridItemWHPx(
        finalDroppingItem.h,
        rowHeight,
        margin[1]
      );
      const itemCenterOffsetX = itemPixelWidth / 2;
      const itemCenterOffsetY = itemPixelHeight / 2;
      const rawGridX =
        e.clientX - gridRect.left + dragOffsetX - itemCenterOffsetX;
      const rawGridY =
        e.clientY - gridRect.top + dragOffsetY - itemCenterOffsetY;
      const clampedGridX = Math.max(0, rawGridX);
      const clampedGridY = Math.max(0, rawGridY);
      const newDroppingPosition: DroppingPosition = {
        left: clampedGridX / transformScale,
        top: clampedGridY / transformScale,
        e: e.nativeEvent
      };

      // Passive mode: compute a preview placeholder without mutating layout
      if (externalDropMode === "passive") {
        try {
          const placeholder = computePlaceholder(
            layoutRef.current,
            finalDroppingItem,
            positionParams,
            compactor,
            {
              clientX: e.clientX,
              clientY: e.clientY,
              containerRect: gridRect,
              dragOffsetX,
              dragOffsetY,
              transformScale
            }
          );
          onExternalPreviewProp(placeholder);
        } catch (err) {
          // Swallow any errors in the passive preview to avoid breaking drags
          logDebug("computePlaceholder failed", err);
        }
        return;
      }

      if (!droppingDOMNode) {
        const calculatedPosition = calcXY(
          positionParams,
          clampedGridY,
          clampedGridX,
          finalDroppingItem.w,
          finalDroppingItem.h
        );

        setDroppingDOMNode(<div key={finalDroppingItem.i} />);
        updateDropPlaceholder(
          {
            ...finalDroppingItem,
            x: calculatedPosition.x,
            y: calculatedPosition.y,
            static: false,
            isDraggable: true
          },
          newDroppingPosition
        );
        return;
      }

      if (
        !droppingPosition ||
        droppingPosition.left !== newDroppingPosition.left ||
        droppingPosition.top !== newDroppingPosition.top
      ) {
        updateDropPlaceholder(finalDroppingItem, newDroppingPosition);
      }
    },
    [
      dropConfigOnDragOver,
      onDropDragOverProp,
      droppingDOMNode,
      removeDroppingPlaceholder,
      droppingItem,
      cols,
      margin,
      maxRows,
      rowHeight,
      width,
      effectiveContainerPadding,
      transformScale,
      droppingPosition,
      updateDropPlaceholder
    ]
  );

  const handleDragLeave = useCallback(
    (e: ReactDragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragEnterCounterRef.current--;

      if (dragEnterCounterRef.current < 0) {
        dragEnterCounterRef.current = 0;
      }

      if (dragEnterCounterRef.current === 0) {
        if (externalDropMode === "passive") {
          // Passive previews are handled by the consumer via onExternalPreview
          onExternalPreviewProp(null);
        } else {
          removeDroppingPlaceholder();
        }
      }
    },
    [removeDroppingPlaceholder, externalDropMode, onExternalPreviewProp]
  );

  const handleDragEnter = useCallback((e: ReactDragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragEnterCounterRef.current++;
  }, []);

  const handleDrop = useCallback(
    (e: ReactDragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const currentLayout = layoutRef.current;
      const item = currentLayout.find((l) => l.i === droppingItem.i);
      dragEnterCounterRef.current = 0;
      if (externalDropMode === "passive") {
        // Do not mutate internal layout during passive preview — inform consumer
        onExternalPreviewProp(null);
        onDropProp(currentLayout, undefined, e.nativeEvent);
      } else {
        removeDroppingPlaceholder();
        onDropProp(currentLayout, item, e.nativeEvent);
      }
    },
    [droppingItem.i, removeDroppingPlaceholder, onDropProp, externalDropMode, onExternalPreviewProp]
  );

  const processGridItem = useCallback(
    (child: ReactElement, isDroppingItem?: boolean): ReactElement | null => {
      if (!child || !child.key) {
        return null;
      }

      const layoutItem = getLayoutItem(layout, String(child.key));
      if (!layoutItem) {
        return null;
      }

      const draggable =
        typeof layoutItem.isDraggable === "boolean"
          ? layoutItem.isDraggable
          : !layoutItem.static && isDraggable;
      const resizable =
        typeof layoutItem.isResizable === "boolean"
          ? layoutItem.isResizable
          : !layoutItem.static && isResizable;
      const resizeHandlesOptions = layoutItem.resizeHandles || [...resizeHandles];
      const bounded = draggable && isBounded && layoutItem.isBounded !== false;
      const resizeHandleElement = resizeHandle as ResizeHandle | undefined;

      return (
        <GridItem
          key={layoutItem.i}
          containerWidth={width}
          cols={cols}
          margin={margin}
          containerPadding={effectiveContainerPadding}
          maxRows={maxRows}
          rowHeight={rowHeight}
          cancel={draggableCancel}
          handle={draggableHandle}
          onDragStart={isDroppingItem ? undefined : onDragStart}
          onDrag={isDroppingItem ? undefined : onDrag}
          onDragStop={isDroppingItem ? undefined : onDragStop}
          onDragModeChange={isDroppingItem ? undefined : onGridItemDragModeChange}
          onResizeStart={onResizeStart}
          onResize={onResize}
          onResizeStop={onResizeStop}
          onResizeCancel={onResizeCancel}
          isDraggable={draggable}
          isResizable={resizable}
          isBounded={bounded}
          enableSortable={!isDroppingItem}
          useCSSTransforms={useCSSTransforms && mounted}
          usePercentages={!mounted}
          transformScale={transformScale}
          positionStrategy={positionStrategy}
          dragThreshold={dragThreshold}
          w={layoutItem.w}
          h={layoutItem.h}
          x={layoutItem.x}
          y={layoutItem.y}
          i={layoutItem.i}
          minH={layoutItem.minH}
          minW={layoutItem.minW}
          maxH={layoutItem.maxH}
          maxW={layoutItem.maxW}
          static={layoutItem.static}
          isDndKitDragSource={!isDroppingItem && dragOverlayId === layoutItem.i}
          droppingPosition={
            isDroppingItem ? interactionState.droppingPosition : undefined
          }
          resizeHandles={resizeHandlesOptions}
          resizeHandle={resizeHandleElement}
          constraints={constraints}
          layoutItem={layoutItem}
          layout={layout}
        >
          {child}
        </GridItem>
      );
    },
    [
      layout,
      width,
      cols,
      margin,
      effectiveContainerPadding,
      maxRows,
      rowHeight,
      draggableCancel,
      draggableHandle,
      onDragStart,
      onDrag,
      onDragStop,
      onGridItemDragModeChange,
      onResizeStart,
      onResize,
      onResizeStop,
      isDraggable,
      isResizable,
      isBounded,
      useCSSTransforms,
      mounted,
      transformScale,
      positionStrategy,
      dragThreshold,
      dragOverlayId,
      interactionState.droppingPosition,
      resizeHandles,
      resizeHandle,
      constraints
    ]
  );

  const renderPlaceholder = (): ReactElement | null => {
    if (!interactionState.isInteracting || !interactionState.activeDrag) {
      return null;
    }

    const placeholderId = `__rgl-interaction-placeholder__${interactionState.activeDrag.i}`;

    return (
      <GridItem
        key={placeholderId}
        w={interactionState.activeDrag.w}
        h={interactionState.activeDrag.h}
        x={interactionState.activeDrag.x}
        y={interactionState.activeDrag.y}
        i={placeholderId}
        className={`react-grid-placeholder ${interactionState.resizing ? "placeholder-resizing" : ""}`}
        containerWidth={width}
        cols={cols}
        margin={margin}
        containerPadding={effectiveContainerPadding}
        maxRows={maxRows}
        rowHeight={rowHeight}
        isDraggable={false}
        isResizable={false}
        isBounded={false}
        onResizeCancel={onResizeCancel}
        enableSortable={false}
        useCSSTransforms={useCSSTransforms}
        transformScale={transformScale}
        constraints={constraints}
        layout={layout}
      >
        <div />
      </GridItem>
    );
  };

  const renderDragOverlay = useCallback((): ReactElement | null => {
    if (!dragOverlayId) {
      return null;
    }

    const child = childMap.get(dragOverlayId);
    const session = activeDndDragRef.current;
    if (!child || !session) {
      return null;
    }

    const childProps = child.props as Record<string, unknown>;
    const childClassName = childProps["className"] as string | undefined;
    const childStyle = childProps["style"] as CSSProperties | undefined;
    const size = calcGridItemPosition(
      positionParams,
      session.origin.x,
      session.origin.y,
      session.origin.w,
      session.origin.h
    );

    const overlayChild = React.cloneElement(child, {
      className: clsx(
        "react-grid-item",
        "react-draggable",
        "react-draggable-dragging",
        childClassName
      ),
      style: {
        ...childStyle,
        width: "100%",
        height: "100%",
        touchAction: "none"
      }
    } as Record<string, unknown>);

    const showPlus = session.mode === "CROSS_GRID_MOVE" && showCrossPlus;

    logDebug("[GridLayout] renderDragOverlay", { sessionMode: session.mode, showCrossPlus, showPlus });

    return (
      <div
        style={{
          position: "relative",
          width: size.width,
          height: size.height,
          pointerEvents: "none"
        }}
      >
        {overlayChild}
        {showPlus && (
          <CrossPlus
            style={{
              position: "absolute",
              right: 5,
              top: 5,
              zIndex: 99999
            }}
            icon={crossGridIcon}
          />
        )}
      </div>
    );
  }, [childMap, dragOverlayId, positionParams, showCrossPlus]);

  const mergedClassName = clsx(layoutClassName, className);
  const mergedStyle: CSSProperties = {
    height: containerHeight,
    ...style
  };

  const portalPosition = useMemo(() => {
    if (!plusPortalCoords) return null;
    let left = plusPortalCoords.x + 5; // offset to bottom-right of cursor
    let top = plusPortalCoords.y + 5;
    if (typeof window !== "undefined") {
      left = Math.min(Math.max(0, left), window.innerWidth - 28);
      top = Math.min(Math.max(0, top), window.innerHeight - 28);
    }
    return { left, top };
  }, [plusPortalCoords]);

  return (
    <>
      <DragDropProvider
        sensors={dndSensors}
        onDragStart={handleDndKitDragStart}
        onDragMove={handleDndKitDragMove}
        onDragEnd={handleDndKitDragEnd}
      >
        <div
          ref={setContainerNode}
          className={mergedClassName}
          style={mergedStyle}
          onDrop={isDroppable ? handleDrop : undefined}
          onDragLeave={isDroppable ? handleDragLeave : undefined}
          onDragEnter={isDroppable ? handleDragEnter : undefined}
          onDragOver={isDroppable ? handleDragOver : undefined}
        >
          {React.Children.map(children, (child) => {
            if (!React.isValidElement(child)) {
              return null;
            }
            return processGridItem(child);
          })}
          {isDroppable && droppingDOMNode && processGridItem(droppingDOMNode, true)}
          {renderPlaceholder()}
        </div>
        <DragOverlay disabled={!dragOverlayId} dropAnimation={null}>
          {renderDragOverlay()}
        </DragOverlay>
      </DragDropProvider>

      {typeof document !== "undefined" &&
        portalPosition &&
        dragOverlayId &&
        activeDndDragRef.current?.mode === "CROSS_GRID_MOVE"
        ? createPortal(
            <CrossPlus
              id="rgl-cross-plus"
              dataRgl
              style={{
                position: "fixed",
                left: portalPosition.left,
                top: portalPosition.top,
                zIndex: 2147483647
              }}
              icon={crossGridIcon}
            />,
            document.body
          )
        : null}
    </>
  );
}

export default GridLayout;
