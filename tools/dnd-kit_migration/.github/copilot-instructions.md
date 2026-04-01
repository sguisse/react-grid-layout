# Copilot Global Instructions

Ces instructions sont lues par tous les agents Copilot CLI du dépôt et définissent la politique par défaut d'approbation des actions.

## Auto-approbation des actions shell

Les agents peuvent exécuter automatiquement sans demander confirmation les commandes non-destructrices et en lecture seule. Exemples autorisés automatiquement :

- `cat`, `ls`, `find`, `grep`, `wc`, `node -e`, `python3`
- Commandes de génération qui créent des fichiers (via `heredoc` ou `file-writer`) mais **sans** suppression explicite

Les commandes suivantes **nécessitent toujours** une confirmation explicite avant exécution :

- Suppression : `rm`, `rmdir`, `unlink`, `git clean`, `git reset --hard`
- Arrêt de processus : `kill`, `pkill`, `killall`
- Modifications de permissions/propriétaire : `chmod`, `chown` (si changent la sécurité)
- Toute commande contenant `--force` ou `-rf`

## Prompt behavior

Avant d'exécuter une commande nécessitant confirmation, les agents doivent afficher :

1. La commande exacte qui sera exécutée
2. Le fichier(s) cible(s) impacté(s)
3. Le risque associé (suppression, perte d'historique, arrêt de service)

L'agent doit alors attendre l'approbation explicite (`yes`/`no`) de l'opérateur.

## Exception: Trusted automation users

Pour des environnements CI/CD contrôlés, l'équipe peut définir une liste d'actions pré-approuvées en éditant le frontmatter `confirmed-tools` dans les fichiers d'agent (`.github/agents/*.md`). Attention : cela supprime la granularité de sécurité.

## Sécurité

Ne stockez jamais de jetons secrets en clair dans les prompts. Préférez les variables d'environnement chiffrées et les credentials fournisseurs.

---
Politique maintenue par l'orchestrateur — modifiez avec prudence.
