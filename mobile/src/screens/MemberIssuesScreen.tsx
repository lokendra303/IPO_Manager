import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import Loading from '../components/Loading';
import ListRow from '../components/ListRow';
import Banner from '../components/Banner';
import Tag from '../components/Tag';
import { formatDateTime } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import { useQuery } from '../hooks/useQuery';
import { useAuth } from '../context/AuthContext';
import { ui } from '../styles/ui';

const CATEGORIES = [
  { value: 'PAYMENT', label: 'Payment' },
  { value: 'PROFIT', label: 'Profit' },
  { value: 'ALLOTMENT', label: 'Allotment' },
  { value: 'FUND_RETURN', label: 'Fund return' },
  { value: 'OTHER', label: 'Other' },
];

export default function MemberIssuesScreen() {
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('OTHER');
  const [submitting, setSubmitting] = useState(false);

  const { user, isMember } = useAuth();

  const fetcher = useCallback(async () => {
    const { data } = await client.get('/member-portal/issues');
    return data as any[];
  }, []);

  const { data, loading, error, refresh, reload } = useQuery(fetcher, [], {
    enabled: isMember && !!user?.id,
  });
  const issues = data ?? [];

  const submitIssue = async () => {
    if (!note.trim()) {
      Alert.alert('Required', 'Please describe your issue before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      await client.post('/member-portal/issues', { note: note.trim(), category });
      setNote('');
      await reload();
      Alert.alert('Submitted', 'Your issue has been sent to your manager.');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not submit'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !issues.length) return <Loading />;

  const openCount = issues.filter((i) => i.status === 'OPEN').length;

  return (
    <Screen bottomNavInset>
      <PageHeader
        title="Issues"
        subtitle={openCount > 0 ? `${openCount} open issue${openCount === 1 ? '' : 's'}` : 'Report problems and track manager responses'}
        extra={<Button compact mode="outlined" onPress={refresh}>Refresh</Button>}
      />

      {error ? <Banner variant="warn">{error}</Banner> : null}

      <ContentCard title="Report an issue">
        <Text style={ui.hint}>Choose a category and describe the problem for your manager.</Text>
        <View style={ui.chipRow}>
          {CATEGORIES.map((c) => (
            <Button
              key={c.value}
              compact
              mode={category === c.value ? 'contained' : 'outlined'}
              onPress={() => setCategory(c.value)}
              style={{ marginBottom: 6 }}
            >
              {c.label}
            </Button>
          ))}
        </View>
        <TextInput label="Describe your issue" value={note} onChangeText={setNote} multiline mode="outlined" style={ui.input} />
        <Button mode="contained" loading={submitting} onPress={submitIssue}>Submit to manager</Button>
      </ContentCard>
      <ContentCard title={`Your issues (${issues.length})`}>
        {!issues.length ? (
          <ListRow title="No issues yet" subtitle="Use the form above if something needs attention" />
        ) : (
          issues.map((issue) => (
            <ListRow
              key={issue.id}
              title={`${issue.category || 'OTHER'} · ${issue.status === 'OPEN' ? 'Open' : 'Resolved'}`}
              subtitle={`${formatDateTime(issue.created_at)}\n${issue.note}${issue.resolution_note ? `\nManager: ${issue.resolution_note}` : ''}`}
              right={<Tag label={issue.status} color={issue.status === 'OPEN' ? '#d97706' : '#059669'} />}
            />
          ))
        )}
      </ContentCard>
    </Screen>
  );
}
