/**
 * Import data from a phpMyAdmin / mysqldump SQL file into the current schema.
 * Skips CREATE TABLE / index / FK DDL — run `npm run migrate` first.
 *
 * Usage: node scripts/db-import-data.js [--file dumps/foo.sql] --yes
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { truncateAllTables } from './db-truncate.js';
import { getDbConnectionOptions } from './db-config.js';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function extractDataSql(raw) {
  const inserts = raw.match(/INSERT INTO[\s\S]*?;/gi) || [];
  const autoIncrements =
    raw.match(/ALTER TABLE `[^`]+`\s+MODIFY `id`[^;]+AUTO_INCREMENT=\d+;/gi) || [];

  const preamble = [
    'SET FOREIGN_KEY_CHECKS = 0;',
    'SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";',
    'SET AUTOCOMMIT = 0;',
    'START TRANSACTION;',
  ].join('\n');

  const postamble = ['COMMIT;', 'SET FOREIGN_KEY_CHECKS = 1;'].join('\n');

  return [preamble, ...inserts, ...autoIncrements, postamble].join('\n\n');
}

function resolveSqlFile() {
  const fileArg = process.argv.find((a) => a.startsWith('--file='));
  if (fileArg) return path.resolve(fileArg.slice('--file='.length));

  const defaultFile = path.join(__dirname, '..', 'dumps', 'ipo_team_server.sql');
  const freesqlFile = path.join(__dirname, '..', 'dumps', 'freesqldatabase_export.sql');
  if (fs.existsSync(freesqlFile)) return freesqlFile;
  return defaultFile;
}

const sqlFile = resolveSqlFile();
const host = process.env.DB_HOST || 'localhost';
const database = process.env.DB_NAME || 'ipo_team';

if (!process.argv.includes('--yes')) {
  console.error('This REPLACES all data in the database configured in backend/.env');
  console.error(`Target: ${host}/${database}`);
  console.error(`Source: ${sqlFile}`);
  console.error('To confirm: node scripts/db-import-data.js --yes');
  console.error('Optional: --file=dumps/your_dump.sql');
  process.exit(1);
}

if (!fs.existsSync(sqlFile)) {
  console.error(`Missing SQL file: ${sqlFile}`);
  process.exit(1);
}

const raw = fs.readFileSync(sqlFile, 'utf8');
const dataSql = extractDataSql(raw);

console.log(`Importing data from ${path.basename(sqlFile)} into ${host}/${database} ...`);
console.log(`Found ${(raw.match(/INSERT INTO/gi) || []).length} INSERT statement(s).`);

console.log('Step 1/2: clearing existing data...');
await truncateAllTables();

console.log('Step 2/2: importing rows...');
const conn = await mysql.createConnection(getDbConnectionOptions());
try {
  await conn.query(dataSql);
  console.log('Import completed successfully.');
} finally {
  await conn.end();
}
