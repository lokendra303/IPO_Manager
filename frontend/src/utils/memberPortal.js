import { formatCurrency } from './format';

export const ALLOTMENT_COLORS = {
  PENDING: 'processing',
  ALLOTED: 'success',
  NOT_ALLOTED: 'default',
  NOT_APPLIED: 'default',
};

export function formatAllotmentLabel(status) {
  return String(status || '').replace(/_/g, ' ');
}

/** Newest IPO open date first (falls back to created / id). */
export function compareIpoByDateDesc(a = {}, b = {}) {
  const dateMs = (row) => {
    const raw = row.openDate || row.open_date || row.ipoOpenDate || row.ipo_open_date || null;
    if (raw) {
      const t = new Date(raw).getTime();
      if (!Number.isNaN(t)) return t;
    }
    return 0;
  };
  const diff = dateMs(b) - dateMs(a);
  if (diff !== 0) return diff;
  const idDiff = Number(b.ipoId || b.ipo_id || 0) - Number(a.ipoId || a.ipo_id || 0);
  if (idDiff !== 0) return idDiff;
  return String(a.ipoName || a.name || '').localeCompare(String(b.ipoName || b.name || ''));
}

export function groupApplicationsByIpo(apps) {
  const map = new Map();
  for (const app of apps) {
    const key = app.ipoName;
    const list = map.get(key) ?? [];
    list.push(app);
    map.set(key, list);
  }
  return [...map.entries()]
    .map(([ipoName, rows]) => ({
      ipoName,
      ipoId: rows[0]?.ipoId ?? null,
      openDate: rows[0]?.openDate || rows[0]?.open_date || null,
      rows: rows.sort((x, y) => (x.memberName || '').localeCompare(y.memberName || '')),
    }))
    .sort((a, b) => compareIpoByDateDesc(a, b));
}

export function summarizeIpoGroupRows(rows) {
  const pending = rows.filter((r) => r.allotmentStatus === 'PENDING').length;
  const allotted = rows.filter((r) => r.allotmentStatus === 'ALLOTED').length;
  const notAlloted = rows.filter((r) => r.allotmentStatus === 'NOT_ALLOTED').length;
  const parts = [`${rows.length} application${rows.length === 1 ? '' : 's'}`];
  if (allotted) parts.push(`${allotted} allotted`);
  if (pending) parts.push(`${pending} pending`);
  if (notAlloted) parts.push(`${notAlloted} not allotted`);
  return parts.join(' · ');
}

export function statementToText(statement) {
  const lines = [
    'IPO Member Full Ledger',
    `App: ${statement.appName || 'IPO Team Manager'}`,
    `Team: ${statement.teamName || 'IPO Team'}`,
    `Developer: ${statement.developerName || 'Lokendra'}`,
    `Generated: ${new Date(statement.generatedAt).toLocaleString()}`,
    '',
    `Member: ${statement.member.displayName}`,
    `PAN: ${statement.member.pan}`,
    statement.member.upi ? `UPI: ${statement.member.upi}` : '',
    '',
    'Summary',
    `Fund received: ${formatCurrency(statement.summary.totalGiven)}`,
    `Fund returned: ${formatCurrency(statement.summary.totalReceived)}`,
    `Pending return: ${formatCurrency(statement.summary.pendingReturn)}`,
    `IPOs applied: ${statement.summary.iposApplied ?? 0}`,
    `IPOs allotted: ${statement.summary.iposAlloted ?? 0}`,
    `Gross IPO P&L: ${formatCurrency(statement.summary.grossIpoPnL)}`,
    `Your profit share: ${formatCurrency(statement.summary.totalMemberShare)}`,
    `Manager profit share: ${formatCurrency(statement.summary.totalManagerShare ?? 0)}`,
    `Provider profit share: ${formatCurrency(statement.summary.totalProviderShare ?? 0)}`,
    '',
    'IPO Applications (full ledger)',
  ].filter(Boolean);

  for (const app of [...(statement.ipoApplications ?? [])].sort(compareIpoByDateDesc)) {
    lines.push(
      `- ${app.ipoName}: ${app.allotmentStatus}, fund ${formatCurrency(app.amount)}` +
        (app.fundReturned ? ', returned' : ', pending return') +
        (app.grossProfitLoss != null ? `, gross P&L ${formatCurrency(app.grossProfitLoss)}` : '') +
        (app.memberShare != null ? `, your share ${formatCurrency(app.memberShare)}` : '') +
        (app.managerShare != null ? `, manager share ${formatCurrency(app.managerShare)}` : '') +
        (app.providerShare != null ? `, provider share ${formatCurrency(app.providerShare)}` : '')
    );
  }

  if (statement.ledger?.length) {
    lines.push('', 'Fund transactions');
    for (const row of statement.ledger) {
      lines.push(
        `- ${row.type}: ${formatCurrency(row.amount)}` +
          (row.ipoName ? ` (${row.ipoName})` : '') +
          (row.notes ? ` — ${row.notes}` : '')
      );
    }
  }

  return lines.join('\n');
}

export function buildCollectionWhatsAppMessage(memberName, amount, leaderName) {
  const who = leaderName ? `${leaderName} (group leader)` : 'your group leader';
  return `Hi ${memberName}, please return ${formatCurrency(amount)} to ${who} for IPO fund settlement. Thank you.`;
}

export function openWhatsAppReminder(message) {
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}
