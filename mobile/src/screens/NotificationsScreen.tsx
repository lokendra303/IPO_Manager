import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, View } from 'react-native';
import { Button, SegmentedButtons, TextInput } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import Loading from '../components/Loading';
import ListRow from '../components/ListRow';
import Tag from '../components/Tag';
import { formatDateTime, formatPan } from '../utils/format';
import { getErrorMessage } from '../utils/errors';

export default function NotificationsScreen() {
  const [issues, setIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [actionId, setActionId] = useState<number | null>(null);
  const [resolveTarget, setResolveTarget] = useState<any>(null);
  const [resolutionNote, setResolutionNote] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const params = filter === 'ALL' ? {} : { status: filter };
    return client.get('/member-issues', { params }).then((r) => setIssues(r.data)).finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: number, status: string, note?: string) => {
    setActionId(id);
    try {
      await client.patch(`/member-issues/${id}`, { status, resolutionNote: note });
      setResolveTarget(null);
      setResolutionNote('');
      await load();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Update failed'));
    } finally {
      setActionId(null);
    }
  };

  if (loading && !issues.length) return <Loading />;

  return (
    <Screen>
      <PageHeader title="Notifications" subtitle="Member issues — reply when resolving" extra={<Button onPress={load} loading={loading}>Refresh</Button>} />
      <SegmentedButtons
        value={filter}
        onValueChange={setFilter}
        buttons={[
          { value: 'ALL', label: 'All' },
          { value: 'OPEN', label: 'Open' },
          { value: 'RESOLVED', label: 'Resolved' },
        ]}
        style={{ marginBottom: 16 }}
      />
      <ContentCard>
        {issues.length === 0 ? <Text>No member issues yet</Text> : issues.map((row) => (
          <View key={row.id} style={styles.issue}>
            <ListRow
              title={row.member_name}
              subtitle={`${formatDateTime(row.created_at)} · PAN ${formatPan(row.member_pan)}\n${row.note}`}
              right={<Tag label={row.status === 'OPEN' ? 'Open' : 'Resolved'} color={row.status === 'OPEN' ? '#d97706' : '#059669'} />}
            />
            {row.resolution_note ? <Text style={styles.reply}>Reply: {row.resolution_note}</Text> : null}
            {row.status === 'OPEN' ? (
              <Button mode="contained" onPress={() => { setResolveTarget(row); setResolutionNote(''); }}>Resolve</Button>
            ) : (
              <Button mode="outlined" loading={actionId === row.id} onPress={() => updateStatus(row.id, 'OPEN')}>Reopen</Button>
            )}
          </View>
        ))}
      </ContentCard>

      <Modal visible={!!resolveTarget} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Resolve — {resolveTarget?.member_name}</Text>
            <Text style={styles.modalSub}>Member wrote: {resolveTarget?.note}</Text>
            <TextInput label="Your reply (optional)" value={resolutionNote} onChangeText={setResolutionNote} multiline mode="outlined" style={{ marginVertical: 12 }} />
            <Button mode="contained" loading={!!actionId} onPress={() => updateStatus(resolveTarget.id, 'RESOLVED', resolutionNote)}>Mark resolved</Button>
            <Button mode="text" onPress={() => setResolveTarget(null)}>Cancel</Button>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  issue: { marginBottom: 12 },
  reply: { fontSize: 13, color: '#64748b', marginBottom: 8, paddingHorizontal: 4 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalSub: { marginTop: 8, color: '#64748b' },
});
