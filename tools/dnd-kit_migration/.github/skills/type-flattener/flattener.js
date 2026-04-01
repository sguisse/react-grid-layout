const fs = require('fs'); const path = require('path');
const parser = require('@babel/parser'); const generate = require('@babel/generator').default;
const traverse = require('@babel/traverse').default;
const fileArg = process.argv.find(a => a.startsWith('--file='))?.split('=')[1];
if (!fileArg) { console.error('❌ Argument --file= manquant.'); process.exit(1); }
function resolveTypes(filePath, seen = new Set()) {
  const absPath = path.resolve(process.cwd(), filePath);
  if (seen.has(absPath) || !fs.existsSync(absPath)) return '';
  seen.add(absPath); const content = fs.readFileSync(absPath, 'utf8');
  let typeDefs = '';
  try {
    const ast = parser.parse(content, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    traverse(ast, {
      TSInterfaceDeclaration(p) { typeDefs += generate(p.node).code + '\n\n'; },
      TSTypeAliasDeclaration(p) { typeDefs += generate(p.node).code + '\n\n'; },
      TSEnumDeclaration(p) { typeDefs += generate(p.node).code + '\n\n'; }
    });
  } catch (_) {
    // Fallback for files that can't be parsed (plain JS)
    const matches = content.match(/(export\s+)?(interface|type|enum)\s+\w+[\s\S]*?(?:;|\})/g);
    if (matches) typeDefs += matches.join('\n') + '\n';
  }
  const imports = content.match(/from\s+['"](\..*?)['"]/g) || [];
  imports.forEach(imp => {
    const relPath = imp.match(/['"](.*?)['"]/)[1];
    const resolved = path.resolve(path.dirname(absPath), relPath);
    const candidates = [resolved + '.ts', resolved + '.tsx', resolved + '/index.ts'];
    const found = candidates.find(c => fs.existsSync(c));
    if (found) typeDefs += '\n' + resolveTypes(found, seen);
  }); return typeDefs;
}
const types = resolveTypes(fileArg);
const normFile = path.relative(process.cwd(), path.resolve(process.cwd(), fileArg)).replace(/\\/g, '/');
// FIX CRITIQUE : Écriture dans un fichier séparé, pas dans global.json
const snapshotDir = path.resolve(process.cwd(), '.github/IR/snapshots');
if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });
const snapshotFile = path.resolve(snapshotDir, normFile.replace(/[/\\.]/g, '_') + '.d.ts');
fs.writeFileSync(snapshotFile, types || '// Aucun type trouvé', 'utf8');
const irPath = path.resolve(process.cwd(), '.github/IR/global.json');
const ir = JSON.parse(fs.readFileSync(irPath, 'utf8'));
ir.registry.type_snapshots = ir.registry.type_snapshots || {};
ir.registry.type_snapshots[normFile] = snapshotFile;
fs.writeFileSync(irPath, JSON.stringify(ir, null, 2), 'utf8');
console.log('✅ Types extraits via AST et stockés hors-contexte.');
