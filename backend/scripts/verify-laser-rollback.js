import { pool } from '../src/db/pool.js';

const IPO_ID = 10;
const TENANT_ID = 2;

const [recv] = await pool.query(
  `SELECT a.id, m.display_name, a.trns_received, a.date_received, a.profit_loss, a.allotment_status
   FROM ipo_applications a
   JOIN members m ON m.id = a.member_id
   WHERE a.ipo_id = ? AND a.tenant_id = ? AND a.id IN (108, 111, 114, 120, 125)
   ORDER BY a.id`,
  [IPO_ID, TENANT_ID]
);
console.log('\n=== Affected apps (receive status) ===');
console.table(recv);

const [dists] = await pool.query(
  `SELECT psd.id, psd.ipo_application_id, m.display_name
   FROM profit_share_distributions psd
   JOIN ipo_applications a ON a.id = psd.ipo_application_id
   JOIN members m ON m.id = a.member_id
   WHERE a.ipo_id = ?`,
  [IPO_ID]
);
console.log('\n=== Remaining profit distributions ===');
console.table(dists);

const [prov] = await pool.query(
  `SELECT id, account_label, amount, provider_profit, notes
   FROM provider_transactions
   WHERE tenant_id = ? AND notes LIKE '%Laser Power%'
   ORDER BY id`,
  [TENANT_ID]
);
console.log('\n=== Provider Laser entries ===');
console.table(prov);

const [accounts] = await pool.query(
  `SELECT id, label, balance FROM manager_bank_accounts WHERE tenant_id = ? ORDER BY id`,
  [TENANT_ID]
);
console.log('\n=== Bank account balances ===');
console.table(accounts);

const [wallet] = await pool.query(
  `SELECT balance FROM owner_wallets WHERE tenant_id = ?`,
  [TENANT_ID]
);
console.log('\nOwner wallet total:', wallet[0]?.balance);

await pool.end();
