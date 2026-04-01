# 🔬 Rapport d'Audit Critique — Plateforme `.github/` "Industrial Agentic Compiler"

**Auteur** : Architect Senior (React / DnD Migrations)
**Date** : 30 Mars 2026
**Scope** : Analyse récursive du dossier `.github/` uniquement
**Verdict Global** : ⚠️ **Concept prometteur, implémentation non-production-ready**

---

## 📋 Sommaire Exécutif

La plateforme vise à orchestrer la migration de `react-grid-layout` vers React 19 + dnd-kit v0.3.2 via un système multi-agents piloté par Copilot CLI. L'architecture conceptuelle (IR centralisé, machine d'état, AST patching, isolation workspace) est **bien pensée**. Cependant, l'implémentation présente **des bugs critiques, des failles de robustesse et des écarts significatifs avec la spec officielle Copilot CLI 2026** qui empêcheraient une exécution industrielle fiable.

---

## ✅ Points Positifs (Ce qui marche bien)

### 1. 🏗️ Architecture à état fini bien conçue
La machine d'état dans `global.json` est solide :
```
pending → discovered → analyzed → contracted → planned → patched → validated → done
                                                                                 ↘ blocked
```
Les transitions autorisées sont explicites et bidirectionnelles pour les états tardifs (`patched` peut revenir à `analyzed`), ce qui permet le retry. **C'est un bon pattern d'orchestration.**

### 2. 🔐 Intégrité par Hash SHA-256
Chaque fichier est taggé avec son hash cryptographique dès la Phase 0 (Scout). Le moteur AST (`ast-engine.js`) met à jour le hash après chaque patch. Cela permet de détecter toute modification non autorisée. **Approche industrielle correcte.**

### 3. 🔌 Circuit Breaker (3 retries max)
Le pattern coupe-circuit dans `state-transitioner/transition.js` empêche les boucles infinies d'hallucination de l'IA : 3 échecs → état `blocked`. **Essentiel pour une plateforme agentique.**

### 4. 💓 Heartbeat / Monitoring temps réel
Le skill `pulse.js` écrit dans `live-status.json` et `heartbeat.log` pour prouver l'activité de l'agent. **Mécanisme de surveillance pertinent** pour les tâches longues.

### 5. 🧬 Transformation AST Babel (Single-Pass)
Le `ast-engine.js` est le meilleur composant de la plateforme :
- Un seul `parse()` par fichier, tous les patches en une passe
- Fusion intelligente des imports (dédoublonnage par `source.value`)
- Gestion des `export` wrappers (named/default)
- Nettoyage automatique du payload temporaire (`finally { unlinkSync }`)

**C'est du code de qualité production.**

### 6. 📦 Isolation Workspace
Le principe de générer dans `dnd-react-layout/` et non dans `src/` est sound. Le `workspace-initializer` crée correctement `package.json` + `tsconfig.json`. **Bonne pratique de build.**

### 7. 🗂️ Séparation Agent / Skill cohérente
La distinction entre agents (stratégie haute) et skills (exécution basse) est conforme au pattern Copilot CLI 2026. Les skills dans `.github/skills/<name>/SKILL.md` sont au bon endroit selon la spec officielle.

### 8. 📊 Auto-update du Tracker
Le `state-transitioner` met à jour automatiquement `MIGRATION_TRACKER.md` à chaque transition d'état. **Bonne traçabilité.**

### 9. 🔒 Transport Base64 pour le code
L'encodage Base64 des patchs AST et des tests Playwright évite les bugs classiques d'échappement Bash/JSON. **Pattern défensif judicieux.**

### 10. 📐 Graphe de dépendances auto-généré
Le Scout analyse les `import ... from` et construit un `dependency_graph` dans l'IR, incluant aussi les `top_level_dependencies` externes. **Utile pour l'ordonnancement des patches.**

---

## 🔴 Points Critiques — Bugs & Corrections Proposées

### CRITIQUE 1 : 💀 Le Circuit Breaker ne fonctionne pas

**Fichier** : `.github/skills/state-transitioner/transition.js`
**Lignes 17-22**

```javascript
// BUG : L'état 'blocked' est écrasé immédiatement après
if (fileData.error_tracking[errorArg] >= 3) {
    fileData.state = 'blocked';  // ← ligne 20: set blocked
}
// ...
fileData.state = toArg;  // ← ligne 23: ÉCRASE blocked avec toArg !
```

L'état `blocked` est assigné, puis **immédiatement écrasé** par `fileData.state = toArg`. Le circuit breaker n'a aucun effet.

