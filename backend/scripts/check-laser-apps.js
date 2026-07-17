import { pool } from '../src/db/pool.js';

const [rows] = await pool.query(
  `SELECT id, amount, withdrawal_money, profit_loss
   FROM ipo_applications
   WHERE ipo_id = 10 AND tenant_id = 2 AND allotment_status = 'ALLOTED'`
);
console.log(rows);
await pool.end();
