import { useCallback } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { Button } from 'react-native-paper';
import adminClient from '../api/adminClient';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard from '../components/StatCard';
import StatGrid from '../components/StatGrid';
import Loading from '../components/Loading';
import Banner from '../components/Banner';
import { useQuery } from '../hooks/useQuery';

export default function AdminDashboardScreen() {
  const fetcher = useCallback(async () => {
    const { data } = await adminClient.get('/admin/dashboard');
    return data;
  }, []);

  const { data: stats, loading, refresh } = useQuery(fetcher);

  if (loading && !stats) return <Loading />;

  const t = stats?.tenants || {};
  const pendingCount = Number(t.pendingCount ?? 0);

  return (
    <Screen>
      <PageHeader
        title="Admin Dashboard"
        subtitle="Overview of manager teams and registrations"
        extra={<Button compact mode="outlined" onPress={refresh}>Refresh</Button>}
      />

      {pendingCount > 0 && (
        <Banner variant="warn">
          {`${pendingCount} team registration${pendingCount === 1 ? '' : 's'} waiting for approval`}
        </Banner>
      )}

      <ContentCard title="Platform stats">
        <StatGrid>
          <StatCard title="Pending" value={t.pendingCount ?? 0} variant="warning" />
          <StatCard title="Approved" value={t.approvedCount ?? 0} variant="success" />
          <StatCard title="Rejected" value={t.rejectedCount ?? 0} variant="danger" />
          <StatCard title="Disabled" value={t.disabledCount ?? 0} variant="danger" />
          <StatCard title="Managers" value={stats?.totalManagers ?? 0} variant="info" />
          <StatCard title="Members" value={stats?.totalMembers ?? 0} variant="primary" />
        </StatGrid>
      </ContentCard>

      <ContentCard title="Quick actions">
        <Text style={{ marginBottom: 12, lineHeight: 20 }}>
          {pendingCount > 0
            ? `You have ${pendingCount} pending registration request${pendingCount === 1 ? '' : 's'}.`
            : 'No pending requests at the moment.'}
        </Text>
        <Button mode="contained" onPress={() => router.push('/(admin)/registrations')}>
          {pendingCount > 0 ? 'Review registrations' : 'View manager accounts'}
        </Button>
      </ContentCard>
    </Screen>
  );
}
