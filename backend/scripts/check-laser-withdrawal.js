import { pool } from '../src/db/pool.js';

const [rows] = await pool.query(
  `SELECT a.id, m.display_name, a.amount, a.withdrawal_money, a.profit_loss, a.allotment_status,
          psd.member_amount, psd.manager_amount, psd.provider_amount, psd.gross_profit_loss,
          i.status AS ipo_status
   FROM ipo_applications a
   JOIN members m ON m.id = a.member_id
   JOIN ipos i ON i.id = a.ipo_id
   LEFT JOIN profit_share_distributions psd ON psd.ipo_application_id = a.id
   WHERE a.ipo_id = 10 AND a.tenant_id = 2
   ORDER BY a.id`
);
console.table(rows);

const [recoverable] = await pool.query(
  `SELECT a.id, i.name, a.amount, a.profit_loss, a.withdrawal_money,
          psd.gross_profit_loss, psd.member_amount, psd.manager_amount, psd.provider_amount
   FROM ipo_applications a
   JOIN ipos i ON i.id = a.ipo_id
   JOIN profit_share_distributions psd ON psd.ipo_application_id = a.id
   WHERE a.ipo_id = 10 AND a.tenant_id = 2
     AND (a.withdrawal_money IS NULL OR a.profit_loss IS NULL)`
);
console.log('\nCleared P&L but has distribution:', recoverable);

await pool.end();
