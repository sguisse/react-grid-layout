import React, { type PropsWithChildren } from "react";
import { logDebug } from "../utils/log.js";
import * as DndKitReact from "@dnd-kit/react";
import * as DndKitSortable from "@dnd-kit/react/sortable";
import * as DndKitDom from "@dnd-kit/dom";

type DragEventHandler = (event: any, manager: any) => void;

export interface RuntimeDragDropProviderProps extends PropsWithChildren {
  sensors?: unknown;
  onDragStart?: DragEventHandler;
  onDragMove?: DragEventHandler;
  onDragEnd?: DragEventHandler;
}

export interface RuntimeDragOverlayProps {
  children?: React.ReactNode;
  disabled?: boolean;
  dropAnimation?: unknown;
}

export interface RuntimeUseSortableInput<T> {
  id: string;
  index: number;
  group?: string;
  data?: T;
  disabled?: boolean;
  feedback?: string;
  transition?: unknown;
}

export interface RuntimeUseSortableResult {
  isDragSource: boolean;
  ref: (element: Element | null) => void;
  handleRef: (element: Element | null) => void;
}

export interface RuntimeUseDraggableInput<T> {
  id: string;
  data?: T;
  disabled?: boolean;
  feedback?: string;
  sensors?: unknown;
}

export interface RuntimeUseDraggableResult {
  isDragSource: boolean;
  ref: (element: Element | null) => void;
  handleRef: (element: Element | null) => void;
}

export interface RuntimeDragDropMonitorHandlers {
  onDragStart?: DragEventHandler;
  onDragMove?: DragEventHandler;
  onDragEnd?: DragEventHandler;
}

const noopRef = () => {};

let nativeFallbackOverride: boolean | null = null;

function isTestRuntime(): boolean {
  if (nativeFallbackOverride !== null) {
    return nativeFallbackOverride;
  }

  return process.env["NODE_ENV"] === "test";
}

export function isRuntimeDndAvailable(): boolean {
  return !isTestRuntime();
}

export function setNativeFallbackOverride(value: boolean | null): void {
  nativeFallbackOverride = value;
}

function loadReactDndRuntime():
  | null
  | {
      DragDropProvider: React.ComponentType<RuntimeDragDropProviderProps>;
      DragOverlay: React.ComponentType<RuntimeDragOverlayProps>;
      useDraggable: <T>(
        input: RuntimeUseDraggableInput<T>
      ) => RuntimeUseDraggableResult;
      useDragDropMonitor: (handlers: RuntimeDragDropMonitorHandlers) => void;
    } {
  if (!isRuntimeDndAvailable()) {
    return null;
  }

  return DndKitReact as {
    DragDropProvider: React.ComponentType<RuntimeDragDropProviderProps>;
    DragOverlay: React.ComponentType<RuntimeDragOverlayProps>;
    useDraggable: <T>(
      input: RuntimeUseDraggableInput<T>
    ) => RuntimeUseDraggableResult;
    useDragDropMonitor: (handlers: RuntimeDragDropMonitorHandlers) => void;
  };
}

function loadSortableRuntime():
  | null
  | {
      useSortable: <T>(
        input: RuntimeUseSortableInput<T>
      ) => RuntimeUseSortableResult;
    } {
  if (!isRuntimeDndAvailable()) {
    return null;
  }

  return DndKitSortable as {
    useSortable: <T>(
      input: RuntimeUseSortableInput<T>
    ) => RuntimeUseSortableResult;
  };
}

function loadDomRuntime():
  | null
  | {
      PointerSensor: { configure(options: unknown): unknown };
      KeyboardSensor: { configure(options: unknown): unknown };
      PointerActivationConstraints: {
        Distance: new (options: unknown) => unknown;
      };
    } {
  if (!isRuntimeDndAvailable()) {
    return null;
  }

  return DndKitDom as {
    PointerSensor: { configure(options: unknown): unknown };
    KeyboardSensor: { configure(options: unknown): unknown };
    PointerActivationConstraints: {
      Distance: new (options: unknown) => unknown;
    };
  };
}

export function DragDropProvider({
  children,
  ...props
}: RuntimeDragDropProviderProps): React.JSX.Element {
  const runtime = loadReactDndRuntime();
  if (!runtime) {
    return <>{children}</>;
  }

  const Component = runtime.DragDropProvider;
  return <Component {...props}>{children}</Component>;
}

export function DragOverlay({
  children,
  disabled,
  dropAnimation
}: RuntimeDragOverlayProps): React.JSX.Element {
  const runtime = loadReactDndRuntime();
  if (!runtime || disabled) {
    return <></>;
  }

  const Component = runtime.DragOverlay;
  return <Component disabled={disabled} dropAnimation={dropAnimation}>{children}</Component>;
}

export function useRuntimeSortable<T>(
  input: RuntimeUseSortableInput<T>
): RuntimeUseSortableResult {
  const runtime = loadSortableRuntime();
  if (!runtime) {
    return {
      isDragSource: false,
      ref: noopRef,
      handleRef: noopRef
    };
  }

  return runtime.useSortable(input);
}

export function useRuntimeDraggable<T>(
  input: RuntimeUseDraggableInput<T>
): RuntimeUseDraggableResult {
  const runtime = loadReactDndRuntime();
  if (!runtime) {
    return {
      isDragSource: false,
      ref: noopRef,
      handleRef: noopRef
    };
  }

  return runtime.useDraggable(input);
}

export function useRuntimeDragDropMonitor(
  handlers: RuntimeDragDropMonitorHandlers
): void {
  const runtime = loadReactDndRuntime();
  if (!runtime) {
    // Log when runtime not available to help debugging in dev
    React.useEffect(() => {
      logDebug("[runtime] useDragDropMonitor: runtime unavailable, handlers not attached", handlers);
    }, [handlers]);
    return;
  }

  const wrappedHandlers = React.useMemo(() => {
    const wrap = (name: string, fn?: ((...args: any[]) => void) | undefined) => {
      if (!fn) return undefined;
      return (event: any, manager?: any) => {
        logDebug(`[runtime] dnd-monitor ${name}`, event, manager);
        fn(event, manager);
      };
    };

    return {
      onDragStart: wrap("onDragStart", handlers.onDragStart),
      onDragMove: wrap("onDragMove", handlers.onDragMove),
      onDragEnd: wrap("onDragEnd", handlers.onDragEnd)
    } as RuntimeDragDropMonitorHandlers;
  }, [handlers]);

  runtime.useDragDropMonitor(wrappedHandlers);
}

export const PointerSensor = {
  configure(options: unknown): unknown {
    const runtime = loadDomRuntime();
    return runtime ? runtime.PointerSensor.configure(options) : options;
  }
};

export const KeyboardSensor = {
  configure(options: unknown): unknown {
    const runtime = loadDomRuntime();
    return runtime ? runtime.KeyboardSensor.configure(options) : options;
  }
};

export const PointerActivationConstraints = {
  Distance: class Distance {
    public readonly options: unknown;
    constructor(options: unknown) {
      const runtime = loadDomRuntime();
      if (
        runtime &&
        (runtime as any).PointerActivationConstraints &&
        (runtime as any).PointerActivationConstraints.Distance
      ) {
        // Delegate to the runtime implementation; return that instance from the constructor
        return new (runtime as any).PointerActivationConstraints.Distance(options) as any;
      }
      this.options = options;
    }
  }
};
