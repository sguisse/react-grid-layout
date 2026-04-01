const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const crypto = require('crypto');
const fs = require('fs');

function getSignature(code, fnName) {
  const ast = parser.parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  let sig = null;

  const visitor = {
    // FunctionDeclaration: function foo() {}
    FunctionDeclaration(p) {
      if (p.node.id && p.node.id.name === fnName) {
        sig = extractSig(p.node);
        p.stop();
      }
    },
    // VariableDeclarator: const foo = () => {} / const foo = function() {}
    VariableDeclarator(p) {
      if (p.node.id && p.node.id.name === fnName && p.node.init &&
          (p.node.init.type === 'ArrowFunctionExpression' || p.node.init.type === 'FunctionExpression')) {
        sig = extractSig(p.node.init);
        p.stop();
      }
    },
    // ClassMethod: class X { foo() {} }
    ClassMethod(p) {
      if (p.node.key && p.node.key.name === fnName) {
        sig = extractSig(p.node);
        p.stop();
      }
    }
  };

  traverse(ast, visitor);
  return sig;
}

function extractSig(fnNode) {
  const params = (fnNode.params || []).map(p => generate(p).code);
  const returnType = fnNode.returnType
    ? `: ${generate(fnNode.returnType.typeAnnotation).code}`
    : null;
  const bodyCode = fnNode.body ? generate(fnNode.body).code : '';
  const bodyHash = crypto.createHash('sha256').update(bodyCode).digest('hex');
  return {
    params,
    paramCount: params.length,
    returnType,
    bodyHash,
    async: !!fnNode.async,
    generator: !!fnNode.generator
  };
}

const [,, oldFile, newFile, fnName] = process.argv;
if (!oldFile || !newFile || !fnName) {
  console.error('Usage: node guardian.js <oldFile> <newFile> <functionName>');
  process.exit(1);
}

const oldSig = getSignature(fs.readFileSync(oldFile, 'utf8'), fnName);
const newSig = getSignature(fs.readFileSync(newFile, 'utf8'), fnName);

if (!oldSig) {
  console.log(JSON.stringify({ match: false, error: `Function '${fnName}' not found in ${oldFile}` }));
  process.exit(0);
}
if (!newSig) {
  console.log(JSON.stringify({ match: false, error: `Function '${fnName}' not found in ${newFile}` }));
  process.exit(0);
}

const paramsMatch = JSON.stringify(oldSig.params) === JSON.stringify(newSig.params);
const returnMatch = oldSig.returnType === newSig.returnType;
const bodyMatch = oldSig.bodyHash === newSig.bodyHash;

console.log(JSON.stringify({
  match: paramsMatch && returnMatch,
  paramsMatch,
  returnTypeMatch: returnMatch,
  bodyChanged: !bodyMatch,
  oldSig,
  newSig
}));
