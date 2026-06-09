import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(frontendDir, '..');
const backendDir = path.join(repoRoot, 'backend');

function run(cmd, cwd) {
  console.log(`> (${cwd}) ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}

function installAt(dir) {
  if (!existsSync(path.join(dir, 'package.json'))) {
    throw new Error(`package.json not found in ${dir}`);
  }
  run('npm install', dir);
}

if (existsSync(path.join(repoRoot, 'frontend/package.json')) && existsSync(path.join(repoRoot, 'backend/package.json'))) {
  installAt(path.join(repoRoot, 'frontend'));
  installAt(path.join(repoRoot, 'backend'));
} else if (existsSync(path.join(frontendDir, 'package.json')) && existsSync(path.join(backendDir, 'package.json'))) {
  installAt(frontendDir);
  installAt(backendDir);
} else {
  throw new Error(
    'Could not resolve frontend/backend paths. Set Vercel Root Directory to the repository root (leave blank).'
  );
}
