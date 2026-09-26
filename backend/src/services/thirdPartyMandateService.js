import { isThirdPartyMandate } from '../constants/fundingMode.js';

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function isAllottedStatus(status) {
  return status === 'ALLOTED' || status === 'PARTIALLY_ALLOTTED';
}

export function collectAmountForMandate(app, nextStatus) {
  if (!isAllottedStatus(nextStatus)) return 0;
  const allottedAmt = Number(app?.allotted_amount);
  if (allottedAmt > 0) return round2(allottedAmt);
  const lots = Number(app?.allotted_lots);
  const appliedLots = Number(app?.applied_lots);
  const amount = Number(app?.amount) || 0;
  if (nextStatus === 'PARTIALLY_ALLOTTED' && lots > 0 && appliedLots > 0 && amount > 0) {
    return round2(amount * (lots / appliedLots));
  }
  return round2(amount);
}

/** Write or clear GIVEN when a third-party-mandate application is allotted or reversed. */
export async function syncThirdPartyMandateGiven(conn, { tenantId, app, nextStatus, ipoName }) {
  if (!app?.id || !isThirdPartyMandate(app)) return;

  const [existing] = await conn.query(
    `SELECT id, amount FROM member_ledger_entries
     WHERE tenant_id = ? AND ipo_application_id = ? AND type = 'GIVEN'
     ORDER BY id ASC LIMIT 1`,
    [tenantId, app.id]
  );

  if (!isAllottedStatus(nextStatus)) {
    if (existing.length) {
      await conn.query('DELETE FROM member_ledger_entries WHERE id = ?', [existing[0].id]);
    }
    return;
  }

  const amount = collectAmountForMandate(app, nextStatus);
  if (amount <= 0) return;

  const label = String(ipoName || app.ipo_name || 'IPO').trim();
  const notes = `IPO: ${label} — third party mandate`;

  if (!existing.length) {
    await conn.query(
      `INSERT INTO member_ledger_entries
       (member_id, tenant_id, type, amount, txn_date, ipo_application_id, notes)
       VALUES (?, ?, 'GIVEN', ?, ?, ?, ?)`,
      [app.member_id, tenantId, amount, new Date(), app.id, notes]
    );
    return;
  }

  if (Math.abs(Number(existing[0].amount) - amount) > 0.009) {
    await conn.query(
      'UPDATE member_ledger_entries SET amount = ?, notes = ? WHERE id = ?',
      [amount, notes, existing[0].id]
    );
  }
}
