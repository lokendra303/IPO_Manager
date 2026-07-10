import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Button, TextInput } from 'react-native-paper';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import client from '../api/client';
import { getErrorMessage, getForgotPasswordError } from '../utils/errors';

export default function ForgotPasswordScreen() {
  const [step, setStep] = useState<'email' | 'otp' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [actionToken, setActionToken] = useState('');
  const [loading, setLoading] = useState(false);

  const sendOtp = async () => {
    setLoading(true);
    try {
      const { data } = await client.post('/auth/forgot-password', { email: email.trim() });
      Alert.alert('Code sent', data.message);
      setStep('otp');
    } catch (err) {
      const info = getForgotPasswordError(err, 'manager');
      Alert.alert(info.title, info.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setLoading(true);
    try {
      const { data } = await client.post('/auth/verify-otp', { email: email.trim(), otp: otp.trim() });
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
      await client.post('/auth/reset-password', { email: email.trim(), password, actionToken });
      Alert.alert('Success', 'Password updated. You can sign in now.');
      router.replace('/(auth)/login');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Reset failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <PageHeader title="Forgot password" subtitle="Reset your manager account password" />
      <TextInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" mode="outlined" style={styles.input} editable={step === 'email'} />
      {step !== 'email' && (
        <TextInput label="Verification code" value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} mode="outlined" style={styles.input} editable={step === 'otp'} />
      )}
      {step === 'reset' && (
        <TextInput label="New password" value={password} onChangeText={setPassword} secureTextEntry mode="outlined" style={styles.input} />
      )}
      {step === 'email' && <Button mode="contained" onPress={sendOtp} loading={loading}>Send code</Button>}
      {step === 'otp' && <Button mode="contained" onPress={verifyOtp} loading={loading}>Verify code</Button>}
      {step === 'reset' && <Button mode="contained" onPress={resetPassword} loading={loading}>Reset password</Button>}
      <Button mode="text" onPress={() => router.back()} style={{ marginTop: 12 }}>Back to sign in</Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { marginBottom: 12 },
});
