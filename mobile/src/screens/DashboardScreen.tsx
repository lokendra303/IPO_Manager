import { useCallback } from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Button } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import Loading from '../components/Loading';
import ListRow from '../components/ListRow';
import Banner from '../components/Banner';
import { formatCurrency, formatDateTime, formatPan, pnlColor } from '../utils/format';
import { openActionSheet } from '../utils/actionSheet';
import { useQuery } from '../hooks/useQuery';
import { colors, radii, spacing } from '../theme';

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

function AmountLine({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.amountLine}>
      <Text style={styles.amountLabel}>{label}</Text>
      <Text style={[styles.amountValue, valueColor ? { color: valueColor } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

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
      { text: 'Live IPOs', onPress: () => router.push('/(manager)/live-ipos' as never) },
      { text: 'GMP', onPress: () => router.push('/(manager)/gmp' as never) },
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
          {`${formatCurrency(totalPendingReturn)} to collect · ${pendingReturns.length} member${
            pendingReturns.length === 1 ? '' : 's'
          }`}
        </Banner>
      )}
      <View style={styles.pair}>
        <View style={[styles.tile, styles.tilePrimary]}>
          <Text style={styles.tileLabel}>Wallet</Text>
          <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {formatCurrency(data?.walletBalance ?? 0)}
          </Text>
        </View>
        <View style={[styles.tile, styles.tileShare]}>
          <Text style={styles.tileLabel}>Net share</Text>
          <Text
            style={[styles.tileValue, { color: pnlColor(data?.managerShare ?? 0) }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {formatCurrency(data?.managerShare ?? 0)}
          </Text>
        </View>
      </View>
      <View style={[styles.tile, styles.tileInfo, styles.tileFull]}>
        <Text style={styles.tileLabel}>Active members</Text>
        <Text style={styles.tileValue}>{data?.activeMembers ?? 0}</Text>
      </View>

      <ContentCard title={`Open IPOs (${openIpoTotals.ipoCount})`}>
        <AmountLine label="Distributed" value={formatCurrency(openIpoTotals.totalDistributed)} />
        <AmountLine label="Returned" value={formatCurrency(openIpoTotals.totalReturned)} valueColor={colors.success} />
        <AmountLine label="With members" value={formatCurrency(openIpoTotals.pendingReturn)} valueColor={colors.warning} />
        {openIpos.length > 0 ? (
          openIpos.map((r) => (
            <Pressable
              key={r.ipoId}
              style={({ pressed }) => [styles.ipo, pressed && styles.ipoPressed]}
              onPress={() => router.push(`/(manager)/ipos/${r.ipoId}`)}
            >
              <Text style={styles.ipoName}>{r.name}</Text>
              <Text style={styles.ipoLine}>{formatCurrency(r.totalDistributed)} distributed</Text>
              <Text style={styles.ipoLine}>{formatCurrency(r.pendingReturn)} with members</Text>
            </Pressable>
          ))
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
  pair: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  tile: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    minHeight: 88,
    justifyContent: 'center',
  },
  tileFull: { flex: 0, marginBottom: spacing.md },
  tilePrimary: { backgroundColor: '#f0fdfa', borderColor: colors.primary },
  tileShare: { backgroundColor: colors.successLight, borderColor: '#86efac' },
  tileInfo: { backgroundColor: colors.infoLight, borderColor: '#7dd3fc' },
  tileLabel: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 6 },
  tileValue: { fontSize: 26, fontWeight: '800', color: colors.text },
  amountLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  amountLabel: { fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 },
  amountValue: { fontSize: 18, fontWeight: '800', color: colors.text, flexShrink: 0 },
  ipo: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: colors.border,
  },
  ipoPressed: { backgroundColor: colors.primaryLight },
  ipoName: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 4 },
  ipoLine: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 2 },
  empty: { fontSize: 16, fontWeight: '600', color: colors.text, marginTop: spacing.sm },
});
