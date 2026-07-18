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
import { openActionSheet } from '../utils/actionSheet';

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

  const openResolve = (row: any) => {
    setResolveTarget(row);
    setResolutionNote('');
  };

  const openIssueMore = (row: any) => {
    if (row.status === 'OPEN') {
      openActionSheet(row.member_name, [{ text: 'Resolve', onPress: () => openResolve(row) }]);
      return;
    }
    openActionSheet(row.member_name, [
      {
        text: 'Reopen',
        onPress: () => updateStatus(row.id, 'OPEN'),
      },
    ]);
  };

  const openHeaderMore = () => {
    openActionSheet('Notifications', [{ text: 'Refresh', onPress: load }]);
  };

  if (loading && !issues.length) return <Loading />;

  return (
    <Screen>
      <PageHeader
        title="Notifications"
        extra={
          <Button compact mode="text" onPress={openHeaderMore}>
            More
          </Button>
        }
      />
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
        {issues.length === 0 ? (
          <Text>No member issues yet</Text>
        ) : (
          issues.map((row) => (
            <View key={row.id} style={styles.issue}>
              <ListRow
                title={row.member_name}
                subtitle={`${formatDateTime(row.created_at)} · PAN ${formatPan(row.member_pan)}`}
                right={
                  <Tag
                    label={row.status === 'OPEN' ? 'Open' : 'Resolved'}
                    color={row.status === 'OPEN' ? '#d97706' : '#059669'}
                  />
                }
                onPress={() => openIssueMore(row)}
              />
              {row.status === 'OPEN' ? (
                <Button mode="contained" compact onPress={() => openResolve(row)}>
                  Resolve
                </Button>
              ) : null}
            </View>
          ))
        )}
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
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalSub: { marginTop: 8, color: '#64748b' },
});
