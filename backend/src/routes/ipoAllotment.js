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
import { sendAllotmentCheckPdfEmail } from '../services/emailService.js';
import { parsePdfEmailRequest, smtpAppError } from '../utils/emailPdf.js';

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

router.post('/:id/allotment/email-pdf', async (req, res, next) => {
  try {
    const ipoId = parsePositiveInt(req.params.id, 'IPO id');
    const [ipoRows] = await pool.query(
      `SELECT i.id, i.name, t.name AS tenant_name
       FROM ipos i
       JOIN tenants t ON t.id = i.tenant_id
       WHERE i.id = ? AND i.tenant_id = ?`,
      [ipoId, req.tenantId]
    );
    if (!ipoRows.length) throw new AppError('IPO not found', 404);
    const ipo = ipoRows[0];

    const [userRows] = await pool.query(
      'SELECT email FROM users WHERE id = ? AND tenant_id = ?',
      [req.user.userId, req.tenantId]
    );
    const parsed = parsePdfEmailRequest(req.body, {
      fallbackEmail: userRows[0]?.email,
      fallbackFileName: `allotment-check-${ipo.name}.pdf`,
    });

    try {
      await sendAllotmentCheckPdfEmail({
        to: parsed.to,
        cc: parsed.cc,
        ipoName: ipo.name,
        teamName: ipo.tenant_name,
        summary: parsed.summary,
        filename: parsed.filename,
        pdfBuffer: parsed.pdfBuffer,
      });
    } catch (err) {
      throw smtpAppError(err);
    }

    res.json({
      success: true,
      message: parsed.cc.length ? `PDF sent to ${parsed.to} and ${parsed.cc.length} more` : `PDF sent to ${parsed.to}`,
      to: parsed.to,
      cc: parsed.cc,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/allotment-check', async (req, res, next) => {
  try {
    const ipoId = parsePositiveInt(req.params.id, 'IPO id');
    await assertIpoAllotmentCheckReady(pool, { tenantId: req.tenantId, ipoId });
    const [ipoRows] = await pool.query(
      `SELECT i.id, i.name, i.status, i.registrar, i.listing_date,
              c.listing_date AS catalog_listing_date, c.status AS catalog_status
       FROM ipos i
       LEFT JOIN ipo_catalog c ON c.id = i.catalog_id
       WHERE i.id = ? AND i.tenant_id = ?`,
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
        listing_date: ipo.listing_date || ipo.catalog_listing_date || null,
        listingDate: ipo.listing_date || ipo.catalog_listing_date || null,
        catalogStatus: ipo.catalog_status || null,
      },
      portals: getAllotmentPortalsMeta(ipo.registrar).portals,
      applications: applications.map((a) => ({
        id: a.id,
        allotment_status: a.allotment_status,
        display_name: a.display_name,
        maskedPan: maskPan(a.pan),
      })),
      note: 'Auto-check uses MUFG Intime, KFintech and Skyline. Bigshare, Cameo and Purva can be detected when allotment is live, but those sites still require a website captcha.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
