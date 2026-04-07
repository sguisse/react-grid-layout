import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import PropTypes from "prop-types";
import { GridLayout, useContainerWidth, calcGridItemPosition } from "@sguisse/react-grid-layout";

/**
 * Example 22: Cross-Grid Transfer (styled parity with Example 21)
 *
 * - Header is the in-grid drag handle (matches the eyebrow + title pattern).
 * - The dark "Move" chip remains the cross-grid transfer handle (draggable).
 * - Card body is scrollable for long content and is NOT the in-grid handle.
 * - A lightweight GridMatrix visual is shown above each grid (columns + 4 row markers).
 */

const GRID_CONFIG = {
  cols: 12,
  rowHeight: 34,
  margin: [12, 12],
  maxRows: 18,
  containerPadding: [0, 0]
};

const DRAG_CONFIG = {
  enabled: true,
  handle: ".cross-grid-card__header",
  cancel: ".cross-grid-transfer"
};

const RESIZE_CONFIG = {
  enabled: true
};

const ITEM_META = {
  "alpha-brief": {
    title: "Alpha Brief",
    eyebrow: "Research",
    body: "High-context note. Drag the body to reorder here, or drag the chip to send it across.",
    accent: "#0f766e"
  },
  "beta-kpi": {
    title: "Beta KPI",
    eyebrow: "Analytics",
    body: "Weekly trend card with room to resize and re-slot between teams.",
    accent: "#2563eb"
  },
  "gamma-launch": {
    title: "Gamma Launch",
    eyebrow: "Roadmap",
    body: "Cross-grid transfer keeps the same item identity while landing at the new coordinates.",
    accent: "#c2410c"
  },
  "delta-risk": {
    title: "Delta Risk",
    eyebrow: "Ops",
    body: "Useful for moving cards from a planning lane into an execution lane.",
    accent: "#b91c1c"
  },
  "echo-qa": {
    title: "Echo QA",
    eyebrow: "Validation",
    body: "This card starts on the right grid so you can move it back to the left.",
    accent: "#7c3aed"
  },
  "foxtrot-bug": {
    title: "Foxtrot Bug",
    eyebrow: "Triage",
    body: "The transfer handle uses the grid's native external-drop API rather than the in-grid drag sensor.",
    accent: "#be185d"
  },
  "hotel-ship": {
    title: "Hotel Ship",
    eyebrow: "Release",
    body: "Drop the chip into the other grid to commit the move and remove it from the source grid.",
    accent: "#1d4ed8"
  },
  "india-notes": {
    title: "India Notes",
    eyebrow: "Docs",
    body: "A practical pattern for cross-layout transfer without requiring a shared internal dnd manager.",
    accent: "#15803d"
  }
};

const INITIAL_LEFT_LAYOUT = [
  { i: "alpha-brief", x: 0, y: 0, w: 4, h: 3 },
  { i: "beta-kpi", x: 4, y: 0, w: 4, h: 4 },
  { i: "gamma-launch", x: 8, y: 0, w: 4, h: 3 },
  { i: "delta-risk", x: 0, y: 3, w: 6, h: 3 }
];

const INITIAL_RIGHT_LAYOUT = [
  { i: "echo-qa", x: 0, y: 0, w: 4, h: 3 },
  { i: "foxtrot-bug", x: 4, y: 0, w: 4, h: 4 },
  { i: "hotel-ship", x: 8, y: 0, w: 4, h: 3 },
  { i: "india-notes", x: 0, y: 3, w: 6, h: 3 }
];

const layoutItemShape = PropTypes.shape({
  i: PropTypes.string.isRequired,
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  w: PropTypes.number.isRequired,
  h: PropTypes.number.isRequired,
  minW: PropTypes.number,
  maxW: PropTypes.number,
  minH: PropTypes.number,
  maxH: PropTypes.number,
  static: PropTypes.bool
});

const transferShape = PropTypes.shape({
  sourceGridId: PropTypes.string.isRequired,
  placeholderId: PropTypes.string.isRequired,
  item: layoutItemShape.isRequired
});

