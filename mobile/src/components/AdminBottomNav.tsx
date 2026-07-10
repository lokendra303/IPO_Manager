import AppBottomNav, { type BottomNavTab } from './AppBottomNav';

const ADMIN_TABS: BottomNavTab[] = [
  {
    key: 'home',
    label: 'Home',
    icon: 'grid-outline',
    iconActive: 'grid',
    href: '/(admin)',
    match: (path) => path === '/(admin)' || path === '/(admin)/',
  },
  {
    key: 'teams',
    label: 'Teams',
    icon: 'people-outline',
    iconActive: 'people',
    href: '/(admin)/registrations',
    match: (path) => path.startsWith('/(admin)/registrations') || path.startsWith('/(admin)/tenants'),
  },
  {
    key: 'audit',
    label: 'Audit',
    icon: 'time-outline',
    iconActive: 'time',
    href: '/(admin)/audit-log',
    match: (path) => path.startsWith('/(admin)/audit-log'),
  },
  {
    key: 'profile',
    label: 'Profile',
    icon: 'person-outline',
    iconActive: 'person',
    href: '/(admin)/settings',
    match: (path) => path.startsWith('/(admin)/settings'),
  },
];

export { BOTTOM_NAV_HEIGHT as ADMIN_BOTTOM_NAV_HEIGHT } from './AppBottomNav';

export default function AdminBottomNav() {
  return <AppBottomNav tabs={ADMIN_TABS} />;
}
