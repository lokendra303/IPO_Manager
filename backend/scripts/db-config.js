import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const backendRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function resolveSsl() {
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

export function getDbConnectionOptions(overrides = {}) {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'ipo_user',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ipo_team',
    multipleStatements: true,
  ...(resolveSsl() ? { ssl: resolveSsl() } : {}),
    ...overrides,
  };
}
