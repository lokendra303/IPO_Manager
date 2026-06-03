import { Router } from 'express';
import { pool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { parsePositiveInt } from '../utils/validate.js';

const router = Router();

router.get('/count', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS count FROM member_issues WHERE tenant_id = ? AND status = 'OPEN'`,
      [req.tenantId]
    );
    res.json({ openCount: Number(rows[0].count) });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status;
    const params = [req.tenantId];
    let sql = `
      SELECT i.id, i.note, i.status, i.created_at, i.resolved_at,
             m.display_name AS member_name, m.pan AS member_pan
      FROM member_issues i
      JOIN members m ON m.id = i.member_id
      WHERE i.tenant_id = ?`;
    if (status === 'OPEN' || status === 'RESOLVED') {
      sql += ' AND i.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY i.status ASC, i.created_at DESC';

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id, 'issue id');
    const status = req.body.status;
    if (status !== 'OPEN' && status !== 'RESOLVED') {
      throw new AppError('Status must be OPEN or RESOLVED');
    }

    const resolvedAt = status === 'RESOLVED' ? new Date() : null;
    const [result] = await pool.query(
      `UPDATE member_issues SET status = ?, resolved_at = ?
       WHERE id = ? AND tenant_id = ?`,
      [status, resolvedAt, id, req.tenantId]
    );
    if (!result.affectedRows) throw new AppError('Issue not found', 404);

    const [rows] = await pool.query(
      `SELECT i.id, i.note, i.status, i.created_at, i.resolved_at,
              m.display_name AS member_name, m.pan AS member_pan
       FROM member_issues i
       JOIN members m ON m.id = i.member_id
       WHERE i.id = ? AND i.tenant_id = ?`,
      [id, req.tenantId]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
