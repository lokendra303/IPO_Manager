import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import { router } from 'expo-router';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import Loading from '../components/Loading';
import ListRow from '../components/ListRow';
import Tag from '../components/Tag';
import Banner from '../components/Banner';
import { formatCurrency, formatPan } from '../utils/format';
import { copyToClipboard } from '../utils/allotmentCheck';
import { buildCollectionWhatsAppMessage, shareWhatsAppMessage } from '../utils/share';
import { openActionSheet } from '../utils/actionSheet';
import { useMemberDashboard } from '../hooks/useMemberDashboard';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

export default function MemberCollectionsScreen() {
  const { user } = useAuth();
  const { data: dashboard, loading } = useMemberDashboard();
  const isLeader = dashboard?.subGroup?.isLeader === true;
  const members = (dashboard?.subGroup?.members ?? []).filter(
    (m) => !m.isLeader && Number(m.pendingReturn ?? 0) > 0
  );

  const copyUpi = async (upi: string, name: string) => {
    const ok = await copyToClipboard(upi);
    Alert.alert(ok ? 'Copied' : 'Error', ok ? `${name} UPI copied` : 'Could not copy');
  };

  const remind = async (name: string, amount: number) => {
    const msg = buildCollectionWhatsAppMessage(name, amount, dashboard?.member?.displayName || user?.displayName);
    const ok = await shareWhatsAppMessage(msg);
    if (!ok) Alert.alert('WhatsApp', 'Could not open WhatsApp. Copy the message manually.');
  };

  const openMemberMore = (m: any) => {
    const pending = Number(m.pendingReturn ?? 0);
    const actions = [
      { text: 'WhatsApp reminder', onPress: () => remind(m.displayName, pending) },
      ...(m.upi
        ? [{ text: 'Copy UPI', onPress: () => copyUpi(m.upi!, m.displayName) }]
        : []),
    ];
    openActionSheet(
      m.displayName,
      actions,
      [
        formatPan(m.pan),
        `Pending ${formatCurrency(pending)}`,
        m.upi ? `UPI ${m.upi}` : 'No UPI on file — ask them to update profile',
      ].join('\n')
    );
  };

  if (loading && !dashboard) return <Loading />;

  if (!isLeader) {
    return (
      <Screen bottomNavInset>
        <PageHeader title="Collections" subtitle="Leaders only" />
        <Banner variant="info">Only sub-group leaders can see member collection status.</Banner>
      </Screen>
    );
  }

  const total = members.reduce((s, m) => s + Number(m.pendingReturn ?? 0), 0);

  return (
    <Screen bottomNavInset>
      <PageHeader
        title="Collections"
        subtitle={members.length ? `${formatCurrency(total)} · ${members.length} owed` : 'All caught up'}
      />
      <ContentCard title="Pending returns">
        {!members.length ? (
          <ListRow title="No pending collections" />
        ) : (
          members.map((m) => (
            <View key={m.id} style={styles.compactRow}>
              <View style={styles.compactRowMain}>
                <ListRow
                  title={m.displayName}
                  subtitle={`${formatCurrency(m.pendingReturn)} · ${formatPan(m.pan)}`}
                  right={<Tag label="Owed" color="#d97706" />}
                  onPress={() => openMemberMore(m)}
                />
              </View>
              <Pressable hitSlop={12} onPress={() => openMemberMore(m)} style={styles.moreBtn}>
                <Text style={styles.moreText}>···</Text>
              </Pressable>
            </View>
          ))
        )}
      </ContentCard>
      <Button mode="text" onPress={() => router.push('/(member)/profile' as any)}>Update your UPI</Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  compactRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  compactRowMain: { flex: 1 },
  moreBtn: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 20, fontWeight: '700', color: colors.textMuted, letterSpacing: 1 },
});
