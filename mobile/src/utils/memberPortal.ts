import type { GroupApplication, MemberDashboard } from '../hooks/useMemberDashboard';
import { formatCurrency } from './format';

export const ALLOTMENT_COLORS: Record<string, string> = {
  PENDING: '#d97706',
  ALLOTED: '#059669',
  NOT_ALLOTED: '#64748b',
  NOT_APPLIED: '#94a3b8',
};

export function formatAllotmentLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

export function groupApplicationsByIpo(apps: GroupApplication[]) {
  const map = new Map<string, GroupApplication[]>();
  for (const app of apps) {
    const key = app.ipoName;
    const list = map.get(key) ?? [];
    list.push(app);
    map.set(key, list);
  }
  return [...map.entries()].map(([ipoName, rows]) => ({ ipoName, rows }));
}

export function hasPendingAllotment(dashboard: MemberDashboard | null | undefined): boolean {
  const personal = dashboard?.ipoApplications?.some((a) => a.allotmentStatus === 'PENDING');
  const group = dashboard?.subGroup?.groupApplications?.some((a) => a.allotmentStatus === 'PENDING');
  return !!(personal || group);
}

/** Production API before group leader enrichment returns members without P&L/allotment fields. */
export function isStaleGroupLeaderApi(
  subGroup: MemberDashboard['subGroup'] | null | undefined
): boolean {
  if (!subGroup?.isLeader) return false;
  const members = subGroup.members ?? [];
  if (!members.length) return false;

  const missingMemberFields = members.some(
    (m) =>
      m.iposApplied > 0 &&
      (m.iposPending === undefined ||
        m.iposAlloted === undefined ||
        m.grossIpoPnL === undefined ||
        m.totalMemberShare === undefined)
  );
  if (missingMemberFields) return true;

  const gs = subGroup.groupStats;
  const hasGroupActivity = members.some((m) => m.iposApplied > 0);
  if (hasGroupActivity && (!gs || gs.iposApplied == null || gs.iposApplied === 0)) return true;

  if (hasGroupActivity && !subGroup.groupApplications?.length) return true;

  return false;
}

export function formatIpoShareLine(app: {
  allotmentStatus: string;
  grossProfitLoss?: number | null;
  memberShare?: number | null;
  shareStatus?: string | null;
}): string | null {
  if (app.allotmentStatus !== 'ALLOTED' || app.grossProfitLoss == null) return null;
  if (app.memberShare != null) return `Member share ${formatCurrency(app.memberShare)}`;
  if (app.shareStatus === 'pending') return 'Member share pending split';
  return null;
}
