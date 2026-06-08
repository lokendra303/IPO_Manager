import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dumpsDir = path.join(__dirname, '..', 'dumps');

const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || '3306';
const user = process.env.DB_USER || 'ipo_user';
const password = process.env.DB_PASSWORD || '';
const database = process.env.DB_NAME || 'ipo_team';

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outFile = path.join(dumpsDir, `ipo_team_${stamp}.sql`);
const latestFile = path.join(dumpsDir, 'ipo_team_latest.sql');
const serverFile = path.join(dumpsDir, 'ipo_team_server.sql');

/** MySQL 5.7 / MariaDB / shared hosting — no JSON type, no 8.0 collation, no DESC indexes */
function makeServerCompatible(sql) {
  return sql
    .replace(/\bjson\b/gi, 'longtext')
    .replace(/utf8mb4_0900_ai_ci/g, 'utf8mb4_unicode_ci')
    .replace(/,`created_at` DESC\)/g, ',`created_at`)')
    .replace(/DEFAULT \(_utf8mb4'(\[[^\]]*\])'\)/g, "DEFAULT '$1'")
  // MySQL 5.5/5.6: only one TIMESTAMP may use CURRENT_TIMESTAMP per table
    .replace(
      /`updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP/gi,
      '`updated_at` datetime DEFAULT NULL'
    )
    .replace(
      /`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP/gi,
      '`updated_at` datetime DEFAULT NULL'
    )
    // utf8mb4 unique index max 767 bytes on older InnoDB → email keys use 191 chars
    .replace(/`email` varchar\(255\) NOT NULL/gi, '`email` varchar(191) NOT NULL');
}

if (!fs.existsSync(dumpsDir)) {
  fs.mkdirSync(dumpsDir, { recursive: true });
}

const args = [
  `-h${host}`,
  `-P${port}`,
  `-u${user}`,
  `--single-transaction`,
  `--routines`,
  `--triggers`,
  `--set-gtid-purged=OFF`,
  `--column-statistics=0`,
  `--default-character-set=utf8mb4`,
  database,
];

const env = { ...process.env };
if (password) env.MYSQL_PWD = password;

console.log(`Exporting "${database}" from ${host}:${port} ...`);

const proc = spawn('mysqldump', args, { env, stdio: ['ignore', 'pipe', 'pipe'] });

let stdout = '';
let stderr = '';
proc.stdout.on('data', (chunk) => {
  stdout += chunk.toString();
});
proc.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

proc.on('close', (code) => {
  if (code !== 0) {
    console.error('Export failed:', stderr || `exit code ${code}`);
    process.exit(1);
  }

  fs.writeFileSync(outFile, stdout, 'utf8');
  fs.copyFileSync(outFile, latestFile);

  const serverSql = makeServerCompatible(stdout);
  fs.writeFileSync(serverFile, serverSql, 'utf8');

  const sizeMb = (fs.statSync(outFile).size / (1024 * 1024)).toFixed(2);
  console.log(`Done: ${outFile}`);
  console.log(`Local copy: ${latestFile}`);
  console.log(`Server/phpMyAdmin import: ${serverFile}`);
  console.log(`Size: ${sizeMb} MB`);
  console.log('\nFor shared hosting / older MySQL: import ipo_team_server.sql (not ipo_team_latest.sql)');
});
