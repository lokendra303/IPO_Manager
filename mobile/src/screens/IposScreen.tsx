import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Button, Checkbox, TextInput } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import Loading from '../components/Loading';
import ListRow from '../components/ListRow';
import Tag from '../components/Tag';
import Banner from '../components/Banner';
import { getLotAmountForCategory, ipoAllowsHni, ipoHasHniLot } from '../utils/ipoCategories';
import { formatCurrency } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import SlideModal from '../components/SlideModal';
import FilterChips from '../components/FilterChips';
import { fetchRegistrarOptions, type RegistrarOption } from '../utils/allotmentCheck';
import { ui } from '../styles/ui';
import { useQuery } from '../hooks/useQuery';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export default function IposScreen() {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<any>({ ipoSegment: 'MAINBOARD', enableHni: false });
  const [registrarOptions, setRegistrarOptions] = useState<RegistrarOption[]>([]);

  useEffect(() => {
    fetchRegistrarOptions(client).then(setRegistrarOptions);
  }, []);

  const fetcher = useCallback(async () => {
    const [active, invalid] = await Promise.all([
      client.get('/ipos'),
      client.get('/ipos', { params: { invalidOnly: 1 } }),
    ]);
    return { active: active.data as any[], invalid: invalid.data as any[] };
  }, []);
  const { data, loading, refresh } = useQuery(fetcher);

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

  const markInvalid = (ipo: any) => {
    Alert.alert(
      'Mark as invalid IPO?',
      'Hides from the main list. Records are kept — you can restore later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark invalid',
          style: 'destructive',
          onPress: async () => {
            try {
              await client.post(`/ipos/${ipo.id}/invalidate`);
              await refresh();
            } catch (err) {
              Alert.alert('Error', getErrorMessage(err));
            }
          },
        },
      ]
    );
  };

  const restoreIpo = (ipo: any) => {
    Alert.alert('Restore to main IPO list?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restore',
        onPress: async () => {
          try {
            await client.post(`/ipos/${ipo.id}/restore`);
            await refresh();
          } catch (err) {
            Alert.alert('Error', getErrorMessage(err));
          }
        },
      },
    ]);
  };

  const deleteIpo = (ipo: any) => {
    Alert.alert(
      'Permanently delete this IPO?',
      'Only empty invalid IPOs can be deleted. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await client.delete(`/ipos/${ipo.id}`);
              await refresh();
            } catch (err) {
              Alert.alert('Error', getErrorMessage(err));
            }
          },
        },
      ]
    );
  };

  const renderIpoCard = (r: any, { invalid = false } = {}) => {
    const pendingReturn = Number(r.pending_return_count) || 0;
    const apps = Number(r.application_count) || 0;
    return (
      <View key={r.id} style={ui.card}>
        <ListRow
          title={r.name}
          subtitle={r.ipo_segment === 'SME' ? 'SME' : 'Mainboard'}
          onPress={() => router.push(`/(manager)/ipos/${r.id}`)}
          right={invalid ? <Tag label="INVALID" color="#64748b" /> : undefined}
        />
        <View style={styles.metaBlock}>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>RII </Text>
            {formatCurrency(getLotAmountForCategory(r, 'RII'))}
            {ipoAllowsHni(r) ? (
              <>
                {'  ·  '}
                <Text style={styles.metaLabel}>HNI </Text>
                {ipoHasHniLot(r) ? formatCurrency(getLotAmountForCategory(r, 'HNI')) : 'Not set'}
              </>
            ) : null}
          </Text>
          <View style={styles.statsRow}>
            <Text style={styles.statItem}>
              <Text style={styles.metaLabel}>Apps </Text>
              {apps}
            </Text>
            <Text style={[styles.statItem, pendingReturn > 0 && styles.pendingWarn]}>
              <Text style={styles.metaLabel}>Pending return </Text>
              {pendingReturn}
            </Text>
          </View>
        </View>
        <View style={ui.rowActions}>
          <Button compact onPress={() => router.push(`/(manager)/ipos/${r.id}`)}>View</Button>
          {invalid ? (
            <>
              <Button compact onPress={() => restoreIpo(r)}>Restore</Button>
              <Button compact textColor="#dc2626" onPress={() => deleteIpo(r)}>Delete</Button>
            </>
          ) : (
            <>
              {r.status === 'OPEN' ? (
                <Button compact textColor="#dc2626" onPress={() => Alert.alert('Close IPO?', 'Status only — does not return funds.', [{ text: 'Cancel' }, { text: 'Close', onPress: () => toggleStatus(r, 'close') }])}>Close</Button>
              ) : (
                <Button compact onPress={() => toggleStatus(r, 'reopen')}>Reopen</Button>
              )}
              <Button compact textColor="#64748b" onPress={() => markInvalid(r)}>Invalid</Button>
            </>
          )}
        </View>
      </View>
    );
  };

  if (loading && !data) return <Loading />;

  return (
    <Screen>
      <PageHeader
        title="IPOs"
        subtitle="Create IPOs, distribute funds, track allotments"
        extra={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button compact mode="outlined" onPress={refresh}>Refresh</Button>
            <Button mode="contained" onPress={() => { setForm({ ipoSegment: 'MAINBOARD', enableHni: false }); setModalOpen(true); }}>New IPO</Button>
          </View>
        }
      />
      <ContentCard title={`IPO List (${list.length})`}>
        {list.map((r) => renderIpoCard(r))}
      </ContentCard>

      {invalidList.length > 0 && (
        <ContentCard title={`Invalid IPOs (${invalidList.length})`}>
          <Banner variant="warn">
            Duplicate or mistaken IPOs. Restore to bring back, or delete if there are no applications.
          </Banner>
          {invalidList.map((r) => renderIpoCard(r, { invalid: true }))}
        </ContentCard>
      )}

      <SlideModal visible={modalOpen} title="Create IPO" onClose={() => setModalOpen(false)} closeLabel="Cancel">
        <TextInput label="IPO Name" value={form.name || ''} onChangeText={(v) => setForm({ ...form, name: v })} mode="outlined" style={ui.input} />
        <TextInput label="Segment (MAINBOARD/SME)" value={form.ipoSegment || 'MAINBOARD'} onChangeText={(v) => setForm({ ...form, ipoSegment: v })} mode="outlined" style={ui.input} />
        <TextInput label="RII lot amount" value={String(form.lotAmountRii || '')} onChangeText={(v) => setForm({ ...form, lotAmountRii: v })} keyboardType="numeric" mode="outlined" style={ui.input} />
        <Text style={ui.sectionLabel}>Allotment registrar (optional)</Text>
        <FilterChips
          value={form.registrar || ''}
          onChange={(v) => setForm({ ...form, registrar: v || undefined })}
          scrollable={false}
          options={[
            { value: '', label: 'None' },
            ...registrarOptions.map((o) => ({ value: o.value, label: o.label })),
          ]}
        />
        <Checkbox.Item label="Enable HNI" status={form.enableHni ? 'checked' : 'unchecked'} onPress={() => setForm({ ...form, enableHni: !form.enableHni })} />
        {form.enableHni && (
          <TextInput label="HNI lot amount" value={String(form.lotAmountHni || '')} onChangeText={(v) => setForm({ ...form, lotAmountHni: v })} keyboardType="numeric" mode="outlined" style={ui.input} />
        )}
        <Button mode="contained" onPress={onCreate}>Create</Button>
      </SlideModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  metaBlock: { marginTop: 4, marginBottom: 4, gap: 6 },
  metaLine: { fontSize: 13, color: colors.text, lineHeight: 20 },
  metaLabel: { color: colors.textSecondary, fontWeight: '500' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  statItem: { fontSize: 13, color: colors.text, fontVariant: ['tabular-nums'] },
  pendingWarn: { color: '#d97706', fontWeight: '600' },
});
