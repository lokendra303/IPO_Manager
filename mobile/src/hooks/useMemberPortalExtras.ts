import { useCallback } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useQuery } from './useQuery';
import type { AttentionItem } from '../components/AttentionCard';

export type ActivityItem = {
  id: string;
  type: string;
  at: string;
  title: string;
  detail?: string | null;
  amount?: number | null;
  ipoName?: string | null;
  ipoId?: number;
  memberName?: string;
  status?: string;
};

export type UpcomingIpo = {
  id: number;
  name: string;
  status: string;
  openDate: string | null;
  ipoSegment: string;
  lotAmountRii: number;
  applied: boolean;
  allotmentStatus: string | null;
  appliedAmount: number | null;
};

export function useMemberAttention() {
  const { user, isMember } = useAuth();
  const fetcher = useCallback(async () => {
    const { data } = await client.get<AttentionItem[]>('/member-portal/attention');
    return data;
  }, []);
  return useQuery(fetcher, [], { enabled: isMember && !!user?.id });
}

export function useMemberActivity(limit = 40) {
  const { user, isMember } = useAuth();
  const fetcher = useCallback(async () => {
    const { data } = await client.get<ActivityItem[]>(`/member-portal/activity?limit=${limit}`);
    return data;
  }, [limit]);
  return useQuery(fetcher, [limit], { enabled: isMember && !!user?.id });
}

export function useUpcomingIpos() {
  const { user, isMember } = useAuth();
  const fetcher = useCallback(async () => {
    const { data } = await client.get<UpcomingIpo[]>('/member-portal/upcoming-ipos');
    return data;
  }, []);
  return useQuery(fetcher, [], { enabled: isMember && !!user?.id });
}
