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
import { Redirect, useLocalSearchParams, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Loading from '../components/Loading';
import {
  AuthField,
  AuthLinkButton,
  AuthPrimaryButton,
  AuthRemember,
  AuthRoleTabs,
} from '../components/AuthControls';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import { getAuthErrorModal, getErrorMessage } from '../utils/errors';
import {
  clearSavedCredentials,
  loadSavedCredentials,
  saveMemberCredentials,
  savePasswordCredentials,
} from '../utils/savedCredentials';
import { colors, radii, spacing } from '../theme';

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

type LoginTab = 'member' | 'manager' | 'register';
type RegisterStep = 'form' | 'otp' | 'done';

const TAB_COPY: Record<LoginTab, { title: string; subtitle: string }> = {
  member: {
    title: 'Member access',
    subtitle: 'Enter the PAN your manager registered for you.',
  },
  manager: {
    title: 'Manager sign in',
    subtitle: 'Use your team email and password.',
  },
  register: {
    title: 'Create a team',
    subtitle: 'Register a new fund manager account.',
  },
};

export default function LoginScreen() {
  const { login, memberLogin, register, isAuthenticated, user, loading: authLoading } = useAuth();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<LoginTab>('member');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState('');
  const [credsReady, setCredsReady] = useState(false);

  const [pan, setPan] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saveMemberCreds, setSaveMemberCreds] = useState(true);
  const [saveManagerCreds, setSaveManagerCreds] = useState(true);
  const [tenantName, setTenantName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [registerStep, setRegisterStep] = useState<RegisterStep>('form');
  const [regOtp, setRegOtp] = useState('');
  const [verifyMessage, setVerifyMessage] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [member, manager] = await Promise.all([
          loadSavedCredentials('member'),
          loadSavedCredentials('manager'),
        ]);
        if (cancelled) return;
        if (member?.pan) {
          setPan(member.pan);
          setSaveMemberCreds(true);
        }
        if (manager?.email) {
          setEmail(manager.email);
          setPassword(manager.password);
          setSaveManagerCreds(true);
          if (!member?.pan) setTab('manager');
        }
      } finally {
        if (!cancelled) setCredsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  useEffect(() => {
    if (tabParam === 'manager' || tabParam === 'register' || tabParam === 'member') {
      setTab(tabParam);
    }
  }, [tabParam]);

  if (authLoading || !credsReady) return <Loading />;
  if (isAuthenticated) {
    return <Redirect href={user?.role === 'member' ? '/(member)/portal' : '/(manager)'} />;
  }

  const copy =
    tab === 'register' && registerStep === 'otp'
      ? { title: 'Verify email', subtitle: 'Enter the 6-digit code we sent you.' }
      : tab === 'register' && registerStep === 'done'
        ? { title: 'Submitted', subtitle: 'Waiting for system admin approval.' }
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
      if (saveMemberCreds) await saveMemberCredentials(normalizedPan);
      else await clearSavedCredentials('member');
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
      const trimmedEmail = email.trim();
      await login(trimmedEmail, password);
      if (saveManagerCreds) await savePasswordCredentials('manager', trimmedEmail, password);
      else await clearSavedCredentials('manager');
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

  const keyboardOpen = keyboardInset > 0;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['#042f2e', '#0b1220', '#0f172a']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.orb, styles.orbOne]} />
      <View style={[styles.orb, styles.orbTwo]} />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[
              styles.scroll,
              { paddingBottom: Math.max(spacing.xl, keyboardInset) + spacing.md },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.brandBlock, keyboardOpen && styles.brandCompact]}>
              <View style={styles.brandMark}>
                <Ionicons name="trending-up" size={22} color="#fff" />
              </View>
              <Text style={styles.brand}>IPO Team</Text>
              {!keyboardOpen ? (
                <Text style={styles.brandTag}>
                  {tab === 'member'
                    ? 'Applications, allotment, and returns — in one place.'
                    : 'Wallet, members, and IPO profit — built for mobile.'}
                </Text>
              ) : null}
            </View>

            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>{copy.title}</Text>
              <Text style={styles.sheetSub}>{copy.subtitle}</Text>

              {registerStep === 'form' ? (
                <AuthRoleTabs
                  value={tab}
                  onChange={(v) => onTabChange(v as LoginTab)}
                  tabs={[
                    { value: 'member', label: 'Member', icon: 'person' },
                    { value: 'manager', label: 'Manager', icon: 'briefcase' },
                    { value: 'register', label: 'Register', icon: 'add-circle' },
                  ]}
                />
              ) : null}

              {tab === 'member' && registerStep === 'form' ? (
                <>
                  <AuthField
                    label="PAN number"
                    icon="card-outline"
                    value={pan}
                    onChangeText={(v) => setPan(v.toUpperCase())}
                    autoCapitalize="characters"
                    maxLength={10}
                    placeholder="ABCDE1234F"
                    textContentType="username"
                    autoComplete="username"
                  />
                  <AuthRemember
                    checked={saveMemberCreds}
                    onToggle={() => setSaveMemberCreds((v) => !v)}
                    label="Save PAN on this device"
                  />
                  <Text style={styles.hint}>No password — only your registered PAN works.</Text>
                  <AuthPrimaryButton label="Open portal" onPress={onMemberLogin} loading={loading} />
                </>
              ) : null}

              {tab === 'manager' && registerStep === 'form' ? (
                <>
                  <AuthField
                    label="Email"
                    icon="mail-outline"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholder="you@team.com"
                    textContentType="username"
                    autoComplete="email"
                  />
                  <AuthField
                    label="Password"
                    icon="lock-closed-outline"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    placeholder="••••••••"
                    textContentType="password"
                    autoComplete="password"
                  />
                  <AuthRemember
                    checked={saveManagerCreds}
                    onToggle={() => setSaveManagerCreds((v) => !v)}
                    label="Save email & password on this device"
                  />
                  <AuthLinkButton
                    label="Forgot password?"
                    onPress={() => router.push('/(auth)/forgot-password')}
                  />
                  {pendingVerifyEmail ? (
                    <>
                      <AuthLinkButton
                        label={resendLoading ? 'Sending…' : 'Resend verification code'}
                        onPress={onResendFromLogin}
                      />
                      <AuthLinkButton
                        label="Enter verification code"
                        onPress={() => {
                          setRegEmail(pendingVerifyEmail);
                          setTab('register');
                          setRegisterStep('otp');
                          setRegOtp('');
                        }}
                      />
                    </>
                  ) : null}
                  <AuthPrimaryButton label="Sign in" onPress={onLogin} loading={loading} />
                </>
              ) : null}

              {tab === 'register' && registerStep === 'form' ? (
                <>
                  <AuthField
                    label="Team name"
                    icon="people-outline"
                    value={tenantName}
                    onChangeText={setTenantName}
                    placeholder="Your team"
                  />
                  <AuthField
                    label="Email"
                    icon="mail-outline"
                    value={regEmail}
                    onChangeText={setRegEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholder="you@team.com"
                  />
                  <AuthField
                    label="Password"
                    icon="lock-closed-outline"
                    value={regPassword}
                    onChangeText={setRegPassword}
                    secureTextEntry
                    placeholder="At least 6 characters"
                  />
                  <Text style={styles.hint}>
                    We’ll email a 6-digit OTP. After verify, an admin must approve your team.
                  </Text>
                  <AuthPrimaryButton label="Send verification code" onPress={onRegister} loading={loading} />
                </>
              ) : null}

              {tab === 'register' && registerStep === 'otp' ? (
                <>
                  <Text style={styles.hint}>
                    Code sent to <Text style={styles.emailHighlight}>{regEmail.trim()}</Text>
                  </Text>
                  <AuthField
                    label="Email"
                    icon="mail-outline"
                    value={regEmail}
                    onChangeText={setRegEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <AuthField
                    label="6-digit code"
                    icon="key-outline"
                    value={regOtp}
                    onChangeText={setRegOtp}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="000000"
                  />
                  <AuthPrimaryButton label="Verify code" onPress={onVerifyRegistrationOtp} loading={loading} />
                  <AuthLinkButton
                    label={resendLoading ? 'Sending…' : 'Resend code'}
                    onPress={onResendRegistrationOtp}
                  />
                  <AuthLinkButton label="Back to registration" onPress={resetRegisterFlow} />
                </>
              ) : null}

              {tab === 'register' && registerStep === 'done' ? (
                <>
                  <View style={styles.successBox}>
                    <Ionicons name="checkmark-circle" size={28} color={colors.success} />
                    <Text style={styles.successText}>
                      {verifyMessage ||
                        'Email verified. Your registration is waiting for system administrator approval.'}
                    </Text>
                  </View>
                  <AuthPrimaryButton
                    label="Go to sign in"
                    onPress={() => {
                      setEmail(regEmail.trim());
                      resetRegisterFlow();
                      setTab('manager');
                    }}
                  />
                </>
              ) : null}
            </View>

            <Text style={styles.footer}>App developed by Lokendra</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1220' },
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'flex-end' },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.35,
  },
  orbOne: {
    width: 220,
    height: 220,
    backgroundColor: colors.primary,
    top: -40,
    right: -60,
  },
  orbTwo: {
    width: 160,
    height: 160,
    backgroundColor: '#134e4a',
    top: 120,
    left: -50,
  },
  brandBlock: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
  },
  brandCompact: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(13,148,136,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  brand: {
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.8,
  },
  brandTag: {
    marginTop: spacing.sm,
    color: '#94a3b8',
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 300,
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    minHeight: 420,
  },
  sheetTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.4,
  },
  sheetSub: {
    marginTop: 6,
    marginBottom: spacing.lg,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  hint: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  emailHighlight: { fontWeight: '700', color: colors.text },
  successBox: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.successLight,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'flex-start',
  },
  successText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    color: colors.text,
    fontWeight: '500',
  },
  footer: {
    textAlign: 'center',
    color: '#64748b',
    fontSize: 12,
    paddingVertical: spacing.lg,
  },
});
