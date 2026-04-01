const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const cwd = process.cwd();
const irPath = path.join(cwd, '.github/IR/global.json');
if (!fs.existsSync(irPath)) {
  console.error('global.json not found at', irPath);
  process.exit(1);
}

const ir = JSON.parse(fs.readFileSync(irPath, 'utf8'));
const filesObj = (ir.registry && ir.registry.files) ? ir.registry.files : {};
const fileKeys = Object.keys(filesObj).filter(f => f.includes('src/react/components') || (filesObj[f] && filesObj[f].classification === 'react_component'));

if (fileKeys.length === 0) {
  console.error('No component files found in IR registry.');
  process.exit(1);
}

function extractPropsFromParam(p) {
  if (!p) return [];
  if (p.type === 'ObjectPattern') {
    return p.properties.map(prop => prop.key && prop.key.name ? prop.key.name : null).filter(Boolean);
  }
  if (p.type === 'Identifier') {
    return [p.name];
  }
  // TS parameter with type annotation -> try pattern inside
  if (p.type === 'AssignmentPattern' && p.left) return extractPropsFromParam(p.left);
  return [];
}

function isUseStateCall(node) {
  if (!node || node.type !== 'CallExpression') return false;
  if (node.callee.type === 'Identifier' && node.callee.name === 'useState') return true;
  if (node.callee.type === 'MemberExpression' && node.callee.object && node.callee.property) {
    // React.useState
    return node.callee.property.name === 'useState';
  }
  return false;
}

const results = [];

for (const relPath of fileKeys) {
  const absPath = path.resolve(cwd, relPath);
  if (!fs.existsSync(absPath)) {
    console.warn(`Skipping missing file ${relPath}`);
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

  // First pass: collect imports, exports, component params, functions, states, anti-patterns
  traverse(ast, {
    ImportDeclaration({ node }) {
      if (node && node.source && node.source.value) importedDeps.add(node.source.value);
    },
    ExportDefaultDeclaration(path) {
      const decl = path.node.declaration;
      if (!decl) return;
      if (decl.type === 'FunctionDeclaration') {
        const p = decl.params && decl.params[0];
        componentPropsFound = extractPropsFromParam(p);
      } else if (decl.type === 'Identifier') {
        // will try to find the variable/function with this name later
        // Nothing to do here
      } else if (decl.type === 'ArrowFunctionExpression' || decl.type === 'FunctionExpression') {
        const p = decl.params && decl.params[0];
        componentPropsFound = extractPropsFromParam(p);
      }
    },
    VariableDeclarator(path) {
      const id = path.node.id;
      const init = path.node.init;
      // useState detection
      if (init && isUseStateCall(init)) {
        if (id && id.type === 'ArrayPattern' && id.elements && id.elements[0]) {
          const el = id.elements[0];
          if (el && el.type === 'Identifier') {
            const name = el.name;
            // classify visual vs logical
            if (/(drag|resiz|resize|dragging|resizing|isDragging|isResizing)/i.test(name)) stateVisual.add(name);
            else stateLogical.add(name);
          }
        }
      }
      // possible pure function assigned to variable
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
      // look for this.state or class property "state"
      const body = path.node.body && path.node.body.body;
      if (body) {
        body.forEach(member => {
          if (member.type === 'ClassProperty' && member.key && member.key.name === 'state' && member.value && member.value.type === 'ObjectExpression') {
            member.value.properties.forEach(prop => {
              if (prop.key && prop.key.name) stateLogical.add(prop.key.name);
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
      // ReactDOM.findDOMNode or findDOMNode
      if (callee.type === 'MemberExpression' && callee.property && callee.property.name === 'findDOMNode') {
        antiSet.add('findDOMNode');
      }
      if (callee.type === 'Identifier' && callee.name === 'findDOMNode') antiSet.add('findDOMNode');
      // document.* or window.* usage
      if (callee.type === 'MemberExpression' && callee.object && (callee.object.name === 'document' || callee.object.name === 'window')) {
        antiSet.add('direct-dom-access');
      }
    }
  });

  // Second pass: collect props by locating exported component identifier if needed and inspect its params
  traverse(ast, {
    ExportNamedDeclaration(path) {
      const decl = path.node.declaration;
      if (!decl) return;
      if (decl.type === 'FunctionDeclaration') {
        const p = decl.params && decl.params[0];
        if (p) componentPropsFound = componentPropsFound.concat(extractPropsFromParam(p));
      }
    },
    // look for exported const X = (...) => {}
    ExportDefaultDeclaration(path) {
      const decl = path.node.declaration;
      if (decl && decl.type === 'Identifier') {
        const name = decl.name;
        // find variable declarator or function declaration with this name
        traverse(ast, {
          VariableDeclarator(inner) {
            if (inner.node.id && inner.node.id.name === name && inner.node.init) {
              const p = inner.node.init.params && inner.node.init.params[0];
              if (p) componentPropsFound = componentPropsFound.concat(extractPropsFromParam(p));
            }
          },
          FunctionDeclaration(inner) {
            if (inner.node.id && inner.node.id.name === name) {
              const p = inner.node.params && inner.node.params[0];
              if (p) componentPropsFound = componentPropsFound.concat(extractPropsFromParam(p));
            }
          }
        }, path.scope, path.state, path);
      }
    }
  });

  // Third pass: collect more functions and anti-patterns and external deps and class methods
  traverse(ast, {
    FunctionDeclaration(path) {
      if (path.node.id && path.node.id.name) {
        const n = path.node.id.name;
        if (/(calc|compute|get|is|can|collision|collides|move|clamp|layout|sort)/i.test(n)) pureFuncNames.add(n);
      }
    },
    ClassMethod(path) {
      if (path.node.key && path.node.key.name) {
        const n = path.node.key.name;
        if (/(calc|compute|get|is|can|collision|collides|move|clamp|layout|sort)/i.test(n)) pureFuncNames.add(n);
        if (/(componentWillMount|componentDidMount|componentWillReceiveProps|componentWillUpdate|componentDidUpdate)/.test(n)) antiSet.add(n);
      }
    },
    MemberExpression(path) {
      if (path.node.object && (path.node.object.name === 'document' || path.node.object.name === 'window')) antiSet.add('direct-dom-access');
    },
    Identifier(path) {
      if (path.node.name === 'findDOMNode') antiSet.add('findDOMNode');
    }
  });

  info.props = Array.from(new Set(componentPropsFound)).filter(Boolean);
  info.externalDeps = Array.from(importedDeps);
  info.pureFunctions = Array.from(pureFuncNames);
  info.antiPatterns = Array.from(antiSet);
  info.state.logical = Array.from(stateLogical);
  info.state.visual = Array.from(stateVisual);

  results.push(info);
}

const outPath = path.join(cwd, '.github/IR/component_analysis.json');
fs.writeFileSync(outPath, JSON.stringify({ files: results }, null, 2), 'utf8');
console.log(`✅ Component analysis complete — files analyzed: ${results.length}. Output: ${outPath}`);
process.exit(0);
