import { Router } from 'express';
import { pool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { parsePositiveInt } from '../utils/validate.js';

const router = Router();

const issueSelect = `
  SELECT i.id, i.note, i.status, i.resolution_note, i.created_at, i.resolved_at,
         m.display_name AS member_name, m.pan AS member_pan
  FROM member_issues i
  JOIN members m ON m.id = i.member_id`;

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
    let sql = `${issueSelect} WHERE i.tenant_id = ?`;
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
    let resolutionNote = null;
    if (status === 'RESOLVED' && req.body.resolutionNote !== undefined) {
      resolutionNote = String(req.body.resolutionNote || '').trim() || null;
      if (resolutionNote && resolutionNote.length > 2000) {
        throw new AppError('Resolution note is too long (max 2000 characters)');
      }
    }

    const [result] = await pool.query(
      `UPDATE member_issues
       SET status = ?, resolved_at = ?, resolution_note = ?
       WHERE id = ? AND tenant_id = ?`,
      [status, resolvedAt, status === 'OPEN' ? null : resolutionNote, id, req.tenantId]
    );
    if (!result.affectedRows) throw new AppError('Issue not found', 404);

    const [rows] = await pool.query(
      `${issueSelect} WHERE i.id = ? AND i.tenant_id = ?`,
      [id, req.tenantId]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
