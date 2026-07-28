import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Button, Checkbox, TextInput } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import Tag from '../components/Tag';
import Banner from '../components/Banner';
import { getLotAmountForCategory, ipoAllowsHni, ipoHasHniLot } from '../utils/ipoCategories';
import { formatCurrency } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import { openActionSheet } from '../utils/actionSheet';
import SlideModal from '../components/SlideModal';
import FilterChips from '../components/FilterChips';
import { fetchRegistrarOptions, type RegistrarOption } from '../utils/allotmentCheck';
import { ui } from '../styles/ui';
import { useQuery } from '../hooks/useQuery';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../theme';

export default function IposScreen() {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<any>({ ipoSegment: 'MAINBOARD', enableHni: false });
  const [registrarOptions, setRegistrarOptions] = useState<RegistrarOption[]>([]);

  useEffect(() => {
    fetchRegistrarOptions(client).then(setRegistrarOptions);
  }, []);

  const fetcher = useCallback(async () => {
    const { data: rows } = await client.get('/ipos', { params: { includeInvalid: 1 } });
    const list = Array.isArray(rows) ? rows : [];
    return {
      active: list.filter((r: any) => !r.is_invalid),
      invalid: list.filter((r: any) => !!r.is_invalid),
    };
  }, []);
  const { data, loading, refresh } = useQuery(fetcher, [], { cacheKey: 'ipos' });

  const list = data?.active ?? [];
  const invalidList = data?.invalid ?? [];

  const onCreate = async () => {
    try {
      const allowedCategories = form.enableHni ? ['RII', 'HNI'] : ['RII'];
      const payload: any = {
        name: form.name,
        ipoSegment: form.ipoSegment,
        lotAmountRii: Number(form.lotAmountRii),
        registrar: form.registrar,
        allowedCategories,
      };
      if (form.openDate?.trim()) payload.openDate = form.openDate.trim();
      if (form.lastApplyDate?.trim()) payload.lastApplyDate = form.lastApplyDate.trim();
      if (form.enableHni && form.lotAmountHni) payload.lotAmountHni = Number(form.lotAmountHni);
      const { data: created } = await client.post('/ipos', payload);
      setModalOpen(false);
      await refresh();
      router.push(`/(manager)/ipos/${created.id}`);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Failed'));
    }
  };

  const toggleStatus = async (ipo: any, action: 'close' | 'reopen') => {
    try {
      await client.post(`/ipos/${ipo.id}/${action}`);
      await refresh();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    }
  };

  const markInvalid = async (ipo: any) => {
    try {
      await client.post(`/ipos/${ipo.id}/invalidate`);
      await refresh();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    }
  };

  const restoreIpo = async (ipo: any) => {
    try {
      await client.post(`/ipos/${ipo.id}/restore`);
      await refresh();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    }
  };

  const deleteIpo = async (ipo: any) => {
    try {
      await client.delete(`/ipos/${ipo.id}`);
      await refresh();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    }
  };

  const openMore = (r: any, invalid = false) => {
    if (invalid) {
      openActionSheet(r.name, [
        { text: 'Restore', onPress: () => restoreIpo(r) },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Delete IPO?', 'Only empty invalid IPOs. Cannot undo.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => deleteIpo(r) },
            ]),
        },
      ]);
      return;
    }

    openActionSheet(r.name, [
      r.status === 'OPEN'
        ? {
            text: 'Close',
            style: 'destructive',
            onPress: () =>
              Alert.alert('Close IPO?', 'Status only — no fund return.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Close', style: 'destructive', onPress: () => toggleStatus(r, 'close') },
              ]),
          }
        : { text: 'Reopen', onPress: () => toggleStatus(r, 'reopen') },
      {
        text: 'Mark invalid',
        onPress: () =>
          Alert.alert('Mark invalid?', 'Hides from main list. Can restore later.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Invalid', style: 'destructive', onPress: () => markInvalid(r) },
          ]),
      },
    ]);
  };

  const renderIpoCard = (r: any, { invalid = false } = {}) => {
    const pending = Number(r.pending_return_count) || 0;
    const apps = Number(r.application_count) || 0;
    const lot = formatCurrency(getLotAmountForCategory(r, 'RII'));
    const hniLot =
      ipoAllowsHni(r) && ipoHasHniLot(r)
        ? formatCurrency(getLotAmountForCategory(r, 'HNI'))
        : null;

    return (
      <Pressable
        key={r.id}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => router.push(`/(manager)/ipos/${r.id}`)}
        onLongPress={() => openMore(r, invalid)}
      >
        <View style={styles.rowMain}>
          <Text style={styles.name} numberOfLines={1}>
            {r.name}
          </Text>
          <Text style={styles.lot} numberOfLines={1}>
            {lot}
            {hniLot ? ` · HNI ${hniLot}` : ''}
          </Text>
          <View style={styles.chipRow}>
            <Text style={styles.meta}>{apps} apps</Text>
            {pending > 0 ? (
              <Text style={styles.pending}>{pending} pending</Text>
            ) : (
              <Text style={styles.meta}>All returned</Text>
            )}
            {invalid ? <Tag label="Invalid" color="#64748b" /> : null}
          </View>
        </View>
        <Pressable
          hitSlop={12}
          onPress={(e) => {
            e.stopPropagation?.();
            openMore(r, invalid);
          }}
          style={styles.moreBtn}
        >
          <Text style={styles.moreText}>···</Text>
        </Pressable>
      </Pressable>
    );
  };

  if (loading && !data) return <Loading />;

  return (
    <Screen>
      <PageHeader
        title="IPOs"
        subtitle={`${list.length} active`}
        extra={
          <Button
            compact
            mode="contained"
            onPress={() => {
              setForm({ ipoSegment: 'MAINBOARD', enableHni: false });
              setModalOpen(true);
            }}
          >
            New
          </Button>
        }
      />

      {list.length === 0 ? (
        <Text style={ui.muted}>No IPOs yet — tap New to create one.</Text>
      ) : (
        <View style={styles.list}>{list.map((r) => renderIpoCard(r))}</View>
      )}

      {invalidList.length > 0 && (
        <View style={styles.invalidBlock}>
          <Text style={styles.sectionLabel}>Invalid ({invalidList.length})</Text>
          <Banner variant="warn">Hidden from main list. Long-press for Restore / Delete.</Banner>
          <View style={styles.list}>{invalidList.map((r) => renderIpoCard(r, { invalid: true }))}</View>
        </View>
      )}

      <SlideModal visible={modalOpen} title="New IPO" onClose={() => setModalOpen(false)} closeLabel="Cancel">
        <TextInput
          label="Name"
          value={form.name || ''}
          onChangeText={(v) => setForm({ ...form, name: v })}
          mode="outlined"
          style={ui.input}
        />
        <Text style={ui.sectionLabel}>Segment</Text>
        <FilterChips
          value={form.ipoSegment || 'MAINBOARD'}
          onChange={(v) => setForm({ ...form, ipoSegment: v || 'MAINBOARD' })}
          scrollable={false}
          options={[
            { value: 'MAINBOARD', label: 'Mainboard' },
            { value: 'SME', label: 'SME' },
          ]}
        />
        <TextInput
          label="RII lot (₹)"
          value={String(form.lotAmountRii || '')}
          onChangeText={(v) => setForm({ ...form, lotAmountRii: v })}
          keyboardType="numeric"
          mode="outlined"
          style={ui.input}
        />
        <Text style={ui.sectionLabel}>Registrar (optional)</Text>
        <FilterChips
          value={form.registrar || ''}
          onChange={(v) => setForm({ ...form, registrar: v || undefined })}
          scrollable={false}
          options={[
            { value: '', label: 'None' },
            ...registrarOptions.map((o) => ({ value: o.value, label: o.label })),
          ]}
        />
        <Checkbox.Item
          label="Enable HNI"
          status={form.enableHni ? 'checked' : 'unchecked'}
          onPress={() => setForm({ ...form, enableHni: !form.enableHni })}
        />
        {form.enableHni && (
          <TextInput
            label="HNI lot (₹)"
            value={String(form.lotAmountHni || '')}
            onChangeText={(v) => setForm({ ...form, lotAmountHni: v })}
            keyboardType="numeric"
            mode="outlined"
            style={ui.input}
          />
        )}
        <TextInput
          label="Open date (YYYY-MM-DD)"
          value={form.openDate || ''}
          onChangeText={(v) => setForm({ ...form, openDate: v })}
          placeholder="2026-07-28"
          mode="outlined"
          style={ui.input}
          autoCapitalize="none"
        />
        <TextInput
          label="Close date / last apply (YYYY-MM-DD)"
          value={form.lastApplyDate || ''}
          onChangeText={(v) => setForm({ ...form, lastApplyDate: v })}
          placeholder="2026-07-30"
          mode="outlined"
          style={ui.input}
          autoCapitalize="none"
        />
        <Button mode="contained" onPress={onCreate}>
          Create
        </Button>
      </SlideModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingVertical: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    gap: spacing.sm,
  },
  rowPressed: { backgroundColor: colors.primaryLight, borderColor: colors.primaryMuted },
  rowMain: { flex: 1, gap: 4 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  lot: { fontSize: 14, fontWeight: '600', color: colors.primaryDark, fontVariant: ['tabular-nums'] },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 2 },
  meta: { fontSize: 12, color: colors.textSecondary },
  pending: { fontSize: 12, fontWeight: '700', color: colors.warning },
  moreBtn: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
  moreText: { fontSize: 20, fontWeight: '700', color: colors.textMuted, letterSpacing: 1 },
  invalidBlock: { marginTop: spacing.xl },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
});
