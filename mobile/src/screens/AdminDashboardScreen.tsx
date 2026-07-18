import { useCallback } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button } from 'react-native-paper';
import adminClient from '../api/adminClient';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard from '../components/StatCard';
import Loading from '../components/Loading';
import Banner from '../components/Banner';
import { openActionSheet } from '../utils/actionSheet';
import { useQuery } from '../hooks/useQuery';
import { ui } from '../styles/ui';

export default function AdminDashboardScreen() {
  const fetcher = useCallback(async () => {
    const { data } = await adminClient.get('/admin/dashboard');
    return data;
  }, []);

  const { data: stats, loading, refresh } = useQuery(fetcher);

  const openHeaderMore = () => {
    const t = stats?.tenants || {};
    openActionSheet('Admin dashboard', [
      { text: 'Refresh', onPress: refresh },
      { text: 'View registrations', onPress: () => router.push('/(admin)/registrations') },
    ], [
      `Rejected: ${t.rejectedCount ?? 0}`,
      `Disabled: ${t.disabledCount ?? 0}`,
      `Members: ${stats?.totalMembers ?? 0}`,
    ].join('\n'));
  };

  if (loading && !stats) return <Loading />;

  const t = stats?.tenants || {};
  const pendingCount = Number(t.pendingCount ?? 0);

  return (
    <Screen>
      <PageHeader
        title="Admin"
        subtitle="Manager teams overview"
        extra={
          <Button compact mode="text" onPress={openHeaderMore}>
            More
          </Button>
        }
      />

      {pendingCount > 0 && (
        <Banner variant="warn">
          {`${pendingCount} registration${pendingCount === 1 ? '' : 's'} awaiting approval`}
        </Banner>
      )}

      <ContentCard title="Overview">
        <View style={ui.statRow}>
          <StatCard title="Pending" value={t.pendingCount ?? 0} variant="warning" />
          <StatCard title="Approved" value={t.approvedCount ?? 0} variant="success" />
          <StatCard title="Managers" value={stats?.totalManagers ?? 0} variant="info" />
        </View>
      </ContentCard>

      <ContentCard title="Actions">
        <Button mode="contained" onPress={() => router.push('/(admin)/registrations')}>
          {pendingCount > 0 ? 'Review registrations' : 'Manager accounts'}
        </Button>
      </ContentCard>
    </Screen>
  );
}
