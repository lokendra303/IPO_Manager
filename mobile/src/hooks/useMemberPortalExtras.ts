import { useCallback } from 'react';
import { isAxiosError } from 'axios';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useQuery } from './useQuery';
import type { AttentionItem } from '../components/AttentionCard';

async function safeMemberGet<T>(url: string, fallback: T): Promise<T> {
  try {
    const { data } = await client.get<T>(url, { timeout: 60000 });
    return data;
  } catch (err) {
    if (isAxiosError(err) && (err.response?.status === 403 || err.response?.status === 404)) {
      return fallback;
    }
    throw err;
  }
}

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
    return safeMemberGet<AttentionItem[]>('/member-portal/attention', []);
  }, []);
  return useQuery(fetcher, [], { enabled: isMember && !!user?.id });
}

export function useMemberActivity(limit = 40) {
  const { user, isMember } = useAuth();
  const fetcher = useCallback(async () => {
    return safeMemberGet<ActivityItem[]>(`/member-portal/activity?limit=${limit}`, []);
  }, [limit]);
  return useQuery(fetcher, [limit], { enabled: isMember && !!user?.id });
}

export function useUpcomingIpos() {
  const { user, isMember } = useAuth();
  const fetcher = useCallback(async () => {
    return safeMemberGet<UpcomingIpo[]>('/member-portal/upcoming-ipos', []);
  }, []);
  return useQuery(fetcher, [], { enabled: isMember && !!user?.id });
}
