import { Router } from 'express';
import { pool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { getSummary, getIpoSummaryById } from '../services/summaryService.js';
import { parsePositiveInt } from '../utils/validate.js';

const router = Router();

router.get('/ipos/:ipoId', async (req, res, next) => {
  try {
    const ipoId = parsePositiveInt(req.params.ipoId, 'IPO id');
    const summary = await getIpoSummaryById(pool, req.tenantId, ipoId);
    if (!summary) throw new AppError('IPO not found', 404);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const summary = await getSummary(pool, req.tenantId);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

export default router;
