---
name: ast-execution
description: Moteur déterministe Babel.
---
# USAGE

1. L'agent `ast-implementer` écrit son JSON de patch dans `temp-patch.json` (heredoc, JAMAIS `echo`).
2. Exécute : `node .github/skills/ast-execution/ast-engine.js --payload=temp-patch.json`

## Format du payload

```json
{
  "astPatches": [
    {
      "patchId": "patch-griditem-react19",
      "targetHashBefore": "<SHA256 depuis IR.registry.files[file].currentHash>",
      "file": "src/react/components/GridItem.tsx",
      "action": "replaceNode",
      "nodeType": "FunctionDeclaration",
      "identifier": "GridItem",
      "newCodeBase64": "<BASE64 du nouveau code>"
    }
  ]
}
```

## Actions supportées

| Action | `newCodeBase64` requis | Description |
|---|---|---|
| `replaceNode` | ✅ | Remplace FunctionDeclaration / VariableDeclaration / ClassDeclaration par ID |
| `addImport` | ✅ | Fusionne un import existant ou ajoute un `import` en tête du fichier |
| `removeNode` | ❌ | Supprime le nœud cible |

## Obtenir le `targetHashBefore`

```bash
node -e "var ir=require('./.github/IR/global.json'); console.log(ir.registry.files['src/react/components/GridItem.tsx'].currentHash);"
```

## Encoder en `newCodeBase64`

```bash
# Depuis un fichier source temporaire
node -e "console.log(Buffer.from(require('fs').readFileSync('temp-new-code.ts','utf8')).toString('base64'))"
```

## Comportement après patch

- `ast-engine.js` écrit le fichier patché sur disque.
- Met à jour `IR.registry.files[file].currentHash` avec le nouveau SHA256.
- ⚠️ **NE transite PAS l'état** — l'orchestrateur doit appeler manuellement :
  `node .github/skills/state-transitioner/transition.js --file=<path> --to=patched`

## Erreur de hash (conflit)

Si `currentHash !== targetHashBefore` → le moteur rejette le patch. Corriger en relisant le hash courant :
```bash
node -e "var ir=require('./.github/IR/global.json'); console.log(ir.registry.files['<file>'].currentHash);"
```
Fournir ce hash à `ast-implementer` pour régénérer le patch.

## Limitations connues

- Un seul type de nœud par action — si la fonction est dans `ExportNamedDeclaration`, le moteur la détecte via `getNodeName` automatiquement.
- Les objets littéraux (`const obj = { compact() {} }`) : utiliser `nodeType: "VariableDeclaration"` + `identifier` sur la variable.
- Plusieurs patches sur un même fichier sont supportés en un seul appel (tableaux `astPatches`) — le fichier est parsé une seule fois.
