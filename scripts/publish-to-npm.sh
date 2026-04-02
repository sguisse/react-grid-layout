#!/usr/bin/env bash
set -euo pipefail

# Publish helper for this fork
# - sets package.json name to @sguisse/react-grid-layout (keeps original version)
# - runs `npm pack --dry-run` so you can inspect files to be published
# - supports CI-friendly auth via NPM_TOKEN
# - publishes with `npm publish --access public`

NEW_NAME="@sguisse/react-grid-layout"
BACKUP_FILE="package.json.bak"
COMMIT=false
DRY_RUN=false
FORCE=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [--commit] [--dry-run] [--force] [--name <package-name>]

Options:
  --commit        Commit the package.json change to git
  --dry-run       Show npm pack --dry-run and exit (no publish)
  --force         Continue without npm login (may fail)
  --name NAME     Override package name (default: ${NEW_NAME})
  -h, --help      Show this help
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --commit) COMMIT=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --force) FORCE=true; shift ;;
    --name) NEW_NAME="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown arg: $1"; usage ;;
  esac
done

echo "Publish helper — will set package.json name to ${NEW_NAME} and publish to npm."

command -v node >/dev/null 2>&1 || { echo "Error: node is required"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Error: npm is required"; exit 1; }

if [ -f "$BACKUP_FILE" ]; then
  echo "Backup $BACKUP_FILE already exists. Skipping backup."
else
  cp package.json "$BACKUP_FILE"
  echo "Backed up package.json -> $BACKUP_FILE"
fi

echo "Updating package.json..."
node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); const newName='${NEW_NAME}'; const oldName=p.name; p.name=newName; p.publishConfig=p.publishConfig||{}; p.publishConfig.registry=p.publishConfig.registry||'https://registry.npmjs.org'; fs.writeFileSync('package.json', JSON.stringify(p,null,2)+'\n'); console.log('Updated package.json: name', oldName, '=>', p.name);"

echo
echo "Files that would be included when publishing (npm pack --dry-run):"
npm pack --dry-run

if [ "$DRY_RUN" = true ]; then
  echo "Dry run requested; exiting before publish."
  exit 0
fi

if [ -n "${NPM_TOKEN:-}" ]; then
  echo "Using NPM_TOKEN from environment for auth (npm config set)."
  npm config set //registry.npmjs.org/:_authToken "${NPM_TOKEN}"
fi

if ! npm whoami >/dev/null 2>&1; then
  echo "npm not logged in."
  if [ "$FORCE" = true ]; then
    echo "--force set; continuing without login (publish may still fail)."
  else
    echo "Run 'npm login' or set NPM_TOKEN and re-run. Aborting."
    exit 1
  fi
fi

echo "Publishing ${NEW_NAME} (access public)..."
npm publish --access public

echo "Publish completed."

if [ "$COMMIT" = true ]; then
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git add package.json
    git commit -m "chore: set package name to ${NEW_NAME}"
    echo "Committed package.json change."
  else
    echo "Not a git repo; skipping commit."
  fi
fi

echo
echo "Done. package.json backup at $BACKUP_FILE (restore with: mv $BACKUP_FILE package.json)"
