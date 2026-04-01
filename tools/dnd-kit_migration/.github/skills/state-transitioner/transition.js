const fs = require('fs');
const path = require('path');

const fileArg = process.argv.find(a => a.startsWith('--file='))?.split('=')[1];
const toArg = process.argv.find(a => a.startsWith('--to='))?.split('=')[1];
const errorArg = process.argv.find(a => a.startsWith('--error='))?.split('=')[1];
const syncOnly = process.argv.includes('--sync-only');

if (!syncOnly && (!fileArg || !toArg)) process.exit(1);

// ─── MODE SYNC-ONLY ────────────────────────────────────────────────────────────
// Reconstruit le MIGRATION_TRACKER depuis l'état actuel de global.json,
// sans modifier aucun état. Utile après scout.py ou toute injection batch.
// Usage : node transition.js --sync-only
if (syncOnly) {
    const irPath = path.resolve(process.cwd(), '.github/IR/global.json');
    const ir = JSON.parse(fs.readFileSync(irPath, 'utf8'));
    const files = ir.registry?.files || {};
    let tableRows = '';
    for (const [f, data] of Object.entries(files)) {
        const retries = data.error_tracking
            ? Object.values(data.error_tracking).reduce((a, b) => a + b, 0)
            : 0;
        const icon = data.state === 'blocked' ? '❌'
            : data.state === 'done'      ? '✅'
            : data.state === 'validated' ? '🟢'
            : data.state === 'patched'   ? '🛠️'
            : data.state === 'planned'   ? '🏗️'
            : data.state === 'contracted'? '📝'
            : data.state === 'analyzed'  ? '🔍' : '⏳';
        tableRows += `| ${f} | ${icon} ${data.state} | ${retries}/3 | - | - | - |\n`;
    }
    const allFiles = Object.values(files);
    const pct = allFiles.length > 0
        ? Math.round(allFiles.filter(f => f.state === 'done').length / allFiles.length * 100)
        : 0;
    const bar = '█'.repeat(Math.round(pct / 6.25)) + '░'.repeat(16 - Math.round(pct / 6.25));
    ir.progress = ir.progress || {};
    ir.progress.globalPercentage = pct;
    fs.writeFileSync(irPath, JSON.stringify(ir, null, 2), 'utf8');

    const startMarker = '<!-- REGISTRY_TABLE_START -->';
    const endMarker   = '<!-- REGISTRY_TABLE_END -->';
    const tableBlock  = `${startMarker}\n\n**Progression Globale : [${bar}] ${pct}% (${allFiles.filter(f=>f.state==='done').length}/${allFiles.length} fichiers)**\n\n| Fichier | État | Retries | Dernière Erreur | Agent | Action |\n| :--- | :---: | :---: | :--- | :---: | :---: |\n${tableRows}\n${endMarker}`;
    const trackerPath = path.resolve(process.cwd(), '.github/Memories/MIGRATION_TRACKER.md');
    let content = fs.existsSync(trackerPath) ? fs.readFileSync(trackerPath, 'utf8') : '';
    if (content.includes(startMarker) && content.includes(endMarker)) {
        content = content.replace(new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`), tableBlock);
    } else {
        content += '\n' + tableBlock;
    }
    fs.writeFileSync(trackerPath, content, 'utf8');
    console.log(`✅ Tracker synchronisé — ${allFiles.length} fichiers, ${pct}% done.`);
    process.exit(0);
}

const irPath = path.resolve(process.cwd(), '.github/IR/global.json');
const ir = JSON.parse(fs.readFileSync(irPath, 'utf8'));
const fileData = ir.registry.files[fileArg] || { state: 'pending' };

// Guard: do not allow transitioning to 'contracted' if truth tables are missing.
// This prevents Phase-2 from progressing the states when no test-oracle payload exists.
if (!syncOnly && toArg === 'contracted') {
    const hasTruth = ir.contracts && Array.isArray(ir.contracts.truth_tables) && ir.contracts.truth_tables.length > 0;
    if (!hasTruth) {
        fileData.state = 'blocked';
        fileData.error_tracking = fileData.error_tracking || {};
        fileData.error_tracking['missing_truth_tables'] = (fileData.error_tracking['missing_truth_tables'] || 0) + 1;
        ir.registry.files[fileArg] = fileData;
        ir.executionTrace = ir.executionTrace || [];
        ir.executionTrace.push({ timestamp: new Date().toISOString(), file: fileArg, to: 'blocked', reason: 'missing_truth_tables' });
        console.error(`🚫 Refusing to transition ${fileArg} -> contracted: missing IR.contracts.truth_tables`);
        // continue so the tracker is updated with the blocked state
    }
}

// Gestion du Circuit Breaker
if (errorArg) {
    fileData.error_tracking = fileData.error_tracking || {};
    fileData.error_tracking[errorArg] = (fileData.error_tracking[errorArg] || 0) + 1;
    if (fileData.error_tracking[errorArg] >= 3) {
        fileData.state = 'blocked';
        console.error(`🚫 CIRCUIT BREAKER: ${fileArg} bloqué après 3 échecs sur '${errorArg}'.`);
    } else {
        fileData.state = toArg;
    }
} else {
    fileData.state = toArg;
}
ir.registry.files[fileArg] = fileData;
ir.executionTrace = ir.executionTrace || [];
ir.executionTrace.push({ timestamp: new Date().toISOString(), file: fileArg, to: toArg, error: errorArg });

// MISE À JOUR DU TABLEAU DE BORD (MIGRATION_TRACKER.md) — utilise des markers pour préserver le template
let tableRows = "";
for (const [f, data] of Object.entries(ir.registry.files)) {
    const retries = data.error_tracking ? Object.values(data.error_tracking).reduce((a, b) => a + b, 0) : 0;
    const lastErr = errorArg && fileArg === f ? errorArg : "-";
    const statusIcon = data.state === 'blocked'    ? '❌'
        : data.state === 'done'       ? '✅'
        : data.state === 'validated'  ? '🟢'
        : data.state === 'patched'    ? '🛠️'
        : data.state === 'planned'    ? '🏗️'
        : data.state === 'contracted' ? '📝'
        : data.state === 'analyzed'   ? '🔍' : '⏳';
    tableRows += `| ${f} | ${statusIcon} ${data.state} | ${retries}/3 | ${lastErr} | orchestrator | transition |\n`;
}

// Calculer la progression globale
const allFiles = Object.values(ir.registry.files);
const doneCount = allFiles.filter(f => f.state === 'done').length;
const totalCount = allFiles.length;
const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
const bar = '█'.repeat(Math.round(pct / 6.25)) + '░'.repeat(16 - Math.round(pct / 6.25));
ir.progress = ir.progress || {};
ir.progress.globalPercentage = pct;

const trackerPath = path.resolve(process.cwd(), '.github/Memories/MIGRATION_TRACKER.md');
let trackerContent;
try {
    trackerContent = fs.readFileSync(trackerPath, 'utf8');
} catch (_) {
    trackerContent = '';
}

const startMarker = '<!-- REGISTRY_TABLE_START -->';
const endMarker = '<!-- REGISTRY_TABLE_END -->';
const tableBlock = `${startMarker}\n\n**Progression Globale : [${bar}] ${pct}% (${doneCount}/${totalCount} fichiers)**\n\n| Fichier | État | Retries | Dernière Erreur | Agent | Action |\n| :--- | :---: | :---: | :--- | :---: | :---: |\n${tableRows}\n${endMarker}`;

if (trackerContent.includes(startMarker) && trackerContent.includes(endMarker)) {
    // Remplacer uniquement entre les markers
    trackerContent = trackerContent.replace(
        new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`),
        tableBlock
    );
} else {
    // Première fois : créer le fichier avec header + markers
    trackerContent = `# 💎 RGL V7 COMMAND CENTER\n\n🚥 Chaîne d'Assemblage Déterministe\n\n${tableBlock}`;
}
fs.writeFileSync(trackerPath, trackerContent, 'utf8');

fs.writeFileSync(irPath, JSON.stringify(ir, null, 2), 'utf8');
console.log(`✅ Tracker mis à jour pour ${fileArg}`);
