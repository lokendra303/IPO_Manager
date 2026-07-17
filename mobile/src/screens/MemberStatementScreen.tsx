import { useCallback } from 'react';
import { Alert, Share, Text } from 'react-native';
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
import { getErrorMessage } from '../utils/errors';
import { ui } from '../styles/ui';

export default function MemberStatementScreen() {
  const { user, isMember } = useAuth();

  const fetcher = useCallback(async () => {
    const { data } = await client.get('/member-portal/statement');
    return data;
  }, []);

  const { data: statement, loading, refresh } = useQuery(fetcher, [], { enabled: isMember && !!user?.id });

  const share = async () => {
    if (!statement) return;
    try {
      await Share.share({ message: statementToText(statement), title: 'IPO Member Full Ledger' });
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not share statement'));
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
            <Button mode="contained" onPress={share} style={{ marginTop: 8 }}>Share full ledger</Button>
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
        </>
      ) : (
        <Banner variant="warn">Could not load full ledger</Banner>
      )}
    </Screen>
  );
}
