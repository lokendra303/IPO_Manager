import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Button, TextInput } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';
import { colors, radii, shadows, spacing, typography } from '../theme';

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
      setMessage(
        data.message ||
          'Email verified successfully. Your registration is now waiting for system administrator approval.'
      );
      setDone(true);
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
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Ionicons name={done ? 'checkmark-circle' : 'mail'} size={28} color="#fff" />
            </View>
            <Text style={styles.heroTitle}>IPO Team</Text>
            <Text style={styles.heroSub}>
              {done
                ? 'Email confirmed. Waiting for administrator approval.'
                : 'Confirm your manager email with the OTP we sent.'}
            </Text>
          </View>

          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{done ? 'Email confirmed' : 'Verify your email'}</Text>
            <Text style={styles.sheetSub}>
              {done
                ? message ||
                  'Your registration is waiting for system administrator approval. You can sign in once approved.'
                : 'Enter the 6-digit code from your email. After verification, a system administrator must approve your team.'}
            </Text>

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
                  label="6-digit verification code"
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                  mode="outlined"
                  style={styles.input}
                />
                <Button mode="contained" onPress={verifyOtp} loading={loading} style={styles.btn} contentStyle={styles.btnContent}>
                  Verify code
                </Button>
                <Button mode="text" loading={resendLoading} onPress={resendOtp} style={{ marginTop: 8 }}>
                  Resend code
                </Button>
              </>
            ) : null}

            <Button
              mode={done ? 'contained' : 'text'}
              onPress={() => router.replace({ pathname: '/(auth)/login', params: { tab: 'manager' } })}
              style={{ marginTop: 12 }}
              contentStyle={styles.btnContent}
            >
              Go to sign in
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.sider },
  container: { flexGrow: 1 },
  hero: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  heroTitle: { ...typography.hero, color: '#fff' },
  heroSub: { color: '#94a3b8', marginTop: spacing.sm, lineHeight: 22, fontSize: 15, maxWidth: 320 },
  sheet: {
    flex: 1,
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    minHeight: 420,
    ...shadows.card,
  },
  sheetTitle: { ...typography.title, fontSize: 22, color: colors.text },
  sheetSub: { ...typography.caption, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.lg, lineHeight: 20 },
  input: { marginBottom: spacing.md, backgroundColor: colors.card },
  btn: { marginTop: spacing.sm, borderRadius: radii.md },
  btnContent: { paddingVertical: 6 },
});
