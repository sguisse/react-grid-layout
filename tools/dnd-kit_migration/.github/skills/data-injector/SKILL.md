---
name: data-injector
description: Sauvegarde les analyses JSON des sous-agents dans le registre global.json.
---
# USAGE
Quand un agent (ex: `component-analyzer`) génère des données, l'Orchestrateur DOIT les sauvegarder dans l'IR.

## Phase 1 — component-analyzer
L'agent produit `{ "files": [...] }`. Injecter le tableau directement :
```bash
cat << 'EOF' > temp-component-analysis.json
{ "files": [ ...output de l'agent... ] }
EOF
node .github/skills/data-injector/injector.js --key=IR.component_analysis.files --payload=temp-component-analysis.json
```

## Clefs IR par phase
| Phase | Agent | Clef IR |
|---|---|---|
| 1 | component-analyzer | `IR.component_analysis.files` |
| 2 | test-analyzer | `IR.contracts.behavioral` |
| 2 | truth-oracle | `IR.contracts.truth_tables` |
| 4 | dnd-specialist | `IR.dnd_analysis` |
| 4 | react-19-architect | `IR.architecture_plan` |

## Règle
- Toujours écrire le payload dans un fichier temporaire via heredoc (pas `echo`).
- Le fichier temporaire est automatiquement supprimé par l'injector après injection.
- La clef `IR.` est stripée automatiquement : `IR.component_analysis.files` → `global.json` → `component_analysis.files`.
