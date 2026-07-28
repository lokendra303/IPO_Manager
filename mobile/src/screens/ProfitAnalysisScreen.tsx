import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, SegmentedButtons } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard, { PnlStatCard } from '../components/StatCard';
import ListRow from '../components/ListRow';
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

function shareLine(r: any) {
  return `Member ${formatCurrency(r.memberShare)} · Mgr ${formatCurrency(r.managerShare)} · Prov ${formatCurrency(r.providerShare)}`;
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
        <ContentCard title="Could not load analysis">
          <Text style={styles.error}>{error || 'No data returned'}</Text>
          <Button mode="contained" onPress={() => reload()}>Retry</Button>
        </ContentCard>
      </Screen>
    );
  }

  const revenue = data.revenue || {};
  const overall = data.overall || {};
  const manager = data.manager || {};
  const reportScope = data.reportScope || {};
  const applicationCount = Number(reportScope.applicationCount ?? overall.applicationCount ?? 0);
  const profitApps = Number(reportScope.profitApps ?? overall.profitApps ?? 0);
  const lossApps = Number(reportScope.lossApps ?? overall.lossApps ?? 0);
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

  return (
    <Screen>
      <PageHeader
        title="Profit Analysis"
        subtitle={`${periodLabel} · ${iposAppliedLabel} · ${iposProfitLabel}`}
        extra={
          <Button compact mode="outlined" loading={pdfLoading} disabled={pdfLoading} onPress={previewPdf}>
            Preview
          </Button>
        }
      />

      <ContentCard title="Period">
        <Text style={ui.sectionLabel}>Year</Text>
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
            Clear period
          </Button>
        )}
      </ContentCard>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <Button
          mode="outlined"
          icon="eye-outline"
          loading={pdfLoading}
          disabled={pdfLoading}
          onPress={previewPdf}
          style={{ flex: 1 }}
        >
          Preview
        </Button>
        <Button
          mode="contained"
          icon="file-download-outline"
          loading={pdfLoading}
          disabled={pdfLoading}
          onPress={downloadPdf}
          style={{ flex: 1 }}
        >
          Download
        </Button>
      </View>

      <ContentCard title={`Coverage · ${periodLabel}`}>
        <Text style={styles.hint}>
          {iposAppliedLabel} · {iposProfitLabel} · {appsLabel} ({profitApps} apps profit / {lossApps} loss)
        </Text>
        <View style={styles.statGrid}>
          <View style={styles.statCell}>
            <StatCard title="IPOs applied" value={iposApplied} variant="info" />
          </View>
          <View style={styles.statCell}>
            <StatCard title="IPOs profit" value={iposProfit} variant="success" />
          </View>
          <View style={styles.statCell}>
            <StatCard title="Active apps" value={applicationCount} variant="default" />
          </View>
          <View style={styles.statCell}>
            <StatCard title="Apps profit" value={profitApps} variant="success" />
          </View>
        </View>
        <View style={{ marginTop: 8 }}>
          <PnlStatCard
            title="Gross P&L"
            value={Number(overall.grossIpoPnL || 0)}
            formatted={formatCurrency(overall.grossIpoPnL)}
          />
        </View>
      </ContentCard>

      <SegmentedButtons
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        style={{ marginBottom: 12 }}
        buttons={[
          { value: 'revenue', label: 'Rev' },
          { value: 'members', label: 'Members' },
          { value: 'subgroups', label: 'Groups' },
          { value: 'providers', label: 'Prov' },
          { value: 'manager', label: 'You' },
        ]}
      />

      {tab === 'revenue' && (
        <>
          <ContentCard title="Distributed revenue">
            <ListRow title="Gross split (done)" subtitle={formatCurrency(revenue.grossDistributed)} />
            <ListRow
              title="Pending to split"
              subtitle={`${formatCurrency(revenue.pendingGross)} · ${overall.pendingCount || 0} apps`}
            />
            <ListRow title="Splits recorded" subtitle={String(overall.distributionCount || 0)} />
          </ContentCard>
          <ContentCard title="By IPO segment">
            {(data.bySegment || []).length === 0 ? (
              <Text style={styles.empty}>No splits yet</Text>
            ) : (
              (data.bySegment || []).map((r: any) => (
                <ListRow
                  key={r.ipoSegment}
                  title={r.label}
                  subtitle={shareLine(r)}
                />
              ))
            )}
          </ContentCard>
          <ContentCard title="By investor category">
            {(data.byCategory || []).length === 0 ? (
              <Text style={styles.empty}>No splits yet</Text>
            ) : (
              (data.byCategory || []).map((r: any) => (
                <ListRow
                  key={r.investorCategory}
                  title={r.label}
                  subtitle={shareLine(r)}
                />
              ))
            )}
          </ContentCard>
        </>
      )}

      {tab === 'members' && (
        <ContentCard title={`Members (${(data.members || []).length})`}>
          {(data.members || []).length === 0 ? (
            <Text style={styles.empty}>No allotted IPO P&L yet</Text>
          ) : (
            (data.members || []).map((r: any) => (
              <ListRow
                key={r.memberId}
                title={r.displayName}
                subtitle={`${shareLine(r)}${r.memberGroupName ? ` · ${r.memberGroupName}` : ''}`}
                badge={r.isGroupLeader ? 'Leader' : undefined}
              />
            ))
          )}
        </ContentCard>
      )}

      {tab === 'subgroups' && (
        <>
          {(data.subGroups || []).length === 0 ? (
            <ContentCard title="Sub-groups">
              <Text style={styles.empty}>No sub-groups with members yet.</Text>
            </ContentCard>
          ) : (
            (data.subGroups || []).map((g: any) => (
              <ContentCard
                key={g.groupId}
                title={`${g.groupName} · ${g.memberCount} members`}
              >
                <Text style={styles.leaderLine}>
                  Leader: {g.leaderDisplayName || '—'} · Group member profit{' '}
                  {formatCurrency(g.totals?.memberShare)}
                </Text>
                {(g.members || []).map((m: any) => (
                  <ListRow
                    key={m.memberId}
                    title={m.displayName}
                    subtitle={`${formatCurrency(m.memberShare)} member profit · PAN ${formatPan(m.pan)}`}
                    badge={m.isLeader ? 'Leader' : undefined}
                  />
                ))}
                <Text style={styles.totalsLine}>
                  Total vs leader: {formatCurrency(g.totals?.memberShare)} member ·{' '}
                  {formatCurrency(g.totals?.managerShare)} manager ·{' '}
                  {formatCurrency(g.totals?.providerShare)} provider · Gross{' '}
                  {formatCurrency(g.totals?.grossIpoPnL)}
                </Text>
              </ContentCard>
            ))
          )}
          {(data.ungroupedMembers || []).length > 0 && (
            <ContentCard title="Not in a sub-group">
              {(data.ungroupedMembers || []).map((r: any) => (
                <ListRow
                  key={r.memberId}
                  title={r.displayName}
                  subtitle={shareLine(r)}
                />
              ))}
            </ContentCard>
          )}
        </>
      )}

      {tab === 'providers' && (
        <ContentCard title="Providers">
          {(data.providers || []).length === 0 ? (
            <Text style={styles.empty}>No provider shares yet</Text>
          ) : (
            (data.providers || []).map((r: any) => (
              <ListRow
                key={r.fundProviderId}
                title={r.providerName}
                subtitle={`Total ${formatCurrency(r.totalShare)} · Profit ${formatCurrency(r.profitShare)} · Loss ${formatCurrency(r.lossShare)}`}
              />
            ))
          )}
        </ContentCard>
      )}

      {tab === 'manager' && (
        <ContentCard title={manager.label || 'Manager (you)'}>
          <View style={ui.statRow}>
            <PnlStatCard
              title="Total share"
              value={Number(manager.totalShare || 0)}
              formatted={formatCurrency(manager.totalShare)}
            />
            <StatCard title="From profit" value={formatCurrency(manager.profitShare)} variant="success" />
            <StatCard title="From loss" value={formatCurrency(manager.lossShare)} variant="danger" />
          </View>
        </ContentCard>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.error, marginBottom: 12 },
  empty: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 12,
    marginTop: -4,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statCell: {
    width: '48%',
    flexGrow: 1,
  },
  leaderLine: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  totalsLine: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
    lineHeight: 18,
  },
  monthRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  monthRowDisabled: {
    opacity: 0.55,
  },
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
