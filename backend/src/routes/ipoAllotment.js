import { Router } from 'express';
import { pool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { parsePositiveInt } from '../utils/validate.js';
import { getAllotmentPortalsMeta } from '../utils/allotmentCheck.js';

const router = Router();

router.get('/registrars', (_req, res) => {
  res.json(getAllotmentPortalsMeta().registrars);
});

router.get('/:id/allotment-check', async (req, res, next) => {
  try {
    const ipoId = parsePositiveInt(req.params.id, 'IPO id');
    const [ipoRows] = await pool.query(
      'SELECT id, name, status, registrar FROM ipos WHERE id = ? AND tenant_id = ?',
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
      },
      portals: getAllotmentPortalsMeta(ipo.registrar).portals,
      applications,
      note: 'India has no free public API for allotment by PAN. Open official portals, enter each member PAN, then update allotment status in your grid.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
