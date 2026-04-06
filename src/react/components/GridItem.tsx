/**
 * GridItem component
 *
 * Workspace migration version: removes direct react-draggable/react-resizable
 * coupling and preserves the existing grid math/callback contracts with native
 * pointer-driven drag and resize interactions.
 */

import React, {
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
  type ReactElement,
  type CSSProperties
} from "react";
import clsx from "clsx";
import {
  isRuntimeDndAvailable,
  useRuntimeDragDropMonitor,
  useRuntimeDraggable,
  useRuntimeSortable
} from "../dnd/runtime.js";
import { logDebug } from "../utils/log.js";

import type {
  Position,
  DroppingPosition,
  ResizeHandleAxis,
  GridDragEvent,
  GridResizeEvent,
  LayoutConstraint,
  ConstraintContext,
  Layout,
  LayoutItem as LayoutItemType,
  PositionStrategy,
  DragMoveMode
} from "../../core/types.js";
import type { PositionParams } from "../../core/calculate.js";
import {
  calcGridItemPosition,
  calcGridItemWHPx,
  calcGridColWidth,
  calcXYRaw,
  calcWHRaw,
  clamp
} from "../../core/calculate.js";
import {
  applyPositionConstraints,
  applySizeConstraints,
  defaultConstraints
} from "../../core/constraints.js";
import {
  setTransform,
  setTopLeft,
  perc,
  resizeItemInDirection
} from "../../core/position.js";

type PartialPosition = { top: number; left: number };

type ResizeHandleElementProps = {
  className?: string;
  onPointerDown?: React.PointerEventHandler<HTMLElement>;
  onMouseDown?: React.MouseEventHandler<HTMLElement>;
  onTouchStart?: React.TouchEventHandler<HTMLElement>;
  style?: CSSProperties;
};

type DragInputEvent = MouseEvent | PointerEvent | TouchEvent;
type NativeInputKind = "pointer" | "mouse" | "touch";

type ResizeStartEvent =
  | React.PointerEvent<HTMLElement>
  | React.MouseEvent<HTMLElement>
  | React.TouchEvent<HTMLElement>;

export type GridItemCallback<Data extends GridDragEvent | GridResizeEvent> = (
  i: string,
  w: number,
  h: number,
  data: Data
) => void;

export type ResizeHandle =
  | ReactElement
  | ((
      resizeHandleAxis: ResizeHandleAxis,
      ref: React.Ref<HTMLElement>
    ) => ReactElement);

export interface GridItemDragData {
  kind: "drag";
  itemId: string;
}

export interface GridItemResizeData {
  kind: "resize";
  itemId: string;
  axis: ResizeHandleAxis;
}

interface ResizeCallbackData {
  node: HTMLElement;
  size: { width: number; height: number };
  handle: ResizeHandleAxis;
}

interface DragSession {
  cleanup: () => void;
}

interface ResizeSession {
  cleanup: () => void;
}

interface ActiveDndResizeSession {
  axis: ResizeHandleAxis;
  node: HTMLElement;
  origin: Position;
  /** Initial pointer coordinates from the activator event — used to compute
   * a real-time delta because event.operation.transform is stale in dnd-kit v0.3.2
   * (position.current is updated in a queueMicrotask after dragmove fires). */
  initialPointer: { x: number; y: number };
}

function describeElementForDebug(node: EventTarget | null | undefined): string | null {
  if (!(node instanceof Element)) {
    return null;
  }

  const className =
    typeof node.className === "string" ? node.className.trim() : "";
  return className.length > 0
    ? `${node.tagName.toLowerCase()}.${className.replace(/\s+/g, ".")}`
    : node.tagName.toLowerCase();
}

function getGridItemResizeData(
  data: unknown
): GridItemResizeData | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const itemId = (data as { itemId?: unknown }).itemId;
  const axis = (data as { axis?: unknown }).axis;
  const kind = (data as { kind?: unknown }).kind;
  return kind === "resize" &&
    typeof itemId === "string" &&
    typeof axis === "string"
    ? { kind, itemId, axis: axis as ResizeHandleAxis }
    : null;
}

function getGridItemDragData(
  data: unknown
): GridItemDragData | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const kind = (data as { kind?: unknown }).kind;
  const itemId = (data as { itemId?: unknown }).itemId;
  return kind === "drag" && typeof itemId === "string"
    ? { kind, itemId }
    : null;
}

interface GridResizeHandleProps {
  axis: ResizeHandleAxis;
  itemId: string;
  resizeHandle?: ResizeHandle;
  supportsDndKitResize: boolean;
  onPointerDown?: React.PointerEventHandler<HTMLElement>;
  onMouseDown?: React.MouseEventHandler<HTMLElement>;
  onTouchStart?: React.TouchEventHandler<HTMLElement>;
}

function GridResizeHandle({
  axis,
  itemId,
  resizeHandle,
  supportsDndKitResize,
  onPointerDown,
  onMouseDown,
  onTouchStart
}: GridResizeHandleProps): ReactElement {
  const commonClassName = clsx(
    "react-resizable-handle",
    `react-resizable-handle-${axis}`
  );
  const { ref: resizeRef } = useRuntimeDraggable<GridItemResizeData>({
    id: `${itemId}:resize:${axis}`,
    data: {
      kind: "resize",
      itemId,
      axis
    },
    disabled: !supportsDndKitResize,
    feedback: "none"
  });
  const commonProps = {
    className: commonClassName,
    onPointerDown,
    onMouseDown,
    onTouchStart,
    ref: supportsDndKitResize ? resizeRef : null,
    style: { touchAction: "none" } as CSSProperties
  };

  if (typeof resizeHandle === "function") {
    return React.cloneElement(
      resizeHandle(axis, supportsDndKitResize ? resizeRef : null) as ReactElement<ResizeHandleElementProps>,
      commonProps
    );
  }

  if (React.isValidElement(resizeHandle)) {
    const element = resizeHandle as ReactElement<ResizeHandleElementProps>;
    return React.cloneElement(element, {
      ...commonProps,
      className: clsx(commonClassName, element.props.className)
    });
  }

  return <span key={axis} {...commonProps} />;
}

