import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import { router } from 'expo-router';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard, { PnlStatCard } from '../components/StatCard';
import Loading from '../components/Loading';
import ListRow from '../components/ListRow';
import Tag from '../components/Tag';
import Banner from '../components/Banner';
import AttentionCard from '../components/AttentionCard';
import { formatCurrency, formatPan } from '../utils/format';
import { useMemberDashboard } from '../hooks/useMemberDashboard';
import { useMemberAttention } from '../hooks/useMemberPortalExtras';
import { useAuth } from '../context/AuthContext';
import {
  ALLOTMENT_COLORS,
  buildAttentionFromDashboard,
  formatAllotmentLabel,
  groupApplicationsByIpo,
  summarizeIpoGroupRows,
} from '../utils/memberPortal';
import type { GroupApplication } from '../hooks/useMemberDashboard';
import { openActionSheet } from '../utils/actionSheet';
import { colors, spacing } from '../theme';
import { ui } from '../styles/ui';

export default function MemberPortalScreen() {
  const { user } = useAuth();
  const { data: dashboard, loading, error, staleWarning, refresh } = useMemberDashboard();
  const attentionQuery = useMemberAttention();

  const attentionItems = useMemo(() => {
    if (dashboard?.attention?.length) return dashboard.attention;
    if (attentionQuery.data?.length) return attentionQuery.data;
    return buildAttentionFromDashboard(dashboard);
  }, [attentionQuery.data, dashboard]);

  const groupAppsEarly = dashboard?.subGroup?.groupApplications ?? [];
  const upcomingIposList = dashboard?.upcomingIpos ?? [];

  const handleAttentionPress = useCallback(
    (action?: string, ipoName?: string) => {
      if (action === 'fund-return') router.push('/(member)/fund-return' as any);
      else if (action === 'allotment') router.push('/(member)/allotment' as any);
      else if (action === 'issues') router.push('/(member)/issues' as any);
      else if (action === 'collections') router.push('/(member)/collections' as any);
      else if (action === 'upcoming') router.push('/(member)/more' as any);
      else if (action === 'ipo' && ipoName) {
        const ipo = upcomingIposList.find((i) => i.name === ipoName);
        const app = groupAppsEarly.find((a) => a.ipoName === ipoName);
        const id = ipo?.id ?? app?.ipoId;
        if (id) router.push(`/(member)/ipo/${id}` as any);
      }
    },
    [groupAppsEarly, upcomingIposList]
  );

  const memberPan = formatPan(dashboard?.member?.pan || user?.pan);
  const applications = dashboard?.ipoApplications ?? [];

  const personalIpoGroups = useMemo(() => {
    const mapped: GroupApplication[] = applications.map((app) => ({
      id: app.id,
      ipoId: app.ipoId ?? 0,
      ipoName: app.ipoName,
      openDate: app.openDate ?? null,
      memberId: 0,
      memberName: dashboard?.member?.displayName || 'You',
      memberPan: memberPan,
      amount: app.amount,
      allotmentStatus: app.allotmentStatus,
      grossProfitLoss: app.grossProfitLoss,
      memberShare: app.memberShare,
      shareStatus: app.shareStatus,
      fundReturned: app.fundReturned,
    }));
    return groupApplicationsByIpo(mapped);
  }, [applications, dashboard?.member?.displayName, memberPan]);

  if (loading && !dashboard) return <Loading />;

  if (!dashboard) {
    return (
      <Screen bottomNavInset>
        <PageHeader
          title="Home"
          subtitle="Load failed"
          extra={<Button compact mode="outlined" onPress={refresh}>Retry</Button>}
        />
        <Banner variant="warn">
          {error || 'No data loaded. Check connection and tap Retry.'}
        </Banner>
      </Screen>
    );
  }

  const member = dashboard.member;
  const subGroup = dashboard.subGroup;
  const isGroupLeader = subGroup?.isLeader === true;
  const groupMembers = subGroup?.members ?? [];
  const stats = dashboard.stats ?? {};
  const pendingReturn = Number(stats.pendingReturn ?? 0);
  const memberProfit = Number(stats.totalMemberShare ?? 0);
  const totalGroupPendingReturn = groupMembers.reduce(
    (sum, m) => sum + Number(m.pendingReturn ?? 0),
    0
  );

  const openHeaderMore = () => {
    openActionSheet('Home', [
      { text: 'Refresh', onPress: refresh },
      { text: 'Allotment check', onPress: () => router.push('/(member)/allotment' as any) },
      { text: 'Full ledger / PDF', onPress: () => router.push('/(member)/statement' as any) },
      { text: 'Profile', onPress: () => router.push('/(member)/profile' as any) },
    ]);
  };

  return (
    <Screen bottomNavInset>
      <PageHeader
        title={`Hello, ${member?.displayName || user?.displayName || 'Member'}`}
        subtitle={subGroup?.name ? `${subGroup.name}${isGroupLeader ? ' · Leader' : ''}` : memberPan || 'Your summary'}
        extra={
          <Button compact mode="text" onPress={openHeaderMore}>
            More
          </Button>
        }
      />

      {staleWarning ? <Banner variant="warn">Data may be outdated — tap More → Refresh.</Banner> : null}
      {error ? <Banner variant="warn">{error}</Banner> : null}
      {pendingReturn > 0 ? (
        <Banner variant="warn">{`${formatCurrency(pendingReturn)} to return to manager`}</Banner>
      ) : null}

      <View style={ui.statRow}>
        <PnlStatCard title="Your profit" value={memberProfit} formatted={formatCurrency(memberProfit)} />
        <StatCard
          title="To return"
          value={formatCurrency(pendingReturn)}
          variant={pendingReturn > 0 ? 'danger' : 'info'}
        />
        <StatCard title="IPOs" value={stats.iposApplied ?? 0} variant="primary" />
      </View>

      {attentionItems.length > 0 ? (
        <ContentCard title="Needs attention">
          {attentionItems.map((item) => (
            <AttentionCard
              key={item.id}
              item={item}
              onPress={item.action ? () => handleAttentionPress(item.action, item.ipoName) : undefined}
            />
          ))}
        </ContentCard>
      ) : null}

      <ContentCard title="Your IPOs">
        {personalIpoGroups.length ? (
          personalIpoGroups.map(({ ipoName, rows }) => {
            const first = rows[0];
            const status = first?.allotmentStatus;
            return (
              <ListRow
                key={ipoName}
                title={ipoName}
                subtitle={summarizeIpoGroupRows(rows)}
                right={
                  status ? (
                    <Tag
                      label={formatAllotmentLabel(status)}
                      color={ALLOTMENT_COLORS[status] || '#64748b'}
                    />
                  ) : undefined
                }
                onPress={() => {
                  const id = first?.ipoId || upcomingIposList.find((i) => i.name === ipoName)?.id;
                  if (id) router.push(`/(member)/ipo/${id}` as any);
                }}
              />
            );
          })
        ) : (
          <ListRow title="No IPOs yet" subtitle="Your manager will add applications here" />
        )}
      </ContentCard>

      {isGroupLeader ? (
        <ContentCard title={`Group · ${subGroup?.name || ''}`}>
          {totalGroupPendingReturn > 0 ? (
            <Banner variant="warn">{`${formatCurrency(totalGroupPendingReturn)} group pending`}</Banner>
          ) : null}
          {groupMembers.map((m) => (
            <ListRow
              key={m.id}
              title={`${m.displayName}${m.isLeader ? ' (You)' : ''}`}
              subtitle={`Profit ${formatCurrency(m.totalMemberShare ?? 0)}`}
              right={
                Number(m.pendingReturn) > 0 ? (
                  <Text style={styles.pending}>{formatCurrency(m.pendingReturn)}</Text>
                ) : (
                  <Tag label="Clear" color={colors.success} />
                )
              }
            />
          ))}
          {groupMembers.length === 0 ? <ListRow title="No members yet" /> : null}
        </ContentCard>
      ) : null}

      <ContentCard title="Quick links">
        <View style={styles.links}>
          <Button mode="outlined" compact onPress={() => router.push('/(member)/allotment' as any)}>
            Allotment
          </Button>
          <Button mode="outlined" compact onPress={() => router.push('/(member)/fund-return' as any)}>
            Fund return
          </Button>
          <Button mode="outlined" compact onPress={() => router.push('/(member)/statement' as any)}>
            Ledger
          </Button>
          <Button mode="outlined" compact onPress={() => router.push('/(member)/activity' as any)}>
            Activity
          </Button>
        </View>
      </ContentCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pending: { color: colors.error, fontWeight: '600', fontSize: 13 },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
