const fs = require('fs'); const path = require('path');
const keyArg = process.argv.find(a => a.startsWith('--key='))?.split('=')[1];
const payloadArg = process.argv.find(a => a.startsWith('--payload='))?.split('=')[1];
if (!keyArg || !payloadArg || !fs.existsSync(payloadArg)) { process.exit(1); }
try {
  const payload = JSON.parse(fs.readFileSync(payloadArg, 'utf8'));
  const irPath = path.resolve(process.cwd(), '.github/IR/global.json');
  const ir = JSON.parse(fs.readFileSync(irPath, 'utf8'));
  const cleanKey = keyArg.replace(/^IR\./, '');
  const keys = cleanKey.match(/([^\\\[\].]+|\\\[.*?\\\])/g).map(k => k.replace(/^\\\[['"]?|['"]?\\\]$/g, ''));
  let current = ir;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = payload;
  fs.writeFileSync(irPath, JSON.stringify(ir, null, 2), 'utf8');
} catch(e) { console.error(e.message); process.exit(1); }
finally { if(fs.existsSync(payloadArg)) fs.unlinkSync(payloadArg); }