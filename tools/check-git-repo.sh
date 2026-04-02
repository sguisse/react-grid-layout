#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status
set -e

cd ..
pwd

echo "--- 1. IDENTITÉ NPM (package.json) ---"
cat package.json | grep -E '"name"|"version"|"repository"|"scripts"' -A 2

echo -e "\n--- 2. CONFIGURATION DES REMOTES ---"
git remote -v

echo -e "\n--- 3. STRATÉGIE DE BRANCHES ---"
git branch -a

echo -e "\n--- 4. ÉTAT DE SYNCHRO AVEC L'ORIGINE ---"
git fetch upstream && git status

echo -e "\n--- 5. WORKFLOWS DÉTECTÉS ---"
ls .github/workflows
