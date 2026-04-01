#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:-src}"

# Validation du chemin pour éviter l'injection
if [[ ! "$TARGET_DIR" =~ ^[a-zA-Z0-9_./-]+$ ]]; then
  echo "❌ Chemin invalide : $TARGET_DIR" >&2
  exit 1
fi

if [[ ! -d "$TARGET_DIR" ]]; then
  echo "❌ Répertoire introuvable : $TARGET_DIR" >&2
  exit 1
fi

echo "[sentinel] Analyse sémantique profonde de : $TARGET_DIR"

# 1. Vérification Syntaxique Réelle (node --check)
echo "-> Vérification syntaxique JS..."
find "$TARGET_DIR" -type f -name "*.js" -exec node --check {} \;

# 2. LE JUGE DE PAIX : TypeScript Compiler (tsc)
if command -v npx >/dev/null 2>&1; then
  echo "-> Exécution de tsc --noEmit (Semantic Check)..."
  # Utiliser le tsconfig du workspace cible s'il existe
  TSCONFIG="${TARGET_DIR}/../tsconfig.json"
  if [[ -f "$TSCONFIG" ]]; then
    if ! npx tsc --project "$TSCONFIG" --noEmit; then
      echo "❌ ÉCHEC SÉMANTIQUE : Erreurs de Scope ou de Types détectées." >&2
      exit 1
    fi
  else
    # Fallback : fichiers individuels
    if ! npx tsc --noEmit --allowJs --checkJs --target esnext --moduleResolution node --jsx react-jsx --esModuleInterop --skipLibCheck $(find "$TARGET_DIR" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \)); then
      echo "❌ ÉCHEC SÉMANTIQUE : Erreurs de Scope ou de Types détectées." >&2
      exit 1
    fi
  fi
else
  echo "⚠️ npx non trouvé, saut du check sémantique." >&2
  exit 1
fi

echo "✅ SENTINEL OK : Code sémantiquement viable."
exit 0
