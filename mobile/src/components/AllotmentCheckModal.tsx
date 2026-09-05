import { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from 'react-native-paper';
import FilterChips from './FilterChips';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';
import { fetchRegistrarOptions, type RegistrarOption } from '../utils/allotmentCheck';
import Tag from './Tag';
import { ui } from '../styles/ui';

type Props = {
  ipoId: number;
  visible: boolean;
  onClose: () => void;
  onChecked?: () => void;
};

export default function AllotmentCheckModal({ ipoId, visible, onClose, onChecked }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [savingRegistrar, setSavingRegistrar] = useState(false);
  const [registrarOptions, setRegistrarOptions] = useState<RegistrarOption[]>([]);

  const load = () => {
    if (!visible || !ipoId) {
      setData(null);
      setSummary(null);
      return;
    }
    setLoading(true);
    client
      .get(`/ipos/${ipoId}/allotment-check`)
      .then((r) => setData(r.data))
      .catch((err) => Alert.alert('Error', getErrorMessage(err, 'Failed to load')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!visible) return;
    fetchRegistrarOptions(client).then(setRegistrarOptions);
  }, [visible]);

  useEffect(() => {
    load();
  }, [visible, ipoId]);

  const saveRegistrar = async (registrar: string) => {
    setSavingRegistrar(true);
    try {
      await client.patch(`/ipos/${ipoId}`, { registrar: registrar || null });
      const { data: refreshed } = await client.get(`/ipos/${ipoId}/allotment-check`);
      setData(refreshed);
      Alert.alert('Success', 'Registrar saved');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Save failed'));
    } finally {
      setSavingRegistrar(false);
    }
  };

  const runCheck = async (recheck = false) => {
    setChecking(true);
    try {
      const { data: result } = await client.post(
        `/ipos/${ipoId}/allotment/auto-check`,
        { recheck },
        { timeout: 120000 }
      );
      setSummary(result);
      const { data: refreshed } = await client.get(`/ipos/${ipoId}/allotment-check`);
      setData(refreshed);
      onChecked?.();
      Alert.alert(
        result.checked ? 'Allotment updated' : 'Nothing to update',
        `Checked ${result.checked}. Allotted ${result.allotted}. Not allotted ${result.notAllotted}.`
      );
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Allotment check failed'));
    } finally {
      setChecking(false);
    }
  };

  const members = data?.applications || data?.members || [];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={ui.modal}>
        <View style={ui.modalHeader}>
          <Text style={ui.modalTitle}>{data ? `Check allotment — ${data.ipo.name}` : 'Check allotment'}</Text>
          <Button mode="text" onPress={onClose}>Close</Button>
        </View>
        <ScrollView contentContainerStyle={ui.modalBody}>
          <View style={[ui.banner, ui.bannerInfo]}>
            <Text style={ui.bannerText}>
              The server finds which registrar currently lists this IPO and checks member PANs there. Bigshare, Cameo and Purva still need a website captcha.
            </Text>
          </View>

          <Button mode="contained" loading={checking} onPress={() => runCheck(false)} style={{ marginBottom: 8 }}>
            Check pending
          </Button>
          <Button mode="outlined" loading={checking} onPress={() => runCheck(true)} style={{ marginBottom: 16 }}>
            Recheck all
          </Button>

          {summary ? (
            <Text style={ui.muted}>
              Checked {summary.checked} · allotted {summary.allotted} · not allotted {summary.notAllotted}
            </Text>
          ) : null}

          <Text style={ui.sectionLabel}>IPO registrar (optional)</Text>
          <FilterChips
            value={data?.ipo?.registrar || ''}
            onChange={(v) => !savingRegistrar && saveRegistrar(v)}
            scrollable={false}
            options={[
              { value: '', label: 'None' },
              ...registrarOptions.map((o) => ({ value: o.value, label: o.label })),
            ]}
          />

          <Text style={ui.sectionLabel}>Members</Text>
          {loading ? (
            <Text style={ui.muted}>Loading…</Text>
          ) : (
            members.map((row: any) => (
              <View key={row.id} style={ui.card}>
                <View style={styles.memberTop}>
                  <Text style={styles.memberName}>{row.display_name}</Text>
                  <Tag
                    label={String(row.allotment_status || 'PENDING').replace(/_/g, ' ')}
                    color={row.allotment_status === 'ALLOTED' ? '#059669' : '#64748b'}
                  />
                </View>
                <Text style={styles.pan}>{row.maskedPan || '—'}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  memberTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  memberName: { fontWeight: '600', flex: 1 },
  pan: { fontFamily: 'monospace', fontSize: 14 },
});
