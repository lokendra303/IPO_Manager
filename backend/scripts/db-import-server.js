import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { truncateAllTables } from './db-truncate.js';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlFile = path.join(__dirname, '..', 'dumps', 'ipo_team_server.sql');

const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || '3306';
const user = process.env.DB_USER || 'ipo_user';
const password = process.env.DB_PASSWORD || '';
const database = process.env.DB_NAME || 'ipo_team';

if (!process.argv.includes('--yes')) {
  console.error('This REPLACES all data in the database configured in backend/.env');
  console.error(`Target: ${user}@${host}:${port}/${database}`);
  console.error('To confirm: node scripts/db-import-server.js --yes');
  process.exit(1);
}

if (!fs.existsSync(sqlFile)) {
  console.error(`Missing ${sqlFile} — run npm run db:export first`);
  process.exit(1);
}

const env = { ...process.env };
if (password) env.MYSQL_PWD = password;

console.log(`Importing into ${host}/${database} ...`);
console.log('Step 1/2: clearing existing data...');
await truncateAllTables();

console.log('Step 2/2: importing SQL dump...');
await new Promise((resolve, reject) => {
  const proc = spawn('mysql', [`-h${host}`, `-P${port}`, `-u${user}`, database], {
    env,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  const stream = fs.createReadStream(sqlFile);
  stream.pipe(proc.stdin);
  proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`mysql import failed (${code})`))));
  stream.on('error', reject);
  proc.stdin.on('error', reject);
});

console.log('Import completed successfully.');
