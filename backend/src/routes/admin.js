import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { normalizeEmail } from '../utils/validate.js';
import { systemAdminMiddleware } from '../middleware/systemAdmin.js';
import { ACTION_LABELS, labelForAction } from '../constants/auditActions.js';
import { getTenantFullDetails } from '../services/adminTenantService.js';
import {
  AUDIT_LOG_RETENTION_DAYS,
  countAuditLogsOlderThan,
  deleteAuditLogsOlderThan,
  writeAuditLog,
} from '../services/auditLogService.js';
import {
  sendAdminPasswordOtpEmail,
  sendProfileChangeOtpEmail,
  sendCurrentEmailChangeOtpEmail,
  sendNewEmailChangeOtpEmail,
} from '../services/emailService.js';
import { createOtp, expiryFromNowMinutes } from '../utils/tokens.js';
import {
  storePasswordResetOtp,
  verifyPasswordResetOtp,
  consumePasswordResetToken,
  clearPasswordResetFields,
  storeProfileOtp,
  storeEmailChangeOtps,
  verifyProfileOtp,
  verifyEmailChangeOtps,
  consumeProfileActionToken,
  assertPendingEmail,
} from '../services/otpService.js';

function parseRetentionDays(value) {
  const days = Number(value) || AUDIT_LOG_RETENTION_DAYS;
  if (!Number.isInteger(days) || days < 1 || days > 365) return AUDIT_LOG_RETENTION_DAYS;
  return days;
}

const GENERIC_ADMIN_RESET_MESSAGE =
  'If an administrator account exists for that email, a verification code has been sent.';

const router = Router();

router.post('/auth/login', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;
    if (!password) throw new AppError('Password required');

    const [rows] = await pool.query(
      'SELECT id, email, password_hash, display_name FROM system_admins WHERE email = ?',
      [email]
    );
    if (!rows.length) throw new AppError('Invalid credentials', 401);

    const admin = rows[0];
    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) throw new AppError('Invalid credentials', 401);

    const token = jwt.sign(
      { adminId: admin.id, email: admin.email, role: 'system_admin' },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: admin.id,
        email: admin.email,
        displayName: admin.display_name,
        role: 'system_admin',
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/auth/forgot-password', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const [rows] = await pool.query('SELECT id FROM system_admins WHERE email = ?', [email]);

    if (rows.length) {
      const otp = createOtp();
      const otpHash = await bcrypt.hash(otp, 10);
      const otpExpires = expiryFromNowMinutes(10);
      await storePasswordResetOtp('admin', rows[0].id, otpHash, otpExpires);
      await sendAdminPasswordOtpEmail(email, otp);
    }

    res.json({ success: true, message: GENERIC_ADMIN_RESET_MESSAGE });
  } catch (err) {
    next(err);
  }
});

router.post('/auth/verify-otp', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { resetToken } = await verifyPasswordResetOtp('admin', email, req.body.otp);

    res.json({
      success: true,
      resetToken,
      message: 'Verification successful. You can now set a new password.',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/auth/reset-password', async (req, res, next) => {
  try {
    const resetToken = String(req.body.resetToken || '').trim();
    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword) {
      throw new AppError('New password and confirmation are required', 400);
    }
    if (password !== confirmPassword) {
      throw new AppError('New password and confirmation do not match', 400);
    }
    if (password.length < 6) throw new AppError('Password must be at least 6 characters', 400);

    const adminId = await consumePasswordResetToken('admin', resetToken);
    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE system_admins SET password_hash = ? WHERE id = ?', [hash, adminId]);
    await clearPasswordResetFields('admin', adminId);

    res.json({ success: true, message: 'Password updated successfully. You can now sign in.' });
  } catch (err) {
    next(err);
  }
});

async function getAdminById(adminId) {
  const [rows] = await pool.query(
    'SELECT id, email, password_hash, display_name FROM system_admins WHERE id = ?',
    [adminId]
  );
  if (!rows.length) throw new AppError('Admin not found', 404);
  return rows[0];
}

