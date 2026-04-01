---
name: truth-oracle
description: Exécute les tests Jest originaux et extrait un tableau de vérité JSON.
---
# USAGE
1. L'agent invoque ce skill via `runCommand`.
2. Exécute `node .github/skills/truth-oracle/oracle.js`.
3. Le skill produit un snapshot JSON des entrées/sorties réelles dans `IR.contracts.truth_tables`.