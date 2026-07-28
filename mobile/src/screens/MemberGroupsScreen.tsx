import { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Checkbox, SegmentedButtons, TextInput } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import Loading from '../components/Loading';
import ListRow from '../components/ListRow';
import Tag from '../components/Tag';
import StatCard from '../components/StatCard';
import { formatCurrency, formatDateTime, formatPan } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import { openActionSheet } from '../utils/actionSheet';
import { colors } from '../theme';
import { useQuery } from '../hooks/useQuery';

type MemberGroupsCache = {
  groups: any[];
  allMembers: any[];
};

type MemberOption = {
  id: number;
  displayName: string;
  pan: string;
  status: string;
  currentGroupId: number | null;
  currentGroupName: string | null;
};

function getOwnerLabel(group: any) {
  if (!group) return null;
  if (group.ownerExternalName) {
    return group.ownerExternalPan
      ? `${group.ownerExternalName} (${formatPan(group.ownerExternalPan)})`
      : group.ownerExternalName;
  }
  if (group.ownerDisplayName) {
    return group.ownerPan
      ? `${group.ownerDisplayName} (${formatPan(group.ownerPan)})`
      : group.ownerDisplayName;
  }
  if (group.ownerMemberId && group.members?.length) {
    const owner = group.members.find((m: any) => m.id === group.ownerMemberId);
    if (owner) {
      return owner.pan ? `${owner.displayName} (${formatPan(owner.pan)})` : owner.displayName;
    }
  }
  return null;
}