function adminProfile(admin) {
  return {
    id: admin.id,
    email: admin.email,
    displayName: admin.display_name,
    role: 'system_admin',
  };
}

router.get('/auth/me', systemAdminMiddleware, async (req, res, next) => {
  try {
    const admin = await getAdminById(req.admin.adminId);
    res.json(adminProfile(admin));
  } catch (err) {
    next(err);
  }
});

router.post('/profile/send-password-otp', systemAdminMiddleware, async (req, res, next) => {
  try {
    const admin = await getAdminById(req.admin.adminId);
    const otp = createOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const otpExpires = expiryFromNowMinutes(10);

    await storeProfileOtp('admin', admin.id, otpHash, otpExpires);
    await sendProfileChangeOtpEmail(admin.email, otp);

    res.json({
      success: true,
      message: `Verification code sent to ${admin.email}`,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/profile/verify-password-otp', systemAdminMiddleware, async (req, res, next) => {
  try {
    const actionToken = await verifyProfileOtp('admin', req.admin.adminId, req.body.otp);
    res.json({
      success: true,
      actionToken,
      message: 'Code verified. You can update your password now.',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/profile/send-email-change-otp', systemAdminMiddleware, async (req, res, next) => {
  try {
    const newEmail = normalizeEmail(req.body.newEmail);
    const admin = await getAdminById(req.admin.adminId);

    if (newEmail === admin.email) {
      throw new AppError('New email is the same as your current email');
    }
    const [existing] = await pool.query(
      'SELECT id FROM system_admins WHERE email = ? AND id != ?',
      [newEmail, admin.id]
    );
    if (existing.length) throw new AppError('This email is already in use', 409);

    const currentOtp = createOtp();
    const newOtp = createOtp();
    const currentHash = await bcrypt.hash(currentOtp, 10);
    const newHash = await bcrypt.hash(newOtp, 10);
    const otpExpires = expiryFromNowMinutes(10);

    await storeEmailChangeOtps('admin', admin.id, newEmail, currentHash, newHash, otpExpires);
    await Promise.all([
      sendCurrentEmailChangeOtpEmail(admin.email, currentOtp),
      sendNewEmailChangeOtpEmail(newEmail, newOtp),
    ]);

    res.json({
      success: true,
      message: `Verification codes sent to ${admin.email} and ${newEmail}`,
      currentEmail: admin.email,
      newEmail,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/profile/verify-email-change-otp', systemAdminMiddleware, async (req, res, next) => {
  try {
    const newEmail = normalizeEmail(req.body.newEmail);
    const actionToken = await verifyEmailChangeOtps(
      'admin',
      req.admin.adminId,
      newEmail,
      req.body.currentOtp,
      req.body.newOtp
    );

    res.json({
      success: true,
      actionToken,
      message: 'Both emails verified. You can save your new email now.',
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/profile/email', systemAdminMiddleware, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const admin = await getAdminById(req.admin.adminId);

    await assertPendingEmail('admin', admin.id, email);
    await consumeProfileActionToken('admin', admin.id, req.body.actionToken);

    if (email === admin.email) {
      throw new AppError('New email is the same as your current email');
    }

    const [existing] = await pool.query(
      'SELECT id FROM system_admins WHERE email = ? AND id != ?',
      [email, admin.id]
    );
    if (existing.length) throw new AppError('This email is already in use', 409);

    await pool.query('UPDATE system_admins SET email = ? WHERE id = ?', [email, admin.id]);

    res.json(adminProfile({ ...admin, email }));
  } catch (err) {
    next(err);
  }
});

router.patch('/profile/password', systemAdminMiddleware, async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmPassword) {
      throw new AppError('Current password, new password, and confirmation are required');
    }
    if (newPassword !== confirmPassword) {
      throw new AppError('New password and confirmation do not match');
    }
    if (newPassword.length < 6) {
      throw new AppError('New password must be at least 6 characters');
    }
    if (currentPassword === newPassword) {
      throw new AppError('New password must be different from current password');
    }

    const admin = await getAdminById(req.admin.adminId);
    await consumeProfileActionToken('admin', admin.id, req.body.actionToken);
    const valid = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!valid) throw new AppError('Current password is incorrect', 401);

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE system_admins SET password_hash = ? WHERE id = ?', [hash, admin.id]);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
});

router.get('/dashboard', systemAdminMiddleware, async (_req, res, next) => {
  try {
    const [stats] = await pool.query(
      `SELECT
         COUNT(*) AS totalTenants,
         SUM(status = 'PENDING') AS pendingCount,
         SUM(status = 'APPROVED') AS approvedCount,
         SUM(status = 'REJECTED') AS rejectedCount,
         SUM(status = 'DISABLED') AS disabledCount
       FROM tenants`
    );
    const [userCount] = await pool.query('SELECT COUNT(*) AS c FROM users');
    const [memberCount] = await pool.query('SELECT COUNT(*) AS c FROM members');
    res.json({
      tenants: stats[0],
      totalManagers: userCount[0].c,
      totalMembers: memberCount[0].c,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/registrations', systemAdminMiddleware, async (req, res, next) => {
  try {
    const status = (req.query.status || 'PENDING').toUpperCase();
    if (!['PENDING', 'APPROVED', 'REJECTED', 'DISABLED', 'ALL'].includes(status)) {
      throw new AppError('Invalid status filter');
    }

    const where = status === 'ALL' ? '' : 'WHERE t.status = ?';
    const params = status === 'ALL' ? [] : [status];

    const [rows] = await pool.query(
      `SELECT t.id, t.name, t.status, t.created_at, t.approved_at, t.rejection_reason,
              u.id AS owner_id, u.email AS owner_email,
              sa.email AS approved_by_email,
              (SELECT COUNT(*) FROM members m WHERE m.tenant_id = t.id) AS member_count,
              COALESCE(ow.balance, 0) AS wallet_balance
       FROM tenants t
       JOIN users u ON u.tenant_id = t.id AND u.role = 'owner'
       LEFT JOIN system_admins sa ON sa.id = t.approved_by
       LEFT JOIN owner_wallets ow ON ow.tenant_id = t.id
       ${where}
       ORDER BY t.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/tenants/:id', systemAdminMiddleware, async (req, res, next) => {
  try {
    const tenantId = Number(req.params.id);
    const details = await getTenantFullDetails(pool, tenantId);
    if (!details) throw new AppError('Tenant not found', 404);
    res.json(details);
  } catch (err) {
    next(err);
  }
});

router.get('/audit-logs/actions', systemAdminMiddleware, (_req, res) => {
  res.json(Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label })));
});

router.get('/audit-logs/stats', systemAdminMiddleware, async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (req.query.tenantId) {
      where = 'WHERE al.tenant_id = ?';
      params.push(Number(req.query.tenantId));
    }

    const [totalRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM audit_logs al ${where}`,
      params
    );
    const [byActor] = await pool.query(
      `SELECT al.actor_type, COUNT(*) AS cnt FROM audit_logs al ${where} GROUP BY al.actor_type`,
      params
    );
    const [recentRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM audit_logs al
       ${where}${where ? ' AND' : 'WHERE'} al.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
      params
    );
    const [tenantCount] = await pool.query(
      `SELECT COUNT(DISTINCT al.tenant_id) AS cnt FROM audit_logs al ${where}`,
      params
    );

    const actorMap = Object.fromEntries(byActor.map((r) => [r.actor_type, Number(r.cnt)]));

    res.json({
      total: Number(totalRows[0].total),
      last24h: Number(recentRows[0].cnt),
      manager: actorMap.manager ?? 0,
      member: actorMap.member ?? 0,
      tenantCount: Number(tenantCount[0].cnt),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/audit-logs/purge-preview', systemAdminMiddleware, async (req, res, next) => {
  try {
    const days = parseRetentionDays(req.query.days);
    const tenantId = req.query.tenantId ? Number(req.query.tenantId) : null;
    const count = await countAuditLogsOlderThan({ tenantId, days });
    res.json({ count, days, tenantId });
  } catch (err) {
    next(err);
  }
});

router.delete('/audit-logs/purge', systemAdminMiddleware, async (req, res, next) => {
  try {
    const days = parseRetentionDays(req.query.days);
    const tenantId = req.query.tenantId ? Number(req.query.tenantId) : null;
    const pending = await countAuditLogsOlderThan({ tenantId, days });
    if (pending === 0) {
      return res.json({ deleted: 0, days, tenantId, message: `No audit logs older than ${days} days` });
    }

    const deleted = await deleteAuditLogsOlderThan({ tenantId, days });

    if (tenantId) {
      const [tenantRows] = await pool.query('SELECT name FROM tenants WHERE id = ?', [tenantId]);
      await writeAuditLog({
        tenantId,
        actorType: 'manager',
        actorId: 0,
        actorLabel: req.admin.email,
        action: 'ADMIN_AUDIT_PURGE',
        entityType: 'tenant',
        entityId: tenantId,
        summary: `Admin deleted ${deleted} audit log${deleted === 1 ? '' : 's'} older than ${days} days`,
        metadata: { deleted, days },
        ipAddress: req.ip,
      });
    }

    res.json({ deleted, days, tenantId });
  } catch (err) {
    next(err);
  }
});

router.get('/audit-logs', systemAdminMiddleware, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 30));
    const offset = (page - 1) * pageSize;

    const params = [];
    let where = 'WHERE 1=1';

    if (req.query.tenantId) {
      where += ' AND al.tenant_id = ?';
      params.push(Number(req.query.tenantId));
    }
    if (req.query.action) {
      where += ' AND al.action = ?';
      params.push(String(req.query.action));
    }
    if (req.query.actorType === 'manager' || req.query.actorType === 'member') {
      where += ' AND al.actor_type = ?';
      params.push(req.query.actorType);
    }
    if (req.query.search?.trim()) {
      where += ' AND (al.summary LIKE ? OR al.actor_label LIKE ? OR t.name LIKE ?)';
      const q = `%${req.query.search.trim()}%`;
      params.push(q, q, q);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM audit_logs al
       JOIN tenants t ON t.id = al.tenant_id
       ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const [rows] = await pool.query(
      `SELECT al.id, al.tenant_id, t.name AS tenant_name, al.actor_type, al.actor_id, al.actor_label,
              al.action, al.entity_type, al.entity_id, al.summary, al.metadata, al.ip_address, al.created_at
       FROM audit_logs al
       JOIN tenants t ON t.id = al.tenant_id
       ${where}
       ORDER BY al.created_at DESC, al.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({
      rows: rows.map((r) => ({
        ...r,
        actionLabel: labelForAction(r.action),
        metadata: r.metadata ? (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) : null,
      })),
      page,
      pageSize,
      total,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/tenants-list', systemAdminMiddleware, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.name, t.status FROM tenants t ORDER BY t.name`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/registrations/:id/approve', systemAdminMiddleware, async (req, res, next) => {
  try {
    const tenantId = Number(req.params.id);
    const [rows] = await pool.query('SELECT id, status, name FROM tenants WHERE id = ?', [tenantId]);
    if (!rows.length) throw new AppError('Tenant not found', 404);
    if (rows[0].status === 'APPROVED') throw new AppError('Already approved');

    await pool.query(
      `UPDATE tenants SET status = 'APPROVED', approved_at = NOW(), approved_by = ?,
       rejection_reason = NULL WHERE id = ?`,
      [req.admin.adminId, tenantId]
    );

    res.json({ ok: true, message: `Team "${rows[0].name}" approved` });
  } catch (err) {
    next(err);
  }
});

router.post('/registrations/:id/reject', systemAdminMiddleware, async (req, res, next) => {
  try {
    const tenantId = Number(req.params.id);
    const reason = req.body.reason?.trim() || 'Registration rejected by administrator';

    const [rows] = await pool.query('SELECT id, status, name FROM tenants WHERE id = ?', [tenantId]);
    if (!rows.length) throw new AppError('Tenant not found', 404);
    if (rows[0].status === 'REJECTED') throw new AppError('Already rejected');

    await pool.query(
      `UPDATE tenants SET status = 'REJECTED', approved_at = NULL, approved_by = ?,
       rejection_reason = ? WHERE id = ?`,
      [req.admin.adminId, reason, tenantId]
    );

    res.json({ ok: true, message: `Team "${rows[0].name}" rejected` });
  } catch (err) {
    next(err);
  }
});

router.post('/tenants/:id/disable', systemAdminMiddleware, async (req, res, next) => {
  try {
    const tenantId = Number(req.params.id);
    const reason = req.body.reason?.trim() || 'Disabled by system administrator';

    const [rows] = await pool.query('SELECT id, status, name FROM tenants WHERE id = ?', [tenantId]);
    if (!rows.length) throw new AppError('Tenant not found', 404);
    if (rows[0].status !== 'APPROVED') {
      throw new AppError('Only approved teams can be disabled');
    }

    await pool.query(
      `UPDATE tenants SET status = 'DISABLED', disabled_at = NOW(), disabled_by = ?, disable_reason = ?
       WHERE id = ?`,
      [req.admin.adminId, reason, tenantId]
    );

    await writeAuditLog({
      tenantId,
      actorType: 'manager',
      actorId: 0,
      actorLabel: req.admin.email,
      action: 'ADMIN_DISABLE',
      entityType: 'tenant',
      entityId: tenantId,
      summary: `Team disabled by admin: ${reason}`,
      ipAddress: req.ip,
    });

    res.json({ ok: true, message: `Team "${rows[0].name}" disabled` });
  } catch (err) {
    next(err);
  }
});

router.post('/tenants/:id/enable', systemAdminMiddleware, async (req, res, next) => {
  try {
    const tenantId = Number(req.params.id);
    const [rows] = await pool.query('SELECT id, status, name FROM tenants WHERE id = ?', [tenantId]);
    if (!rows.length) throw new AppError('Tenant not found', 404);
    if (rows[0].status !== 'DISABLED') {
      throw new AppError('Only disabled teams can be re-enabled');
    }

    await pool.query(
      `UPDATE tenants SET status = 'APPROVED', disabled_at = NULL, disabled_by = NULL, disable_reason = NULL
       WHERE id = ?`,
      [tenantId]
    );

    await writeAuditLog({
      tenantId,
      actorType: 'manager',
      actorId: 0,
      actorLabel: req.admin.email,
      action: 'ADMIN_ENABLE',
      entityType: 'tenant',
      entityId: tenantId,
      summary: 'Team re-enabled by admin',
      ipAddress: req.ip,
    });

    res.json({ ok: true, message: `Team "${rows[0].name}" re-enabled` });
  } catch (err) {
    next(err);
  }
});

router.post('/registrations/:id/reopen', systemAdminMiddleware, async (req, res, next) => {
  try {
    const tenantId = Number(req.params.id);
    const [rows] = await pool.query('SELECT id, status, name FROM tenants WHERE id = ?', [tenantId]);
    if (!rows.length) throw new AppError('Tenant not found', 404);

    await pool.query(
      `UPDATE tenants SET status = 'PENDING', approved_at = NULL, approved_by = NULL,
       rejection_reason = NULL WHERE id = ?`,
      [tenantId]
    );

    res.json({ ok: true, message: `Team "${rows[0].name}" moved back to pending` });
  } catch (err) {
    next(err);
  }
});

export default router;
