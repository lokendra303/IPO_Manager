import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, SegmentedButtons, TextInput } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard from '../components/StatCard';
import StatGrid from '../components/StatGrid';
import Loading from '../components/Loading';
import Banner from '../components/Banner';
import Tag from '../components/Tag';
import { ui } from '../styles/ui';
import { formatCurrency } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import { colors } from '../theme';

function matchOk(diffOrFlag: boolean | number | undefined) {
  if (typeof diffOrFlag === 'boolean') return diffOrFlag;
  return Math.abs(Number(diffOrFlag) || 0) < 0.5;
}

function MetricRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'warning';
}) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text
        style={[
          styles.metricValue,
          tone === 'success' && { color: '#059669' },
          tone === 'warning' && { color: '#d97706' },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

export default function GroupLeaderWalletsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [txnType, setTxnType] = useState('SENT');
  const [txnAmount, setTxnAmount] = useState('');
  const [txnNotes, setTxnNotes] = useState('');
  const [txnGroupId, setTxnGroupId] = useState<number | null>(null);
  const [savingTxn, setSavingTxn] = useState(false);
  const [showTxnForm, setShowTxnForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, ovRes] = await Promise.all([
        client.get('/group-leader-wallets'),
        client.get('/group-leader-wallets/overview'),
      ]);
      setRows(listRes.data || []);
      setOverview(ovRes.data || null);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (groupId: number) => {
    setDetailLoading(true);
    try {
      const { data } = await client.get(`/group-leader-wallets/${groupId}`);
      setDetail(data);
      setShowTxnForm(false);
      setTxnGroupId(groupId);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setDetailLoading(false);
    }
  };

  const openCashForm = (groupId?: number) => {
    setTxnType('SENT');
    setTxnAmount('');
    setTxnNotes('');
    setTxnGroupId(groupId ?? detail?.groupId ?? null);
    setShowTxnForm(true);
  };

  const onAddTxn = async () => {
    const groupId = txnGroupId || detail?.groupId;
    if (!groupId) {
      Alert.alert('Warning', 'Select a leader first');
      return;
    }
    const amount = Number(txnAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Warning', 'Enter a valid amount');
      return;
    }
    setSavingTxn(true);
    try {
      const { data } = await client.post(`/group-leader-wallets/${groupId}/transactions`, {
        type: txnType,
        amount,
        notes: txnNotes || undefined,
      });
      if (detail && detail.groupId === groupId) {
        setDetail(data.detail);
      }
      setTxnAmount('');
      setTxnNotes('');
      setShowTxnForm(false);
      Alert.alert('Saved', 'Cash entry recorded');
      load();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setSavingTxn(false);
    }
  };

  const onDeleteTxn = (groupId: number, manualId: number) => {
    Alert.alert('Delete', 'Remove this cash entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { data } = await client.delete(
              `/group-leader-wallets/${groupId}/transactions/${manualId}`
            );
            if (detail && detail.groupId === groupId) setDetail(data);
            load();
          } catch (err) {
            Alert.alert('Error', getErrorMessage(err));
          }
        },
      },
    ]);
  };

  const cashForm = (
    <View style={{ marginBottom: 12, gap: 8 }}>
      {!detail && (
        <View style={{ gap: 6 }}>
          <Text style={ui.muted}>Leader / sub-group</Text>
          {(overview?.leaders || rows.filter((r) => r.hasOwner)).map((g: any) => (
            <Pressable
              key={g.groupId}
              style={[ui.accountOption, txnGroupId === g.groupId && ui.accountOptionActive]}
              onPress={() => setTxnGroupId(g.groupId)}
            >
              <Text style={styles.bold}>{g.leaderName}</Text>
              <Text style={ui.muted}>{g.groupName}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <SegmentedButtons
        value={txnType}
        onValueChange={setTxnType}
        buttons={[
          { value: 'SENT', label: 'Sent' },
          { value: 'RECEIVED', label: 'Received' },
          { value: 'ADJUSTMENT', label: 'Adj' },
        ]}
      />
      <TextInput
        label="Amount (e.g. 150000)"
        value={txnAmount}
        onChangeText={setTxnAmount}
        keyboardType="numeric"
        mode="outlined"
        dense
      />
      <TextInput
        label="Notes"
        value={txnNotes}
        onChangeText={setTxnNotes}
        mode="outlined"
        dense
      />
      <Text style={ui.muted}>Goes into that leader’s cash wallet only.</Text>
      <Button mode="contained" loading={savingTxn} onPress={onAddTxn}>
        Save cash entry
      </Button>
      <Button mode="text" onPress={() => setShowTxnForm(false)}>
        Cancel
      </Button>
    </View>
  );

  if (loading && !detail && !overview) return <Loading />;

  if (detail) {
    const ok = matchOk(detail.match?.ok ?? detail.matchOk);
    const cashPending = detail.cashWallet?.pending ?? detail.cashPending;
    const ipoPending = detail.match?.ipoPending ?? detail.ipoStillOut;
    return (
      <Screen>
        <PageHeader
          title={detail.leaderName}
          subtitle={`${detail.groupName} · own cash wallet`}
          right={
            <Button compact mode="text" onPress={() => { setDetail(null); load(); }}>
              Back
            </Button>
          }
        />

        {detailLoading ? <Loading /> : null}

        <ContentCard title="Cash wallet">
          <View style={styles.metricList}>
            <MetricRow label="Cash sent" value={formatCurrency(detail.cashWallet?.sent ?? detail.cashSent)} />
            <MetricRow
              label="Cash received"
              value={formatCurrency(detail.cashWallet?.received ?? detail.cashReceived)}
              tone="success"
            />
            <MetricRow label="Cash pending" value={formatCurrency(cashPending)} tone="warning" />
          </View>
          <Button mode="contained" style={{ marginTop: 8 }} onPress={() => openCashForm(detail.groupId)}>
            Add cash entry
          </Button>
          {showTxnForm && cashForm}
        </ContentCard>

        <ContentCard title="IPO with this leader">
          <View style={styles.metricList}>
            <MetricRow label="IPO given" value={formatCurrency(detail.ipoSent)} />
            <MetricRow label="IPO returned" value={formatCurrency(detail.ipoReturned)} tone="success" />
            <MetricRow label="IPO pending" value={formatCurrency(ipoPending)} tone="warning" />
          </View>
        </ContentCard>

        <ContentCard title="Match this wallet">
          <Banner variant={ok ? 'success' : 'warn'}>
            {ok
              ? 'Matched — cash pending = IPO pending'
              : `Gap ${formatCurrency(detail.match?.gap ?? detail.matchGap)} · cash ${formatCurrency(cashPending)} vs IPO ${formatCurrency(ipoPending)}`}
          </Banner>
        </ContentCard>

        <ContentCard title="IPO-wise">
          {(detail.ipoWise || []).length === 0 ? (
            <Text style={ui.muted}>No IPO funds paid to this leader yet</Text>
          ) : (
            detail.ipoWise.map((r: any) => (
              <Pressable
                key={r.ipoId}
                style={styles.ipoRow}
                onPress={() => router.push(`/(manager)/ipos/${r.ipoId}`)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.bold}>{r.ipoName}</Text>
                  <Text style={ui.muted}>
                    Given {formatCurrency(r.sent)} · Pending {formatCurrency(r.stillOut)}
                  </Text>
                </View>
                <Tag label={r.ipoStatus} />
              </Pressable>
            ))
          )}
        </ContentCard>

        <ContentCard title="Cash & activity">
          {(detail.activity || []).slice(0, 40).map((a: any) => (
            <View key={a.id} style={styles.actRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bold}>
                  {a.type} {a.source === 'ipo_bulk' ? '(IPO)' : a.source === 'manual' ? '(cash)' : ''}
                </Text>
                <Text style={ui.muted}>
                  {a.ipoName || '—'} · {a.notes || ''}
                </Text>
              </View>
              <Text style={styles.bold}>{formatCurrency(a.amount)}</Text>
              {a.source === 'manual' && a.manualId ? (
                <Button compact mode="text" textColor={colors.error} onPress={() => onDeleteTxn(detail.groupId, a.manualId)}>
                  Del
                </Button>
              ) : null}
            </View>
          ))}
        </ContentCard>
      </Screen>
    );
  }

  const cash = overview?.cashWallet;
  const provider = overview?.providerWallet;
  const leaderCards = overview?.leaderWallets?.length
    ? overview.leaderWallets
    : rows.filter((r) => r.hasOwner);

  return (
    <Screen>
      <PageHeader
        title="Leader wallets"
        subtitle="Each leader has their own cash wallet to match"
        right={
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Button compact mode="text" onPress={() => router.push('/(manager)/wallet')}>
              Provider
            </Button>
            <Button compact mode="text" onPress={() => router.push('/(manager)/member-groups')}>
              Groups
            </Button>
          </View>
        }
      />

      <StatGrid>
        <StatCard title="Provider balance" value={formatCurrency(provider?.balance)} variant="primary" />
        <StatCard title="All cash pending" value={formatCurrency(cash?.pending)} variant="warning" />
      </StatGrid>

      <Banner variant="info">
        Add cash SENT on each leader card. Match when that leader’s cash pending equals their IPO pending.
      </Banner>

      {showTxnForm && !detail ? (
        <ContentCard title="Add cash entry">{cashForm}</ContentCard>
      ) : (
        <Button mode="contained" style={{ marginBottom: 12 }} onPress={() => openCashForm()}>
          Add cash entry
        </Button>
      )}

      {leaderCards.map((leader: any) => {
        const ok = matchOk(leader.matchOk ?? leader.matchGap);
        return (
          <ContentCard
            key={leader.groupId}
            title={leader.leaderName}
            extra={
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <Button compact mode="contained" onPress={() => openCashForm(leader.groupId)}>
                  Cash
                </Button>
                <Button compact mode="outlined" onPress={() => openDetail(leader.groupId)}>
                  Open
                </Button>
              </View>
            }
          >
            <Text style={[ui.muted, { marginBottom: 8 }]}>
              {leader.groupName} · {leader.memberCount} members
            </Text>
            <View style={styles.metricList}>
              <MetricRow label="Cash sent" value={formatCurrency(leader.cashSent)} />
              <MetricRow label="Cash received" value={formatCurrency(leader.cashReceived)} tone="success" />
              <MetricRow label="Cash pending" value={formatCurrency(leader.cashPending)} tone="warning" />
              <MetricRow
                label="IPO pending"
                value={formatCurrency(leader.ipoPending ?? leader.ipoStillOut)}
              />
            </View>
            <Banner variant={ok ? 'success' : 'warn'}>
              {ok
                ? 'Matched'
                : `Gap ${formatCurrency(leader.matchGap)} · cash ${formatCurrency(leader.cashPending)} vs IPO ${formatCurrency(leader.ipoPending ?? leader.ipoStillOut)}`}
            </Banner>
          </ContentCard>
        );
      })}

      {!leaderCards.length && (
        <ContentCard>
          <Text style={ui.muted}>No leaders yet — set a sub-group owner first.</Text>
        </ContentCard>
      )}

      <ContentCard title={`Cash ledger (${(overview?.ledger || []).length})`}>
        {(overview?.ledger || []).length === 0 ? (
          <Text style={ui.muted}>No cash entries yet</Text>
        ) : (
          (overview?.ledger || []).slice(0, 40).map((a: any) => (
            <View key={a.id} style={styles.actRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bold}>
                  {a.type} · {a.leaderName || a.groupName}
                </Text>
                <Text style={ui.muted}>
                  {a.groupName} · {a.notes || ''}
                </Text>
              </View>
              <Text style={styles.bold}>{formatCurrency(a.amount)}</Text>
              <Button compact mode="text" textColor={colors.error} onPress={() => onDeleteTxn(a.groupId, a.id)}>
                Del
              </Button>
            </View>
          ))
        )}
      </ContentCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: '600' },
  metricList: { gap: 8, marginBottom: 8 },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#f8fafc',
  },
  metricLabel: { color: '#64748b', fontSize: 12, fontWeight: '600', flex: 1 },
  metricValue: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
  ipoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  actRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
