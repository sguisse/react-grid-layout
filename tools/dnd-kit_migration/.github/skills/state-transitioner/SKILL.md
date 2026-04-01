---
name: state-transitioner
description: Modifie l'état d'un fichier dans la machine d'état IR en toute sécurité.
---
# USAGE
Ne modifie JAMAIS `global.json` à la main. Invoque toujours ce script :
`node .github/skills/state-transitioner/transition.js --file=src/monfichier.js --to=analyzed`
