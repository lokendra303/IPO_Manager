import { Redirect } from 'expo-router';
import Loading from '../src/components/Loading';
import { useAuth } from '../src/context/AuthContext';
import { useAdminAuth } from '../src/context/AdminAuthContext';

export default function Index() {
  const { isAuthenticated, isMember, loading } = useAuth();
  const { isAdminAuthenticated, loading: adminLoading } = useAdminAuth();

  if (loading || adminLoading) return <Loading />;

  if (isAuthenticated) {
    if (isMember) return <Redirect href="/(member)/portal" />;
    return <Redirect href="/(manager)" />;
  }

  if (isAdminAuthenticated) return <Redirect href="/(admin)" />;

  return <Redirect href="/(auth)/login" />;
}
