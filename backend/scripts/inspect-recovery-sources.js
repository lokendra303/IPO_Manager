import { pool } from '../src/db/pool.js';

// Check audit logs for profit share events
const [audits] = await pool.query(
  `SELECT id, tenant_id, action, entity_type, entity_id, summary, metadata, created_at
   FROM audit_logs
   WHERE summary LIKE '%profit%' OR summary LIKE '%P&L%' OR summary LIKE '%share%'
   ORDER BY created_at DESC
   LIMIT 50`
);
console.log('Recent profit audits:', audits.length);
for (const a of audits.slice(0, 15)) {
  console.log(a.created_at, a.tenant_id, a.summary, a.metadata ? JSON.stringify(a.metadata).slice(0, 200) : '');
}

// Provider transactions for CMR/Knack members
const [pt] = await pool.query(
  `SELECT pt.*, fp.name
   FROM provider_transactions pt
   JOIN fund_providers fp ON fp.id = pt.fund_provider_id
   WHERE pt.ipo_application_id IN (20, 64, 33)
   ORDER BY pt.id`
);
console.log('\nProvider txns for apps 20,64,33:', pt);

// Any remaining distributions
const [dists] = await pool.query('SELECT * FROM profit_share_distributions WHERE ipo_application_id IN (20, 64, 33)');
console.log('\nRemaining distributions:', dists);

const [lines] = await pool.query(
  `SELECT psdl.* FROM profit_share_distribution_lines psdl
   JOIN profit_share_distributions psd ON psd.id = psdl.distribution_id
   WHERE psd.ipo_application_id IN (20, 64, 33)`
);
console.log('\nRemaining dist lines:', lines);

await pool.end();
