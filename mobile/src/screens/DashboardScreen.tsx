import { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
import { colors, typography } from '../theme';

type OpenIpoRow = {
  ipoId: number;
  name: string;
  applicationCount: number;
  totalDistributed: number;
  totalReturned: number;
  pendingReturn: number;
};

type DashboardData = {
  walletBalance: number;
  activeMembers: number;
  managerShare: number;
  openIssueCount: number;
  openIpos?: OpenIpoRow[];
  openIpoTotals?: {
    totalDistributed: number;
    totalReturned: number;
    pendingReturn: number;
    applicationCount: number;
    ipoCount: number;
  };
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
  const openIpos = data?.openIpos ?? [];
  const openIpoTotals = data?.openIpoTotals ?? {
    totalDistributed: 0,
    totalReturned: 0,
    pendingReturn: 0,
    applicationCount: 0,
    ipoCount: 0,
  };
  const totalPendingReturn = pendingReturns.reduce(
    (s, r) => s + Number(r.willReceiveFromTeam || 0),
    0
  );

  const openHeaderMore = () => {
    openActionSheet('Dashboard', [
      { text: 'Refresh', onPress: refresh },
      { text: 'Profit sharing', onPress: () => router.push('/(manager)/profit-sharing') },
      { text: 'Team summary', onPress: () => router.push('/(manager)/summary') },
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
      {totalPendingReturn > 0 && (
        <Banner variant="warn">
          {`${formatCurrency(totalPendingReturn)} pending return from ${pendingReturns.length} member${
            pendingReturns.length === 1 ? '' : 's'
          } — allotted / not allotted, not yet received`}
        </Banner>
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

      <ContentCard title={`Open IPOs — distributed (${openIpoTotals.ipoCount})`}>
        <View style={ui.statRow}>
          <StatCard
            title="Distributed"
            value={formatCurrency(openIpoTotals.totalDistributed)}
            variant="info"
          />
          <StatCard
            title="Returned"
            value={formatCurrency(openIpoTotals.totalReturned)}
            variant="success"
          />
          <StatCard
            title="With members"
            value={formatCurrency(openIpoTotals.pendingReturn)}
            variant="warning"
          />
        </View>
        {openIpos.length > 0 ? (
          <>
            {openIpos.map((r) => (
              <ListRow
                key={r.ipoId}
                title={r.name}
                subtitle={`${formatCurrency(r.totalDistributed)} distributed · ${formatCurrency(r.pendingReturn)} with members`}
                onPress={() => router.push(`/(manager)/ipos/${r.ipoId}`)}
              />
            ))}
            <Text style={styles.totalsLine}>
              Total: {formatCurrency(openIpoTotals.totalDistributed)} distributed ·{' '}
              {formatCurrency(openIpoTotals.totalReturned)} returned ·{' '}
              {formatCurrency(openIpoTotals.pendingReturn)} with members
            </Text>
          </>
        ) : (
          <Text style={styles.empty}>No open IPOs right now.</Text>
        )}
        <Button mode="text" onPress={() => router.push('/(manager)/summary')} style={{ marginTop: 4 }}>
          Full summary
        </Button>
      </ContentCard>

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

const styles = StyleSheet.create({
  totalsLine: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
    lineHeight: 18,
  },
  empty: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
});
