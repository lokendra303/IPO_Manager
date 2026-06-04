/**
 * Wipe all rows from every table in the app database (schema kept).
 * You must register your team again after this.
 *
 * Usage: npm run truncate -- --yes
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function truncateAll() {
  if (!process.argv.includes('--yes')) {
    console.error('This deletes ALL data (members, IPOs, logins, everything).');
    console.error('To confirm, run: npm run truncate -- --yes');
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'ipo_user',
    password: process.env.DB_PASSWORD || 'ipo_password',
    database: process.env.DB_NAME || 'ipo_team',
  });

  try {
    const dbName = process.env.DB_NAME || 'ipo_team';
    const [tables] = await conn.query(
      `SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME`,
      [dbName]
    );

    if (!tables.length) {
      console.log('No tables found. Run npm run migrate first.');
      return;
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const { name } of tables) {
      await conn.query(`TRUNCATE TABLE \`${name}\``);
      console.log(`Truncated ${name}`);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log(`\nDone. ${tables.length} table(s) cleared in "${dbName}".`);
    console.log('Register a new team at the app login screen to start fresh.');
  } finally {
    await conn.end();
  }
}

truncateAll().catch((err) => {
  console.error('Truncate failed:', err.message);
  process.exit(1);
});
