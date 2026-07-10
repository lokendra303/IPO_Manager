import { useCallback } from 'react';
import { Alert, Share } from 'react-native';
import { Button } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import Loading from '../components/Loading';
import ListRow from '../components/ListRow';
import Tag from '../components/Tag';
import Banner from '../components/Banner';
import { formatCurrency } from '../utils/format';
import { useQuery } from '../hooks/useQuery';
import { useAuth } from '../context/AuthContext';
import { statementToText } from '../utils/share';
import { getErrorMessage } from '../utils/errors';

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
      await Share.share({ message: statementToText(statement), title: 'IPO Member Statement' });
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not share statement'));
    }
  };

  if (loading && !statement) return <Loading />;

  const summary = statement?.summary ?? {};

  return (
    <Screen>
      <PageHeader
        title="Statement"
        subtitle="Your fund and IPO summary"
        extra={<Button compact mode="outlined" onPress={refresh}>Refresh</Button>}
      />
      {statement ? (
        <>
          <ContentCard title="Summary">
            <ListRow title="Fund received" subtitle={formatCurrency(summary.totalGiven)} />
            <ListRow title="Fund returned" subtitle={formatCurrency(summary.totalReceived)} />
            <ListRow title="Pending return" subtitle={formatCurrency(summary.pendingReturn)} />
            <ListRow title="Gross IPO P&L" subtitle={formatCurrency(summary.grossIpoPnL)} />
            <ListRow title="Your profit share" subtitle={formatCurrency(summary.totalMemberShare)} />
            <Button mode="contained" onPress={share} style={{ marginTop: 8 }}>Share statement</Button>
          </ContentCard>
          <ContentCard title={`IPO applications (${statement.ipoApplications?.length ?? 0})`}>
            {(statement.ipoApplications ?? []).map((app: any, idx: number) => (
              <ListRow
                key={`${app.ipoName}-${idx}`}
                title={app.ipoName}
                subtitle={[
                  formatCurrency(app.amount),
                  app.allotmentStatus,
                  app.grossProfitLoss != null ? `P&L ${formatCurrency(app.grossProfitLoss)}` : null,
                  app.memberShare != null ? `Share ${formatCurrency(app.memberShare)}` : null,
                ].filter(Boolean).join(' · ')}
                right={<Tag label={app.allotmentStatus} color="#64748b" />}
              />
            ))}
          </ContentCard>
        </>
      ) : (
        <Banner variant="warn">Could not load statement</Banner>
      )}
    </Screen>
  );
}
