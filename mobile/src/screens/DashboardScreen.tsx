import { useCallback } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard, { PnlStatCard } from '../components/StatCard';
import Loading from '../components/Loading';
import ListRow from '../components/ListRow';
import Banner from '../components/Banner';
import { formatCurrency, formatDateTime, formatPan } from '../utils/format';
import { openActionSheet } from '../utils/actionSheet';
import { ui } from '../styles/ui';
import { useQuery } from '../hooks/useQuery';

type DashboardData = {
  walletBalance: number;
  activeMembers: number;
  managerShare: number;
  openIssueCount: number;
  pendingReturns: any[];
  recentTransactions: any[];
};

async function fetchDashboard(): Promise<DashboardData> {
  const { data } = await client.get('/dashboard');
  return data;
}

export default function DashboardScreen() {
  const fetcher = useCallback(() => fetchDashboard(), []);
  const { data, loading, refresh } = useQuery(fetcher, [], { cacheKey: 'dashboard' });

  const pendingReturns = data?.pendingReturns ?? [];
  const txns = data?.recentTransactions ?? [];
  const openIssueCount = data?.openIssueCount ?? 0;

  const openHeaderMore = () => {
    openActionSheet('Dashboard', [
      { text: 'Refresh', onPress: refresh },
      { text: 'Profit sharing', onPress: () => router.push('/(manager)/profit-sharing') },
      ...(pendingReturns.length > 0
        ? [{ text: 'Pending returns', onPress: () => router.push('/(manager)/summary') }]
        : []),
      { text: 'All transactions', onPress: () => router.push('/(manager)/wallet') },
    ]);
  };

  if (loading && !data) return <Loading />;

  return (
    <Screen>
      <PageHeader
        title="Dashboard"
        extra={
          <Button compact mode="text" onPress={openHeaderMore}>
            More
          </Button>
        }
      />
      {openIssueCount > 0 && (
        <>
          <Banner variant="warn">
            {`${openIssueCount} open issue${openIssueCount === 1 ? '' : 's'}`}
          </Banner>
          <Button
            mode="contained"
            onPress={() => router.push('/(manager)/notifications')}
            style={{ marginBottom: 12 }}
          >
            View notifications
          </Button>
        </>
      )}
      <View style={ui.statRow}>
        <StatCard title="Wallet" value={formatCurrency(data?.walletBalance ?? 0)} variant="primary" />
        <PnlStatCard
          title="Net share"
          value={data?.managerShare ?? 0}
          formatted={formatCurrency(data?.managerShare ?? 0)}
        />
        <StatCard title="Active members" value={data?.activeMembers ?? 0} variant="info" />
      </View>
      {pendingReturns.length > 0 && (
        <ContentCard title="Pending returns">
          {pendingReturns.map((r: any) => (
            <ListRow
              key={r.memberId}
              title={r.displayName}
              subtitle={`${formatCurrency(r.willReceiveFromTeam)} · PAN ${formatPan(r.pan)}`}
            />
          ))}
        </ContentCard>
      )}
      <ContentCard title="Recent transactions">
        {txns.map((t: any) => (
          <ListRow
            key={t.id}
            title={t.type?.replace(/_/g, ' ')}
            subtitle={`${formatCurrency(t.amount)} · ${formatDateTime(t.txn_date)}`}
          />
        ))}
      </ContentCard>
    </Screen>
  );
}
