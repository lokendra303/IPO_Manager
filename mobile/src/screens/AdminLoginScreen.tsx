import { useState } from 'react';
import { Alert } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Button, TextInput } from 'react-native-paper';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import { useAdminAuth } from '../context/AdminAuthContext';
import { getAuthErrorModal } from '../utils/errors';

export default function AdminLoginScreen() {
  const { adminLogin, isAdminAuthenticated } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAdminAuthenticated) {
    return <Redirect href="/(admin)" />;
  }

  const onLogin = async () => {
    setLoading(true);
    try {
      await adminLogin(email.trim(), password);
      router.replace('/(admin)');
    } catch (err) {
      const { title, content } = getAuthErrorModal(err, 'manager');
      Alert.alert(title, content);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <PageHeader title="System Admin" subtitle="Sign in to manage manager registrations" />
      <TextInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" mode="outlined" style={{ marginBottom: 12 }} />
      <TextInput label="Password" value={password} onChangeText={setPassword} secureTextEntry mode="outlined" style={{ marginBottom: 12 }} />
      <Button mode="contained" loading={loading} onPress={onLogin}>Sign in</Button>
      <Button mode="text" onPress={() => router.push('/(admin-auth)/forgot-password')}>Forgot password?</Button>
    </Screen>
  );
}
