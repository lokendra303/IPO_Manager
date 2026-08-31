import { Router } from 'express';
import { runCronTick } from '../jobs/ipoCron.js';

const router = Router();

function authorizeCron(req, res, next) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (!secret) {
    return res.status(503).json({ success: false, message: 'CRON_SECRET is not configured' });
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.secret;
  if (token !== secret) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
}

router.post('/ipo-sync', authorizeCron, async (req, res, next) => {
  try {
    const kind = req.query.kind || req.body?.kind || 'all';
    const result = await runCronTick(kind);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
