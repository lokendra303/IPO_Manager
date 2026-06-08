import { Router } from 'express';
import { pool } from '../db/pool.js';
import { ACTION_LABELS, labelForAction } from '../constants/auditActions.js';

const router = Router();

router.get('/stats', async (req, res, next) => {
  try {
    const [totalRows] = await pool.query(
      'SELECT COUNT(*) AS total FROM audit_logs WHERE tenant_id = ?',
      [req.tenantId]
    );
    const [byActor] = await pool.query(
      `SELECT actor_type, COUNT(*) AS cnt FROM audit_logs WHERE tenant_id = ? GROUP BY actor_type`,
      [req.tenantId]
    );
    const [recentRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM audit_logs
       WHERE tenant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
      [req.tenantId]
    );

    const actorMap = Object.fromEntries(byActor.map((r) => [r.actor_type, Number(r.cnt)]));

    res.json({
      total: Number(totalRows[0].total),
      last24h: Number(recentRows[0].cnt),
      manager: actorMap.manager ?? 0,
      member: actorMap.member ?? 0,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/actions', (_req, res) => {
  res.json(
    Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))
  );
});

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 30));
    const offset = (page - 1) * pageSize;

    const params = [req.tenantId];
    let where = 'WHERE tenant_id = ?';

    if (req.query.action) {
      where += ' AND action = ?';
      params.push(String(req.query.action));
    }
    if (req.query.actorType === 'manager' || req.query.actorType === 'member') {
      where += ' AND actor_type = ?';
      params.push(req.query.actorType);
    }
    if (req.query.search?.trim()) {
      where += ' AND (summary LIKE ? OR actor_label LIKE ?)';
      const q = `%${req.query.search.trim()}%`;
      params.push(q, q);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM audit_logs ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const [rows] = await pool.query(
      `SELECT id, actor_type, actor_id, actor_label, action, entity_type, entity_id,
              summary, metadata, ip_address, created_at
       FROM audit_logs ${where}
       ORDER BY created_at DESC, id DESC
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

export default router;
