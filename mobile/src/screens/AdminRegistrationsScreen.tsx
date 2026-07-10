import { useCallback, useState } from 'react';
import { Alert, Modal, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, TextInput } from 'react-native-paper';
import adminClient from '../api/adminClient';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import Loading from '../components/Loading';
import ListRow from '../components/ListRow';
import Tag from '../components/Tag';
import FilterChips from '../components/FilterChips';
import ActionGrid, { ActionCell } from '../components/ActionGrid';
import { formatCurrency, formatDateTime } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import { useQuery } from '../hooks/useQuery';
import { ui } from '../styles/ui';

type StatusFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'DISABLED' | 'ALL';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'DISABLED', label: 'Disabled' },
  { value: 'ALL', label: 'All' },
];

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#d97706',
  APPROVED: '#059669',
  REJECTED: '#dc2626',
  DISABLED: '#64748b',
};

export default function AdminRegistrationsScreen() {
  const [status, setStatus] = useState<StatusFilter>('PENDING');
  const [actionId, setActionId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ id: number; name: string } | null>(null);
  const [disableTarget, setDisableTarget] = useState<{ id: number; name: string } | null>(null);
  const [reason, setReason] = useState('');

  const fetcher = useCallback(async () => {
    const { data } = await adminClient.get('/admin/registrations', { params: { status } });
    return data as any[];
  }, [status]);

  const { data, loading, refresh, reload } = useQuery(fetcher, [status]);
  const rows = data ?? [];

  const runAction = async (id: number, fn: () => Promise<unknown>) => {
    setActionId(id);
    try {
      await fn();
      await reload();
      refresh().catch(() => {});
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Action failed'));
    } finally {
      setActionId(null);
    }
  };

  const approve = (id: number) =>
    runAction(id, () => adminClient.post(`/admin/registrations/${id}/approve`));

  const reject = async () => {
    if (!rejectTarget) return;
    const id = rejectTarget.id;
    setActionId(id);
    try {
      await adminClient.post(`/admin/registrations/${id}/reject`, {
        reason: reason.trim() || 'Registration rejected by administrator',
      });
      setRejectTarget(null);
      setReason('');
      await reload();
      refresh().catch(() => {});
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Reject failed'));
    } finally {
      setActionId(null);
    }
  };

  const reopen = (id: number) =>
    runAction(id, () => adminClient.post(`/admin/registrations/${id}/reopen`));

  const disableTeam = async () => {
    if (!disableTarget) return;
    const id = disableTarget.id;
    setActionId(id);
    try {
      await adminClient.post(`/admin/tenants/${id}/disable`, {
        reason: reason.trim() || undefined,
      });
      setDisableTarget(null);
      setReason('');
      await reload();
      refresh().catch(() => {});
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Disable failed'));
    } finally {
      setActionId(null);
    }
  };

  const enableTeam = (id: number) =>
    runAction(id, () => adminClient.post(`/admin/tenants/${id}/enable`));

  if (loading && !rows.length) return <Loading />;

  return (
    <Screen>
      <PageHeader
        title="Manager Accounts"
        subtitle="Approve, reject, and manage team access"
        extra={<Button compact mode="outlined" onPress={refresh}>Refresh</Button>}
      />

      <FilterChips value={status} options={STATUS_FILTERS} onChange={setStatus} />

      {!rows.length ? (
        <ContentCard>
          <Text style={ui.muted}>No teams found for this filter.</Text>
        </ContentCard>
      ) : (
        rows.map((r) => {
          const teamName = r.name || 'Unnamed team';
          const subtitle = [
            r.owner_email,
            `${r.member_count ?? 0} members`,
            formatCurrency(r.wallet_balance ?? 0),
          ].join(' · ');

          return (
            <ContentCard key={r.id}>
              <ListRow
                title={teamName}
                subtitle={subtitle}
                onPress={() => router.push(`/(admin)/tenants/${r.id}`)}
                right={<Tag label={r.status} color={STATUS_COLORS[r.status] || '#64748b'} />}
              />
              <Text style={[ui.muted, { marginTop: 4 }]}>
                Registered {formatDateTime(r.created_at)}
                {r.status === 'APPROVED' && r.approved_at ? ` · Approved ${formatDateTime(r.approved_at)}` : ''}
              </Text>
              {r.rejection_reason ? (
                <Text style={[ui.muted, { marginTop: 4 }]}>Reason: {r.rejection_reason}</Text>
              ) : null}

              <ActionGrid>
                <ActionCell>
                  <Button mode="outlined" onPress={() => router.push(`/(admin)/tenants/${r.id}`)}>
                    Details
                  </Button>
                </ActionCell>
                {r.status === 'PENDING' && (
                  <>
                    <ActionCell>
                      <Button mode="contained" loading={actionId === r.id} onPress={() => approve(r.id)}>
                        Approve
                      </Button>
                    </ActionCell>
                    <ActionCell>
                      <Button
                        mode="outlined"
                        loading={actionId === r.id}
                        onPress={() => {
                          setReason('');
                          setRejectTarget({ id: r.id, name: teamName });
                        }}
                      >
                        Reject
                      </Button>
                    </ActionCell>
                  </>
                )}
                {r.status === 'REJECTED' && (
                  <ActionCell>
                    <Button mode="contained" loading={actionId === r.id} onPress={() => reopen(r.id)}>
                      Reopen
                    </Button>
                  </ActionCell>
                )}
                {r.status === 'APPROVED' && (
                  <ActionCell>
                    <Button
                      mode="outlined"
                      loading={actionId === r.id}
                      onPress={() => {
                        setReason('');
                        setDisableTarget({ id: r.id, name: teamName });
                      }}
                    >
                      Disable
                    </Button>
                  </ActionCell>
                )}
                {r.status === 'DISABLED' && (
                  <ActionCell>
                    <Button mode="contained" loading={actionId === r.id} onPress={() => enableTeam(r.id)}>
                      Enable
                    </Button>
                  </ActionCell>
                )}
              </ActionGrid>
            </ContentCard>
          );
        })
      )}

      <Modal visible={!!rejectTarget} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <View style={ui.modalBg}>
          <View style={ui.modalCard}>
            <Text style={ui.cardTitle}>Reject "{rejectTarget?.name}"?</Text>
            <Text style={ui.hint}>The manager will not be able to sign in.</Text>
            <TextInput
              label="Reason (optional)"
              value={reason}
              onChangeText={setReason}
              mode="outlined"
              multiline
              style={ui.input}
            />
            <View style={ui.modalNav}>
              <Button onPress={() => setRejectTarget(null)}>Cancel</Button>
              <Button mode="contained" loading={actionId === rejectTarget?.id} onPress={reject}>
                Reject
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!disableTarget} transparent animationType="fade" onRequestClose={() => setDisableTarget(null)}>
        <View style={ui.modalBg}>
          <View style={ui.modalCard}>
            <Text style={ui.cardTitle}>Disable "{disableTarget?.name}"?</Text>
            <Text style={ui.hint}>Managers and members cannot sign in while disabled.</Text>
            <TextInput
              label="Reason (optional)"
              value={reason}
              onChangeText={setReason}
              mode="outlined"
              multiline
              style={ui.input}
            />
            <View style={ui.modalNav}>
              <Button onPress={() => setDisableTarget(null)}>Cancel</Button>
              <Button mode="contained" loading={actionId === disableTarget?.id} onPress={disableTeam}>
                Disable
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
