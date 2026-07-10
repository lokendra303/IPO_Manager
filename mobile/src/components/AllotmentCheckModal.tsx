import { useEffect, useState } from 'react';
import { Alert, Linking, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from 'react-native-paper';
import FilterChips from './FilterChips';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';
import { copyToClipboard, getAllotmentPortals, openAllotmentPortal, REGISTRAR_OPTIONS } from '../utils/allotmentCheck';
import { formatPan } from '../utils/format';
import Tag from './Tag';
import { ui } from '../styles/ui';

type Props = {
  ipoId: number;
  visible: boolean;
  onClose: () => void;
  onApplyStatus: (appId: number, status: 'ALLOTED' | 'NOT_ALLOTED') => void;
};

export default function AllotmentCheckModal({ ipoId, visible, onClose, onApplyStatus }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [savingRegistrar, setSavingRegistrar] = useState(false);

  useEffect(() => {
    if (!visible || !ipoId) {
      setData(null);
      return;
    }
    setLoading(true);
    client
      .get(`/ipos/${ipoId}/allotment-check`)
      .then((r) => setData(r.data))
      .catch((err) => Alert.alert('Error', getErrorMessage(err, 'Failed to load')))
      .finally(() => setLoading(false));
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

  const copyPan = async (pan: string) => {
    const ok = await copyToClipboard(formatPan(pan));
    Alert.alert(ok ? 'Copied' : 'Error', ok ? 'PAN copied to clipboard' : 'Could not copy PAN');
  };

  const portals = data?.portals?.length ? data.portals : getAllotmentPortals(data?.ipo?.registrar);

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
              No free API for automatic PAN allotment lookup. Copy each member PAN, open an official portal,
              select this IPO, then mark status below or in the applications list.
            </Text>
          </View>

          <Text style={ui.sectionLabel}>IPO registrar (optional)</Text>
          <FilterChips
            value={data?.ipo?.registrar || ''}
            onChange={(v) => !savingRegistrar && saveRegistrar(v)}
            scrollable={false}
            options={[
              { value: '', label: 'None' },
              ...REGISTRAR_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
            ]}
          />

          {portals.length > 0 && (
            <>
              <Text style={ui.sectionLabel}>Official check portals</Text>
              <View style={styles.portalRow}>
                {portals.map((p: any) => (
                  <Button
                    key={p.id}
                    mode="outlined"
                    compact
                    onPress={() => openAllotmentPortal(p.url).catch(() => Linking.openURL(p.url))}
                  >
                    {p.recommended ? `★ ${p.name}` : p.name}
                  </Button>
                ))}
              </View>
            </>
          )}

          <Text style={ui.sectionLabel}>Members</Text>
          {loading ? (
            <Text style={ui.muted}>Loading…</Text>
          ) : (
            (data?.members || []).map((row: any) => (
              <View key={row.id} style={ui.card}>
                <View style={styles.memberTop}>
                  <Text style={styles.memberName}>{row.display_name}</Text>
                  <Tag
                    label={String(row.allotment_status || 'PENDING').replace(/_/g, ' ')}
                    color={row.allotment_status === 'ALLOTED' ? '#059669' : '#64748b'}
                  />
                </View>
                <View style={styles.panRow}>
                  <Text style={styles.pan}>{formatPan(row.pan)}</Text>
                  <Button compact onPress={() => copyPan(row.pan)}>Copy PAN</Button>
                </View>
                <View style={styles.applyRow}>
                  <Button
                    compact
                    mode="contained"
                    onPress={() => {
                      onApplyStatus(row.id, 'ALLOTED');
                      Alert.alert('Marked allotted', `${row.display_name} — save changes to persist`);
                    }}
                  >
                    Allotted
                  </Button>
                  <Button
                    compact
                    mode="outlined"
                    onPress={() => {
                      onApplyStatus(row.id, 'NOT_ALLOTED');
                      Alert.alert('Marked not allotted', `${row.display_name} — save changes to persist`);
                    }}
                  >
                    Not allotted
                  </Button>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  portalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  memberTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  memberName: { fontWeight: '600', flex: 1 },
  panRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  pan: { fontFamily: 'monospace', fontSize: 14 },
  applyRow: { flexDirection: 'row', gap: 8 },
});
