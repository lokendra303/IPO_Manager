import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import Loading from '../components/Loading';
import FilterChips from '../components/FilterChips';
import { formatCurrency, formatPan } from '../utils/format';
import { colors, radii, spacing, typography } from '../theme';
import { ui } from '../styles/ui';
import { useQuery } from '../hooks/useQuery';
import { useAuth } from '../context/AuthContext';
import { previewProfitAnalysisPdf, shareProfitAnalysisPdf } from '../utils/profitAnalysisPdf';

type Tab = 'revenue' | 'members' | 'subgroups' | 'providers' | 'manager';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pnlColor(v: unknown) {
  const n = Number(v || 0);
  if (n < 0) return colors.error;
  if (n > 0) return colors.success;
  return colors.text;
}

function Amt({ value }: { value: unknown }) {
  return <Text style={[styles.amt, { color: pnlColor(value) }]}>{formatCurrency(value)}</Text>;
}

function ShareGrid({
  member,
  manager,
  provider,
  gross,
  pending,
  splits,
}: {
  member?: unknown;
  manager?: unknown;
  provider?: unknown;
  gross?: unknown;
  pending?: unknown;
  splits?: unknown;
}) {
  const cells = [
    gross != null ? { label: 'Gross', value: gross } : null,
    { label: 'Member', value: member },
    { label: 'You', value: manager },
    { label: 'Provider', value: provider },
    pending != null && Number(pending) !== 0 ? { label: 'Pending', value: pending, warn: true } : null,
    splits != null ? { label: 'Splits', value: splits, plain: true } : null,
  ].filter(Boolean) as { label: string; value: unknown; warn?: boolean; plain?: boolean }[];

  return (
    <View style={styles.shares}>
      {cells.map((c) => (
        <View key={c.label} style={[styles.shareCell, c.warn && styles.shareCellWarn]}>
          <Text style={styles.shareLabel}>{c.label}</Text>
          {c.plain ? <Text style={styles.amt}>{String(c.value)}</Text> : <Amt value={c.value} />}
        </View>
      ))}
    </View>
  );
}

function MixBar({ member, manager, provider }: { member?: unknown; manager?: unknown; provider?: unknown }) {
  const m = Math.abs(Number(member) || 0);
  const g = Math.abs(Number(manager) || 0);
  const p = Math.abs(Number(provider) || 0);
  const total = m + g + p;
  if (!total) return null;
  return (
    <View style={styles.mix}>
      {m > 0 ? <View style={[styles.mixSeg, { flexGrow: m, backgroundColor: colors.success }]} /> : null}
      {g > 0 ? <View style={[styles.mixSeg, { flexGrow: g, backgroundColor: colors.primary }]} /> : null}
      {p > 0 ? <View style={[styles.mixSeg, { flexGrow: p, backgroundColor: colors.info }]} /> : null}
    </View>
  );
}

function PersonCard({ row, showGroup }: { row: any; showGroup?: boolean }) {
  return (
    <View style={styles.person}>
      <View style={styles.personTop}>
        <Text style={styles.personName}>{row.displayName}</Text>
        {row.isGroupLeader || row.isLeader ? <Text style={styles.leaderTag}>Leader</Text> : null}
      </View>
      <Text style={styles.personMeta}>
        {[formatPan(row.pan) || 'No PAN', showGroup ? row.memberGroupName : null].filter(Boolean).join(' · ')}
      </Text>
      <ShareGrid
        gross={row.grossIpoPnL}
        member={row.memberShare}
        manager={row.managerShare}
        provider={row.providerShare}
        pending={row.pendingGross}
      />
      <MixBar member={row.memberShare} manager={row.managerShare} provider={row.providerShare} />
    </View>
  );
}

function SliceCard({ title, subtitle, row }: { title: string; subtitle?: string; row: any }) {
  return (
    <View style={styles.person}>
      <View style={styles.personTop}>
        <Text style={styles.personName}>{title}</Text>
        {subtitle ? <Text style={styles.personMeta}>{subtitle}</Text> : null}
      </View>
      <ShareGrid
        member={row.memberShare}
        manager={row.managerShare}
        provider={row.providerShare}
        gross={row.grossDistributed}
        splits={row.distributionCount}
      />
      <MixBar member={row.memberShare} manager={row.managerShare} provider={row.providerShare} />
    </View>
  );
}

