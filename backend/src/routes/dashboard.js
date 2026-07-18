import { Router } from 'express';
import { pool } from '../db/pool.js';
import { getManagerDashboard } from '../services/dashboardService.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const data = await getManagerDashboard(pool, req.tenantId);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
