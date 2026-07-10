import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard, { PnlStatCard } from '../components/StatCard';
import StatGrid from '../components/StatGrid';
import InfoCard from '../components/InfoCard';
import InfoLine from '../components/InfoLine';
import Loading from '../components/Loading';
import Tag from '../components/Tag';
import { formatCurrency, formatPan, pnlColor } from '../utils/format';
import { colors, typography } from '../theme';
import { ui } from '../styles/ui';
import { useQuery } from '../hooks/useQuery';

export default function SummaryScreen() {
  const fetcher = useCallback(async () => {
    const { data } = await client.get('/summary');
    return data;
  }, []);
  const { data, loading, error, reload } = useQuery(fetcher);

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
      <PageHeader
        title="Team Summary"
        subtitle="IPO-wise and member-wise funds, allotments, returns, and profit & loss"
      />

      <ContentCard title="Overview">
        <StatGrid>
          <StatCard title="Free Wallet" value={formatCurrency(data.availableFreeAmount)} variant="primary" />
          <StatCard title="Provider Net" value={formatCurrency(data.providerNetBalance)} variant="info" />
          <PnlStatCard title="Team IPO Profit" value={profit} formatted={formatCurrency(profit)} />
          <StatCard
            title="Pending From Team"
            value={formatCurrency(memberTotals.willReceiveFromTeam)}
            variant="warning"
          />
        </StatGrid>
      </ContentCard>

      {ipo?.rows?.length > 0 && (
        <ContentCard title={`IPO-wise Summary (${ipoTotals.ipoCount})`}>
          <StatGrid>
            <StatCard title="Total Distributed" value={formatCurrency(ipoTotals.totalDistributed)} variant="info" />
            <PnlStatCard
              title="Gross IPO P&L"
              value={ipoTotals.totalProfitLoss}
              formatted={formatCurrency(ipoTotals.totalProfitLoss)}
            />
            <StatCard title="Pending IPO Returns" value={formatCurrency(ipoTotals.pendingReturn)} variant="warning" />
            <StatCard title="Manager Share" value={formatCurrency(ipoTotals.shareManagerTotal)} variant="primary" />
          </StatGrid>

          {ipo.rows.map((r: any) => (
            <InfoCard
              key={r.ipoId}
              onPress={() => router.push(`/(manager)/ipos/${r.ipoId}`)}
              variant="muted"
            >
              <View style={ui.rowActions}>
                <Text style={[ui.cardTitle, { flex: 1 }]}>{r.name}</Text>
                <Tag label={r.status} color={r.status === 'OPEN' ? '#059669' : '#64748b'} />
              </View>
              <Text style={ui.cardMeta}>
                {r.ipoSegment === 'SME' ? 'SME' : 'Mainboard'} · {r.applicationCount} members
              </Text>

              <View>
                <InfoLine label="Distributed" value={formatCurrency(r.totalDistributed)} />
                <InfoLine label="Returned" value={formatCurrency(r.totalReturned)} />
                <InfoLine
                  label="Pending return"
                  value={formatCurrency(r.pendingReturn)}
                  valueColor={Number(r.pendingReturn) > 0 ? '#dc2626' : undefined}
                />
                <InfoLine label="Fund returns" value={`${r.returnedCount} / ${r.applicationCount}`} />
                <InfoLine label="Alloted" value={String(r.allottedCount)} />
                <InfoLine label="Not alloted" value={String(r.notAllottedCount)} />
                <InfoLine label="Did not apply" value={String(r.notAppliedCount)} />
                <InfoLine label="Pending allot." value={String(r.pendingAllotmentCount)} />
                <InfoLine label="Gross P&L" value={formatCurrency(r.totalProfitLoss)} valueColor={pnlColor(r.totalProfitLoss)} />
                <InfoLine label="Provider share" value={r.shareProviderTotal ? formatCurrency(r.shareProviderTotal) : '—'} />
                <InfoLine label="Manager share" value={r.shareManagerTotal ? formatCurrency(r.shareManagerTotal) : '—'} />
                <InfoLine label="Member share" value={r.shareMemberTotal ? formatCurrency(r.shareMemberTotal) : '—'} />
                <InfoLine label="P&L splits" value={r.profitSharedCount ? String(r.profitSharedCount) : '—'} />
              </View>
            </InfoCard>
          ))}

          <InfoCard variant="totals" title="IPO totals">
            <View>
              <InfoLine label="Members" value={String(ipoTotals.applicationCount)} />
              <InfoLine label="Distributed" value={formatCurrency(ipoTotals.totalDistributed)} />
              <InfoLine label="Returned" value={formatCurrency(ipoTotals.totalReturned)} />
              <InfoLine label="Pending return" value={formatCurrency(ipoTotals.pendingReturn)} />
              <InfoLine label="Fund returns" value={`${ipoTotals.returnedCount} / ${ipoTotals.applicationCount}`} />
              <InfoLine label="Alloted" value={String(ipoTotals.allottedCount)} />
              <InfoLine label="Not alloted" value={String(ipoTotals.notAllottedCount)} />
              <InfoLine label="Did not apply" value={String(ipoTotals.notAppliedCount)} />
              <InfoLine label="Pending allot." value={String(ipoTotals.pendingAllotmentCount)} />
              <InfoLine label="Gross P&L" value={formatCurrency(ipoTotals.totalProfitLoss)} valueColor={pnlColor(ipoTotals.totalProfitLoss)} />
              <InfoLine label="Provider share" value={formatCurrency(ipoTotals.shareProviderTotal)} />
              <InfoLine label="Manager share" value={formatCurrency(ipoTotals.shareManagerTotal)} />
              <InfoLine label="Member share" value={formatCurrency(ipoTotals.shareMemberTotal)} />
              <InfoLine label="P&L splits" value={String(ipoTotals.profitSharedCount || '—')} />
            </View>
          </InfoCard>
        </ContentCard>
      )}

      <ContentCard title={`Member-wise Summary (${data.rows.length})`}>
        {data.rows.map((r: any) => (
          <InfoCard key={r.memberId} variant={r.mismatch ? 'danger' : 'muted'}>
            <View style={ui.rowActions}>
              <View style={{ flex: 1 }}>
                <Text style={ui.cardTitle}>{r.displayName}</Text>
                <Text style={ui.cardMeta}>PAN {formatPan(r.pan)}</Text>
              </View>
              <Tag label={r.status} color={r.status === 'ACTIVE' ? '#059669' : '#dc2626'} />
            </View>

            {r.memberGroupName ? (
              <Text style={styles.groupName}>Sub-group: {r.memberGroupName}</Text>
            ) : null}

            <View>
              <InfoLine label="Total given" value={formatCurrency(r.totalGiven)} />
              <InfoLine label="Total received" value={formatCurrency(r.totalReceived)} />
              <InfoLine label="Bonus" value={r.bonus ? formatCurrency(r.bonus) : '—'} />
              <InfoLine label="IPOs applied" value={String(r.iposApplied)} />
              <InfoLine label="IPOs alloted" value={String(r.iposAlloted)} />
              <InfoLine
                label="Total IPO profit"
                value={formatCurrency(r.totalIpoProfit)}
                valueColor={pnlColor(r.totalIpoProfit)}
              />
              <InfoLine
                label="Pending from team"
                value={formatCurrency(r.willReceiveFromTeam)}
                valueColor={Number(r.willReceiveFromTeam) !== 0 ? '#dc2626' : undefined}
              />
            </View>
          </InfoCard>
        ))}

        <InfoCard variant="totals" title="Member totals">
          <View>
            <InfoLine label="Total given" value={formatCurrency(memberTotals.totalGiven)} />
            <InfoLine label="Total received" value={formatCurrency(memberTotals.totalReceived)} />
            <InfoLine label="IPOs applied" value={String(memberTotals.iposApplied)} />
            <InfoLine label="IPOs alloted" value={String(memberTotals.iposAlloted)} />
            <InfoLine
              label="Total IPO profit"
              value={formatCurrency(memberTotals.totalIpoProfit)}
              valueColor={pnlColor(memberTotals.totalIpoProfit)}
            />
            <InfoLine
              label="Pending from team"
              value={formatCurrency(memberTotals.willReceiveFromTeam)}
              valueColor={Number(memberTotals.willReceiveFromTeam) !== 0 ? '#dc2626' : undefined}
            />
          </View>
        </InfoCard>
      </ContentCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.error, marginBottom: 12 },
  groupName: { ...typography.caption, color: colors.info, marginBottom: 8, fontWeight: '600' },
});
