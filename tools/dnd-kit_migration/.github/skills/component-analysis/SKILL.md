---
name: component-analysis
description: Deep AST-level analysis of React components to extract logic, state and technical debt.
---

# INSTRUCTIONS

For each file (component OR hook), produce ONE entry matching the schema below.

## Props extraction
- Read the TypeScript interface (e.g. `GridItemProps`, `GridLayoutProps`) — NOT the destructured argument name.
- For each property: extract `name`, `type`, `required` (no `?`), and `default` if a default value is assigned.
- Separate **data props** from **callback props** (functions): callbacks go into `callbacks[]`, not `props[]`.

## State extraction
- `logicalState`: state whose change affects layout math (positions, dimensions, breakpoint, compactor).
- `visualState`: state whose change only affects rendering (drag placeholder, resize overlay).

## Hooks analysis (when file is a hook)
- `type` must be `"hook"` instead of `"component"`.
- Add `returnedApi[]`: list every value/function returned by the hook with its type.
- Add `options[]`: list every field of the options/config object the hook accepts.

## Pure functions
- Functions that take arguments and return a value with NO side effects — include internal helpers.

## Anti-patterns
- `findDOMNode`, `componentWillReceiveProps`, `componentWillMount`, direct DOM mutation.

## Output schema (STRICT — must match exactly for data-injector)

```json
{
  "files": [
    {
      "file": "src/react/components/GridItem.tsx",
      "componentName": "GridItem",
      "type": "component",
      "props": [
        { "name": "cols", "type": "number", "required": true },
        { "name": "isDraggable", "type": "boolean", "required": true },
        { "name": "useCSSTransforms", "type": "boolean", "required": false, "default": true }
      ],
      "callbacks": [
        { "name": "onDragStart", "signature": "(i: string, x: number, y: number, h: number, e: MouseEvent, node: HTMLElement) => void", "required": false }
      ],
      "logicalState": [
        { "name": "dragging", "type": "{ top: number; left: number } | null", "astNodeRef": "useState#dragging" }
      ],
      "visualState": [
        { "name": "resizing", "type": "{ width: number; height: number } | null", "astNodeRef": "useState#resizing" }
      ],
      "returnedApi": [],
      "pureFunctions": [
        { "name": "calcPosition", "astNodeRef": "calcGridItemPosition", "pure": true }
      ],
      "antiPatterns": [],
      "externalDeps": ["react-draggable", "react-resizable"]
    },
    {
      "file": "src/react/hooks/useResponsiveLayout.ts",
      "componentName": "useResponsiveLayout",
      "type": "hook",
      "props": [],
      "callbacks": [],
      "options": [
        { "name": "width", "type": "number", "required": true },
        { "name": "breakpoints", "type": "Breakpoints<B>", "required": false },
        { "name": "cols", "type": "Breakpoints<B>", "required": false },
        { "name": "layouts", "type": "ResponsiveLayouts<B>", "required": false },
        { "name": "onBreakpointChange", "type": "(bp: B, cols: number) => void", "required": false },
        { "name": "onLayoutChange", "type": "(layout: Layout, layouts: ResponsiveLayouts<B>) => void", "required": false }
      ],
      "returnedApi": [
        { "name": "layout", "type": "Layout" },
        { "name": "layouts", "type": "ResponsiveLayouts<B>" },
        { "name": "breakpoint", "type": "B" },
        { "name": "cols", "type": "number" },
        { "name": "setLayoutForBreakpoint", "type": "(breakpoint: B, layout: Layout) => void" },
        { "name": "setLayouts", "type": "(layouts: ResponsiveLayouts<B>) => void" }
      ],
      "logicalState": [],
      "visualState": [],
      "pureFunctions": [],
      "antiPatterns": [],
      "externalDeps": ["../../core/responsive.js", "../../core/compactors.js"]
    }
  ]
}
```

The agent MUST produce a `files` array — one entry per analyzed file. The orchestrator injects it via:
```bash
node data-injector.js --key=IR.component_analysis.files --payload=payload.json
```
