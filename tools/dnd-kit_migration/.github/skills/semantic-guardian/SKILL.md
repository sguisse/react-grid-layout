---
name: semantic-guardian
description: Vérifie la parité sémantique entre l'original et le patch.
---
# USAGE

```bash
node .github/skills/semantic-guardian/guardian.js <oldFile> <newFile> <functionName>
```

## Exemple

```bash
node .github/skills/semantic-guardian/guardian.js \
  src/core/collision.ts \
  dnd-react-layout/src/core/collision.ts \
  collides
```

## Format de sortie JSON

```json
{
  "match": true,
  "paramsMatch": true,
  "returnTypeMatch": true,
  "bodyChanged": true,
  "oldSig": { "params": ["l1: LayoutItem", "l2: LayoutItem"], "returnType": ": boolean", "paramCount": 2 },
  "newSig": { ... }
}
```

| Champ | Signification |
|---|---|
| `match` | `true` si params ET returnType correspondent — signature compatible |
| `paramsMatch` | Nombre et types de paramètres identiques |
| `returnTypeMatch` | Type de retour identique |
| `bodyChanged` | `true` si le corps a changé (attendu pendant migration) |

## Boucle orchestrateur — fonctions critiques

Après migration de `src/core/*.ts` vers `dnd-react-layout/src/core/*.ts`, vérifier :

```bash
# collision.ts
for FN in collides getFirstCollision getAllCollisions; do
  node .github/skills/semantic-guardian/guardian.js \
    src/core/collision.ts dnd-react-layout/src/core/collision.ts $FN
done

# calculate.ts
for FN in calcGridItemPosition calcXY calcWH calcGridColWidth calcGridItemWHPx; do
  node .github/skills/semantic-guardian/guardian.js \
    src/core/calculate.ts dnd-react-layout/src/core/calculate.ts $FN
done

# compactors.ts
for FN in compactItemVertical compactItemHorizontal resolveCompactionCollision; do
  node .github/skills/semantic-guardian/guardian.js \
    src/core/compactors.ts dnd-react-layout/src/core/compactors.ts $FN
done
```

## Si `match: false`

→ Relancer `ast-implementer` en lui fournissant le JSON de `guardian.js` comme contexte d'erreur.
→ Le patch doit corriger params/returnType pour restaurer la parité.
→ Re-appliquer via `ast-engine.js`.
→ Si `match: false` après 3 tentatives → transitionner le fichier vers `blocked` avec `--error=guardian_mismatch`.

## Cas `Function not found`

Si `error: "Function 'X' not found"` → la fonction a été renommée ou n'a pas été migrée. Bloquer la transition vers `done` jusqu'à résolution.
