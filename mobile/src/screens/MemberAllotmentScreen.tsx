import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { openActionSheet } from '../utils/actionSheet';
import { colors, spacing } from '../theme';
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
      ipoId: app.ipoId ?? 0,
      ipoName: app.ipoName,
      openDate: app.openDate ?? null,
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

  const openPortalsMore = () => {
    const portals = getAllotmentPortals();
    openActionSheet('Allotment portals', [
      ...(memberPan ? [{ text: 'Copy my PAN', onPress: () => copyPan(memberPan, 'Your') }] : []),
      ...portals.map((p) => ({
        text: `Open ${p.name}`,
        onPress: () => openAllotmentPortal(p.url),
      })),
    ], 'No public PAN API — copy PAN, open a portal, select IPO, then search.');
  };

  const openPendingRowMore = (row: any, ipoName: string) => {
    openActionSheet(row.memberName, [
      { text: 'Copy PAN', onPress: () => copyPan(row.memberPan, row.memberName) },
    ], [
      ipoName,
      `PAN ${formatPan(row.memberPan)}`,
      formatCurrency(row.amount),
    ].join('\n'));
  };

  const openStatusRowMore = (row: any, ipoName: string) => {
    openActionSheet(isGroupLeader ? row.memberName : ipoName, [], [
      isGroupLeader ? `PAN ${formatPan(row.memberPan)}` : null,
      formatCurrency(row.amount),
      formatAllotmentLabel(row.allotmentStatus),
      row.allotmentStatus === 'ALLOTED' && row.grossProfitLoss != null
        ? `Gross P&L ${formatCurrency(row.grossProfitLoss)}`
        : null,
      formatIpoShareLine(row),
    ].filter(Boolean).join('\n'));
  };

  const openHeaderMore = () => {
    openActionSheet('Check allotment', [
      { text: 'Refresh', onPress: refresh },
      { text: 'Portals & PAN', onPress: openPortalsMore },
    ]);
  };

  if (loading && !dashboard) return <Loading />;

  return (
    <Screen bottomNavInset>
      <PageHeader
        title="Check allotment"
        subtitle={pendingIpos.length ? `${pendingIpos.length} pending IPO${pendingIpos.length === 1 ? '' : 's'}` : 'Verify on official portals'}
        extra={
          <Button compact mode="text" onPress={openHeaderMore}>
            More
          </Button>
        }
      />

      {error ? <Banner variant="warn">{error}</Banner> : null}

      {!isGroupLeader && memberPan ? (
        <ContentCard
          title="Your PAN"
          extra={
            <Button compact mode="text" onPress={openPortalsMore}>
              More
            </Button>
          }
        >
          <ListRow title={memberPan} subtitle="Copy PAN or open official portal" />
          <Button compact mode="contained" onPress={() => copyPan(memberPan, 'Your')} style={{ alignSelf: 'flex-start' }}>
            Copy PAN
          </Button>
        </ContentCard>
      ) : isGroupLeader ? (
        <ContentCard
          title="Official portals"
          extra={
            <Button compact mode="text" onPress={openPortalsMore}>
              More
            </Button>
          }
        >
          <ListRow title="BSE / NSE portals" subtitle="Copy member PANs and search after allotment day" />
        </ContentCard>
      ) : null}

      {pendingIpos.length > 0 ? (
        <ContentCard title={`Pending (${pendingIpos.length})`}>
          {pendingIpos.map(({ ipoName, rows }) => (
            <View key={ipoName} style={{ marginBottom: spacing.sm }}>
              <Text style={ui.sectionLabel}>{ipoName}</Text>
              {rows
                .filter((r) => r.allotmentStatus === 'PENDING')
                .map((row) => (
                  <View key={`${row.id}-${row.memberPan}`} style={styles.compactRow}>
                    <View style={styles.compactRowMain}>
                      <ListRow
                        title={row.memberName}
                        subtitle={`${formatPan(row.memberPan)} · ${formatCurrency(row.amount)}`}
                        onPress={() => openPendingRowMore(row, ipoName)}
                      />
                    </View>
                    <Pressable hitSlop={12} onPress={() => openPendingRowMore(row, ipoName)} style={styles.moreBtn}>
                      <Text style={styles.moreText}>···</Text>
                    </Pressable>
                  </View>
                ))}
            </View>
          ))}
        </ContentCard>
      ) : (
        <ContentCard title="Pending">
          <ListRow title="No pending allotments" />
        </ContentCard>
      )}

      <ContentCard title={isGroupLeader ? 'Group status' : 'Your status'}>
        {ipoGroups.length ? (
          ipoGroups.map(({ ipoName, rows }) => (
            <View key={ipoName} style={{ marginBottom: spacing.sm }}>
              <ListRow title={ipoName} subtitle={summarizeIpoGroupRows(rows)} />
              {rows.map((row) => (
                <View key={`${row.id}-${row.memberPan}-${row.allotmentStatus}`} style={styles.compactRow}>
                  <View style={styles.compactRowMain}>
                    <ListRow
                      title={isGroupLeader ? row.memberName : formatAllotmentLabel(row.allotmentStatus)}
                      subtitle={`${formatCurrency(row.amount)} · ${formatAllotmentLabel(row.allotmentStatus)}`}
                      right={
                        <Tag
                          label={formatAllotmentLabel(row.allotmentStatus)}
                          color={ALLOTMENT_COLORS[row.allotmentStatus] || '#64748b'}
                        />
                      }
                      onPress={() => openStatusRowMore(row, ipoName)}
                    />
                  </View>
                  <Pressable hitSlop={12} onPress={() => openStatusRowMore(row, ipoName)} style={styles.moreBtn}>
                    <Text style={styles.moreText}>···</Text>
                  </Pressable>
                </View>
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

const styles = StyleSheet.create({
  compactRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  compactRowMain: { flex: 1 },
  moreBtn: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 20, fontWeight: '700', color: colors.textMuted, letterSpacing: 1 },
});
