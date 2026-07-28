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
  const distributed = formatCurrency(r.totalDistributed);
  const pending = formatCurrency(r.pendingReturn);
  const pnl = formatCurrency(r.totalProfitLoss);
  return `${distributed} distributed · ${pending} with members · P&L ${pnl}`;
}

function memberRowSubtitle(r: any) {
  const pending = formatCurrency(r.willReceiveFromTeam);
  const pnl = formatCurrency(r.totalIpoProfit);
  return `Pending ${pending} · P&L ${pnl}`;
}

function sumOpenIpoTotals(rows: any[]) {
  return rows.reduce(
    (acc, r) => ({
      totalDistributed: acc.totalDistributed + Number(r.totalDistributed || 0),
      totalReturned: acc.totalReturned + Number(r.totalReturned || 0),
      pendingReturn: acc.pendingReturn + Number(r.pendingReturn || 0),
      applicationCount: acc.applicationCount + Number(r.applicationCount || 0),
    }),
    { totalDistributed: 0, totalReturned: 0, pendingReturn: 0, applicationCount: 0 }
  );
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
  const openIpoRows = (ipo?.rows ?? []).filter((r: any) => r.status === 'OPEN');
  const openIpoTotals = sumOpenIpoTotals(openIpoRows);

  return (
    <Screen>
      <PageHeader title="Team Summary" subtitle="Wallet, IPOs & members" />

      <ContentCard title="Overview">
        <View style={ui.statRow}>
          <StatCard title="Free Wallet" value={formatCurrency(data.availableFreeAmount)} variant="primary" />
          <StatCard
            title="Distributed (open)"
            value={formatCurrency(openIpoTotals.totalDistributed)}
            variant="info"
          />
          <PnlStatCard title="Team IPO Profit" value={profit} formatted={formatCurrency(profit)} />
          <StatCard
            title="Pending From Team"
            value={formatCurrency(memberTotals.willReceiveFromTeam)}
            variant="warning"
          />
        </View>
      </ContentCard>

      <ContentCard title={`Open IPOs — current distributed (${openIpoRows.length})`}>
        <View style={ui.statRow}>
          <StatCard
            title="Distributed now"
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
        {openIpoRows.length > 0 ? (
          <>
            {openIpoRows.map((r: any) => (
              <ListRow
                key={r.ipoId}
                title={r.name}
                subtitle={`${formatCurrency(r.totalDistributed)} distributed · ${formatCurrency(r.pendingReturn)} with members`}
                badge="Open"
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
      </ContentCard>

      {ipo?.rows?.length > 0 && (
        <ContentCard title={`All IPOs (${ipoTotals.ipoCount})`}>
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
            All: {formatCurrency(ipoTotals.totalDistributed)} distributed ·{' '}
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
  empty: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
});
