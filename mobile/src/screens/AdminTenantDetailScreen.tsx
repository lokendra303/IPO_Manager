import { useCallback, useState } from 'react';
import { Alert, Modal, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, TextInput } from 'react-native-paper';
import adminClient from '../api/adminClient';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard, { PnlStatCard } from '../components/StatCard';
import StatGrid from '../components/StatGrid';
import Loading from '../components/Loading';
import ListRow from '../components/ListRow';
import Tag from '../components/Tag';
import FilterChips from '../components/FilterChips';
import ActionGrid, { ActionCell } from '../components/ActionGrid';
import { formatCurrency, formatDateTime, formatPan } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import { useQuery } from '../hooks/useQuery';
import { ui } from '../styles/ui';

type Section = 'overview' | 'members' | 'ipos' | 'providers';

const SECTIONS: { value: Section; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'members', label: 'Members' },
  { value: 'ipos', label: 'IPOs' },
  { value: 'providers', label: 'Providers' },
];

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#d97706',
  APPROVED: '#059669',
  REJECTED: '#dc2626',
  DISABLED: '#64748b',
};

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={ui.infoLine}>
      <Text style={ui.infoLabel}>{label}</Text>
      <Text style={ui.infoValue}>{value}</Text>
    </View>
  );
}

export default function AdminTenantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [acting, setActing] = useState(false);
  const [section, setSection] = useState<Section>('overview');
  const [reasonModal, setReasonModal] = useState<'reject' | 'disable' | null>(null);
  const [reason, setReason] = useState('');

  const fetcher = useCallback(async () => {
    if (!id) return null;
    const { data } = await adminClient.get(`/admin/tenants/${id}`);
    return data;
  }, [id]);

  const { data, loading, refresh, reload } = useQuery(fetcher, [id], { enabled: !!id });

  const runAction = async (fn: () => Promise<unknown>, successMsg?: string) => {
    setActing(true);
    try {
      const res: any = await fn();
      if (successMsg || res?.data?.message) {
        Alert.alert('Success', successMsg || res.data.message);
      }
      await reload();
      refresh().catch(() => {});
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Action failed'));
    } finally {
      setActing(false);
    }
  };

  const submitReasonAction = async () => {
    if (!id || !reasonModal) return;
    if (reasonModal === 'reject') {
      await runAction(() =>
        adminClient.post(`/admin/registrations/${id}/reject`, {
          reason: reason.trim() || 'Registration rejected by administrator',
        })
      );
    } else {
      await runAction(() =>
        adminClient.post(`/admin/tenants/${id}/disable`, { reason: reason.trim() || undefined })
      );
    }
    setReasonModal(null);
    setReason('');
  };

  if (loading && !data) return <Loading />;
  if (!data) {
    return (
      <Screen>
        <PageHeader title="Team not found" subtitle="This team may have been removed" />
        <Button mode="contained" onPress={() => router.back()}>Go back</Button>
      </Screen>
    );
  }

  const { tenant, financial, members = [], fundProviders = [], ipos = [], memberSummary = [] } = data;
  const f = financial || {};

  return (
    <Screen>
      <PageHeader
        title={tenant.name}
        subtitle={`Owner: ${tenant.owner_email}`}
        extra={<Button compact mode="outlined" onPress={refresh}>Refresh</Button>}
      />

      <ContentCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Tag label={tenant.status} color={STATUS_COLORS[tenant.status] || '#64748b'} />
          <Button compact onPress={() => router.push('/(admin)/registrations')}>Back to list</Button>
        </View>

        <ActionGrid>
          {tenant.status === 'PENDING' && (
            <>
              <ActionCell>
                <Button mode="contained" loading={acting} onPress={() => runAction(() => adminClient.post(`/admin/registrations/${id}/approve`))}>
                  Approve
                </Button>
              </ActionCell>
              <ActionCell>
                <Button mode="outlined" loading={acting} onPress={() => { setReason(''); setReasonModal('reject'); }}>
                  Reject
                </Button>
              </ActionCell>
            </>
          )}
          {tenant.status === 'REJECTED' && (
            <ActionCell>
              <Button mode="contained" loading={acting} onPress={() => runAction(() => adminClient.post(`/admin/registrations/${id}/reopen`))}>
                Reopen
              </Button>
            </ActionCell>
          )}
          {tenant.status === 'APPROVED' && (
            <ActionCell>
              <Button mode="outlined" loading={acting} onPress={() => { setReason(''); setReasonModal('disable'); }}>
                Disable team
              </Button>
            </ActionCell>
          )}
          {tenant.status === 'DISABLED' && (
            <ActionCell>
              <Button mode="contained" loading={acting} onPress={() => runAction(() => adminClient.post(`/admin/tenants/${id}/enable`))}>
                Re-enable
              </Button>
            </ActionCell>
          )}
        </ActionGrid>
      </ContentCard>

      <ContentCard title="Financial snapshot">
        <StatGrid>
          <StatCard title="Wallet" value={formatCurrency(f.walletBalance)} variant="primary" />
          <StatCard title="Bank accounts" value={formatCurrency(f.bankBalance)} variant="info" />
          <StatCard title="Invested" value={formatCurrency(f.currentInvested)} variant="warning" />
          <StatCard title="Outstanding" value={formatCurrency(f.outstandingWithMembers)} variant="danger" />
          <StatCard title="IPO profit" value={formatCurrency(f.ipoProfit)} variant="success" />
          <StatCard title="IPO loss" value={formatCurrency(f.ipoLoss)} variant="danger" />
          <PnlStatCard title="Net IPO P&L" value={Number(f.grossIpoPnL ?? 0)} formatted={formatCurrency(f.grossIpoPnL)} />
          <StatCard title="Pending dist." value={formatCurrency(f.grossPendingDistribution)} variant="warning" />
        </StatGrid>
      </ContentCard>

      <FilterChips value={section} options={SECTIONS} onChange={setSection} scrollable={false} />

      {section === 'overview' && (
        <ContentCard title="Team & account">
          <InfoLine label="Registered" value={formatDateTime(tenant.created_at)} />
          <InfoLine label="Members" value={String(members.length)} />
          <InfoLine label="Fund providers" value={String(fundProviders.length)} />
          <InfoLine label="Open IPOs" value={`${f.openIpos ?? 0} / ${f.totalIpos ?? 0}`} />
          <InfoLine label="Given to members" value={formatCurrency(f.totalGivenToMembers)} />
          <InfoLine label="Received from members" value={formatCurrency(f.totalReceivedFromMembers)} />
          <InfoLine label="Provider net balance" value={formatCurrency(f.providerNetBalance)} />
          <InfoLine label="Manager share" value={formatCurrency(f.managerShareTotal)} />
          <InfoLine label="Provider share" value={formatCurrency(f.providerShareTotal)} />
          <InfoLine label="Member share" value={formatCurrency(f.memberShareTotal)} />
          {tenant.rejection_reason ? <InfoLine label="Rejection reason" value={tenant.rejection_reason} /> : null}
          {tenant.disable_reason ? <InfoLine label="Disable reason" value={tenant.disable_reason} /> : null}
        </ContentCard>
      )}

      {section === 'members' && (
        <ContentCard title={`Members (${memberSummary.length || members.length})`}>
          {(memberSummary.length ? memberSummary : members).map((m: any) => (
            <ListRow
              key={m.memberId || m.id}
              title={m.displayName || m.display_name}
              subtitle={[
                formatPan(m.pan) || '—',
                m.status,
                m.totalGiven != null ? `Given ${formatCurrency(m.totalGiven)}` : null,
                m.willReceiveFromTeam != null ? `Due ${formatCurrency(m.willReceiveFromTeam)}` : null,
              ].filter(Boolean).join(' · ')}
              right={m.status ? <Tag label={m.status} color={m.status === 'ACTIVE' ? '#059669' : '#64748b'} /> : undefined}
            />
          ))}
        </ContentCard>
      )}

      {section === 'ipos' && (
        <ContentCard title={`IPOs (${ipos.length})`}>
          {ipos.length ? ipos.map((ipo: any) => (
            <ListRow
              key={ipo.id}
              title={ipo.name}
              subtitle={`${ipo.status} · Lot ${formatCurrency(ipo.lot_amount_rii)} · ${formatDateTime(ipo.created_at)}`}
              right={<Tag label={ipo.status} color={ipo.status === 'OPEN' ? '#2563eb' : '#64748b'} />}
            />
          )) : <Text style={ui.muted}>No IPOs yet.</Text>}
        </ContentCard>
      )}

      {section === 'providers' && (
        <ContentCard title={`Fund providers (${fundProviders.length})`}>
          {fundProviders.length ? fundProviders.map((p: any) => (
            <ListRow
              key={p.id}
              title={p.name}
              subtitle={`Net ${formatCurrency(p.net_balance)} · ${formatDateTime(p.created_at)}`}
            />
          )) : <Text style={ui.muted}>No fund providers yet.</Text>}
        </ContentCard>
      )}

      <Modal visible={!!reasonModal} transparent animationType="fade" onRequestClose={() => setReasonModal(null)}>
        <View style={ui.modalBg}>
          <View style={ui.modalCard}>
            <Text style={ui.cardTitle}>
              {reasonModal === 'reject' ? 'Reject this team?' : 'Disable this team?'}
            </Text>
            <Text style={ui.hint}>
              {reasonModal === 'reject'
                ? 'The manager will not be able to sign in.'
                : 'Managers and members cannot sign in while disabled.'}
            </Text>
            <TextInput
              label="Reason (optional)"
              value={reason}
              onChangeText={setReason}
              mode="outlined"
              multiline
              style={ui.input}
            />
            <View style={ui.modalNav}>
              <Button onPress={() => setReasonModal(null)}>Cancel</Button>
              <Button mode="contained" loading={acting} onPress={submitReasonAction}>
                {reasonModal === 'reject' ? 'Reject' : 'Disable'}
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
