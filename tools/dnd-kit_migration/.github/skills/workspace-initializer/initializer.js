const fs = require('fs');
const path = require('path');

// FIX: Utilisation systématique de path.resolve pour éviter la fragmentation
const workspaceRoot = path.resolve(process.cwd(), 'dnd-react-layout');

const dirs = [
  path.join(workspaceRoot, 'src/core'),
  path.join(workspaceRoot, 'src/react'),
  path.join(workspaceRoot, 'test')
];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Créé : ${path.relative(process.cwd(), dir)}`);
  }
});

// Create minimal TypeScript stub files so `tsc` always has inputs
const stubs = [
  { file: path.join(workspaceRoot, 'src/core/index.ts'), content: '// Minimal stub created by initializer\nexport {};\n' },
  { file: path.join(workspaceRoot, 'src/react/index.ts'), content: '// Minimal stub created by initializer\nexport {};\n' }
];

stubs.forEach(({ file, content }) => {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`✳️  Créé stub: ${path.relative(process.cwd(), file)}`);
  }
});

const pkg = {
  "name": "dnd-react-layout",
  "version": "1.0.0",
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@dnd-kit/react": "^0.3.2",
    "@dnd-kit/dom": "^0.3.2",
    "@dnd-kit/abstract": "^0.3.2",
    "@dnd-kit/collision": "^0.3.2",
    "clsx": "^2.1.1"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
};

// More permissive TS defaults to avoid false 'no inputs' failures
const ts = {
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ESNext", "DOM"],
    "allowJs": true,
    "checkJs": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "moduleResolution": "Node",
    "resolveJsonModule": true
  },
  "include": ["src/**/*"]
};

fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify(pkg, null, 2));
fs.writeFileSync(path.join(workspaceRoot, 'tsconfig.json'), JSON.stringify(ts, null, 2));
console.log("✅ Workspace initialisé avec chemins absolus.");
