const { execSync } = require('child_process'); const path = require('path'); const fs = require('fs');
const fileArg = process.argv.find(a => a.startsWith('--file='))?.split('=')[1];
if (!fileArg || !fs.existsSync(path.resolve(process.cwd(), fileArg))) { console.error('Fichier test introuvable'); process.exit(1); }
try {
  const output = execSync(`npx playwright test ${fileArg} --reporter=json`, { encoding: 'utf8', stdio: 'pipe' });
  console.log(JSON.stringify({ status: 'PASSED', log: 'Parité confirmée.' }));
  process.exit(0);
} catch (e) {
  let errorMsg = 'Echec inconnu';
  try { const report = JSON.parse(e.stdout); errorMsg = report.errors[0]?.message || e.message; } catch(err) { errorMsg = e.message; }
  console.log(JSON.stringify({ status: 'FAILED', error: errorMsg }));
  // FIX CRITIQUE: On retourne 0 pour que l'LLM puisse lire le JSON d'erreur et boucler.
  process.exit(0);
}