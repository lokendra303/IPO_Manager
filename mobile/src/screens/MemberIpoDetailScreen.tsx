import { useCallback } from 'react';
import { Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import Loading from '../components/Loading';
import ListRow from '../components/ListRow';
import Tag from '../components/Tag';
import Banner from '../components/Banner';
import { formatCurrency, formatDateTime, formatPan } from '../utils/format';
import { useQuery } from '../hooks/useQuery';
import { useAuth } from '../context/AuthContext';
import { ALLOTMENT_COLORS, formatAllotmentLabel, formatIpoShareLine } from '../utils/memberPortal';
import { ui } from '../styles/ui';

export default function MemberIpoDetailScreen() {
  const { ipoId } = useLocalSearchParams<{ ipoId: string }>();
  const { user, isMember } = useAuth();

  const fetcher = useCallback(async () => {
    const { data } = await client.get(`/member-portal/ipo/${ipoId}`);
    return data;
  }, [ipoId]);

  const { data, loading, error, refresh } = useQuery(fetcher, [ipoId], {
    enabled: isMember && !!user?.id && !!ipoId,
  });

  if (loading && !data) return <Loading />;

  const ipo = data?.ipo;
  const personal = data?.personalApplication;
  const groupApps = data?.groupApplications ?? [];

  return (
    <Screen bottomNavInset>
      <PageHeader
        title={ipo?.name || 'IPO detail'}
        subtitle={ipo?.status === 'OPEN' ? 'Open IPO' : 'Closed IPO'}
        extra={<Button compact mode="outlined" onPress={refresh}>Refresh</Button>}
      />
      {error ? <Banner variant="warn">{error}</Banner> : null}

      {ipo ? (
        <ContentCard title="IPO info">
          <View style={ui.infoLine}>
            <Text style={ui.infoLabel}>Status</Text>
            <Text style={ui.infoValue}>{ipo.status}</Text>
          </View>
          {ipo.openDate ? (
            <View style={ui.infoLine}>
              <Text style={ui.infoLabel}>Open date</Text>
              <Text style={ui.infoValue}>{formatDateTime(ipo.openDate)}</Text>
            </View>
          ) : null}
          <View style={ui.infoLine}>
            <Text style={ui.infoLabel}>RII lot</Text>
            <Text style={ui.infoValue}>{formatCurrency(ipo.lotAmountRii)}</Text>
          </View>
          <View style={ui.infoLine}>
            <Text style={ui.infoLabel}>Segment</Text>
            <Text style={ui.infoValue}>{ipo.ipoSegment}</Text>
          </View>
        </ContentCard>
      ) : null}

      {personal ? (
        <ContentCard title="Your application">
          <ListRow
            title={formatAllotmentLabel(personal.allotmentStatus)}
            subtitle={[
              formatCurrency(personal.amount),
              personal.investorCategory,
              personal.fundReturned ? 'Fund returned' : 'Fund pending',
              personal.grossProfitLoss != null ? `Gross P&L ${formatCurrency(personal.grossProfitLoss)}` : null,
              personal.memberShare != null ? `Share ${formatCurrency(personal.memberShare)}` : null,
            ].filter(Boolean).join(' · ')}
            right={
              <Tag
                label={formatAllotmentLabel(personal.allotmentStatus)}
                color={ALLOTMENT_COLORS[personal.allotmentStatus] || '#64748b'}
              />
            }
          />
        </ContentCard>
      ) : (
        <ContentCard title="Your application">
          <ListRow title="Not applied" subtitle="Your manager has not added you to this IPO yet" />
        </ContentCard>
      )}

      {data?.isLeader ? (
        <ContentCard title={`Group members (${groupApps.length})`}>
          <Text style={ui.hint}>Collection helper — see who returned fund for this IPO.</Text>
          {groupApps.map((app: any) => (
            <ListRow
              key={app.id}
              title={`${app.memberName}${app.isLeader ? ' (You)' : ''}`}
              subtitle={[
                formatPan(app.memberPan),
                formatCurrency(app.amount),
                formatAllotmentLabel(app.allotmentStatus),
                app.fundReturned ? 'Fund returned' : 'Fund pending',
                app.grossProfitLoss != null ? `P&L ${formatCurrency(app.grossProfitLoss)}` : null,
                formatIpoShareLine(app),
                app.memberUpi ? `UPI ${app.memberUpi}` : null,
              ].filter(Boolean).join(' · ')}
              right={
                <Tag
                  label={formatAllotmentLabel(app.allotmentStatus)}
                  color={ALLOTMENT_COLORS[app.allotmentStatus] || '#64748b'}
                />
              }
            />
          ))}
        </ContentCard>
      ) : null}
    </Screen>
  );
}
