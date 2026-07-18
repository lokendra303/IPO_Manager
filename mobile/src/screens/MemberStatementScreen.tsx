import { useCallback, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
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
import { formatCurrency } from '../utils/format';
import { useQuery } from '../hooks/useQuery';
import { useAuth } from '../context/AuthContext';
import { statementToText } from '../utils/share';
import { shareMemberFullLedgerPdf, type GroupPdfPayload } from '../utils/memberLedgerPdf';
import { getErrorMessage } from '../utils/errors';
import { openActionSheet } from '../utils/actionSheet';
import { colors } from '../theme';
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

  const openIpoMore = (app: any) => {
    openActionSheet(app.ipoName, [], [
      formatCurrency(app.amount),
      app.allotmentStatus?.replace(/_/g, ' '),
      app.fundReturned ? 'Fund returned' : 'Fund pending',
      app.grossProfitLoss != null ? `Gross ${formatCurrency(app.grossProfitLoss)}` : null,
      app.memberShare != null ? `You ${formatCurrency(app.memberShare)}` : null,
      app.managerShare != null ? `Manager ${formatCurrency(app.managerShare)}` : null,
      app.providerShare != null ? `Provider ${formatCurrency(app.providerShare)}` : null,
    ].filter(Boolean).join('\n'));
  };

  const openHeaderMore = () => {
    openActionSheet('Full ledger', [
      { text: 'Refresh', onPress: refresh },
      { text: 'Share as text', onPress: shareText },
    ]);
  };

  return (
    <Screen bottomNavInset>
      <PageHeader
        title="Full ledger"
        subtitle={`${apps.length} IPOs · ${formatCurrency(summary.totalMemberShare ?? 0)} profit`}
        extra={
          <Button compact mode="text" onPress={openHeaderMore}>
            More
          </Button>
        }
      />
      {statement ? (
        <>
          <ContentCard title="Summary">
            <View style={ui.statRow}>
              <StatCard title="Applied" value={summary.iposApplied ?? apps.length} variant="primary" />
              <PnlStatCard title="Gross P&L" value={summary.grossIpoPnL ?? 0} formatted={formatCurrency(summary.grossIpoPnL ?? 0)} />
              <PnlStatCard title="Your profit" value={summary.totalMemberShare ?? 0} formatted={formatCurrency(summary.totalMemberShare ?? 0)} />
            </View>
            <ListRow title="Fund received" subtitle={formatCurrency(summary.totalGiven)} />
            <ListRow title="Fund returned" subtitle={formatCurrency(summary.totalReceived)} />
            <ListRow title="Pending return" subtitle={formatCurrency(summary.pendingReturn)} />
            <Button mode="contained" loading={pdfLoading} disabled={pdfLoading} onPress={downloadPdf} style={{ marginTop: 8 }}>
              {isGroupLeader ? 'Download PDF (you + group)' : 'Download PDF report'}
            </Button>
          </ContentCard>

          <ContentCard title={`All IPOs (${apps.length})`}>
            {apps.map((app: any, idx: number) => (
              <View key={app.id ?? `${app.ipoName}-${idx}`} style={styles.compactRow}>
                <View style={styles.compactRowMain}>
                  <ListRow
                    title={app.ipoName}
                    subtitle={[
                      formatCurrency(app.amount),
                      app.grossProfitLoss != null ? formatCurrency(app.grossProfitLoss) : app.allotmentStatus?.replace(/_/g, ' '),
                    ].filter(Boolean).join(' · ')}
                    onPress={() => openIpoMore(app)}
                    right={<Tag label={app.allotmentStatus?.replace(/_/g, ' ') || '—'} color="#64748b" />}
                  />
                </View>
                <Pressable hitSlop={12} onPress={() => openIpoMore(app)} style={styles.moreBtn}>
                  <Text style={styles.moreText}>···</Text>
                </Pressable>
              </View>
            ))}
          </ContentCard>

          {ledger.length > 0 ? (
            <ContentCard title={`Transactions (${ledger.length})`}>
              {ledger.map((row: any, idx: number) => (
                <ListRow
                  key={`${row.type}-${idx}`}
                  title={row.type === 'GIVEN' ? 'Fund from manager' : row.type === 'RECEIVED' ? 'Returned to manager' : row.type}
                  subtitle={[formatCurrency(row.amount), row.ipoName].filter(Boolean).join(' · ')}
                />
              ))}
            </ContentCard>
          ) : null}

          {isGroupLeader && (dashboard?.subGroup?.groupApplications?.length ?? 0) > 0 ? (
            <ContentCard title={`Sub-group (${dashboard?.subGroup?.name || 'group'})`}>
              <View style={ui.statRow}>
                <StatCard title="Group apps" value={dashboard?.subGroup?.groupStats?.iposApplied ?? 0} variant="primary" />
                <PnlStatCard
                  title="Group profit"
                  value={dashboard?.subGroup?.groupStats?.totalMemberShare ?? 0}
                  formatted={formatCurrency(dashboard?.subGroup?.groupStats?.totalMemberShare ?? 0)}
                />
              </View>
              <Text style={ui.hint}>Included in the PDF download above.</Text>
            </ContentCard>
          ) : null}
        </>
      ) : (
        <Banner variant="warn">Could not load full ledger</Banner>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  compactRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  compactRowMain: { flex: 1 },
  moreBtn: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 20, fontWeight: '700', color: colors.textMuted, letterSpacing: 1 },
});
