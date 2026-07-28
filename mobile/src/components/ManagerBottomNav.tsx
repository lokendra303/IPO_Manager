import AppBottomNav, { type BottomNavTab } from './AppBottomNav';

const MANAGER_TABS: BottomNavTab[] = [
  {
    key: 'home',
    label: 'Home',
    icon: 'grid-outline',
    iconActive: 'grid',
    href: '/(manager)',
    match: (path) => path === '/(manager)' || path === '/(manager)/',
  },
  {
    key: 'ipos',
    label: 'IPOs',
    icon: 'trending-up-outline',
    iconActive: 'trending-up',
    href: '/(manager)/ipos',
    match: (path) => path.startsWith('/(manager)/ipos'),
  },
  {
    key: 'wallet',
    label: 'Wallet',
    icon: 'wallet-outline',
    iconActive: 'wallet',
    href: '/(manager)/wallet',
    match: (path) => path.startsWith('/(manager)/wallet'),
  },
  {
    key: 'audit',
    label: 'Audit',
    icon: 'time-outline',
    iconActive: 'time',
    href: '/(manager)/audit-log',
    match: (path) => path.startsWith('/(manager)/audit-log'),
  },
  {
    key: 'summary',
    label: 'Summary',
    icon: 'bar-chart-outline',
    iconActive: 'bar-chart',
    href: '/(manager)/summary',
    match: (path) =>
      path.startsWith('/(manager)/summary') ||
      path.startsWith('/(manager)/profit-sharing') ||
      path.startsWith('/(manager)/profit-analysis'),
  },
];

export { BOTTOM_NAV_HEIGHT } from './AppBottomNav';

export default function ManagerBottomNav() {
  return <AppBottomNav tabs={MANAGER_TABS} />;
}
