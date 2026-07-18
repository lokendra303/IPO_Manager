import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import { router } from 'expo-router';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import Loading from '../components/Loading';
import ListRow from '../components/ListRow';
import Tag from '../components/Tag';
import Banner from '../components/Banner';
import { formatCurrency, formatDateTime } from '../utils/format';
import { openActionSheet } from '../utils/actionSheet';
import { useMemberActivity } from '../hooks/useMemberPortalExtras';
import { useMemberDashboard } from '../hooks/useMemberDashboard';
import { colors } from '../theme';

const TYPE_COLORS: Record<string, string> = {
  FUND_RECEIVED: '#d97706',
  FUND_RETURNED: '#059669',
  ALLOTED: '#059669',
  GROUP_ALLOTED: '#059669',
  NOT_ALLOTED: '#64748b',
  GROUP_NOT_ALLOTED: '#64748b',
  PROFIT_SHARED: '#0369a1',
  ISSUE_RESOLVED: '#059669',
  ISSUE_SUBMITTED: '#d97706',
  FUND_RETURN_CLAIMED: '#7c3aed',
  IPO_APPLIED: '#0369a1',
};

export default function MemberActivityScreen() {
  const { data: dashboard } = useMemberDashboard();
  const { data, loading, error, refresh } = useMemberActivity(50);
  const activity = data?.length ? data : dashboard?.activity ?? [];

  const openItemMore = (item: any) => {
    const actions = [
      ...(item.ipoId
        ? [{ text: 'View IPO', onPress: () => router.push(`/(member)/ipo/${item.ipoId}` as any) }]
        : []),
    ];
    openActionSheet(
      item.title,
      actions,
      [
        formatDateTime(item.at),
        item.detail,
        item.amount != null ? formatCurrency(item.amount) : null,
        item.memberName,
        item.type.replace(/_/g, ' '),
      ].filter(Boolean).join('\n')
    );
  };

  const openHeaderMore = () => {
    openActionSheet('Activity', [{ text: 'Refresh', onPress: refresh }]);
  };

  if (loading && !activity.length) return <Loading />;

  return (
    <Screen bottomNavInset>
      <PageHeader
        title="Activity"
        subtitle={`${activity.length} updates`}
        extra={
          <Button compact mode="text" onPress={openHeaderMore}>
            More
          </Button>
        }
      />
      {error ? <Banner variant="warn">{error}</Banner> : null}
      <ContentCard title="Recent">
        {!activity.length ? (
          <ListRow title="No activity yet" subtitle="Fund and allotment updates appear here" />
        ) : (
          activity.map((item) => (
            <View key={item.id} style={styles.compactRow}>
              <View style={styles.compactRowMain}>
                <ListRow
                  title={item.title}
                  subtitle={[
                    formatDateTime(item.at),
                    item.amount != null ? formatCurrency(item.amount) : null,
                  ].filter(Boolean).join(' · ')}
                  right={
                    <Tag label={item.type.replace(/_/g, ' ')} color={TYPE_COLORS[item.type] || '#64748b'} />
                  }
                  onPress={() => openItemMore(item)}
                />
              </View>
              <Pressable hitSlop={12} onPress={() => openItemMore(item)} style={styles.moreBtn}>
                <Text style={styles.moreText}>···</Text>
              </Pressable>
            </View>
          ))
        )}
      </ContentCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  compactRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  compactRowMain: { flex: 1 },
  moreBtn: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 20, fontWeight: '700', color: colors.textMuted, letterSpacing: 1 },
});
