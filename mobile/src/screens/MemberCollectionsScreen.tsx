import { Alert, Text, View } from 'react-native';
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
import { useMemberDashboard } from '../hooks/useMemberDashboard';
import { useAuth } from '../context/AuthContext';
import { ui } from '../styles/ui';

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

  if (loading && !dashboard) return <Loading />;

  if (!isLeader) {
    return (
      <Screen bottomNavInset>
        <PageHeader title="Collect from members" />
        <Banner variant="info">Only sub-group leaders can see member collection status.</Banner>
      </Screen>
    );
  }

  const total = members.reduce((s, m) => s + Number(m.pendingReturn ?? 0), 0);

  return (
    <Screen bottomNavInset>
      <PageHeader
        title="Collect from members"
        subtitle={members.length ? `${formatCurrency(total)} pending across ${members.length} member(s)` : 'All caught up'}
      />
      <ContentCard title="Who still owes fund return">
        <Text style={ui.hint}>Members with pending return to your manager. Remind them via WhatsApp or copy their UPI.</Text>
        {!members.length ? (
          <ListRow title="No pending collections" subtitle="Every member has returned their fund share" />
        ) : (
          members.map((m) => (
            <ListRow
              key={m.id}
              title={m.displayName}
              subtitle={[
                formatPan(m.pan),
                `Pending ${formatCurrency(m.pendingReturn)}`,
                m.upi ? `UPI ${m.upi}` : 'No UPI on file',
              ].join(' · ')}
              right={<Tag label="Owed" color="#d97706" />}
            />
          ))
        )}
      </ContentCard>
      {members.map((m) => (
        <ContentCard key={`actions-${m.id}`} title={m.displayName}>
          <Button mode="outlined" onPress={() => remind(m.displayName, Number(m.pendingReturn))} style={{ marginBottom: 8 }}>
            WhatsApp reminder
          </Button>
          {m.upi ? (
            <Button mode="outlined" onPress={() => copyUpi(m.upi!, m.displayName)}>Copy UPI</Button>
          ) : (
            <Banner variant="warn">{`Ask ${m.displayName} to add UPI in profile.`}</Banner>
          )}
        </ContentCard>
      ))}
      <Button mode="text" onPress={() => router.push('/(member)/profile' as any)}>Update your own UPI</Button>
    </Screen>
  );
}
