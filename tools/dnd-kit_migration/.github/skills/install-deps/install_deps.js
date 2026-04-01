#!/usr/bin/env node
/**
 * .github/skills/install-deps/install_deps.js
 * Skill Phase 0 — Vérification et installation des dépendances AST/toolchain.
 *
 * Usage :
 *   node .github/skills/install-deps/install_deps.js          # base + extras (défaut)
 *   node .github/skills/install-deps/install_deps.js --all    # + jest + playwright
 *   node .github/skills/install-deps/install_deps.js --check  # vérifie seulement, n'installe pas
 */

const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const argv     = process.argv.slice(2);
const checkOnly = argv.includes('--check');
const installAll = argv.includes('--all');

// ── Catalogue des dépendances ──────────────────────────────────────────────

const DEPS = {
  // Requis : moteur AST (Phases 1, 5, 6)
  base: [
    '@babel/parser',
    '@babel/traverse',
    '@babel/generator',
    '@babel/types',
    '@babel/core',
  ],
  // Recommandé : TypeScript + types
  extras: [
    'typescript',
    'ts-node',
    '@types/babel__traverse',
  ],
  // Optionnel : tests & parité (Phases 2, 6)
  optional: [
    'jest',
    '@types/jest',
    'ts-jest',
    '@playwright/test',
  ],
};

const toCheck   = [...DEPS.base, ...DEPS.extras];
const toInstall = installAll ? [...toCheck, ...DEPS.optional] : toCheck;

// ── Vérification : quels paquets sont déjà présents ? ─────────────────────

function isInstalled(pkg) {
  try {
    require.resolve(pkg, { paths: [process.cwd()] });
    return true;
  } catch (_) {
    return false;
  }
}

const missing = toInstall.filter(p => !isInstalled(p));
const present = toInstall.filter(p =>  isInstalled(p));

console.log('\n📦 install-deps skill — Phase 0 environment check\n');
console.log(`  ✅ Already present (${present.length}) : ${present.join(', ') || 'none'}`);
console.log(`  ❌ Missing        (${missing.length}) : ${missing.join(', ') || 'none'}`);

if (checkOnly) {
  if (missing.length > 0) {
    console.log('\n⚠️  Run without --check to install missing packages.');
    process.exit(1);
  }
  console.log('\n✅ All required packages are installed.');
  process.exit(0);
}

// ── Installation des paquets manquants ────────────────────────────────────

if (missing.length === 0) {
  console.log('\n✅ Nothing to install — all packages present.\n');
} else {
  console.log(`\n🔧 Installing ${missing.length} missing package(s) via yarn...\n`);
  try {
    execSync(`yarn add --dev ${missing.join(' ')}`, { stdio: 'inherit' });
  } catch (err) {
    console.error('\n❌ yarn add failed:', err.message);
    process.exit(2);
  }
}

// ── Vérification fonctionnelle du parseur AST ─────────────────────────────

const sample = path.join(process.cwd(), 'src', 'react', 'components', 'GridLayout.tsx');
console.log('\n🔬 Verifying AST parser on src/react/components/GridLayout.tsx...');

if (!fs.existsSync(sample)) {
  console.warn('⚠️  Sample file not found — skipping AST parse verification.');
} else {
  try {
    // Re-resolve after potential install
    const parserPath = require.resolve('@babel/parser', { paths: [process.cwd()] });
    const parser = require(parserPath);
    const code = fs.readFileSync(sample, 'utf8');
    const ast  = parser.parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'classProperties', 'decorators-legacy'],
    });
    console.log(`  ✅ AST parsed — top-level nodes: ${ast.program.body.length}`);
  } catch (err) {
    console.error('  ❌ AST parse verification failed:', err.message);
    process.exit(3);
  }
}

// ── Résumé final ──────────────────────────────────────────────────────────

const irPath = path.join(process.cwd(), '.github', 'IR', 'global.json');
if (fs.existsSync(irPath)) {
  try {
    const ir = JSON.parse(fs.readFileSync(irPath, 'utf8'));
    ir.metadata = ir.metadata || {};
    ir.metadata.deps_verified_at = new Date().toISOString();
    ir.metadata.ast_parser_ready = true;
    fs.writeFileSync(irPath, JSON.stringify(ir, null, 2), 'utf8');
    console.log('\n  📋 Flagged IR metadata.ast_parser_ready = true');
  } catch (_) {
    console.warn('  ⚠️  Could not update global.json metadata.');
  }
}

console.log('\n✅ install-deps skill completed — environment ready for AST operations.\n');
