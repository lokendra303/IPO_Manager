import { useCallback, useMemo } from 'react';
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
import Tag from '../components/Tag';
import Banner from '../components/Banner';
import { formatCurrency, formatDateTime, formatPan } from '../utils/format';
import { ui } from '../styles/ui';
import { useQuery } from '../hooks/useQuery';

type DashboardData = {
  wallet: { balance?: number };
  summary: any;
  txns: any[];
  openIssueCount: number;
  pnlTotals: any;
};

async function fetchDashboard(): Promise<DashboardData> {
  const [w, s, t, issues, pnl] = await Promise.all([
    client.get('/wallet'),
    client.get('/summary'),
    client.get('/wallet/transactions'),
    client.get('/member-issues/count'),
    client.get('/profit-shares/totals').catch(() => ({ data: null })),
  ]);
  return {
    wallet: w.data,
    summary: s.data,
    txns: (t.data || []).slice(0, 8),
    openIssueCount: issues.data.openCount ?? 0,
    pnlTotals: pnl.data,
  };
}

export default function DashboardScreen() {
  const fetcher = useCallback(() => fetchDashboard(), []);
  const { data, loading, refresh } = useQuery(fetcher);

  const pendingReturns = useMemo(
    () => (data?.summary?.rows ?? []).filter((r: any) => Number(r.willReceiveFromTeam) > 0),
    [data?.summary]
  );

  if (loading && !data) return <Loading />;

  const wallet = data?.wallet ?? null;
  const summary = data?.summary ?? null;
  const txns = data?.txns ?? [];
  const openIssueCount = data?.openIssueCount ?? 0;
  const pnlTotals = data?.pnlTotals ?? null;
  const overall = pnlTotals?.overall ?? {};
  const activeMembers = summary?.rows?.filter((r: any) => r.status === 'ACTIVE').length ?? 0;

  return (
    <Screen>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your wallet, team, and recent activity"
        extra={<Button compact mode="outlined" onPress={refresh}>Refresh</Button>}
      />
      {openIssueCount > 0 && (
        <>
          <Banner variant="warn">
            {`${openIssueCount} open member issue${openIssueCount === 1 ? '' : 's'} need attention`}
          </Banner>
          <Button mode="contained" onPress={() => router.push('/(manager)/notifications')} style={{ marginBottom: 12 }}>
            View notifications
          </Button>
        </>
      )}
      <ContentCard title="P&L overview">
        <View style={ui.statRow}>
          <StatCard title="Wallet balance" value={formatCurrency(wallet?.balance ?? 0)} variant="primary" />
          <PnlStatCard title="Your net share" value={overall.managerShare ?? 0} formatted={formatCurrency(overall.managerShare ?? 0)} />
        </View>
        <View style={ui.statRow}>
          <PnlStatCard title="Your profit share" value={overall.managerProfit ?? 0} formatted={formatCurrency(overall.managerProfit ?? 0)} />
          <PnlStatCard title="Your loss share" value={overall.managerLoss ?? 0} formatted={formatCurrency(overall.managerLoss ?? 0)} />
        </View>
        <View style={ui.statRow}>
          <PnlStatCard title="Gross IPO P&L" value={overall.grossIpoPnL ?? 0} formatted={formatCurrency(overall.grossIpoPnL ?? summary?.totals?.totalIpoProfit ?? 0)} />
          <StatCard title="Active members" value={activeMembers} variant="info" />
        </View>
        <Button mode="text" onPress={() => router.push('/(manager)/profit-sharing')}>Profit sharing details →</Button>
      </ContentCard>
      {pendingReturns.length > 0 && (
        <ContentCard title="Pending fund returns">
          {pendingReturns.slice(0, 8).map((r: any) => (
            <ListRow key={r.memberId} title={r.displayName} subtitle={`PAN ${formatPan(r.pan)} · ${formatCurrency(r.willReceiveFromTeam)}`} />
          ))}
          <Button mode="text" onPress={() => router.push('/(manager)/summary')}>Full summary →</Button>
        </ContentCard>
      )}
      <ContentCard title="Recent wallet transactions">
        {txns.map((t) => (
          <ListRow
            key={t.id}
            title={t.type?.replace(/_/g, ' ')}
            subtitle={`${formatDateTime(t.txn_date)} · ${formatCurrency(t.amount)} · Bal ${formatCurrency(t.balance_after)}`}
            right={<Tag label={t.type} />}
          />
        ))}
        <Button mode="text" onPress={() => router.push('/(manager)/wallet')}>View all →</Button>
      </ContentCard>
    </Screen>
  );
}
