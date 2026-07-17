import { useCallback, useState } from 'react';
import { Alert, Share, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import Loading from '../components/Loading';
import ListRow from '../components/ListRow';
import Tag from '../components/Tag';
import Banner from '../components/Banner';
import StatCard, { PnlStatCard } from '../components/StatCard';
import StatGrid from '../components/StatGrid';
import { formatCurrency } from '../utils/format';
import { useQuery } from '../hooks/useQuery';
import { useAuth } from '../context/AuthContext';
import { statementToText } from '../utils/share';
import { shareMemberFullLedgerPdf, type GroupPdfPayload } from '../utils/memberLedgerPdf';
import { getErrorMessage } from '../utils/errors';
import { ui } from '../styles/ui';
import type { MemberDashboard } from '../hooks/useMemberDashboard';

export default function MemberStatementScreen() {
  const { user, isMember } = useAuth();
  const [pdfLoading, setPdfLoading] = useState(false);

  const statementFetcher = useCallback(async () => {
    const { data } = await client.get('/member-portal/statement');
    return data;
  }, []);

  const dashboardFetcher = useCallback(async () => {
    const { data } = await client.get<MemberDashboard>('/member-portal/dashboard', { timeout: 90000 });
    return data;
  }, []);

  const { data: statement, loading, refresh } = useQuery(statementFetcher, [], {
    enabled: isMember && !!user?.id,
  });
  const { data: dashboard } = useQuery(dashboardFetcher, [], {
    enabled: isMember && !!user?.id,
  });

  const isGroupLeader = dashboard?.subGroup?.isLeader === true;

  const shareText = async () => {
    if (!statement) return;
    try {
      await Share.share({ message: statementToText(statement), title: 'IPO Member Full Ledger' });
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not share statement'));
    }
  };

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      const { data } = await client.get('/member-portal/statement');
      if (!data.teamName && dashboard?.teamName) {
        data.teamName = dashboard.teamName;
      }

      const sub = dashboard?.subGroup;
      const groupPayload: GroupPdfPayload | null =
        sub?.isLeader
          ? {
              isLeader: true,
              teamName: data.teamName || dashboard?.teamName,
              groupName: sub.name,
              leaderName: dashboard?.member?.displayName || data.member?.displayName,
              groupStats: sub.groupStats || {},
              groupApplications: sub.groupApplications || [],
              members: sub.members || [],
            }
          : null;

      await shareMemberFullLedgerPdf(data, groupPayload);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not generate PDF'));
    } finally {
      setPdfLoading(false);
    }
  };

  if (loading && !statement) return <Loading />;

  const summary = statement?.summary ?? {};
  const apps = statement?.ipoApplications ?? [];
  const ledger = statement?.ledger ?? [];

  return (
    <Screen bottomNavInset>
      <PageHeader
        title="Full ledger"
        subtitle="All IPOs, allotment, and profit split"
        extra={<Button compact mode="outlined" onPress={refresh}>Refresh</Button>}
      />
      {statement ? (
        <>
          <ContentCard title="Summary">
            <StatGrid>
              <StatCard title="Applied" value={summary.iposApplied ?? apps.length} variant="primary" />
              <StatCard title="Allotted" value={summary.iposAlloted ?? 0} variant="success" />
              <PnlStatCard title="Gross IPO P&L" value={summary.grossIpoPnL ?? 0} formatted={formatCurrency(summary.grossIpoPnL ?? 0)} />
              <PnlStatCard title="Your profit" value={summary.totalMemberShare ?? 0} formatted={formatCurrency(summary.totalMemberShare ?? 0)} />
              <PnlStatCard title="Manager profit" value={summary.totalManagerShare ?? 0} formatted={formatCurrency(summary.totalManagerShare ?? 0)} />
              <StatCard title="Provider profit" value={formatCurrency(summary.totalProviderShare ?? 0)} variant="info" />
            </StatGrid>
            <ListRow title="Fund received" subtitle={formatCurrency(summary.totalGiven)} />
            <ListRow title="Fund returned" subtitle={formatCurrency(summary.totalReceived)} />
            <ListRow title="Pending return" subtitle={formatCurrency(summary.pendingReturn)} />
            <Text style={[ui.hint, { marginTop: 8, marginBottom: 4 }]}>
              PDF includes allotment counts, profit by IPO, and your total member profit
              {isGroupLeader ? ', plus the full sub-group ledger for all members.' : '.'}
              {' '}App: IPO Team Manager · Developer: Lokendra.
            </Text>
            <View style={{ gap: 8, marginTop: 8 }}>
              <Button mode="contained" loading={pdfLoading} disabled={pdfLoading} onPress={downloadPdf}>
                {isGroupLeader ? 'Download PDF (you + group)' : 'Download PDF report'}
              </Button>
              <Button mode="outlined" onPress={shareText}>Share as text</Button>
            </View>
          </ContentCard>

          <ContentCard title={`All IPOs (${apps.length})`}>
            <Text style={ui.hint}>Allotted IPOs show gross P&L and your / manager / provider shares.</Text>
            {apps.map((app: any, idx: number) => (
              <ListRow
                key={app.id ?? `${app.ipoName}-${idx}`}
                title={app.ipoName}
                subtitle={[
                  formatCurrency(app.amount),
                  app.allotmentStatus?.replace(/_/g, ' '),
                  app.fundReturned ? 'Fund returned' : 'Fund pending',
                  app.grossProfitLoss != null ? `Gross ${formatCurrency(app.grossProfitLoss)}` : null,
                  app.memberShare != null ? `You ${formatCurrency(app.memberShare)}` : null,
                  app.managerShare != null ? `Manager ${formatCurrency(app.managerShare)}` : null,
                  app.providerShare != null ? `Provider ${formatCurrency(app.providerShare)}` : null,
                ].filter(Boolean).join(' · ')}
                right={<Tag label={app.allotmentStatus?.replace(/_/g, ' ') || '—'} color="#64748b" />}
              />
            ))}
          </ContentCard>

          {ledger.length > 0 ? (
            <ContentCard title={`Fund transactions (${ledger.length})`}>
              {ledger.map((row: any, idx: number) => (
                <ListRow
                  key={`${row.type}-${idx}`}
                  title={row.type === 'GIVEN' ? 'Fund from manager' : row.type === 'RECEIVED' ? 'Returned to manager' : row.type}
                  subtitle={[formatCurrency(row.amount), row.ipoName, row.notes].filter(Boolean).join(' · ')}
                />
              ))}
            </ContentCard>
          ) : null}

          {isGroupLeader && (dashboard?.subGroup?.groupApplications?.length ?? 0) > 0 ? (
            <ContentCard title={`Sub-group ledger (${dashboard?.subGroup?.name || 'group'})`}>
              <Text style={ui.hint}>
                Leader only — full group IPO ledger. Use Download PDF above to include this in the report.
              </Text>
              <StatGrid>
                <StatCard title="Group apps" value={dashboard?.subGroup?.groupStats?.iposApplied ?? 0} variant="primary" />
                <StatCard title="Allotted" value={dashboard?.subGroup?.groupStats?.iposAlloted ?? 0} variant="success" />
                <PnlStatCard
                  title="Group member profit"
                  value={dashboard?.subGroup?.groupStats?.totalMemberShare ?? 0}
                  formatted={formatCurrency(dashboard?.subGroup?.groupStats?.totalMemberShare ?? 0)}
                />
              </StatGrid>
            </ContentCard>
          ) : null}
        </>
      ) : (
        <Banner variant="warn">Could not load full ledger</Banner>
      )}
    </Screen>
  );
}
