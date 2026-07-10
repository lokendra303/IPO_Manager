import { Router } from 'express';
import { pool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { getMemberPortalDashboard } from '../services/memberPortalService.js';
import {
  buildMemberAttentionItems,
  createFundReturnClaim,
  getMemberActivityFeed,
  getMemberIpoDetail,
  getMemberStatement,
  getMemberUpcomingIpos,
  listFundReturnClaims,
  normalizeIssueCategory,
  updateMemberProfile,
} from '../services/memberPortalExtrasService.js';

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

router.get('/attention', async (req, res, next) => {
  try {
    const memberId = req.user.memberId;
    const tenantId = req.tenantId;
    const [dashboard, upcomingIpos, issuesRes, claims] = await Promise.all([
      getMemberPortalDashboard(pool, tenantId, memberId),
      getMemberUpcomingIpos(pool, tenantId, memberId),
      pool.query(
        `SELECT id, status, note FROM member_issues WHERE tenant_id = ? AND member_id = ? ORDER BY created_at DESC LIMIT 20`,
        [tenantId, memberId]
      ),
      listFundReturnClaims(pool, tenantId, memberId),
    ]);
    if (!dashboard) throw new AppError('Member not found', 404);
    res.json(
      buildMemberAttentionItems({
        dashboard,
        upcomingIpos,
        issues: issuesRes[0],
        claims,
      })
    );
  } catch (err) {
    next(err);
  }
});

router.get('/activity', async (req, res, next) => {
  try {
    const limit = req.query.limit;
    const items = await getMemberActivityFeed(pool, req.tenantId, req.user.memberId, { limit });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.get('/upcoming-ipos', async (req, res, next) => {
  try {
    const items = await getMemberUpcomingIpos(pool, req.tenantId, req.user.memberId);
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.get('/ipo/:ipoId', async (req, res, next) => {
  try {
    const data = await getMemberIpoDetail(pool, req.tenantId, req.user.memberId, req.params.ipoId);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/statement', async (req, res, next) => {
  try {
    const data = await getMemberStatement(pool, req.tenantId, req.user.memberId);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.patch('/profile', async (req, res, next) => {
  try {
    const data = await updateMemberProfile(pool, req.tenantId, req.user.memberId, req.body);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/fund-return-claims', async (req, res, next) => {
  try {
    const data = await listFundReturnClaims(pool, req.tenantId, req.user.memberId);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/fund-return-claims', async (req, res, next) => {
  try {
    const data = await createFundReturnClaim(pool, req.tenantId, req.user.memberId, req.body);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/issues', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, note, category, status, resolution_note, created_at, resolved_at
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
    const category = normalizeIssueCategory(req.body.category);
    if (!note) throw new AppError('Please describe your issue');
    if (note.length > 2000) throw new AppError('Issue note is too long (max 2000 characters)');

    const [result] = await pool.query(
      `INSERT INTO member_issues (tenant_id, member_id, note, category) VALUES (?, ?, ?, ?)`,
      [req.tenantId, req.user.memberId, note, category]
    );

    const [rows] = await pool.query('SELECT * FROM member_issues WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
