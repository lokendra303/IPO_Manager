import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { Button, Checkbox, TextInput } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import Loading from '../components/Loading';
import ListRow from '../components/ListRow';
import Tag from '../components/Tag';
import { categoryTagColor, getLotAmountForCategory, parseAllowedCategories } from '../utils/ipoCategories';
import { formatCurrency } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import SlideModal from '../components/SlideModal';
import { ui } from '../styles/ui';
import { useQuery } from '../hooks/useQuery';
import { Alert, View } from 'react-native';

export default function IposScreen() {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<any>({ ipoSegment: 'MAINBOARD', enableHni: false });

  const fetcher = useCallback(async () => {
    const { data } = await client.get('/ipos');
    return data as any[];
  }, []);
  const { data: ipos, loading, refresh } = useQuery(fetcher);

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
      const { data } = await client.post('/ipos', payload);
      setModalOpen(false);
      await refresh();
      router.push(`/(manager)/ipos/${data.id}`);
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

  if (loading && !ipos) return <Loading />;

  const list = ipos ?? [];

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
        {list.map((r) => {
          const cats = parseAllowedCategories(r);
          return (
            <View key={r.id} style={ui.card}>
              <ListRow
                title={r.name}
                subtitle={`${r.ipo_segment === 'SME' ? 'SME' : 'Mainboard'} · RII ${formatCurrency(getLotAmountForCategory(r, 'RII'))} · ${r.application_count} apps`}
                onPress={() => router.push(`/(manager)/ipos/${r.id}`)}
                right={<Tag label={r.status} color={r.status === 'OPEN' ? '#059669' : '#dc2626'} />}
              />
              <View style={ui.chipRow}>{cats.map((c) => <Tag key={c} label={c} color={categoryTagColor(c)} />)}</View>
              <View style={ui.rowActions}>
                <Button compact onPress={() => router.push(`/(manager)/ipos/${r.id}`)}>View</Button>
                {r.status === 'OPEN' ? (
                  <Button compact textColor="#dc2626" onPress={() => Alert.alert('Close IPO?', 'Status only — does not return funds.', [{ text: 'Cancel' }, { text: 'Close', onPress: () => toggleStatus(r, 'close') }])}>Close</Button>
                ) : (
                  <Button compact onPress={() => toggleStatus(r, 'reopen')}>Reopen</Button>
                )}
              </View>
            </View>
          );
        })}
      </ContentCard>

      <SlideModal visible={modalOpen} title="Create IPO" onClose={() => setModalOpen(false)} closeLabel="Cancel">
        <TextInput label="IPO Name" value={form.name || ''} onChangeText={(v) => setForm({ ...form, name: v })} mode="outlined" style={ui.input} />
        <TextInput label="Segment (MAINBOARD/SME)" value={form.ipoSegment || 'MAINBOARD'} onChangeText={(v) => setForm({ ...form, ipoSegment: v })} mode="outlined" style={ui.input} />
        <TextInput label="RII lot amount" value={String(form.lotAmountRii || '')} onChangeText={(v) => setForm({ ...form, lotAmountRii: v })} keyboardType="numeric" mode="outlined" style={ui.input} />
        <TextInput label="Registrar (KFIN, LINK_INTIME, etc.)" value={form.registrar || ''} onChangeText={(v) => setForm({ ...form, registrar: v })} mode="outlined" style={ui.input} />
        <Checkbox.Item label="Enable HNI" status={form.enableHni ? 'checked' : 'unchecked'} onPress={() => setForm({ ...form, enableHni: !form.enableHni })} />
        {form.enableHni && (
          <TextInput label="HNI lot amount" value={String(form.lotAmountHni || '')} onChangeText={(v) => setForm({ ...form, lotAmountHni: v })} keyboardType="numeric" mode="outlined" style={ui.input} />
        )}
        <Button mode="contained" onPress={onCreate}>Create</Button>
      </SlideModal>
    </Screen>
  );
}