export interface GridItemProps {
  children: ReactElement;
  cols: number;
  containerWidth: number;
  margin: readonly [number, number];
  containerPadding: readonly [number, number];
  rowHeight: number;
  maxRows: number;
  isDraggable: boolean;
  isResizable: boolean;
  isBounded: boolean;
  static?: boolean;
  useCSSTransforms?: boolean;
  usePercentages?: boolean;
  transformScale?: number;
  positionStrategy?: PositionStrategy;
  dragThreshold?: number;
  droppingPosition?: DroppingPosition;
  enableSortable?: boolean;
  className?: string;
  style?: CSSProperties;
  handle?: string;
  cancel?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  maxW?: number;
  minH?: number;
  maxH?: number;
  i: string;
  resizeHandles?: ResizeHandleAxis[];
  resizeHandle?: ResizeHandle;
  constraints?: LayoutConstraint[];
  layoutItem?: LayoutItemType;
  layout?: Layout;
  onDragStart?: GridItemCallback<GridDragEvent>;
  onDrag?: GridItemCallback<GridDragEvent>;
  onDragStop?: GridItemCallback<GridDragEvent>;
  onResizeStart?: GridItemCallback<GridResizeEvent>;
  onResize?: GridItemCallback<GridResizeEvent>;
  onResizeStop?: GridItemCallback<GridResizeEvent>;
  onResizeCancel?: (itemId: string) => void;
  /**
   * Called when the drag move mode toggles via CTRL/CMD key press or release
   * while the drag handle is held down (before dragging has started).
   * Mode is locked once dragging begins; this callback is not fired after lock.
   */
  onDragModeChange?: (
    itemId: string,
    mode: DragMoveMode,
    event: Event | null
  ) => void;
  /**
   * When true, this item is currently the dnd-kit drag source (tracked by our
   * own React state via dragOverlayId). We use this — not dnd-kit's own
   * `isSortableDragSource` — to apply `visibility:hidden`, because dnd-kit's
   * reset is asynchronous and may lag behind our state update, leaving the
   * element invisible and un-clickable after the drag completes.
   */
  isDndKitDragSource?: boolean;
}

function getTargetElement(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target : null;
}

function isTouchInputEvent(event: Event): event is TouchEvent {
  return "changedTouches" in event;
}

function isMouseLikeInputEvent(
  event: DragInputEvent
): event is MouseEvent | PointerEvent {
  return !isTouchInputEvent(event);
}

function getTrackedTouch(
  event: TouchEvent,
  touchId?: number
): Touch | null {
  const touchLists = [event.changedTouches, event.touches, event.targetTouches];

  for (const touchList of touchLists) {
    for (let index = 0; index < touchList.length; index += 1) {
      const touch =
        typeof touchList.item === "function"
          ? touchList.item(index)
          : touchList[index];
      if (!touch) {
        continue;
      }
      if (touchId === undefined || touch.identifier === touchId) {
        return touch;
      }
    }
  }

  return null;
}

function getInputCoordinates(
  event: DragInputEvent,
  touchId?: number
): { clientX: number; clientY: number } | null {
  if (isTouchInputEvent(event)) {
    const touch = getTrackedTouch(event, touchId);
    return touch
      ? { clientX: touch.clientX, clientY: touch.clientY }
      : null;
  }

  return { clientX: event.clientX, clientY: event.clientY };
}

function createResizeCandidate(
  origin: Position,
  handle: ResizeHandleAxis,
  deltaX: number,
  deltaY: number
): Position {
  const next: Position = { ...origin };

  if (handle.includes("e")) {
    next.width = origin.width + deltaX;
  }
  if (handle.includes("s")) {
    next.height = origin.height + deltaY;
  }
  if (handle.includes("w")) {
    next.width = origin.width - deltaX;
    next.left = origin.left + deltaX;
  }
  if (handle.includes("n")) {
    next.height = origin.height - deltaY;
    next.top = origin.top + deltaY;
  }

  return next;
}

function isPrimaryInputStart(
  kind: NativeInputKind,
  event: DragInputEvent
): boolean {
  if (kind === "touch") {
    return true;
  }

  return isMouseLikeInputEvent(event) && event.button === 0;
}

function getTrackedInputId(
  kind: NativeInputKind,
  event: DragInputEvent
): number | undefined {
  return kind === "touch" && isTouchInputEvent(event)
    ? getTrackedTouch(event)?.identifier
    : undefined;
}

function isTrackedInputEvent(
  kind: NativeInputKind,
  startEvent: DragInputEvent,
  nextEvent: DragInputEvent
): boolean {
  if (
    kind === "pointer" &&
    nextEvent instanceof PointerEvent &&
    startEvent instanceof PointerEvent
  ) {
    return nextEvent.pointerId === startEvent.pointerId;
  }

  return true;
}

function preventTouchMoveDefault(
  kind: NativeInputKind,
  event: DragInputEvent
): void {
  if (kind === "touch" && isTouchInputEvent(event)) {
    event.preventDefault();
  }
}

function createNativeInteractionSession(
  kind: NativeInputKind,
  startEvent: DragInputEvent,
  node: HTMLElement,
  onMove: (event: DragInputEvent) => void,
  onEnd: (event: DragInputEvent) => void
): () => void {
  const ownerDocument = node.ownerDocument ?? document;

  if (kind === "pointer" && startEvent instanceof PointerEvent) {
    const moveListener = (moveEvent: PointerEvent) => onMove(moveEvent);
    const endListener = (endEvent: PointerEvent) => onEnd(endEvent);
    ownerDocument.addEventListener("pointermove", moveListener);
    ownerDocument.addEventListener("pointerup", endListener);
    ownerDocument.addEventListener("pointercancel", endListener);
    node.setPointerCapture?.(startEvent.pointerId);
    return () => {
      ownerDocument.removeEventListener("pointermove", moveListener);
      ownerDocument.removeEventListener("pointerup", endListener);
      ownerDocument.removeEventListener("pointercancel", endListener);
      if (node.hasPointerCapture?.(startEvent.pointerId)) {
        node.releasePointerCapture(startEvent.pointerId);
      }
    };
  }

  if (kind === "mouse" && startEvent instanceof MouseEvent) {
    const moveListener = (moveEvent: MouseEvent) => onMove(moveEvent);
    const endListener = (endEvent: MouseEvent) => onEnd(endEvent);
    ownerDocument.addEventListener("mousemove", moveListener);
    ownerDocument.addEventListener("mouseup", endListener);
    return () => {
      ownerDocument.removeEventListener("mousemove", moveListener);
      ownerDocument.removeEventListener("mouseup", endListener);
    };
  }

  if (kind === "touch" && isTouchInputEvent(startEvent)) {
    const moveListener = (moveEvent: TouchEvent) => onMove(moveEvent);
    const endListener = (endEvent: TouchEvent) => onEnd(endEvent);
    ownerDocument.addEventListener("touchmove", moveListener, {
      passive: false
    });
    ownerDocument.addEventListener("touchend", endListener);
    ownerDocument.addEventListener("touchcancel", endListener);
    return () => {
      ownerDocument.removeEventListener("touchmove", moveListener);
      ownerDocument.removeEventListener("touchend", endListener);
      ownerDocument.removeEventListener("touchcancel", endListener);
    };
  }

  return () => {};
}

