import { useEffect, useState } from 'react';
import { Drawer } from 'expo-router/drawer';
import { Redirect, router, usePathname } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import adminClient from '../../src/api/adminClient';
import AdminBottomNav from '../../src/components/AdminBottomNav';
import Loading from '../../src/components/Loading';
import HeaderLogoutButton from '../../src/components/HeaderLogoutButton';
import HeaderUserTitle from '../../src/components/HeaderUserTitle';
import { useAdminAuth } from '../../src/context/AdminAuthContext';
import { colors, radii, spacing, typography } from '../../src/theme';

const MENU = [
  { href: '/(admin)' as const, label: 'Dashboard', icon: 'grid-outline' as const },
  { href: '/(admin)/registrations' as const, label: 'Manager Accounts', icon: 'people-outline' as const, badgeKey: 'pending' as const },
  { href: '/(admin)/audit-log' as const, label: 'Audit Log', icon: 'time-outline' as const },
  { href: '/(admin)/settings' as const, label: 'Profile', icon: 'settings-outline' as const },
];

function CustomDrawerContent({ navigation }: { navigation: { closeDrawer: () => void } }) {
  const pathname = usePathname();
  const { admin } = useAdminAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    adminClient
      .get('/admin/dashboard')
      .then((r) => setPendingCount(Number(r.data?.tenants?.pendingCount ?? 0)))
      .catch(() => setPendingCount(0));
  }, []);

  return (
    <ScrollView style={styles.drawer} contentContainerStyle={styles.drawerContent}>
      <View style={styles.brandCard}>
        <View style={styles.logo}>
          <Ionicons name="shield-checkmark" size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.brandTitle}>System Admin</Text>
          <Text style={styles.brandSub}>IPO Manager</Text>
        </View>
      </View>

      <View style={styles.adminCard}>
        <Text style={styles.adminLabel}>Signed in as</Text>
        <Text style={styles.adminEmail} numberOfLines={2}>{admin?.email || 'Administrator'}</Text>
      </View>

      <Text style={styles.menuHeading}>Menu</Text>

      {MENU.map((item) => {
        const active = pathname === item.href || (item.href !== '/(admin)' && pathname.startsWith(item.href));
        const badge = item.badgeKey === 'pending' && pendingCount > 0 ? pendingCount : 0;
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

function AdminHeaderTitle() {
  const { admin } = useAdminAuth();
  return (
    <HeaderUserTitle
      title="System Admin"
      subtitle={admin?.email || 'IPO Manager'}
    />
  );
}

function AdminHeaderRight() {
  const { adminLogout } = useAdminAuth();
  return (
    <HeaderLogoutButton
      onPress={async () => {
        await adminLogout();
        router.replace('/(admin-auth)/login');
      }}
    />
  );
}

export default function AdminLayout() {
  const { isAdminAuthenticated, loading } = useAdminAuth();

  if (loading) return <Loading />;
  if (!isAdminAuthenticated) return <Redirect href="/(admin-auth)/login" />;

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
            headerTitle: () => <AdminHeaderTitle />,
            headerRight: () => <AdminHeaderRight />,
            drawerStyle: { backgroundColor: colors.sider, width: 300 },
            drawerActiveTintColor: colors.primary,
            drawerInactiveTintColor: colors.textMuted,
          }}
        >
          <Drawer.Screen name="index" />
          <Drawer.Screen name="registrations" />
          <Drawer.Screen name="audit-log" />
          <Drawer.Screen name="tenants/[id]" options={{ drawerItemStyle: { display: 'none' } }} />
          <Drawer.Screen name="settings" />
        </Drawer>
      </View>
      <AdminBottomNav />
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
  adminCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: 'rgba(13, 148, 136, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.25)',
  },
  adminLabel: { color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '600' },
  adminEmail: { color: '#e2e8f0', fontSize: 14, fontWeight: '600', marginTop: 4 },
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
