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
    key: 'activity',
    label: 'Activity',
    icon: 'pulse-outline',
    iconActive: 'pulse',
    href: '/(member)/activity',
    match: (path) => path.startsWith('/(member)/activity'),
  },
  {
    key: 'allotment',
    label: 'Allotment',
    icon: 'open-outline',
    iconActive: 'open',
    href: '/(member)/allotment',
    match: (path) => path.startsWith('/(member)/allotment'),
  },
  {
    key: 'more',
    label: 'More',
    icon: 'ellipsis-horizontal-outline',
    iconActive: 'ellipsis-horizontal',
    href: '/(member)/more',
    match: (path) =>
      path.startsWith('/(member)/more') ||
      path.startsWith('/(member)/issues') ||
      path.startsWith('/(member)/profile') ||
      path.startsWith('/(member)/fund-return') ||
      path.startsWith('/(member)/statement') ||
      path.startsWith('/(member)/collections'),
  },
];

export { BOTTOM_NAV_HEIGHT } from './AppBottomNav';

export default function MemberBottomNav() {
  return <AppBottomNav tabs={MEMBER_TABS} />;
}
