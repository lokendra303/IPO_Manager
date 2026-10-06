import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, TextInput } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import Loading from '../components/Loading';
import Banner from '../components/Banner';
import { useQuery } from '../hooks/useQuery';
import { getErrorMessage } from '../utils/errors';
import { formatCurrency } from '../utils/format';
import { canAddLiveIpoToMyIpos, formatGmp, formatPriceBand, formatShortDate, liveStatusLabel, relativeTime } from '../utils/liveIpo';
import { colors, radii, spacing } from '../theme';

export default function LiveIposScreen() {
  const [status, setStatus] = useState<'ALL' | 'UPCOMING' | 'OPEN' | 'CLOSED' | 'LISTED'>('ALL');
  const [type, setType] = useState<'ALL' | 'MAINBOARD' | 'SME'>('ALL');
  const [q, setQ] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);

  const fetcher = useCallback(async () => {
    const { data } = await client.get('/live-ipos');
    return data;
  }, []);
  const { data, loading, refresh } = useQuery(fetcher, [], { cacheKey: 'live-ipos' });
  const rows = data?.data || [];

  const counts = useMemo(() => ({
    ALL: rows.length,
    UPCOMING: rows.filter((r: any) => r.status === 'UPCOMING').length,
    OPEN: rows.filter((r: any) => r.status === 'OPEN').length,
    CLOSED: rows.filter((r: any) => r.status === 'CLOSED').length,
    LISTED: rows.filter((r: any) => r.status === 'LISTED').length,
  }), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r: any) => {
      if (needle) {
        const hit = [r.name, r.companyName, r.symbol].some((v) => String(v || '').toLowerCase().includes(needle));
        if (!hit) return false;
      }
      if (status !== 'ALL' && r.status !== status) return false;
      if (type !== 'ALL' && r.marketType !== type) return false;
      return true;
    });
  }, [rows, q, status, type]);

  const sync = async () => {
    setSyncing(true);
    try {
      const { data: result } = await client.post('/live-ipos/sync');
      Alert.alert('Updated', `${result.updated || 0} updated, ${result.created || 0} new`);
      setStatus('ALL');
      setType('ALL');
      setQ('');
      await refresh();
    } catch (err) {
      Alert.alert('Sync', getErrorMessage(err, 'Sync failed — showing last saved data'));
      await refresh();
    } finally {
      setSyncing(false);
    }
  };

  const addToMyIpos = async (id: number) => {
    setAddingId(id);
    try {
      await client.post(`/live-ipos/${id}/add-to-my-ipos`);
      Alert.alert('Added', 'This IPO is now in My IPOs');
      await refresh();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not add IPO'));
    } finally {
      setAddingId(null);
    }
  };

  if (loading && !data) return <Loading />;

  const subtitle = data?.usedFallback
    ? 'Sample data. Refresh to load the live market.'
    : data?.lastSyncedAt
      ? `Updated ${relativeTime(data.lastSyncedAt)}`
      : 'Add an IPO here before team applications.';

  const statusOptions = [
    { value: 'ALL' as const, label: 'All', count: counts.ALL },
    { value: 'UPCOMING' as const, label: 'Upcoming', count: counts.UPCOMING },
    { value: 'OPEN' as const, label: 'Open', count: counts.OPEN },
    { value: 'CLOSED' as const, label: 'Closed', count: counts.CLOSED },
    { value: 'LISTED' as const, label: 'Listed', count: counts.LISTED },
  ];
  const typeOptions = [
    { value: 'ALL' as const, label: 'All types' },
    { value: 'MAINBOARD' as const, label: 'Mainboard' },
    { value: 'SME' as const, label: 'SME' },
  ];

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Live IPOs</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <Button mode="contained" loading={syncing} onPress={sync} style={styles.refresh}>
          Refresh
        </Button>
      </View>
      {data?.usedFallback ? <Banner>Demo data — not the live market. Tap Refresh.</Banner> : null}
      <View style={styles.chips}>
        {statusOptions.map((opt) => {
          const on = status === opt.value;
          return (
            <Pressable key={opt.value} style={[styles.chip, on && styles.chipOn]} onPress={() => setStatus(opt.value)}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {opt.label} {opt.count}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.chips}>
        {typeOptions.map((opt) => {
          const on = type === opt.value;
          return (
            <Pressable key={opt.value} style={[styles.chip, on && styles.chipOn]} onPress={() => setType(opt.value)}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput mode="outlined" placeholder="Search name or symbol" value={q} onChangeText={setQ} style={styles.search} />
      {filtered.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{rows.length === 0 ? 'No live IPOs yet' : 'Nothing matches'}</Text>
          <Text style={styles.empty}>
            {rows.length === 0 ? 'Refresh to load the current market list.' : 'Try another status or clear the search.'}
          </Text>
          {rows.length === 0 ? (
            <Button mode="contained" loading={syncing} onPress={sync}>
              Refresh
            </Button>
          ) : null}
        </View>
      ) : (
        filtered.map((r: any) => {
          const canAdd = canAddLiveIpoToMyIpos(r);
          return (
            <Pressable key={r.id} style={styles.card} onPress={() => router.push(`/(manager)/live-ipos/${r.id}` as never)}>
              <View style={styles.head}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{r.name}</Text>
                  <Text style={styles.sub}>{r.companyName || r.symbol || '—'}</Text>
                </View>
                <View style={styles.gmp}>
                  <Text style={styles.gmpLabel}>GMP</Text>
                  <Text style={[styles.gmpValue, Number(r.gmp) < 0 && styles.down]}>{formatGmp(r.gmp)}</Text>
                </View>
              </View>
              <Text style={styles.meta}>
                {liveStatusLabel(r.status)} · {r.marketType === 'SME' ? 'SME' : 'Mainboard'}
                {r.isMyIpo ? ' · On My IPOs' : ''}
              </Text>
              <Text style={styles.meta}>
                {formatShortDate(r.openDate)} – {formatShortDate(r.closeDate)} · {formatPriceBand(r)}
                {r.lotSize ? ` · Lot ${r.lotSize}` : ''}
                {r.subscription?.total ? ` · ${r.subscription.total}x` : ''}
              </Text>
              {r.estimatedListingPrice > 0 ? (
                <Text style={styles.meta}>Est. listing {formatCurrency(r.estimatedListingPrice)}</Text>
              ) : null}
              <View style={styles.actions}>
                <Button compact mode="outlined" onPress={() => router.push(`/(manager)/live-ipos/${r.id}` as never)}>
                  Details
                </Button>
                {r.isMyIpo ? (
                  <Button compact disabled>Added</Button>
                ) : canAdd ? (
                  <Button compact mode="contained" loading={addingId === r.id} onPress={() => addToMyIpos(r.id)}>
                    Add to My IPOs
                  </Button>
                ) : (
                  <Button compact disabled>{r.status === 'LISTED' ? 'Listed' : 'Closed'}</Button>
                )}
              </View>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 6, lineHeight: 21 },
  refresh: { marginTop: spacing.md, alignSelf: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm },
  chip: {
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primaryDark },
  chipText: { fontSize: 14, fontWeight: '700', color: colors.text },
  chipTextOn: { color: '#fff' },
  search: { marginBottom: spacing.md, backgroundColor: colors.card },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: 4,
  },
  head: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  name: { fontSize: 20, fontWeight: '800', color: colors.text },
  sub: { fontSize: 16, fontWeight: '600', color: colors.text },
  gmp: { alignItems: 'flex-end' },
  gmpLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  gmpValue: { fontSize: 22, fontWeight: '800', color: colors.success },
  down: { color: colors.error },
  meta: { fontSize: 16, fontWeight: '600', color: colors.text },
  actions: { flexDirection: 'row', gap: 8, marginTop: spacing.sm },
  empty: { fontSize: 15, fontWeight: '600', color: colors.text, lineHeight: 21 },
});
