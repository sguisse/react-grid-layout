const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const args = process.argv.slice(2);
if (!args.length) {
  console.error('Usage: node analyze_targets.js <file1> [file2] ...');
  process.exit(1);
}

function extractPropsFromParam(p) {
  if (!p) return [];
  if (p.type === 'ObjectPattern') {
    return p.properties.map(prop => {
      if (!prop) return null;
      if (prop.type === 'RestElement' && prop.argument && prop.argument.name) return prop.argument.name;
      if (prop.key) return prop.key.name || prop.key.value || null;
      return null;
    }).filter(Boolean);
  }
  if (p.type === 'Identifier') return [p.name];
  if (p.type === 'AssignmentPattern' && p.left) return extractPropsFromParam(p.left);
  if (p.type === 'TSParameterProperty' && p.parameter) return extractPropsFromParam(p.parameter);
  if (p.type === 'RestElement' && p.argument && p.argument.name) return [p.argument.name];
  return [];
}

function isUseStateCall(node) {
  if (!node || node.type !== 'CallExpression') return false;
  if (node.callee.type === 'Identifier' && node.callee.name === 'useState') return true;
  if (node.callee.type === 'MemberExpression' && node.callee.property && node.callee.property.name === 'useState') return true;
  return false;
}

const results = [];

for (const rel of args) {
  const relPath = rel;
  const absPath = path.resolve(process.cwd(), relPath);
  if (!fs.existsSync(absPath)) {
    console.error(`Missing file: ${relPath}`);
    continue;
  }
  const code = fs.readFileSync(absPath, 'utf8');
  let ast;
  try {
    ast = parser.parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx', 'classProperties', 'decorators-legacy'] });
  } catch (e) {
    console.error('Parse error in', relPath, e.message);
    continue;
  }

  const info = {
    file: relPath,
    props: [],
    state: { logical: [], visual: [] },
    pureFunctions: [],
    antiPatterns: [],
    externalDeps: []
  };

  const importedDeps = new Set();
  const pureFuncNames = new Set();
  const antiSet = new Set();
  const stateLogical = new Set();
  const stateVisual = new Set();
  let componentPropsFound = [];

  traverse(ast, {
    ImportDeclaration({ node }) {
      if (node && node.source && node.source.value) importedDeps.add(node.source.value);
    },
    VariableDeclarator(path) {
      const id = path.node.id;
      const init = path.node.init;
      if (init && isUseStateCall(init)) {
        if (id && id.type === 'ArrayPattern' && id.elements && id.elements[0]) {
          const el = id.elements[0];
          if (el && el.type === 'Identifier') {
            const name = el.name;
            if (/(drag|resiz|resize|dragging|resizing|isDragging|isResizing)/i.test(name)) stateVisual.add(name);
            else stateLogical.add(name);
          }
        }
      }
      if (id && id.type === 'Identifier' && init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
        const name = id.name;
        if (/(calc|compute|get|is|can|collision|collides|move|clamp|layout|sort)/i.test(name)) pureFuncNames.add(name);
      }
    },
    FunctionDeclaration(path) {
      const name = path.node.id && path.node.id.name;
      if (name && /(calc|compute|get|is|can|collision|collides|move|clamp|layout|sort)/i.test(name)) pureFuncNames.add(name);
    },
    ClassDeclaration(path) {
      const body = path.node.body && path.node.body.body;
      if (body) {
        body.forEach(member => {
          if (member.type === 'ClassProperty' && member.key && member.key.name === 'state' && member.value && member.value.type === 'ObjectExpression') {
            member.value.properties.forEach(prop => {
              if (prop.key && (prop.key.name || prop.key.value)) stateLogical.add(prop.key.name || prop.key.value);
            });
          }
          if (member.type === 'ClassMethod' && member.key && /(componentWillMount|componentDidMount|componentWillReceiveProps|componentWillUpdate|componentDidUpdate)/.test(member.key.name)) {
            antiSet.add(member.key.name);
          }
        });
      }
    },
    CallExpression(path) {
      const callee = path.node.callee;
      if (callee.type === 'MemberExpression' && callee.property && callee.property.name === 'findDOMNode') antiSet.add('findDOMNode');
      if (callee.type === 'Identifier' && callee.name === 'findDOMNode') antiSet.add('findDOMNode');
      if (callee.type === 'MemberExpression' && callee.object && (callee.object.name === 'document' || callee.object.name === 'window')) antiSet.add('direct-dom-access');
    },
    MemberExpression(path) {
      if (path.node.object && (path.node.object.name === 'document' || path.node.object.name === 'window')) antiSet.add('direct-dom-access');
    },
    Identifier(path) {
      if (path.node.name === 'findDOMNode') antiSet.add('findDOMNode');
    }
  });

  // Analyze exports to extract component props
  const programBody = ast.program.body || [];
  for (const node of programBody) {
    if (node.type === 'ExportNamedDeclaration' && node.declaration) {
      const decl = node.declaration;
      if (decl.type === 'FunctionDeclaration') {
        const p = decl.params && decl.params[0];
        componentPropsFound = componentPropsFound.concat(extractPropsFromParam(p));
      } else if (decl.type === 'VariableDeclaration') {
        for (const d of decl.declarations) {
          if (d.init && (d.init.type === 'ArrowFunctionExpression' || d.init.type === 'FunctionExpression')) {
            const p = d.init.params && d.init.params[0];
            componentPropsFound = componentPropsFound.concat(extractPropsFromParam(p));
          }
        }
      }
    } else if (node.type === 'ExportDefaultDeclaration') {
      const decl = node.declaration;
      if (!decl) continue;
      if (decl.type === 'Identifier') {
        const name = decl.name;
        // find matching declaration
        for (const n2 of programBody) {
          if (n2.type === 'FunctionDeclaration' && n2.id && n2.id.name === name) {
            const p = n2.params && n2.params[0];
            componentPropsFound = componentPropsFound.concat(extractPropsFromParam(p));
          } else if (n2.type === 'VariableDeclaration') {
            for (const d of n2.declarations) {
              if (d.id && d.id.name === name && d.init && (d.init.type === 'ArrowFunctionExpression' || d.init.type === 'FunctionExpression')) {
                const p = d.init.params && d.init.params[0];
                componentPropsFound = componentPropsFound.concat(extractPropsFromParam(p));
              }
            }
          }
        }
      } else if (decl.type === 'FunctionDeclaration' || decl.type === 'ArrowFunctionExpression' || decl.type === 'FunctionExpression') {
        const p = decl.params && decl.params[0];
        componentPropsFound = componentPropsFound.concat(extractPropsFromParam(p));
      }
    }
  }

  info.props = Array.from(new Set(componentPropsFound.filter(Boolean)));
  info.externalDeps = Array.from(importedDeps);
  info.pureFunctions = Array.from(pureFuncNames);
  info.antiPatterns = Array.from(antiSet);
  info.state.logical = Array.from(stateLogical);
  info.state.visual = Array.from(stateVisual);

  results.push(info);
}

const outPath = path.join(process.cwd(), '.github/IR/component_analysis_increment.json');
fs.writeFileSync(outPath, JSON.stringify({ files: results }, null, 2), 'utf8');
console.log(`✅ Component analysis (increment) written: ${outPath}`);
process.exit(0);
