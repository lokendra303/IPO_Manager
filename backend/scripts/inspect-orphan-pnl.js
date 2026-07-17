import { pool } from '../src/db/pool.js';

const [ipos] = await pool.query(
  `SELECT id, tenant_id, name, status FROM ipos
   WHERE name LIKE '%CMR%' OR name LIKE '%Knack%' OR name LIKE '%knack%'
   ORDER BY tenant_id, id`
);
console.log('IPOs:', ipos);

for (const ipo of ipos) {
  const [apps] = await pool.query(
    `SELECT a.id, a.member_id, m.display_name, a.allotment_status,
            a.amount, a.withdrawal_money, a.profit_loss, a.trns_received
     FROM ipo_applications a
     JOIN members m ON m.id = a.member_id
     WHERE a.ipo_id = ? AND a.tenant_id = ?
     ORDER BY a.id`,
    [ipo.id, ipo.tenant_id]
  );
  console.log(`\n=== ${ipo.name} (id=${ipo.id}, tenant=${ipo.tenant_id}) ===`);
  console.log('Applications:', apps);

  const [dists] = await pool.query(
    `SELECT psd.id, psd.ipo_application_id, psd.gross_profit_loss, psd.pnl_type,
            psd.provider_amount, psd.manager_amount, psd.member_amount, psd.created_at
     FROM profit_share_distributions psd
     JOIN ipo_applications a ON a.id = psd.ipo_application_id
     WHERE a.ipo_id = ? AND psd.tenant_id = ?`,
    [ipo.id, ipo.tenant_id]
  );
  console.log('Profit distributions:', dists);
}

// Any rows still with profit_loss but no withdrawal?
const [orphan] = await pool.query(
  `SELECT a.id, i.name, a.profit_loss, a.withdrawal_money, a.amount
   FROM ipo_applications a
   JOIN ipos i ON i.id = a.ipo_id
   WHERE a.profit_loss IS NOT NULL AND a.withdrawal_money IS NULL`
);
console.log('\nRemaining orphan profit_loss (no withdrawal):', orphan);

// Rows cleared - check if we can recover from distributions
const [recoverable] = await pool.query(
  `SELECT a.id, i.name, a.amount, a.profit_loss, a.withdrawal_money,
          psd.gross_profit_loss, psd.id AS dist_id
   FROM ipo_applications a
   JOIN ipos i ON i.id = a.ipo_id
   JOIN profit_share_distributions psd ON psd.ipo_application_id = a.id
   WHERE a.allotment_status = 'ALLOTED'
     AND a.withdrawal_money IS NULL
     AND (a.profit_loss IS NULL OR a.profit_loss = 0)
     AND psd.gross_profit_loss IS NOT NULL AND psd.gross_profit_loss != 0`
);
console.log('\nRecoverable from distributions:', recoverable);

await pool.end();
