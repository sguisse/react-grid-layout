const fs = require('fs'); const crypto = require('crypto'); const strip = require('strip-comments'); const path = require('path');
const fileArg = process.argv.find(a => a.startsWith('--file='))?.split('=')[1];
if (!fileArg) { console.error('❌ Argument --file= manquant.'); process.exit(1); }
const normFile = path.relative(process.cwd(), path.resolve(process.cwd(), fileArg)).replace(/\\/g, '/');
const absPath = path.resolve(process.cwd(), normFile);
const code = fs.readFileSync(absPath, 'utf8');
const cleanCode = strip(code).replace(/\n\s*\n/g, '\n');
// Écrire dans un snapshot séparé — NE JAMAIS écraser le fichier source original
const snapshotDir = path.resolve(process.cwd(), '.github/IR/cleaned');
if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });
const snapshotFile = path.join(snapshotDir, normFile.replace(/\//g, '_'));
fs.writeFileSync(snapshotFile, cleanCode, 'utf8');
const irPath = path.resolve(process.cwd(), '.github/IR/global.json');
const ir = JSON.parse(fs.readFileSync(irPath, 'utf8'));
ir.registry.cleaned_snapshots = ir.registry.cleaned_snapshots || {};
ir.registry.cleaned_snapshots[normFile] = snapshotFile;
fs.writeFileSync(irPath, JSON.stringify(ir, null, 2));
console.log(`✅ Fichier nettoyé dans snapshot (source originale préservée) : ${snapshotFile}`);