function buildYearOptions() {
  const current = new Date().getFullYear();
  const opts: { value: string; label: string }[] = [{ value: '', label: 'All years' }];
  for (let y = current; y >= current - 10; y -= 1) {
    opts.push({ value: String(y), label: String(y) });
  }
  return opts;
}

export default function ProfitAnalysisScreen() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('revenue');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [year, setYear] = useState('');
  const [months, setMonths] = useState<number[]>([]);
  const yearOptions = useMemo(() => buildYearOptions(), []);

  const fetcher = useCallback(async () => {
    const params: Record<string, string> = {};
    if (year) {
      params.year = year;
      if (months.length) params.months = months.join(',');
    }
    const { data } = await client.get('/profit-shares/analysis', { params });
    return data;
  }, [year, months]);
  const cacheKey = `profit-analysis-v3-${year || 'all'}-${months.join(',') || 'all'}`;
  const { data, loading, error, reload } = useQuery(fetcher, [year, months], { cacheKey });

  const toggleMonth = (m: number) => {
    if (!year) {
      Alert.alert('Select year', 'Choose a year first so months like Jun are not ambiguous.');
      return;
    }
    setMonths((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort((a, b) => a - b)));
  };

  const pdfMeta = () => ({
    teamName: user?.tenantName || 'IPO Team',
    generatedAt: new Date().toISOString(),
  });

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      const fresh = (await reload()) || data;
      if (!fresh) throw new Error('No data returned');
      await shareProfitAnalysisPdf(fresh, pdfMeta());
    } catch (err: any) {
      Alert.alert('PDF', err?.message || 'Could not generate PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  const previewPdf = async () => {
    setPdfLoading(true);
    try {
      const fresh = (await reload()) || data;
      if (!fresh) throw new Error('No data returned');
      await previewProfitAnalysisPdf(fresh, pdfMeta());
    } catch (err: any) {
      Alert.alert('Preview', err?.message || 'Could not preview PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  if (loading && !data) return <Loading />;

  if ((error && !data) || !data) {
    return (
      <Screen>
        <View style={ui.card}>
          <Text style={styles.error}>{error || 'No data returned'}</Text>
          <Button mode="contained" onPress={() => reload()}>Retry</Button>
        </View>
      </Screen>
    );
  }

  const revenue = data.revenue || {};
  const overall = data.overall || {};
  const manager = data.manager || {};
  const reportScope = data.reportScope || {};
  const applicationCount = Number(reportScope.applicationCount ?? overall.applicationCount ?? 0);
  const profitApps = Number(reportScope.profitApps ?? overall.profitApps ?? 0);
  const iposApplied = Number(reportScope.iposApplied ?? overall.iposApplied ?? 0);
  const iposProfit = Number(reportScope.iposProfit ?? overall.iposProfit ?? 0);
  const appsLabel =
    reportScope.applicationsLabel
    || (applicationCount === 1 ? '1 application' : `${applicationCount} applications`);
  const iposAppliedLabel =
    reportScope.iposAppliedLabel
    || (iposApplied === 1 ? '1 IPO applied' : `${iposApplied} IPOs applied`);
  const iposProfitLabel =
    reportScope.iposProfitLabel
    || (iposProfit === 1 ? '1 IPO gave profit' : `${iposProfit} IPOs gave profit`);
  const periodLabel =
    reportScope.filters?.label
    || reportScope.periodLabel
    || 'All time';
  const members = data.members || [];
  const subGroups = data.subGroups || [];
  const ungroupedMembers = data.ungroupedMembers || [];
  const providers = data.providers || [];
  const pendingCount = Number(overall.pendingCount || 0);
  const splitCount = Number(overall.distributionCount || 0);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'revenue', label: 'Revenue' },
    { key: 'members', label: 'Members', count: members.length },
    { key: 'subgroups', label: 'Groups', count: subGroups.length },
    { key: 'providers', label: 'Providers', count: providers.length },
    { key: 'manager', label: 'You' },
  ];

  return (
    <Screen>
      <View style={styles.head}>
        <Text style={styles.hello}>P&L report</Text>
        <Text style={styles.title}>Profit analysis</Text>
        <Text style={styles.lead}>{periodLabel} · {iposAppliedLabel} · {iposProfitLabel}</Text>
      </View>

      <View style={styles.actions}>
        <Button
          mode="outlined"
          icon="eye-outline"
          loading={pdfLoading}
          disabled={pdfLoading}
          onPress={previewPdf}
          style={styles.actionBtn}
        >
          Preview
        </Button>
        <Button
          mode="contained"
          icon="file-download-outline"
          loading={pdfLoading}
          disabled={pdfLoading}
          onPress={downloadPdf}
          style={styles.actionBtn}
        >
          Download
        </Button>
      </View>

      <View style={ui.card}>
        <Text style={styles.cardTitle}>Period</Text>
        <FilterChips
          value={year}
          onChange={(v) => {
            setYear(v);
            if (!v) setMonths([]);
          }}
          options={yearOptions}
        />
        <Text style={ui.sectionLabel}>Months {year ? `(${year})` : '(select year first)'}</Text>
        <View style={[styles.monthRow, !year && styles.monthRowDisabled]}>
          {MONTH_SHORT.map((label, idx) => {
            const m = idx + 1;
            const active = months.includes(m);
            return (
              <Pressable
                key={m}
                disabled={!year}
                style={[styles.monthChip, active && styles.monthChipActive, !year && styles.monthChipDisabled]}
                onPress={() => toggleMonth(m)}
              >
                <Text style={[styles.monthText, active && styles.monthTextActive, !year && styles.monthTextDisabled]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        {(year || months.length > 0) && (
          <Button
            compact
            mode="text"
            onPress={() => {
              setYear('');
              setMonths([]);
            }}
          >
            All time
          </Button>
        )}
      </View>

      <View style={styles.money}>
        <View style={[styles.moneyCell, styles.moneyMain]}>
          <Text style={styles.moneyLabelLight}>Gross IPO P&L</Text>
          <Text style={styles.moneyValueLight}>{formatCurrency(overall.grossIpoPnL)}</Text>
          <Text style={styles.moneyHintLight}>{appsLabel}</Text>
        </View>
        <View style={styles.moneyRow}>
          <View style={styles.moneyCell}>
            <Text style={styles.moneyLabel}>Members</Text>
            <Amt value={revenue.memberShare} />
          </View>
          <View style={[styles.moneyCell, styles.moneyUp]}>
            <Text style={styles.moneyLabel}>You</Text>
            <Amt value={revenue.managerShare} />
          </View>
          <View style={styles.moneyCell}>
            <Text style={styles.moneyLabel}>Providers</Text>
            <Amt value={revenue.providerShare} />
          </View>
        </View>
      </View>

      <View style={styles.kpis}>
        <View style={[styles.kpi, styles.kpiInfo]}>
          <Text style={styles.kpiLabel}>Applied</Text>
          <Text style={styles.kpiValue}>{iposApplied}</Text>
          <Text style={styles.kpiHint}>{iposProfit} in profit</Text>
        </View>
        <View style={[styles.kpi, pendingCount > 0 ? styles.kpiWarn : null]}>
          <Text style={styles.kpiLabel}>Pending</Text>
          <Text style={styles.kpiValue}>{pendingCount}</Text>
          <Text style={styles.kpiHint}>{formatCurrency(revenue.pendingGross)}</Text>
        </View>
        <View style={[styles.kpi, styles.kpiTeal]}>
          <Text style={styles.kpiLabel}>Splits</Text>
          <Text style={styles.kpiValue}>{splitCount}</Text>
          <Text style={styles.kpiHint}>{profitApps} apps profit</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {tabs.map((t) => {
          const on = tab === t.key;
          return (
            <Pressable key={t.key} style={[styles.tab, on && styles.tabOn]} onPress={() => setTab(t.key)}>
              <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
              {t.count != null ? (
                <View style={[styles.tabCount, on && styles.tabCountOn]}>
                  <Text style={[styles.tabCountText, on && styles.tabCountTextOn]}>{t.count}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {tab === 'revenue' && (
        <>
          <Text style={styles.sectionLead}>
            Who keeps distributed P&L — members, you, and fund providers. Pending is allotted but not split yet.
          </Text>
          <View style={styles.mini}>
            <View style={styles.miniCell}>
              <Text style={styles.shareLabel}>Gross split</Text>
              <Text style={styles.amt}>{formatCurrency(revenue.grossDistributed)}</Text>
            </View>
            <View style={[styles.miniCell, styles.shareCellWarn]}>
              <Text style={styles.shareLabel}>Pending</Text>
              <Text style={styles.amt}>{formatCurrency(revenue.pendingGross)}</Text>
            </View>
            <View style={styles.miniCell}>
              <Text style={styles.shareLabel}>Splits</Text>
              <Text style={styles.amt}>{splitCount}</Text>
            </View>
          </View>
          <MixBar member={revenue.memberShare} manager={revenue.managerShare} provider={revenue.providerShare} />
          <View style={styles.legend}>
            <Text style={styles.legendItem}><Text style={[styles.dot, { color: colors.success }]}>●</Text> Member</Text>
            <Text style={styles.legendItem}><Text style={[styles.dot, { color: colors.primary }]}>●</Text> You</Text>
            <Text style={styles.legendItem}><Text style={[styles.dot, { color: colors.info }]}>●</Text> Provider</Text>
          </View>
          <Text style={styles.cardTitle}>By IPO segment</Text>
          {(data.bySegment || []).length === 0 ? (
            <Text style={styles.empty}>No splits yet</Text>
          ) : (
            (data.bySegment || []).map((r: any) => (
              <SliceCard key={r.ipoSegment} title={r.label} row={r} />
            ))
          )}
          <Text style={styles.cardTitle}>By investor category</Text>
          {(data.byCategory || []).length === 0 ? (
            <Text style={styles.empty}>No splits yet</Text>
          ) : (
            (data.byCategory || []).map((r: any) => (
              <SliceCard key={r.investorCategory} title={r.label} row={r} />
            ))
          )}
        </>
      )}

      {tab === 'members' && (
        members.length === 0 ? (
          <Text style={styles.empty}>No allotted IPO P&L yet for this period.</Text>
        ) : (
          members.map((r: any) => <PersonCard key={r.memberId} row={r} showGroup />)
        )
      )}

      {tab === 'subgroups' && (
        <>
          <Text style={styles.sectionLead}>
            Profit stays with each member. Group totals are the sum against that leader’s group.
          </Text>
          {subGroups.length === 0 ? (
            <Text style={styles.empty}>No sub-groups with members yet.</Text>
          ) : (
            subGroups.map((g: any) => (
              <View key={g.groupId} style={ui.card}>
                <Text style={styles.cardTitle}>{g.groupName}</Text>
                <Text style={styles.personMeta}>
                  {g.memberCount} members · Leader {g.leaderDisplayName || '—'}
                </Text>
                <ShareGrid
                  gross={g.totals?.grossIpoPnL}
                  member={g.totals?.memberShare}
                  manager={g.totals?.managerShare}
                  provider={g.totals?.providerShare}
                />
                <MixBar
                  member={g.totals?.memberShare}
                  manager={g.totals?.managerShare}
                  provider={g.totals?.providerShare}
                />
                {(g.members || []).map((m: any) => (
                  <PersonCard key={m.memberId} row={m} />
                ))}
              </View>
            ))
          )}
          {ungroupedMembers.length > 0 && (
            <View style={ui.card}>
              <Text style={styles.cardTitle}>Not in a sub-group</Text>
              {ungroupedMembers.map((r: any) => (
                <PersonCard key={r.memberId} row={r} />
              ))}
            </View>
          )}
        </>
      )}

      {tab === 'providers' && (
        providers.length === 0 ? (
          <Text style={styles.empty}>No provider shares recorded yet.</Text>
        ) : (
          providers.map((r: any) => (
            <View key={r.fundProviderId} style={styles.person}>
              <Text style={styles.personName}>{r.providerName}</Text>
              <Text style={styles.personMeta}>{r.distributionCount || 0} splits</Text>
              <View style={styles.shares}>
                <View style={styles.shareCell}>
                  <Text style={styles.shareLabel}>Total</Text>
                  <Amt value={r.totalShare} />
                </View>
                <View style={styles.shareCell}>
                  <Text style={styles.shareLabel}>From profit</Text>
                  <Amt value={r.profitShare} />
                </View>
                <View style={styles.shareCell}>
                  <Text style={styles.shareLabel}>From loss</Text>
                  <Amt value={r.lossShare} />
                </View>
              </View>
            </View>
          ))
        )
      )}

      {tab === 'manager' && (
        <View style={ui.card}>
          <Text style={styles.cardTitle}>{manager.label || 'Your share'}</Text>
          <View style={[styles.moneyCell, styles.moneyMain, { borderRadius: radii.md, marginBottom: 10 }]}>
            <Text style={styles.moneyLabelLight}>Total share</Text>
            <Text style={styles.moneyValueLight}>{formatCurrency(manager.totalShare)}</Text>
          </View>
          <View style={styles.mini}>
            <View style={[styles.miniCell, { backgroundColor: colors.successLight }]}>
              <Text style={styles.shareLabel}>From profit</Text>
              <Amt value={manager.profitShare} />
            </View>
            <View style={[styles.miniCell, styles.shareCellWarn]}>
              <Text style={styles.shareLabel}>From loss</Text>
              <Amt value={manager.lossShare} />
            </View>
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.error, marginBottom: 12 },
  empty: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  head: { marginBottom: spacing.md },
  hello: {
    ...typography.label,
    color: colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: { ...typography.title, color: colors.text, marginTop: 2 },
  lead: { ...typography.caption, color: colors.textSecondary, marginTop: 6, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
  actionBtn: { flex: 1 },
  cardTitle: { ...typography.section, color: colors.text, marginBottom: 8, marginTop: 4 },
  money: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.primaryMuted,
    backgroundColor: colors.card,
    marginBottom: spacing.md,
  },
  moneyCell: { padding: spacing.md, gap: 4 },
  moneyMain: {
    backgroundColor: colors.primaryDark,
    padding: spacing.lg,
  },
  moneyRow: { flexDirection: 'row' },
  moneyUp: { backgroundColor: colors.primaryLight },
  moneyLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.textSecondary },
  moneyLabelLight: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(236,253,245,0.86)' },
  moneyValueLight: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  moneyHintLight: { fontSize: 12, color: 'rgba(236,253,245,0.8)' },
  kpis: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
  kpi: {
    flex: 1,
    minHeight: 88,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  kpiInfo: { backgroundColor: colors.infoLight, borderColor: '#bfdbfe' },
  kpiWarn: { backgroundColor: colors.warningLight, borderColor: '#fde68a' },
  kpiTeal: { backgroundColor: colors.primaryLight, borderColor: colors.primaryMuted },
  kpiLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.textSecondary },
  kpiValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  kpiHint: { fontSize: 11, color: colors.textSecondary },
  tabs: { gap: 8, paddingBottom: spacing.md },
  tab: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tabOn: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tabTextOn: { color: '#fff' },
  tabCount: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: radii.pill,
    backgroundColor: '#f1f5f9',
  },
  tabCountOn: { backgroundColor: 'rgba(255,255,255,0.18)' },
  tabCountText: { fontSize: 11, fontWeight: '800', color: colors.text },
  tabCountTextOn: { color: '#fff' },
  sectionLead: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 18 },
  mini: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
  miniCell: {
    flex: 1,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: spacing.lg },
  legendItem: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  dot: { fontSize: 10 },
  person: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: 6,
  },
  personTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  personName: { ...typography.body, fontWeight: '700', color: colors.text, fontSize: 16 },
  personMeta: { ...typography.caption, color: colors.textSecondary },
  leaderTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: colors.success,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    overflow: 'hidden',
    textTransform: 'uppercase',
  },
  shares: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  shareCell: {
    minWidth: '30%',
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.sm,
    backgroundColor: '#f8fafc',
  },
  shareCellWarn: { backgroundColor: colors.warningLight },
  shareLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.textSecondary, marginBottom: 2 },
  amt: { fontSize: 14, fontWeight: '800', color: colors.text },
  mix: { flexDirection: 'row', height: 8, borderRadius: radii.pill, overflow: 'hidden', backgroundColor: colors.border, marginTop: 4 },
  mixSeg: { minWidth: 0, height: '100%' },
  monthRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  monthRowDisabled: { opacity: 0.55 },
  monthChip: {
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  monthChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
  },
  monthChipDisabled: {
    backgroundColor: colors.borderLight || colors.card,
  },
  monthText: { ...typography.caption, fontWeight: '600', color: colors.text },
  monthTextActive: { color: '#fff' },
  monthTextDisabled: { color: colors.textSecondary },
});
