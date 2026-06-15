import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { normalizeEmail } from '../utils/validate.js';
import { sendProfileChangeOtpEmail } from '../services/emailService.js';
import { createOtp, expiryFromNowMinutes } from '../utils/tokens.js';
import {
  storeProfileOtp,
  verifyProfileOtp,
  consumeProfileActionToken,
} from '../services/otpService.js';

const router = Router();

async function getUserWithTenant(userId, tenantId) {
  const [rows] = await pool.query(
    `SELECT u.id, u.email, u.password_hash, u.tenant_id, t.name as tenant_name
     FROM users u JOIN tenants t ON t.id = u.tenant_id
     WHERE u.id = ? AND u.tenant_id = ?`,
    [userId, tenantId]
  );
  if (!rows.length) throw new AppError('User not found', 404);
  return rows[0];
}

router.get('/account', async (req, res, next) => {
  try {
    const user = await getUserWithTenant(req.user.userId, req.tenantId);
    res.json({
      id: user.id,
      email: user.email,
      tenantId: user.tenant_id,
      tenantName: user.tenant_name,
      role: req.user.role,
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/team', async (req, res, next) => {
  try {
    const { tenantName } = req.body;
    if (!tenantName?.trim()) throw new AppError('Team name is required');

    const user = await getUserWithTenant(req.user.userId, req.tenantId);

    await pool.query('UPDATE tenants SET name = ? WHERE id = ?', [tenantName.trim(), req.tenantId]);

    res.json({
      id: user.id,
      email: user.email,
      tenantId: req.tenantId,
      tenantName: tenantName.trim(),
      role: req.user.role,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/send-otp', async (req, res, next) => {
  try {
    const user = await getUserWithTenant(req.user.userId, req.tenantId);
    const otp = createOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const otpExpires = expiryFromNowMinutes(10);

    await storeProfileOtp('manager', user.id, otpHash, otpExpires);
    await sendProfileChangeOtpEmail(user.email, otp);

    res.json({
      success: true,
      message: `Verification code sent to ${user.email}`,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/verify-otp', async (req, res, next) => {
  try {
    const actionToken = await verifyProfileOtp('manager', req.user.userId, req.body.otp);
    res.json({
      success: true,
      actionToken,
      message: 'Code verified. You can save your changes now.',
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/email', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const user = await getUserWithTenant(req.user.userId, req.tenantId);

    await consumeProfileActionToken('manager', user.id, req.body.actionToken);

    if (email === user.email) {
      throw new AppError('New email is the same as your current email');
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, user.id]);
    if (existing.length) throw new AppError('This email is already in use', 409);

    await pool.query('UPDATE users SET email = ? WHERE id = ?', [email, user.id]);

    res.json({
      id: user.id,
      email,
      tenantId: req.tenantId,
      tenantName: user.tenant_name,
      role: req.user.role,
    });
  } catch (err) {
    next(err);
  }
});

async function verifyPassword(passwordHash, password) {
  const valid = await bcrypt.compare(password, passwordHash);
  if (!valid) throw new AppError('Current password is incorrect', 401);
}

router.patch('/password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      throw new AppError('Current and new password are required');
    }
    if (newPassword.length < 6) {
      throw new AppError('New password must be at least 6 characters');
    }
    if (currentPassword === newPassword) {
      throw new AppError('New password must be different from current password');
    }

    const user = await getUserWithTenant(req.user.userId, req.tenantId);
    await consumeProfileActionToken('manager', user.id, req.body.actionToken);
    await verifyPassword(user.password_hash, currentPassword);

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