function createTransferPlaceholderId(sourceGridId, itemId) {
  return `__cross-grid-transfer__${sourceGridId}__${itemId}`;
}

function cloneTransferItem(item) {
  return {
    i: item.i,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    minW: item.minW,
    maxW: item.maxW,
    minH: item.minH,
    maxH: item.maxH,
    static: false
  };
}

function sortLayout(layout) {
  return [...layout].sort((a, b) => (a.y - b.y) || (a.x - b.x));
}

function buildDebugLayout(gridId, layout) {
  return layout.map((item) => ({
    ...item,
    i: `${gridId}:${item.i}`
  }));
}

function TransferGridPanel({
  title,
  description,
  gridId,
  layout,
  onLayoutChange,
  activeTransfer,
  onTransferStart,
  onTransferEnd,
  onDropToGrid,
  crossGridModeItemId,
  onCrossDropRejected,
  onDragModeChange,
  onDragStop
}) {
  const { width, containerRef, mounted } = useContainerWidth();
  const [externalPreview, setExternalPreview] = useState(null);
  const transferDestination = gridId === "left" ? "right" : "left";
  const isDropTarget = Boolean(
    activeTransfer && activeTransfer.sourceGridId !== gridId
  );

  const droppingItem = isDropTarget && activeTransfer
    ? {
        i: activeTransfer.placeholderId,
        w: activeTransfer.item.w,
        h: activeTransfer.item.h
      }
    : undefined;

  const dropConfig = useMemo(() => {
    if (!isDropTarget || !activeTransfer) {
      return { enabled: false };
    }

    return {
      enabled: true,
      defaultItem: {
        w: activeTransfer.item.w,
        h: activeTransfer.item.h
      },
      onDragOver: () => ({
        w: activeTransfer.item.w,
        h: activeTransfer.item.h
      })
    };
  }, [activeTransfer, isDropTarget]);

  const handleExternalPreview = useCallback((placeholder) => {
    // placeholder is either a LayoutItem or null
    setExternalPreview(placeholder || null);
  }, []);

  const children = useMemo(
    () =>
      layout.map((item) => {
        const meta = ITEM_META[item.i];
        return (
          <div key={item.i}>
            <div
              style={{
                position: "relative",
                height: "100%",
                padding: 12,
                display: "flex",
                flexDirection: "column",
                borderRadius: 12,
                borderTop: `4px solid ${meta.accent}`,
                background: crossGridModeItemId === item.i
                  ? "linear-gradient(180deg, #fefce8 0%, #fef9c3 100%)"
                  : "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
                boxShadow: crossGridModeItemId === item.i
                  ? "inset 0 0 0 2px rgba(234, 179, 8, 0.5)"
                  : "inset 0 0 0 1px rgba(148, 163, 184, 0.18)",
                transition: "background 0.15s, box-shadow 0.15s"
              }}
            >
              {crossGridModeItemId === item.i && (
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 40,
                    background: "#78350f",
                    color: "#fef08a",
                    borderRadius: 999,
                    padding: "2px 10px",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    pointerEvents: "none",
                    display: "flex",
                    gap: 4,
                    alignItems: "center"
                  }}
                >
                  &#x2197; Cross-grid
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12
                }}
              >
                <div className="cross-grid-card__header" style={{ cursor: "grab", userSelect: "none" }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: meta.accent,
                      marginBottom: 6
                    }}
                  >
                    {meta.eyebrow}
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      lineHeight: 1.2,
                      color: "#0f172a"
                    }}
                  >
                    {meta.title}
                  </div>
                </div>
                <button
                  type="button"
                  className="cross-grid-transfer"
                  draggable={true}
                  onDragStart={(event) => onTransferStart(gridId, item, event)}
                  onDragEnd={onTransferEnd}
                  style={{
                    border: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 10px",
                    borderRadius: 999,
                    backgroundColor: "#0f172a",
                    color: "#f8fafc",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "grab",
                    userSelect: "none",
                    whiteSpace: "nowrap"
                  }}
                  title={`Drag to the ${transferDestination} grid`}
                >
                  Move
                </button>
              </div>

              <div
                className="cross-grid-card__body"
                style={{
                  flex: 1,
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: "rgba(255, 255, 255, 0.72)",
                  border: "1px dashed rgba(148, 163, 184, 0.5)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  overflow: "auto",
                  minHeight: 0
                }}
              >
                <span style={{ color: "#334155", lineHeight: 1.4 }}>
                  {meta.body}
                </span>

              </div>
            </div>
          </div>
        );
      }),
    [gridId, layout, onTransferEnd, onTransferStart, transferDestination]
  );

  return (
    <section
      ref={containerRef}
      style={{
        position: "relative",
        padding: 18,
        borderRadius: 18,
        background: isDropTarget
          ? "linear-gradient(180deg, #ecfeff 0%, #f8fafc 100%)"
          : "linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)",
        border: isDropTarget
          ? "1px solid rgba(14, 165, 233, 0.4)"
          : "1px solid rgba(148, 163, 184, 0.28)",
        boxShadow: "0 18px 50px rgba(15, 23, 42, 0.08)",
        overflow: "visible"
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 8
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 20, color: "#0f172a" }}>{title}</h3>
          <p style={{ margin: "6px 0 0 0", fontSize: 13, color: "#475569" }}>
            {description}
          </p>
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: isDropTarget ? "#0369a1" : "#64748b"
          }}
        >
          {isDropTarget ? "Drop here" : `${layout.length} items`}
        </div>
      </div>

      <div
        style={{
          marginBottom: 10,
          padding: "5px 10px",
          borderRadius: 8,
          background: crossGridModeItemId
            ? "rgba(234, 179, 8, 0.12)"
            : "rgba(148, 163, 184, 0.07)",
          border: crossGridModeItemId
            ? "1px solid rgba(234, 179, 8, 0.4)"
            : "1px dashed rgba(148, 163, 184, 0.3)",
          fontSize: 11,
          color: crossGridModeItemId ? "#78350f" : "#64748b",
          transition: "all 0.15s"
        }}
      >
        {crossGridModeItemId ? (
          <span>&#x2197; <strong>Cross-grid mode</strong> — now drag the card to the new position and drop it to transfer</span>
        ) : (
          <span>&#128273; Hold <strong>&#8984; / Ctrl</strong> while grabbing a card header to activate cross-grid transfer mode</span>
        )}
      </div>

      {mounted && (
        <GridLayout
          width={width}
          layout={layout}
          onLayoutChange={onLayoutChange}
          gridConfig={GRID_CONFIG}
          dragConfig={DRAG_CONFIG}
          resizeConfig={RESIZE_CONFIG}
          dropConfig={dropConfig}
          droppingItem={droppingItem}
          externalDropMode="passive"
          onExternalPreview={handleExternalPreview}
          onDragModeChange={onDragModeChange}
          onDragStop={onDragStop}
          onCrossDropRejected={onCrossDropRejected}
          onDrop={(nextLayout, droppedItem) =>
            onDropToGrid(gridId, nextLayout, droppedItem)
          }
        >
          {children}
        </GridLayout>
      )}

      {/* External-drop passive preview overlay (rendered above the grid) */}
      {externalPreview && (
        (() => {
          const positionParams = {
            margin: GRID_CONFIG.margin,
            containerPadding: GRID_CONFIG.containerPadding,
            containerWidth: width,
            cols: GRID_CONFIG.cols,
            rowHeight: GRID_CONFIG.rowHeight,
            maxRows: GRID_CONFIG.maxRows
          };

          const pos = calcGridItemPosition(
            positionParams,
            externalPreview.x,
            externalPreview.y,
            externalPreview.w,
            externalPreview.h
          );

          const style = {
            position: "absolute",
            top: pos.top,
            left: pos.left,
            width: pos.width,
            height: pos.height,
            borderRadius: 10,
            background: "rgba(14,165,233,0.08)",
            border: "2px dashed rgba(14,165,233,0.6)",
            boxSizing: "border-box",
            zIndex: 9999,
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#0369a1",
            fontWeight: 700
          };

          return <div style={style}>Preview</div>;
        })()
      )}
    </section>
  );
}