export default function MemberGroupsScreen() {
  const [saving, setSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<{ name?: string; sortOrder?: string }>({});

  const [viewGroup, setViewGroup] = useState<any>(null);
  const [viewOwnerId, setViewOwnerId] = useState<number | null>(null);
  const [bulkTxns, setBulkTxns] = useState<any[]>([]);
  const [bulkTxnsLoading, setBulkTxnsLoading] = useState(false);

  const [assignGroup, setAssignGroup] = useState<any>(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [ownerMemberId, setOwnerMemberId] = useState<number | null>(null);
  const [ownerMode, setOwnerMode] = useState<'member' | 'external'>('member');
  const [ownerExternalName, setOwnerExternalName] = useState('');
  const [ownerExternalPan, setOwnerExternalPan] = useState('');
  const [viewOwnerMode, setViewOwnerMode] = useState<'member' | 'external'>('member');
  const [viewOwnerExternalName, setViewOwnerExternalName] = useState('');
  const [viewOwnerExternalPan, setViewOwnerExternalPan] = useState('');

  const fetcher = useCallback(async (): Promise<MemberGroupsCache> => {
    const [g, m] = await Promise.all([client.get('/member-groups'), client.get('/members')]);
    return { groups: g.data, allMembers: m.data };
  }, []);
  const { data, loading, refresh } = useQuery(fetcher);
  const groups = data?.groups ?? [];
  const allMembers = data?.allMembers ?? [];

  const load = () => refresh();

  const memberOptions: MemberOption[] = allMembers.reduce<MemberOption[]>((acc, row) => {
    if (acc.some((m) => m.id === row.id)) return acc;
    acc.push({
      id: row.id,
      displayName: row.display_name,
      pan: row.pan,
      status: row.status,
      currentGroupId: row.member_group_id ?? null,
      currentGroupName: row.member_group_name ?? null,
    });
    return acc;
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ sortOrder: '0' });
    setModalOpen(true);
  };

  const openEdit = (group: any) => {
    setEditing(group);
    setForm({ name: group.name, sortOrder: String(group.sortOrder ?? 0) });
    setModalOpen(true);
  };

  const onSaveGroup = async () => {
    if (!form.name?.trim()) {
      Alert.alert('Error', 'Group name is required');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        sortOrder: Number.isFinite(Number(form.sortOrder)) ? Number(form.sortOrder) : 0,
      };
      if (editing) {
        await client.patch(`/member-groups/${editing.id}`, body);
        Alert.alert('Success', 'Group updated');
      } else {
        await client.post('/member-groups', body);
        Alert.alert('Success', 'Group created');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const groupHasOwner = (group: any) =>
    Boolean(group?.ownerMemberId || (group?.ownerExternalName && String(group.ownerExternalName).trim()));

  const syncOwnerFormFromGroup = (group: any) => {
    if (group?.ownerExternalName?.trim()) {
      setViewOwnerMode('external');
      setViewOwnerExternalName(group.ownerExternalName.trim());
      setViewOwnerExternalPan(group.ownerExternalPan || '');
      setViewOwnerId(null);
    } else {
      setViewOwnerMode('member');
      setViewOwnerId(group?.ownerMemberId ?? null);
      setViewOwnerExternalName('');
      setViewOwnerExternalPan('');
    }
  };

  const buildOwnerPayload = (
    mode: 'member' | 'external',
    memberId: number | null,
    extName: string,
    extPan: string
  ) => {
    if (mode === 'external') {
      const name = extName.trim();
      if (!name) return null;
      return {
        ownerMemberId: null,
        ownerExternalName: name,
        ownerExternalPan: extPan.trim() ? extPan.trim().toUpperCase() : null,
      };
    }
    if (!memberId) return null;
    return { ownerMemberId: memberId, ownerExternalName: null, ownerExternalPan: null };
  };

  const openViewInfo = (group: any) => {
    setViewGroup(group);
    syncOwnerFormFromGroup(group);
    setBulkTxns([]);
    setBulkTxnsLoading(true);
    client
      .get(`/member-groups/${group.id}/bulk-transactions`)
      .then((res) => setBulkTxns(res.data))
      .catch(() => setBulkTxns([]))
      .finally(() => setBulkTxnsLoading(false));
  };

  const closeView = () => {
    setViewGroup(null);
    setViewOwnerId(null);
    setBulkTxns([]);
  };

  const onSaveViewOwner = async () => {
    if (!viewGroup) return;
    const payload = buildOwnerPayload(
      viewOwnerMode,
      viewOwnerId,
      viewOwnerExternalName,
      viewOwnerExternalPan
    );
    if (!payload) {
      Alert.alert(
        'Warning',
        viewOwnerMode === 'external'
          ? 'Enter a name for the third-party owner'
          : 'Select a member as owner, or switch to third party'
      );
      return;
    }
    setSaving(true);
    try {
      const { data } = await client.patch(`/member-groups/${viewGroup.id}`, payload);
      Alert.alert('Success', 'Group owner saved');
      setViewGroup(data);
      syncOwnerFormFromGroup(data);
      load();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not save owner'));
    } finally {
      setSaving(false);
    }
  };

  const openAssignMembers = (group: any) => {
    setAssignGroup(group);
    setSelectedMemberIds((group.members || []).map((m: any) => m.id));
    if (group.ownerExternalName?.trim()) {
      setOwnerMode('external');
      setOwnerExternalName(group.ownerExternalName.trim());
      setOwnerExternalPan(group.ownerExternalPan || '');
      setOwnerMemberId(null);
    } else {
      setOwnerMode('member');
      setOwnerMemberId(group.ownerMemberId ?? null);
      setOwnerExternalName('');
      setOwnerExternalPan('');
    }
  };

  const closeAssign = () => {
    setAssignGroup(null);
    setSelectedMemberIds([]);
    setOwnerMemberId(null);
    setOwnerMode('member');
    setOwnerExternalName('');
    setOwnerExternalPan('');
  };

  const onSaveMembers = async () => {
    if (!assignGroup) return;

    const conflicts = selectedMemberIds
      .map((id) => memberOptions.find((m) => m.id === id))
      .filter((m) => m?.currentGroupId && m.currentGroupId !== assignGroup.id);

    if (conflicts.length) {
      const names = conflicts.map((m) => `${m!.displayName} (“${m!.currentGroupName}”)`).join(', ');
      Alert.alert(
        'Cannot assign',
        `Already in another sub-group: ${names}. Unassign from their current group first.`
      );
      return;
    }

    setSaving(true);
    try {
      const ownerPayload = buildOwnerPayload(ownerMode, ownerMemberId, ownerExternalName, ownerExternalPan);
      await client.put(`/member-groups/${assignGroup.id}/members`, {
        memberIds: selectedMemberIds,
        ...(ownerPayload
          ? ownerPayload
          : { ownerMemberId: null, ownerExternalName: null, ownerExternalPan: null }),
      });
      Alert.alert('Success', ownerPayload ? 'Group members and owner updated' : 'Group members updated');
      closeAssign();
      if (viewGroup?.id === assignGroup.id) {
        const { data: refreshed } = await client.get('/member-groups');
        const updated = refreshed.data.find((g: any) => g.id === assignGroup.id);
        if (updated) {
          setViewGroup(updated);
          syncOwnerFormFromGroup(updated);
        }
      }
      load();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Update failed'));
    } finally {
      setSaving(false);
    }
  };

  const deleteGroup = async (id: number) => {
    try {
      await client.delete(`/member-groups/${id}`);
      Alert.alert('Success', 'Group removed — members are unassigned, not deleted');
      load();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Delete failed'));
    }
  };

  const openGroupMore = (group: any) => {
    openActionSheet(group.name, [
      { text: 'View', onPress: () => openViewInfo(group) },
      { text: 'Members', onPress: () => openAssignMembers(group) },
      { text: 'Edit', onPress: () => openEdit(group) },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Remove group?', 'Members stay — only the group label is removed.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => deleteGroup(group.id) },
          ]),
      },
    ]);
  };

  const toggleMember = (member: MemberOption, inOtherGroup: boolean) => {
    if (inOtherGroup) {
      Alert.alert(
        'Already in another group',
        `${member.displayName} is in “${member.currentGroupName}”. Unassign them from that group first, then add here.`
      );
      return;
    }
    setSelectedMemberIds((prev) => {
      const removing = prev.includes(member.id);
      if (removing && ownerMemberId === member.id) {
        setOwnerMemberId(null);
      }
      return removing ? prev.filter((x) => x !== member.id) : [...prev, member.id];
    });
  };

  const selectAllAvailable = () => {
    if (!assignGroup) return;
    setSelectedMemberIds(
      memberOptions
        .filter((m) => !m.currentGroupId || m.currentGroupId === assignGroup.id)
        .map((m) => m.id)
    );
  };

  const deselectAllMembers = () => {
    setSelectedMemberIds([]);
    setOwnerMemberId(null);
  };

  if (loading && !groups.length) return <Loading />;

  const viewOwnerLabel = viewGroup ? getOwnerLabel(viewGroup) : null;
  const viewHasOwner = groupHasOwner(viewGroup);
  const bulkTotal = bulkTxns.reduce((s, t) => s + Number(t.totalAmount || 0), 0);

  return (
    <Screen>
      <PageHeader
        title="Sub-Groups"
        subtitle={`${groups.length} groups · bulk pay to owner`}
        extra={<Button compact mode="contained" onPress={openCreate}>Add</Button>}
      />

      <ContentCard title={`Groups (${groups.length})`}>
        {groups.length === 0 ? (
          <Text style={styles.muted}>No sub-groups yet.</Text>
        ) : (
          groups.map((g) => (
            <View key={g.id} style={styles.compactRow}>
              <View style={styles.compactRowMain}>
                <ListRow
                  title={g.name}
                  subtitle={`${g.memberCount ?? 0} members`}
                  onPress={() => openViewInfo(g)}
                />
              </View>
              <Pressable
                hitSlop={12}
                onPress={() => openGroupMore(g)}
                style={styles.moreBtn}
                accessibilityLabel={`More actions for ${g.name}`}
              >
                <Text style={styles.moreText}>···</Text>
              </Pressable>
            </View>
          ))
        )}
      </ContentCard>

      {/* Create / Edit */}
      <Modal visible={modalOpen} animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.title}>{editing ? 'Edit group' : 'New sub-group'}</Text>
            <Button mode="text" onPress={() => setModalOpen(false)}>Cancel</Button>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <TextInput label="Group name" value={form.name || ''} onChangeText={(v) => setForm({ ...form, name: v })} mode="outlined" style={styles.input} />
            <TextInput label="Sort order" value={form.sortOrder || '0'} onChangeText={(v) => setForm({ ...form, sortOrder: v })} keyboardType="numeric" mode="outlined" style={styles.input} />
            <Button mode="contained" loading={saving} onPress={onSaveGroup}>Save</Button>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* View group info */}
      <Modal visible={!!viewGroup} animationType="slide" onRequestClose={closeView}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.title}>{viewGroup?.name}</Text>
            <Button mode="text" onPress={closeView}>Close</Button>
          </View>
          {viewGroup && (
            <ScrollView contentContainerStyle={styles.modalBody}>
              <ContentCard>
                {viewHasOwner ? (
                  <View style={styles.ownerBar}>
                    <Tag label="Owner" color="#d97706" />
                    <Text style={styles.ownerName}>{viewOwnerLabel}</Text>
                  </View>
                ) : (
                  <Text style={styles.warning}>No owner — bulk pay needs an owner</Text>
                )}
              </ContentCard>

              <View style={styles.statRow}>
                <StatCard title="Members" value={viewGroup.memberCount ?? 0} variant="info" />
                <StatCard title="Bulk IPO pays" value={bulkTxns.length} variant="warning" />
                <StatCard title="Total to owner" value={formatCurrency(bulkTotal)} variant="success" />
              </View>

              {!viewHasOwner && (viewGroup.members?.length ?? 0) > 0 && (
                <ContentCard title="Set group owner">
                  <SegmentedButtons
                    value={viewOwnerMode}
                    onValueChange={(v) => setViewOwnerMode(v as 'member' | 'external')}
                    buttons={[
                      { value: 'member', label: 'Member' },
                      { value: 'external', label: 'Third party' },
                    ]}
                    style={{ marginBottom: 12 }}
                  />
                  {viewOwnerMode === 'member' ? (
                    viewGroup.members.map((m: any) => (
                      <Pressable
                        key={m.id}
                        style={[styles.ownerOption, viewOwnerId === m.id && styles.ownerOptionActive]}
                        onPress={() => setViewOwnerId(m.id)}
                      >
                        <Text>{m.displayName} ({formatPan(m.pan)})</Text>
                      </Pressable>
                    ))
                  ) : (
                    <>
                      <TextInput
                        label="Owner name"
                        value={viewOwnerExternalName}
                        onChangeText={setViewOwnerExternalName}
                        mode="outlined"
                        style={styles.input}
                        placeholder="Not on member list"
                      />
                      <TextInput
                        label="PAN (optional)"
                        value={viewOwnerExternalPan}
                        onChangeText={(v) => setViewOwnerExternalPan(v.toUpperCase())}
                        mode="outlined"
                        style={styles.input}
                        maxLength={10}
                      />
                    </>
                  )}
                  <Button mode="contained" loading={saving} onPress={onSaveViewOwner} style={{ marginTop: 12 }}>
                    Save owner
                  </Button>
                </ContentCard>
              )}

              <ContentCard title={`Members (${viewGroup.members?.length ?? 0})`}>
                {(viewGroup.members?.length ?? 0) === 0 ? (
                  <Text style={styles.muted}>No members — use Manage members.</Text>
                ) : (
                  viewGroup.members.map((m: any) => (
                    <ListRow
                      key={m.id}
                      title={m.displayName}
                      subtitle={`PAN ${formatPan(m.pan)} · ${m.status}`}
                      right={m.id === viewGroup.ownerMemberId ? <Tag label="Owner" color="#d97706" /> : undefined}
                    />
                  ))
                )}
              </ContentCard>

              <ContentCard title="Bulk payments">
                {bulkTxnsLoading ? (
                  <Loading fullScreen={false} />
                ) : bulkTxns.length === 0 ? (
                  <Text style={styles.muted}>No bulk payments yet.</Text>
                ) : (
                  bulkTxns.map((t) => (
                    <ListRow
                      key={t.id}
                      title={t.ipoName || 'IPO'}
                      subtitle={`${t.paidAt ? formatDateTime(t.paidAt) : '—'} · ${t.memberCount} members${t.investorCategory ? ` · ${t.investorCategory}` : ''}`}
                      right={<Text style={styles.amount}>{formatCurrency(t.totalAmount)}</Text>}
                    />
                  ))
                )}
              </ContentCard>

              <Button mode="contained" onPress={() => { const g = viewGroup; closeView(); openAssignMembers(g); }}>
                Manage members
              </Button>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Assign members */}
      <Modal visible={!!assignGroup} animationType="slide" onRequestClose={closeAssign}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.title}>Members in "{assignGroup?.name}"</Text>
            <Button mode="text" onPress={closeAssign}>Cancel</Button>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.hint}>One sub-group per member. Unassign elsewhere first to move.</Text>

            {memberOptions.map((m) => {
              const inOtherGroup = Boolean(m.currentGroupId && assignGroup && m.currentGroupId !== assignGroup.id);
              return (
                <View key={m.id} style={[styles.memberCheck, inOtherGroup && styles.memberCheckDisabled]}>
                  <Checkbox.Item
                    label={`${m.displayName} (${formatPan(m.pan)})${m.status === 'INACTIVE' ? ' · Inactive' : ''}${inOtherGroup ? ` · in “${m.currentGroupName}”` : ''}`}
                    status={selectedMemberIds.includes(m.id) ? 'checked' : 'unchecked'}
                    onPress={() => toggleMember(m, inOtherGroup)}
                  />
                </View>
              );
            })}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              <Button mode="text" onPress={selectAllAvailable} style={{ alignSelf: 'flex-start' }}>
                Select all available members
              </Button>
              <Button
                mode="text"
                disabled={!selectedMemberIds.length}
                onPress={deselectAllMembers}
                style={{ alignSelf: 'flex-start' }}
              >
                Deselect all
              </Button>
            </View>

            <ContentCard title="Group owner" style={{ marginTop: 16 }}>
              <Text style={styles.hint}>
                Bulk IPO pay goes to the owner. Use a group member or a third-party name (not on your member list).
              </Text>
              <SegmentedButtons
                value={ownerMode}
                onValueChange={(v) => setOwnerMode(v as 'member' | 'external')}
                buttons={[
                  { value: 'member', label: 'Member' },
                  { value: 'external', label: 'Third party' },
                ]}
                style={{ marginBottom: 12 }}
              />
              {ownerMode === 'member' ? (
                selectedMemberIds.length === 0 ? (
                  <Text style={styles.muted}>Select members first</Text>
                ) : (
                  selectedMemberIds.map((mid) => {
                    const m = memberOptions.find((o) => o.id === mid);
                    if (!m) return null;
                    return (
                      <Pressable
                        key={m.id}
                        style={[styles.ownerOption, ownerMemberId === m.id && styles.ownerOptionActive]}
                        onPress={() => setOwnerMemberId(m.id)}
                      >
                        <Text>{m.displayName} ({formatPan(m.pan)})</Text>
                      </Pressable>
                    );
                  })
                )
              ) : (
                <>
                  <TextInput
                    label="Owner name"
                    value={ownerExternalName}
                    onChangeText={setOwnerExternalName}
                    mode="outlined"
                    style={styles.input}
                  />
                  <TextInput
                    label="PAN (optional)"
                    value={ownerExternalPan}
                    onChangeText={(v) => setOwnerExternalPan(v.toUpperCase())}
                    mode="outlined"
                    style={styles.input}
                    maxLength={10}
                  />
                </>
              )}
              {ownerMode === 'member' && ownerMemberId != null && (
                <Button mode="text" onPress={() => setOwnerMemberId(null)}>Clear owner</Button>
              )}
            </ContentCard>

            <Button mode="contained" loading={saving} onPress={onSaveMembers} style={{ marginTop: 16 }}>
              Save members
            </Button>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  compactRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  compactRowMain: { flex: 1 },
  moreBtn: { paddingHorizontal: 8, paddingVertical: 12 },
  moreText: { fontSize: 20, fontWeight: '700', color: colors.textSecondary, lineHeight: 22 },
  title: { fontSize: 20, fontWeight: '700', flex: 1 },
  input: { marginBottom: 12 },
  muted: { color: colors.textSecondary, fontSize: 14 },
  hint: { color: colors.textSecondary, fontSize: 13, marginBottom: 12, lineHeight: 20 },
  warning: { color: '#b45309', fontSize: 14 },
  modal: { flex: 1, backgroundColor: colors.bg },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalBody: { padding: 16, paddingBottom: 32 },
  ownerBar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ownerName: { fontSize: 16, fontWeight: '600', color: colors.text, flex: 1 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  ownerOption: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    backgroundColor: colors.card,
  },
  ownerOptionActive: {
    borderColor: colors.primary,
    backgroundColor: '#ccfbf1',
  },
  memberCheck: { marginBottom: 2 },
  memberCheckDisabled: { opacity: 0.65 },
  amount: { fontWeight: '600', color: colors.text },
});
