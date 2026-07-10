import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import Loading from '../components/Loading';
import Banner from '../components/Banner';
import { useMemberDashboard } from '../hooks/useMemberDashboard';
import { getErrorMessage } from '../utils/errors';
import { ui } from '../styles/ui';

export default function MemberProfileScreen() {
  const { data: dashboard, loading, reload } = useMemberDashboard();
  const member = dashboard?.member;
  const [email, setEmail] = useState('');
  const [upi, setUpi] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (member) {
      setEmail(member.email || '');
      setUpi(member.upi || '');
    }
  }, [member?.email, member?.upi]);

  if (loading && !dashboard) return <Loading />;

  const save = async () => {
    setSaving(true);
    try {
      await client.patch('/member-portal/profile', { email: email.trim() || null, upi: upi.trim() || null });
      await reload();
      Alert.alert('Saved', 'Your profile was updated.');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not save profile'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <PageHeader title="Edit profile" subtitle="Update contact details your manager can see" />
      <ContentCard title="Contact details">
        <TextInput label="Email" value={email} onChangeText={setEmail} mode="outlined" style={ui.input} keyboardType="email-address" autoCapitalize="none" />
        <TextInput label="UPI ID" value={upi} onChangeText={setUpi} mode="outlined" style={ui.input} autoCapitalize="none" />
        <Banner variant="info">PAN and name are managed by your manager and cannot be changed here.</Banner>
        <Button mode="contained" loading={saving} onPress={save} style={{ marginTop: 8 }}>Save profile</Button>
      </ContentCard>
    </Screen>
  );
}
