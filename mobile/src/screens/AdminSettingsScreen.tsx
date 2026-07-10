import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { SegmentedButtons, Button, TextInput } from 'react-native-paper';
import adminClient from '../api/adminClient';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import { useAdminAuth } from '../context/AdminAuthContext';
import { getErrorMessage } from '../utils/errors';
import { ui } from '../styles/ui';

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

export default function AdminSettingsScreen() {
  const { admin, setAdmin } = useAdminAuth();
  const [tab, setTab] = useState('password');
  const [otpSendLoading, setOtpSendLoading] = useState(false);
  const [passLoading, setPassLoading] = useState(false);
  const [otp, setOtp] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [currentOtp, setCurrentOtp] = useState('');
  const [newEmailOtp, setNewEmailOtp] = useState('');
  const [emailCodesSent, setEmailCodesSent] = useState(false);

  const sendPasswordOtp = async () => {
    setOtpSendLoading(true);
    try {
      const { data } = await adminClient.post('/admin/profile/send-password-otp');
      Alert.alert('Code sent', data.message);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setOtpSendLoading(false);
    }
  };

  const onPasswordSave = async () => {
    await verifyPasswordAndPatch({
      verifyOtp: (body: any) => adminClient.post('/admin/profile/verify-password-otp', body),
      patch: (body: any) => adminClient.patch('/admin/profile/password', body),
      otp,
      patchBody: { currentPassword, newPassword },
      setLoading: setPassLoading,
      onSuccess: () => Alert.alert('Success', 'Password updated'),
      onError: (err: unknown) => Alert.alert('Error', getErrorMessage(err)),
    });
  };

  const sendEmailCodes = async () => {
    setOtpSendLoading(true);
    try {
      await adminClient.post('/admin/profile/send-email-change-otp', { newEmail: newEmail.trim() });
      setEmailCodesSent(true);
      Alert.alert('Codes sent', 'Check both email inboxes');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setOtpSendLoading(false);
    }
  };

  const onEmailSave = async () => {
    try {
      const { data: verify } = await adminClient.post('/admin/profile/verify-email-change-otp', {
        newEmail: newEmail.trim(),
        currentOtp: currentOtp.trim(),
        newOtp: newEmailOtp.trim(),
      });
      const { data } = await adminClient.patch('/admin/profile/email', {
        email: newEmail.trim(),
        actionToken: verify.actionToken,
      });
      await setAdmin(data);
      Alert.alert('Success', 'Email updated');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    }
  };

  return (
    <Screen>
      <PageHeader title="Admin profile" subtitle={admin?.email} />

      <SegmentedButtons
        value={tab}
        onValueChange={setTab}
        buttons={[
          { value: 'password', label: 'Password' },
          { value: 'email', label: 'Email' },
        ]}
        style={{ marginBottom: 16 }}
      />

      {tab === 'password' ? (
        <ContentCard title="Change password">
          <Text style={ui.hint}>We will send a verification code to your admin email before updating your password.</Text>
          <Button mode="text" loading={otpSendLoading} onPress={sendPasswordOtp}>Send verification code</Button>
          <TextInput label="Code" value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} mode="outlined" style={ui.input} />
          <TextInput label="Current password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry mode="outlined" style={ui.input} />
          <TextInput label="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry mode="outlined" style={ui.input} />
          <Button mode="contained" loading={passLoading} onPress={onPasswordSave}>Update password</Button>
        </ContentCard>
      ) : (
        <ContentCard title="Change email">
          <Text style={ui.hint}>Codes will be sent to your current and new email addresses.</Text>
          <TextInput label="New email" value={newEmail} onChangeText={setNewEmail} keyboardType="email-address" autoCapitalize="none" mode="outlined" style={ui.input} />
          <Button mode="text" loading={otpSendLoading} onPress={sendEmailCodes}>Send codes</Button>
          {emailCodesSent && (
            <>
              <TextInput label="Current email code" value={currentOtp} onChangeText={setCurrentOtp} keyboardType="number-pad" maxLength={6} mode="outlined" style={ui.input} />
              <TextInput label="New email code" value={newEmailOtp} onChangeText={setNewEmailOtp} keyboardType="number-pad" maxLength={6} mode="outlined" style={ui.input} />
            </>
          )}
          <Button mode="contained" onPress={onEmailSave}>Update email</Button>
        </ContentCard>
      )}
    </Screen>
  );
}