TransferGridPanel.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  gridId: PropTypes.string.isRequired,
  layout: PropTypes.arrayOf(layoutItemShape).isRequired,
  onLayoutChange: PropTypes.func.isRequired,
  activeTransfer: transferShape,
  onTransferStart: PropTypes.func.isRequired,
  onTransferEnd: PropTypes.func.isRequired,
  onDropToGrid: PropTypes.func.isRequired,
  crossGridModeItemId: PropTypes.string,
  onDragModeChange: PropTypes.func,
  onDragStop: PropTypes.func,
  onCrossDropRejected: PropTypes.func
};

/**
 * Example 22: Cross-Grid Transfer
 *
 * This demo shows two independent GridLayout instances on the same page.
 * Each card keeps the normal in-grid drag/resize behavior, and also exposes a
 * native transfer handle that uses the external drop API to move the item into
 * the other grid.
 */
export default function CrossGridTransferLayout({ onLayoutChange }) {
  const [leftLayout, setLeftLayout] = useState(INITIAL_LEFT_LAYOUT);
  const [rightLayout, setRightLayout] = useState(INITIAL_RIGHT_LAYOUT);
  // Display state: tracks the latest compacted layout for the debug panels.
  // Updated via onLayoutChange so it reflects drag/resize in real time.
  const [leftDisplayLayout, setLeftDisplayLayout] = useState(INITIAL_LEFT_LAYOUT);
  const [rightDisplayLayout, setRightDisplayLayout] = useState(INITIAL_RIGHT_LAYOUT);
  const transferRef = useRef(null);
  const [activeTransfer, setActiveTransfer] = useState(null);
  // Tracks which item is showing the cross-grid-mode indicator (set via
  // onDragModeChange before drag starts, cleared on drag end or key release).
  const [crossGridMode, setCrossGridMode] = useState(null);

  // Simple toast stack for user-facing notifications in the examples
  const [toasts, setToasts] = useState([]);
  const showToast = useCallback((message, duration = 3500) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), duration);
  }, []);

  // Refs track GridLayout's actual compacted positions, updated via
  // onLayoutChange callbacks. We store in refs (not state) so that the
  // compacted layout never feeds back into the layout prop and triggers
  // a re-compaction loop.
  const leftLayoutRef = useRef(INITIAL_LEFT_LAYOUT);
  const rightLayoutRef = useRef(INITIAL_RIGHT_LAYOUT);

  const handleLeftLayoutChange = useCallback((newLayout) => {
    leftLayoutRef.current = newLayout;
    setLeftDisplayLayout(newLayout);
  }, []);
  const handleRightLayoutChange = useCallback((newLayout) => {
    rightLayoutRef.current = newLayout;
    setRightDisplayLayout(newLayout);
  }, []);

  useEffect(() => {
    onLayoutChange?.([
      ...buildDebugLayout("left", leftLayout),
      ...buildDebugLayout("right", rightLayout)
    ]);
  }, [leftLayout, onLayoutChange, rightLayout]);

  const beginTransfer = useCallback((sourceGridId, item, event) => {
    const transfer = {
      sourceGridId,
      placeholderId: createTransferPlaceholderId(sourceGridId, item.i),
      item: cloneTransferItem(item)
    };

    transferRef.current = transfer;
    setActiveTransfer(transfer);

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.i);
    event.dataTransfer.setData(
      "application/react-grid-layout-transfer",
      JSON.stringify({ sourceGridId, itemId: item.i })
    );
  }, []);

  const endTransfer = useCallback(() => {
    transferRef.current = null;
    setActiveTransfer(null);
  }, []);

  const handleDropToGrid = useCallback(
    (targetGridId, nextLayout, droppedItem) => {
      const transfer = transferRef.current;
      if (!transfer || transfer.sourceGridId === targetGridId) {
        endTransfer();
        return;
      }

      const landingItem =
        droppedItem ??
        nextLayout.find((item) => item.i === transfer.placeholderId);
      if (!landingItem) {
        endTransfer();
        return;
      }

      const committedItem = {
        ...transfer.item,
        x: landingItem.x,
        y: landingItem.y,
        w: landingItem.w,
        h: landingItem.h,
        static: false
      };

      // Read current positions from GridLayout's refs (the latest compacted
      // state) so that in-grid drag/resize changes are preserved.
      const sourceRef =
        transfer.sourceGridId === "left" ? leftLayoutRef : rightLayoutRef;
      const targetRef =
        targetGridId === "left" ? leftLayoutRef : rightLayoutRef;

      const newTargetLayout = sortLayout([
        ...targetRef.current.filter(
          (item) =>
            item.i !== committedItem.i && item.i !== transfer.placeholderId
        ),
        committedItem
      ]);

      const newSourceLayout = sourceRef.current.filter(
        (item) =>
          item.i !== committedItem.i && item.i !== transfer.placeholderId
      );

      if (targetGridId === "left") {
        leftLayoutRef.current = newTargetLayout;
        rightLayoutRef.current = newSourceLayout;
        setLeftLayout(newTargetLayout);
        setRightLayout(newSourceLayout);
      } else {
        rightLayoutRef.current = newTargetLayout;
        leftLayoutRef.current = newSourceLayout;
        setRightLayout(newTargetLayout);
        setLeftLayout(newSourceLayout);
      }

      endTransfer();
    },
    [endTransfer]
  );

  const columnStyle = { display: "flex", flexDirection: "column", gap: 8 };

  // ── CTRL/CMD drag-mode transfer ────────────────────────────────────────────
  // Transfer item at its current grid coords into the other grid on dragStop
  // when the mode was locked to CROSS_GRID_MOVE.
  const performCrossGridTransfer = useCallback((sourceGridId, item, sourceLayout) => {
    const targetGridId = sourceGridId === "left" ? "right" : "left";
    const targetRef = targetGridId === "left" ? leftLayoutRef : rightLayoutRef;

    const committedItem = {
      i: item.i, x: item.x, y: item.y, w: item.w, h: item.h, static: false
    };
    // sourceLayout comes from onDragStop (final compacted state of source grid).
    const newSourceLayout = [...sourceLayout].filter((l) => l.i !== item.i);
    const newTargetLayout = sortLayout([
      ...targetRef.current.filter((l) => l.i !== item.i),
      committedItem
    ]);

    if (targetGridId === "left") {
      leftLayoutRef.current = newTargetLayout;
      rightLayoutRef.current = newSourceLayout;
      setLeftLayout(newTargetLayout);
      setRightLayout(newSourceLayout);
    } else {
      rightLayoutRef.current = newTargetLayout;
      leftLayoutRef.current = newSourceLayout;
      setRightLayout(newTargetLayout);
      setLeftLayout(newSourceLayout);
    }
    setCrossGridMode(null);
  }, []);

  const handleLeftDragModeChange = useCallback((_layout, item, mode) => {
    setCrossGridMode(
      mode === "CROSS_GRID_MOVE" && item
        ? { gridId: "left", itemId: item.i }
        : null
    );
  }, []);

  const handleRightDragModeChange = useCallback((_layout, item, mode) => {
    setCrossGridMode(
      mode === "CROSS_GRID_MOVE" && item
        ? { gridId: "right", itemId: item.i }
        : null
    );
  }, []);

  const handleLeftDragStop = useCallback(
    (layout, _oldItem, item, _placeholder, _event, _el, mode) => {
      if (mode === "CROSS_GRID_MOVE" && item) {
        performCrossGridTransfer("left", item, layout);
      } else {
        setCrossGridMode(null);
      }
    },
    [performCrossGridTransfer]
  );

  const handleRightDragStop = useCallback(
    (layout, _oldItem, item, _placeholder, _event, _el, mode) => {
      if (mode === "CROSS_GRID_MOVE" && item) {
        performCrossGridTransfer("right", item, layout);
      } else {
        setCrossGridMode(null);
      }
    },
    [performCrossGridTransfer]
  );
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "10px 0 24px 0" }}>
      {/* Toast container */}
      <div
        aria-live="polite"
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: 99999,
          display: "flex",
          flexDirection: "column",
          gap: 8
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: "rgba(15,23,42,0.95)",
              color: "#fff",
              padding: "10px 14px",
              borderRadius: 8,
              boxShadow: "0 6px 24px rgba(15,23,42,0.12)",
              fontSize: 13,
              minWidth: 160
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
      {/* Per-grid layout debug panels — test-hook.jsx panel is suppressed for dual-grid pages */}
      <div style={{ display: "flex", gap: 18, alignItems: "flex-start", marginBottom: 12 }}>
        <div className="layoutJSON" style={{ flex: "0 0 calc(50% - 9px)" }}>
          <div className="columns">
            {leftDisplayLayout.map((l) => (
              <div className="layoutItem" key={l.i}>
                <b>{l.i}</b>{`: [${l.x}, ${l.y}, ${l.w}, ${l.h}]`}
              </div>
            ))}
          </div>
          <div className="layoutJSON__footnote">
            Planning Grid &middot; format: <code>[x, y, w, h]</code>
          </div>
        </div>
        <div className="layoutJSON" style={{ flex: "0 0 calc(50% - 9px)" }}>
          <div className="columns">
            {rightDisplayLayout.map((l) => (
              <div className="layoutItem" key={l.i}>
                <b>{l.i}</b>{`: [${l.x}, ${l.y}, ${l.w}, ${l.h}]`}
              </div>
            ))}
          </div>
          <div className="layoutJSON__footnote">
            Execution Grid &middot; format: <code>[x, y, w, h]</code>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 18
        }}
      >
        <div style={columnStyle}>
          <TransferGridPanel
            title="Planning Grid"
            description="Research and discovery cards. Send mature items to execution."
            gridId="left"
            layout={leftLayout}
            onLayoutChange={handleLeftLayoutChange}
            activeTransfer={activeTransfer}
            onTransferStart={beginTransfer}
            onTransferEnd={endTransfer}
            onDropToGrid={handleDropToGrid}
            crossGridModeItemId={crossGridMode?.gridId === "left" ? crossGridMode.itemId : null}
            onCrossDropRejected={(fromLayout, item) => showToast(`Drop cancelled — ${item?.i ?? 'item'}`)}
            onDragModeChange={handleLeftDragModeChange}
            onDragStop={handleLeftDragStop}
          />
        </div>
        <div style={columnStyle}>
          <TransferGridPanel
            title="Execution Grid"
            description="Delivery lane. You can also move items back for another planning pass."
            gridId="right"
            layout={rightLayout}
            onLayoutChange={handleRightLayoutChange}
            activeTransfer={activeTransfer}
            onTransferStart={beginTransfer}
            onTransferEnd={endTransfer}
            onDropToGrid={handleDropToGrid}
            crossGridModeItemId={crossGridMode?.gridId === "right" ? crossGridMode.itemId : null}
            onCrossDropRejected={(fromLayout, item) => showToast(`Drop cancelled — ${item?.i ?? 'item'}`)}
            onDragModeChange={handleRightDragModeChange}
            onDragStop={handleRightDragStop}
          />
        </div>
      </div>
    </div>
  );
}

CrossGridTransferLayout.propTypes = {
  onLayoutChange: PropTypes.func
};

if (process.env.STATIC_EXAMPLES === true) {
  import("../test-hook.jsx").then((fn) => fn.default(CrossGridTransferLayout));
}
