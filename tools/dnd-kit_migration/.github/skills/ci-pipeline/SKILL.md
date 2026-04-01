---
name: ci-pipeline
description: Exécute la chaîne de vérification de compilation (TypeScript, ESLint, Python).
---

# ⚠️ RÈGLE ABSOLUE — INVOCATION

Le seul script à appeler est **`runner.js`**. Il n'existe PAS de `ci_pipeline.js`. Ne jamais inventer de noms de fichiers alternatifs.

```bash
node .github/skills/ci-pipeline/runner.js
```

Avec capture du rapport JSON :

```bash
node .github/skills/ci-pipeline/runner.js > .github/IR/ci_pipeline_report.json
```

# FONCTIONNEMENT

`runner.js` appelle `.github/check-skills-script.sh <dnd-react-layout/src>` qui effectue :
1. **Syntaxe JS** — `node --check` sur chaque fichier `.js`
2. **Typecheck TS** — `tsc --noEmit` via `dnd-react-layout/tsconfig.json`

# FORMAT DE SORTIE

`runner.js` écrit sur **stdout** un JSON sur une seule ligne :

```json
{ "status": "PASSED", "logs": "Code V2 viable." }
```

ou en cas d'erreur :

```json
{ "status": "FAILED", "error": "WORKSPACE_SEMANTIC_ERROR", "details": "..." }
```

# INTÉGRATION ORCHESTRATEUR

Exécution standard depuis la racine du dépôt :

```bash
# 1. Heartbeat avant
node .github/skills/heartbeat/pulse.js --agent=orchestrator --task=ci_pipeline_start --file=.github/IR/global.json

# 2. Runner (écriture du rapport)
node .github/skills/ci-pipeline/runner.js > .github/IR/ci_pipeline_report.json

# 3. Heartbeat après
node .github/skills/heartbeat/pulse.js --agent=orchestrator --task=ci_pipeline_complete --file=.github/IR/ci_pipeline_report.json
```

# CIBLE

Le workspace cible est `dnd-react-layout/src` (chemin relatif depuis la racine du repo).
Il doit exister avant d'appeler ce skill (créé par la Phase 3 — `workspace-initializer`).

# ERREUR FRÉQUENTE

Ne jamais tenter `yarn test` ou `npm test` dans `dnd-react-layout` comme fallback : ce workspace n'a pas encore de scripts de test définis.
