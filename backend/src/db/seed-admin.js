import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

async function seedAdmin() {
  const email = process.argv[2]?.trim().toLowerCase();
  const password = process.argv[3];
  const displayName = process.argv[4]?.trim() || 'System Admin';

  if (!email || !password) {
    console.error('Usage: npm run seed-admin -- <email> <password> [displayName]');
    process.exit(1);
  }
  if (password.length < 6) {
    console.error('Password must be at least 6 characters');
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
    const [existing] = await conn.query('SELECT id FROM system_admins WHERE email = ?', [email]);
    if (existing.length) {
      console.error(`Admin with email ${email} already exists`);
      process.exit(1);
    }

    const hash = await bcrypt.hash(password, 10);
    await conn.query(
      'INSERT INTO system_admins (email, password_hash, display_name) VALUES (?, ?, ?)',
      [email, hash, displayName]
    );
    console.log(`System admin created: ${email}`);
  } finally {
    await conn.end();
  }
}

seedAdmin().catch((err) => {
  console.error('Failed to create admin:', err.message);
  process.exit(1);
});
