# 🔧 Cross-container Drag & Drop — User Guide

This short guide explains why we added a new external-drop API, where it lives in the codebase, how it interacts with the library's data flow (mermaid diagram), and how to use it with a small example.

## ✨ Why this attribute was added

Historically, when dragging items from outside into a grid we injected a temporary placeholder into the internal layout state (a __dropping-elem__). That approach caused two problems:

- The placeholder was visible to internal compaction algorithms and sometimes caused repeated compaction/oscillation during drag-over.
- The placeholder lived inside the layout state (even if not emitted to consumers), making it harder for callers to render a custom overlay preview outside the grid DOM.

To fix this we added a passive preview API that computes a preview placeholder without mutating the grid's published layout. This avoids compaction oscillation and allows consumers to decide how/where to render the preview (overlay, portal, etc.).

## ✨ Where the attribute was added

- Prop name: `externalDropMode` (options: `"passive" | "inject-placeholder"`).
- Callback: `onExternalPreview?: (placeholder: LayoutItem | null) => void`.
- Location: the props live on the new `GridLayout` component at `src/react/components/GridLayout.tsx` (and are surfaced through the legacy wrapper). In the v1 wrapper `ReactGridLayout` we preserve the legacy behavior by forcing `externalDropMode="inject-placeholder"` so existing users keep the old semantics.

Internally the passive mode uses the pure helper `computePlaceholder(...)` which was added to `src/core/computePlaceholder.ts` and exported from the core entry so it can be used in examples and by advanced consumers.

## ✨ How it works (mermaid)

``` mermaid
flowchart LR
  ExtDrag["External drag source"]
  Grid["GridLayout"]
  Compute["computePlaceholder"]
  Preview["onExternalPreview(placeholder)"]
  Inject["Inject placeholder into internal layout"]
  Commit["Commit / onDrop"]

  ExtDrag -->|"dragOver"| Grid
  Grid -->|"externalDropMode = passive"| Compute
  Compute --> Preview
  Grid -->|"externalDropMode = inject-placeholder"| Inject
  Inject --> Grid
  Grid -->|"drop"| Commit
```

Notes:
- Passive mode: `computePlaceholder` receives the current layout, the incoming item metadata and position info and returns a computed LayoutItem (the hypothetical placeholder) without mutating the published layout.
- Inject-placeholder mode: the grid inserts a transient dropping item into internal state (legacy behavior). The public `onLayoutChange` still filters out the dropping ID so consumers don't observe the transient item in emitted layouts.

## ✨ How to use the attribute

1. Passive preview (recommended when you want to render your own overlay)

```jsx
import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { GridLayout, calcGridItemPosition } from '@sguisse/react-grid-layout';

function CrossGridPreview() {
  const [preview, setPreview] = useState(null);

  return (
    <div style={{ position: 'relative' }}>
      <GridLayout
        width={1200}
        gridConfig={{ cols: 12, rowHeight: 30 }}
        dropConfig={{ enabled: true, defaultItem: { w: 2, h: 2 } }}
        externalDropMode="passive"
        onExternalPreview={(placeholder) => {
          // placeholder is a LayoutItem or null
          setPreview(placeholder);
        }}
      >
        {/* your grid children here */}
      </GridLayout>

      {/* Example overlay renderer: convert placeholder to pixels using calcGridItemPosition */}
      {preview && (
        <div
          className="external-drop-preview"
          style={{
            position: 'absolute',
            left: `${calcGridItemPosition({
              cols: 12, margin: [10, 10], rowHeight: 30, containerWidth: 1200, containerPadding: [10, 10]
            }, preview.x, preview.y, preview.w, preview.h).left}px`,
            top: `${calcGridItemPosition({
              cols: 12, margin: [10, 10], rowHeight: 30, containerWidth: 1200, containerPadding: [10, 10]
            }, preview.x, preview.y, preview.w, preview.h).top}px`,
            width: calcGridItemPosition({
              cols: 12, margin: [10, 10], rowHeight: 30, containerWidth: 1200, containerPadding: [10, 10]
            }, preview.x, preview.y, preview.w, preview.h).width,
            height: calcGridItemPosition({
              cols: 12, margin: [10, 10], rowHeight: 30, containerWidth: 1200, containerPadding: [10, 10]
            }, preview.x, preview.y, preview.w, preview.h).height,
            pointerEvents: 'none',
            background: 'rgba(0,0,255,0.08)',
            border: '1px dashed rgba(0,0,255,0.4)'
          }}
        />
      )}
    </div>
  );
}
```

2. Inject-placeholder mode (legacy behaviour)

If you need the old behaviour (the library mutates internal state and inserts the dropping placeholder), set:

```jsx
<GridLayout externalDropMode="inject-placeholder" ... />
```

This is the default for the legacy `ReactGridLayout` wrapper to preserve backward compatibility.

## ✨ Tips and gotchas

- Use `externalDropMode="passive"` when you want a pure, side-effect-free preview. It avoids layout compaction side-effects and gives you full control of the preview rendering.
- The `computePlaceholder` helper is pure and can be used off-thread or cached for performance-sensitive overlays.
- If you rely on the legacy injected placeholder (for example existing code that expects a DOM node to be present inside the grid), continue using `inject-placeholder` or the legacy `ReactGridLayout` wrapper.

---

If you want I can add a small example to `test/examples/` showing a polished overlay using portal + CSS, or add a short section to the README linking to this guide.
