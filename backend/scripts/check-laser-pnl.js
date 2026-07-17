import { pool } from '../src/db/pool.js';

const [orphan] = await pool.query(
  `SELECT a.id, a.ipo_id, i.name, a.profit_loss, a.withdrawal_money
   FROM ipo_applications a
   JOIN ipos i ON i.id = a.ipo_id
   WHERE a.tenant_id = 2 AND a.profit_loss IS NOT NULL`
);
console.log('Apps with profit_loss:', orphan);

const [sum] = await pool.query(
  `SELECT SUM(profit_loss) AS t FROM ipo_applications
   WHERE tenant_id = 2 AND allotment_status = 'ALLOTED' AND profit_loss IS NOT NULL`
);
console.log('Total allotted profit_loss:', sum[0].t);

const { getIpoSummaryById } = await import('../src/services/summaryService.js');
const { getProfitTotalsReport } = await import('../src/services/profitShareService.js');

const summary = await getIpoSummaryById(pool, 2, 10);
console.log('Laser summary totalProfitLoss:', summary?.totalProfitLoss);

const totals = await getProfitTotalsReport(pool, 2);
console.log('Profit totals overall.grossIpoPnL:', totals.overall.grossIpoPnL);
console.log('Profit totals overall.grossPendingDistribution:', totals.overall.grossPendingDistribution);

await pool.end();
