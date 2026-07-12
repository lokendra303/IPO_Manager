import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, Redirect, router, useLocalSearchParams } from 'expo-router';
import { Button, SegmentedButtons, TextInput } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Loading from '../components/Loading';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import { getAuthErrorModal, getErrorMessage } from '../utils/errors';
import { colors, radii, shadows, spacing, typography } from '../theme';

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

type LoginTab = 'member' | 'manager' | 'register';

const TAB_COPY: Record<LoginTab, { title: string; subtitle: string }> = {
  member: {
    title: 'Member portal',
    subtitle: 'Sign in with the PAN your manager added for you',
  },
  manager: {
    title: 'Manager sign in',
    subtitle: 'Use your team email and password',
  },
  register: {
    title: 'Register a team',
    subtitle: 'Create a new fund manager account',
  },
};

export default function LoginScreen() {
  const { login, memberLogin, register, isAuthenticated, user, loading: authLoading } = useAuth();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<LoginTab>('member');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState('');

  const [pan, setPan] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  useEffect(() => {
    if (tabParam === 'manager' || tabParam === 'register' || tabParam === 'member') {
      setTab(tabParam);
    }
  }, [tabParam]);

  if (authLoading) return <Loading />;
  if (isAuthenticated) {
    return <Redirect href={user?.role === 'member' ? '/(member)/portal' : '/(manager)'} />;
  }

  const copy = TAB_COPY[tab];

  const showError = (err: unknown, context: 'manager' | 'member' | 'register') => {
    const { title, content } = getAuthErrorModal(err, context);
    Alert.alert(title, content);
  };

  const onMemberLogin = async () => {
    const normalizedPan = pan.trim().toUpperCase();
    if (!PAN_PATTERN.test(normalizedPan)) {
      Alert.alert('Invalid PAN', 'Enter a valid 10-character PAN (e.g. ABCDE1234F).');
      return;
    }
    setLoading(true);
    try {
      await memberLogin(normalizedPan);
    } catch (err) {
      showError(err, 'member');
    } finally {
      setLoading(false);
    }
  };

  const onLogin = async () => {
    setLoading(true);
    setPendingVerifyEmail('');
    try {
      await login(email.trim(), password);
    } catch (err) {
      const raw = getErrorMessage(err, '');
      if (raw.toLowerCase().includes('confirm your email')) setPendingVerifyEmail(email.trim());
      showError(err, 'manager');
    } finally {
      setLoading(false);
    }
  };

  const onRegister = async () => {
    setLoading(true);
    try {
      const trimmedEmail = regEmail.trim();
      await register(trimmedEmail, regPassword, tenantName.trim());
      Alert.alert('Registration submitted', 'Enter the verification code sent to your email.');
      router.push({ pathname: '/(auth)/verify-email', params: { email: trimmedEmail } });
    } catch (err) {
      showError(err, 'register');
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    if (!pendingVerifyEmail) return;
    setResendLoading(true);
    try {
      const { data } = await client.post('/auth/resend-verification', { email: pendingVerifyEmail });
      Alert.alert('Code sent', data.message);
      router.push({ pathname: '/(auth)/verify-email', params: { email: pendingVerifyEmail } });
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not resend verification code'));
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Ionicons name={tab === 'member' ? 'person' : 'trending-up'} size={28} color="#fff" />
            </View>
            <Text style={styles.heroTitle}>IPO Team</Text>
            <Text style={styles.heroSub}>
              {tab === 'member'
                ? 'View your IPO applications, returns, and report issues to your manager.'
                : 'Track members, wallet flows, and IPO profit — built for mobile.'}
            </Text>
          </View>

          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{copy.title}</Text>
            <Text style={styles.sheetSub}>{copy.subtitle}</Text>

            <SegmentedButtons
              value={tab}
              onValueChange={(v) => setTab(v as LoginTab)}
              buttons={[
                { value: 'member', label: 'Member' },
                { value: 'manager', label: 'Manager' },
                { value: 'register', label: 'Register' },
              ]}
              style={{ marginBottom: spacing.lg }}
            />

            {tab === 'member' && (
              <>
                <TextInput
                  label="PAN number"
                  value={pan}
                  onChangeText={(v) => setPan(v.toUpperCase())}
                  autoCapitalize="characters"
                  maxLength={10}
                  mode="outlined"
                  style={styles.input}
                  placeholder="ABCDE1234F"
                />
                <Text style={styles.hint}>No password needed — only the PAN registered by your manager works.</Text>
                <Button mode="contained" onPress={onMemberLogin} loading={loading} style={styles.btn} contentStyle={styles.btnContent}>
                  Open member portal
                </Button>
              </>
            )}

            {tab === 'manager' && (
              <>
                <TextInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" mode="outlined" style={styles.input} />
                <TextInput label="Password" value={password} onChangeText={setPassword} secureTextEntry mode="outlined" style={styles.input} />
                <Link href="/(auth)/forgot-password" style={styles.link}>Forgot password?</Link>
                {pendingVerifyEmail ? (
                  <>
                    <Button mode="text" loading={resendLoading} onPress={onResend}>Resend verification code</Button>
                    <Button
                      mode="text"
                      onPress={() =>
                        router.push({ pathname: '/(auth)/verify-email', params: { email: pendingVerifyEmail } })
                      }
                    >
                      Enter verification code
                    </Button>
                  </>
                ) : null}
                <Button mode="contained" onPress={onLogin} loading={loading} style={styles.btn} contentStyle={styles.btnContent}>
                  Sign in
                </Button>
              </>
            )}

            {tab === 'register' && (
              <>
                <TextInput label="Team name" value={tenantName} onChangeText={setTenantName} mode="outlined" style={styles.input} />
                <TextInput label="Email" value={regEmail} onChangeText={setRegEmail} keyboardType="email-address" autoCapitalize="none" mode="outlined" style={styles.input} />
                <TextInput label="Password" value={regPassword} onChangeText={setRegPassword} secureTextEntry mode="outlined" style={styles.input} />
                <Text style={styles.hint}>New teams need an email verification code and admin approval.</Text>
                <Button mode="contained" onPress={onRegister} loading={loading} style={styles.btn} contentStyle={styles.btnContent}>
                  Submit registration
                </Button>
              </>
            )}
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
  sheetSub: { ...typography.caption, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.lg },
  input: { marginBottom: spacing.md, backgroundColor: colors.card },
  hint: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 20 },
  btn: { marginTop: spacing.sm, borderRadius: radii.md },
  btnContent: { paddingVertical: 6 },
  link: { color: colors.primary, marginBottom: spacing.sm, fontWeight: '600' },
});
