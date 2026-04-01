---
name: dnd-kit-v032
description: Advanced mapping of legacy DnD systems to dnd-kit v0.3.2 architecture with full math extraction.
---

# INSTRUCTIONS

Ce skill équipe le sous-agent `dnd-specialist` pour extraire le modèle mathématique DnD de react-grid-layout v2 (TypeScript) et le mapper vers dnd-kit v0.3.2.

## Fichiers sources à lire (DANS CET ORDRE)

1. `src/core/calculate.ts` — fonctions critiques :
   - `calcGridColWidth` : largeur colonne en px
   - `calcGridItemWHPx` : largeur/hauteur item en px
   - `calcGridItemPosition` : pixel pos complète (drag + resize override)
   - `calcXY` : pixel → grid units (clampé)
   - `calcXYRaw` : pixel → grid units (non-clampé, pour constraints)
   - `calcWH` : pixel size → grid units (clampé + handle-aware)
   - `calcWHRaw` : pixel size → grid units (non-clampé)

2. `src/core/collision.ts` — fonctions critiques :
   - `collides` : AABB test (retourne false si l1.i === l2.i)
   - `getFirstCollision` : premier collider dans layout
   - `getAllCollisions` : tous les colliders

3. `src/core/compactors.ts` — fonctions critiques :
   - `resolveCompactionCollision` : résolution récursive push
   - `compactItemVertical` : monte y-- jusqu'à collision
   - `compactItemHorizontal` : monte x-- jusqu'à collision, wrap si overflow
   - `verticalCompactor`, `horizontalCompactor`, `noCompactor` : objets compacteurs

4. `src/core/constraints.ts` — fonctions critiques :
   - `gridBounds` : constrainPosition + constrainSize avec handle-aware maxW/maxH
   - `minMaxSize` : clamp w/h selon item.minW/maxW/minH/maxH

5. `src/react/components/GridItem.tsx` — lignes 1–30 (imports DraggableCore + Resizable) et la section axis/bounds props

## Utilisation de forensic-scalpel (si disponible)

Si les fichiers `.github/IR/scalpel_calculate.txt`, `scalpel_collision.txt`, `scalpel_compactors.txt` existent, lis-les en priorité — ils contiennent les fonctions extraites via AST.

## Mapping dnd-kit v0.3.2 OBLIGATOIRE

| Concept legacy | Concept dnd-kit v0.3.2 | Notes |
|---|---|---|
| `DraggableCore` (react-draggable) | `Draggable` + `PointerSensor`/`KeyboardSensor` dans `DndContext` | Capturer `pointer.delta` puis appliquer `calcXY` |
| `Resizable` (react-resizable) | Hook custom ou modifier `@dnd-kit/dom` | Appliquer `calcWH` sur delta resize |
| `collides()` AABB | Custom collision strategy `@dnd-kit/collision` | Même formule AABB, adapter signature |
| `calcXY` snapping | Modifier `snapToGrid` avec step = `colWidth + margin[0]` | |
| `activeDrag` placeholder inline | `DragOverlay` de `@dnd-kit/react` | |
| `preventCollision` | Option dans collision strategy | |

## Edge Cases OBLIGATOIRES
- **Fast drag** : `PointerSensor` avec `activationConstraint: { distance: 3 }` (évite drags accidentels)
- **Scroll container** : `@dnd-kit` scroll detection automatique via sensors, mais vérifier `containerPadding` dans `calcXY`
- **Scale transform CSS** : le pointer delta doit être divisé par le facteur scale ; passer dans le `measuring` config de `DndContext`
- **Static items** : ne jamais les inclure dans les sortables

## TARGET PACKAGES
- `@dnd-kit/abstract` : modifiers, snapToGrid
- `@dnd-kit/dom` : Draggable, Droppable, sensors
- `@dnd-kit/react` : DndContext, useSortable, DragOverlay
- `@dnd-kit/collision` : custom collision strategies

## OUTPUT FORMAT (JSON STRICT)
```json
{
  "coordinateSystem": {
    "gridToPixel": { "astNodeRef": "FunctionDeclaration#calcGridItemPosition", "file": "src/core/calculate.ts", "formula": "left = round((colWidth + margin[0]) * x + containerPadding[0])" },
    "pixelToGrid": { "astNodeRef": "FunctionDeclaration#calcXY", "file": "src/core/calculate.ts", "formula": "x = round((left - containerPadding[0]) / (colWidth + margin[0]))" },
    "colWidth": { "astNodeRef": "FunctionDeclaration#calcGridColWidth", "formula": "(containerWidth - margin[0]*(cols-1) - containerPadding[0]*2) / cols" }
  },
  "collision": { "type": "AABB", "astNodeRef": "FunctionDeclaration#collides", "file": "src/core/collision.ts", "formula": "no-overlap if any gap exists on x or y axis" },
  "compaction": {
    "vertical": { "astNodeRef": "VariableDeclarator#verticalCompactor", "algorithm": "sort row-col; y-- until y==0 or collision" },
    "horizontal": { "astNodeRef": "VariableDeclarator#horizontalCompactor", "algorithm": "sort col-row; x-- until x==0 or collision; wrap row on overflow" }
  },
  "snapping": { "strategy": "Math.round in calcXY/calcWH", "gridUnit": "snap to nearest integer" },
  "constraints": {
    "axisLock": { "astNodeRef": "GridItem.tsx#DraggableCore[axis]", "note": "'both'|'x'|'y'" },
    "bounds": { "astNodeRef": "LayoutConstraint#gridBounds", "file": "src/core/constraints.ts" },
    "minMax": { "astNodeRef": "LayoutConstraint#minMaxSize", "file": "src/core/constraints.ts" }
  },
  "dndkitMapping": {
    "DraggableCore": "@dnd-kit/dom Draggable + PointerSensor",
    "Resizable": "custom resize hook with calcWH",
    "collisionStrategy": "@dnd-kit/collision adapter wrapping collides()",
    "gridSnapping": "@dnd-kit/abstract modifier snapToGrid",
    "dragOverlay": "@dnd-kit/react DragOverlay",
    "edgeCases": { "fastDrag": "activationConstraint.distance=3", "scrollContainer": "sensor scroll detection", "scaleTransform": "measuring.draggable with scale compensation" }
  }
}
```
