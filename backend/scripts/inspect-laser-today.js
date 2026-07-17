import { pool } from '../src/db/pool.js';

const IPO_ID = 10;
const TENANT_ID = 2;

const [providerReceive] = await pool.query(
  `SELECT pt.id, pt.fund_provider_id, fp.name, pt.amount, pt.provider_profit, pt.account_label, pt.notes, pt.txn_date
   FROM provider_transactions pt
   JOIN fund_providers fp ON fp.id = pt.fund_provider_id
   WHERE pt.tenant_id = ?
     AND (DATE(pt.txn_date) = CURDATE() OR DATE(pt.created_at) = CURDATE())
     AND pt.account_label NOT IN ('P&L Share', 'P&L Share (Loss)', 'P&L Share Reversal', 'Profit Reinvested')
   ORDER BY pt.id`,
  [TENANT_ID]
);
console.log('\n=== Provider fund receive/repay today (tenant 2) ===');
console.table(providerReceive);

const [allProviderToday] = await pool.query(
  `SELECT pt.id, pt.tenant_id, fp.name, pt.amount, pt.provider_profit, pt.account_label, pt.notes
   FROM provider_transactions pt
   JOIN fund_providers fp ON fp.id = pt.fund_provider_id
   WHERE DATE(pt.txn_date) = CURDATE() OR DATE(pt.created_at) = CURDATE()
   ORDER BY pt.id`
);
console.log('\n=== All provider tx today ===');
console.table(allProviderToday);

const [laserApps] = await pool.query(
  `SELECT a.id, m.display_name, a.amount, a.profit_loss, a.allotment_status, a.trns_received, a.trns_given, a.updated_at
   FROM ipo_applications a
   JOIN members m ON m.id = a.member_id
   WHERE a.ipo_id = ? AND a.tenant_id = ?
   ORDER BY a.id`,
  [IPO_ID, TENANT_ID]
);
console.log('\n=== Laser Power applications ===');
console.table(laserApps);

const [dists] = await pool.query(
  `SELECT psd.id, psd.ipo_application_id, m.display_name, psd.gross_profit_loss, psd.provider_amount, psd.manager_amount, psd.distributed_at
   FROM profit_share_distributions psd
   JOIN ipo_applications a ON a.id = psd.ipo_application_id
   JOIN members m ON m.id = psd.member_id
   WHERE a.ipo_id = ?
   ORDER BY psd.id`,
  [IPO_ID]
);
console.log('\n=== All Laser profit distributions ===');
console.table(dists);

const [walletLaser] = await pool.query(
  `SELECT id, type, amount, ref_type, ref_id, notes, txn_date
   FROM wallet_transactions
   WHERE tenant_id = ? AND notes LIKE '%Laser Power%'
   ORDER BY id`,
  [TENANT_ID]
);
console.log('\n=== All wallet tx mentioning Laser ===');
console.table(walletLaser);

const [bankTx] = await pool.query(
  `SELECT ba.id, ba.label, ba.balance FROM bank_accounts ba WHERE ba.tenant_id = ?`,
  [TENANT_ID]
);
console.log('\n=== Bank accounts ===');
console.table(bankTx);

await pool.end();
