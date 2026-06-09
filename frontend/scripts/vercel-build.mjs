import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(frontendDir, '..');

function run(cmd, cwd) {
  console.log(`> (${cwd}) ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}

function buildFrontend(dir) {
  if (!existsSync(path.join(dir, 'package.json'))) {
    throw new Error(`package.json not found in ${dir}`);
  }
  run('npm run build', dir);
}

if (existsSync(path.join(repoRoot, 'frontend/package.json'))) {
  buildFrontend(path.join(repoRoot, 'frontend'));
} else if (existsSync(path.join(frontendDir, 'package.json'))) {
  buildFrontend(frontendDir);
} else {
  throw new Error(
    'Could not resolve frontend path. Set Vercel Root Directory to the repository root (leave blank).'
  );
}
