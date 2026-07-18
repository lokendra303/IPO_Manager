import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard from '../components/StatCard';
import Loading from '../components/Loading';
import ListRow from '../components/ListRow';
import Tag from '../components/Tag';
import Banner from '../components/Banner';
import { formatCurrency, formatDateTime, formatPan } from '../utils/format';
import { useQuery } from '../hooks/useQuery';
import { useAuth } from '../context/AuthContext';
import { ALLOTMENT_COLORS, formatAllotmentLabel, formatIpoShareLine } from '../utils/memberPortal';
import { openActionSheet } from '../utils/actionSheet';
import { colors, spacing } from '../theme';
import { ui } from '../styles/ui';

export default function MemberIpoDetailScreen() {
  const { ipoId } = useLocalSearchParams<{ ipoId: string }>();
  const { user, isMember } = useAuth();

  const fetcher = useCallback(async () => {
    const { data } = await client.get(`/member-portal/ipo/${ipoId}`);
    return data;
  }, [ipoId]);

  const { data, loading, error, refresh } = useQuery(fetcher, [ipoId], {
    enabled: isMember && !!user?.id && !!ipoId,
  });

  const openPersonalMore = (personal: any) => {
    openActionSheet('Your application', [], [
      formatAllotmentLabel(personal.allotmentStatus),
      formatCurrency(personal.amount),
      personal.investorCategory,
      personal.fundReturned ? 'Fund returned' : 'Fund pending',
      personal.grossProfitLoss != null ? `Gross P&L ${formatCurrency(personal.grossProfitLoss)}` : null,
      personal.memberShare != null ? `Share ${formatCurrency(personal.memberShare)}` : null,
    ].filter(Boolean).join('\n'));
  };

  const openGroupAppMore = (app: any) => {
    openActionSheet(app.memberName, [], [
      formatPan(app.memberPan),
      formatCurrency(app.amount),
      formatAllotmentLabel(app.allotmentStatus),
      app.fundReturned ? 'Fund returned' : 'Fund pending',
      app.grossProfitLoss != null ? `P&L ${formatCurrency(app.grossProfitLoss)}` : null,
      formatIpoShareLine(app),
      app.memberUpi ? `UPI ${app.memberUpi}` : null,
    ].filter(Boolean).join('\n'));
  };

  const openHeaderMore = () => {
    openActionSheet(data?.ipo?.name || 'IPO', [{ text: 'Refresh', onPress: refresh }]);
  };

  if (loading && !data) return <Loading />;

  const ipo = data?.ipo;
  const personal = data?.personalApplication;
  const groupApps = data?.groupApplications ?? [];

  return (
    <Screen bottomNavInset>
      <PageHeader
        title={ipo?.name || 'IPO detail'}
        subtitle={ipo?.status || '—'}
        extra={
          <Button compact mode="text" onPress={openHeaderMore}>
            More
          </Button>
        }
      />
      {error ? <Banner variant="warn">{error}</Banner> : null}

      {ipo ? (
        <ContentCard title="IPO">
          <View style={ui.statRow}>
            <StatCard title="RII lot" value={formatCurrency(ipo.lotAmountRii)} variant="primary" />
            <StatCard title="Segment" value={ipo.ipoSegment || '—'} variant="info" />
            <StatCard title="Opens" value={ipo.openDate ? formatDateTime(ipo.openDate).split(',')[0] : '—'} variant="info" />
          </View>
        </ContentCard>
      ) : null}

      {personal ? (
        <ContentCard title="Your application">
          <View style={styles.compactRow}>
            <View style={styles.compactRowMain}>
              <ListRow
                title={formatAllotmentLabel(personal.allotmentStatus)}
                subtitle={`${formatCurrency(personal.amount)} · ${personal.fundReturned ? 'Returned' : 'Pending'}`}
                right={
                  <Tag
                    label={formatAllotmentLabel(personal.allotmentStatus)}
                    color={ALLOTMENT_COLORS[personal.allotmentStatus] || '#64748b'}
                  />
                }
                onPress={() => openPersonalMore(personal)}
              />
            </View>
            <Pressable hitSlop={12} onPress={() => openPersonalMore(personal)} style={styles.moreBtn}>
              <Text style={styles.moreText}>···</Text>
            </Pressable>
          </View>
        </ContentCard>
      ) : (
        <ContentCard title="Your application">
          <ListRow title="Not applied" subtitle="Manager has not added you yet" />
        </ContentCard>
      )}

      {data?.isLeader ? (
        <ContentCard title={`Group (${groupApps.length})`}>
          {groupApps.map((app: any) => (
            <View key={app.id} style={[styles.compactRow, { marginBottom: spacing.xs }]}>
              <View style={styles.compactRowMain}>
                <ListRow
                  title={`${app.memberName}${app.isLeader ? ' (You)' : ''}`}
                  subtitle={`${formatCurrency(app.amount)} · ${formatAllotmentLabel(app.allotmentStatus)}`}
                  right={
                    <Tag
                      label={formatAllotmentLabel(app.allotmentStatus)}
                      color={ALLOTMENT_COLORS[app.allotmentStatus] || '#64748b'}
                    />
                  }
                  onPress={() => openGroupAppMore(app)}
                />
              </View>
              <Pressable hitSlop={12} onPress={() => openGroupAppMore(app)} style={styles.moreBtn}>
                <Text style={styles.moreText}>···</Text>
              </Pressable>
            </View>
          ))}
        </ContentCard>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  compactRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  compactRowMain: { flex: 1 },
  moreBtn: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 20, fontWeight: '700', color: colors.textMuted, letterSpacing: 1 },
});
