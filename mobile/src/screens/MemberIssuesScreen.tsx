import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { openActionSheet } from '../utils/actionSheet';
import { useQuery } from '../hooks/useQuery';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
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

  const openIssueMore = (issue: any) => {
    openActionSheet(
      `${issue.category || 'OTHER'} · ${issue.status}`,
      [],
      [
        formatDateTime(issue.created_at),
        issue.note,
        issue.resolution_note ? `Manager: ${issue.resolution_note}` : null,
      ].filter(Boolean).join('\n\n')
    );
  };

  const openHeaderMore = () => {
    openActionSheet('Issues', [{ text: 'Refresh', onPress: refresh }]);
  };

  if (loading && !issues.length) return <Loading />;

  const openCount = issues.filter((i) => i.status === 'OPEN').length;

  return (
    <Screen bottomNavInset>
      <PageHeader
        title="Issues"
        subtitle={openCount > 0 ? `${openCount} open` : 'Report and track'}
        extra={
          <Button compact mode="text" onPress={openHeaderMore}>
            More
          </Button>
        }
      />

      {error ? <Banner variant="warn">{error}</Banner> : null}

      <ContentCard title="Report an issue">
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
        <Button mode="contained" loading={submitting} onPress={submitIssue}>Submit</Button>
      </ContentCard>
      <ContentCard title={`Your issues (${issues.length})`}>
        {!issues.length ? (
          <ListRow title="No issues yet" subtitle="Use the form above" />
        ) : (
          issues.map((issue) => (
            <View key={issue.id} style={styles.compactRow}>
              <View style={styles.compactRowMain}>
                <ListRow
                  title={`${issue.category || 'OTHER'} · ${issue.status === 'OPEN' ? 'Open' : 'Resolved'}`}
                  subtitle={formatDateTime(issue.created_at)}
                  right={<Tag label={issue.status} color={issue.status === 'OPEN' ? '#d97706' : '#059669'} />}
                  onPress={() => openIssueMore(issue)}
                />
              </View>
              <Pressable hitSlop={12} onPress={() => openIssueMore(issue)} style={styles.moreBtn}>
                <Text style={styles.moreText}>···</Text>
              </Pressable>
            </View>
          ))
        )}
      </ContentCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  compactRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  compactRowMain: { flex: 1 },
  moreBtn: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 20, fontWeight: '700', color: colors.textMuted, letterSpacing: 1 },
});
