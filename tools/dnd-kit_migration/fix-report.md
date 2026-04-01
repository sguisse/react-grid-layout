# 🔧 Fix Report — Plateforme `.github/` Industrial Agentic Compiler

**Date** : 30 Mars 2026
**Auteur** : Architect Senior
**Référence** : `opus-report.md`
**Résultat** : ✅ **13/13 correctifs appliqués avec succès**

---

## 📋 Liste des Correctifs

| # | Priorité | Fichier | Description | Status |
|---|:---:|---|---|:---:|
| 1 | 🔴 P0 | `skills/state-transitioner/transition.js` | Circuit Breaker écrasé — l'état `blocked` était overridé par `toArg` | ✅ Fixé |
| 2 | 🔴 P0 | `skills/truth-oracle/oracle.js` | `npm test` → `yarn test` (projet yarn-only) | ✅ Fixé |
| 3 | 🔴 P0 | `skills/context-cleaner/cleaner.js` | Écrivait sur le fichier source original → écrit maintenant dans `.github/IR/cleaned/` | ✅ Fixé |
| 4 | 🟠 P1 | `agents/*.md` (7 fichiers) | Ajout de `tools` restrictifs (principe moindre privilège) | ✅ Fixé |
| 5 | 🟠 P1 | `agents/*.md` (7 fichiers) | Enrichissement des prompts agents (rôle, instructions détaillées, garde-fous) | ✅ Fixé |
| 6 | 🟠 P1 | `skills/semantic-guardian/guardian.js` | Réécriture complète — supporte arrows, class methods, destructured params, body hash | ✅ Fixé |
| 7 | 🟡 P2 | `skills/pre-processor-scout/scout.py` | Classification intelligente (core/test/example/legacy/react_component) + filtrage regex des commentaires | ✅ Fixé |
| 8 | 🟡 P2 | `check-skills-script.sh` | Validation chemin + `node --check` réel + `find` sécurisé au lieu de globs | ✅ Fixé |
| 9 | 🟡 P2 | `skills/state-transitioner/transition.js` | MIGRATION_TRACKER.md utilise des markers `<!-- -->` — ne détruit plus le template | ✅ Fixé |
| 10 | 🟡 P2 | `skills/forensic-scalpel/scalpel.js` | Supporte `FunctionDeclaration` + `ArrowFunctionExpression` + `ClassMethod` | ✅ Fixé |
| 11 | 🟡 P2 | `skills/type-flattener/flattener.js` | Extraction par AST (TSInterface/TSTypeAlias/TSEnum) avec fallback regex | ✅ Fixé |
| 12 | 🟡 P2 | `agents/orchestrator.md` + `user-guide.md` | Phases 1, 2, 4 documentées dans le tableau complet du pipeline | ✅ Fixé |
| 13 | 🟢 P3 | `install-agents.js` (racine) | Remplacé par stub de dépréciation — plus de code dupliqué | ✅ Fixé |

---

## 📝 Détails des Changements

### 🔴 P0 — Correctifs Bloquants

#### Fix #1 : Circuit Breaker (`transition.js`)
**Avant** : L'état `blocked` était assigné puis immédiatement écrasé par `fileData.state = toArg` à la ligne suivante.
**Après** : Logique if/else — si le compteur ≥ 3, on force `blocked` et on ne touche plus à `toArg`. Message d'erreur explicite en console.

#### Fix #2 : `npm test` → `yarn test` (`oracle.js`)
**Avant** : `execSync('npm test -- --json')` — incompatible avec le lockfile yarn du projet.
**Après** : `execSync('yarn test --json')`.

#### Fix #3 : Context Cleaner non-destructif (`cleaner.js`)
**Avant** : `fs.writeFileSync(absPath, cleanCode)` — écrasait le fichier source original, corrompant le hash d'intégrité.
**Après** : Écrit dans `.github/IR/cleaned/<filename>`. L'IR stocke le chemin du snapshot dans `registry.cleaned_snapshots`. Le fichier source original n'est jamais touché.

### 🟠 P1 — Fiabilité

