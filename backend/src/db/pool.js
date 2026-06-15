import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const backendRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const isServerless = process.env.VERCEL === '1' || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

function resolveConnectionLimit() {
  const raw = process.env.DB_CONNECTION_LIMIT;
  if (raw != null && raw !== '') {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= 50) return n;
  }
  // Shared MySQL hosts (sql##### users) often allow only 3–5 connections total.
  return isServerless ? 2 : 10;
}

function resolveSsl() {
  const raw = process.env.DB_SSL_CA?.trim();
  if (!raw) return undefined;

  if (raw.startsWith('-----BEGIN')) {
    return { ca: raw, rejectUnauthorized: true };
  }

  const caPath = path.isAbsolute(raw) ? raw : path.join(backendRoot, raw);
  if (!fs.existsSync(caPath)) {
    console.warn(`DB_SSL_CA file not found (${caPath}); using SSL without CA verification`);
    return { rejectUnauthorized: false };
  }

  return { ca: fs.readFileSync(caPath), rejectUnauthorized: true };
}

const connectionLimit = resolveConnectionLimit();
const ssl = resolveSsl();

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'ipo_user',
  password: process.env.DB_PASSWORD || 'ipo_password',
  database: process.env.DB_NAME || 'ipo_team',
  waitForConnections: true,
  connectionLimit,
  queueLimit: 0,
  connectTimeout: 10000,
  idleTimeout: isServerless ? 10_000 : 60_000,
  maxIdle: isServerless ? 1 : connectionLimit,
  enableKeepAlive: !isServerless,
  keepAliveInitialDelay: 10_000,
  ...(ssl ? { ssl } : {}),
});

export async function warmPool() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}

export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
