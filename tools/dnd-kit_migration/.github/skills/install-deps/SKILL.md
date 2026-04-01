---
name: install-deps
description: Vérifie et installe automatiquement toutes les dépendances nécessaires (AST Babel, TypeScript, outils de test) avant le démarrage du pipeline. Doit être invoqué en premier dans la Phase 0.
allowed-tools: ["shell"]
---

# 📦 SKILL : install-deps

Ce skill est le **pré-requis obligatoire de la Phase 0**. Il garantit que l'environnement d'exécution contient tous les outils nécessaires avant de lancer le scout Python et les analyses AST.

---

## 🛠️ USAGE

### Commande standard (recommandée en Phase 0) :
```bash
node .github/skills/install-deps/install_deps.js
```

### Vérification seule (sans installation) :
```bash
node .github/skills/install-deps/install_deps.js --check
```

### Installation complète (+ jest, ts-jest, playwright pour les Phases 2 & 6) :
```bash
node .github/skills/install-deps/install_deps.js --all
```

---

## 📦 Catalogue des dépendances

| Groupe | Paquets | Phases concernées |
|---|---|---|
| **base** | `@babel/parser` `@babel/traverse` `@babel/generator` `@babel/types` `@babel/core` | 1, 4, 5, 6 |
| **extras** | `typescript` `ts-node` `@types/babel__traverse` | 1, 4, 5, 6 |
| **optional** (`--all`) | `jest` `@types/jest` `ts-jest` `@playwright/test` | 2, 6 |

---

## 📊 SORTIES (OUTPUTS)

1. **Paquets installés** via `yarn add --dev` (uniquement les manquants).
2. **Vérification AST** : parse réel de `src/react/components/GridLayout.tsx` pour confirmer que `@babel/parser` fonctionne avec TypeScript + JSX.
3. **`global.json` → `metadata.ast_parser_ready = true`** : flag lu par les agents pour savoir que l'environnement AST est opérationnel.

---

## 🔁 Codes de sortie

| Code | Signification | Action requise |
|:---:|---|---|
| `0` | Succès — tous les paquets présents et AST vérifié | Continuer le pipeline |
| `1` | Mode `--check` : des paquets manquent | Relancer sans `--check` |
| `2` | Échec de `yarn add` | Vérifier la connexion réseau ou les droits d'accès |
| `3` | Installation OK mais parse AST échoue | Vérifier la syntaxe TypeScript du fichier test |

---

## 🔗 Intégration dans l'Orchestrateur

L'orchestrateur doit appeler ce skill **avant tout autre skill de Phase 0** :

```
Phase 0 :
  1. node .github/skills/install-deps/install_deps.js     ← CE SKILL
  2. python3 .github/skills/pre-processor-scout/scout.py  ← Scout SHA-256
  3. node .github/skills/state-transitioner/transition.js --sync-only
```

Si le skill retourne un code d'erreur ≥ 2, **stopper la Phase 0** et signaler le problème à l'opérateur.
