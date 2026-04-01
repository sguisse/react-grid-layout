---
name: file-writer
description: Écrit physiquement un fichier sur le disque (utile pour les nouveaux tests).
---
# USAGE
Quand un agent (comme `validation-agent`) génère un JSON contenant du code à écrire, l'Orchestrateur DOIT exécuter :
`node .github/skills/file-writer/writer.js --payload=temp-file-payload.json`
