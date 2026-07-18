import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard, { PnlStatCard } from '../components/StatCard';
import ListRow from '../components/ListRow';
import Loading from '../components/Loading';
import { formatCurrency } from '../utils/format';
import { colors, typography } from '../theme';
import { ui } from '../styles/ui';
import { useQuery } from '../hooks/useQuery';

function ipoRowSubtitle(r: any) {
  const pending = formatCurrency(r.pendingReturn);
  const pnl = formatCurrency(r.totalProfitLoss);
  return `Pending ${pending} · P&L ${pnl}`;
}

function memberRowSubtitle(r: any) {
  const pending = formatCurrency(r.willReceiveFromTeam);
  const pnl = formatCurrency(r.totalIpoProfit);
  return `Pending ${pending} · P&L ${pnl}`;
}

export default function SummaryScreen() {
  const fetcher = useCallback(async () => {
    const { data } = await client.get('/summary');
    return data;
  }, []);
  const { data, loading, error, reload } = useQuery(fetcher, [], { cacheKey: 'summary' });

  if (loading && !data) return <Loading />;

  if ((error && !data) || !data) {
    return (
      <Screen>
        <ContentCard title="Could not load summary">
          <Text style={styles.error}>{error || 'No data returned'}</Text>
          <Button mode="contained" onPress={() => reload()}>Retry</Button>
        </ContentCard>
      </Screen>
    );
  }

  const profit = Number(data.totals?.totalIpoProfit ?? 0);
  const ipo = data.ipoSummary;
  const ipoTotals = ipo?.totals;
  const memberTotals = data.totals;

  return (
    <Screen>
      <PageHeader title="Team Summary" subtitle="Wallet, IPOs & members" />

      <ContentCard title="Overview">
        <View style={ui.statRow}>
          <StatCard title="Free Wallet" value={formatCurrency(data.availableFreeAmount)} variant="primary" />
          <PnlStatCard title="Team IPO Profit" value={profit} formatted={formatCurrency(profit)} />
          <StatCard
            title="Pending From Team"
            value={formatCurrency(memberTotals.willReceiveFromTeam)}
            variant="warning"
          />
        </View>
      </ContentCard>

      {ipo?.rows?.length > 0 && (
        <ContentCard title={`IPOs (${ipoTotals.ipoCount})`}>
          {ipo.rows.map((r: any) => (
            <ListRow
              key={r.ipoId}
              title={r.name}
              subtitle={ipoRowSubtitle(r)}
              badge={r.status === 'OPEN' ? 'Open' : undefined}
              onPress={() => router.push(`/(manager)/ipos/${r.ipoId}`)}
            />
          ))}

          <Text style={styles.totalsLine}>
            Totals: {formatCurrency(ipoTotals.totalDistributed)} distributed ·{' '}
            {formatCurrency(ipoTotals.totalProfitLoss)} P&L · {formatCurrency(ipoTotals.pendingReturn)} pending
          </Text>
        </ContentCard>
      )}

      <ContentCard title={`Members (${data.rows.length})`}>
        {data.rows.map((r: any) => (
          <ListRow
            key={r.memberId}
            title={r.displayName}
            subtitle={memberRowSubtitle(r)}
            badge={r.mismatch ? '!' : undefined}
          />
        ))}

        <Text style={styles.totalsLine}>
          Totals: {formatCurrency(memberTotals.totalGiven)} given ·{' '}
          {formatCurrency(memberTotals.totalIpoProfit)} P&L ·{' '}
          {formatCurrency(memberTotals.willReceiveFromTeam)} pending
        </Text>
      </ContentCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.error, marginBottom: 12 },
  totalsLine: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
    lineHeight: 18,
  },
});
