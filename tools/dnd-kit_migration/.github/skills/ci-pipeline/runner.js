const { execSync } = require('child_process');
const path = require('path');
const scriptPath = path.resolve(process.cwd(), '.github/check-skills-script.sh');
const workspaceSrc = path.resolve(process.cwd(), 'dnd-react-layout/src');

try {
  console.log("⏳ Sentinel analyse la viabilité sémantique de : " + workspaceSrc);
  const output = execSync(`bash ${scriptPath} ${workspaceSrc}`, { encoding: 'utf8', stdio: 'pipe' });
  console.log(JSON.stringify({ status: 'PASSED', logs: 'Code V2 viable.' }));
  process.exit(0);
} catch (e) {
  console.log(JSON.stringify({
    status: 'FAILED',
    error: 'WORKSPACE_SEMANTIC_ERROR',
    details: e.stdout || e.stderr || e.message
  }));
  process.exit(0);
}