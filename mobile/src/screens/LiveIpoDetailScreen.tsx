import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import InfoLine from '../components/InfoLine';
import ContentCard from '../components/ContentCard';
import { useQuery } from '../hooks/useQuery';
import { getErrorMessage } from '../utils/errors';
import { formatCurrency } from '../utils/format';
import { canAddLiveIpoToMyIpos, formatGmp, formatPriceBand, formatShortDate, liveStatusLabel, relativeTime } from '../utils/liveIpo';
import { colors } from '../theme';

export default function LiveIpoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [adding, setAdding] = useState(false);

  const fetcher = useCallback(async () => {
    const [ipoRes, gmpRes] = await Promise.all([
      client.get(`/live-ipos/${id}`),
      client.get(`/live-ipos/${id}/gmp/history`).catch(() => ({ data: null })),
    ]);
    return { ipo: ipoRes.data.data, gmp: gmpRes.data };
  }, [id]);
  const { data, loading, refresh } = useQuery(fetcher, [id], { cacheKey: `live-ipo-${id}` });

  const add = async () => {
    setAdding(true);
    try {
      const { data: result } = await client.post(`/live-ipos/${id}/add-to-my-ipos`);
      Alert.alert('Added', 'This IPO is now in My IPOs');
      if (result.ipo?.id) router.replace(`/(manager)/ipos/${result.ipo.id}`);
      else await refresh();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not add IPO'));
    } finally {
      setAdding(false);
    }
  };

  if (loading && !data) return <Loading />;
  const ipo = data?.ipo;
  if (!ipo) {
    return (
      <Screen>
        <PageHeader title="Live IPO" />
        <Text style={styles.missing}>Live IPO not found.</Text>
      </Screen>
    );
  }

  const history = (data?.gmp?.history || []).slice(-14).reverse();
  const summary = data?.gmp?.summary || {};

  return (
    <Screen>
      <PageHeader
        title={ipo.name}
        subtitle={`${liveStatusLabel(ipo.status)} · ${ipo.marketType === 'SME' ? 'SME' : 'Mainboard'}`}
        extra={
          ipo.isMyIpo ? (
            <Button compact mode="contained" onPress={() => router.push(`/(manager)/ipos/${ipo.myIpoId}`)}>
              Open My IPO
            </Button>
          ) : canAddLiveIpoToMyIpos(ipo) ? (
            <Button compact mode="contained" loading={adding} onPress={add}>
              Add to My IPOs
            </Button>
          ) : (
            <Button compact disabled>{ipo.status === 'LISTED' ? 'Listed' : 'Closed'}</Button>
          )
        }
      />
      <ContentCard title="Issue">
        <InfoLine label="Company" value={ipo.companyName || '—'} />
        <InfoLine label="Symbol" value={ipo.symbol || '—'} />
        <InfoLine label="Price" value={formatPriceBand(ipo)} />
        <InfoLine label="Lot" value={ipo.lotSize != null ? String(ipo.lotSize) : '—'} />
        <InfoLine label="Size" value={ipo.issueSize || '—'} />
        <InfoLine label="Registrar" value={ipo.registrarName || ipo.registrar || '—'} />
      </ContentCard>
      <ContentCard title="Dates">
        <InfoLine label="Open" value={formatShortDate(ipo.openDate)} />
        <InfoLine label="Close" value={formatShortDate(ipo.closeDate)} />
        <InfoLine label="Allotment" value={formatShortDate(ipo.allotmentDate)} />
        <InfoLine label="Listing" value={formatShortDate(ipo.listingDate)} />
      </ContentCard>
      <ContentCard title="GMP">
        <InfoLine label="Current" value={formatGmp(ipo.gmp)} />
        <InfoLine label="GMP %" value={ipo.gmpPercentage != null ? `${ipo.gmpPercentage}%` : '—'} />
        <InfoLine label="Est. listing" value={ipo.estimatedListingPrice > 0 ? formatCurrency(ipo.estimatedListingPrice) : '—'} />
        <InfoLine label="Updated" value={relativeTime(ipo.gmpLastUpdated)} />
        <InfoLine label="High" value={formatGmp(summary.highest)} />
        <InfoLine label="Low" value={formatGmp(summary.lowest)} />
      </ContentCard>
      {history.length > 0 ? (
        <ContentCard title="Recent GMP">
          {history.map((h: any) => (
            <View key={h.id} style={styles.row}>
              <Text style={styles.date}>{formatShortDate(h.recordedAt)}</Text>
              <Text style={styles.value}>{formatGmp(h.gmp)}</Text>
            </View>
          ))}
        </ContentCard>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  missing: { fontSize: 16, color: colors.textSecondary },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  date: { fontSize: 16, fontWeight: '600', color: colors.text },
  value: { fontSize: 18, fontWeight: '800', color: colors.text },
});
