import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
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
} from '../components/AuthControls';
import { useAdminAuth } from '../context/AdminAuthContext';
import { getAuthErrorModal } from '../utils/errors';
import {
  clearSavedCredentials,
  loadSavedCredentials,
  savePasswordCredentials,
} from '../utils/savedCredentials';
import { colors, spacing } from '../theme';

export default function AdminLoginScreen() {
  const { adminLogin, isAdminAuthenticated } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saveCreds, setSaveCreds] = useState(true);
  const [loading, setLoading] = useState(false);
  const [credsReady, setCredsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await loadSavedCredentials('admin');
        if (cancelled) return;
        if (saved?.email) {
          setEmail(saved.email);
          setPassword(saved.password);
          setSaveCreds(true);
        }
      } finally {
        if (!cancelled) setCredsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isAdminAuthenticated) {
    return <Redirect href="/(admin)" />;
  }

  if (!credsReady) return <Loading />;

  const onLogin = async () => {
    setLoading(true);
    try {
      const trimmedEmail = email.trim();
      await adminLogin(trimmedEmail, password);
      if (saveCreds) await savePasswordCredentials('admin', trimmedEmail, password);
      else await clearSavedCredentials('admin');
      router.replace('/(admin)');
    } catch (err) {
      const { title, content } = getAuthErrorModal(err, 'manager');
      Alert.alert(title, content);
    } finally {
      setLoading(false);
    }
  };

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
        <View style={styles.brandBlock}>
          <View style={styles.brandMark}>
            <Ionicons name="shield-checkmark" size={22} color="#fff" />
          </View>
          <Text style={styles.brand}>IPO Team</Text>
          <Text style={styles.brandTag}>System admin — approve teams and manage access.</Text>
        </View>

        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Admin sign in</Text>
          <Text style={styles.sheetSub}>Use your system administrator credentials.</Text>

          <AuthField
            label="Email"
            icon="mail-outline"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="admin@team.com"
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
            checked={saveCreds}
            onToggle={() => setSaveCreds((v) => !v)}
            label="Save email & password on this device"
          />
          <AuthPrimaryButton label="Sign in" onPress={onLogin} loading={loading} />
          <AuthLinkButton
            label="Forgot password?"
            onPress={() => router.push('/(admin-auth)/forgot-password')}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1220' },
  safe: { flex: 1, justifyContent: 'flex-end' },
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
});
