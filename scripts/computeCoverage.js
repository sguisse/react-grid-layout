const fs = require('fs');
const path = require('path');
const covPath = path.resolve(__dirname, '..', 'coverage', 'coverage-final.json');
if (!fs.existsSync(covPath)) {
  console.error('coverage file missing at', covPath);
  process.exit(2);
}
const data = JSON.parse(fs.readFileSync(covPath, 'utf8'));
let totals = { statements: { total: 0, covered: 0 }, functions: { total: 0, covered: 0 }, branches: { total: 0, covered: 0 }, lines: { total: 0, covered: 0 } };
for (const p in data) {
  const file = data[p];
  const s = file.s || {};
  const f = file.f || {};
  const b = file.b || {};
  const statementMap = file.statementMap || {};
  const stmKeys = Object.keys(s);
  totals.statements.total += stmKeys.length;
  totals.statements.covered += stmKeys.filter(k => s[k] > 0).length;
  const fnKeys = Object.keys(f);
  totals.functions.total += fnKeys.length;
  totals.functions.covered += fnKeys.filter(k => f[k] > 0).length;
  for (const bk in b) {
    const arr = b[bk] || [];
    totals.branches.total += arr.length;
    totals.branches.covered += arr.filter(x => x > 0).length;
  }
  const startLines = new Set();
  const coveredLines = new Set();
  for (const idx in statementMap) {
    const st = statementMap[idx] && statementMap[idx].start && statementMap[idx].start.line;
    if (st) startLines.add(st);
    if (s[idx] && s[idx] > 0) coveredLines.add(st);
  }
  totals.lines.total += startLines.size;
  totals.lines.covered += coveredLines.size;
}
function fmt(n) {
  return { total: n.total, covered: n.covered, pct: n.total ? Math.round((n.covered / n.total) * 10000) / 100 : 100 };
}
const out = { statements: fmt(totals.statements), functions: fmt(totals.functions), branches: fmt(totals.branches), lines: fmt(totals.lines) };
console.log(JSON.stringify(out, null, 2));
