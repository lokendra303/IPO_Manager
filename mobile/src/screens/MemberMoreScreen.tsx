import { router } from 'expo-router';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import ListRow from '../components/ListRow';

const LINKS = [
  { title: 'Report an issue', subtitle: 'Payment, profit, allotment', href: '/(member)/issues' },
  { title: 'Edit profile', subtitle: 'Email and UPI', href: '/(member)/profile' },
  { title: 'Report fund return', subtitle: 'Paid manager back', href: '/(member)/fund-return' },
  { title: 'Full ledger', subtitle: 'PDF and all IPOs', href: '/(member)/statement' },
  { title: 'Collect from members', subtitle: 'Sub-group leaders', href: '/(member)/collections' },
];

export default function MemberMoreScreen() {
  return (
    <Screen bottomNavInset>
      <PageHeader title="More" subtitle="Extra member tools" />
      <ContentCard title="Tools">
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
