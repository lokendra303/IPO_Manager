import { router } from 'expo-router';
import { Text } from 'react-native';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import ListRow from '../components/ListRow';
import { ui } from '../styles/ui';

const LINKS = [
  { title: 'Report an issue', subtitle: 'Payment, profit, allotment problems', href: '/(member)/issues' },
  { title: 'Edit profile', subtitle: 'Update email and UPI ID', href: '/(member)/profile' },
  { title: 'Report fund return', subtitle: 'Tell manager you paid them back', href: '/(member)/fund-return' },
  { title: 'Full ledger', subtitle: 'PDF report, all IPOs, allotment & profit', href: '/(member)/statement' },
  { title: 'Collect from members', subtitle: 'Sub-group leaders — who still owes fund', href: '/(member)/collections' },
];

export default function MemberMoreScreen() {
  return (
    <Screen bottomNavInset>
      <PageHeader title="More" subtitle="Profile, issues, statements, and collections" />
      <ContentCard title="Member tools">
        <Text style={[ui.hint, { marginBottom: 12 }]}>Extra actions beyond your home dashboard.</Text>
        {LINKS.map((link) => (
          <ListRow
            key={link.href}
            title={link.title}
            subtitle={link.subtitle}
            onPress={() => router.push(link.href as any)}
          />
        ))}
      </ContentCard>
    </Screen>
  );
}
