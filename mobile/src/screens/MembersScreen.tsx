import { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, SegmentedButtons, TextInput } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import Loading from '../components/Loading';
import ListRow from '../components/ListRow';
import Tag from '../components/Tag';
import StatCard, { PnlStatCard } from '../components/StatCard';
import { formatCurrency, formatDateTime, formatPan } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import { copyToClipboard } from '../utils/allotmentCheck';
import { colors } from '../theme';
import { useQuery } from '../hooks/useQuery';

type MembersCache = {
  members: any[];
  memberGroups: any[];
};

function memberMatchesSearch(member: any, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [member.display_name, member.pan, member.email, member.member_group_name, member.status]
    .filter(Boolean).join(' ').toLowerCase().includes(needle);
}

function InfoRow({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  const canCopy = copyable && value && value !== '—';

  const onCopy = async () => {
    const ok = await copyToClipboard(value);
    Alert.alert(ok ? 'Copied' : 'Copy failed', ok ? `${label} copied to clipboard` : `Could not copy ${label}`);
  };

  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoValueWrap}>
        <Text style={styles.infoValue}>{value}</Text>
        {canCopy ? (
          <Pressable onPress={onCopy} hitSlop={8} style={styles.copyBtn} accessibilityLabel={`Copy ${label}`}>
            <Ionicons name="copy-outline" size={18} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default function MembersScreen() {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState('info');
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const fetcher = useCallback(async (): Promise<MembersCache> => {
    const [m, g] = await Promise.allSettled([client.get('/members'), client.get('/member-groups')]);
    return {
      members: m.status === 'fulfilled' ? m.value.data || [] : [],
      memberGroups: g.status === 'fulfilled' ? g.value.data || [] : [],
    };
  }, []);
  const { data, loading, refresh } = useQuery(fetcher);
  const members = data?.members ?? [];
  const memberGroups = data?.memberGroups ?? [];

  const load = () => refresh();

  const filtered = useMemo(() => {
    let list = members;
    if (statusFilter !== 'ALL') list = list.filter((m) => m.status === statusFilter);
    if (search.trim()) list = list.filter((m) => memberMatchesSearch(m, search));
    return list;
  }, [members, statusFilter, search]);

  const openCreate = () => {
    setEditing(null);
    const nextSort = members.reduce((max, m) => Math.max(max, Number(m.sort_order) || 0), -1) + 1;
    setForm({ status: 'ACTIVE', sortOrder: nextSort, memberGroupId: null });
    setModalOpen(true);
  };

  const openEdit = (record: any) => {
    setEditing(record);
    setForm({
      pan: record.pan,
      displayName: record.display_name,
      email: record.email || '',
      upi: record.upi || '',
      status: record.status,
      relationshipNote: record.relationship_note || '',
      memberGroupId: record.member_group_id ?? null,
      sortOrder: record.sort_order,
    });
    setModalOpen(true);
  };

  const onSave = async () => {
    try {
      const body: Record<string, unknown> = {
        pan: form.pan,
        displayName: form.displayName,
        email: form.email || undefined,
        upi: form.upi || undefined,
        status: form.status,
        relationshipNote: form.relationshipNote || undefined,
        sortOrder: form.sortOrder,
      };
      if (form.memberGroupId !== undefined) {
        body.memberGroupId = form.memberGroupId;
      }
      if (editing) {
        await client.patch(`/members/${editing.id}`, body);
        Alert.alert('Success', 'Member updated');
      } else {
        await client.post('/members', body);
        Alert.alert('Success', 'Member added');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Save failed'));
    }
  };

  const setMemberStatus = async (record: any, makeActive: boolean) => {
    setTogglingId(record.id);
    try {
      await client.patch(`/members/${record.id}`, { status: makeActive ? 'ACTIVE' : 'INACTIVE' });
      load();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Status update failed'));
    } finally {
      setTogglingId(null);
    }
  };

  const openDetail = async (id: number) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    setDetailTab('info');
    try {
      const { data } = await client.get(`/members/${id}/detail`);
      setDetail(data);
    } catch (err) {
      setDetailOpen(false);
      Alert.alert('Error', getErrorMessage(err, 'Could not load member detail'));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetail(null);
    setDetailTab('info');
  };

  const m = detail?.member;
  const s = detail?.stats;

  const availableGroups = useMemo(() => {
    if (editing?.member_group_id) {
      return memberGroups.filter((g) => g.id === editing.member_group_id);
    }
    return memberGroups;
  }, [editing, memberGroups]);

  if (loading && !members.length) return <Loading />;

  return (
    <Screen>
      <PageHeader title="Members" subtitle="Manage team members and PAN logins" extra={<Button mode="contained" onPress={openCreate}>Add member</Button>} />
      <TextInput placeholder="Search members..." value={search} onChangeText={setSearch} mode="outlined" style={{ marginBottom: 12 }} />
      <ContentCard title={`Members (${filtered.length})`}>
        {filtered.map((m) => (
          <View key={m.id} style={styles.row}>
            <ListRow
              title={m.display_name}
              subtitle={`PAN ${formatPan(m.pan)}${m.member_group_name ? ` · ${m.member_group_name}` : ''}`}
              onPress={() => openDetail(m.id)}
              right={<Tag label={m.status} color={m.status === 'ACTIVE' ? '#059669' : '#dc2626'} />}
            />
            <View style={styles.actions}>
              <Switch value={m.status === 'ACTIVE'} disabled={togglingId === m.id} onValueChange={(v) => setMemberStatus(m, v)} />
              <Button compact onPress={() => openEdit(m)}>Edit</Button>
            </View>
          </View>
        ))}
      </ContentCard>

      <Modal visible={modalOpen} animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <SafeAreaView style={styles.editModal}>
          <View style={styles.detailHeader}>
            <Text style={styles.modalTitle}>{editing ? 'Edit member' : 'Add member'}</Text>
            <Button mode="text" onPress={() => setModalOpen(false)}>Cancel</Button>
          </View>
          <ScrollView contentContainerStyle={styles.editScroll} keyboardShouldPersistTaps="handled">
          <TextInput label="PAN" value={form.pan || ''} onChangeText={(v) => setForm({ ...form, pan: v.toUpperCase() })} editable={!editing} mode="outlined" style={styles.input} />
          <TextInput label="Display name" value={form.displayName || ''} onChangeText={(v) => setForm({ ...form, displayName: v })} mode="outlined" style={styles.input} />
          <TextInput label="Email" value={form.email || ''} onChangeText={(v) => setForm({ ...form, email: v })} mode="outlined" style={styles.input} />
          <TextInput label="UPI" value={form.upi || ''} onChangeText={(v) => setForm({ ...form, upi: v })} mode="outlined" style={styles.input} />
          <TextInput label="Relationship note" value={form.relationshipNote || ''} onChangeText={(v) => setForm({ ...form, relationshipNote: v })} mode="outlined" style={styles.input} />

          <Text style={styles.fieldLabel}>Sub-Group</Text>
          {editing?.member_group_id ? (
            <Text style={styles.groupHint}>
              Member can belong to one sub-group only. To move to another group, select None and save, then assign under Sub-Groups.
            </Text>
          ) : (
            <Text style={styles.groupHint}>A member can only be in one sub-group at a time.</Text>
          )}
          <Pressable
            style={[styles.groupOption, form.memberGroupId == null && styles.groupOptionActive]}
            onPress={() => setForm({ ...form, memberGroupId: null })}
          >
            <Text style={styles.groupOptionText}>None</Text>
          </Pressable>
          {availableGroups.map((g) => (
            <Pressable
              key={g.id}
              style={[styles.groupOption, form.memberGroupId === g.id && styles.groupOptionActive]}
              onPress={() => setForm({ ...form, memberGroupId: g.id })}
            >
              <Text style={styles.groupOptionText}>{g.name}</Text>
            </Pressable>
          ))}

          <Button mode="contained" onPress={onSave} style={{ marginTop: 12 }}>Save</Button>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={detailOpen} animationType="slide" onRequestClose={closeDetail}>
        <SafeAreaView style={styles.detailModal}>
          <View style={styles.detailHeader}>
            <Text style={styles.modalTitle}>{m ? `${m.display_name}` : 'Member profile'}</Text>
            <Button mode="text" onPress={closeDetail}>Close</Button>
          </View>

          {detailLoading ? (
            <Loading />
          ) : detail && m ? (
            <ScrollView contentContainerStyle={styles.detailScroll} keyboardShouldPersistTaps="handled">
              {m.status === 'INACTIVE' && (
                <View style={styles.inactiveBanner}>
                  <Text style={styles.inactiveText}>This member is inactive — excluded from IPO distribute and PAN login.</Text>
                </View>
              )}

              <SegmentedButtons
                value={detailTab}
                onValueChange={setDetailTab}
                buttons={[
                  { value: 'info', label: 'Profile' },
                  { value: 'ipos', label: `IPOs (${detail.ipoApplications?.length ?? 0})` },
                  { value: 'ledger', label: `Ledger (${detail.ledgerEntries?.length ?? 0})` },
                ]}
                style={{ marginBottom: 16 }}
              />

              {detailTab === 'info' && (
                <>
                  <ContentCard title="Contact & status">
                    <InfoRow label="PAN" value={formatPan(m.pan)} copyable />
                    <InfoRow label="Email" value={m.email || '—'} />
                    <InfoRow label="UPI" value={m.upi || '—'} copyable />
                    <InfoRow label="Status" value={m.status} />
                    <InfoRow label="Relationship" value={m.relationship_note || '—'} />
                    <InfoRow label="Sub-Group" value={m.member_group_name || '—'} />
                  </ContentCard>

                  <ContentCard title="P&L share rules">
                    {detail.profitShare?.configured ? (
                      (detail.profitShare.rules || []).map((rule: any) => (
                        <Text key={rule.id} style={styles.ruleLine}>
                          {rule.ruleName} · {rule.ipoName || 'All IPOs'} · {rule.providerName}
                          {'\n'}Profit: P {rule.profitProviderPercent}% · M {rule.profitManagerPercent}% · Member {rule.profitMemberPercent}%
                        </Text>
                      ))
                    ) : (
                      <Text style={styles.muted}>Not configured — set under Profit Sharing</Text>
                    )}
                  </ContentCard>

                  {s && (
                    <ContentCard title="Summary">
                      <View style={styles.statRow}>
                        <StatCard title="Total given" value={formatCurrency(s.totalGiven)} variant="warning" />
                        <StatCard title="Total received" value={formatCurrency(s.totalReceived)} variant="success" />
                      </View>
                      <View style={styles.statRow}>
                        <StatCard title="Pending" value={formatCurrency(s.willReceiveFromTeam)} variant={s.willReceiveFromTeam !== 0 ? 'danger' : 'primary'} />
                        <StatCard title="IPOs applied" value={s.iposApplied ?? 0} variant="info" />
                      </View>
                      <View style={styles.statRow}>
                        <StatCard title="Alloted" value={s.iposAlloted ?? 0} variant="success" />
                        <StatCard title="Not alloted" value={s.iposNotAlloted ?? 0} variant="danger" />
                      </View>
                      <View style={styles.statRow}>
                        <PnlStatCard title="Gross IPO P&L" value={s.totalIpoProfit ?? 0} formatted={formatCurrency(s.totalIpoProfit ?? 0)} />
                        <PnlStatCard title="Member share" value={s.totalMemberShare ?? 0} formatted={formatCurrency(s.totalMemberShare ?? 0)} />
                      </View>
                      <View style={styles.statRow}>
                        <PnlStatCard title="Manager share" value={s.totalManagerShare ?? 0} formatted={formatCurrency(s.totalManagerShare ?? 0)} />
                        <StatCard title="Provider share" value={formatCurrency(s.totalProviderShare ?? 0)} variant="info" />
                      </View>
                    </ContentCard>
                  )}
                </>
              )}

              {detailTab === 'ipos' && (
                <ContentCard title="Full ledger — IPOs">
                  {(detail.ipoApplications?.length ?? 0) === 0 ? (
                    <Text style={styles.muted}>No IPO applications yet</Text>
                  ) : (
                    detail.ipoApplications.map((a: any) => (
                      <ListRow
                        key={a.id}
                        title={a.ipo_name}
                        subtitle={[
                          a.allotment_status,
                          formatCurrency(a.amount),
                          a.profit_loss != null ? `Gross ${formatCurrency(a.profit_loss)}` : null,
                          a.member_share != null ? `Member ${formatCurrency(a.member_share)}` : null,
                          a.manager_share != null ? `Manager ${formatCurrency(a.manager_share)}` : null,
                          a.provider_share != null ? `Provider ${formatCurrency(a.provider_share)}` : null,
                          a.share_status === 'pending' ? 'Pending split' : null,
                        ].filter(Boolean).join(' · ')}
                        right={a.investor_category ? <Tag label={a.investor_category} /> : undefined}
                      />
                    ))
                  )}
                </ContentCard>
              )}

              {detailTab === 'ledger' && (
                <ContentCard title="Fund ledger">
                  {(detail.ledgerEntries?.length ?? 0) === 0 ? (
                    <Text style={styles.muted}>No transactions yet</Text>
                  ) : (
                    detail.ledgerEntries.map((t: any) => (
                      <ListRow
                        key={t.id}
                        title={t.type}
                        subtitle={`${formatDateTime(t.txn_date)}${t.ipo_name ? ` · ${t.ipo_name}` : ''}${t.notes ? `\n${t.notes}` : ''}`}
                        right={<Text style={styles.amount}>{formatCurrency(t.amount)}</Text>}
                      />
                    ))
                  )}
                </ContentCard>
              )}
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingBottom: 8 },
  modalTitle: { fontSize: 20, fontWeight: '700', flex: 1 },
  input: { marginBottom: 10 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 6, marginTop: 4 },
  groupHint: { fontSize: 12, color: colors.textSecondary, marginBottom: 8, lineHeight: 18 },
  groupOption: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    backgroundColor: colors.card,
  },
  groupOptionActive: { borderColor: colors.primary, backgroundColor: '#ccfbf1' },
  groupOptionText: { fontSize: 14, color: colors.text },
  detailModal: { flex: 1, backgroundColor: colors.bg },
  editModal: { flex: 1, backgroundColor: colors.bg },
  editScroll: { padding: 16, paddingBottom: 32 },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailScroll: { padding: 16, paddingBottom: 32 },
  inactiveBanner: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  inactiveText: { color: '#92400e', fontSize: 13 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: { color: colors.textSecondary, fontSize: 14, flex: 1 },
  infoValueWrap: { flex: 1.2, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  infoValue: { color: colors.text, fontSize: 14, fontWeight: '500', textAlign: 'right', flexShrink: 1 },
  copyBtn: { padding: 4 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  ruleLine: { fontSize: 13, color: colors.text, marginBottom: 8, lineHeight: 20 },
  muted: { color: colors.textSecondary, fontSize: 14 },
  amount: { fontWeight: '600', color: colors.text },
});
