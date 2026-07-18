import { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';
import { SegmentedButtons, TextInput, Button } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../utils/errors';

async function verifyPasswordAndPatch({ verifyOtp, patch, otp, patchBody, onSuccess, onError, setLoading }: any) {
  setLoading(true);
  try {
    const { data: verify } = await verifyOtp({ otp: otp?.trim() });
    const { data } = await patch({ ...patchBody, actionToken: verify.actionToken });
    onSuccess(data);
  } catch (err) {
    onError(err);
  } finally {
    setLoading(false);
  }
}

async function verifyEmailChangeAndPatch({ verifyOtp, patch, newEmail, currentOtp, newOtp, onSuccess, onError, setLoading }: any) {
  setLoading(true);
  try {
    const { data: verify } = await verifyOtp({ newEmail: newEmail?.trim(), currentOtp: currentOtp?.trim(), newOtp: newOtp?.trim() });
    const { data } = await patch({ email: newEmail?.trim(), actionToken: verify.actionToken });
    onSuccess(data);
  } catch (err) {
    onError(err);
  } finally {
    setLoading(false);
  }
}

export default function SettingsScreen() {
  const { user, setSessionUser } = useAuth();
  const [account, setAccount] = useState<any>(null);
  const [tab, setTab] = useState('team');
  const [teamName, setTeamName] = useState('');
  const [teamLoading, setTeamLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [currentOtp, setCurrentOtp] = useState('');
  const [newOtp, setNewOtp] = useState('');
  const [emailCodesSent, setEmailCodesSent] = useState(false);
  const [pendingNewEmail, setPendingNewEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [otpSendLoading, setOtpSendLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [passLoading, setPassLoading] = useState(false);

  useEffect(() => {
    if (user?.tenantName) setTeamName(user.tenantName);
    if (user?.email) setEmail(user.email);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    client
      .get('/settings/account')
      .then(async (res) => {
        if (cancelled) return;
        setAccount(res.data);
        await setSessionUser(res.data);
        if (res.data.tenantName) setTeamName(res.data.tenantName);
        if (res.data.email) setEmail(res.data.email);
      })
      .catch(() => {
        if (!cancelled) setAccount(null);
      });
    return () => { cancelled = true; };
  }, [setSessionUser]);

  const onTeamSave = async () => {
    setTeamLoading(true);
    try {
      const { data } = await client.patch('/settings/team', { tenantName: teamName });
      await setSessionUser(data);
      Alert.alert('Success', 'Team name updated');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Update failed'));
    } finally {
      setTeamLoading(false);
    }
  };

  const sendPasswordOtp = async () => {
    setOtpSendLoading(true);
    try {
      const { data } = await client.post('/settings/send-password-otp');
      Alert.alert('Code sent', data.message);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not send code'));
    } finally {
      setOtpSendLoading(false);
    }
  };

  const sendEmailChangeCodes = async () => {
    setOtpSendLoading(true);
    try {
      const { data } = await client.post('/settings/send-email-change-otp', { newEmail: email.trim() });
      setEmailCodesSent(true);
      setPendingNewEmail(data.newEmail);
      Alert.alert('Codes sent', data.message);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not send codes'));
    } finally {
      setOtpSendLoading(false);
    }
  };

  const onEmailSave = async () => {
    if (!emailCodesSent) {
      Alert.alert('Error', 'Send verification codes first');
      return;
    }
    await verifyEmailChangeAndPatch({
      verifyOtp: (body: any) => client.post('/settings/verify-email-change-otp', body),
      patch: (body: any) => client.patch('/settings/email', body),
      newEmail: email,
      currentOtp,
      newOtp,
      setLoading: setEmailLoading,
      onSuccess: async (data: any) => {
        await setSessionUser(data);
        Alert.alert('Success', 'Email updated');
        setEmailCodesSent(false);
        setPendingNewEmail('');
        setCurrentOtp('');
        setNewOtp('');
      },
      onError: (err: unknown) => Alert.alert('Error', getErrorMessage(err, 'Update failed')),
    });
  };

  const onPasswordSave = async () => {
    await verifyPasswordAndPatch({
      verifyOtp: (body: any) => client.post('/settings/verify-password-otp', body),
      patch: (body: any) => client.patch('/settings/password', body),
      otp,
      patchBody: { currentPassword, newPassword },
      setLoading: setPassLoading,
      onSuccess: () => {
        Alert.alert('Success', 'Password updated');
        setOtp('');
        setCurrentPassword('');
        setNewPassword('');
      },
      onError: (err: unknown) => Alert.alert('Error', getErrorMessage(err, 'Update failed')),
    });
  };

  const accountEmail = account?.email || user?.email;

  return (
    <Screen>
      <PageHeader title="Settings" subtitle={accountEmail || 'Account'} />

      {(account || user) && (
        <ContentCard title="Account">
          <Text style={{ marginBottom: 4 }}>{account?.tenantName || user?.tenantName || '—'}</Text>
          {accountEmail ? <Text style={{ marginBottom: 4, opacity: 0.75 }}>{accountEmail}</Text> : null}
          {account?.role ? <Text style={{ opacity: 0.75 }}>{account.role}</Text> : null}
        </ContentCard>
      )}

      <SegmentedButtons
        value={tab}
        onValueChange={setTab}
        buttons={[
          { value: 'team', label: 'Team' },
          { value: 'email', label: 'Email' },
          { value: 'password', label: 'Password' },
        ]}
        style={{ marginBottom: 16 }}
      />

      {tab === 'team' && (
        <ContentCard title="Team name">
          <TextInput label="Team name" value={teamName} onChangeText={setTeamName} mode="outlined" style={{ marginBottom: 12 }} />
          <Button mode="contained" loading={teamLoading} onPress={onTeamSave}>Save</Button>
        </ContentCard>
      )}

      {tab === 'email' && (
        <ContentCard title="Change email">
          <TextInput label="New email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" mode="outlined" style={{ marginBottom: 8 }} />
          <Button mode="text" loading={otpSendLoading} onPress={sendEmailChangeCodes}>Send codes to both emails</Button>
          {emailCodesSent && (
            <>
              <TextInput label={`Code from ${user?.email}`} value={currentOtp} onChangeText={setCurrentOtp} keyboardType="number-pad" maxLength={6} mode="outlined" style={{ marginBottom: 8 }} />
              <TextInput label={`Code from ${pendingNewEmail}`} value={newOtp} onChangeText={setNewOtp} keyboardType="number-pad" maxLength={6} mode="outlined" style={{ marginBottom: 8 }} />
            </>
          )}
          <Button mode="contained" loading={emailLoading} onPress={onEmailSave}>Update email</Button>
        </ContentCard>
      )}

      {tab === 'password' && (
        <ContentCard title="Change password">
          <Button mode="text" loading={otpSendLoading} onPress={sendPasswordOtp}>Send code to {user?.email}</Button>
          <TextInput label="Verification code" value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} mode="outlined" style={{ marginBottom: 8 }} />
          <TextInput label="Current password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry mode="outlined" style={{ marginBottom: 8 }} />
          <TextInput label="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry mode="outlined" style={{ marginBottom: 8 }} />
          <Button mode="contained" loading={passLoading} onPress={onPasswordSave}>Update password</Button>
        </ContentCard>
      )}
    </Screen>
  );
}