**🩹 Fix proposé** :
```javascript
if (errorArg) {
    fileData.error_tracking = fileData.error_tracking || {};
    fileData.error_tracking[errorArg] = (fileData.error_tracking[errorArg] || 0) + 1;
    if (fileData.error_tracking[errorArg] >= 3) {
        fileData.state = 'blocked';
        console.error(`🚫 CIRCUIT BREAKER: ${fileArg} bloqué après 3 échecs.`);
    } else {
        fileData.state = toArg;
    }
} else {
    fileData.state = toArg;
}
```

**Impact** : Sans ce fix, la plateforme **boucle indéfiniment** sur les fichiers en erreur — exactement ce que le circuit breaker devait empêcher.

---

### CRITIQUE 2 : 💀 Le `semantic-guardian` est quasi-inutile

**Fichier** : `.github/skills/semantic-guardian/guardian.js`

Le Guardian compare **uniquement les noms de paramètres** entre l'ancienne et la nouvelle version d'une fonction :

```javascript
traverse(ast, { FunctionDeclaration(p) {
    if (p.node.id.name === fnName) sig = p.node.params.map(pr => pr.name).join(',');
}});
return sig;  // ex: "layout,compactType,cols" — c'est TOUT
```

**Ce qui n'est PAS vérifié** :
- ❌ Le type de retour
- ❌ Le corps de la fonction (logique)
- ❌ Les effets de bord
- ❌ Les fonctions fléchées / méthodes de classe
- ❌ Les paramètres destructurés (`{ a, b }`) — `pr.name` sera `undefined`

**🩹 Fix proposé** : Remplacer par une vérification structurelle plus riche :
```javascript
function getSignature(code, fnName) {
    const ast = parser.parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    let sig = null;
    traverse(ast, {
        'FunctionDeclaration|VariableDeclarator'(p) {
            const name = p.node.id?.name;
            if (name !== fnName) return;
            const fn = p.node.init || p.node; // handle const fn = () => {}
            sig = {
                params: fn.params?.map(pr => generate(pr).code) || [],
                returnType: fn.returnType ? generate(fn.returnType).code : null,
                bodyHash: crypto.createHash('sha256')
                    .update(generate(fn.body).code).digest('hex'),
                async: !!fn.async,
                generator: !!fn.generator
            };
        }
    });
    return sig;
}
```

---

### CRITIQUE 3 : 💀 `truth-oracle` utilise `npm test` au lieu de `yarn test`

**Fichier** : `.github/skills/truth-oracle/oracle.js`

```javascript
raw = execSync('npm test -- --json', { encoding: 'utf8', stdio: 'pipe' });
```

Le projet utilise **exclusivement `yarn`** (cf. `CLAUDE.md` : "Always use yarn instead of npm"). L'Oracle peut :
- Échouer si `node_modules` est installé via yarn (lock file mismatch)
- Produire des résultats différents
- Crasher silencieusement

**🩹 Fix** : `execSync('yarn test --json', ...)`

---

### CRITIQUE 4 : ⚠️ `context-cleaner` détruit les fichiers source originaux

**Fichier** : `.github/skills/context-cleaner/cleaner.js`

```javascript
const cleanCode = strip(code).replace(/\n\s*\n/g, '\n');
fs.writeFileSync(absPath, cleanCode, 'utf8');  // ← ÉCRIT SUR L'ORIGINAL !
```

