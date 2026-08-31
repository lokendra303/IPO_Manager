import { pool } from '../db/pool.js';
import { syncGmpForActive, syncLiveIpos } from '../services/ipo/syncService.js';

const LIVE_CRON = process.env.IPO_SYNC_CRON || '*/30 * * * *';
const GMP_CRON = process.env.IPO_GMP_SYNC_CRON || '*/15 * * * *';

export function startIpoCron() {
  if (process.env.VERCEL === '1') return;
  if (process.env.IPO_CRON_ENABLED === '0') return;

  import('node-cron')
    .then((mod) => {
      const cron = mod.default || mod;
      cron.schedule(LIVE_CRON, () => {
        syncLiveIpos(pool).catch((err) => console.error('[ipo-cron live]', err.message));
      });
      cron.schedule(GMP_CRON, () => {
        syncGmpForActive(pool).catch((err) => console.error('[ipo-cron gmp]', err.message));
      });
      console.log(`IPO sync cron: live ${LIVE_CRON}, gmp ${GMP_CRON}`);
    })
    .catch((err) => {
      console.warn('[ipo-cron] node-cron not installed; scheduled sync disabled', err.message);
    });
}

export async function runCronTick(kind = 'all') {
  if (kind === 'gmp') return syncGmpForActive(pool);
  if (kind === 'live') return syncLiveIpos(pool);
  const live = await syncLiveIpos(pool);
  return live;
}
