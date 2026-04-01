const parser = require('@babel/parser'); const generate = require('@babel/generator').default;
const traverse = require('@babel/traverse').default; const fs = require('fs');
const [,, filePath, ...fnNames] = process.argv;
if (!filePath || fnNames.length === 0) { console.error('Usage: node scalpel.js <file> <fn1> [fn2] ...'); process.exit(1); }
const code = fs.readFileSync(filePath, 'utf8');
const ast = parser.parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
let extracted = '';
traverse(ast, {
  // Standard function declarations: function foo() {}
  FunctionDeclaration(p) {
    if (p.node.id && fnNames.includes(p.node.id.name)) extracted += generate(p.node).code + '\n\n';
  },
  // Arrow functions & function expressions: const foo = () => {} / const foo = function() {}
  VariableDeclarator(p) {
    if (p.node.id && fnNames.includes(p.node.id.name) && p.node.init &&
        (p.node.init.type === 'ArrowFunctionExpression' || p.node.init.type === 'FunctionExpression')) {
      // Generate the full variable declaration for context
      const parent = p.parentPath;
      extracted += generate(parent.node).code + '\n\n';
    }
  },
  // Class methods: class X { foo() {} }
  ClassMethod(p) {
    if (p.node.key && fnNames.includes(p.node.key.name)) {
      extracted += generate(p.node).code + '\n\n';
    }
  }
});
if (extracted) { console.log(extracted); } else { console.error(`⚠️ Aucune fonction trouvée parmi : ${fnNames.join(', ')}`); process.exit(1); }
