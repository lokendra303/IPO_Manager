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
import { useMemberActivity } from '../hooks/useMemberPortalExtras';
import { useMemberDashboard } from '../hooks/useMemberDashboard';

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

  if (loading && !activity.length) return <Loading />;

  return (
    <Screen bottomNavInset>
      <PageHeader
        title="Activity"
        subtitle="Fund, allotment, profit, and issue updates"
        extra={<Button compact mode="outlined" onPress={refresh}>Refresh</Button>}
      />
      {error ? <Banner variant="warn">{error}</Banner> : null}
      <ContentCard title={`Recent activity (${activity.length})`}>
        {!activity.length ? (
          <ListRow title="No activity yet" subtitle="Updates appear when your manager records fund or allotment changes" />
        ) : (
          activity.map((item) => (
            <ListRow
              key={item.id}
              title={item.title}
              subtitle={[
                formatDateTime(item.at),
                item.detail,
                item.amount != null ? formatCurrency(item.amount) : null,
                item.memberName,
              ].filter(Boolean).join(' · ')}
              right={
                <Tag label={item.type.replace(/_/g, ' ')} color={TYPE_COLORS[item.type] || '#64748b'} />
              }
              onPress={
                item.ipoId
                  ? () => router.push(`/(member)/ipo/${item.ipoId}` as any)
                  : undefined
              }
            />
          ))
        )}
      </ContentCard>
    </Screen>
  );
}
