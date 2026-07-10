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
  ipoApplications: Array<{
    ipoName: string;
    amount: number;
    allotmentStatus: string;
    grossProfitLoss?: number | null;
    memberShare?: number | null;
  }>;
}): string {
  const lines = [
    `IPO Member Statement`,
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
    `Gross IPO P&L: ${formatCurrency(statement.summary.grossIpoPnL)}`,
    `Your profit share: ${formatCurrency(statement.summary.totalMemberShare)}`,
    ``,
    `IPO Applications`,
  ].filter(Boolean);

  for (const app of statement.ipoApplications) {
    lines.push(
      `- ${app.ipoName}: ${app.allotmentStatus}, ${formatCurrency(app.amount)}` +
        (app.grossProfitLoss != null ? `, P&L ${formatCurrency(app.grossProfitLoss)}` : '') +
        (app.memberShare != null ? `, share ${formatCurrency(app.memberShare)}` : '')
    );
  }
  return lines.join('\n');
}