#### Fix #4 : Restriction des outils agents
Ajout de la propriété `tools` dans le YAML frontmatter de chaque agent :
- `component-analyzer` / `dnd-specialist` / `test-analyzer` : `["read", "search"]` (lecture seule)
- `validation-agent` : `["read", "search"]` (génère du JSON, n'écrit pas directement)
- `ast-implementer` : `["read", "search", "shell"]` (doit exécuter ast-engine)
- `react-19-architect` : `["read", "search", "edit", "shell"]`
- `orchestrator` : `["read", "search", "edit", "shell", "agent", "todo"]` (accès complet nécessaire)

#### Fix #5 : Enrichissement des prompts agents
Chaque agent passe de ~250 chars à ~2000-3000 chars avec :
- Rôle explicite
- Instructions numérotées détaillées
- Edge cases à traiter
- Section "CE QUE TU NE DOIS JAMAIS FAIRE"
- Format de sortie JSON enrichi avec exemples concrets
- Patterns React 19 / dnd-kit v0.3.2 spécifiques (pour architect et dnd-specialist)

#### Fix #6 : Réécriture complète `semantic-guardian`
**Avant** : Comparait uniquement `p.node.params.map(pr => pr.name).join(',')` — crash sur destructured params, ignore arrow functions.
**Après** : Utilise un visiteur multi-type (`FunctionDeclaration`, `VariableDeclarator`, `ClassMethod`), extrait params via `generate()`, compare return types, calcule un `bodyHash` SHA-256 pour détecter les changements de logique.

### 🟡 P2 — Robustesse

#### Fix #7 : Scout Python intelligent
- Classification par type : `core`, `react_component`, `test`, `example`, `extra`, `legacy`, `other`
- Filtrage des commentaires par regex (`//`, `/* */`) au lieu de filtre par préfixe de ligne

#### Fix #8 : Script Sentinel sécurisé
- Validation du chemin avec regex `^[a-zA-Z0-9_./-]+$`
- `node --check` au lieu de `require('fs').readFileSync` (vérification syntaxique réelle)
- `find` + `-exec` au lieu de globs shell dangereux
- Utilisation du `tsconfig.json` du workspace cible si disponible

#### Fix #9 : MIGRATION_TRACKER préservé
- Utilisation de markers HTML `<!-- REGISTRY_TABLE_START -->` / `<!-- REGISTRY_TABLE_END -->`
- Seule la section tableau est remplacée, le reste du fichier est préservé
- Ajout d'une barre de progression visuelle `[████░░░░] XX%`
- Mise à jour de `ir.progress.globalPercentage`

#### Fix #10 : Forensic Scalpel élargi
Ajout du support pour :
- `VariableDeclarator` (arrow functions : `const fn = () => {}`)
- `ClassMethod` (méthodes de classe)
- Message d'erreur explicite si aucune fonction trouvée

#### Fix #11 : Type Flattener via AST
- Utilisation de `@babel/parser` + `@babel/traverse` pour extraire `TSInterfaceDeclaration`, `TSTypeAliasDeclaration`, `TSEnumDeclaration`
- Fallback regex pour les fichiers non-parsables
- Résolution d'imports améliorée avec candidates `.ts` / `.tsx` / `/index.ts`

#### Fix #12 : Documentation des phases
- Tableau complet des 7 phases (0-6) dans `orchestrator.md`
- Le `user-guide.md` avait déjà été mis à jour avec toutes les phases

### 🟢 P3 — Maintenance

#### Fix #13 : `install-agents.js` déprécié
Contenu remplacé par un stub de 7 lignes qui affiche un message de dépréciation. Plus de code dupliqué de `pulse.js` ou d'append non contrôlé à `orchestrator.md`.

---

## 📊 Impact Estimé sur le Score de Maturité

| Composant | Avant | Après |
|---|:---:|:---:|
| Circuit Breaker | ⭐ (cassé) | ⭐⭐⭐⭐ |
| Semantic Guardian | ⭐ (factice) | ⭐⭐⭐ |
| Agents (prompts + tools) | ⭐⭐ | ⭐⭐⭐⭐ |
| Scout (Python) | ⭐⭐ | ⭐⭐⭐ |
| CI / Sentinel | ⭐⭐ | ⭐⭐⭐ |
| Skills (scripts) | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Forensic Scalpel | ⭐⭐ | ⭐⭐⭐ |
| Type Flattener | ⭐⭐ | ⭐⭐⭐ |

**Score Global Estimé : ~85-88% (vs 66% avant)** — Passage en statut "Production-ready pour pilote"
