import { pool } from '../src/db/pool.js';

const [lokendra] = await pool.query(
  `SELECT m.id, m.display_name FROM members m WHERE m.tenant_id = 2 AND m.display_name LIKE '%Lokendra%'`
);
console.log('Lokendra member:', lokendra);

const [apps] = await pool.query(
  `SELECT a.id, a.member_id, m.display_name, a.allotment_status, a.amount, a.withdrawal_money, a.profit_loss,
          psd.id AS dist_id, psd.gross_profit_loss, psd.provider_amount, psd.manager_amount, psd.member_amount,
          psd.distributed_at
   FROM ipo_applications a
   JOIN members m ON m.id = a.member_id
   JOIN ipos i ON i.id = a.ipo_id
   LEFT JOIN profit_share_distributions psd ON psd.ipo_application_id = a.id
   WHERE a.tenant_id = 2 AND i.id = 10 AND m.display_name LIKE '%Lokendra%'`
);
console.log('\nLokendra Laser apps:', apps);

const memberId = lokendra[0]?.id;
if (memberId) {
  const [rules] = await pool.query(
    `SELECT msr.*, fp.name AS provider_name
     FROM member_profit_shares msr
     LEFT JOIN fund_providers fp ON fp.id = msr.fund_provider_id
     WHERE msr.tenant_id = 2 AND msr.member_id = ?
     ORDER BY msr.ipo_id IS NULL DESC, msr.ipo_id, msr.id`,
    [memberId]
  );
  console.log('\nLokendra share rules:', rules);
}

await pool.end();
