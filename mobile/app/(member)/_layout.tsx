import { View, StyleSheet } from 'react-native';
import { Redirect, Stack, router } from 'expo-router';
import HeaderLogoutButton from '../../src/components/HeaderLogoutButton';
import HeaderUserTitle from '../../src/components/HeaderUserTitle';
import MemberBottomNav from '../../src/components/MemberBottomNav';
import Loading from '../../src/components/Loading';
import { useAuth } from '../../src/context/AuthContext';
import { colors, typography } from '../../src/theme';
import { formatPan } from '../../src/utils/format';

function MemberHeaderTitle() {
  const { user } = useAuth();
  const subtitle = user?.displayName || (user?.pan ? formatPan(user.pan) : user?.email);
  return (
    <HeaderUserTitle
      title={user?.tenantName || 'Member Portal'}
      subtitle={subtitle || 'Signed in'}
    />
  );
}

function MemberHeaderRight() {
  const { logout } = useAuth();
  return (
    <HeaderLogoutButton
      onPress={async () => {
        await logout();
        router.replace('/(auth)/login?tab=member');
      }}
    />
  );
}

export default function MemberLayout() {
  const { isAuthenticated, isMember, loading } = useAuth();

  if (loading) return <Loading />;
  if (!isAuthenticated) return <Redirect href="/(auth)/login?tab=member" />;
  if (!isMember) return <Redirect href="/(manager)" />;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerShown: true,
            headerBackVisible: false,
            headerStyle: {
              backgroundColor: colors.card,
              ...memberHeaderStyle.header,
            },
            headerTitleStyle: { ...typography.section, fontSize: 17, color: colors.text },
            headerTintColor: colors.primary,
            headerTitle: () => <MemberHeaderTitle />,
            headerRight: () => <MemberHeaderRight />,
          }}
        >
          <Stack.Screen name="portal" />
          <Stack.Screen name="activity" />
          <Stack.Screen name="allotment" />
          <Stack.Screen name="more" />
          <Stack.Screen name="issues" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="fund-return" />
          <Stack.Screen name="statement" />
          <Stack.Screen name="collections" />
          <Stack.Screen name="ipo/[ipoId]" options={{ headerShown: true, title: 'IPO detail' }} />
        </Stack>
      </View>
      <MemberBottomNav />
    </View>
  );
}

const memberHeaderStyle = StyleSheet.create({
  header: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
