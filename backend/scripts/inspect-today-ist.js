import { pool } from '../src/db/pool.js';

const IST = '+05:30';
const TODAY = '2026-07-17';
const TENANT_ID = 2;
const IPO_ID = 10;

function istDate(col) {
  return `DATE(CONVERT_TZ(${col}, '+00:00', '${IST}'))`;
}

const [ledgerToday] = await pool.query(
  `SELECT l.id, l.ipo_application_id, m.display_name, l.amount, l.txn_date, l.created_at, l.notes
   FROM member_ledger_entries l
   JOIN ipo_applications a ON a.id = l.ipo_application_id
   JOIN members m ON m.id = l.member_id
   WHERE a.ipo_id = ? AND l.tenant_id = ?
     AND l.type = 'RECEIVED'
     AND ${istDate('l.created_at')} = ?
   ORDER BY l.id`,
  [IPO_ID, TENANT_ID, TODAY]
);
console.log('\n=== Member ledger RECEIVED today (IST) Laser ===');
console.table(ledgerToday);

const [walletTodayLaser] = await pool.query(
  `SELECT id, type, amount, ref_type, ref_id, notes, created_at
   FROM wallet_transactions
   WHERE tenant_id = ?
     AND ${istDate('created_at')} = ?
     AND (notes LIKE '%Laser Power%' OR ref_type IN ('profit_share', 'profit_share_reversal', 'ipo_application'))
   ORDER BY id`,
  [TENANT_ID, TODAY]
);
console.log('\n=== Wallet today IST (Laser/profit/receive) ===');
console.table(walletTodayLaser);

const [walletAllToday] = await pool.query(
  `SELECT id, type, amount, ref_type, ref_id, notes
   FROM wallet_transactions
   WHERE tenant_id = ? AND ${istDate('created_at')} = ?
   ORDER BY id`,
  [TENANT_ID, TODAY]
);
console.log('\n=== All wallet today IST ===');
console.table(walletAllToday);

await pool.end();
