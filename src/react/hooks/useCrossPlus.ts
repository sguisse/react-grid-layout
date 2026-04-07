import { useEffect, useState } from "react";
import { logDebug } from "../utils/log.js";
import type { DragMoveMode } from "../../core/types.js";

export function useCrossPlus(
  dragOverlayId: string | null,
  activeDndDragRef: React.RefObject<{ mode?: DragMoveMode } | null>,
  containerRef: React.RefObject<HTMLElement | null>
): { showCrossPlus: boolean; plusPortalCoords: { x: number; y: number } | null } {
  const [showCrossPlus, setShowCrossPlus] = useState<boolean>(false);
  const [plusPortalCoords, setPlusPortalCoords] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;

    if (!dragOverlayId) {
      setShowCrossPlus(false);
      setPlusPortalCoords(null);
      return;
    }

    const session = activeDndDragRef.current;
    if (!session || session.mode !== "CROSS_GRID_MOVE") {
      setShowCrossPlus(false);
      setPlusPortalCoords(null);
      return;
    }

    let raf = 0;
    const onPointerMove = (ev: PointerEvent) => {
      const x = ev.clientX;
      const y = ev.clientY;
      const el = document.elementFromPoint(x, y);
      const gridEl = el?.closest?.(".react-grid-layout") as HTMLElement | null;
      const isOverOtherGrid = Boolean(
        gridEl && containerRef.current && gridEl !== containerRef.current
      );
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setShowCrossPlus(isOverOtherGrid);
        setPlusPortalCoords(isOverOtherGrid ? { x, y } : null);
      });

      logDebug("[useCrossPlus] pointerMove", {
        x,
        y,
        element: el ? (el as Element).tagName : null,
        gridEl: gridEl ? gridEl.className : null,
        containerIsSame: gridEl === containerRef.current,
        isOverOtherGrid
      });
    };

    document.addEventListener("pointermove", onPointerMove);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("pointermove", onPointerMove);
      setShowCrossPlus(false);
      setPlusPortalCoords(null);
    };
  }, [dragOverlayId, activeDndDragRef, containerRef]);

  return { showCrossPlus, plusPortalCoords };
}
