import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import ContentCard from '../components/ContentCard';
import InfoLine from '../components/InfoLine';
import { formatCurrency } from '../utils/format';
import { formatGmp, formatShortDate, relativeTime } from '../utils/liveIpo';
import { colors, radii, spacing } from '../theme';

export default function GmpScreen() {
  const [ipos, setIpos] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [history, setHistory] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client
      .get('/my-ipos')
      .then((r) => {
        const rows = (r.data.data || []).filter((x: any) => x.catalog_id || x.gmp != null);
        setIpos(rows);
        setSelectedId(rows[0]?.id || null);
      })
      .finally(() => setLoading(false));
  }, []);

  const loadHistory = useCallback(async (id: number) => {
    const { data } = await client.get(`/ipos/${id}/gmp/history`);
    setHistory(data);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setHistory(null);
      return;
    }
    setHistory(null);
    loadHistory(selectedId).catch(() => setHistory(null));
  }, [selectedId, loadHistory]);

  if (loading) return <Loading />;
  const current = history?.current;
  const summary = history?.summary || {};
  const points = (history?.history || []).slice(-14).reverse();

  return (
    <Screen>
      <PageHeader title="GMP" subtitle="Grey market premium for IPOs on My IPOs." />
      {ipos.length === 0 ? (
        <Pressable onPress={() => router.push('/(manager)/live-ipos' as never)}>
          <Text style={styles.empty}>Add a live IPO to My IPOs to track GMP.</Text>
        </Pressable>
      ) : (
        <>
          {ipos.map((ipo) => (
            <Pressable
              key={ipo.id}
              style={[styles.pick, selectedId === ipo.id && styles.pickOn]}
              onPress={() => setSelectedId(ipo.id)}
            >
              <Text style={styles.pickName}>{ipo.name}</Text>
              <Text style={styles.pickGmp}>{formatGmp(ipo.gmp)}</Text>
            </Pressable>
          ))}
          {selectedId ? (
            <ContentCard title="Selected IPO">
              <InfoLine label="Current GMP" value={formatGmp(current?.gmp)} />
              <InfoLine label="GMP %" value={current?.gmpPercentage != null ? `${current.gmpPercentage}%` : '—'} />
              <InfoLine label="Est. listing" value={current?.estimatedListingPrice > 0 ? formatCurrency(current.estimatedListingPrice) : '—'} />
              <InfoLine label="Updated" value={relativeTime(current?.lastUpdated)} />
              <InfoLine label="High" value={formatGmp(summary.highest)} />
              <InfoLine label="Low" value={formatGmp(summary.lowest)} />
              <InfoLine label="Change" value={formatGmp(summary.change)} />
            </ContentCard>
          ) : null}
          {points.map((h: any) => (
            <View key={h.id} style={styles.row}>
              <Text style={styles.date}>{formatShortDate(h.recordedAt)}</Text>
              <Text style={styles.value}>{formatGmp(h.gmp)}</Text>
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 16, color: colors.primary, paddingVertical: spacing.md },
  pick: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginBottom: spacing.sm,
  },
  pickOn: { borderColor: colors.primary },
  pickName: { flex: 1, fontSize: 18, fontWeight: '800', color: colors.text },
  pickGmp: { fontSize: 18, fontWeight: '800', color: colors.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  date: { fontSize: 15, color: colors.textSecondary },
  value: { fontSize: 16, fontWeight: '700', color: colors.text },
});
