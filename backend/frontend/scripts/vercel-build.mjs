import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import '../../../frontend/scripts/vercel-build.mjs';

// Vercel Root Directory is `backend`; output must stay inside that folder.
const shimDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(shimDir, '../..');
const repoRoot = path.resolve(backendDir, '..');
const builtDist = path.join(repoRoot, 'frontend', 'dist');
const vercelDist = path.join(backendDir, 'frontend', 'dist');

if (!existsSync(builtDist)) {
  throw new Error(`Build output not found at ${builtDist}`);
}

rmSync(vercelDist, { recursive: true, force: true });
mkdirSync(vercelDist, { recursive: true });
cpSync(builtDist, vercelDist, { recursive: true });
console.log(`> Copied frontend dist to ${vercelDist}`);
