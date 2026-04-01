const fs = require('fs');
const path = require('path');

const agent = process.argv.find(a => a.startsWith('--agent='))?.split('=')[1] || 'unknown';
const task = process.argv.find(a => a.startsWith('--task='))?.split('=')[1] || 'idle';
const file = process.argv.find(a => a.startsWith('--file='))?.split('=')[1] || 'none';

const statusPath = path.resolve(process.cwd(), '.github/IR/live-status.json');
const logPath = path.resolve(process.cwd(), '.github/IR/heartbeat.log');

const status = {
    timestamp: new Date().toISOString(),
    agent: agent,
    current_task: task,
    target_file: file,
    status: 'ACTIVE'
};

// Écriture du statut "Live" (écrase le précédent)
fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));

// Ajout au log historique (pour audit)
const logEntry = `[${status.timestamp}] ${agent} | ${task} | ${file}\n`;
fs.appendFileSync(logPath, logEntry);

console.log(`💓 Pulse: ${agent} est sur ${task}...`);