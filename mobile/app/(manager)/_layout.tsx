import { useEffect, useState } from 'react';
import { Drawer } from 'expo-router/drawer';
import { Redirect, router, usePathname } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import client from '../../src/api/client';
import Loading from '../../src/components/Loading';
import ManagerBottomNav from '../../src/components/ManagerBottomNav';
import HeaderLogoutButton from '../../src/components/HeaderLogoutButton';
import HeaderUserTitle from '../../src/components/HeaderUserTitle';
import { useAuth } from '../../src/context/AuthContext';
import { colors, radii, spacing, typography } from '../../src/theme';

const MENU = [
  { href: '/(manager)' as const, label: 'Dashboard', icon: 'grid-outline' as const },
  { href: '/(manager)/notifications' as const, label: 'Notifications', icon: 'notifications-outline' as const, badgeKey: 'issues' as const },
  { href: '/(manager)/members' as const, label: 'Members', icon: 'people-outline' as const },
  { href: '/(manager)/member-groups' as const, label: 'Sub-Groups', icon: 'git-network-outline' as const },
  { href: '/(manager)/fund-providers' as const, label: 'Fund Providers', icon: 'business-outline' as const },
  { href: '/(manager)/wallet' as const, label: 'Wallet', icon: 'wallet-outline' as const },
  { href: '/(manager)/ipos' as const, label: 'IPOs', icon: 'trending-up-outline' as const },
  { href: '/(manager)/summary' as const, label: 'Summary', icon: 'bar-chart-outline' as const },
  { href: '/(manager)/profit-analysis' as const, label: 'Profit Analysis', icon: 'analytics-outline' as const },
  { href: '/(manager)/profit-sharing' as const, label: 'Profit Sharing', icon: 'pie-chart-outline' as const },
  { href: '/(manager)/audit-log' as const, label: 'Audit Log', icon: 'time-outline' as const },
  { href: '/(manager)/settings' as const, label: 'Settings', icon: 'settings-outline' as const },
];

function CustomDrawerContent({ navigation }: { navigation: { closeDrawer: () => void } }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [openIssueCount, setOpenIssueCount] = useState(0);

  useEffect(() => {
    client.get('/member-issues/count').then((r) => setOpenIssueCount(r.data.openCount ?? 0)).catch(() => setOpenIssueCount(0));
  }, []);

  return (
    <ScrollView style={styles.drawer} contentContainerStyle={styles.drawerContent}>
      <View style={styles.brandCard}>
        <View style={styles.logo}>
          <Ionicons name="trending-up" size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.brandTitle}>IPO Team</Text>
          <Text style={styles.brandSub}>Fund Manager</Text>
        </View>
      </View>

      <View style={styles.teamCard}>
        <Text style={styles.teamLabel}>Active team</Text>
        <Text style={styles.teamName} numberOfLines={2}>{user?.tenantName || 'My Team'}</Text>
      </View>

      <Text style={styles.menuHeading}>Menu</Text>

      {MENU.map((item) => {
        const active = pathname === item.href || (item.href !== '/(manager)' && pathname.startsWith(item.href));
        const badge = item.badgeKey === 'issues' && openIssueCount > 0 ? openIssueCount : 0;
        return (
          <Pressable
            key={item.href}
            style={[styles.item, active && styles.itemActive]}
            onPress={() => {
              router.push(item.href);
              navigation.closeDrawer();
            }}
          >
            <View style={[styles.itemIcon, active && styles.itemIconActive]}>
              <Ionicons name={item.icon} size={20} color={active ? '#fff' : '#94a3b8'} />
            </View>
            <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>{item.label}</Text>
            {badge > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}

    </ScrollView>
  );
}

function ManagerHeaderTitle() {
  const { user } = useAuth();
  return (
    <HeaderUserTitle
      title={user?.tenantName || 'My Team'}
      subtitle={user?.email || user?.displayName || 'Fund Manager'}
    />
  );
}

function ManagerHeaderRight() {
  const { logout } = useAuth();
  return (
    <HeaderLogoutButton
      onPress={async () => {
        await logout();
        router.replace('/(auth)/login?tab=manager');
      }}
    />
  );
}

export default function ManagerLayout() {
  const { isAuthenticated, isManager, loading } = useAuth();

  if (loading) return <Loading />;
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  if (!isManager) return <Redirect href="/(member)/portal" />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <Drawer
        drawerContent={(props) => <CustomDrawerContent navigation={props.navigation} />}
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.card,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          },
          headerTitleStyle: { ...typography.section, fontSize: 17, color: colors.text },
          headerTintColor: colors.primary,
          headerTitle: () => <ManagerHeaderTitle />,
          headerRight: () => <ManagerHeaderRight />,
          drawerStyle: { backgroundColor: colors.sider, width: 300 },
          drawerActiveTintColor: colors.primary,
          drawerInactiveTintColor: colors.textMuted,
        }}
      >
        <Drawer.Screen name="index" />
        <Drawer.Screen name="notifications" />
        <Drawer.Screen name="members" />
        <Drawer.Screen name="member-groups" />
        <Drawer.Screen name="fund-providers" />
        <Drawer.Screen name="wallet" />
        <Drawer.Screen name="ipos/index" />
        <Drawer.Screen name="ipos/[id]" options={{ drawerItemStyle: { display: 'none' } }} />
        <Drawer.Screen name="summary" />
        <Drawer.Screen name="profit-analysis" />
        <Drawer.Screen name="profit-sharing" />
        <Drawer.Screen name="audit-log" />
        <Drawer.Screen name="settings" />
        </Drawer>
      </View>
      <ManagerBottomNav />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  drawer: { flex: 1, backgroundColor: colors.sider },
  drawerContent: { paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  brandCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.siderElevated,
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: { color: '#f8fafc', fontWeight: '800', fontSize: 18, letterSpacing: -0.3 },
  brandSub: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  teamCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: 'rgba(13, 148, 136, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.25)',
  },
  teamLabel: { color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '600' },
  teamName: { color: '#e2e8f0', fontSize: 15, fontWeight: '600', marginTop: 4 },
  menuHeading: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radii.md,
  },
  itemActive: { backgroundColor: 'rgba(13, 148, 136, 0.22)' },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
  },
  itemIconActive: { backgroundColor: colors.primary },
  itemLabel: { color: '#94a3b8', fontSize: 15, fontWeight: '500', flex: 1 },
  itemLabelActive: { color: '#f8fafc', fontWeight: '700' },
  badge: {
    backgroundColor: colors.error,
    borderRadius: radii.pill,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
