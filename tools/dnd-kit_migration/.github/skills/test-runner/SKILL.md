---
name: test-runner
description: Exécute les tests Playwright de parité de manière autonome.
---
# USAGE

Une fois que `validation-agent` a généré le test et que `file-writer` l'a écrit, l'Orchestrateur DOIT l'exécuter :

```bash
node .github/skills/test-runner/runner.js --file=test/parity.spec.ts
```

## Format de sortie JSON

```json
{ "status": "PASSED", "log": "Parité confirmée." }
```
ou :
```json
{ "status": "FAILED", "error": "<message d'erreur Playwright>" }
```

⚠️ Le runner retourne toujours **exit code 0** — l'orchestrateur DOIT lire le JSON sur stdout pour détecter les échecs.

## Pré-requis

Playwright doit être installé dans le workspace racine :
```bash
npx playwright install --with-deps 2>/dev/null || true
```

## Boucle de retry (OBLIGATOIRE)

```bash
RESULT=$(node .github/skills/test-runner/runner.js --file=test/parity.spec.ts)
STATUS=$(node -e "console.log(JSON.parse(process.argv[1]).status)" "$RESULT")
if [ "$STATUS" = "FAILED" ]; then
  echo "Tests FAILED — relance Phase 5 (ast-implementer) sur les fichiers concernés"
  # Extraire les fichiers en erreur du message et relancer les patches
fi
```

## Si le statut est `FAILED`

1. Analyser `error` pour identifier quel composant/fichier a régressé.
2. Relancer `ast-implementer` sur ce fichier avec le contexte d'erreur.
3. Re-apply patch via `ast-engine.js`.
4. Re-run `semantic-guardian` pour vérifier la parité.
5. Re-run `test-runner`.
6. Maximum 3 cycles avant de transitionner le fichier vers `blocked`.
