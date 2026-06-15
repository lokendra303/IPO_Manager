import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDbConnectionOptions } from './db-config.js';

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

export async function truncateAllTables() {
  const conn = await mysql.createConnection(getDbConnectionOptions());

  const dbName = process.env.DB_NAME || 'ipo_team';
  const [tables] = await conn.query(
    `SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
    [dbName]
  );

  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const { name } of tables) {
    await conn.query(`TRUNCATE TABLE \`${name}\``);
    console.log(`Truncated ${name}`);
  }
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  await conn.end();

  console.log(`Cleared ${tables.length} table(s).`);
}

if (isMain) {
  if (!process.argv.includes('--yes')) {
    console.error('Run: node scripts/db-truncate.js --yes');
    process.exit(1);
  }
  truncateAllTables().catch((err) => {
    console.error('Truncate failed:', err.message);
    process.exit(1);
  });
}
