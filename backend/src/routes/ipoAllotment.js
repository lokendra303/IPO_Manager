import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { parsePositiveInt } from '../utils/validate.js';
import { getAllotmentPortalsMeta } from '../utils/allotmentCheck.js';
import { maskPan } from '../utils/pan.js';
import {
  claimNextPending,
  getAllotmentQueue,
} from '../services/ipo/allotmentQueueService.js';
import { autoCheckIpoAllotment } from '../services/ipo/allotment/checkService.js';
import { assertIpoAllotmentCheckReady } from '../services/ipo/allotmentReady.js';

const router = Router();

router.get('/registrars', (_req, res) => {
  res.json(getAllotmentPortalsMeta().registrars);
});

router.post('/:id/allotment/auto-check', async (req, res, next) => {
  try {
    const ipoId = parsePositiveInt(req.params.id, 'IPO id');
    await assertIpoAllotmentCheckReady(pool, { tenantId: req.tenantId, ipoId });
    const recheck = req.body?.recheck === true;
    const applicationId = req.body?.applicationId
      ? parsePositiveInt(req.body.applicationId, 'application id')
      : null;
    const data = await autoCheckIpoAllotment(pool, { tenantId: req.tenantId, ipoId, recheck, applicationId });
    const queue = await withTransaction((conn) =>
      getAllotmentQueue(conn, { tenantId: req.tenantId, ipoId })
    );
    res.json({
      success: true,
      ...data,
      counts: queue.counts,
      applications: queue.applications,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/allotment/next', async (req, res, next) => {
  try {
    const ipoId = parsePositiveInt(req.params.id, 'IPO id');
    await assertIpoAllotmentCheckReady(pool, { tenantId: req.tenantId, ipoId });
    const result = await withTransaction((conn) =>
      claimNextPending(conn, { tenantId: req.tenantId, ipoId })
    );
    const queue = await withTransaction((conn) =>
      getAllotmentQueue(conn, { tenantId: req.tenantId, ipoId })
    );
    res.json({ success: true, ...result, counts: queue.counts, portals: queue.portals });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/allotment', async (req, res, next) => {
  try {
    const ipoId = parsePositiveInt(req.params.id, 'IPO id');
    await assertIpoAllotmentCheckReady(pool, { tenantId: req.tenantId, ipoId });
    const data = await withTransaction((conn) =>
      getAllotmentQueue(conn, { tenantId: req.tenantId, ipoId })
    );
    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/allotment-check', async (req, res, next) => {
  try {
    const ipoId = parsePositiveInt(req.params.id, 'IPO id');
    await assertIpoAllotmentCheckReady(pool, { tenantId: req.tenantId, ipoId });
    const [ipoRows] = await pool.query(
      'SELECT id, name, status, registrar, listing_date FROM ipos WHERE id = ? AND tenant_id = ?',
      [ipoId, req.tenantId]
    );
    if (!ipoRows.length) throw new AppError('IPO not found', 404);
    const ipo = ipoRows[0];

    const [applications] = await pool.query(
      `SELECT a.id, a.allotment_status, m.display_name, m.pan
       FROM ipo_applications a
       JOIN members m ON m.id = a.member_id
       WHERE a.ipo_id = ? AND a.tenant_id = ?
       ORDER BY m.display_name`,
      [ipoId, req.tenantId]
    );

    res.json({
      ipo: {
        id: ipo.id,
        name: ipo.name,
        status: ipo.status,
        registrar: ipo.registrar,
        listing_date: ipo.listing_date || null,
        listingDate: ipo.listing_date || null,
      },
      portals: getAllotmentPortalsMeta(ipo.registrar).portals,
      applications: applications.map((a) => ({
        id: a.id,
        allotment_status: a.allotment_status,
        display_name: a.display_name,
        maskedPan: maskPan(a.pan),
      })),
      note: 'Allotment is checked on the server against MUFG Intime (Link Intime). Bigshare and KFintech still require a website captcha, so those IPOs stay pending until they appear on MUFG or you mark them manually.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
