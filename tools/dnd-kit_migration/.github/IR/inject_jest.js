const fs = require('fs'); const path = require('path');
try {
  const raw = fs.readFileSync(path.resolve(process.cwd(), '.github/IR/jest_output.json'), 'utf8');
  const testData = JSON.parse(raw);
  const truthTable = (testData.testResults || []).flatMap(tr => (tr.assertionResults || []).map(ar => ({
    suite: (ar.ancestorTitles||[]).join(' > '), test: ar.title, status: ar.status
  })));
  const irPath = path.resolve(process.cwd(), '.github/IR/global.json');
  const ir = JSON.parse(fs.readFileSync(irPath, 'utf8'));
  ir.contracts = ir.contracts || {}; ir.contracts.truth_tables = truthTable;
  fs.writeFileSync(irPath, JSON.stringify(ir, null, 2), 'utf8');
  console.log('✅ Injected truth_tables into', irPath);
} catch (e) { console.error('❌ Inject failed:', e.message); process.exit(1); }
