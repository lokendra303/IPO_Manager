import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import ListRow from '../components/ListRow';
import Tag from '../components/Tag';
import Banner from '../components/Banner';
import Loading from '../components/Loading';
import { formatCurrency, formatDateTime } from '../utils/format';
import { useQuery } from '../hooks/useQuery';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../utils/errors';
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

  if (loading && !claims.length) return <Loading />;

  return (
    <Screen bottomNavInset>
      <PageHeader title="Report fund return" subtitle="Tell your manager you paid them back" />
      <ContentCard title="New payment report">
        <Banner variant="info">This does not auto-update your ledger. Your manager confirms and records the return.</Banner>
        <TextInput label="Amount returned (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" mode="outlined" style={ui.input} />
        <TextInput label="UPI / transaction reference (optional)" value={paymentRef} onChangeText={setPaymentRef} mode="outlined" style={ui.input} />
        <TextInput label="Notes (optional)" value={notes} onChangeText={setNotes} multiline mode="outlined" style={ui.input} />
        <Button mode="contained" loading={submitting} onPress={submit}>Submit to manager</Button>
      </ContentCard>
      <ContentCard title={`Your claims (${claims.length})`}>
        {!claims.length ? (
          <ListRow title="No claims yet" />
        ) : (
          claims.map((c) => (
            <ListRow
              key={c.id}
              title={formatCurrency(c.amount)}
              subtitle={[formatDateTime(c.createdAt), c.paymentRef, c.notes, c.managerNote].filter(Boolean).join(' · ')}
              right={<Tag label={c.status} color={c.status === 'ACKNOWLEDGED' ? '#059669' : c.status === 'REJECTED' ? '#b91c1c' : '#d97706'} />}
            />
          ))
        )}
      </ContentCard>
    </Screen>
  );
}
