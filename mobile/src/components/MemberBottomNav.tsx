import AppBottomNav, { type BottomNavTab } from './AppBottomNav';

const MEMBER_TABS: BottomNavTab[] = [
  {
    key: 'home',
    label: 'Home',
    icon: 'grid-outline',
    iconActive: 'grid',
    href: '/(member)/portal',
    match: (path) => path === '/(member)/portal' || path === '/(member)' || path === '/(member)/',
  },
  {
    key: 'issues',
    label: 'Issues',
    icon: 'chatbox-ellipses-outline',
    iconActive: 'chatbox-ellipses',
    href: '/(member)/issues',
    match: (path) => path.startsWith('/(member)/issues'),
  },
  {
    key: 'allotment',
    label: 'Allotment',
    icon: 'open-outline',
    iconActive: 'open',
    href: '/(member)/allotment',
    match: (path) => path.startsWith('/(member)/allotment'),
  },
];

export { BOTTOM_NAV_HEIGHT } from './AppBottomNav';

export default function MemberBottomNav() {
  return <AppBottomNav tabs={MEMBER_TABS} />;
}
