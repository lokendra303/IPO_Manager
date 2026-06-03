import { Router } from 'express';
import { pool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { getMemberPortalDashboard } from '../services/memberPortalService.js';

const router = Router();

router.get('/dashboard', async (req, res, next) => {
  try {
    const data = await getMemberPortalDashboard(pool, req.tenantId, req.user.memberId);
    if (!data) throw new AppError('Member not found', 404);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/issues', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, note, status, created_at, resolved_at
       FROM member_issues
       WHERE tenant_id = ? AND member_id = ?
       ORDER BY created_at DESC`,
      [req.tenantId, req.user.memberId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/issues', async (req, res, next) => {
  try {
    const note = String(req.body.note || '').trim();
    if (!note) throw new AppError('Please describe your issue');
    if (note.length > 2000) throw new AppError('Issue note is too long (max 2000 characters)');

    const [result] = await pool.query(
      `INSERT INTO member_issues (tenant_id, member_id, note) VALUES (?, ?, ?)`,
      [req.tenantId, req.user.memberId, note]
    );

    const [rows] = await pool.query('SELECT * FROM member_issues WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
