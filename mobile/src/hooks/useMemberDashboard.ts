import { useCallback, useEffect, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { isStaleGroupLeaderApi } from '../utils/memberPortal';
import { getErrorMessage } from '../utils/errors';
import type { ActivityItem, UpcomingIpo } from './useMemberPortalExtras';
import type { AttentionItem } from '../components/AttentionCard';

export type GroupApplication = {
  id: number;
  ipoId: number;
  ipoName: string;
  ipoStatus?: string;
  memberId: number;
  memberName: string;
  memberPan: string;
  amount: number;
  allotmentStatus: string;
  investorCategory?: string | null;
  grossProfitLoss?: number | null;
  memberShare?: number | null;
  shareStatus?: string | null;
  fundReturned?: boolean;
};

export type MemberDashboard = {
  member?: {
    displayName?: string;
    pan?: string;
    upi?: string | null;
    email?: string | null;
  };
  subGroup?: {
    id: number;
    name: string;
    isLeader: boolean;
    leaderDisplayName: string | null;
    leaderPan: string | null;
    memberCount?: number;
    groupStats?: {
      iposApplied?: number;
      iposPending?: number;
      iposAlloted?: number;
      iposNotAlloted?: number;
      grossIpoPnL?: number;
      totalMemberShare?: number;
    };
    members?: Array<{
      id: number;
      displayName: string;
      pan: string;
      upi?: string | null;
      status: string;
      pendingReturn: number;
      iposApplied: number;
      iposPending?: number;
      iposAlloted?: number;
      iposNotAlloted?: number;
      grossIpoPnL?: number;
      totalMemberShare?: number;
      isLeader: boolean;
    }>;
    groupApplications?: GroupApplication[];
    bulkPayments?: Array<{
      id: number;
      ipoName: string;
      totalAmount: number;
      memberCount: number;
      paidAt: string | null;
      investorCategory: string | null;
    }>;
  } | null;
  stats?: {
    totalGiven?: number;
    totalReceived?: number;
    pendingReturn?: number;
    bonus?: number;
    iposApplied?: number;
    iposPending?: number;
    iposAlloted?: number;
    iposNotAlloted?: number;
    grossIpoPnL?: number;
    totalMemberShare?: number;
  };
  ipoApplications?: Array<{
    id: number;
    ipoId?: number;
    ipoName: string;
    allotmentStatus: string;
    amount: number;
    grossProfitLoss?: number | null;
    memberShare?: number | null;
    fundReturned?: boolean;
    shareStatus?: string | null;
  }>;
  ledgerEntries?: Array<{
    id: number;
    type: string;
    amount: number;
    txnDate: string;
    ipoName: string | null;
    notes: string | null;
  }>;
  attention?: AttentionItem[];
  activity?: ActivityItem[];
  upcomingIpos?: UpcomingIpo[];
};

export function useMemberDashboard() {
  const { user, isMember } = useAuth();
  const [data, setData] = useState<MemberDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staleWarning, setStaleWarning] = useState(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!isMember || !user?.id) {
        setLoading(false);
        return null;
      }

      if (!opts?.silent) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const { data: fresh } = await client.get<MemberDashboard>('/member-portal/dashboard', {
          timeout: 90000,
        });
        setStaleWarning(isStaleGroupLeaderApi(fresh.subGroup));
        setData(fresh);
        return fresh;
      } catch (err) {
        const message = getErrorMessage(err, 'Could not load member portal');
        setError(message);
        setData((prev) => prev);
        if (!opts?.silent) setData(null);
        return null;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isMember, user?.id]
  );

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const refresh = useCallback(() => load({ silent: true }), [load]);

  return { data, loading, refreshing, error, staleWarning, refresh, reload: load };
}
