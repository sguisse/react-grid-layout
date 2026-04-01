import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import PropTypes from "prop-types";
import { GridLayout, useContainerWidth } from "react-grid-layout";

const GRID_CONFIG = {
  cols: 12,
  rowHeight: 34,
  margin: [12, 12],
  maxRows: 18,
  containerPadding: [0, 0]
};

const DRAG_CONFIG = {
  enabled: true,
  handle: ".cross-grid-card__body",
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

function buildCommittedLayout(nextLayout, committedItem) {
  return sortLayout([
    ...nextLayout.filter((item) => item.i !== committedItem.i),
    committedItem
  ]);
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
  onDropToGrid
}) {
  const { width, containerRef, mounted } = useContainerWidth();
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

  const children = useMemo(
    () =>
      layout.map((item) => {
        const meta = ITEM_META[item.i];
        return (
          <div key={item.i}>
            <div
              style={{
                height: "100%",
                padding: 12,
                display: "flex",
                flexDirection: "column",
                borderRadius: 12,
                borderTop: `4px solid ${meta.accent}`,
                background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
                boxShadow: "inset 0 0 0 1px rgba(148, 163, 184, 0.18)"
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12
                }}
              >
                <div>
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
                  cursor: "grab",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between"
                }}
              >
                <span className="text" style={{ color: "#334155", lineHeight: 1.4 }}>
                  {meta.body}
                </span>
                <span
                  style={{
                    marginTop: 10,
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#64748b"
                  }}
                >
                  Body drag = reorder in this grid
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
        padding: 18,
        borderRadius: 18,
        background: isDropTarget
          ? "linear-gradient(180deg, #ecfeff 0%, #f8fafc 100%)"
          : "linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)",
        border: isDropTarget
          ? "1px solid rgba(14, 165, 233, 0.4)"
          : "1px solid rgba(148, 163, 184, 0.28)",
        boxShadow: "0 18px 50px rgba(15, 23, 42, 0.08)"
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
          onDrop={(nextLayout, droppedItem) =>
            onDropToGrid(gridId, nextLayout, droppedItem)
          }
        >
          {children}
        </GridLayout>
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
  onDropToGrid: PropTypes.func.isRequired
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
  const transferRef = useRef(null);
  const [activeTransfer, setActiveTransfer] = useState(null);

  // Refs track GridLayout's actual compacted positions, updated via
  // onLayoutChange callbacks. We store in refs (not state) so that the
  // compacted layout never feeds back into the layout prop and triggers
  // a re-compaction loop.
  const leftLayoutRef = useRef(INITIAL_LEFT_LAYOUT);
  const rightLayoutRef = useRef(INITIAL_RIGHT_LAYOUT);

  const handleLeftLayoutChange = useCallback((newLayout) => {
    leftLayoutRef.current = newLayout;
  }, []);
  const handleRightLayoutChange = useCallback((newLayout) => {
    rightLayoutRef.current = newLayout;
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

  return (
    <div style={{ padding: "10px 0 24px 0" }}>
      <div
        style={{
          marginBottom: 18,
          padding: 18,
          borderRadius: 20,
          background:
            "radial-gradient(circle at top left, rgba(14, 165, 233, 0.14), transparent 42%), linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
          border: "1px solid rgba(148, 163, 184, 0.22)"
        }}
      >
        <h2 style={{ margin: 0, fontSize: 24, color: "#0f172a" }}>
          Cross-Grid DnD Sample
        </h2>
        <p style={{ margin: "8px 0 0 0", color: "#475569", lineHeight: 1.5 }}>
          Use the dark <strong>Move</strong> chip to transfer a card from one
          GridLayout instance to the other. Inside each grid, drag the card body
          to reorder and resize normally.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 18
        }}
      >
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
        />
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
        />
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
