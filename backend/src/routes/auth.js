import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { normalizeEmail, normalizePan, formatPan } from '../utils/validate.js';
import { writeAuditLog } from '../services/auditLogService.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/emailService.js';
import { createSecureToken, expiryFromNow } from '../utils/tokens.js';

const router = Router();

const GENERIC_RESET_MESSAGE =
  'If an account exists for that email, a password reset link has been sent.';

async function findUserByEmail(email) {
  const [rows] = await pool.query(
    `SELECT u.id, u.email, u.password_hash, u.role, u.tenant_id, u.email_verified_at,
            t.name AS tenant_name, t.status AS tenant_status, t.rejection_reason
     FROM users u
     JOIN tenants t ON t.id = u.tenant_id
     WHERE u.email = ?`,
    [email]
  );
  return rows[0] || null;
}

router.post('/register', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { password, tenantName } = req.body;
    if (!password || !tenantName?.trim()) {
      throw new AppError('Password and team name are required');
    }
    if (password.length < 6) {
      throw new AppError('Password must be at least 6 characters');
    }

    const [existing] = await pool.query(
      `SELECT u.id, t.status AS tenant_status FROM users u
       JOIN tenants t ON t.id = u.tenant_id WHERE u.email = ?`,
      [email]
    );
    if (existing.length) {
      if (existing[0].tenant_status === 'PENDING') {
        throw new AppError('A registration with this email is already pending approval', 409);
      }
      throw new AppError('Email already registered', 409);
    }

    const verificationToken = createSecureToken();
    const verificationExpires = expiryFromNow(24);

    const result = await withTransaction(async (conn) => {
      const [tenantResult] = await conn.query(
        `INSERT INTO tenants (name, status) VALUES (?, 'PENDING')`,
        [tenantName.trim()]
      );
      const tenantId = tenantResult.insertId;

      await conn.query('INSERT INTO owner_wallets (tenant_id, balance) VALUES (?, 0)', [tenantId]);

      const hash = await bcrypt.hash(password, 10);
      const [userResult] = await conn.query(
        `INSERT INTO users (
           tenant_id, email, password_hash, role,
           email_verification_token, email_verification_expires
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [tenantId, email, hash, 'owner', verificationToken, verificationExpires]
      );

      return { userId: userResult.insertId, tenantId };
    });

    await sendVerificationEmail(email, verificationToken);

    res.status(201).json({
      pending: true,
      emailVerificationRequired: true,
      message:
        'Registration submitted. Check your email to confirm your address. You can sign in once your email is verified and a system administrator approves your account.',
      email,
      tenantName: tenantName.trim(),
      userId: result.userId,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/verify-email', async (req, res, next) => {
  try {
    const token = String(req.query.token || '').trim();
    if (!token) throw new AppError('Verification token is required', 400);

    const [rows] = await pool.query(
      `SELECT id, email, email_verification_expires
       FROM users
       WHERE email_verification_token = ?`,
      [token]
    );
    if (!rows.length) throw new AppError('Invalid or expired verification link', 400);

    const user = rows[0];
    if (user.email_verification_expires && new Date(user.email_verification_expires) < new Date()) {
      throw new AppError('Verification link has expired. Request a new confirmation email.', 400);
    }

    await pool.query(
      `UPDATE users
       SET email_verified_at = NOW(),
           email_verification_token = NULL,
           email_verification_expires = NULL
       WHERE id = ?`,
      [user.id]
    );

    res.json({
      success: true,
      message: 'Email verified successfully. You can sign in once your account is approved by an administrator.',
      email: user.email,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/resend-verification', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const [rows] = await pool.query(
      `SELECT u.id, u.email_verified_at
       FROM users u
       WHERE u.email = ?`,
      [email]
    );

    if (!rows.length || rows[0].email_verified_at) {
      return res.json({
        success: true,
        message: 'If your account needs verification, a new confirmation email has been sent.',
      });
    }

    const verificationToken = createSecureToken();
    const verificationExpires = expiryFromNow(24);

    await pool.query(
      `UPDATE users
       SET email_verification_token = ?, email_verification_expires = ?
       WHERE id = ?`,
      [verificationToken, verificationExpires, rows[0].id]
    );

    await sendVerificationEmail(email, verificationToken);

    res.json({
      success: true,
      message: 'If your account needs verification, a new confirmation email has been sent.',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const user = await findUserByEmail(email);

    if (user) {
      const resetToken = createSecureToken();
      const resetExpires = expiryFromNow(1);

      await pool.query(
        `UPDATE users
         SET password_reset_token = ?, password_reset_expires = ?
         WHERE id = ?`,
        [resetToken, resetExpires, user.id]
      );

      await sendPasswordResetEmail(email, resetToken);
    }

    res.json({ success: true, message: GENERIC_RESET_MESSAGE });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const token = String(req.body.token || '').trim();
    const { password } = req.body;

    if (!token) throw new AppError('Reset token is required', 400);
    if (!password) throw new AppError('New password is required', 400);
    if (password.length < 6) throw new AppError('Password must be at least 6 characters', 400);

    const [rows] = await pool.query(
      `SELECT id, password_reset_expires FROM users WHERE password_reset_token = ?`,
      [token]
    );
    if (!rows.length) throw new AppError('Invalid or expired reset link', 400);

    const user = rows[0];
    if (user.password_reset_expires && new Date(user.password_reset_expires) < new Date()) {
      throw new AppError('Reset link has expired. Request a new password reset email.', 400);
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `UPDATE users
       SET password_hash = ?,
           password_reset_token = NULL,
           password_reset_expires = NULL
       WHERE id = ?`,
      [hash, user.id]
    );

    res.json({ success: true, message: 'Password updated successfully. You can now sign in.' });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;
    if (!password) throw new AppError('Password required');

    const user = await findUserByEmail(email);
    if (!user) throw new AppError('Invalid credentials', 401);

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new AppError('Invalid credentials', 401);

    if (!user.email_verified_at) {
      throw new AppError(
        'Please confirm your email before signing in. Check your inbox or request a new confirmation email.',
        403
      );
    }

    if (user.tenant_status === 'PENDING') {
      throw new AppError('Your account is pending administrator approval. Please try again later.', 403);
    }
    if (user.tenant_status === 'REJECTED') {
      const reason = user.rejection_reason || 'Contact the system administrator for details.';
      throw new AppError(`Registration was rejected: ${reason}`, 403);
    }
    if (user.tenant_status === 'DISABLED') {
      throw new AppError('Your team account has been disabled by the system administrator.', 403);
    }

    const token = jwt.sign(
      { userId: user.id, tenantId: user.tenant_id, role: user.role },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: '7d' }
    );

    await writeAuditLog({
      tenantId: user.tenant_id,
      actorType: 'manager',
      actorId: user.id,
      actorLabel: email,
      action: 'AUTH_LOGIN',
      summary: 'Manager signed in',
      ipAddress: req.ip,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email,
        tenantId: user.tenant_id,
        tenantName: user.tenant_name,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/member-login', async (req, res, next) => {
  try {
    const pan = normalizePan(req.body.pan);

    const [rows] = await pool.query(
      `SELECT m.id, m.tenant_id, m.display_name, m.pan, m.status, t.name AS tenant_name, t.status AS tenant_status
       FROM members m
       JOIN tenants t ON t.id = m.tenant_id
       WHERE UPPER(m.pan) = ? AND m.status = 'ACTIVE'`,
      [pan]
    );

    if (!rows.length) throw new AppError('No active member found with this PAN', 401);
    if (rows.length > 1) {
      throw new AppError('This PAN is registered with multiple teams. Contact your manager.', 401);
    }

    const member = rows[0];
    if (member.tenant_status === 'DISABLED') {
      throw new AppError('This team has been disabled. Contact your manager.', 403);
    }
    if (member.tenant_status !== 'APPROVED') {
      throw new AppError('This team is not yet active. Contact your manager.', 403);
    }
    const token = jwt.sign(
      { memberId: member.id, tenantId: member.tenant_id, role: 'member' },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: '7d' }
    );

    await writeAuditLog({
      tenantId: member.tenant_id,
      actorType: 'member',
      actorId: member.id,
      actorLabel: member.display_name,
      action: 'AUTH_MEMBER_LOGIN',
      entityType: 'member',
      entityId: member.id,
      summary: `Member signed in (${member.pan})`,
      ipAddress: req.ip,
    });

    res.json({
      token,
      user: {
        id: member.id,
        memberId: member.id,
        displayName: member.display_name,
        pan: formatPan(member.pan),
        tenantId: member.tenant_id,
        tenantName: member.tenant_name,
        role: 'member',
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new AppError('Unauthorized', 401);
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET || 'dev-secret');

    if (payload.role === 'member') {
      const [rows] = await pool.query(
        `SELECT m.id, m.display_name, m.pan, m.tenant_id, m.status, t.name AS tenant_name, t.status AS tenant_status
         FROM members m
         JOIN tenants t ON t.id = m.tenant_id
         WHERE m.id = ? AND m.tenant_id = ?`,
        [payload.memberId, payload.tenantId]
      );
      if (!rows.length) throw new AppError('Member not found', 404);
      const m = rows[0];
      if (m.status !== 'ACTIVE') throw new AppError('Member account is inactive', 403);
      if (m.tenant_status === 'DISABLED') throw new AppError('Team account disabled', 403);
      return res.json({
        id: m.id,
        memberId: m.id,
        displayName: m.display_name,
        pan: formatPan(m.pan),
        tenantId: m.tenant_id,
        tenantName: m.tenant_name,
        role: 'member',
      });
    }

    const [rows] = await pool.query(
      `SELECT u.id, u.email, u.role, u.tenant_id, u.email_verified_at, t.name as tenant_name, t.status as tenant_status
       FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE u.id = ?`,
      [payload.userId]
    );
    if (!rows.length) throw new AppError('User not found', 404);
    const u = rows[0];
    if (!u.email_verified_at) {
      throw new AppError('Email not verified', 403);
    }
    if (u.tenant_status === 'PENDING') {
      throw new AppError('Account pending approval', 403);
    }
    if (u.tenant_status === 'REJECTED') {
      throw new AppError('Account rejected', 403);
    }
    if (u.tenant_status === 'DISABLED') {
      throw new AppError('Account disabled', 403);
    }
    res.json({
      id: u.id,
      email: u.email,
      role: u.role,
      tenantId: u.tenant_id,
      tenantName: u.tenant_name,
    });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new AppError('Invalid or expired token', 401));
    }
    next(err);
  }
});

export default router;
