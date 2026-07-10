import { Alert, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard, { PnlStatCard } from '../components/StatCard';
import StatGrid from '../components/StatGrid';
import Loading from '../components/Loading';
import ListRow from '../components/ListRow';
import Tag from '../components/Tag';
import Banner from '../components/Banner';
import { formatCurrency, formatDateTime, formatPan } from '../utils/format';
import { useMemberDashboard } from '../hooks/useMemberDashboard';
import { useAuth } from '../context/AuthContext';
import {
  ALLOTMENT_COLORS,
  formatAllotmentLabel,
  formatIpoShareLine,
  hasPendingAllotment,
  isStaleGroupLeaderApi,
} from '../utils/memberPortal';
import { copyToClipboard, getAllotmentPortals, openAllotmentPortal } from '../utils/allotmentCheck';
import { config } from '../config';
import { ui } from '../styles/ui';

function ledgerTypeLabel(type: string): string {
  if (type === 'GIVEN') return 'IPO fund from manager';
  if (type === 'RECEIVED') return 'Returned to manager';
  return type;
}

export default function MemberPortalScreen() {
  const { user } = useAuth();
  const { data: dashboard, loading, error, refresh } = useMemberDashboard();

  if (loading && !dashboard) return <Loading />;

  if (!dashboard) {
    return (
      <Screen>
        <PageHeader
          title="Member portal"
          subtitle="Could not load your dashboard"
          extra={<Button compact mode="outlined" onPress={refresh}>Retry</Button>}
        />
        <Banner variant="warn">
          {error || 'No data loaded. Check your internet connection and tap Retry.'}
        </Banner>
        <Text style={ui.hint}>API: {config.apiBaseUrl}</Text>
      </Screen>
    );
  }
  const member = dashboard.member;
  const subGroup = dashboard.subGroup;
  const isGroupLeader = subGroup?.isLeader === true;
  const groupMembers = subGroup?.members ?? [];
  const groupApps = subGroup?.groupApplications ?? [];
  const groupStats = subGroup?.groupStats ?? {};
  const bulkPayments = subGroup?.bulkPayments ?? [];
  const stats = dashboard.stats ?? {};
  const applications = dashboard.ipoApplications ?? [];
  const ledgerEntries = dashboard.ledgerEntries ?? [];
  const memberProfit = Number(stats.totalMemberShare ?? 0);
  const grossIpoPnL = Number(stats.grossIpoPnL ?? 0);
  const pendingReturn = Number(stats.pendingReturn ?? 0);
  const memberPan = formatPan(member?.pan || user?.pan);
  const showAllotmentAlert = hasPendingAllotment(dashboard);
  const totalGroupPendingReturn = groupMembers.reduce(
    (sum, m) => sum + Number(m.pendingReturn ?? 0),
    0
  );
  const groupGrossPnL = Number(groupStats.grossIpoPnL ?? 0);
  const groupMemberShare = Number(groupStats.totalMemberShare ?? 0);
  const staleGroupApi = isStaleGroupLeaderApi(subGroup);

  const copyPan = async (pan: string, label = 'PAN') => {
    const ok = await copyToClipboard(formatPan(pan));
    Alert.alert(ok ? 'Copied' : 'Error', ok ? `${label} copied` : 'Could not copy');
  };

  return (
    <Screen>
      <PageHeader
        title={`Hello, ${member?.displayName || user?.displayName || 'Member'}`}
        subtitle="Your fund flow, IPO applications, and profit summary"
        extra={<Button compact mode="outlined" onPress={refresh}>Refresh</Button>}
      />

      {staleGroupApi ? (
        <Banner variant="warn">
          Group member data is outdated. Tap Refresh below, or log out and sign in again. If it persists, close Expo Go fully and run: npx expo start -c
        </Banner>
      ) : null}

      {error ? (
        <Banner variant="warn">{error}</Banner>
      ) : null}

      {isGroupLeader ? (
        <Text style={[ui.hint, { marginBottom: 8 }]}>
          API: {config.apiBaseUrl}
          {groupStats.iposApplied != null ? ` · Group applied: ${groupStats.iposApplied}` : ''}
        </Text>
      ) : null}

      {pendingReturn > 0 ? (
        <Banner variant="warn">
          {`${formatCurrency(pendingReturn)} pending to return to your manager. This is fund received minus what you have returned so far.`}
        </Banner>
      ) : null}

      {showAllotmentAlert && memberPan ? (
        <ContentCard title="Check allotment">
          <Text style={ui.hint}>
            After allotment day, open an official portal, select the IPO, and enter each member PAN. Results are not fetched automatically.
          </Text>
          <View style={ui.infoLine}>
            <Text style={ui.infoLabel}>Your PAN</Text>
            <Text style={ui.infoValue}>{memberPan}</Text>
          </View>
          <Button compact mode="outlined" onPress={() => copyPan(memberPan)} style={{ marginBottom: 8 }}>
            Copy my PAN
          </Button>
          {getAllotmentPortals().map((p) => (
            <Button
              key={p.id}
              mode="outlined"
              onPress={() => openAllotmentPortal(p.url)}
              style={{ marginTop: 6 }}
            >
              Open {p.name}
            </Button>
          ))}
        </ContentCard>
      ) : null}

      {member ? (
        <ContentCard title="Your profile">
          <View style={ui.infoLine}>
            <Text style={ui.infoLabel}>Name</Text>
            <Text style={ui.infoValue}>{member.displayName || '—'}</Text>
          </View>
          <View style={ui.infoLine}>
            <Text style={ui.infoLabel}>PAN</Text>
            <Text style={ui.infoValue}>{memberPan || '—'}</Text>
          </View>
          <View style={ui.infoLine}>
            <Text style={ui.infoLabel}>Sub-group</Text>
            <Text style={ui.infoValue}>{subGroup?.name || 'Not assigned'}</Text>
          </View>
          <View style={ui.infoLine}>
            <Text style={ui.infoLabel}>Role</Text>
            <Text style={ui.infoValue}>
              {isGroupLeader ? 'Sub-group leader' : subGroup ? 'Member' : '—'}
            </Text>
          </View>
          {subGroup && !isGroupLeader && subGroup.leaderDisplayName ? (
            <View style={ui.infoLine}>
              <Text style={ui.infoLabel}>Group leader</Text>
              <Text style={ui.infoValue}>
                {subGroup.leaderDisplayName}
                {subGroup.leaderPan ? ` · ${formatPan(subGroup.leaderPan)}` : ''}
              </Text>
            </View>
          ) : null}
          {member.email ? (
            <View style={ui.infoLine}>
              <Text style={ui.infoLabel}>Email</Text>
              <Text style={ui.infoValue}>{member.email}</Text>
            </View>
          ) : null}
          {member.upi ? (
            <View style={ui.infoLine}>
              <Text style={ui.infoLabel}>UPI</Text>
              <Text style={ui.infoValue}>{member.upi}</Text>
            </View>
          ) : null}
        </ContentCard>
      ) : null}

      <ContentCard title="Fund summary">
        <StatGrid>
          <StatCard title="Fund received" value={formatCurrency(stats.totalGiven)} variant="warning" />
          <StatCard title="Fund returned" value={formatCurrency(stats.totalReceived)} variant="success" />
          <StatCard title="Pending return" value={formatCurrency(pendingReturn)} variant={pendingReturn > 0 ? 'danger' : 'info'} />
          <PnlStatCard title="Your profit share" value={memberProfit} formatted={formatCurrency(memberProfit)} />
          {(stats.bonus ?? 0) > 0 ? (
            <StatCard title="Bonus" value={formatCurrency(stats.bonus)} variant="success" />
          ) : null}
        </StatGrid>
        {grossIpoPnL !== 0 && Math.abs(grossIpoPnL - memberProfit) > 0.01 ? (
          <Text style={ui.hint}>
            Total IPO profit before your team split: {formatCurrency(grossIpoPnL)}. Your share follows rules set by your manager.
          </Text>
        ) : null}
      </ContentCard>

      <ContentCard title={isGroupLeader ? 'Your IPO activity' : 'IPO activity'}>
        <StatGrid>
          <StatCard title="Applied" value={stats.iposApplied ?? 0} variant="primary" />
          <StatCard title="Pending" value={stats.iposPending ?? 0} variant="warning" />
          <StatCard title="Allotted" value={stats.iposAlloted ?? 0} variant="success" />
          <StatCard title="Not allotted" value={stats.iposNotAlloted ?? 0} variant="danger" />
        </StatGrid>
      </ContentCard>

      {isGroupLeader ? (
        <>
          <ContentCard title={`Group IPO activity — ${subGroup?.name || ''}`}>
            <StatGrid>
              <StatCard title="Applied" value={groupStats.iposApplied ?? 0} variant="primary" />
              <StatCard title="Pending" value={groupStats.iposPending ?? 0} variant="warning" />
              <StatCard title="Allotted" value={groupStats.iposAlloted ?? 0} variant="success" />
              <StatCard title="Not allotted" value={groupStats.iposNotAlloted ?? 0} variant="danger" />
            </StatGrid>
          </ContentCard>

          <ContentCard title={`Group profit & loss — ${subGroup?.name || ''}`}>
            <StatGrid>
              <PnlStatCard
                title="Gross IPO P&L"
                value={groupGrossPnL}
                formatted={formatCurrency(groupGrossPnL)}
              />
              <PnlStatCard
                title="Total member share"
                value={groupMemberShare}
                formatted={formatCurrency(groupMemberShare)}
              />
            </StatGrid>
            <Text style={ui.hint}>
              Gross P&L is before profit-sharing rules. Member share is each person's split after rules set by your manager.
            </Text>
          </ContentCard>

          <ContentCard title="Member profit & loss">
            {groupMembers.length ? (
              groupMembers.map((m) => (
                <ListRow
                  key={`pnl-${m.id}`}
                  title={`${m.displayName}${m.isLeader ? ' (You)' : ''}`}
                  subtitle={[
                    formatPan(m.pan),
                    `Gross P&L ${formatCurrency(m.grossIpoPnL ?? 0)}`,
                    `Member share ${formatCurrency(m.totalMemberShare ?? 0)}`,
                    `${m.iposAlloted ?? 0} allotted · ${m.iposPending ?? 0} pending`,
                  ].join(' · ')}
                  right={
                    <Tag
                      label={m.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                      color={m.status === 'ACTIVE' ? '#059669' : '#64748b'}
                    />
                  }
                />
              ))
            ) : (
              <ListRow title="No members in this sub-group" />
            )}
          </ContentCard>

          <ContentCard title={`Your sub-group — ${subGroup?.name || ''}`}>
            <Banner variant="info">
              You are the sub-group leader. Bulk IPO funds are paid to you on behalf of your group. Collect from members and return to your manager.
            </Banner>

            {totalGroupPendingReturn > 0 ? (
              <Banner variant="warn" style={{ marginTop: 8 }}>
                {`${formatCurrency(totalGroupPendingReturn)} total pending to refund to manager across all members.`}
              </Banner>
            ) : null}

            <Text style={[ui.sectionLabel, { marginTop: 12 }]}>
              Members ({subGroup?.memberCount ?? groupMembers.length})
            </Text>
            {groupMembers.length ? (
              groupMembers.map((m) => (
                <ListRow
                  key={m.id}
                  title={`${m.displayName}${m.isLeader ? ' (You)' : ''}`}
                  subtitle={[
                    formatPan(m.pan),
                    `Applied ${m.iposApplied}`,
                    `Pending ${m.iposPending ?? 0}`,
                    `Allotted ${m.iposAlloted ?? 0}`,
                    `Not allotted ${m.iposNotAlloted ?? 0}`,
                    `Gross P&L ${formatCurrency(m.grossIpoPnL ?? 0)}`,
                    `Share ${formatCurrency(m.totalMemberShare ?? 0)}`,
                    `Return ${formatCurrency(m.pendingReturn)}`,
                  ].join(' · ')}
                  right={
                    <Tag
                      label={m.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                      color={m.status === 'ACTIVE' ? '#059669' : '#64748b'}
                    />
                  }
                />
              ))
            ) : (
              <ListRow title="No members in this sub-group" />
            )}

            <Text style={[ui.sectionLabel, { marginTop: 16 }]}>Bulk payments received</Text>
            <Text style={ui.hint}>One transfer per IPO when your manager uses bulk pay on Distribute.</Text>
            {bulkPayments.length ? (
              bulkPayments.map((bp) => (
                <ListRow
                  key={bp.id}
                  title={bp.ipoName}
                  subtitle={[
                    formatDateTime(bp.paidAt),
                    formatCurrency(bp.totalAmount),
                    `${bp.memberCount} members`,
                    bp.investorCategory,
                  ].filter(Boolean).join(' · ')}
                />
              ))
            ) : (
              <ListRow title="No bulk payments yet" />
            )}
          </ContentCard>

          <ContentCard title={`Group IPO & allotment (${groupApps.length})`}>
            <Text style={ui.hint}>
              Allotment and P&L for every member in your sub-group. Use the Allotment tab to copy PANs and open official portals.
            </Text>
            {groupApps.length ? (
              groupApps.map((app) => (
                <ListRow
                  key={app.id}
                  title={`${app.memberName} — ${app.ipoName}`}
                  subtitle={[
                    formatPan(app.memberPan),
                    formatCurrency(app.amount),
                    app.investorCategory,
                    formatAllotmentLabel(app.allotmentStatus),
                    app.fundReturned ? 'Fund returned' : 'Fund pending',
                    app.allotmentStatus === 'ALLOTED' && app.grossProfitLoss != null
                      ? `Gross P&L ${formatCurrency(app.grossProfitLoss)}`
                      : null,
                    formatIpoShareLine(app),
                  ].filter(Boolean).join(' · ')}
                  right={
                    <Tag
                      label={formatAllotmentLabel(app.allotmentStatus)}
                      color={ALLOTMENT_COLORS[app.allotmentStatus] || '#64748b'}
                    />
                  }
                />
              ))
            ) : (
              <ListRow title="No group IPO applications yet" />
            )}
          </ContentCard>
        </>
      ) : null}

      <ContentCard title={`Your IPO applications (${applications.length})`}>
        {applications.length ? (
          applications.map((app) => (
            <ListRow
              key={app.id}
              title={app.ipoName}
              subtitle={[
                formatCurrency(app.amount),
                app.fundReturned ? 'Fund returned' : `Fund pending ${formatCurrency(app.amount)}`,
                formatAllotmentLabel(app.allotmentStatus),
                app.allotmentStatus === 'ALLOTED' && app.grossProfitLoss != null
                  ? `Gross P&L ${formatCurrency(app.grossProfitLoss)}`
                  : null,
                app.allotmentStatus === 'ALLOTED' && app.memberShare != null
                  ? `Your share ${formatCurrency(app.memberShare)}`
                  : app.allotmentStatus === 'ALLOTED' && app.grossProfitLoss != null
                    ? 'Share pending split'
                    : null,
              ].filter(Boolean).join(' · ')}
              right={
                <Tag
                  label={formatAllotmentLabel(app.allotmentStatus)}
                  color={ALLOTMENT_COLORS[app.allotmentStatus] || '#64748b'}
                />
              }
            />
          ))
        ) : (
          <ListRow title="No applications yet" subtitle="Your manager will add IPO applications here" />
        )}
      </ContentCard>

      {ledgerEntries.length > 0 ? (
        <ContentCard title="Your transactions">
          <Text style={ui.hint}>
            {isGroupLeader
              ? 'Your personal fund ledger — not collections from sub-group members. Combined bulk UPI for the group is listed above.'
              : 'Fund the manager sent you for IPOs and what you have returned.'}
          </Text>
          {ledgerEntries.map((entry) => (
            <ListRow
              key={entry.id}
              title={ledgerTypeLabel(entry.type)}
              subtitle={[
                formatDateTime(entry.txnDate),
                formatCurrency(entry.amount),
                entry.ipoName,
                entry.notes,
              ].filter(Boolean).join(' · ')}
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
