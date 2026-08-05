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

/** Newest IPO open date first (falls back to created / id). */
export function compareIpoByDateDesc(a: any = {}, b: any = {}): number {
  const dateMs = (row: any) => {
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

export function groupApplicationsByIpo(apps: GroupApplication[]) {
  const map = new Map<string, GroupApplication[]>();
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
      openDate: (rows[0] as any)?.openDate || null,
      rows: rows.sort((x, y) => (x.memberName || '').localeCompare(y.memberName || '')),
    }))
    .sort((a, b) => compareIpoByDateDesc(a, b));
}

export function summarizeIpoGroupRows(rows: Array<{ allotmentStatus: string }>): string {
  const pending = rows.filter((r) => r.allotmentStatus === 'PENDING').length;
  const allotted = rows.filter((r) => r.allotmentStatus === 'ALLOTED').length;
  const notAlloted = rows.filter((r) => r.allotmentStatus === 'NOT_ALLOTED').length;
  const parts = [`${rows.length} application${rows.length === 1 ? '' : 's'}`];
  if (allotted) parts.push(`${allotted} allotted`);
  if (pending) parts.push(`${pending} pending`);
  if (notAlloted) parts.push(`${notAlloted} not allotted`);
  return parts.join(' · ');
}

export function hasPendingAllotment(dashboard: MemberDashboard | null | undefined): boolean {
  const personal = dashboard?.ipoApplications?.some((a) => a.allotmentStatus === 'PENDING');
  const group = dashboard?.subGroup?.groupApplications?.some((a) => a.allotmentStatus === 'PENDING');
  return !!(personal || group);
}

/** @deprecated Use dashboard payload; kept for soft warning only. */
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

/** Build attention cards on-device when API extras are missing (older server). */
export function buildAttentionFromDashboard(dashboard: MemberDashboard | null | undefined) {
  if (!dashboard) return [];
  const items: Array<{
    id: string;
    priority: 'high' | 'medium' | 'low';
    type: string;
    title: string;
    detail?: string;
    action?: string;
    ipoName?: string;
  }> = [];
  const pendingReturn = Number(dashboard.stats?.pendingReturn ?? 0);
  if (pendingReturn > 0) {
    items.push({
      id: 'pending-return',
      priority: 'high',
      type: 'PENDING_RETURN',
      title: `${formatCurrency(pendingReturn)} pending return to manager`,
      detail: 'Fund received minus what you have returned so far.',
      action: 'fund-return',
    });
  }
  const pendingIpos = [
    ...(dashboard.ipoApplications ?? []).filter((a) => a.allotmentStatus === 'PENDING').map((a) => a.ipoName),
    ...(dashboard.subGroup?.groupApplications ?? [])
      .filter((a) => a.allotmentStatus === 'PENDING')
      .map((a) => a.ipoName),
  ];
  const uniquePending = [...new Set(pendingIpos)];
  if (uniquePending.length) {
    items.push({
      id: 'pending-allotment',
      priority: 'medium',
      type: 'PENDING_ALLOTMENT',
      title: `Check allotment for ${uniquePending.slice(0, 2).join(', ')}${uniquePending.length > 2 ? '…' : ''}`,
      detail: 'Use official BSE/NSE portals with each member PAN.',
      action: 'allotment',
    });
  }
  if (dashboard.subGroup?.isLeader) {
    const owing = (dashboard.subGroup.members ?? []).filter(
      (m) => !m.isLeader && Number(m.pendingReturn ?? 0) > 0
    );
    if (owing.length) {
      const total = owing.reduce((s, m) => s + Number(m.pendingReturn ?? 0), 0);
      items.push({
        id: 'group-collections',
        priority: 'high',
        type: 'GROUP_COLLECTION',
        title: `Collect ${formatCurrency(total)} from ${owing.length} member(s)`,
        detail: owing.map((m) => m.displayName).slice(0, 4).join(', '),
        action: 'collections',
      });
    }
  }
  return items;
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
