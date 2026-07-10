import { useCallback, useEffect, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { isStaleGroupLeaderApi } from '../utils/memberPortal';
import { config } from '../config';
import { getErrorMessage } from '../utils/errors';

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
};

export function useMemberDashboard() {
  const { user, isMember } = useAuth();
  const [data, setData] = useState<MemberDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const { data: fresh } = await client.get<MemberDashboard>('/member-portal/dashboard');
        if (isStaleGroupLeaderApi(fresh.subGroup)) {
          throw new Error(
            `Server at ${config.apiBaseUrl} returned outdated group data. Tap Refresh or log in again.`
          );
        }
        setData(fresh);
        return fresh;
      } catch (err) {
        setError(getErrorMessage(err, 'Could not load member portal'));
        setData(null);
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

  return { data, loading, refreshing, error, refresh, reload: load };
}