Le cleaner supprime les commentaires et réécrit **le même fichier**. Cela viole le principe d'isolation workspace et corrompt le hash d'intégrité de la source originale (le hash est mis à jour dans l'IR, masquant la corruption).

**🩹 Fix** : Écrire dans un fichier séparé (comme le `type-flattener` le fait déjà correctement) :
```javascript
const snapshotDir = path.resolve(process.cwd(), '.github/IR/cleaned');
const outFile = path.join(snapshotDir, normFile.replace(/\//g, '_'));
fs.writeFileSync(outFile, cleanCode, 'utf8');
// NE PAS toucher absPath
```

---

### CRITIQUE 5 : ⚠️ Agents non conformes à la spec Copilot CLI 2026

**Fichiers** : `.github/agents/*.md`

Selon la [documentation officielle](https://docs.github.com/en/copilot/reference/custom-agents-configuration), les agents supportent ces propriétés YAML frontmatter :

| Propriété | Statut dans la plateforme |
|---|---|
| `description` (required) | ✅ Présent |
| `name` | ✅ Présent |
| `tools` | ❌ **Absent partout** — tous les agents ont accès à TOUS les outils |
| `model` | ❌ Absent — pas de contrôle du modèle LLM par agent |
| `disable-model-invocation` | ❌ Absent — tous auto-invocables |
| `mcp-servers` | ❌ Non utilisé |

**Problème concret** : Le `component-analyzer` a accès au shell/write/edit alors qu'il ne devrait que lire. Le `validation-agent` peut modifier des fichiers source alors qu'il ne devrait que générer des tests.

**🩹 Fix** : Ajouter `tools` restrictifs à chaque agent :
```yaml
# component-analyzer.md
---
name: component-analyzer
description: Deep AST-level analysis of React components with Truth Binding.
tools: ["read", "search"]
---
```

```yaml
# ast-implementer.md
---
name: ast-implementer
description: Generates deterministic AST-compatible semantic patches.
tools: ["read", "search", "shell"]
---
```

---

### CRITIQUE 6 : ⚠️ Prompts d'agents trop courts/vagues

Le contenu markdown (le "prompt" de l'agent) est dramatiquement sous-utilisé. La spec autorise **30 000 caractères**. Comparaison :

| Agent | Taille prompt réelle | Problème |
|---|---|---|
| `orchestrator.md` | ~1500 chars | Pas de détail sur le séquençage des Phases |
| `component-analyzer.md` | ~300 chars | Dit juste "Read skill + output format" |
| `dnd-specialist.md` | ~250 chars | Idem — presque vide |
| `react-19-architect.md` | ~350 chars | Aucune instruction sur React 19 specifics |
| `test-analyzer.md` | ~400 chars | Aucune guidance sur les patterns de test |
| `validation-agent.md` | ~300 chars | Aucune spec Playwright |
| `ast-implementer.md` | ~600 chars | Le plus complet, mais toujours minimal |

**Impact** : L'IA doit **deviner** comment faire le travail car les instructions sont insuffisantes. Cela augmente drastiquement le taux d'hallucination et le nombre de retries.

**🩹 Fix** : Enrichir chaque agent avec :
- Des exemples concrets de code source → code migré
- Les patterns React 19 exacts (use, forwardRef removal, etc.)
- Les patterns dnd-kit v0.3.2 spécifiques
- Des garde-fous explicites ("NE FAIS JAMAIS...")

---

### CRITIQUE 7 : ⚠️ `scout.py` — Classification aveugle + extensions erronées

**Fichier** : `.github/skills/pre-processor-scout/scout.py`

**Problème A** : Tous les fichiers sont classifiés `core_candidate`, que ce soit un fichier core (`src/core/collision.ts`), un test (`test/spec/...`), un exemple (`test/examples/...`), ou un hook de dev (`test/dev-hook.jsx`). Cela empêche le système de prioriser intelligemment.

**Problème B** : Le graphe de dépendances contient des extensions `.js` pour des fichiers TypeScript :
```json
"src/core/compactors.ts": ["../core/types.js", "../core/layout.js"]
```
Ces chemins ne correspondent à aucun fichier réel.

**Problème C** : Le filtrage des commentaires est naïf — il filtre les lignes commençant par `*` ce qui élimine aussi les lignes de listes markdown ou les multiplications.

**🩹 Fix** :
```python
# Classification intelligente
file_type = 'test' if '/test/' in p else ('example' if '/examples/' in p else 'core')

# Extensions correctes : ne pas ajouter .js
dep_g[p] = [m[0] or m[1] for m in imports if (m[0] or m[1]).startswith('.')]

# Filtrage de commentaires plus robuste (regex)
import re
content = re.sub(r'//.*$', '', raw_content, flags=re.MULTILINE)
content = re.sub(r'/\*[\s\S]*?\*/', '', content)
```

---

### CRITIQUE 8 : ⚠️ `global.json` — Point unique de défaillance (SPOF)

L'IR pèse déjà **1491 lignes** avec seulement 75 fichiers scannés. Tous les agents lisent/écrivent ce fichier :
- `state-transitioner` : read + write
- `data-injector` : read + write
- `ast-engine` : read + write
- `truth-oracle` : read + write
- `type-flattener` : read + write
- `context-cleaner` : read + write

**Risques** :
1. **Corruption par accès concurrent** — Aucun mécanisme de lock
2. **Explosion de taille** — Les `truth_tables`, `type_snapshots` et `executionTrace` vont gonfler le fichier
3. **Contexte LLM saturé** — Si l'agent charge tout le fichier en contexte, il perd des tokens inutilement

**🩹 Fix** : Séparer l'IR en fichiers dédiés :
```
.github/IR/
├── state-machine.json      # États et transitions uniquement
├── registry.json            # Fichiers + hashes
├── dependency-graph.json    # Graphe de dépendances
├── contracts/               # Truth tables par fichier
├── execution-trace.jsonl    # Journal (append-only, format JSONL)
└── snapshots/               # Type snapshots (déjà séparé ✅)
```

---

### CRITIQUE 9 : ⚠️ `check-skills-script.sh` — Risque d'injection shell

**Fichier** : `.github/check-skills-script.sh`

```bash
TARGET_DIR="${1:-src}"
find "$TARGET_DIR" -type f -name "*.js" -exec node -e "require('fs').readFileSync('{}')" \;
npx tsc --noEmit ... "$TARGET_DIR"/**/*.t* "$TARGET_DIR"/**/*.j*
```

Le glob `"$TARGET_DIR"/**/*.t*` est expandé par le shell. Si `$TARGET_DIR` contient des caractères spéciaux ou si des noms de fichiers sont malicieux, c'est problématique. De plus, la "vérification syntaxique" via `readFileSync` ne vérifie absolument rien — elle lit le fichier sans le parser.

**🩹 Fix** :
```bash
TARGET_DIR="${1:-src}"
# Valider le chemin
[[ "$TARGET_DIR" =~ ^[a-zA-Z0-9_./-]+$ ]] || { echo "❌ Chemin invalide"; exit 1; }

# Vérification syntaxique réelle
find "$TARGET_DIR" -type f -name "*.js" -exec node --check {} \;

# tsc avec tsconfig dédié
npx tsc --project "$TARGET_DIR/../tsconfig.json" --noEmit
```

---

### CRITIQUE 10 : ⚠️ `forensic-scalpel` et `type-flattener` — Extraction partielle

**`scalpel.js`** ne supporte que `FunctionDeclaration` :
```javascript
traverse(ast, { FunctionDeclaration(p) { ... } });
```
Il manque : `ArrowFunctionExpression`, `ClassMethod`, `VariableDeclarator` (pour `const fn = () => {}`). Or, **la majorité du code React moderne** utilise des arrow functions.

**`flattener.js`** utilise un regex fragile pour extraire les types :
```javascript
content.match(/(export\s+)?(interface|type|enum)\s+\w+[\s\S]*?;/g)
```
Cela ne capture pas les interfaces multi-lignes avec `{}`, les types génériques complexes, ni les types conditionnels.

**🩹 Fix** : Utiliser le parser AST (déjà disponible dans le projet) au lieu de regex :
```javascript
traverse(ast, {
    TSInterfaceDeclaration(p) { /* ... */ },
    TSTypeAliasDeclaration(p) { /* ... */ },
    TSEnumDeclaration(p) { /* ... */ }
});
```

---

### CRITIQUE 11 : ⚠️ Phases manquantes dans le workflow

Le `user-guide.md` mentionne Phase 0, 3, 5, 6. Les phases 1, 2, 4 sont **absentes**. Cela crée un workflow discontinu :

| Phase | Décrite ? | Agent responsable |
|---|---|---|
| Phase 0 : Cartographie (Scout) | ✅ | `pre-processor-scout` |
| Phase 1 : ??? | ❌ | Indéfini |
| Phase 2 : ??? | ❌ | Indéfini |
| Phase 3 : Workspace Init | ✅ | `workspace-initializer` |
| Phase 4 : ??? | ❌ | Indéfini |
| Phase 5 : AST Patching | ✅ | `ast-implementer` |
| Phase 6 : Validation | ✅ | `validation-agent` + `ci-pipeline` |

D'après les états de la machine (`analyzed`, `contracted`, `planned`), on peut deviner :
- Phase 1 = Analyse des composants (`component-analyzer`)
- Phase 2 = Extraction des contrats (`test-analyzer` + `truth-oracle`)
- Phase 4 = Planification architecturale (`react-19-architect`)

**🩹 Fix** : Documenter explicitement TOUTES les phases dans `orchestrator.md` et `user-guide.md`.

---

### CRITIQUE 12 : ⚠️ `install-agents.js` — Duplication de code

Ce fichier contient une copie inline de `pulse.js` en template string et append du texte à `orchestrator.md`. Cela crée **deux copies** du même code qui peuvent diverger.

**🩹 Fix** : Supprimer `install-agents.js`. Les fichiers de la plateforme sont déjà en place dans `.github/`. Si un script d'installation est nécessaire, utiliser un simple `cp` ou valider l'existence des fichiers.

---

### CRITIQUE 13 : ⚠️ Pas de mécanisme de rollback

La machine d'état ne permet pas de revenir à l'état initial. Si l'IR est corrompu ou si une migration partielle échoue :
- Pas de backup automatique de `global.json`
- Pas de git commit intermédiaire
- Pas de snapshot avant chaque phase

**🩹 Fix** : Ajouter un skill `snapshot` qui git-commit l'IR avant chaque phase majeure :
```bash
git add .github/IR/ && git commit -m "snapshot: pre-phase-${PHASE}"
```

---

### CRITIQUE 14 : ⚠️ `MIGRATION_TRACKER.md` est écrasé à chaque transition

Le `state-transitioner` réécrit tout le fichier Tracker, perdant le template Mermaid d'origine, les sections de documentation et la progression visuelle.

**🩹 Fix** : Utiliser un marqueur pour n'écraser que la section tableau :
```javascript
const marker = '<!-- REGISTRY_TABLE_START -->';
const endMarker = '<!-- REGISTRY_TABLE_END -->';
// Remplacer uniquement entre les markers
```

---

### CRITIQUE 15 : ⚠️ Aucune validation de schéma JSON des outputs agents

Les agents sont instruits de produire du JSON strict, mais rien ne le vérifie. Si un LLM hallucine un JSON malformé ou avec des champs manquants, le `data-injector` l'injecte tel quel dans l'IR.

**🩹 Fix** : Ajouter une validation JSON Schema avant injection :
```javascript
const Ajv = require('ajv');
const schemas = {
    'component': require('./schemas/component.json'),
    'dnd': require('./schemas/dnd.json'),
    'astPatches': require('./schemas/patches.json')
};
```

---

## 📊 Matrice de Maturité

| Composant | Conception | Implémentation | Fiabilité | Score |
|---|:---:|:---:|:---:|:---:|
| Machine d'état (IR) | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | 9/12 |
| AST Engine (Babel) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | **11/12** |
| Circuit Breaker | ⭐⭐⭐⭐ | ⭐ | ⭐ | 6/12 |
| Semantic Guardian | ⭐⭐⭐ | ⭐ | ⭐ | 5/12 |
| Scout (Python) | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | 7/12 |
| Agents (prompts) | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | 7/12 |
| Skills (scripts) | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | 8/12 |
| Heartbeat | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | **10/12** |
| Documentation | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | 9/12 |
| CI / Sentinel | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | 7/12 |

**Score Global : 79/120 (66%) — Prototype avancé, non production-ready**

---

## 🎯 Plan de Remédiation Prioritaire

### 🔴 P0 — Bloquant (À fixer AVANT toute utilisation)
1. **Fix circuit breaker** dans `transition.js` (bug d'écrasement d'état)
2. **Fix `npm test` → `yarn test`** dans `oracle.js`
3. **Fix `context-cleaner`** pour ne pas écraser les fichiers source

### 🟠 P1 — Haute priorité (Fiabilité)
4. Ajouter `tools` restrictifs aux agents (principe du moindre privilège)
5. Enrichir les prompts agents (min 2000-5000 chars chacun)
6. Réécrire `semantic-guardian` avec une vraie comparaison structurelle
7. Séparer `global.json` en fichiers dédiés (anti-SPOF)

### 🟡 P2 — Moyenne priorité (Robustesse)
8. Fix extensions `.js` → `.ts/.tsx` dans le graphe de dépendances du Scout
9. Ajouter classification intelligente des fichiers dans le Scout
10. Documenter les Phases 1, 2, 4 manquantes
11. Ajouter validation JSON Schema pour les outputs agents
12. Fix `MIGRATION_TRACKER.md` écrasement (utiliser markers)

### 🟢 P3 — Amélioration (Maturité)
13. Ajouter mécanisme de rollback (git snapshots)
14. Supporter arrow functions dans `forensic-scalpel`
15. Remplacer regex par AST dans `type-flattener`
16. Supprimer `install-agents.js` (code dupliqué)
17. Ajouter file-locking pour `global.json` (ou son successeur éclaté)

---

## 🏁 Conclusion

La plateforme est un **prototype ambitieux et conceptuellement solide**. Le design de l'IR centralisé, la machine d'état, le patching AST Babel et l'isolation workspace sont de bonnes fondations. L'`ast-engine.js` est le composant le plus mature et peut servir en production.

Cependant, **le circuit breaker cassé**, **le guardian factice** et **les prompts d'agents quasi-vides** signifient que la plateforme ne peut pas actuellement garantir une migration déterministe. L'IA va halluciner, le système ne la bloquera pas, et le guardian dira "tout va bien" alors que la parité sémantique n'est pas vérifiée.

**Recommandation** : Appliquer les fixes P0 + P1 (7 items) avant de lancer la première migration réelle. Le passage de 66% à ~85% de maturité est réaliste avec 2-3 jours de travail ciblé.
