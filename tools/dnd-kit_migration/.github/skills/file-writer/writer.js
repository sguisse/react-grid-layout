const fs = require('fs'); const path = require('path');
const payloadArg = process.argv.find(a => a.startsWith('--payload='))?.split('=')[1];
if (!payloadArg || !fs.existsSync(payloadArg)) { console.error('Payload manquant'); process.exit(1); }
try {
  const payload = JSON.parse(fs.readFileSync(payloadArg, 'utf8'));
  if (!payload.file || !payload.contentBase64) throw new Error('Schema invalide : file ou contentBase64 manquant');
  const absPath = path.resolve(process.cwd(), payload.file);
  if (!fs.existsSync(path.dirname(absPath))) fs.mkdirSync(path.dirname(absPath), { recursive: true });
  // FIX 3: Décodage Base64 sécurisé pour éviter la corruption Bash
  const content = Buffer.from(payload.contentBase64, 'base64').toString('utf8');
  fs.writeFileSync(absPath, content, 'utf8');
  console.log(`✅ Fichier test généré sans corruption d'échappement : ${payload.file}`);
} catch(e) { console.error(e.message); process.exit(1);
} finally { if (fs.existsSync(payloadArg)) fs.unlinkSync(payloadArg); }