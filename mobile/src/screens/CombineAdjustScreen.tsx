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

  const selectedByMember = useMemo(() => {
    if (!preview) return [];

    const targetMetaById = new Map(
      (preview.targetIpos || meta.targets || []).map((t: any) => [
        t.id,
        {
          id: t.id,
          name: t.name,
          lot:
            category === 'HNI'
              ? Number(t.lotAmountHni ?? t.lot_amount_hni ?? 0)
              : Number(t.lotAmountRii ?? t.lot_amount_rii ?? 0),
        },
      ])
    );

    const blockedByMember = new Map<number, any[]>();
    const pushBlocked = (list: any[]) => {
      for (const u of list || []) {
        if (!blockedByMember.has(u.memberId)) blockedByMember.set(u.memberId, []);
        blockedByMember.get(u.memberId)!.push(u);
      }
    };
    pushBlocked(preview.unadjustedPending || []);
    pushBlocked(preview.allottedExcluded || []);
    for (const r of preview.rows || []) {
      if (!r.eligible && r.remainder > 0) {
        if (!blockedByMember.has(r.memberId)) blockedByMember.set(r.memberId, []);
        blockedByMember.get(r.memberId)!.push({
          sourceIpoName: r.sourceIpoName,
          allotmentStatus: r.allotmentStatus,
        });
      }
    }

    const map = new Map<number, any>();
    for (const r of selectedRows) {
      const tid = assignments[r.applicationId] || r.targetIpoId;
      const opt = r.targetOptions?.find((o: any) => o.targetIpoId === tid);
      const targetName = opt?.targetIpoName || r.targetIpoName;
      const newLot = opt?.newLot ?? r.newLot ?? null;
      if (!map.has(r.memberId)) {
        map.set(r.memberId, {
          memberId: r.memberId,
          memberName: r.memberName,
          groupName: r.groupName || null,
          count: 0,
          adjustToSend: 0,
          freshToSend: 0,
          totalToSend: 0,
          totalToCollect: 0,
          targets: [] as any[],
          freshTargets: [] as any[],
        });
      }
      const m = map.get(r.memberId);
      m.count += 1;
      m.adjustToSend += Number(r.toSend || 0);
      m.totalToCollect += Number(r.toCollect || 0);
      m.targets.push({
        targetIpoId: tid,
        targetIpoName: targetName,
        newLot: newLot != null ? Number(newLot) : null,
        toSend: Number(r.toSend || 0),
      });
    }

    for (const m of map.values()) {
      const covered = new Set(m.targets.map((t: any) => t.targetIpoId).filter(Boolean));
      const uncovered = (targetIpoIds || []).filter((id) => !covered.has(id));
      const blocked = blockedByMember.get(m.memberId) || [];
      const freshCount = Math.min(uncovered.length, blocked.length);
      m.freshTargets = [];
      m.freshToSend = 0;
      for (let i = 0; i < freshCount; i += 1) {
        const tid = uncovered[i];
        const metaT = targetMetaById.get(tid);
        const lot = metaT?.lot > 0 ? metaT.lot : null;
        const blockedOld = blocked[i];
        m.freshTargets.push({
          targetIpoId: tid,
          targetIpoName: metaT?.name || `#${tid}`,
          newLot: lot,
          reason:
            blockedOld?.allotmentStatus === 'PENDING'
              ? 'Old still pending — full lot'
              : 'Old fund not unlocked — full lot',
          blockedSourceIpoName: blockedOld?.sourceIpoName || null,
        });
        m.freshToSend += Number(lot || 0);
      }
      m.totalToSend = m.adjustToSend + m.freshToSend;
    }

    return [...map.values()].sort((a, b) =>
      String(a.memberName || '').localeCompare(String(b.memberName || ''))
    );
  }, [preview, selectedRows, assignments, targetIpoIds, meta.targets, category]);

  const memberTotalsById = useMemo(() => {
    const map = new Map<number, any>();
    for (const m of selectedByMember) map.set(m.memberId, m);
    return map;
  }, [selectedByMember]);

  const liveTotals = useMemo(() => {
    const adjustToSend = selectedRows.reduce((s: number, r: any) => s + Number(r.toSend || 0), 0);
    const totalToCollect = selectedRows.reduce((s: number, r: any) => s + Number(r.toCollect || 0), 0);
    const freshToSend = selectedByMember.reduce((s: number, m: any) => s + Number(m.freshToSend || 0), 0);
    const unadjustedToCollect = Number(preview?.totals?.unadjustedToCollect || 0);
    return {
      adjustToSend,
      freshToSend,
      totalToSend: adjustToSend + freshToSend,
      totalToCollect,
      unadjustedToCollect,
      grandToCollect: totalToCollect + unadjustedToCollect,
    };
  }, [selectedRows, preview, selectedByMember]);

  const onSubmit = (rowsToAdjust?: any[]) => {
    const rows = Array.isArray(rowsToAdjust) ? rowsToAdjust : selectedRows;
    if (!rows.length) {
      Alert.alert('Warning', 'Select at least one member');
      return;
    }
    const toSend = rows.reduce((s: number, r: any) => s + Number(r.toSend || 0), 0);
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
          `Need ${formatCurrency(toSend)}, available ${formatCurrency(acc.balance)} in ${acc.label}`
        );
        return;
      }
    }
    const single = rows.length === 1;
    Alert.alert(
      single ? `Adjust ${rows[0].memberName}?` : `Adjust ${rows.length} selected?`,
      `Top-up debits provider wallet. Group leader wallets update from paid-to.\n` +
        `Roll ${rows.length}` +
        (toSend > 0 ? ` · provider debit ${formatCurrency(toSend)}` : ''),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: single ? 'Adjust this one' : `Adjust (${rows.length})`,
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
              if (toSend > 0.001) {
                body.bankAccountId = payAccountId || bankAccounts[0]?.id;
              }
              const { data } = await client.post('/ipos/adjust-combine', body);
              Alert.alert(
                'Done',
                `Adjusted ${data.count}: rolled ${formatCurrency(data.totalAdjusted)}` +
                  (data.providerDebited > 0
                    ? ` · provider debited ${formatCurrency(data.providerDebited)}`
                    : '') +
                  (data.totalToCollect > 0 ? ` · collect ${formatCurrency(data.totalToCollect)}` : '')
              );
              const metaRes = await client.get('/ipos/adjust-combine/meta');
              setMeta(metaRes.data || { sources: [], targets: [] });
              const walletRes = await client.get('/wallet').catch(() => ({ data: {} }));
              const accts = (walletRes.data?.accounts || []).filter((a: any) => a.purpose !== 'MANAGER');
              setBankAccounts(accts);
              setProviderBalance(Number(walletRes.data?.providerBalance ?? walletRes.data?.balance ?? 0));
              await loadPreview({});
            } catch (err) {
              Alert.alert('Error', getErrorMessage(err, 'Combine adjust failed'));
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
        title="Combine adjust"
        subtitle="Multi old → multi new · top-up debits provider · leader wallets follow paid-to"
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
        Top-up debits provider wallet. Group leader wallets update from paid-to on new apps (pending moves old → new). Adjust one-by-one or multi-select.
      </Banner>

      <ContentCard title="Provider wallet (top-up)">
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

      <ContentCard title="Old IPOs (sources)">
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

      <ContentCard title="New IPOs (targets)">
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
              <StatCard title="To send" value={formatCurrency(liveTotals.totalToSend)} variant="danger" />
              <StatCard title="To collect" value={formatCurrency(liveTotals.totalToCollect)} variant="warning" />
              <StatCard
                title="Not adjusted"
                value={formatCurrency(liveTotals.unadjustedToCollect)}
                variant="warning"
              />
              <StatCard
                title="Total collect"
                value={formatCurrency(liveTotals.grandToCollect)}
                variant="primary"
              />
            </StatGrid>
            <Text style={[styles.bold, { marginTop: 8, color: colors.error }]}>
              Total to send: {formatCurrency(liveTotals.totalToSend)}
            </Text>
          </ContentCard>

          {selectedByMember.length > 0 && (
            <ContentCard title={`By member (${selectedByMember.length})`}>
              {selectedByMember.map((m) => (
                <View key={m.memberId} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bold}>{m.memberName}</Text>
                    <Text style={ui.muted}>
                      {m.count} adj
                      {m.freshTargets?.length ? ` + ${m.freshTargets.length} full` : ''}
                      {m.groupName ? ` · ${m.groupName}` : ''}
                    </Text>
                    {(m.targets || []).map((t: any, i: number) => (
                      <Text key={`a-${t.targetIpoId}-${i}`} style={ui.muted}>
                        Adjust → {t.targetIpoName} {t.newLot != null ? formatCurrency(t.newLot) : '—'}
                        {t.toSend > 0 ? ` (+${formatCurrency(t.toSend)})` : ''}
                      </Text>
                    ))}
                    {(m.freshTargets || []).map((t: any, i: number) => (
                      <Text key={`f-${t.targetIpoId}-${i}`} style={{ color: colors.error, fontSize: 12 }}>
                        Full send → {t.targetIpoName}{' '}
                        {t.newLot != null ? formatCurrency(t.newLot) : '—'}
                        {t.blockedSourceIpoName ? ` (${t.blockedSourceIpoName})` : ''}
                      </Text>
                    ))}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.bold, { color: colors.error }]}>
                      send {formatCurrency(m.totalToSend)}
                    </Text>
                    {m.freshToSend > 0 ? (
                      <Text style={ui.muted}>
                        {formatCurrency(m.adjustToSend)}+{formatCurrency(m.freshToSend)}
                      </Text>
                    ) : null}
                    {m.totalToCollect > 0 ? (
                      <Text style={ui.muted}>collect {formatCurrency(m.totalToCollect)}</Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </ContentCard>
          )}

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
                  {selectedIds.includes(row.applicationId) &&
                  memberTotalsById.get(row.memberId)?.count > 1 ? (
                    <Text style={{ color: colors.error, fontWeight: '700', fontSize: 12 }}>
                      Member total send{' '}
                      {formatCurrency(memberTotalsById.get(row.memberId).totalToSend)}
                      {memberTotalsById.get(row.memberId).totalToCollect > 0
                        ? ` · collect ${formatCurrency(memberTotalsById.get(row.memberId).totalToCollect)}`
                        : ''}
                    </Text>
                  ) : null}
                  {row.eligible ? (
                    <>
                      <Text style={ui.muted}>
                        {formatCurrency(row.remainder)} → {formatCurrency(row.newLot)}
                        {row.toSend > 0 ? ` · send ${formatCurrency(row.toSend)}` : ''}
                        {row.toCollect > 0 ? ` · collect ${formatCurrency(row.toCollect)}` : ''}
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
                      Adjust this
                    </Button>
                  ) : null}
                </View>
              </View>
            ))}
          </ContentCard>

          {(preview.allottedExcluded || []).length > 0 && (
            <ContentCard title={`Allotted — cannot adjust (${preview.allottedExcluded.length})`}>
              <Banner variant="info">
                Funds in shares — not rolled. Same member can still adjust not-allotted IPOs.
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
            <ContentCard title="Not adjusted — full to collect">
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
            Total to send: {formatCurrency(liveTotals.totalToSend)} · to collect:{' '}
            {formatCurrency(liveTotals.totalToCollect)}
          </Banner>

          <Button
            mode="contained"
            loading={submitting}
            disabled={!selectedRows.length || previewLoading || submitting}
            onPress={() => onSubmit()}
            style={{ marginBottom: 24 }}
          >
            Adjust selected ({selectedRows.length}) · send {formatCurrency(liveTotals.totalToSend)}
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