export function GridItem(props: GridItemProps): ReactElement {
  const {
    children,
    cols,
    containerWidth,
    margin,
    containerPadding,
    rowHeight,
    maxRows,
    isDraggable,
    isResizable,
    isBounded,
    static: isStatic,
    useCSSTransforms = true,
    usePercentages = false,
    transformScale = 1,
    positionStrategy,
    dragThreshold = 0,
    droppingPosition,
    enableSortable = true,
    className = "",
    style,
    handle = "",
    cancel = "",
    x,
    y,
    w,
    h,
    minW = 1,
    maxW = Infinity,
    minH = 1,
    maxH = Infinity,
    i,
    resizeHandles,
    resizeHandle,
    constraints = defaultConstraints,
    isDndKitDragSource = false,
    layoutItem,
    layout = [],
    onDragStart: onDragStartProp,
    onDrag: onDragProp,
    onDragStop: onDragStopProp,
    onResizeStart: onResizeStartProp,
    onResize: onResizeProp,
    onResizeStop: onResizeStopProp,
    onResizeCancel: onResizeCancelProp,
    onDragModeChange: onDragModeChangeProp
  } = props;

  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  const elementRef = useRef<HTMLDivElement>(null);
  const dragPositionRef = useRef<PartialPosition>({ left: 0, top: 0 });
  const resizePositionRef = useRef<Position>({
    top: 0,
    left: 0,
    width: 0,
    height: 0
  });
  const prevDroppingPositionRef = useRef<DroppingPosition | undefined>(undefined);
  const layoutRef = useRef<Layout>(layout);
  const dragSessionRef = useRef<DragSession | null>(null);
  const resizeSessionRef = useRef<ResizeSession | null>(null);
  const dragPendingRef = useRef(false);
  const initialDragClientRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const thresholdExceededRef = useRef(false);
  const draggingRef = useRef(false);
  const activeDndResizeRef = useRef<ActiveDndResizeSession | null>(null);
  // Drag move mode: tracks CTRL/CMD state while handle is selected.
  // Locked to a non-null value when dragging actually starts.
  const dragModeRef = useRef<DragMoveMode>("INNER_GRID_MOVE");
  const lockedModeRef = useRef<DragMoveMode | null>(null);
  // Ref to key-listener cleanup fn, installed on handle pointerdown.
  const keyListenerCleanupRef = useRef<(() => void) | null>(null);
  // Stable refs so key-listener closures always call the latest callback / use the latest id.
  const iRef = useRef(i);
  iRef.current = i;
  const onDragModeChangePropRef = useRef(onDragModeChangeProp);
  onDragModeChangePropRef.current = onDragModeChangeProp;
  const runtimeDndAvailable = isRuntimeDndAvailable();
  const nativePointerEventsAvailable =
    typeof window !== "undefined" && "PointerEvent" in window;
  const runtimePointerEventsAvailable =
    enableSortable &&
    nativePointerEventsAvailable;
  const supportsDndKitRuntime =
    runtimeDndAvailable && runtimePointerEventsAvailable;
  const supportsDndKitDrag =
    supportsDndKitRuntime && isDraggable && !isStatic;
  const supportsDndKitResize =
    supportsDndKitRuntime && isResizable && !isStatic;
  const useNativeDragFallback =
    !supportsDndKitDrag && isDraggable && !isStatic;
  const useNativeResizeFallback =
    !supportsDndKitResize && isResizable && !isStatic;

  layoutRef.current = layout;

  const resolvedResizeHandles = useMemo<ResizeHandleAxis[]>(
    () => [...(resizeHandles ?? ["se"])],
    [resizeHandles]
  );
  const sortableIndex = useMemo(
    () => Math.max(0, layout.findIndex((item) => item.i === i)),
    [layout, i]
  );
  const {
    isDragSource: isSortableDragSource,
    ref: sortableRef,
    handleRef: sortableHandleRef
  } = useRuntimeSortable<GridItemDragData>({
    id: i,
    index: sortableIndex,
    group: "react-grid-layout",
    data: { kind: "drag", itemId: i },
    disabled: !supportsDndKitDrag,
    feedback: "none",
    transition: null
  });

  const dragCancelSelector = useMemo(
    () =>
      [".react-resizable-handle", cancel]
        .filter((value): value is string => value.length > 0)
        .join(","),
    [cancel]
  );
  const setElementRef = useCallback(
    (node: HTMLDivElement | null) => {
      elementRef.current = node;
      logDebug("[GridItem] setElementRef", {
        i,
        node: describeElementForDebug(node),
        connected: node?.isConnected ?? false,
        supportsDndKitDrag,
        handle
      });
      sortableRef(node);
        if (!supportsDndKitDrag) {
          sortableHandleRef(null);
          return;
        }

        const handleElement = handle && node ? node.querySelector(handle) : null;
      logDebug("[GridItem] setElementRef: sortable handle assigned", {
        i,
        handle,
        handleElement: describeElementForDebug(handleElement)
      });
        sortableHandleRef(handleElement instanceof Element ? handleElement : null);
    },
    [handle, i, sortableHandleRef, sortableRef, supportsDndKitDrag]
  );

  const positionParams: PositionParams = useMemo(
    () => ({
      cols,
      containerPadding: containerPadding as [number, number],
      containerWidth,
      margin: margin as [number, number],
      maxRows,
      rowHeight
    }),
    [cols, containerPadding, containerWidth, margin, maxRows, rowHeight]
  );

  interface GridItemDndSnapshot {
    left: number;
    top: number;
    width: number;
    height: number;
    gridX: number;
    gridY: number;
  }

  function createGridItemDndSnapshot(
    snapshotParams: PositionParams,
    item: Pick<GridItemProps, "x" | "y" | "w" | "h">,
    dragPosition?: { top: number; left: number } | null,
    resizePosition?: Position | null
  ): GridItemDndSnapshot {
    const position = calcGridItemPosition(
      snapshotParams,
      item.x,
      item.y,
      item.w,
      item.h,
      dragPosition ?? null,
      resizePosition ?? null
    );
    const { x: gridX, y: gridY } = calcXYRaw(
      snapshotParams,
      position.top,
      position.left
    );
    return {
      left: position.left,
      top: position.top,
      width: position.width,
      height: position.height,
      gridX,
      gridY
    };
  }

  function getGridItemPixelDelta(
    previous: { top: number; left: number },
    next: { top: number; left: number }
  ): { deltaX: number; deltaY: number } {
    return {
      deltaX: next.left - previous.left,
      deltaY: next.top - previous.top
    };
  }

  const constraintContext: ConstraintContext = useMemo(
    () => ({
      cols,
      maxRows,
      containerWidth,
      containerHeight: 0,
      rowHeight,
      margin,
      layout: []
    }),
    [cols, maxRows, containerWidth, rowHeight, margin]
  );

  const getConstraintContext = useCallback(
    (): ConstraintContext => ({
      ...constraintContext,
      layout: layoutRef.current
    }),
    [constraintContext]
  );
  const getRuntimeInteractionEvent = useCallback(
    (event: { nativeEvent?: Event; operation: { activatorEvent: Event | null } }) =>
      event.nativeEvent ?? event.operation.activatorEvent ?? new Event("drag"),
    []
  );

  const effectiveLayoutItem: LayoutItemType = useMemo(
    () =>
      layoutItem ?? {
        i,
        x,
        y,
        w,
        h,
        minW,
        maxW,
        minH,
        maxH
      },
    [layoutItem, i, x, y, w, h, minW, maxW, minH, maxH]
  );

  const createStyle = useCallback(
    (pos: Position): CSSProperties => {
      if (positionStrategy?.calcStyle) {
        return positionStrategy.calcStyle(pos);
      }

      if (useCSSTransforms) {
        return setTransform(pos) as CSSProperties;
      }

      const styleObject = setTopLeft(pos) as CSSProperties;
      if (usePercentages) {
        return {
          ...styleObject,
          left: perc(pos.left / containerWidth),
          width: perc(pos.width / containerWidth)
        };
      }

      return styleObject;
    },
    [positionStrategy, useCSSTransforms, usePercentages, containerWidth]
  );

  const getDragStartPosition = useCallback(
    (clientX: number, clientY: number, node: HTMLElement): PartialPosition | null => {
      const { offsetParent } = node;
      if (!offsetParent) {
        return null;
      }

      const parentRect = offsetParent.getBoundingClientRect();
      const clientRect = node.getBoundingClientRect();
      const cLeft = clientRect.left / transformScale;
      const pLeft = parentRect.left / transformScale;
      const cTop = clientRect.top / transformScale;
      const pTop = parentRect.top / transformScale;

      if (positionStrategy?.calcDragPosition) {
        return positionStrategy.calcDragPosition(
          clientX,
          clientY,
          clientX - clientRect.left,
          clientY - clientRect.top
        );
      }

      return {
        left: cLeft - pLeft + offsetParent.scrollLeft,
        top: cTop - pTop + offsetParent.scrollTop
      };
    },
    [positionStrategy, transformScale]
  );

  const clearDragSession = useCallback(() => {
    const session = dragSessionRef.current;
    if (!session) {
      return;
    }

    session.cleanup();
    dragSessionRef.current = null;
  }, []);

  const clearResizeSession = useCallback(() => {
    const session = resizeSessionRef.current;
    if (!session) {
      return;
    }

    session.cleanup();
    resizeSessionRef.current = null;
  }, []);

  const emitDragStart = useCallback(
    (
      event: Event,
      node: HTMLElement,
      newPosition: PartialPosition,
      skipThreshold: boolean,
      clientX?: number,
      clientY?: number
    ) => {
      logDebug("[GridItem] emitDragStart", { i, skipThreshold, clientX, clientY, newPosition });
      dragPositionRef.current = newPosition;
      if (clientX !== undefined && clientY !== undefined) {
        initialDragClientRef.current = { x: clientX, y: clientY };
      }

      setDragging(true);
      draggingRef.current = true;

      if (dragThreshold > 0 && !skipThreshold) {
        dragPendingRef.current = true;
        thresholdExceededRef.current = false;
        return;
      }

      dragPendingRef.current = false;
      thresholdExceededRef.current = true;

      // Lock the drag mode so subsequent CTRL/CMD presses don't change it.
      lockedModeRef.current ??= dragModeRef.current;

      if (!onDragStartProp) {
        return;
      }

      const rawPos = calcXYRaw(positionParams, newPosition.top, newPosition.left);
      const { x: newX, y: newY } = applyPositionConstraints(
        constraints,
        effectiveLayoutItem,
        rawPos.x,
        rawPos.y,
        getConstraintContext()
      );

      logDebug("[GridItem] calling onDragStartProp", i, newX, newY);
      onDragStartProp(i, newX, newY, {
        e: event,
        node,
        newPosition,
        mode: lockedModeRef.current
      });
    },
    [
      dragThreshold,
      onDragStartProp,
      positionParams,
      constraints,
      effectiveLayoutItem,
      getConstraintContext,
      i
    ]
  );

  const emitDragMove = useCallback(
    (
      event: Event,
      node: HTMLElement,
      deltaX: number,
      deltaY: number,
      clientX?: number,
      clientY?: number
    ) => {
      logDebug("[GridItem] emitDragMove", { i, deltaX, deltaY, clientX, clientY });
      if (!draggingRef.current && !dragPendingRef.current) {
        return;
      }

      if (
        dragPendingRef.current &&
        !thresholdExceededRef.current &&
        clientX !== undefined &&
        clientY !== undefined
      ) {
        const dx = clientX - initialDragClientRef.current.x;
        const dy = clientY - initialDragClientRef.current.y;
        const distance = Math.hypot(dx, dy);
        if (distance < dragThreshold) {
          return;
        }

        thresholdExceededRef.current = true;
        dragPendingRef.current = false;

        if (onDragStartProp) {
          // Lock mode when threshold is exceeded (drag actually starts).
          lockedModeRef.current ??= dragModeRef.current;
          const rawPos = calcXYRaw(
            positionParams,
            dragPositionRef.current.top,
            dragPositionRef.current.left
          );
          const { x: startX, y: startY } = applyPositionConstraints(
            constraints,
            effectiveLayoutItem,
            rawPos.x,
            rawPos.y,
            getConstraintContext()
          );
          logDebug("[GridItem] emitting onDragStart from pending state", i, startX, startY);
          onDragStartProp(i, startX, startY, {
            e: event,
            node,
            newPosition: dragPositionRef.current,
            mode: lockedModeRef.current
          });
        }
      }

      let top = dragPositionRef.current.top + deltaY;
      let left = dragPositionRef.current.left + deltaX;

      if (isBounded) {
        const { offsetParent } = node;
        if (offsetParent) {
          const bottomBoundary =
            offsetParent.clientHeight - calcGridItemWHPx(h, rowHeight, margin[1]);
          top = clamp(top, 0, bottomBoundary);

          const colWidth = calcGridColWidth(positionParams);
          const rightBoundary =
            containerWidth - calcGridItemWHPx(w, colWidth, margin[0]);
          left = clamp(left, 0, rightBoundary);
        }
      }

      const newPosition: PartialPosition = { top, left };
      dragPositionRef.current = newPosition;

      if (!onDragProp) {
        return;
      }

      const rawPos = calcXYRaw(positionParams, top, left);
      const { x: newX, y: newY } = applyPositionConstraints(
        constraints,
        effectiveLayoutItem,
        rawPos.x,
        rawPos.y,
        getConstraintContext()
      );

      logDebug("[GridItem] calling onDragProp", i, newX, newY);
      onDragProp(i, newX, newY, {
        e: event,
        node,
        newPosition,
        mode: lockedModeRef.current ?? dragModeRef.current
      });
    },
    [
      dragThreshold,
      onDragStartProp,
      positionParams,
      constraints,
      effectiveLayoutItem,
      getConstraintContext,
      i,
      isBounded,
      h,
      rowHeight,
      margin,
      containerWidth,
      w,
      onDragProp
    ]
  );

  const emitDragStop = useCallback(
    (event: Event, node: HTMLElement) => {
      logDebug("[GridItem] emitDragStop", { i, eventType: event?.type });
      if (!draggingRef.current && !dragPendingRef.current) {
        return;
      }

      const wasPending = dragPendingRef.current;
      dragPendingRef.current = false;
      thresholdExceededRef.current = false;
      initialDragClientRef.current = { x: 0, y: 0 };

      if (wasPending) {
        setDragging(false);
        draggingRef.current = false;
        dragPositionRef.current = { left: 0, top: 0 };
        return;
      }

      const { left, top } = dragPositionRef.current;
      const newPosition: PartialPosition = { top, left };
      setDragging(false);
      draggingRef.current = false;
      dragPositionRef.current = { left: 0, top: 0 };

      if (!onDragStopProp) {
        return;
      }

      const rawPos = calcXYRaw(positionParams, top, left);
      const { x: newX, y: newY } = applyPositionConstraints(
        constraints,
        effectiveLayoutItem,
        rawPos.x,
        rawPos.y,
        getConstraintContext()
      );

      logDebug("[GridItem] calling onDragStopProp", i, newX, newY);
      onDragStopProp(i, newX, newY, {
        e: event,
        node,
        newPosition,
        mode: lockedModeRef.current ?? dragModeRef.current
      });

      // Reset drag-mode state after drag ends.
      lockedModeRef.current = null;
      dragModeRef.current = "INNER_GRID_MOVE";
    },
    [
      onDragStopProp,
      positionParams,
      constraints,
      effectiveLayoutItem,
      getConstraintContext,
      i
    ]
  );

  const emitResize = useCallback(
    (
      handlerName: "onResizeStart" | "onResize" | "onResizeStop",
      event: Event,
      data: ResizeCallbackData,
      origin: Position
    ) => {
      logDebug("[GridItem] emitResize", { i, handlerName, data, origin });
      const handler =
        handlerName === "onResizeStart"
          ? onResizeStartProp
          : handlerName === "onResize"
            ? onResizeProp
            : onResizeStopProp;

      resizePositionRef.current = data.size as Position;

      if (!handler) {
        logDebug("[GridItem] emitResize: no handler", handlerName);
        return;
      }

      const updatedSize = resizeItemInDirection(
        data.handle,
        origin,
        data.size as Position,
        containerWidth
      );

      resizePositionRef.current = updatedSize;

      const rawSize = calcWHRaw(
        positionParams,
        updatedSize.width,
        updatedSize.height
      );
      const { w: newW, h: newH } = applySizeConstraints(
        constraints,
        effectiveLayoutItem,
        rawSize.w,
        rawSize.h,
        data.handle,
        getConstraintContext()
      );

      logDebug("[GridItem] calling resize handler", { i, handlerName, newW, newH, updatedSize });
      handler(i, newW, newH, {
        e: event,
        node: data.node,
        size: updatedSize,
        handle: data.handle
      });
    },
    [
      onResizeStartProp,
      onResizeProp,
      onResizeStopProp,
      containerWidth,
      positionParams,
      constraints,
      effectiveLayoutItem,
      getConstraintContext,
      i
    ]
  );
  const clearDndResizeState = useCallback(() => {
    activeDndResizeRef.current = null;
    setResizing(false);
    resizePositionRef.current = { top: 0, left: 0, width: 0, height: 0 };
  }, []);

    useRuntimeDragDropMonitor({
    onDragStart: (event) => {
      logDebug("[GridItem] runtime onDragStart", { i, event });

      // Handle resize.
      const resizeData = getGridItemResizeData(event.operation.source?.data);
      if (supportsDndKitResize && resizeData?.itemId === i) {
        const node = elementRef.current;
        if (!node) {
          logDebug("[GridItem] runtime onDragStart: no node");
          return;
        }

        const origin = calcGridItemPosition(positionParams, x, y, w, h);
        activeDndResizeRef.current = {
          axis: resizeData.axis,
          node,
          origin,
          initialPointer: (() => {
            const ae = event.operation.activatorEvent as (MouseEvent | null);
            return ae ? { x: ae.clientX ?? 0, y: ae.clientY ?? 0 } : { x: 0, y: 0 };
          })()
        };
        setResizing(true);

        emitResize(
          "onResizeStart",
          getRuntimeInteractionEvent(event),
          { node, size: origin, handle: resizeData.axis },
          origin
        );
        return;
      }

      // Handle drag: lock drag mode when dnd-kit activates the drag.
      const dragData = getGridItemDragData(event.operation.source?.data);
      if (supportsDndKitDrag && dragData?.itemId === i) {
        lockedModeRef.current ??= dragModeRef.current;
        return;
      }

      logDebug("[GridItem] runtime onDragStart: ignored", { supportsDndKitResize, resizeData });
    },
    onDragMove: (event) => {
      logDebug("[GridItem] runtime onDragMove", { i, event });
      const session = activeDndResizeRef.current;
      const resizeData = getGridItemResizeData(event.operation.source?.data);
      if (
        !session ||
        !supportsDndKitResize ||
        !resizeData ||
        resizeData.itemId !== i ||
        resizeData.axis !== session.axis
      ) {
        logDebug("[GridItem] runtime onDragMove: ignored", { session, resizeData });
        return;
      }

      // Same stale-transform fix as for drag: use event.to (real-time pointer
      // absolute coords from sensor) minus initialPointer to get true delta.
      const moveTransform = (event as { to?: { x: number; y: number } }).to
        ? {
            x: (event as { to: { x: number; y: number } }).to.x - session.initialPointer.x,
            y: (event as { to: { x: number; y: number } }).to.y - session.initialPointer.y
          }
        : event.operation.transform;

      const nextCandidate = createResizeCandidate(
        session.origin,
        resizeData.axis,
        moveTransform.x / transformScale,
        moveTransform.y / transformScale
      );

      emitResize(
        "onResize",
        getRuntimeInteractionEvent(event),
        { node: session.node, size: nextCandidate, handle: resizeData.axis },
        session.origin
      );
    },
    onDragEnd: (event) => {
      logDebug("[GridItem] runtime onDragEnd", { i, event });

      // Handle resize end.
      const session = activeDndResizeRef.current;
      const resizeData = getGridItemResizeData(event.operation.source?.data);
      if (
        session &&
        supportsDndKitResize &&
        resizeData?.itemId === i &&
        resizeData?.axis === session.axis
      ) {
        // Same stale-transform fix for dragend: use nativeEvent (pointerup)
        // clientX/Y minus initialPointer for the final accurate delta.
        const nativeEnd =
          event.nativeEvent instanceof PointerEvent ? event.nativeEvent : null;
        const endTransform = nativeEnd
          ? {
              x: nativeEnd.clientX - session.initialPointer.x,
              y: nativeEnd.clientY - session.initialPointer.y
            }
          : event.operation.transform;

        const nextCandidate = event.canceled
          ? session.origin
          : createResizeCandidate(
              session.origin,
              resizeData.axis,
              endTransform.x / transformScale,
              endTransform.y / transformScale
            );

        if (event.canceled) {
          onResizeCancelProp?.(i);
          clearDndResizeState();
          return;
        }

        emitResize(
          "onResizeStop",
          getRuntimeInteractionEvent(event),
          { node: session.node, size: nextCandidate, handle: resizeData.axis },
          session.origin
        );
        clearDndResizeState();
        return;
      }

      // Handle drag end: reset drag-mode state.
      const dragData = getGridItemDragData(event.operation.source?.data);
      if (supportsDndKitDrag && dragData?.itemId === i) {
        lockedModeRef.current = null;
        dragModeRef.current = "INNER_GRID_MOVE";
        return;
      }

      logDebug("[GridItem] runtime onDragEnd: ignored", { session, resizeData });
    }
  });

  const startDragSession = useCallback(
    (event: DragInputEvent, kind: NativeInputKind) => {
      if (!isDraggable || isStatic || dragSessionRef.current) {
        return;
      }

      if (!isPrimaryInputStart(kind, event)) {
        return;
      }

      const node = elementRef.current;
      const target = getTargetElement(event.target);
      if (!node || !target) {
        return;
      }

      if (dragCancelSelector && target.closest(dragCancelSelector)) {
        return;
      }
      if (handle && !target.closest(handle)) {
        return;
      }

      const touchId = getTrackedInputId(kind, event);
      const startCoords = getInputCoordinates(event, touchId);
      if (!startCoords) {
        return;
      }

      const startPosition = getDragStartPosition(
        startCoords.clientX,
        startCoords.clientY,
        node
      );
      if (!startPosition) {
        return;
      }

      clearDragSession();
      event.preventDefault();

      let lastClientX = startCoords.clientX;
      let lastClientY = startCoords.clientY;

      const handleMove = (moveEvent: DragInputEvent) => {
        if (!isTrackedInputEvent(kind, event, moveEvent)) {
          return;
        }

        const coords = getInputCoordinates(moveEvent, touchId);
        if (!coords) {
          return;
        }

        preventTouchMoveDefault(kind, moveEvent);

        const deltaX = (coords.clientX - lastClientX) / transformScale;
        const deltaY = (coords.clientY - lastClientY) / transformScale;
        lastClientX = coords.clientX;
        lastClientY = coords.clientY;
        emitDragMove(
          moveEvent,
          node,
          deltaX,
          deltaY,
          coords.clientX,
          coords.clientY
        );
      };

      const handleEnd = (endEvent: DragInputEvent) => {
        if (!isTrackedInputEvent(kind, event, endEvent)) {
          return;
        }

        clearDragSession();
        emitDragStop(endEvent, node);
      };

      dragSessionRef.current = {
        cleanup: createNativeInteractionSession(
          kind,
          event,
          node,
          handleMove,
          handleEnd
        )
      };
      emitDragStart(
        event,
        node,
        startPosition,
        false,
        startCoords.clientX,
        startCoords.clientY
      );
    },
    [
      isDraggable,
      isStatic,
      dragCancelSelector,
      handle,
      getDragStartPosition,
      clearDragSession,
      transformScale,
      emitDragMove,
      emitDragStop,
      emitDragStart
    ]
  );

  const handleDragPointerDown = useCallback(
    (event: PointerEvent) => {
      startDragSession(event, "pointer");
    },
    [startDragSession]
  );

  const handleDragMouseDown = useCallback(
    (event: MouseEvent) => {
      startDragSession(event, "mouse");
    },
    [startDragSession]
  );

  const handleDragTouchStart = useCallback(
    (event: TouchEvent) => {
      startDragSession(event, "touch");
    },
    [startDragSession]
  );

  const startResizeSession = useCallback(
    (
      handleAxis: ResizeHandleAxis,
      nativeEvent: DragInputEvent,
      kind: NativeInputKind
    ) => {
      if (!isResizable || isStatic || resizeSessionRef.current) {
        return;
      }

      if (!isPrimaryInputStart(kind, nativeEvent)) {
        return;
      }

      const node = elementRef.current;
      if (!node) {
        return;
      }

      const touchId = getTrackedInputId(kind, nativeEvent);
      const startCoords = getInputCoordinates(nativeEvent, touchId);
      if (!startCoords) {
        return;
      }

      clearResizeSession();
      nativeEvent.preventDefault();
      setResizing(true);

      const origin = calcGridItemPosition(positionParams, x, y, w, h);
      emitResize(
        "onResizeStart",
        nativeEvent,
        { node, size: origin, handle: handleAxis },
        origin
      );

      const startClientX = startCoords.clientX;
      const startClientY = startCoords.clientY;

      const handleMove = (moveEvent: DragInputEvent) => {
        if (!isTrackedInputEvent(kind, nativeEvent, moveEvent)) {
          return;
        }

        const coords = getInputCoordinates(moveEvent, touchId);
        if (!coords) {
          return;
        }

        preventTouchMoveDefault(kind, moveEvent);

        const deltaX = (coords.clientX - startClientX) / transformScale;
        const deltaY = (coords.clientY - startClientY) / transformScale;
        const nextCandidate = createResizeCandidate(
          origin,
          handleAxis,
          deltaX,
          deltaY
        );
        emitResize(
          "onResize",
          moveEvent,
          { node, size: nextCandidate, handle: handleAxis },
          origin
        );
      };

      const handleEnd = (endEvent: DragInputEvent) => {
        if (!isTrackedInputEvent(kind, nativeEvent, endEvent)) {
          return;
        }

        const coords = getInputCoordinates(endEvent, touchId) ?? startCoords;
        const deltaX = (coords.clientX - startClientX) / transformScale;
        const deltaY = (coords.clientY - startClientY) / transformScale;
        const nextCandidate = createResizeCandidate(
          origin,
          handleAxis,
          deltaX,
          deltaY
        );
        clearResizeSession();
        emitResize(
          "onResizeStop",
          endEvent,
          { node, size: nextCandidate, handle: handleAxis },
          origin
        );
        setResizing(false);
        resizePositionRef.current = { top: 0, left: 0, width: 0, height: 0 };
      };

      resizeSessionRef.current = {
        cleanup: createNativeInteractionSession(
          kind,
          nativeEvent,
          node,
          handleMove,
          handleEnd
        )
      };
    },
    [
      isResizable,
      isStatic,
      clearResizeSession,
      positionParams,
      x,
      y,
      w,
      h,
      emitResize,
      transformScale
    ]
  );

  const handleResizePointerDown = useCallback(
    (handleAxis: ResizeHandleAxis, event: ResizeStartEvent) => {
      event.preventDefault();
      event.stopPropagation();
      startResizeSession(handleAxis, event.nativeEvent, "pointer");
    },
    [startResizeSession]
  );

  const handleResizeMouseDown = useCallback(
    (handleAxis: ResizeHandleAxis, event: ResizeStartEvent) => {
      event.preventDefault();
      event.stopPropagation();
      startResizeSession(handleAxis, event.nativeEvent, "mouse");
    },
    [startResizeSession]
  );

  const handleResizeTouchStart = useCallback(
    (handleAxis: ResizeHandleAxis, event: ResizeStartEvent) => {
      event.preventDefault();
      event.stopPropagation();
      startResizeSession(handleAxis, event.nativeEvent, "touch");
    },
    [startResizeSession]
  );

  useEffect(() => {
    if (!supportsDndKitDrag) {
      logDebug("[GridItem] sortable handle effect: disabled", { i });
      sortableHandleRef(null);
      return;
    }

    const node = elementRef.current;
    if (!node) {
      logDebug("[GridItem] sortable handle effect: no node", { i, handle });
      return;
    }

    const handleElement = handle ? node.querySelector(handle) : null;
    logDebug("[GridItem] sortable handle effect: applied", {
      i,
      handle,
      node: describeElementForDebug(node),
      handleElement: describeElementForDebug(handleElement)
    });
    sortableHandleRef(handleElement instanceof Element ? handleElement : null);

    return () => {
      logDebug("[GridItem] sortable handle effect: cleanup", { i });
      sortableHandleRef(null);
    };
  }, [supportsDndKitDrag, handle, i, sortableHandleRef]);

  useEffect(() => {
    if (!supportsDndKitDrag || isDndKitDragSource || resizing) {
      return;
    }

    const node = elementRef.current;
    if (!node) {
      logDebug("[GridItem] sortable rebind skipped: no node", {
        i,
        x,
        y,
        w,
        h,
        isDndKitDragSource,
        resizing
      });
      return;
    }

    const handleElement = handle ? node.querySelector(handle) : null;
    logDebug("[GridItem] sortable rebind after geometry/state change", {
      i,
      x,
      y,
      w,
      h,
      node: describeElementForDebug(node),
      handle,
      handleElement: describeElementForDebug(handleElement),
      isSortableDragSource,
      isDndKitDragSource,
      resizing
    });
    sortableHandleRef(null);
    sortableRef(null);
    sortableRef(node);
    sortableHandleRef(handleElement instanceof Element ? handleElement : null);
  }, [
    h,
    handle,
    i,
    isDndKitDragSource,
    isSortableDragSource,
    resizing,
    sortableHandleRef,
    sortableRef,
    supportsDndKitDrag,
    w,
    x,
    y
  ]);

  useEffect(() => {
    if (!useNativeDragFallback) {
      return;
    }

    const node = elementRef.current;
    if (!node) {
      return;
    }

    if (nativePointerEventsAvailable) {
      node.addEventListener("pointerdown", handleDragPointerDown);
    } else {
      node.addEventListener("mousedown", handleDragMouseDown);
      node.addEventListener("touchstart", handleDragTouchStart, {
        passive: false
      });
    }
    return () => {
      if (nativePointerEventsAvailable) {
        node.removeEventListener("pointerdown", handleDragPointerDown);
      } else {
        node.removeEventListener("mousedown", handleDragMouseDown);
        node.removeEventListener("touchstart", handleDragTouchStart);
      }
    };
  }, [
    handleDragPointerDown,
    handleDragMouseDown,
    handleDragTouchStart,
    nativePointerEventsAvailable,
    useNativeDragFallback
  ]);

  useEffect(() => {
    return () => {
      clearDragSession();
      clearResizeSession();
    };
  }, [clearDragSession, clearResizeSession]);

  /**
   * Handle-selection tracking: monitors CTRL/CMD key state while the drag
   * handle is pressed (pointerdown) but before dragging has started.
   * Works for both the dnd-kit and native-fallback drag paths.
   */
  useEffect(() => {
    if (!isDraggable || isStatic) {
      return;
    }

    const node = elementRef.current;
    if (!node) {
      return;
    }

    const onHandlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) {
        return;
      }

      const target = e.target instanceof HTMLElement ? e.target : null;
      if (!target) {
        return;
      }

      // Honor cancel/handle selectors — only activate when hitting the drag handle.
      if (dragCancelSelector && target.closest(dragCancelSelector)) {
        return;
      }
      if (handle && !target.closest(handle)) {
        return;
      }

      // Set initial mode from the CTRL/CMD state at pointerdown time.
      dragModeRef.current = e.ctrlKey || e.metaKey ? "CROSS_GRID_MOVE" : "INNER_GRID_MOVE";

      const ownerDocument = node.ownerDocument ?? document;

      // Clean up any leftover listeners from a previous incomplete interaction.
      if (keyListenerCleanupRef.current) {
        keyListenerCleanupRef.current();
        keyListenerCleanupRef.current = null;
      }

      const onKeyDown = (keyEvent: KeyboardEvent) => {
        // Ignore once the drag has started and mode is locked.
        if (lockedModeRef.current !== null) {
          return;
        }
        if (keyEvent.key !== "Control" && keyEvent.key !== "Meta") {
          return;
        }
        if (dragModeRef.current === "CROSS_GRID_MOVE") {
          return;
        }
        dragModeRef.current = "CROSS_GRID_MOVE";
        onDragModeChangePropRef.current?.(iRef.current, "CROSS_GRID_MOVE", keyEvent);
      };

      const onKeyUp = (keyEvent: KeyboardEvent) => {
        if (lockedModeRef.current !== null) {
          return;
        }
        if (keyEvent.key !== "Control" && keyEvent.key !== "Meta") {
          return;
        }
        if (dragModeRef.current === "INNER_GRID_MOVE") {
          return;
        }
        dragModeRef.current = "INNER_GRID_MOVE";
        onDragModeChangePropRef.current?.(iRef.current, "INNER_GRID_MOVE", keyEvent);
      };

      const onPointerRelease = (releaseEvent: PointerEvent) => {
        if (keyListenerCleanupRef.current) {
          keyListenerCleanupRef.current();
          keyListenerCleanupRef.current = null;
        }
        // Reset mode only if drag never started (no lock applied).
        if (lockedModeRef.current === null) {
          if (dragModeRef.current === "CROSS_GRID_MOVE") {
            // Handle released without dragging — notify consumer mode is reset.
            onDragModeChangePropRef.current?.(iRef.current, "INNER_GRID_MOVE", releaseEvent);
          }
          dragModeRef.current = "INNER_GRID_MOVE";
        }
      };

      ownerDocument.addEventListener("keydown", onKeyDown);
      ownerDocument.addEventListener("keyup", onKeyUp);
      ownerDocument.addEventListener("pointerup", onPointerRelease);
      ownerDocument.addEventListener("pointercancel", onPointerRelease);

      keyListenerCleanupRef.current = () => {
        ownerDocument.removeEventListener("keydown", onKeyDown);
        ownerDocument.removeEventListener("keyup", onKeyUp);
        ownerDocument.removeEventListener("pointerup", onPointerRelease);
        ownerDocument.removeEventListener("pointercancel", onPointerRelease);
      };
    };

    node.addEventListener("pointerdown", onHandlePointerDown);

    return () => {
      node.removeEventListener("pointerdown", onHandlePointerDown);
      if (keyListenerCleanupRef.current) {
        keyListenerCleanupRef.current();
        keyListenerCleanupRef.current = null;
      }
    };
  }, [isDraggable, isStatic, handle, dragCancelSelector]);

  useEffect(() => {
    if (!droppingPosition) {
      return;
    }

    const node = elementRef.current;
    if (!node) {
      return;
    }

    const prevDroppingPosition = prevDroppingPositionRef.current ?? {
      left: 0,
      top: 0,
      e: droppingPosition.e
    };

    const currentSnapshot = createGridItemDndSnapshot(
      positionParams,
      { x, y, w, h },
      droppingPosition,
      null
    );
    const previousSnapshot = createGridItemDndSnapshot(
      positionParams,
      { x, y, w, h },
      prevDroppingPosition,
      null
    );

    const nextPosition = {
      left: currentSnapshot.left,
      top: currentSnapshot.top
    };

    if (!dragging) {
      emitDragStart(droppingPosition.e, node, nextPosition, true);
    } else if (
      currentSnapshot.left !== previousSnapshot.left ||
      currentSnapshot.top !== previousSnapshot.top
    ) {
      const { deltaX, deltaY } = getGridItemPixelDelta(
        dragPositionRef.current,
        nextPosition
      );
      emitDragMove(droppingPosition.e, node, deltaX, deltaY);
    }

    prevDroppingPositionRef.current = droppingPosition;
  }, [droppingPosition, dragging, emitDragMove, emitDragStart, positionParams, x, y, w, h]);

  const dndSnapshot = createGridItemDndSnapshot(
    positionParams,
    { x, y, w, h },
    dragging ? dragPositionRef.current : null,
    resizing ? resizePositionRef.current : null
  );
  const pos: Position = {
    left: dndSnapshot.left,
    top: dndSnapshot.top,
    width: dndSnapshot.width,
    height: dndSnapshot.height
  };

  const child = React.Children.only(children) as ReactElement<
    Record<string, unknown>
  >;
  const childProps = child.props;
  const childClassName = childProps["className"] as string | undefined;
  const childStyle = childProps["style"] as CSSProperties | undefined;
  const childOnPointerDownCapture = childProps[
    "onPointerDownCapture"
  ] as React.PointerEventHandler<HTMLElement> | undefined;
  const childOnMouseDownCapture = childProps[
    "onMouseDownCapture"
  ] as React.MouseEventHandler<HTMLElement> | undefined;
  const childOnClickCapture = childProps[
    "onClickCapture"
  ] as React.MouseEventHandler<HTMLElement> | undefined;
  // Use our own React-state flag (cleared synchronously in handleDndKitDragEnd)
  // to show/hide the drag source. dnd-kit's isSortableDragSource lags behind
  // because dragOperation.reset() is async, which would leave the element
  // permanently invisible (visibility:hidden) after the first drag.
  const showSortableDragSource = supportsDndKitDrag && isSortableDragSource && isDndKitDragSource;

  const renderResizeHandle = useCallback(
    (axis: ResizeHandleAxis) => {
      return (
        <GridResizeHandle
          key={axis}
          axis={axis}
          itemId={i}
          resizeHandle={resizeHandle}
          supportsDndKitResize={supportsDndKitResize}
          onPointerDown={
            useNativeResizeFallback && nativePointerEventsAvailable
              ? (event) => handleResizePointerDown(axis, event)
              : undefined
          }
          onMouseDown={
            useNativeResizeFallback && !nativePointerEventsAvailable
              ? (event) => handleResizeMouseDown(axis, event)
              : undefined
          }
          onTouchStart={
            useNativeResizeFallback && !nativePointerEventsAvailable
              ? (event) => handleResizeTouchStart(axis, event)
              : undefined
          }
        />
      );
    },
    [
      handleResizePointerDown,
      handleResizeMouseDown,
      handleResizeTouchStart,
      i,
      nativePointerEventsAvailable,
      resizeHandle,
      supportsDndKitResize,
      useNativeResizeFallback
    ]
  );

  const nextChildren = React.Children.toArray(
    childProps["children"] as ReactNode
  );
  if (isResizable && !isStatic) {
    nextChildren.push(...resolvedResizeHandles.map(renderResizeHandle));
  }

  return React.cloneElement(
    child,
    {
      ref: setElementRef,
      className: clsx("react-grid-item", childClassName, className, {
        static: isStatic,
        resizing,
        "react-draggable": isDraggable,
        "react-draggable-dragging": dragging || showSortableDragSource,
        dropping: Boolean(droppingPosition),
        cssTransforms: useCSSTransforms,
        "react-resizable-hide": !isResizable
      }),
      onPointerDownCapture: (event: React.PointerEvent<HTMLElement>) => {
        const node = elementRef.current;
        logDebug("[GridItem] pointerdown capture", {
          i,
          target: describeElementForDebug(event.target),
          currentTarget: describeElementForDebug(event.currentTarget),
          node: describeElementForDebug(node),
          connected: node?.isConnected ?? false,
          supportsDndKitDrag,
          isSortableDragSource,
          isDndKitDragSource,
          dragging,
          resizing,
          handle,
          cancel,
          visibility:
            node && typeof window !== "undefined"
              ? window.getComputedStyle(node).visibility
              : undefined,
          pointerEvents:
            node && typeof window !== "undefined"
              ? window.getComputedStyle(node).pointerEvents
              : undefined
        });
        childOnPointerDownCapture?.(event);
      },
      onMouseDownCapture: (event: React.MouseEvent<HTMLElement>) => {
        logDebug("[GridItem] mousedown capture", {
          i,
          target: describeElementForDebug(event.target),
          currentTarget: describeElementForDebug(event.currentTarget),
          supportsDndKitDrag,
          isSortableDragSource,
          isDndKitDragSource,
          dragging,
          resizing
        });
        childOnMouseDownCapture?.(event);
      },
      onClickCapture: (event: React.MouseEvent<HTMLElement>) => {
        logDebug("[GridItem] click capture", {
          i,
          target: describeElementForDebug(event.target),
          currentTarget: describeElementForDebug(event.currentTarget),
          supportsDndKitDrag,
          isSortableDragSource,
          isDndKitDragSource,
          dragging,
          resizing
        });
        childOnClickCapture?.(event);
      },
      style: {
        ...style,
        ...childStyle,
        ...createStyle(pos),
        visibility: showSortableDragSource ? "hidden" : childStyle?.visibility,
        touchAction: isDraggable || isResizable ? "none" : childStyle?.touchAction
      }
    } as Record<string, unknown>,
    ...nextChildren
  );
}

export default GridItem;
