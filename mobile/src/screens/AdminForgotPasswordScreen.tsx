import { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { Button, TextInput } from 'react-native-paper';
import adminClient from '../api/adminClient';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import { getErrorMessage, getForgotPasswordError } from '../utils/errors';

export default function AdminForgotPasswordScreen() {
  const [step, setStep] = useState<'email' | 'otp' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [actionToken, setActionToken] = useState('');
  const [loading, setLoading] = useState(false);

  const sendOtp = async () => {
    setLoading(true);
    try {
      const { data } = await adminClient.post('/admin/auth/forgot-password', { email: email.trim() });
      Alert.alert('Code sent', data.message);
      setStep('otp');
    } catch (err) {
      const info = getForgotPasswordError(err, 'admin');
      Alert.alert(info.title, info.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setLoading(true);
    try {
      const { data } = await adminClient.post('/admin/auth/verify-otp', { email: email.trim(), otp: otp.trim() });
      setActionToken(data.actionToken);
      setStep('reset');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Invalid code'));
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    setLoading(true);
    try {
      await adminClient.post('/admin/auth/reset-password', { email: email.trim(), password, actionToken });
      Alert.alert('Success', 'Password updated.');
      router.replace('/(admin-auth)/login');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Reset failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <PageHeader title="Admin forgot password" />
      <TextInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" mode="outlined" style={{ marginBottom: 12 }} editable={step === 'email'} />
      {step !== 'email' && <TextInput label="Verification code" value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} mode="outlined" style={{ marginBottom: 12 }} editable={step === 'otp'} />}
      {step === 'reset' && <TextInput label="New password" value={password} onChangeText={setPassword} secureTextEntry mode="outlined" style={{ marginBottom: 12 }} />}
      {step === 'email' && <Button mode="contained" onPress={sendOtp} loading={loading}>Send code</Button>}
      {step === 'otp' && <Button mode="contained" onPress={verifyOtp} loading={loading}>Verify code</Button>}
      {step === 'reset' && <Button mode="contained" onPress={resetPassword} loading={loading}>Reset password</Button>}
      <Button mode="text" onPress={() => router.back()}>Back</Button>
    </Screen>
  );
}
