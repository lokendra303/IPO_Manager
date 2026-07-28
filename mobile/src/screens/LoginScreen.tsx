import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link, Redirect, useLocalSearchParams } from 'expo-router';
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
type RegisterStep = 'form' | 'otp' | 'done';

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
  const [registerStep, setRegisterStep] = useState<RegisterStep>('form');
  const [regOtp, setRegOtp] = useState('');
  const [verifyMessage, setVerifyMessage] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: { endCoordinates: { height: number } }) => {
      setKeyboardInset(e.endCoordinates.height);
    };
    const onHide = () => setKeyboardInset(0);
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const scrollFormIntoView = () => {
    const delay = Platform.OS === 'android' ? 120 : 0;
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, delay);
  };

  const keyboardOpen = keyboardInset > 0;

  useEffect(() => {
    if (tabParam === 'manager' || tabParam === 'register' || tabParam === 'member') {
      setTab(tabParam);
    }
  }, [tabParam]);

  if (authLoading) return <Loading />;
  if (isAuthenticated) {
    return <Redirect href={user?.role === 'member' ? '/(member)/portal' : '/(manager)'} />;
  }

  const copy =
    tab === 'register' && registerStep === 'otp'
      ? { title: 'Verify your email', subtitle: 'Enter the 6-digit code sent to your email' }
      : tab === 'register' && registerStep === 'done'
        ? { title: 'Registration submitted', subtitle: 'Waiting for system administrator approval' }
        : TAB_COPY[tab];

  const showError = (err: unknown, context: 'manager' | 'member' | 'register') => {
    const { title, content } = getAuthErrorModal(err, context);
    Alert.alert(title, content);
  };

  const resetRegisterFlow = () => {
    setRegisterStep('form');
    setRegOtp('');
    setVerifyMessage('');
  };

  const onTabChange = (next: LoginTab) => {
    setTab(next);
    if (next !== 'register') resetRegisterFlow();
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
      if (raw.toLowerCase().includes('confirm your email')) {
        const pendingEmail = email.trim();
        setPendingVerifyEmail(pendingEmail);
        setRegEmail(pendingEmail);
        setTab('register');
        setRegisterStep('otp');
        setRegOtp('');
      }
      showError(err, 'manager');
    } finally {
      setLoading(false);
    }
  };

  const onRegister = async () => {
    const trimmedEmail = regEmail.trim();
    if (!tenantName.trim()) {
      Alert.alert('Team name required', 'Enter a team name to continue.');
      return;
    }
    if (!trimmedEmail) {
      Alert.alert('Email required', 'Enter your email address.');
      return;
    }
    if (regPassword.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await register(trimmedEmail, regPassword, tenantName.trim());
      setRegOtp('');
      setRegisterStep('otp');
      Alert.alert('Code sent', 'Enter the 6-digit verification code sent to your email.');
    } catch (err) {
      showError(err, 'register');
    } finally {
      setLoading(false);
    }
  };

  const onVerifyRegistrationOtp = async () => {
    const trimmedEmail = regEmail.trim();
    const code = regOtp.trim();
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
      const { data } = await client.post('/auth/verify-email', {
        email: trimmedEmail,
        otp: code,
      });
      setVerifyMessage(
        data.message ||
          'Email verified successfully. Your registration is now waiting for system administrator approval.'
      );
      setRegisterStep('done');
      setPendingVerifyEmail('');
    } catch (err) {
      Alert.alert('Verification failed', getErrorMessage(err, 'Invalid verification code'));
    } finally {
      setLoading(false);
    }
  };

  const onResendRegistrationOtp = async () => {
    const trimmedEmail = (regEmail || pendingVerifyEmail).trim();
    if (!trimmedEmail) {
      Alert.alert('Email required', 'Enter your email first.');
      return;
    }
    setResendLoading(true);
    try {
      const { data } = await client.post('/auth/resend-verification', { email: trimmedEmail });
      setRegEmail(trimmedEmail);
      Alert.alert('Code sent', data.message);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not resend verification code'));
    } finally {
      setResendLoading(false);
    }
  };

  const onResendFromLogin = async () => {
    if (!pendingVerifyEmail) return;
    setResendLoading(true);
    try {
      const { data } = await client.post('/auth/resend-verification', { email: pendingVerifyEmail });
      setRegEmail(pendingVerifyEmail);
      setTab('register');
      setRegisterStep('otp');
      setRegOtp('');
      Alert.alert('Code sent', data.message);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not resend verification code'));
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.container,
            { paddingBottom: Math.max(spacing.xl, keyboardInset) + spacing.lg },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <View style={[styles.hero, keyboardOpen && styles.heroCompact]}>
            {!keyboardOpen && (
              <View style={styles.heroIcon}>
                <Ionicons
                  name={tab === 'member' ? 'person' : registerStep === 'done' ? 'checkmark-circle' : 'trending-up'}
                  size={28}
                  color="#fff"
                />
              </View>
            )}
            <Text style={[styles.heroTitle, keyboardOpen && styles.heroTitleCompact]}>IPO Team</Text>
            {!keyboardOpen && (
              <Text style={styles.heroSub}>
                {tab === 'member'
                  ? 'View your IPO applications, returns, and report issues to your manager.'
                  : 'Track members, wallet flows, and IPO profit — built for mobile.'}
              </Text>
            )}
          </View>

          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{copy.title}</Text>
            <Text style={styles.sheetSub}>{copy.subtitle}</Text>

            {registerStep === 'form' && (
              <SegmentedButtons
                value={tab}
                onValueChange={(v) => onTabChange(v as LoginTab)}
                buttons={[
                  { value: 'member', label: 'Member' },
                  { value: 'manager', label: 'Manager' },
                  { value: 'register', label: 'Register' },
                ]}
                style={{ marginBottom: spacing.lg }}
              />
            )}

            {tab === 'member' && registerStep === 'form' && (
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
                  onFocus={scrollFormIntoView}
                />
                <Text style={styles.hint}>No password needed — only the PAN registered by your manager works.</Text>
                <Button mode="contained" onPress={onMemberLogin} loading={loading} style={styles.btn} contentStyle={styles.btnContent}>
                  Open member portal
                </Button>
              </>
            )}

            {tab === 'manager' && registerStep === 'form' && (
              <>
                <TextInput
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  mode="outlined"
                  style={styles.input}
                  onFocus={scrollFormIntoView}
                />
                <TextInput
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  mode="outlined"
                  style={styles.input}
                  onFocus={scrollFormIntoView}
                />
                <Link href="/(auth)/forgot-password" style={styles.link}>Forgot password?</Link>
                {pendingVerifyEmail ? (
                  <>
                    <Button mode="text" loading={resendLoading} onPress={onResendFromLogin}>
                      Resend verification code
                    </Button>
                    <Button
                      mode="text"
                      onPress={() => {
                        setRegEmail(pendingVerifyEmail);
                        setTab('register');
                        setRegisterStep('otp');
                        setRegOtp('');
                      }}
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

            {tab === 'register' && registerStep === 'form' && (
              <>
                <TextInput label="Team name" value={tenantName} onChangeText={setTenantName} mode="outlined" style={styles.input} onFocus={scrollFormIntoView} />
                <TextInput label="Email" value={regEmail} onChangeText={setRegEmail} keyboardType="email-address" autoCapitalize="none" mode="outlined" style={styles.input} onFocus={scrollFormIntoView} />
                <TextInput label="Password" value={regPassword} onChangeText={setRegPassword} secureTextEntry mode="outlined" style={styles.input} onFocus={scrollFormIntoView} />
                <Text style={styles.hint}>
                  We will email a 6-digit OTP. After you verify it, a system administrator must approve your team before you can sign in.
                </Text>
                <Button mode="contained" onPress={onRegister} loading={loading} style={styles.btn} contentStyle={styles.btnContent}>
                  Send verification code
                </Button>
              </>
            )}

            {tab === 'register' && registerStep === 'otp' && (
              <>
                <Text style={styles.hint}>
                  Code sent to <Text style={styles.emailHighlight}>{regEmail.trim()}</Text>
                </Text>
                <TextInput
                  label="Email"
                  value={regEmail}
                  onChangeText={setRegEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  mode="outlined"
                  style={styles.input}
                  onFocus={scrollFormIntoView}
                />
                <TextInput
                  label="6-digit verification code"
                  value={regOtp}
                  onChangeText={setRegOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                  mode="outlined"
                  style={styles.input}
                  onFocus={scrollFormIntoView}
                />
                <Button mode="contained" onPress={onVerifyRegistrationOtp} loading={loading} style={styles.btn} contentStyle={styles.btnContent}>
                  Verify code
                </Button>
                <Button mode="text" loading={resendLoading} onPress={onResendRegistrationOtp} style={{ marginTop: 4 }}>
                  Resend code
                </Button>
                <Button mode="text" onPress={resetRegisterFlow}>
                  Back to registration
                </Button>
              </>
            )}

            {tab === 'register' && registerStep === 'done' && (
              <>
                <Text style={styles.successText}>
                  {verifyMessage ||
                    'Email verified. Your registration is waiting for system administrator approval. You can sign in once approved.'}
                </Text>
                <Button
                  mode="contained"
                  onPress={() => {
                    setEmail(regEmail.trim());
                    resetRegisterFlow();
                    setTab('manager');
                  }}
                  style={styles.btn}
                  contentStyle={styles.btnContent}
                >
                  Go to sign in
                </Button>
              </>
            )}
          </View>

          <Text style={styles.footer}>App developed by Lokendra</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.sider },
  flex: { flex: 1 },
  container: { flexGrow: 1 },
  hero: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
  },
  heroCompact: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
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
  heroTitleCompact: { fontSize: 22, lineHeight: 28 },
  heroSub: { color: '#94a3b8', marginTop: spacing.sm, lineHeight: 22, fontSize: 15, maxWidth: 320 },
  sheet: {
    flexGrow: 1,
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
  emailHighlight: { fontWeight: '700', color: colors.text },
  successText: { ...typography.caption, color: colors.text, marginBottom: spacing.lg, lineHeight: 22, fontSize: 15 },
  btn: { marginTop: spacing.sm, borderRadius: radii.md },
  btnContent: { paddingVertical: 6 },
  link: { color: colors.primary, marginBottom: spacing.sm, fontWeight: '600' },
  footer: {
    textAlign: 'center',
    color: '#64748b',
    fontSize: 12,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xl,
  },
});
