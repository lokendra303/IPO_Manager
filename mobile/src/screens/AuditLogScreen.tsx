import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard from '../components/StatCard';
import StatGrid from '../components/StatGrid';
import Loading from '../components/Loading';
import FilterChips from '../components/FilterChips';
import Tag from '../components/Tag';
import { formatDateTime } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import { actionTagColor, formatMetadataKey, formatMetadataValue } from '../utils/auditLog';
import { ui } from '../styles/ui';
import { spacing } from '../theme';

const RETENTION_DAYS = 5;
const PAGE_SIZE = 30;

type ActorFilter = 'all' | 'manager' | 'member';

type AuditRow = {
  id: number;
  actor_type: string;
  actor_label: string;
  action: string;
  actionLabel?: string;
  entity_type?: string | null;
  entity_id?: number | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
  ip_address?: string | null;
  created_at: string;
};

type AuditStats = {
  total: number;
  last24h: number;
  manager: number;
  member: number;
};

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={ui.infoLine}>
      <Text style={ui.infoLabel}>{label}</Text>
      <Text style={ui.infoValue}>{value}</Text>
    </View>
  );
}

export default function AuditLogScreen() {
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [purging, setPurging] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [actorType, setActorType] = useState<ActorFilter>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const hasMore = rows.length < total;

  const loadPage = useCallback(
    async (pageNum: number, append: boolean) => {
      const params = {
        page: pageNum,
        pageSize: PAGE_SIZE,
        search: search || undefined,
        actorType: actorType === 'all' ? undefined : actorType,
      };
      const [statsRes, logsRes] = await Promise.all([
        client.get('/audit-logs/stats'),
        client.get('/audit-logs', { params }),
      ]);
      setStats(statsRes.data);
      setTotal(logsRes.data.total ?? 0);
      setPage(pageNum);
      setRows((prev) => (append ? [...prev, ...(logsRes.data.rows ?? [])] : logsRes.data.rows ?? []));
    },
    [actorType, search]
  );

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      await loadPage(1, false);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not load audit log'));
    } finally {
      setLoading(false);
    }
  }, [loadPage]);

  useEffect(() => {
    reload();
  }, [reload]);

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadPage(page + 1, true);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not load more events'));
    } finally {
      setLoadingMore(false);
    }
  };

  const applySearch = () => setSearch(searchInput.trim());

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setActorType('all');
  };

  const hasActiveFilters = useMemo(
    () => Boolean(search || actorType !== 'all'),
    [search, actorType]
  );

  const purgeOldLogs = async () => {
    try {
      const { data: preview } = await client.get('/audit-logs/purge-preview', {
        params: { days: RETENTION_DAYS },
      });
      if (!preview.count) {
        Alert.alert('Nothing to delete', `No audit logs older than ${RETENTION_DAYS} days.`);
        return;
      }

      Alert.alert(
        'Delete old audit logs?',
        `This will permanently delete ${preview.count.toLocaleString('en-IN')} event${preview.count === 1 ? '' : 's'} older than ${RETENTION_DAYS} days from your team.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              setPurging(true);
              try {
                const { data } = await client.delete('/audit-logs/purge', {
                  params: { days: RETENTION_DAYS },
                });
                Alert.alert(
                  'Done',
                  data.deleted
                    ? `Deleted ${data.deleted.toLocaleString('en-IN')} audit log${data.deleted === 1 ? '' : 's'}.`
                    : data.message || 'Nothing to delete'
                );
                await reload();
              } catch (err) {
                Alert.alert('Error', getErrorMessage(err, 'Purge failed'));
              } finally {
                setPurging(false);
              }
            },
          },
        ]
      );
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not check audit logs'));
    }
  };

  if (loading && !rows.length && !stats) return <Loading />;

  return (
    <Screen>
      <PageHeader
        title="Audit Log"
        subtitle="Team activity — sign-ins, IPO actions, wallet changes, and more"
        extra={<Button compact mode="outlined" onPress={reload}>Refresh</Button>}
      />

      <ContentCard title="Overview">
        <StatGrid>
          <StatCard title="Total events" value={stats?.total ?? 0} variant="primary" />
          <StatCard title="Last 24 hours" value={stats?.last24h ?? 0} variant="info" />
          <StatCard title="Manager events" value={stats?.manager ?? 0} variant="success" />
          <StatCard title="Member events" value={stats?.member ?? 0} variant="warning" />
        </StatGrid>
        <Button mode="outlined" loading={purging} onPress={purgeOldLogs} style={{ marginTop: 8 }}>
          Delete logs older than {RETENTION_DAYS} days
        </Button>
      </ContentCard>

      <ContentCard title="Filters">
        <TextInput
          label="Search summary or actor"
          value={searchInput}
          onChangeText={setSearchInput}
          mode="outlined"
          style={ui.input}
          onSubmitEditing={applySearch}
          returnKeyType="search"
        />
        <View style={ui.rowActions}>
          <Button mode="contained" onPress={applySearch}>Search</Button>
          {hasActiveFilters ? <Button mode="text" onPress={clearFilters}>Clear</Button> : null}
        </View>
        <FilterChips
          value={actorType}
          options={[
            { value: 'all', label: 'All' },
            { value: 'manager', label: 'Manager' },
            { value: 'member', label: 'Member' },
          ]}
          onChange={setActorType}
          scrollable={false}
        />
      </ContentCard>

      <ContentCard title={`Events (${total.toLocaleString('en-IN')})`}>
        {!rows.length ? (
          <Text style={ui.muted}>No activity recorded for the current filters.</Text>
        ) : (
          rows.map((row) => {
            const expanded = expandedId === row.id;
            return (
              <Pressable
                key={row.id}
                style={[ui.card, { marginBottom: spacing.sm }]}
                onPress={() => setExpandedId(expanded ? null : row.id)}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <Text style={ui.cardMeta}>{formatDateTime(row.created_at)}</Text>
                  <Tag label={row.actionLabel || row.action} color={actionTagColor(row.action)} />
                </View>
                <Text style={ui.cardMeta}>
                  {row.actor_label} · {row.actor_type === 'manager' ? 'Manager' : 'Member'}
                </Text>
                <Text style={[ui.muted, { marginTop: 6 }]} numberOfLines={expanded ? undefined : 2}>
                  {row.summary}
                </Text>

                {expanded ? (
                  <View style={{ marginTop: 10, gap: 4 }}>
                    <InfoLine label="IP address" value={row.ip_address || '—'} />
                    {row.entity_type ? (
                      <InfoLine
                        label="Entity"
                        value={`${row.entity_type}${row.entity_id ? ` #${row.entity_id}` : ''}`}
                      />
                    ) : null}
                    {row.metadata
                      ? Object.entries(row.metadata).map(([key, value]) => (
                          <InfoLine key={key} label={formatMetadataKey(key)} value={formatMetadataValue(value)} />
                        ))
                      : <Text style={ui.muted}>No additional details recorded</Text>}
                  </View>
                ) : null}
              </Pressable>
            );
          })
        )}

        {hasMore ? (
          <Button mode="outlined" loading={loadingMore} onPress={loadMore} style={{ marginTop: 8 }}>
            Load more
          </Button>
        ) : rows.length > 0 ? (
          <Text style={[ui.muted, { marginTop: 8, textAlign: 'center' }]}>End of audit log</Text>
        ) : null}
      </ContentCard>
    </Screen>
  );
}
