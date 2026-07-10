import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Button } from 'react-native-paper';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';

export default function VerifyEmailScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setMessage('Missing verification token.');
      setLoading(false);
      return;
    }
    client
      .get('/auth/verify-email', { params: { token } })
      .then((r) => setMessage(r.data.message || 'Email verified successfully.'))
      .catch((err) => setMessage(getErrorMessage(err, 'Verification failed')))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <Loading />;

  return (
    <Screen>
      <PageHeader title="Email verification" subtitle={message} />
      <Button mode="contained" onPress={() => router.replace('/(auth)/login')}>Go to sign in</Button>
    </Screen>
  );
}
