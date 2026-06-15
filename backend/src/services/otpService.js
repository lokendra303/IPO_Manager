import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { createSecureToken, expiryFromNowMinutes } from '../utils/tokens.js';

const ACCOUNT = {
  manager: { table: 'users', idColumn: 'id', emailColumn: 'email' },
  admin: { table: 'system_admins', idColumn: 'id', emailColumn: 'email' },
};

function getAccount(kind) {
  const cfg = ACCOUNT[kind];
  if (!cfg) throw new Error(`Unknown account kind: ${kind}`);
  return cfg;
}

export function validateOtpInput(otp) {
  const code = String(otp || '').trim();
  if (!code) throw new AppError('Verification code is required', 400);
  if (!/^\d{6}$/.test(code)) throw new AppError('Enter the 6-digit verification code', 400);
  return code;
}

export async function storePasswordResetOtp(kind, id, otpHash, otpExpires) {
  const { table, idColumn } = getAccount(kind);
  await pool.query(
    `UPDATE ${table}
     SET password_reset_otp_hash = ?,
         password_reset_otp_expires = ?,
         password_reset_token = NULL,
         password_reset_expires = NULL
     WHERE ${idColumn} = ?`,
    [otpHash, otpExpires, id]
  );
}

export async function verifyPasswordResetOtp(kind, email, otp) {
  const code = validateOtpInput(otp);
  const { table, idColumn, emailColumn } = getAccount(kind);

  const [rows] = await pool.query(
    `SELECT ${idColumn} AS id, password_reset_otp_hash, password_reset_otp_expires
     FROM ${table} WHERE ${emailColumn} = ?`,
    [email]
  );
  if (!rows.length || !rows[0].password_reset_otp_hash) {
    throw new AppError('Invalid or expired verification code', 400);
  }

  const row = rows[0];
  if (row.password_reset_otp_expires && new Date(row.password_reset_otp_expires) < new Date()) {
    throw new AppError('Verification code has expired. Request a new code.', 400);
  }

  const valid = await bcrypt.compare(code, row.password_reset_otp_hash);
  if (!valid) throw new AppError('Invalid verification code', 400);

  const resetToken = createSecureToken();
  const resetExpires = expiryFromNowMinutes(15);

  await pool.query(
    `UPDATE ${table}
     SET password_reset_otp_hash = NULL,
         password_reset_otp_expires = NULL,
         password_reset_token = ?,
         password_reset_expires = ?
     WHERE ${idColumn} = ?`,
    [resetToken, resetExpires, row.id]
  );

  return { id: row.id, resetToken };
}

export async function consumePasswordResetToken(kind, resetToken) {
  const token = String(resetToken || '').trim();
  if (!token) throw new AppError('Reset session expired. Start again from forgot password.', 400);

  const { table, idColumn } = getAccount(kind);
  const [rows] = await pool.query(
    `SELECT ${idColumn} AS id, password_reset_expires FROM ${table} WHERE password_reset_token = ?`,
    [token]
  );
  if (!rows.length) throw new AppError('Reset session expired. Start again from forgot password.', 400);

  const row = rows[0];
  if (row.password_reset_expires && new Date(row.password_reset_expires) < new Date()) {
    throw new AppError('Reset session expired. Start again from forgot password.', 400);
  }

  return row.id;
}

export async function clearPasswordResetFields(kind, id) {
  const { table, idColumn } = getAccount(kind);
  await pool.query(
    `UPDATE ${table}
     SET password_reset_token = NULL,
         password_reset_expires = NULL,
         password_reset_otp_hash = NULL,
         password_reset_otp_expires = NULL
     WHERE ${idColumn} = ?`,
    [id]
  );
}

export async function storeProfileOtp(kind, id, otpHash, otpExpires) {
  const { table, idColumn } = getAccount(kind);
  await pool.query(
    `UPDATE ${table}
     SET profile_otp_hash = ?,
         profile_otp_expires = ?,
         profile_action_token = NULL,
         profile_action_expires = NULL
     WHERE ${idColumn} = ?`,
    [otpHash, otpExpires, id]
  );
}

export async function verifyProfileOtp(kind, id, otp) {
  const code = validateOtpInput(otp);
  const { table, idColumn } = getAccount(kind);

  const [rows] = await pool.query(
    `SELECT profile_otp_hash, profile_otp_expires FROM ${table} WHERE ${idColumn} = ?`,
    [id]
  );
  if (!rows.length || !rows[0].profile_otp_hash) {
    throw new AppError('Invalid or expired verification code', 400);
  }

  const row = rows[0];
  if (row.profile_otp_expires && new Date(row.profile_otp_expires) < new Date()) {
    throw new AppError('Verification code has expired. Request a new code.', 400);
  }

  const valid = await bcrypt.compare(code, row.profile_otp_hash);
  if (!valid) throw new AppError('Invalid verification code', 400);

  const actionToken = createSecureToken();
  const actionExpires = expiryFromNowMinutes(15);

  await pool.query(
    `UPDATE ${table}
     SET profile_otp_hash = NULL,
         profile_otp_expires = NULL,
         profile_action_token = ?,
         profile_action_expires = ?
     WHERE ${idColumn} = ?`,
    [actionToken, actionExpires, id]
  );

  return actionToken;
}

export async function consumeProfileActionToken(kind, id, actionToken) {
  const token = String(actionToken || '').trim();
  if (!token) throw new AppError('Verification required. Send and enter the code from your email.', 400);

  const { table, idColumn } = getAccount(kind);
  const [rows] = await pool.query(
    `SELECT profile_action_expires FROM ${table} WHERE ${idColumn} = ? AND profile_action_token = ?`,
    [id, token]
  );
  if (!rows.length) {
    throw new AppError('Verification expired. Send a new code and try again.', 400);
  }
  if (rows[0].profile_action_expires && new Date(rows[0].profile_action_expires) < new Date()) {
    throw new AppError('Verification expired. Send a new code and try again.', 400);
  }

  await pool.query(
    `UPDATE ${table}
     SET profile_action_token = NULL, profile_action_expires = NULL
     WHERE ${idColumn} = ?`,
    [id]
  );
}
