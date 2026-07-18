import { useCallback, useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { formatCurrency, formatDateTime, formatPan } from '../utils/format';
import { useMemberDashboard } from '../hooks/useMemberDashboard';
import { useMemberActivity, useMemberAttention, useUpcomingIpos } from '../hooks/useMemberPortalExtras';
import { useAuth } from '../context/AuthContext';
import {
  ALLOTMENT_COLORS,
  buildAttentionFromDashboard,
  formatAllotmentLabel,
  formatIpoShareLine,
  groupApplicationsByIpo,
  hasPendingAllotment,
  isStaleGroupLeaderApi,
  summarizeIpoGroupRows,
} from '../utils/memberPortal';
import type { GroupApplication } from '../hooks/useMemberDashboard';
import { copyToClipboard, getAllotmentPortals, openAllotmentPortal } from '../utils/allotmentCheck';
import { openActionSheet } from '../utils/actionSheet';
import { colors, spacing } from '../theme';
import { ui } from '../styles/ui';

function ledgerTypeLabel(type: string): string {
  if (type === 'GIVEN') return 'IPO fund from manager';
  if (type === 'RECEIVED') return 'Returned to manager';
  return type;
}

export default function MemberPortalScreen() {
  const { user } = useAuth();
  const { data: dashboard, loading, error, staleWarning, refresh } = useMemberDashboard();
  const attentionQuery = useMemberAttention();
  const activityQuery = useMemberActivity(5);
  const upcomingQuery = useUpcomingIpos();

  const attentionItems = useMemo(() => {
    if (dashboard?.attention?.length) return dashboard.attention;
    if (attentionQuery.data?.length) return attentionQuery.data;
    return buildAttentionFromDashboard(dashboard);
  }, [attentionQuery.data, dashboard]);

  const activityPreview = useMemo(() => {
    if (dashboard?.activity?.length) return dashboard.activity.slice(0, 5);
    return activityQuery.data ?? [];
  }, [activityQuery.data, dashboard?.activity]);

  const upcomingIposList = useMemo(
    () => dashboard?.upcomingIpos ?? upcomingQuery.data ?? [],
    [dashboard?.upcomingIpos, upcomingQuery.data]
  );

  const groupAppsEarly = dashboard?.subGroup?.groupApplications ?? [];

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
  const groupApps = dashboard?.subGroup?.groupApplications ?? [];
  const applications = dashboard?.ipoApplications ?? [];

  const groupIpoGroups = useMemo(
    () => groupApplicationsByIpo(groupApps),
    [groupApps]
  );

  const personalIpoGroups = useMemo(() => {
    const mapped: GroupApplication[] = applications.map((app) => ({
      id: app.id,
      ipoId: app.ipoId ?? 0,
      ipoName: app.ipoName,
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
          title="Member portal"
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
  const groupStats = subGroup?.groupStats ?? {};
  const bulkPayments = subGroup?.bulkPayments ?? [];
  const stats = dashboard.stats ?? {};
  const applicationsList = applications;
  const pendingReturn = Number(stats.pendingReturn ?? 0);
  const showAllotmentAlert = hasPendingAllotment(dashboard);
  const totalGroupPendingReturn = groupMembers.reduce(
    (sum, m) => sum + Number(m.pendingReturn ?? 0),
    0
  );
  const groupGrossPnL = Number(groupStats.grossIpoPnL ?? 0);
  const groupMemberShare = Number(groupStats.totalMemberShare ?? 0);
  const staleGroupApi = staleWarning || isStaleGroupLeaderApi(subGroup);
  const memberProfit = Number(stats.totalMemberShare ?? 0);
  const grossIpoPnL = Number(stats.grossIpoPnL ?? 0);
  const ledgerEntries = dashboard.ledgerEntries ?? [];

  const copyPan = async (pan: string, label = 'PAN') => {
    const ok = await copyToClipboard(formatPan(pan));
    Alert.alert(ok ? 'Copied' : 'Error', ok ? `${label} copied` : 'Could not copy');
  };

  const openProfileMore = () => {
    if (!member) return;
    openActionSheet(
      member.displayName || 'Profile',
      [{ text: 'Copy PAN', onPress: () => copyPan(memberPan) }],
      [
        memberPan ? `PAN ${memberPan}` : null,
        subGroup?.name ? `Sub-group: ${subGroup.name}` : 'No sub-group',
        isGroupLeader ? 'Sub-group leader' : subGroup ? 'Member' : null,
        member.email ? `Email: ${member.email}` : null,
        member.upi ? `UPI: ${member.upi}` : null,
        subGroup?.leaderDisplayName && !isGroupLeader ? `Leader: ${subGroup.leaderDisplayName}` : null,
      ].filter(Boolean).join('\n')
    );
  };

  const openAllotmentMore = () => {
    const portals = getAllotmentPortals();
    openActionSheet('Allotment portals', [
      { text: 'Copy my PAN', onPress: () => copyPan(memberPan) },
      ...portals.map((p) => ({
        text: `Open ${p.name}`,
        onPress: () => openAllotmentPortal(p.url),
      })),
    ], 'Open an official portal and enter your PAN after allotment day.');
  };

  const openHeaderMore = () => {
    openActionSheet('Member portal', [
      { text: 'Refresh', onPress: refresh },
      { text: 'Full ledger / PDF', onPress: () => router.push('/(member)/statement' as any) },
      ...(member ? [{ text: 'Profile details', onPress: openProfileMore }] : []),
    ]);
  };

  const openGroupMemberMore = (m: any) => {
    openActionSheet(m.displayName, [], [
      formatPan(m.pan),
      `Share ${formatCurrency(m.totalMemberShare ?? 0)}`,
      `Return ${formatCurrency(m.pendingReturn)}`,
      `${m.iposAlloted ?? 0} allotted · ${m.iposPending ?? 0} pending`,
      `${m.iposApplied ?? 0} applied · ${m.iposNotAlloted ?? 0} not allotted`,
      `Gross P&L ${formatCurrency(m.grossIpoPnL ?? 0)}`,
    ].join('\n'));
  };

  const openGroupAppMore = (app: GroupApplication) => {
    openActionSheet(app.memberName, [], [
      formatPan(app.memberPan),
      formatCurrency(app.amount),
      app.investorCategory,
      formatAllotmentLabel(app.allotmentStatus),
      app.fundReturned ? 'Fund returned' : 'Fund pending',
      app.allotmentStatus === 'ALLOTED' && app.grossProfitLoss != null
        ? `Gross P&L ${formatCurrency(app.grossProfitLoss)}`
        : null,
      formatIpoShareLine(app),
    ].filter(Boolean).join('\n'));
  };

  const openPersonalAppMore = (app: GroupApplication) => {
    openActionSheet(app.ipoName, [], [
      formatCurrency(app.amount),
      app.fundReturned ? 'Fund returned' : `Fund pending ${formatCurrency(app.amount)}`,
      formatAllotmentLabel(app.allotmentStatus),
      app.allotmentStatus === 'ALLOTED' && app.grossProfitLoss != null
        ? `Gross P&L ${formatCurrency(app.grossProfitLoss)}`
        : null,
      app.allotmentStatus === 'ALLOTED' && app.memberShare != null
        ? `Your share ${formatCurrency(app.memberShare)}`
        : null,
    ].filter(Boolean).join('\n'));
  };

  return (
    <Screen bottomNavInset>
      <PageHeader
        title={`Hello, ${member?.displayName || user?.displayName || 'Member'}`}
        subtitle={memberPan || 'Your dashboard'}
        extra={
          <Button compact mode="text" onPress={openHeaderMore}>
            More
          </Button>
        }
      />

      {staleGroupApi ? (
        <Banner variant="warn">Group data outdated — tap Refresh.</Banner>
      ) : null}

      {error ? <Banner variant="warn">{error}</Banner> : null}

      {pendingReturn > 0 ? (
        <Banner variant="warn">{`${formatCurrency(pendingReturn)} pending return to manager`}</Banner>
      ) : null}

      <View style={ui.statRow}>
        <PnlStatCard title="Your profit" value={memberProfit} formatted={formatCurrency(memberProfit)} />
        <StatCard
          title="Pending return"
          value={formatCurrency(pendingReturn)}
          variant={pendingReturn > 0 ? 'danger' : 'info'}
        />
        <StatCard title="Applied IPOs" value={stats.iposApplied ?? 0} variant="primary" />
      </View>

      {attentionItems.length > 0 ? (
        <ContentCard title="Needs your attention">
          {attentionItems.map((item) => (
            <AttentionCard
              key={item.id}
              item={item}
              onPress={item.action ? () => handleAttentionPress(item.action, item.ipoName) : undefined}
            />
          ))}
        </ContentCard>
      ) : null}

      {upcomingIposList.length > 0 ? (
        <ContentCard title="Upcoming IPOs">
          {upcomingIposList.slice(0, 4).map((ipo) => (
            <ListRow
              key={ipo.id}
              title={ipo.name}
              subtitle={[
                ipo.applied ? 'Applied' : ipo.status,
                formatCurrency(ipo.appliedAmount ?? ipo.lotAmountRii),
              ].join(' · ')}
              right={<Tag label={ipo.applied ? 'Applied' : ipo.status} color={ipo.status === 'OPEN' ? '#059669' : '#64748b'} />}
              onPress={() => router.push(`/(member)/ipo/${ipo.id}` as any)}
            />
          ))}
        </ContentCard>
      ) : null}

      {activityPreview.length > 0 ? (
        <ContentCard
          title="Recent activity"
          extra={<Button compact onPress={() => router.push('/(member)/activity' as any)}>See all</Button>}
        >
          {activityPreview.slice(0, 3).map((item) => (
            <ListRow
              key={item.id}
              title={item.title}
              subtitle={formatDateTime(item.at)}
              onPress={item.ipoId ? () => router.push(`/(member)/ipo/${item.ipoId}` as any) : undefined}
            />
          ))}
        </ContentCard>
      ) : null}

      {showAllotmentAlert && memberPan ? (
        <ContentCard
          title="Check allotment"
          extra={
            <Button compact mode="text" onPress={openAllotmentMore}>
              More
            </Button>
          }
        >
          <ListRow
            title={`PAN ${memberPan}`}
            subtitle="Copy PAN or open an official portal after allotment day"
          />
          <Button compact mode="contained" onPress={() => copyPan(memberPan)} style={{ alignSelf: 'flex-start' }}>
            Copy my PAN
          </Button>
        </ContentCard>
      ) : null}

      {member ? (
        <ContentCard title="Profile">
          <View style={styles.compactRow}>
            <View style={styles.compactRowMain}>
              <ListRow
                title={member.displayName || '—'}
                subtitle={[
                  memberPan,
                  isGroupLeader ? 'Leader' : subGroup?.name || 'No sub-group',
                ].filter(Boolean).join(' · ')}
                onPress={openProfileMore}
              />
            </View>
            <Pressable hitSlop={12} onPress={openProfileMore} style={styles.moreBtn}>
              <Text style={styles.moreText}>···</Text>
            </Pressable>
          </View>
        </ContentCard>
      ) : null}

      <ContentCard title="Fund flow">
        <View style={ui.statRow}>
          <StatCard title="Received" value={formatCurrency(stats.totalGiven)} variant="warning" />
          <StatCard title="Returned" value={formatCurrency(stats.totalReceived)} variant="success" />
          <StatCard title="Allotted" value={stats.iposAlloted ?? 0} variant="primary" />
        </View>
        {grossIpoPnL !== 0 ? (
          <Text style={ui.hint}>
            Gross P&L {formatCurrency(grossIpoPnL)}
            {(stats.bonus ?? 0) > 0 ? ` · Bonus ${formatCurrency(stats.bonus)}` : ''}
          </Text>
        ) : null}
      </ContentCard>

      {isGroupLeader ? (
        <>
          <ContentCard title={`Group — ${subGroup?.name || ''}`}>
            {totalGroupPendingReturn > 0 ? (
              <Banner variant="warn">{`${formatCurrency(totalGroupPendingReturn)} group pending return`}</Banner>
            ) : (
              <Banner variant="info">You lead this sub-group — bulk funds come to you.</Banner>
            )}
            <View style={ui.statRow}>
              <StatCard title="Group applied" value={groupStats.iposApplied ?? 0} variant="primary" />
              <PnlStatCard title="Group P&L" value={groupGrossPnL} formatted={formatCurrency(groupGrossPnL)} />
              <PnlStatCard title="Member share" value={groupMemberShare} formatted={formatCurrency(groupMemberShare)} />
            </View>
          </ContentCard>

          <ContentCard title={`Members (${subGroup?.memberCount ?? groupMembers.length})`}>
            {groupMembers.length ? (
              groupMembers.map((m) => (
                <View key={m.id} style={styles.compactRow}>
                  <View style={styles.compactRowMain}>
                    <ListRow
                      title={`${m.displayName}${m.isLeader ? ' (You)' : ''}`}
                      subtitle={`Share ${formatCurrency(m.totalMemberShare ?? 0)} · Return ${formatCurrency(m.pendingReturn)}`}
                      onPress={() => openGroupMemberMore(m)}
                      right={
                        <Tag
                          label={m.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                          color={m.status === 'ACTIVE' ? '#059669' : '#64748b'}
                        />
                      }
                    />
                  </View>
                  <Pressable hitSlop={12} onPress={() => openGroupMemberMore(m)} style={styles.moreBtn}>
                    <Text style={styles.moreText}>···</Text>
                  </Pressable>
                </View>
              ))
            ) : (
              <ListRow title="No members in this sub-group" />
            )}

            {bulkPayments.length > 0 ? (
              <>
                <Text style={[ui.sectionLabel, { marginTop: spacing.sm }]}>Bulk payments</Text>
                {bulkPayments.slice(0, 5).map((bp) => (
                  <ListRow
                    key={bp.id}
                    title={bp.ipoName}
                    subtitle={`${formatCurrency(bp.totalAmount)} · ${bp.memberCount} members`}
                  />
                ))}
              </>
            ) : null}
          </ContentCard>

          <ContentCard title={`Group IPOs (${groupApps.length})`}>
            {groupIpoGroups.length ? (
              groupIpoGroups.map(({ ipoName, rows }) => (
                <View key={ipoName} style={{ marginBottom: spacing.sm }}>
                  <ListRow
                    title={ipoName}
                    subtitle={summarizeIpoGroupRows(rows)}
                    onPress={() => {
                      const id = rows[0]?.ipoId;
                      if (id) router.push(`/(member)/ipo/${id}` as any);
                    }}
                  />
                  {rows.map((app) => (
                    <View key={app.id} style={styles.compactRow}>
                      <View style={styles.compactRowMain}>
                        <ListRow
                          title={app.memberName}
                          subtitle={`${formatCurrency(app.amount)} · ${formatAllotmentLabel(app.allotmentStatus)}`}
                          onPress={() => openGroupAppMore(app)}
                          right={
                            <Tag
                              label={formatAllotmentLabel(app.allotmentStatus)}
                              color={ALLOTMENT_COLORS[app.allotmentStatus] || '#64748b'}
                            />
                          }
                        />
                      </View>
                      <Pressable hitSlop={12} onPress={() => openGroupAppMore(app)} style={styles.moreBtn}>
                        <Text style={styles.moreText}>···</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ))
            ) : (
              <ListRow title="No group IPO applications yet" />
            )}
          </ContentCard>
        </>
      ) : null}

      <ContentCard title={`Your IPOs (${applicationsList.length})`}>
        {personalIpoGroups.length ? (
          personalIpoGroups.map(({ ipoName, rows }) => (
            <View key={ipoName} style={{ marginBottom: spacing.sm }}>
              <ListRow
                title={ipoName}
                subtitle={summarizeIpoGroupRows(rows)}
                onPress={() => {
                  const ipo = upcomingIposList.find((i) => i.name === ipoName);
                  if (ipo) router.push(`/(member)/ipo/${ipo.id}` as any);
                }}
              />
              {rows.map((app) => (
                <View key={app.id} style={styles.compactRow}>
                  <View style={styles.compactRowMain}>
                    <ListRow
                      title={formatAllotmentLabel(app.allotmentStatus)}
                      subtitle={[
                        formatCurrency(app.amount),
                        app.allotmentStatus === 'ALLOTED' && app.memberShare != null
                          ? `Share ${formatCurrency(app.memberShare)}`
                          : null,
                      ].filter(Boolean).join(' · ')}
                      onPress={() => openPersonalAppMore(app)}
                      right={
                        <Tag
                          label={formatAllotmentLabel(app.allotmentStatus)}
                          color={ALLOTMENT_COLORS[app.allotmentStatus] || '#64748b'}
                        />
                      }
                    />
                  </View>
                  <Pressable hitSlop={12} onPress={() => openPersonalAppMore(app)} style={styles.moreBtn}>
                    <Text style={styles.moreText}>···</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ))
        ) : (
          <ListRow title="No applications yet" subtitle="Your manager will add IPO applications here" />
        )}
      </ContentCard>

      {ledgerEntries.length > 0 ? (
        <ContentCard title="Transactions">
          {ledgerEntries.slice(0, 8).map((entry) => (
            <ListRow
              key={entry.id}
              title={ledgerTypeLabel(entry.type)}
              subtitle={`${formatCurrency(entry.amount)} · ${formatDateTime(entry.txnDate)}`}
              right={
                <Tag
                  label={entry.type}
                  color={entry.type === 'GIVEN' ? '#d97706' : entry.type === 'RECEIVED' ? '#059669' : '#64748b'}
                />
              }
            />
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
