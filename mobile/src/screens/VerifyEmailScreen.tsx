import { useEffect, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Button, TextInput } from 'react-native-paper';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';

export default function VerifyEmailScreen() {
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof emailParam === 'string' ? emailParam : '');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (typeof emailParam === 'string' && emailParam) {
      setEmail(emailParam);
    }
  }, [emailParam]);

  const verifyOtp = async () => {
    const trimmedEmail = email.trim();
    const code = otp.trim();
    if (!trimmedEmail) {
      Alert.alert('Email required', 'Enter the email you registered with.');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      Alert.alert('Invalid code', 'Enter the 6-digit verification code from your email.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await client.post('/auth/verify-email', { email: trimmedEmail, otp: code });
      setMessage(data.message || 'Email verified successfully.');
      setDone(true);
      Alert.alert('Email confirmed', data.message);
    } catch (err) {
      Alert.alert('Verification failed', getErrorMessage(err, 'Invalid verification code'));
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert('Email required', 'Enter your email first.');
      return;
    }
    setResendLoading(true);
    try {
      const { data } = await client.post('/auth/resend-verification', { email: trimmedEmail });
      Alert.alert('Code sent', data.message);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not resend verification code'));
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <Screen>
      <PageHeader
        title={done ? 'Email confirmed' : 'Verify your email'}
        subtitle={
          done
            ? message || 'Your registration is waiting for system administrator approval.'
            : 'Enter the 6-digit code sent to your email. After verification, a system administrator must approve your team.'
        }
      />
      {!done ? (
        <>
          <TextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            mode="outlined"
            style={styles.input}
          />
          <TextInput
            label="Verification code"
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={6}
            mode="outlined"
            style={styles.input}
          />
          <Button mode="contained" onPress={verifyOtp} loading={loading}>
            Verify code
          </Button>
          <Button mode="text" loading={resendLoading} onPress={resendOtp} style={{ marginTop: 8 }}>
            Resend code
          </Button>
        </>
      ) : null}
      <Button mode={done ? 'contained' : 'text'} onPress={() => router.replace('/(auth)/login')} style={{ marginTop: 12 }}>
        Go to sign in
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { marginBottom: 12 },
});
