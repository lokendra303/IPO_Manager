import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Checkbox } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard from '../components/StatCard';
import StatGrid from '../components/StatGrid';
import Loading from '../components/Loading';
import Banner from '../components/Banner';
import Tag from '../components/Tag';
import { ui } from '../styles/ui';
import {
  categoryCompactOptionsForIpo,
  getLotAmountForCategory,
} from '../utils/ipoCategories';
import { formatCurrency } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import { colors } from '../theme';

export default function AdjustFundsScreen() {
  const { id, fromIpoId: fromParam } = useLocalSearchParams<{ id: string; fromIpoId?: string }>();
  const router = useRouter();

  const [targetIpo, setTargetIpo] = useState<any>(null);
  const [sources, setSources] = useState<any[]>([]);
  const [fromIpoId, setFromIpoId] = useState<number | null>(
    fromParam ? Number(fromParam) : null
  );
  const [category, setCategory] = useState('RII');
  const [preview, setPreview] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [payAccountId, setPayAccountId] = useState<number | null>(null);
  const [providerBalance, setProviderBalance] = useState(0);

  const loadBase = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [ipoRes, sourcesRes, walletRes] = await Promise.all([
        client.get(`/ipos/${id}`),
        client.get(`/ipos/${id}/adjust-sources`),
        client.get('/wallet').catch(() => ({ data: {} })),
      ]);
      setTargetIpo(ipoRes.data);
      setSources(sourcesRes.data || []);
      const accts = (walletRes.data?.accounts || []).filter((a: any) => a.purpose !== 'MANAGER');
      setBankAccounts(accts);
      setProviderBalance(Number(walletRes.data?.providerBalance ?? walletRes.data?.balance ?? 0));
      if (accts.length === 1) setPayAccountId(accts[0].id);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Failed to load'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  const loadPreview = useCallback(
    async (sourceId: number, cat = category) => {
      setPreviewLoading(true);
      try {
        const { data } = await client.get(`/ipos/${id}/adjust-preview`, {
          params: { fromIpoId: sourceId, investorCategory: cat },
        });
        setPreview(data);
        setSelectedIds((data.rows || []).filter((r: any) => r.eligible).map((r: any) => r.applicationId));
      } catch (err) {
        Alert.alert('Error', getErrorMessage(err, 'Failed to load preview'));
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    },
    [id, category]
  );

  useEffect(() => {
    if (fromIpoId) loadPreview(fromIpoId, category);
  }, [fromIpoId, category, loadPreview]);

  const selectedPreview = useMemo(() => {
    if (!preview) return null;
    const selectedSet = new Set(selectedIds);
    const selectedRows = (preview.rows || []).filter(
      (r: any) => r.eligible && selectedSet.has(r.applicationId)
    );

    const unadjusted: any[] = [];
    const seen = new Set<number>();
    const push = (u: any) => {
      if (seen.has(u.applicationId)) return;
      seen.add(u.applicationId);
      unadjusted.push(u);
    };
    for (const u of preview.unadjustedPending || []) {
      if (u.allotmentStatus === 'PENDING' || !selectedSet.has(u.applicationId)) push(u);
    }
    for (const r of preview.rows || []) {
      if (r.eligible && !selectedSet.has(r.applicationId)) {
        push({
          applicationId: r.applicationId,
          memberName: r.memberName,
          remainder: r.remainder,
          toCollect: r.remainder,
          reason: 'Not selected — full amount to collect',
          groupName: r.groupName,
          allotmentStatus: r.allotmentStatus,
        });
      }
    }

    const groupMap = new Map<number, any>();
    const individuals: any[] = [];
    for (const row of selectedRows) {
      if (row.groupId == null) {
        individuals.push(row);
        continue;
      }
      if (!groupMap.has(row.groupId)) {
        groupMap.set(row.groupId, {
          groupId: row.groupId,
          groupName: row.groupName || `Group #${row.groupId}`,
          members: [],
          totalToSend: 0,
          totalToCollect: 0,
        });
      }
      const g = groupMap.get(row.groupId);
      g.members.push(row);
      g.totalToSend += Number(row.toSend || 0);
      g.totalToCollect += Number(row.toCollect || 0);
    }

    const totalToSend = selectedRows.reduce((s: number, r: any) => s + Number(r.toSend || 0), 0);
    const totalToCollect = selectedRows.reduce((s: number, r: any) => s + Number(r.toCollect || 0), 0);
    const unadjustedToCollect = unadjusted.reduce((s, r) => s + Number(r.toCollect || 0), 0);

    return {
      selectedRows,
      groups: [...groupMap.values()],
      individuals,
      unadjusted,
      totals: {
        totalToSend,
        totalToCollect,
        unadjustedToCollect,
        grandToCollect: totalToCollect + unadjustedToCollect,
      },
    };
  }, [preview, selectedIds]);

  const onSubmit = async () => {
    if (!fromIpoId) {
      Alert.alert('Warning', 'Select a source IPO');
      return;
    }
    if (!selectedIds.length) {
      Alert.alert('Warning', 'Select at least one member');
      return;
    }
    const toSend = Number(selectedPreview?.totals?.totalToSend || 0);
    if (toSend > 0.001) {
      if (!bankAccounts.length) {
        Alert.alert('Error', 'Add a provider wallet account before adjusting top-ups');
        return;
      }
      if (bankAccounts.length > 1 && !payAccountId) {
        Alert.alert('Warning', 'Select provider wallet account for the top-up debit');
        return;
      }
      const acc = bankAccounts.find((a) => a.id === (payAccountId || bankAccounts[0]?.id));
      if (acc && Number(acc.balance) < toSend) {
        Alert.alert(
          'Insufficient wallet',
          `Need ${formatCurrency(toSend)}, available ${formatCurrency(acc.balance)}`
        );
        return;
      }
    }
    setSubmitting(true);
    try {
      const body: any = {
        fromIpoId,
        applicationIds: selectedIds,
        investorCategory: category,
      };
      if (toSend > 0.001) {
        body.bankAccountId = payAccountId || bankAccounts[0]?.id;
      }
      const { data } = await client.post(`/ipos/${id}/adjust-from`, body);
      const lines = [
        `Adjusted ${data.count} member(s)`,
        `Rolled ${formatCurrency(data.totalAdjusted)}`,
      ];
      if (data.providerDebited > 0) {
        lines.push(`Provider debited: ${formatCurrency(data.providerDebited)}`);
      } else if (data.totalToSend > 0) {
        lines.push(`To send: ${formatCurrency(data.totalToSend)}`);
      }
      if ((data.totalToCollect ?? data.totalPendingCollect) > 0) {
        lines.push(`To collect: ${formatCurrency(data.totalToCollect ?? data.totalPendingCollect)}`);
      }
      Alert.alert('Done', lines.join('\n'), [
        { text: 'OK', onPress: () => router.replace(`/(manager)/ipos/${id}`) },
      ]);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Adjust failed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading />;

  const lot = targetIpo ? getLotAmountForCategory(targetIpo, category) : null;

  return (
    <Screen>
      <PageHeader
        title="Adjust funds"
        subtitle={targetIpo ? `→ ${targetIpo.name}` : ''}
        right={
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Button compact mode="text" onPress={() => router.push('/(manager)/group-leader-wallets')}>
              Leaders
            </Button>
            <Button compact mode="text" onPress={() => router.push('/(manager)/adjust-combine')}>
              Combine
            </Button>
            <Button compact mode="text" onPress={() => router.back()}>
              Back
            </Button>
          </View>
        }
      />

      <Banner variant="info">
        Top-up debits provider wallet. Group leader wallets update from paid-to on new apps (pending moves old → new).
      </Banner>

      <ContentCard title="Provider wallet (top-up)">
        <Text style={ui.muted}>Available {formatCurrency(providerBalance)}</Text>
        {Number(selectedPreview?.totals?.totalToSend || 0) > providerBalance + 0.001 ? (
          <Text style={{ color: colors.error, marginVertical: 4 }}>
            Selected top-up exceeds provider balance
          </Text>
        ) : null}
        {bankAccounts.map((a) => (
          <Pressable
            key={a.id}
            style={[ui.accountOption, payAccountId === a.id && ui.accountOptionActive]}
            onPress={() => setPayAccountId(a.id)}
          >
            <Text style={styles.bold}>{a.label}</Text>
            <Text style={ui.muted}>{formatCurrency(a.balance)}</Text>
          </Pressable>
        ))}
        {!bankAccounts.length && <Text style={ui.muted}>No provider accounts</Text>}
      </ContentCard>

      <ContentCard title="Target lot">
        <Text style={ui.muted}>
          {category} lot: {lot != null ? formatCurrency(lot) : '—'}
        </Text>
        <View style={ui.chipRow}>
          {categoryCompactOptionsForIpo(targetIpo).map((opt) => (
            <Pressable
              key={opt.value}
              style={[ui.chip, category === opt.value && ui.chipActive]}
              onPress={() => setCategory(opt.value)}
            >
              <Text style={[ui.chipText, category === opt.value && ui.chipTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ContentCard>

      <ContentCard title="From (old IPO)">
        {sources.map((s) => (
          <Pressable
            key={s.id}
            style={[ui.accountOption, fromIpoId === s.id && ui.accountOptionActive]}
            onPress={() => setFromIpoId(s.id)}
          >
            <Text style={styles.bold}>{s.name}</Text>
            <Text style={ui.muted}>
              {s.adjustable_count} · {formatCurrency(s.adjustable_principal)}
            </Text>
          </Pressable>
        ))}
        {!sources.length && <Text style={ui.muted}>No adjustable source IPOs</Text>}
      </ContentCard>

      {selectedPreview && (
        <>
          <ContentCard title="Totals">
            <StatGrid>
              <StatCard
                title="To send"
                value={formatCurrency(selectedPreview.totals.totalToSend)}
                variant="danger"
              />
              <StatCard
                title="To collect"
                value={formatCurrency(selectedPreview.totals.totalToCollect)}
                variant="warning"
              />
              <StatCard
                title="Not adjusted"
                value={formatCurrency(selectedPreview.totals.unadjustedToCollect)}
                variant="warning"
              />
              <StatCard
                title="Total collect"
                value={formatCurrency(selectedPreview.totals.grandToCollect)}
                variant="primary"
              />
            </StatGrid>
          </ContentCard>

          <ContentCard title={`Adjust (${selectedIds.length})`}>
            {(preview?.rows || []).map((row: any) => (
              <Pressable
                key={row.applicationId}
                style={[styles.row, !row.eligible && { opacity: 0.55 }]}
                onPress={() => {
                  if (!row.eligible) return;
                  setSelectedIds((prev) =>
                    prev.includes(row.applicationId)
                      ? prev.filter((x) => x !== row.applicationId)
                      : [...prev, row.applicationId]
                  );
                }}
              >
                <Checkbox
                  status={selectedIds.includes(row.applicationId) ? 'checked' : 'unchecked'}
                  disabled={!row.eligible}
                  onPress={() => {
                    if (!row.eligible) return;
                    setSelectedIds((prev) =>
                      prev.includes(row.applicationId)
                        ? prev.filter((x) => x !== row.applicationId)
                        : [...prev, row.applicationId]
                    );
                  }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bold}>{row.memberName}</Text>
                  {row.groupName ? <Text style={ui.muted}>{row.groupName}</Text> : null}
                  {row.eligible ? (
                    <Text style={ui.muted}>
                      Old {formatCurrency(row.remainder)} → new {formatCurrency(row.newLot)}
                      {row.toSend > 0 ? ` · send ${formatCurrency(row.toSend)}` : ''}
                      {row.toCollect > 0 ? ` · collect ${formatCurrency(row.toCollect)}` : ''}
                      {row.willMarkOldReceived ? ' · old → Received' : ''}
                    </Text>
                  ) : (
                    <Text style={styles.warn}>{row.blockedReason}</Text>
                  )}
                </View>
              </Pressable>
            ))}
            {previewLoading && <Text style={ui.muted}>Loading…</Text>}
          </ContentCard>

          {selectedPreview.groups.map((g: any) => (
            <ContentCard key={g.groupId} title={g.groupName}>
              <Text style={ui.muted}>
                Send {formatCurrency(g.totalToSend)} · Collect {formatCurrency(g.totalToCollect)}
              </Text>
              {g.members.map((m: any) => (
                <View key={m.applicationId} style={styles.memberLine}>
                  <Text>{m.memberName}</Text>
                  <Text style={ui.muted}>
                    {m.toSend > 0 ? `send ${formatCurrency(m.toSend)}` : ''}
                    {m.toSend > 0 && m.toCollect > 0 ? ' · ' : ''}
                    {m.toCollect > 0 ? `collect ${formatCurrency(m.toCollect)}` : ''}
                    {m.toSend <= 0 && m.toCollect <= 0 ? 'even' : ''}
                  </Text>
                </View>
              ))}
            </ContentCard>
          ))}

          {selectedPreview.individuals.length > 0 && (
            <ContentCard title="Individuals">
              {selectedPreview.individuals.map((m: any) => (
                <View key={m.applicationId} style={styles.memberLine}>
                  <Text>{m.memberName}</Text>
                  <Text style={ui.muted}>
                    {m.toSend > 0 ? `send ${formatCurrency(m.toSend)}` : ''}
                    {m.toSend > 0 && m.toCollect > 0 ? ' · ' : ''}
                    {m.toCollect > 0 ? `collect ${formatCurrency(m.toCollect)}` : ''}
                    {m.toSend <= 0 && m.toCollect <= 0 ? 'even' : ''}
                  </Text>
                </View>
              ))}
            </ContentCard>
          )}

          {selectedPreview.unadjusted.length > 0 && (
            <ContentCard title="Not adjusted — full to collect">
              <Banner variant="warn">
                {`${formatCurrency(selectedPreview.totals.unadjustedToCollect)} still with members`}
              </Banner>
              {selectedPreview.unadjusted.map((u: any) => (
                <View key={u.applicationId} style={styles.memberLine}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bold}>{u.memberName}</Text>
                    <Text style={ui.muted}>{u.reason}</Text>
                  </View>
                  <Tag label={formatCurrency(u.toCollect)} color="#d97706" />
                </View>
              ))}
            </ContentCard>
          )}

          <Button
            mode="contained"
            loading={submitting}
            disabled={!selectedIds.length || submitting}
            onPress={onSubmit}
            style={{ marginVertical: 16 }}
          >
            Confirm adjust ({selectedIds.length})
          </Button>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: '600' },
  warn: { color: '#dc2626', fontSize: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  memberLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
});
