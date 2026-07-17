import { pool } from '../src/db/pool.js';

const [ipos] = await pool.query(
  "SELECT id, tenant_id, name, status FROM ipos WHERE name LIKE '%laser%' OR name LIKE '%Laser%' OR name LIKE '%LASER%'"
);
console.log('\n=== IPOs matching laser ===');
console.table(ipos);

const [providerTx] = await pool.query(
  `SELECT pt.id, pt.fund_provider_id, fp.name AS provider_name, pt.amount, pt.provider_profit,
          pt.account_label, pt.notes, pt.txn_date, pt.created_at
   FROM provider_transactions pt
   JOIN fund_providers fp ON fp.id = pt.fund_provider_id
   WHERE DATE(pt.txn_date) = CURDATE() OR DATE(pt.created_at) = CURDATE()
   ORDER BY pt.id`
);
console.log('\n=== Provider transactions today ===');
console.table(providerTx);

const [walletTx] = await pool.query(
  `SELECT id, tenant_id, type, amount, ref_type, ref_id, notes, txn_date, created_at
   FROM wallet_transactions
   WHERE DATE(txn_date) = CURDATE() OR DATE(created_at) = CURDATE()
   ORDER BY id`
);
console.log('\n=== Wallet transactions today ===');
console.table(walletTx);

const [distributions] = await pool.query(
  `SELECT psd.id, psd.tenant_id, psd.ipo_application_id, psd.gross_profit_loss,
          psd.provider_amount, psd.manager_amount, psd.distributed_at,
          m.display_name, i.name AS ipo_name
   FROM profit_share_distributions psd
   JOIN ipo_applications a ON a.id = psd.ipo_application_id
   JOIN members m ON m.id = psd.member_id
   JOIN ipos i ON i.id = a.ipo_id
   WHERE DATE(psd.distributed_at) = CURDATE()
   ORDER BY psd.id`
);
console.log('\n=== Profit share distributions today ===');
console.table(distributions);

const [distRules] = await pool.query(
  `SELECT psdr.id, psdr.distribution_id, psdr.fund_provider_id, fp.name AS provider_name,
          psdr.provider_amount, psdr.rule_name, i.name AS ipo_name
   FROM profit_share_distribution_rules psdr
   JOIN profit_share_distributions psd ON psd.id = psdr.distribution_id
   JOIN ipo_applications a ON a.id = psd.ipo_application_id
   JOIN ipos i ON i.id = a.ipo_id
   LEFT JOIN fund_providers fp ON fp.id = psdr.fund_provider_id
   WHERE DATE(psd.distributed_at) = CURDATE()
   ORDER BY psdr.id`
);
console.log('\n=== Distribution rule lines today ===');
console.table(distRules);

const [memberLedger] = await pool.query(
  `SELECT ml.id, ml.tenant_id, ml.member_id, m.display_name, ml.type, ml.amount, ml.notes, ml.txn_date, ml.created_at
   FROM member_ledger ml
   JOIN members m ON m.id = ml.member_id
   WHERE DATE(ml.txn_date) = CURDATE() OR DATE(ml.created_at) = CURDATE()
   ORDER BY ml.id`
);
console.log('\n=== Member ledger today ===');
console.table(memberLedger);

await pool.end();
