const fs = require('fs'); const crypto = require('crypto'); const path = require('path');
const parser = require('@babel/parser'); const traverse = require('@babel/traverse').default; const generate = require('@babel/generator').default;
const getHash = (data) => crypto.createHash('sha256').update(data).digest('hex');

function getNodeName(node) {
  if (!node) return null;
  if (node.id) return node.id.name;
  if (node.declaration && node.declaration.id) return node.declaration.id.name;
  if (node.declarations && node.declarations.length > 0 && node.declarations[0].id) return node.declarations[0].id.name;
  return null;
}

const fileArg = process.argv.find(a => a.startsWith('--payload='))?.split('=')[1];
if (!fileArg || !fs.existsSync(fileArg)) process.exit(1);

try {
  const payload = JSON.parse(fs.readFileSync(fileArg, 'utf8'));
  const patches = payload.astPatches || [payload];
  const patchesByFile = {};
  for (const p of patches) { if(!patchesByFile[p.file]) patchesByFile[p.file] = []; patchesByFile[p.file].push(p); }

  for (const [file, filePatches] of Object.entries(patchesByFile)) {
    const normFile = path.relative(process.cwd(), path.resolve(process.cwd(), file)).replace(/\\/g, '/');
    const absPath = path.resolve(process.cwd(), normFile);
    let code = fs.readFileSync(absPath, 'utf8');

    // Un seul Parse pour tout le fichier
    let ast = parser.parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    let fileModified = false;

    // Appliquer tous les patchs en une seule session de transformation
    for (const patch of filePatches) {
      let newAstNodes = [];
      if (patch.action !== 'removeNode') {
         const decoded = Buffer.from(patch.newCodeBase64, 'base64').toString('utf8');
         newAstNodes = parser.parse(decoded, { sourceType: 'module', plugins: ['typescript', 'jsx'] }).program.body;
      }

      if (patch.action === 'addImport') {
        traverse(ast, { Program(p) {
          newAstNodes.forEach(newImp => {
            if (newImp.type !== 'ImportDeclaration') return;
            const existing = p.node.body.find(n => n.type === 'ImportDeclaration' && n.source.value === newImp.source.value);
            if (existing) {
              const names = existing.specifiers.map(s => s.local.name);
              newImp.specifiers.forEach(s => { if (!names.includes(s.local.name)) existing.specifiers.push(s); });
            } else { p.node.body.unshift(newImp); }
          });
          fileModified = true; p.stop();
        }});
      } else {
        traverse(ast, { [patch.nodeType](p) {
          if (getNodeName(p.node) === patch.identifier) {
            const isExp = p.parentPath.isExportNamedDeclaration() || p.parentPath.isExportDefaultDeclaration();
            const target = isExp ? p.parentPath : p;
            if (patch.action === 'removeNode') target.remove();
            else {
              const toInsert = isExp ? newAstNodes.map(n => ({ type: 'ExportNamedDeclaration', declaration: n, specifiers: [] })) : newAstNodes;
              target.replaceWithMultiple(toInsert);
            }
            fileModified = true; p.stop();
          }
        }});
      }
    }

    if (fileModified) {
      // Un seul Generate final par fichier
      const output = generate(ast, { retainLines: true }, code).code;
      fs.writeFileSync(absPath, output, 'utf8');

      const irPath = path.resolve(process.cwd(), '.github/IR/global.json');
      const ir = JSON.parse(fs.readFileSync(irPath, 'utf8'));
      if (ir.registry.files[normFile]) ir.registry.files[normFile].currentHash = getHash(output);
      fs.writeFileSync(irPath, JSON.stringify(ir, null, 2), 'utf8');
      console.log(`✅ Turbo-Patch appliqué : ${normFile}`);
    }
  }
} catch(e) { console.error(e.message); process.exit(1); }
finally { if (fs.existsSync(fileArg)) fs.unlinkSync(fileArg); }