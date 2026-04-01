const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const jestOutputPath = path.resolve(process.cwd(), '.github/IR/jest_output.json');
const irPath = path.resolve(process.cwd(), '.github/IR/global.json');

function runJestToFile() {
  // Use npx to ensure local jest binary is executed and write JSON to a file
  try {
    const res = spawnSync('npx', ['jest', '--json', '--outputFile', jestOutputPath], { stdio: 'inherit', shell: false });
    return res.status === 0 ? 0 : (res.status || 1);
  } catch (e) {
    console.error('❌ Failed to run jest:', e.message);
    return 1;
  }
}

// Run Jest and ensure we have a file to parse (more robust than parsing stdout)
const exitCode = runJestToFile();

let truthTable = [];
try {
  if (!fs.existsSync(jestOutputPath)) throw new Error('jest output file missing');
  const raw = fs.readFileSync(jestOutputPath, 'utf8');
  const testData = JSON.parse(raw);
  truthTable = (testData.testResults || []).flatMap(tr => (tr.assertionResults || []).map(ar => ({
    suite: (ar.ancestorTitles || []).join(' > '), test: ar.title, status: ar.status
  })));
} catch (err) {
  // Log but do not crash the whole orchestrator — write a deterministic empty payload instead
  console.error('⚠️ truth-oracle: could not parse Jest output:', err.message);
  truthTable = [];
}

try {
  const ir = fs.existsSync(irPath) ? JSON.parse(fs.readFileSync(irPath, 'utf8')) : {};
  ir.contracts = ir.contracts || {};
  ir.contracts.truth_tables = truthTable;
  ir.contracts._meta = ir.contracts._meta || {};
  ir.contracts._meta.oracle_last_run = { timestamp: new Date().toISOString(), exitCode };
  fs.writeFileSync(irPath, JSON.stringify(ir, null, 2), 'utf8');
  console.log('✅ Oracle mis à jour.');
  // Exit with non-zero if jest failed to run (so CI/orchestrator can detect), but only after persisting IR
  if (exitCode !== 0) process.exit(exitCode);
} catch (err) {
  console.error('❌ Failed to persist oracle results:', err.message);
  process.exit(1);
}
