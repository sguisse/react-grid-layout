---
name: heartbeat
description: Système de monitoring en temps réel (Pulse) pour éviter les blocages d'agents.
---

# 💓 PROTOCOLE HEARTBEAT (BATTEMENT DE CŒUR)

Ce skill est le mécanisme de sécurité vitale de la plateforme. Il permet à l'utilisateur de savoir si un agent est actif, en pause ou planté lors de tâches de longue durée.

## 🛠️ USAGE
L'Orchestrateur doit invoquer ce script au début et entre chaque sous-étape d'une phase lourde (Analyse, Patching AST, Tests Playwright).

### Commande Standard :
`node .github/skills/heartbeat/pulse.js --agent=<nom_agent> --task=<action_courante> --file=<chemin_fichier>`

### Paramètres :
* [cite_start]**--agent** : L'ID de l'agent qui travaille (ex: `component-analyzer`)[cite: 92].
* [cite_start]**--task** : L'action atomique en cours (ex: `parsing_ast`, `generating_base64_patch`) [cite: 80-82].
* **--file** : Le fichier cible sur lequel l'agent opère actuellement.

## 📊 SORTIES (OUTPUTS)
1. **`.github/IR/live-status.json`** : Contient l'instantané de l'activité (écrase le précédent). C'est ta "photo" du moment.
2. **`.github/IR/heartbeat.log`** : Journal historique linéaire. Utile pour détecter si un agent boucle sur le même fichier depuis trop longtemps.

## 🚨 DIAGNOSTIC DE BLOCAGE
Si le `timestamp` dans `live-status.json` n'a pas été mis à jour depuis plus de **5 minutes** :
1. Le processus Node.js a probablement crashé ou l'API est en timeout.
2. [cite_start]**Action** : Tue le processus actuel et relance la tâche via le `state-transitioner` [cite: 107-108, 115-116].
