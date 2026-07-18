import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import ListRow from '../components/ListRow';
import Tag from '../components/Tag';
import Loading from '../components/Loading';
import { formatCurrency, formatDateTime } from '../utils/format';
import { openActionSheet } from '../utils/actionSheet';
import { useQuery } from '../hooks/useQuery';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../utils/errors';
import { colors } from '../theme';
import { ui } from '../styles/ui';

export default function MemberFundReturnScreen() {
  const { user, isMember } = useAuth();
  const [amount, setAmount] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetcher = useCallback(async () => {
    const { data } = await client.get('/member-portal/fund-return-claims');
    return data as any[];
  }, []);

  const { data, loading, reload } = useQuery(fetcher, [], { enabled: isMember && !!user?.id });
  const claims = data ?? [];

  const submit = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert('Required', 'Enter a valid amount you returned to your manager.');
      return;
    }
    setSubmitting(true);
    try {
      await client.post('/member-portal/fund-return-claims', {
        amount: n,
        paymentRef: paymentRef.trim() || undefined,
        notes: notes.trim() || undefined,
        txnDate: new Date().toISOString(),
      });
      setAmount('');
      setPaymentRef('');
      setNotes('');
      await reload();
      Alert.alert('Submitted', 'Your manager will review and acknowledge the payment.');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not submit'));
    } finally {
      setSubmitting(false);
    }
  };

  const openClaimMore = (c: any) => {
    openActionSheet(formatCurrency(c.amount), [], [
      c.status,
      formatDateTime(c.createdAt),
      c.paymentRef ? `Ref: ${c.paymentRef}` : null,
      c.notes,
      c.managerNote ? `Manager: ${c.managerNote}` : null,
    ].filter(Boolean).join('\n'));
  };

  if (loading && !claims.length) return <Loading />;

  return (
    <Screen bottomNavInset>
      <PageHeader title="Fund return" subtitle="Report payment to manager" />
      <ContentCard title="New report">
        <TextInput label="Amount returned (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" mode="outlined" style={ui.input} />
        <TextInput label="UPI / reference (optional)" value={paymentRef} onChangeText={setPaymentRef} mode="outlined" style={ui.input} />
        <TextInput label="Notes (optional)" value={notes} onChangeText={setNotes} multiline mode="outlined" style={ui.input} />
        <Button mode="contained" loading={submitting} onPress={submit}>Submit</Button>
      </ContentCard>
      <ContentCard title={`Claims (${claims.length})`}>
        {!claims.length ? (
          <ListRow title="No claims yet" />
        ) : (
          claims.map((c) => (
            <View key={c.id} style={styles.compactRow}>
              <View style={styles.compactRowMain}>
                <ListRow
                  title={formatCurrency(c.amount)}
                  subtitle={formatDateTime(c.createdAt)}
                  right={<Tag label={c.status} color={c.status === 'ACKNOWLEDGED' ? '#059669' : c.status === 'REJECTED' ? '#b91c1c' : '#d97706'} />}
                  onPress={() => openClaimMore(c)}
                />
              </View>
              <Pressable hitSlop={12} onPress={() => openClaimMore(c)} style={styles.moreBtn}>
                <Text style={styles.moreText}>···</Text>
              </Pressable>
            </View>
          ))
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
