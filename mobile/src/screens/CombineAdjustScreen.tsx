import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Checkbox, SegmentedButtons } from 'react-native-paper';
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
import { formatCurrency } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import { colors } from '../theme';

export default function CombineAdjustScreen() {
  const router = useRouter();
  const [meta, setMeta] = useState<{ sources: any[]; targets: any[] }>({ sources: [], targets: [] });
  const [fromIpoIds, setFromIpoIds] = useState<number[]>([]);
  const [targetIpoIds, setTargetIpoIds] = useState<number[]>([]);
  const [category, setCategory] = useState('RII');
  const [preview, setPreview] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [assignments, setAssignments] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [adjustingId, setAdjustingId] = useState<number | null>(null);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [payAccountId, setPayAccountId] = useState<number | null>(null);
  const [providerBalance, setProviderBalance] = useState(0);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      client.get('/ipos/adjust-combine/meta'),
      client.get('/wallet').catch(() => ({ data: {} })),
    ])
      .then(([metaRes, walletRes]) => {
        setMeta(metaRes.data || { sources: [], targets: [] });
        const accts = (walletRes.data?.accounts || []).filter((a: any) => a.purpose !== 'MANAGER');
        setBankAccounts(accts);
        setProviderBalance(Number(walletRes.data?.providerBalance ?? walletRes.data?.balance ?? 0));
        if (accts.length === 1) setPayAccountId(accts[0].id);
      })
      .catch((err) => Alert.alert('Error', getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const toggleId = (list: number[], id: number, setList: (v: number[]) => void) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
    setAssignments({});
  };

  const loadPreview = useCallback(
    async (nextAssign?: Record<number, number>) => {
      if (!fromIpoIds.length || !targetIpoIds.length) {
        setPreview(null);
        setSelectedIds([]);
        return;
      }
      const assignMap = nextAssign ?? assignments;
      setPreviewLoading(true);
      try {
        const assignmentList = Object.entries(assignMap)
          .filter(([, tid]) => tid)
          .map(([applicationId, targetIpoId]) => ({
            applicationId: Number(applicationId),
            targetIpoId: Number(targetIpoId),
          }));
        const { data } = await client.post('/ipos/adjust-combine/preview', {
          fromIpoIds,
          targetIpoIds,
          investorCategory: category,
          assignments: assignmentList,
        });
        setPreview(data);
        const eligible = (data.rows || []).filter((r: any) => r.eligible);
        setSelectedIds(eligible.map((r: any) => r.applicationId));
        setAssignments((prev) => {
          const next = { ...prev };
          for (const r of eligible) {
            if (r.targetIpoId) next[r.applicationId] = r.targetIpoId;
          }
          return next;
        });
      } catch (err) {
        Alert.alert('Error', getErrorMessage(err, 'Preview failed'));
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    },
    [fromIpoIds, targetIpoIds, category, assignments]
  );

  useEffect(() => {
    loadPreview({});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on IPO/category selection only
  }, [fromIpoIds, targetIpoIds, category]);

  const changeTarget = async (applicationId: number, targetIpoId: number) => {
    const nextAssign = { ...assignments, [applicationId]: targetIpoId };
    setAssignments(nextAssign);
    setPreviewLoading(true);
    try {
      const assignmentList = Object.entries(nextAssign)
        .filter(([, tid]) => tid)
        .map(([appId, tid]) => ({
          applicationId: Number(appId),
          targetIpoId: Number(tid),
        }));
      const { data } = await client.post('/ipos/adjust-combine/preview', {
        fromIpoIds,
        targetIpoIds,
        investorCategory: category,
        assignments: assignmentList,
      });
      setPreview(data);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setPreviewLoading(false);
    }
  };

  const selectedRows = useMemo(() => {
    if (!preview) return [];
    const set = new Set(selectedIds);
    return (preview.rows || []).filter((r: any) => r.eligible && set.has(r.applicationId));
  }, [preview, selectedIds]);

  const liveTotals = useMemo(() => {
    const adjustToSend = selectedRows.reduce((s: number, r: any) => s + Number(r.toSend || 0), 0);
    const totalToCollect = selectedRows.reduce((s: number, r: any) => s + Number(r.toCollect || 0), 0);
    const unadjustedToCollect = Number(preview?.totals?.unadjustedToCollect || 0);
    return {
      adjustToSend,
      totalToCollect,
      unadjustedToCollect,
    };
  }, [selectedRows, preview]);


  const onSubmit = (rowsToAdjust?: any[]) => {
    const rows = Array.isArray(rowsToAdjust) ? rowsToAdjust : selectedRows;
    if (!rows.length) {
      Alert.alert('Warning', 'Select at least one member');
      return;
    }
    const toSend = rows.reduce((s: number, r: any) => s + Number(r.toSend || 0), 0);
    const walletCredit = rows.reduce((s: number, r: any) => s + Number(r.walletCredit || 0), 0);
    if (toSend > 0.001 || walletCredit > 0.001) {
      if (!bankAccounts.length) {
        Alert.alert('Error', 'Add a provider wallet account before reusing leftover');
        return;
      }
      if (bankAccounts.length > 1 && !payAccountId) {
        Alert.alert('Warning', 'Select provider wallet account');
        return;
      }
      const acc = bankAccounts.find((a) => a.id === (payAccountId || bankAccounts[0]?.id));
      if (toSend > 0.001 && acc && Number(acc.balance) < toSend) {
        Alert.alert(
          'Insufficient wallet',
          `Need ${formatCurrency(toSend)}, available ${formatCurrency(acc.balance)} in ${acc.label}`
        );
        return;
      }
    }
    const single = rows.length === 1;
    Alert.alert(
      single ? `Reuse leftover for ${rows[0].memberName}?` : `Reuse leftover for ${rows.length} members?`,
      (toSend > 0 ? `Provider wallet extra ${formatCurrency(toSend)}.\n` : '') +
        'Leftover from the old IPO moves onto the new one.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: single ? 'Reuse this one' : `Reuse (${rows.length})`,
          onPress: async () => {
            setSubmitting(true);
            if (single) setAdjustingId(rows[0].applicationId);
            try {
              const items = rows.map((r: any) => ({
                applicationId: r.applicationId,
                targetIpoId: assignments[r.applicationId] || r.targetIpoId,
              }));
              const body: any = {
                items,
                investorCategory: category,
              };
              if (toSend > 0.001 || walletCredit > 0.001) {
                body.bankAccountId = payAccountId || bankAccounts[0]?.id;
              }
              const { data } = await client.post('/ipos/adjust-combine', body);
              Alert.alert(
                'Done',
                `Moved leftover for ${data.count}` +
                  (data.totalAdjusted > 0 ? ` · ${formatCurrency(data.totalAdjusted)} onto new IPO` : '') +
                  (data.providerDebited > 0
                    ? ` · wallet −${formatCurrency(data.providerDebited)}`
                    : '') +
                  (data.providerCredited > 0
                    ? ` · wallet +${formatCurrency(data.providerCredited)}`
                    : '') +
                  (data.totalToCollect > 0 ? ` · leftover ${formatCurrency(data.totalToCollect)} on old IPO` : '')
              );
              const metaRes = await client.get('/ipos/adjust-combine/meta');
              setMeta(metaRes.data || { sources: [], targets: [] });
              const walletRes = await client.get('/wallet').catch(() => ({ data: {} }));
              const accts = (walletRes.data?.accounts || []).filter((a: any) => a.purpose !== 'MANAGER');
              setBankAccounts(accts);
              setProviderBalance(Number(walletRes.data?.providerBalance ?? walletRes.data?.balance ?? 0));
              await loadPreview({});
            } catch (err) {
              Alert.alert('Error', getErrorMessage(err, 'Reuse leftover failed'));
            } finally {
              setSubmitting(false);
              setAdjustingId(null);
            }
          },
        },
      ]
    );
  };

  if (loading) return <Loading />;

  return (
    <Screen>
      <PageHeader
        title="Reuse leftover funds"
        subtitle="Old leftover onto new IPOs. Extra comes from the provider wallet."
        extra={
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Button compact mode="text" onPress={() => router.push('/(manager)/group-leader-wallets')}>
              Leaders
            </Button>
            <Button compact mode="outlined" onPress={() => router.back()}>
              Back
            </Button>
          </View>
        }
      />

      <Banner variant="info">
        Leftover from old IPOs moves onto the new ones — including small leftovers like ₹180 and ₹48, which are added together for the same member. Extra comes from the provider wallet.
      </Banner>

      <ContentCard title="Provider wallet (if extra is needed)">
        <Text style={ui.muted}>Available {formatCurrency(providerBalance)}</Text>
        {liveTotals.adjustToSend > providerBalance + 0.001 ? (
          <Banner variant="warn">
            {`Selected top-up ${formatCurrency(liveTotals.adjustToSend)} exceeds provider balance`}
          </Banner>
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

      <ContentCard title="Old IPOs (leftover with members)">
        {(meta.sources || []).map((s) => {
          const active = fromIpoIds.includes(s.id);
          const disabled = targetIpoIds.includes(s.id);
          return (
            <Pressable
              key={s.id}
              style={[
                ui.accountOption,
                active && ui.accountOptionActive,
                disabled && { opacity: 0.4 },
              ]}
              onPress={() => {
                if (disabled) return;
                toggleId(fromIpoIds, s.id, setFromIpoIds);
              }}
            >
              <Text style={styles.bold}>{s.name}</Text>
              <Text style={ui.muted}>
                {s.adjustableCount} · {formatCurrency(s.adjustablePrincipal)}
              </Text>
            </Pressable>
          );
        })}
        {!meta.sources?.length && <Text style={ui.muted}>No adjustable source IPOs</Text>}
      </ContentCard>

      <ContentCard title="New IPOs (where leftover goes)">
        {(meta.targets || []).map((t) => {
          const active = targetIpoIds.includes(t.id);
          const disabled = fromIpoIds.includes(t.id);
          return (
            <Pressable
              key={t.id}
              style={[
                ui.accountOption,
                active && ui.accountOptionActive,
                disabled && { opacity: 0.4 },
              ]}
              onPress={() => {
                if (disabled) return;
                toggleId(targetIpoIds, t.id, setTargetIpoIds);
              }}
            >
              <Text style={styles.bold}>{t.name}</Text>
              <Text style={ui.muted}>
                RII {t.lotAmountRii != null ? formatCurrency(t.lotAmountRii) : '—'}
              </Text>
            </Pressable>
          );
        })}
        {!meta.targets?.length && <Text style={ui.muted}>No open target IPOs</Text>}
      </ContentCard>

      <ContentCard title="Category">
        <SegmentedButtons
          value={category}
          onValueChange={setCategory}
          buttons={[
            { value: 'RII', label: 'RII' },
            { value: 'HNI', label: 'HNI' },
          ]}
        />
      </ContentCard>

      {preview && (
        <>
          <ContentCard title={previewLoading ? 'Totals (updating…)' : 'Totals'}>
            <StatGrid>
              <StatCard title="From wallet" value={formatCurrency(liveTotals.adjustToSend)} variant="danger" />
              <StatCard title="Leftover on old" value={formatCurrency(liveTotals.totalToCollect)} variant="warning" />
              <StatCard
                title="Not reused"
                value={formatCurrency(liveTotals.unadjustedToCollect)}
                variant="warning"
              />
            </StatGrid>
          </ContentCard>

          <ContentCard title={`Members (${selectedIds.length})`}>
            {(preview.rows || []).map((row: any) => (
              <View key={row.applicationId} style={[styles.row, !row.eligible && { opacity: 0.55 }]}>
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
                  <Text style={ui.muted}>
                    {row.sourceIpoName}
                    {row.groupName ? ` · ${row.groupName}` : ''}
                  </Text>
                  {row.eligible ? (
                    <>
                      <Text style={ui.muted}>
                        {formatCurrency(row.remainder)} → {formatCurrency(row.newLot)}
                        {row.toSend > 0 ? ` · wallet extra ${formatCurrency(row.toSend)}` : ''}
                        {row.toCollect > 0 ? ` · leftover ${formatCurrency(row.toCollect)}` : ''}
                      </Text>
                      <View style={ui.chipRow}>
                        {(row.targetOptions || [])
                          .filter((o: any) => !o.blocked || o.targetIpoId === row.targetIpoId)
                          .map((o: any) => {
                            const selected =
                              (assignments[row.applicationId] || row.targetIpoId) === o.targetIpoId;
                            return (
                              <Pressable
                                key={o.targetIpoId}
                                style={[ui.chip, selected && ui.chipActive, o.blocked && { opacity: 0.4 }]}
                                onPress={() => {
                                  if (o.blocked && !selected) return;
                                  changeTarget(row.applicationId, o.targetIpoId);
                                }}
                              >
                                <Text style={[ui.chipText, selected && ui.chipTextActive]}>
                                  {o.targetIpoName}
                                </Text>
                              </Pressable>
                            );
                          })}
                      </View>
                    </>
                  ) : (
                    <Tag label={row.blockedReason || 'Not eligible'} />
                  )}
                  {row.eligible ? (
                    <Button
                      compact
                      mode="contained"
                      style={{ marginTop: 8, alignSelf: 'flex-start' }}
                      loading={adjustingId === row.applicationId}
                      disabled={submitting}
                      onPress={() => onSubmit([row])}
                    >
                      Reuse this
                    </Button>
                  ) : null}
                </View>
              </View>
            ))}
          </ContentCard>

          {(preview.allottedExcluded || []).length > 0 && (
            <ContentCard title={`Allotted — cannot reuse (${preview.allottedExcluded.length})`}>
              <Banner variant="info">
                Funds in allotted shares stay there. The same member can still reuse leftover from other IPOs.
              </Banner>
              {(preview.allottedExcluded || []).map((u: any) => (
                <View key={u.applicationId} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bold}>{u.memberName}</Text>
                    <Text style={ui.muted}>
                      {u.sourceIpoName} · {formatCurrency(u.remainder)}
                    </Text>
                  </View>
                </View>
              ))}
            </ContentCard>
          )}

          {(preview.unadjustedPending || []).length > 0 && (
            <ContentCard title="Not reused — still with these members">
              {(preview.unadjustedPending || []).map((u: any) => (
                <View key={u.applicationId} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bold}>{u.memberName}</Text>
                    <Text style={ui.muted}>
                      {u.sourceIpoName} · {formatCurrency(u.toCollect)}
                    </Text>
                  </View>
                </View>
              ))}
            </ContentCard>
          )}

          <Banner variant="warning">
            Wallet extra: {formatCurrency(liveTotals.adjustToSend)} · leftover on old IPO:{' '}
            {formatCurrency(liveTotals.totalToCollect)}
          </Banner>

          <Button
            mode="contained"
            loading={submitting}
            disabled={!selectedRows.length || previewLoading || submitting}
            onPress={() => onSubmit()}
            style={{ marginBottom: 24 }}
          >
            Reuse leftover ({selectedRows.length})
          </Button>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: '700', color: colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
