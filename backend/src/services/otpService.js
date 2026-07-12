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

export async function storeEmailVerificationOtp(userId, otpHash, otpExpires) {
  await pool.query(
    `UPDATE users
     SET email_verification_token = ?,
         email_verification_expires = ?
     WHERE id = ?`,
    [otpHash, otpExpires, userId]
  );
}

export async function verifyEmailVerificationOtp(email, otp) {
  const code = validateOtpInput(otp);

  const [rows] = await pool.query(
    `SELECT id, email, email_verified_at, email_verification_token, email_verification_expires
     FROM users WHERE email = ?`,
    [email]
  );
  if (!rows.length) {
    throw new AppError('Invalid or expired verification code', 400);
  }

  const user = rows[0];
  if (user.email_verified_at) {
    return { id: user.id, email: user.email, alreadyVerified: true };
  }
  if (!user.email_verification_token) {
    throw new AppError('Invalid or expired verification code', 400);
  }
  if (user.email_verification_expires && new Date(user.email_verification_expires) < new Date()) {
    throw new AppError('Verification code has expired. Request a new code.', 400);
  }

  const valid = await bcrypt.compare(code, user.email_verification_token);
  if (!valid) throw new AppError('Invalid verification code', 400);

  await pool.query(
    `UPDATE users
     SET email_verified_at = NOW(),
         email_verification_token = NULL,
         email_verification_expires = NULL
     WHERE id = ?`,
    [user.id]
  );

  return { id: user.id, email: user.email, alreadyVerified: false };
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
         profile_pending_email = NULL,
         profile_new_email_otp_hash = NULL,
         profile_new_email_otp_expires = NULL,
         profile_action_token = NULL,
         profile_action_expires = NULL
     WHERE ${idColumn} = ?`,
    [otpHash, otpExpires, id]
  );
}

export async function storeEmailChangeOtps(kind, id, pendingEmail, currentOtpHash, newOtpHash, otpExpires) {
  const { table, idColumn } = getAccount(kind);
  await pool.query(
    `UPDATE ${table}
     SET profile_pending_email = ?,
         profile_otp_hash = ?,
         profile_otp_expires = ?,
         profile_new_email_otp_hash = ?,
         profile_new_email_otp_expires = ?,
         profile_action_token = NULL,
         profile_action_expires = NULL
     WHERE ${idColumn} = ?`,
    [pendingEmail, currentOtpHash, otpExpires, newOtpHash, otpExpires, id]
  );
}

export async function verifyEmailChangeOtps(kind, id, pendingEmail, currentOtp, newOtp) {
  const currentCode = validateOtpInput(currentOtp);
  const newCode = validateOtpInput(newOtp);
  const { table, idColumn } = getAccount(kind);

  const [rows] = await pool.query(
    `SELECT profile_pending_email, profile_otp_hash, profile_otp_expires,
            profile_new_email_otp_hash, profile_new_email_otp_expires
     FROM ${table} WHERE ${idColumn} = ?`,
    [id]
  );
  if (!rows.length || !rows[0].profile_pending_email) {
    throw new AppError('Send verification codes for your new email first', 400);
  }

  const row = rows[0];
  if (row.profile_pending_email !== pendingEmail) {
    throw new AppError('New email changed. Send verification codes again.', 400);
  }
  if (!row.profile_otp_hash || !row.profile_new_email_otp_hash) {
    throw new AppError('Send verification codes for your new email first', 400);
  }

  const expired =
    (row.profile_otp_expires && new Date(row.profile_otp_expires) < new Date()) ||
    (row.profile_new_email_otp_expires && new Date(row.profile_new_email_otp_expires) < new Date());
  if (expired) {
    throw new AppError('Verification codes have expired. Send new codes.', 400);
  }

  const currentValid = await bcrypt.compare(currentCode, row.profile_otp_hash);
  const newValid = await bcrypt.compare(newCode, row.profile_new_email_otp_hash);
  if (!currentValid || !newValid) {
    throw new AppError('Invalid verification code. Check both codes and try again.', 400);
  }

  const actionToken = createSecureToken();
  const actionExpires = expiryFromNowMinutes(15);

  await pool.query(
    `UPDATE ${table}
     SET profile_otp_hash = NULL,
         profile_otp_expires = NULL,
         profile_new_email_otp_hash = NULL,
         profile_new_email_otp_expires = NULL,
         profile_action_token = ?,
         profile_action_expires = ?
     WHERE ${idColumn} = ?`,
    [actionToken, actionExpires, id]
  );

  return actionToken;
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
     SET profile_action_token = NULL,
         profile_action_expires = NULL,
         profile_pending_email = NULL,
         profile_new_email_otp_hash = NULL,
         profile_new_email_otp_expires = NULL
     WHERE ${idColumn} = ?`,
    [id]
  );
}

export async function assertPendingEmail(kind, id, email) {
  const { table, idColumn } = getAccount(kind);
  const [rows] = await pool.query(
    `SELECT profile_pending_email FROM ${table} WHERE ${idColumn} = ?`,
    [id]
  );
  if (!rows.length || rows[0].profile_pending_email !== email) {
    throw new AppError('Email verification expired. Send codes again for your new email.', 400);
  }
}
