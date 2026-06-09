import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { normalizeEmail, normalizePan, formatPan } from '../utils/validate.js';
import { writeAuditLog } from '../services/auditLogService.js';

const router = Router();

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

    const result = await withTransaction(async (conn) => {
      const [tenantResult] = await conn.query(
        `INSERT INTO tenants (name, status) VALUES (?, 'PENDING')`,
        [tenantName.trim()]
      );
      const tenantId = tenantResult.insertId;

      await conn.query(
        'INSERT INTO owner_wallets (tenant_id, balance) VALUES (?, 0)',
        [tenantId]
      );

      const hash = await bcrypt.hash(password, 10);
      const [userResult] = await conn.query(
        'INSERT INTO users (tenant_id, email, password_hash, role) VALUES (?, ?, ?, ?)',
        [tenantId, email, hash, 'owner']
      );

      return { userId: userResult.insertId, tenantId };
    });

    res.status(201).json({
      pending: true,
      message: 'Registration submitted. You will be able to sign in once a system administrator approves your account.',
      email,
      tenantName: tenantName.trim(),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;
    if (!password) throw new AppError('Password required');

    const [rows] = await pool.query(
      `SELECT u.id, u.tenant_id, u.password_hash, u.role, t.name as tenant_name, t.status as tenant_status,
              t.rejection_reason
       FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE u.email = ?`,
      [email]
    );
    if (!rows.length) throw new AppError('Invalid credentials', 401);

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new AppError('Invalid credentials', 401);

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
      `SELECT u.id, u.email, u.role, u.tenant_id, t.name as tenant_name, t.status as tenant_status
       FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE u.id = ?`,
      [payload.userId]
    );
    if (!rows.length) throw new AppError('User not found', 404);
    const u = rows[0];
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
