import { Linking } from 'react-native';
import { formatCurrency } from './format';

export async function shareWhatsAppMessage(message: string): Promise<boolean> {
  const encoded = encodeURIComponent(message);
  const url = `whatsapp://send?text=${encoded}`;
  const webUrl = `https://wa.me/?text=${encoded}`;
  try {
    const can = await Linking.canOpenURL(url);
    await Linking.openURL(can ? url : webUrl);
    return true;
  } catch {
    try {
      await Linking.openURL(webUrl);
      return true;
    } catch {
      return false;
    }
  }
}

export function buildCollectionWhatsAppMessage(
  memberName: string,
  amount: number,
  leaderName?: string
): string {
  const who = leaderName ? `${leaderName} (group leader)` : 'your group leader';
  return `Hi ${memberName}, please return ${formatCurrency(amount)} to ${who} for IPO fund settlement. Thank you.`;
}

export function statementToText(statement: {
  generatedAt: string;
  member: { displayName: string; pan: string; email?: string | null; upi?: string | null };
  summary: Record<string, number>;
  ledger?: Array<{ type: string; amount: number; ipoName?: string | null; notes?: string | null }>;
  ipoApplications: Array<{
    ipoName: string;
    amount: number;
    allotmentStatus: string;
    fundReturned?: boolean;
    grossProfitLoss?: number | null;
    memberShare?: number | null;
    managerShare?: number | null;
    providerShare?: number | null;
  }>;
}): string {
  const lines = [
    `IPO Member Full Ledger`,
    `App: ${(statement as any).appName || 'IPO Team Manager'}`,
    `Team: ${(statement as any).teamName || 'IPO Team'}`,
    `Developer: ${(statement as any).developerName || 'Lokendra'}`,
    `Generated: ${new Date(statement.generatedAt).toLocaleString()}`,
    ``,
    `Member: ${statement.member.displayName}`,
    `PAN: ${statement.member.pan}`,
    statement.member.upi ? `UPI: ${statement.member.upi}` : '',
    ``,
    `Summary`,
    `Fund received: ${formatCurrency(statement.summary.totalGiven)}`,
    `Fund returned: ${formatCurrency(statement.summary.totalReceived)}`,
    `Pending return: ${formatCurrency(statement.summary.pendingReturn)}`,
    `IPOs applied: ${statement.summary.iposApplied ?? 0}`,
    `IPOs allotted: ${statement.summary.iposAlloted ?? 0}`,
    `Gross IPO P&L: ${formatCurrency(statement.summary.grossIpoPnL)}`,
    `Your profit share: ${formatCurrency(statement.summary.totalMemberShare)}`,
    `Manager profit share: ${formatCurrency(statement.summary.totalManagerShare ?? 0)}`,
    `Provider profit share: ${formatCurrency(statement.summary.totalProviderShare ?? 0)}`,
    ``,
    `IPO Applications (full ledger)`,
  ].filter(Boolean);

  for (const app of statement.ipoApplications) {
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
