# Customizing the remove (×) icon and cross-grid badge

This short guide shows common places the small "cross" / remove icon and the
cross-grid badge appear in this project, and how to safely customize them
(markup, SVG icon, CSS, and accessibility). It links to examples and explains
how to avoid interfering with dragging.

## Where these icons live

- Item remove examples: `test/examples/06-dynamic-add-remove.jsx` — a simple
  `span` containing `x` is used as the remove control.
- Cross-grid mode badge / visual hint: `doc/drag-mode_user-guide.md` and the
  `22-cross-grid-transfer` example.
- External-drop (passive preview) overlay: `doc/cross-dnd_user-guide.md`.

## 1) Replace the simple `x` remove marker with a custom icon

The dynamic-add/remove example shows the naive approach — a `span` with an
`onClick`. To improve accessibility, consistency, and visuals, replace it with
a semantic `button` and an inline SVG (or an icon component). Example:

```jsx
// Example: use a button with an inline SVG for the remove control
function RemoveButton({ onClick, label = 'Remove item' }) {
  return (
    <button
      type="button"
      className="rgl-remove"
      onClick={onClick}
      aria-label={label}
    >
      {/* simple 'x' svg — replace with your icon / sprite / component */}
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
        <path d="M6 6 L18 18 M6 18 L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

// Usage inside the same example that previously used a span 'x':
<div key={i} data-grid={el}>
  <span className="text">{i}</span>
  <RemoveButton onClick={() => this.onRemoveItem(i)} />
</div>
```

Important: prevent accidental drag activation when clicking the remove control.
There are two safe approaches:

- Give the button a selector/class and pass it to the grid's `dragConfig.cancel`
  (or `dragConfig: { cancel: '.rgl-remove' }` on the `GridLayout`), e.g.

```jsx
<GridLayout width={...} dragConfig={{ cancel: '.rgl-remove' }} ...>
  {children}
</GridLayout>
```

- Or restrict dragging to a handle by using `dragConfig.handle` so only clicks
  on the handle start drags.

Both protect the remove control from starting a drag and make the UI
predictable.

## 2) When your grid children are custom components (forwardRef)

Custom React components used as grid children must forward refs and pass
important props through so the grid can measure and attach event handlers.
Failure to forward these props may break dragging/handles and remove/cancel
selectors.

Minimal forwardRef contract (TypeScript/JSX):

```tsx
const Card = React.forwardRef<HTMLDivElement, { className?: string; style?: React.CSSProperties }>(
  ({ children, className, style, onMouseDown, onMouseUp, onTouchEnd }, ref) => (
    <div
      ref={ref}
      className={className}
      style={style}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onTouchEnd={onTouchEnd}
    >
      {children}
    </div>
  )
);
```

The remove button inside `Card` should still be a focusable element (a `button`)
and can be matched by the `dragConfig.cancel` selector.

## 3) Customize the cross-grid badge / icon

There are two common ways to show cross-grid visual feedback:

- Global cross icon: the `GridLayout` accepts a `crossGridIcon` prop. Pass any
  React node to render a custom icon for the small plus/cross indicator used in
  some visual flows.
- Per-item badge: use `onDragModeChange` to track mode and render a badge when
  the item is in `CROSS_GRID_MOVE`. Example snippet (inspired by
  `doc/drag-mode_user-guide.md`):

```jsx
// Track cross-grid mode in parent
const [crossGridMode, setCrossGridMode] = useState(null);

function handleDragModeChange(_layout, item, mode) {
  setCrossGridMode(mode === 'CROSS_GRID_MOVE' && item ? item.i : null);
}

// inside item renderer:
{crossGridMode === item.i && (
  <div className="rgl-cross-badge" aria-hidden>
    {/* render svg or emoji */}
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
      <path d="M6 6 L18 18 M6 18 L18 6" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  </div>
)}
```

You can also pass a global icon via:

```jsx
<GridLayout crossGridIcon={<MyCustomIcon />} ... />
```

## 4) External-drop preview overlay (passive preview)

If you use `externalDropMode="passive"` and `onExternalPreview`, you receive
a computed `placeholder` layout item and can render an overlay. Use
`calcGridItemPosition` to convert the placeholder to pixels and render any
icon/decoration you like (see `doc/cross-dnd_user-guide.md`). Keep the
overlay's `pointer-events: none` so it doesn't interfere with the drag.

## 5) CSS / styling suggestions

Example CSS to position a remove button and a cross badge:

```css
.rgl-remove {
  position: absolute;
  top: 6px;
  right: 6px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: #333;
}

.rgl-cross-badge {
  position: absolute;
  top: 6px;
  right: 48px;
  background: rgba(0,0,0,0.6);
  color: #fff;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 11px;
}

.external-drop-preview { pointer-events: none; }
```

## 6) Accessibility & keyboard

- Use `<button>` for controls and add `aria-label`.
- Ensure your cancel selector (`.rgl-remove`) matches the actual control so
  keyboard and pointer interactions behave as expected.

## Links

- Dynamic example: `test/examples/06-dynamic-add-remove.jsx`
- Drag-mode docs: `doc/drag-mode_user-guide.md`
- External-drop (passive preview): `doc/cross-dnd_user-guide.md`

---

If you want, I can also:

- create an updated example in `test/examples/` replacing the plain `x` with a
  polished button + SVG and wiring `dragConfig.cancel` (small patch), or
- add a short section to the main `README.md` linking to this guide.
