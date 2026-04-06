# 🎯 Drag-Mode API — CTRL/CMD Cross-Grid Transfer

> Hold **⌘ Cmd** or **Ctrl** while pressing a drag handle to toggle between
> standard (inner-grid) drag and cross-grid transfer mode.

---

## 📖 Overview

By default every drag moves an item within its own grid — `INNER_GRID_MOVE`.
Pressing **⌘ / Ctrl** _before_ the drag threshold is exceeded switches the
item into `CROSS_GRID_MOVE` mode. The mode is **locked the instant the drag
actually starts**, so you can release the key mid-drag and the transfer will
still happen on drop.

```text
      Handle pressed
           │
    CTRL/CMD held?
      │           │
     Yes          No
      │           │
 "CROSS_GRID"  "INNER_GRID"  ← onDragModeChange fires
      │
 Drag threshold exceeded
           │
    Mode locked ──────────── onDragStart fires (mode in event)
           │
    Item dragged
           │
    Dropped / released
           │
    onDragStop fires (same locked mode)
```

---

## ⚡ Key Behaviour Rules

| Situation | Mode |
| :--- | :--- |
| Handle pressed, no key held | `INNER_GRID_MOVE` |
| CTRL/CMD pressed while handle is held (before drag) | `CROSS_GRID_MOVE` |
| CTRL/CMD released while handle is held (before drag) | `INNER_GRID_MOVE` |
| Drag starts | **mode locked** — key changes ignored |
| Handle released without dragging | mode resets, `onDragModeChange` fires |

---

## 🔌 API Reference

### `DragMoveMode`

```ts
type DragMoveMode = "INNER_GRID_MOVE" | "CROSS_GRID_MOVE";
```

### `DragModeChangeCallback`

Fired **before** drag starts, each time the mode toggles.

```ts
type DragModeChangeCallback = (
  layout:  Layout,         // current layout at the time of the mode change
  item:    LayoutItem | null,  // the item whose handle is selected
  mode:    DragMoveMode,         // new mode
  event:   Event | null    // keyboard or pointer event that caused the toggle
) => void;
```

### `EventCallback` — 7th parameter `mode`

All three drag callbacks (`onDragStart`, `onDrag`, `onDragStop`) now receive
an optional 7th argument carrying the **locked** mode:

```ts
type EventCallback = (
  layout:      Layout,
  oldItem:     LayoutItem | null,
  newItem:     LayoutItem | null,
  placeholder: LayoutItem | null,
  event:       Event,
  element:     HTMLElement | null,
  mode?:       DragMoveMode          // ← NEW
) => void;
```

### `GridLayoutProps`

```ts
interface GridLayoutProps {
  // ...existing props...

  /**
   * Called when the drag move mode toggles via CTRL/CMD while the drag
   * handle is held down (before the drag threshold is exceeded).
   * Not fired after the drag starts — use onDragStart for the locked mode.
   */
  onDragModeChange?: DragModeChangeCallback;
}
```

### `GridDragEvent`

```ts
interface GridDragEvent {
  e:           Event;
  node:        HTMLElement;
  newPosition: { left: number; top: number };
  mode?:       DragMoveMode;  // ← NEW (locked mode at drag-start time)
}
```

---

## 🚀 Quick Start

```tsx
import ReactGridLayout, { type DragMoveMode } from "@sguisse/react-grid-layout";

function MyGrid() {
  const handleDragModeChange = (layout, item, mode) => {
    // Show a "cross-grid" badge on item?.i while mode === "CROSS_GRID_MOVE"
    console.log(`Item ${item?.i} mode → ${mode}`);
  };

  const handleDragStop = (layout, oldItem, item, placeholder, event, el, mode) => {
    if (mode === "CROSS_GRID_MOVE" && item) {
      // Transfer the item to the other grid at item.x / item.y
      moveItemToOtherGrid(item);
    }
  };

  return (
    <ReactGridLayout
      width={width}
      layout={layout}
      dragConfig={{ handle: ".card-header" }}
      onDragModeChange={handleDragModeChange}
      onDragStop={handleDragStop}
    >
      {children}
    </ReactGridLayout>
  );
}
```

---

## 🏗️ Cross-Grid Transfer Pattern

The example `22-cross-grid-transfer` demonstrates a two-grid layout where:

1. **"Move" chip button** — native HTML5 drag, always cross-grid (unchanged).
2. **Card header** — internal dnd drag. Hold ⌘/Ctrl to switch to
   `CROSS_GRID_MOVE`; release the handle to drop and the item teleports to the
   same grid coordinates in the other grid.

```jsx
// In each grid's onDragStop handler:
const handleDragStop = useCallback(
  (layout, _oldItem, item, _placeholder, _event, _el, mode) => {
    if (mode === "CROSS_GRID_MOVE" && item) {
      performCrossGridTransfer(sourceGridId, item, layout);
    }
  },
  [performCrossGridTransfer]
);

// Transfer helper — uses the finalLayout from onDragStop to avoid stale refs:
function performCrossGridTransfer(sourceGridId, item, sourceLayout) {
  const targetGridId = sourceGridId === "left" ? "right" : "left";

  const committedItem = { i: item.i, x: item.x, y: item.y, w: item.w, h: item.h };
  const newSourceLayout = sourceLayout.filter((l) => l.i !== item.i);
  const newTargetLayout = [
    ...targetGridRef.current.filter((l) => l.i !== item.i),
    committedItem
  ];

  setSourceLayout(newSourceLayout);
  setTargetLayout(newTargetLayout);
}
```

---

## 💡 Visual Feedback Recipe

Show a mode badge on the active item and a help hint in the grid header:

```jsx
// 1. Track which item is in cross-grid mode
const [crossGridMode, setCrossGridMode] = useState(null); // { gridId, itemId }

// 2. onDragModeChange sets / clears it
const handleDragModeChange = (_layout, item, mode) => {
  setCrossGridMode(
    mode === "CROSS_GRID_MOVE" && item ? { gridId, itemId: item.i } : null
  );
};

// 3. Badge on the card (needs position:relative on parent)
{crossGridMode?.itemId === item.i && (
  <div style={{ position: "absolute", top: 8, right: 40, ...badgeStyle }}>
    ↗ Cross-grid
  </div>
)}

// 4. Hint bar above the grid
<div style={hintBarStyle}>
  {crossGridMode
    ? "↗ Cross-grid mode — drag to new position and drop"
    : "🔑 Hold ⌘ / Ctrl on a card header to activate cross-grid transfer"
  }
</div>
```

---

## ⚠️ Important Notes

- **Touch / dnd-kit path**: the CTRL/CMD mode is detected at the OS keyboard
  level and works identically in both the native pointer fallback and the
  dnd-kit sensor path.
- **Mode is locked at threshold**: once the drag threshold is exceeded, no
  further CTRL/CMD press or release changes the mode. Check `mode` in
  `onDragStart` for the definitive value.
- **Handle released without dragging**: `onDragModeChange` fires with
  `"INNER_GRID_MOVE"` when the handle is released before a drag starts —
  use this to reset your visual state.
- **`onDrag` also carries mode**: every `onDrag` event includes the locked
  mode, so you can update overlay UI (e.g. highlight the target grid) during
  the drag.
- **Backwards compatible**: `mode` is optional on `EventCallback`. Existing
  callbacks that don't use the 7th parameter continue to work without changes.
