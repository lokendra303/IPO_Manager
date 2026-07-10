import { useMemo } from 'react';
import { Alert, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import Loading from '../components/Loading';
import ListRow from '../components/ListRow';
import Tag from '../components/Tag';
import Banner from '../components/Banner';
import { formatCurrency, formatPan } from '../utils/format';
import { useMemberDashboard } from '../hooks/useMemberDashboard';
import { useAuth } from '../context/AuthContext';
import {
  ALLOTMENT_COLORS,
  formatAllotmentLabel,
  formatIpoShareLine,
  groupApplicationsByIpo,
  summarizeIpoGroupRows,
} from '../utils/memberPortal';
import { copyToClipboard, getAllotmentPortals, openAllotmentPortal } from '../utils/allotmentCheck';
import { ui } from '../styles/ui';

export default function MemberAllotmentScreen() {
  const { user } = useAuth();
  const { data: dashboard, loading, error, refresh } = useMemberDashboard();

  const isGroupLeader = dashboard?.subGroup?.isLeader === true;
  const groupApps = dashboard?.subGroup?.groupApplications ?? [];
  const personalApps = dashboard?.ipoApplications ?? [];
  const memberPan = formatPan(dashboard?.member?.pan || user?.pan);

  const ipoGroups = useMemo(() => {
    const source = isGroupLeader && groupApps.length ? groupApps : personalApps.map((app) => ({
      id: app.id,
      ipoId: 0,
      ipoName: app.ipoName,
      memberId: 0,
      memberName: dashboard?.member?.displayName || 'You',
      memberPan: memberPan,
      amount: app.amount,
      allotmentStatus: app.allotmentStatus,
      grossProfitLoss: app.grossProfitLoss,
    }));
    return groupApplicationsByIpo(source);
  }, [dashboard, groupApps, isGroupLeader, memberPan, personalApps]);

  const pendingIpos = ipoGroups.filter((g) =>
    g.rows.some((r) => r.allotmentStatus === 'PENDING')
  );

  const copyPan = async (pan: string, name: string) => {
    const ok = await copyToClipboard(formatPan(pan));
    Alert.alert(ok ? 'Copied' : 'Error', ok ? `${name} PAN copied` : 'Could not copy PAN');
  };

  if (loading && !dashboard) return <Loading />;

  return (
    <Screen bottomNavInset>
      <PageHeader
        title="Check allotment"
        subtitle={
          isGroupLeader
            ? 'Verify allotment for your whole sub-group on official portals'
            : 'Open official portals to verify IPO allotment status'
        }
        extra={<Button compact mode="outlined" onPress={refresh}>Refresh</Button>}
      />

      {error ? <Banner variant="warn">{error}</Banner> : null}

      <Banner variant="info">
        India has no free public API for allotment by PAN. Copy each member PAN, open an official portal, select the IPO, then search.
      </Banner>

      <ContentCard title="Official portals">
        {getAllotmentPortals().map((p) => (
          <Button
            key={p.id}
            mode={p.id === 'bse' ? 'contained' : 'outlined'}
            onPress={() => openAllotmentPortal(p.url)}
            style={{ marginTop: 8 }}
          >
            Open {p.name}
          </Button>
        ))}
      </ContentCard>

      {!isGroupLeader && memberPan ? (
        <ContentCard title="Your PAN">
          <View style={ui.infoLine}>
            <Text style={ui.infoLabel}>PAN</Text>
            <Text style={ui.infoValue}>{memberPan}</Text>
          </View>
          <Button mode="outlined" onPress={() => copyPan(memberPan, 'Your')}>
            Copy my PAN
          </Button>
        </ContentCard>
      ) : null}

      {pendingIpos.length > 0 ? (
        <ContentCard title={`Pending allotment (${pendingIpos.length} IPO${pendingIpos.length === 1 ? '' : 's'})`}>
          {pendingIpos.map(({ ipoName, rows }) => (
            <View key={ipoName} style={{ marginBottom: 12 }}>
              <Text style={ui.sectionLabel}>{ipoName}</Text>
              <Text style={[ui.hint, { marginBottom: 8 }]}>{summarizeIpoGroupRows(rows)}</Text>
              {rows
                .filter((r) => r.allotmentStatus === 'PENDING')
                .map((row) => (
                  <ListRow
                    key={`${row.id}-${row.memberPan}`}
                    title={row.memberName}
                    subtitle={`PAN ${formatPan(row.memberPan)} · ${formatCurrency(row.amount)}`}
                    right={
                      <Button compact mode="outlined" onPress={() => copyPan(row.memberPan, row.memberName)}>
                        Copy PAN
                      </Button>
                    }
                  />
                ))}
            </View>
          ))}
        </ContentCard>
      ) : (
        <ContentCard title="Pending allotment">
          <ListRow title="No pending allotments" subtitle="All current IPOs are marked allotted or not allotted" />
        </ContentCard>
      )}

      <ContentCard title={isGroupLeader ? 'Group allotment status' : 'Your allotment status'}>
        {ipoGroups.length ? (
          ipoGroups.map(({ ipoName, rows }) => (
            <View key={ipoName} style={{ marginBottom: 16 }}>
              <Text style={ui.sectionLabel}>{ipoName}</Text>
              <Text style={[ui.hint, { marginBottom: 8 }]}>{summarizeIpoGroupRows(rows)}</Text>
              {rows.map((row) => (
                <ListRow
                  key={`${row.id}-${row.memberPan}-${row.allotmentStatus}`}
                  title={isGroupLeader ? row.memberName : ipoName}
                  subtitle={[
                    isGroupLeader ? `PAN ${formatPan(row.memberPan)}` : null,
                    formatCurrency(row.amount),
                    formatAllotmentLabel(row.allotmentStatus),
                    row.allotmentStatus === 'ALLOTED' && row.grossProfitLoss != null
                      ? `Gross P&L ${formatCurrency(row.grossProfitLoss)}`
                      : null,
                    formatIpoShareLine(row),
                  ].filter(Boolean).join(' · ')}
                  right={
                    <Tag
                      label={formatAllotmentLabel(row.allotmentStatus)}
                      color={ALLOTMENT_COLORS[row.allotmentStatus] || '#64748b'}
                    />
                  }
                />
              ))}
            </View>
          ))
        ) : (
          <ListRow title="No IPO applications yet" />
        )}
      </ContentCard>
    </Screen>
  );
}
