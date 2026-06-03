import { Router } from 'express';
import { pool } from '../db/pool.js';
import { getSummary } from '../services/summaryService.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const summary = await getSummary(pool, req.tenantId);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

export default router;
