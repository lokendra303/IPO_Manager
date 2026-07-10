import { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, SegmentedButtons, TextInput } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard from '../components/StatCard';
import Loading from '../components/Loading';
import ListRow from '../components/ListRow';
import Tag from '../components/Tag';
import Banner from '../components/Banner';
import { amountToWordsInr, formatCurrency, formatDateTime } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import { ui } from '../styles/ui';
import { useQuery } from '../hooks/useQuery';

type FundProvidersCache = {
  providers: any[];
  bankAccounts: any[];
};

type TxnType = 'receive' | 'send' | 'share';
type CreditMode = 'single' | 'split';

function txnTypeTitle(type: TxnType, name?: string) {
  if (type === 'share') return `P&L share — ${name}`;
  if (type === 'send') return `Send / repay — ${name}`;
  return `Receive funds — ${name}`;
}

function isAutoPnLEntry(txn: any) {
  const label = txn.account_label || '';
  return label === 'P&L Share' || label === 'P&L Share (Loss)';
}

function todayIso() {
  return new Date().toISOString();
}

export default function FundProvidersScreen() {
  const [saving, setSaving] = useState(false);
  const [rollingBackId, setRollingBackId] = useState<number | null>(null);

  const [providerModal, setProviderModal] = useState(false);
  const [providerName, setProviderName] = useState('');

  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txnsLoading, setTxnsLoading] = useState(false);

  const [txnModal, setTxnModal] = useState(false);
  const [editTxnModal, setEditTxnModal] = useState(false);
  const [editingTxn, setEditingTxn] = useState<any>(null);

  const [txnType, setTxnType] = useState<TxnType>('receive');
  const [creditToWallet, setCreditToWallet] = useState(true);
  const [creditMode, setCreditMode] = useState<CreditMode>('single');
  const [txnForm, setTxnForm] = useState<any>({});
  const [creditSplits, setCreditSplits] = useState<Record<number, string>>({});
  const [editForm, setEditForm] = useState<any>({});

  const fetcher = useCallback(async (): Promise<FundProvidersCache> => {
    const [p, a] = await Promise.all([client.get('/fund-providers'), client.get('/bank-accounts')]);
    return { providers: p.data, bankAccounts: a.data.accounts || [] };
  }, []);
  const { data, loading, refresh } = useQuery(fetcher);
  const providers = data?.providers ?? [];
  const bankAccounts = data?.bankAccounts ?? [];

  const loadProviders = () => refresh();
  const loadAccounts = () => refresh();

  const totalLedger = useMemo(
    () => providers.reduce((s, p) => s + Number(p.ledgerBalance || 0), 0),
    [providers]
  );

  const activeAccounts = bankAccounts.filter((a) => a.is_active);

  const openLedger = async (provider: any) => {
    setSelected(provider);
    setLedgerOpen(true);
    setTxnsLoading(true);
    try {
      const { data } = await client.get(`/fund-providers/${provider.id}/transactions`);
      setTransactions(data);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Could not load ledger'));
      setTransactions([]);
    } finally {
      setTxnsLoading(false);
    }
  };

  const refreshLedger = async (provider = selected) => {
    if (!provider) return;
    const { data } = await client.get(`/fund-providers/${provider.id}/transactions`);
    setTransactions(data);
    const { data: refreshed } = await client.get('/fund-providers');
    await refresh();
    const updated = refreshed.find((p: any) => p.id === provider.id);
    if (updated) setSelected(updated);
  };

  const closeLedger = () => {
    setLedgerOpen(false);
    setSelected(null);
    setTransactions([]);
  };

  const openTxnModal = (type: TxnType = 'receive') => {
    setTxnType(type);
    setCreditToWallet(type !== 'share');
    setCreditMode('single');
    setCreditSplits({});
    setTxnForm({
      amount: '',
      txnDate: todayIso(),
      notes: '',
      bankAccountId: activeAccounts.length === 1 ? activeAccounts[0].id : undefined,
      providerProfit: '',
    });
    setTxnModal(true);
  };

  const closeTxnModal = () => {
    setTxnModal(false);
    setTxnType('receive');
  };

  const onSaveProvider = async () => {
    if (!providerName.trim()) {
      Alert.alert('Error', 'Provider name is required');
      return;
    }
    setSaving(true);
    try {
      await client.post('/fund-providers', { name: providerName.trim() });
      setProviderModal(false);
      setProviderName('');
      loadProviders();
      Alert.alert('Success', 'Fund provider added');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Failed'));
    } finally {
      setSaving(false);
    }
  };

  const onSaveTxn = async () => {
    if (!selected || saving) return;

    const entered = Number(txnForm.amount);
    if (!txnForm.amount || Number.isNaN(entered) || entered <= 0) {
      Alert.alert('Error', 'Enter an amount greater than zero');
      return;
    }

    const isShareOnly = txnType === 'share';
    const isSend = txnType === 'send';
    const amount = isShareOnly ? entered : isSend ? -entered : entered;
    const absAmount = entered;

    const splitEntries = Object.entries(creditSplits)
      .map(([bankAccountId, amt]) => ({ bankAccountId: Number(bankAccountId), amount: Number(amt) || 0 }))
      .filter((e) => e.amount > 0);
    const splitTotal = splitEntries.reduce((s, e) => s + e.amount, 0);

    if (!isShareOnly && creditToWallet && creditMode === 'split') {
      if (!splitEntries.length) {
        Alert.alert('Error', 'Enter how much went to each bank account');
        return;
      }
      if (Math.abs(splitTotal - absAmount) > 0.001) {
        Alert.alert('Error', `Split total (${formatCurrency(splitTotal)}) must equal ${formatCurrency(absAmount)}`);
        return;
      }
    }

    if (!isShareOnly && creditToWallet && creditMode === 'single' && activeAccounts.length > 1 && !txnForm.bankAccountId) {
      Alert.alert(
        'Error',
        isSend ? 'Select which bank account paid the funds' : 'Select which bank account received the funds'
      );
      return;
    }

    if (!isShareOnly && creditToWallet && activeAccounts.length === 0) {
      Alert.alert('Error', 'Add a bank account under Wallet first');
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        amount,
        txnDate: txnForm.txnDate || todayIso(),
        notes: txnForm.notes?.trim() || undefined,
        providerProfit: isShareOnly
          ? (txnForm.providerProfit !== '' && txnForm.providerProfit != null ? Number(txnForm.providerProfit) : entered)
          : (txnForm.providerProfit !== '' && txnForm.providerProfit != null ? Number(txnForm.providerProfit) : undefined),
        creditToWallet: isShareOnly ? false : creditToWallet,
      };

      if (!isShareOnly && creditToWallet) {
        if (creditMode === 'split' && splitEntries.length) {
          if (isSend) body.accountDebits = splitEntries;
          else body.accountCredits = splitEntries;
        } else if (txnForm.bankAccountId) {
          body.bankAccountId = Number(txnForm.bankAccountId);
        }
      }

      await client.post(`/fund-providers/${selected.id}/transactions`, body);
      closeTxnModal();
      loadProviders();
      loadAccounts();
      await refreshLedger();
      Alert.alert(
        'Success',
        isShareOnly
          ? `P&L share recorded — ${formatCurrency(entered)}`
          : isSend
            ? `Repayment recorded — ${formatCurrency(entered)}`
            : `Funds received — ${formatCurrency(entered)}`
      );
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Failed to record transaction'));
    } finally {
      setSaving(false);
    }
  };

  const openEditTxn = (txn: any) => {
    const signed = Number(txn.amount);
    setEditingTxn(txn);
    setEditForm({
      amount: String(Math.abs(signed)),
      isSend: signed < 0,
      txnDate: txn.txn_date,
      notes: txn.notes || '',
      providerProfit: txn.provider_profit != null ? String(txn.provider_profit) : '',
    });
    setEditTxnModal(true);
  };

  const onSaveTxnEdit = async () => {
    if (!editingTxn || !selected || saving) return;
    const entered = Number(editForm.amount);
    if (!editForm.amount || Number.isNaN(entered) || entered <= 0) {
      Alert.alert('Error', 'Enter an amount greater than zero');
      return;
    }
    const signed = editForm.isSend ? -entered : entered;
    setSaving(true);
    try {
      await client.patch(`/fund-providers/${selected.id}/transactions/${editingTxn.id}`, {
        amount: signed,
        txnDate: editForm.txnDate || editingTxn.txn_date,
        notes: editForm.notes,
        providerProfit: editForm.providerProfit !== '' ? Number(editForm.providerProfit) : null,
      });
      setEditTxnModal(false);
      setEditingTxn(null);
      loadProviders();
      loadAccounts();
      await refreshLedger();
      Alert.alert('Success', 'Transaction updated — wallet balance synced');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Failed to update transaction'));
    } finally {
      setSaving(false);
    }
  };

  const onRollbackTxn = async (txn: any) => {
    if (!selected || rollingBackId) return;
    setRollingBackId(txn.id);
    try {
      const { data } = await client.delete(`/fund-providers/${selected.id}/transactions/${txn.id}`);
      loadProviders();
      loadAccounts();
      await refreshLedger();
      Alert.alert(
        'Rolled back',
        `${formatCurrency(data.amount)} removed from provider ledger${txn.account_label ? ' and wallet adjusted' : ''}`
      );
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Failed to roll back'));
    } finally {
      setRollingBackId(null);
    }
  };

  const absTxnAmount = Math.abs(Number(txnForm.amount) || 0);
  const splitTotal = Object.values(creditSplits).reduce((s, v) => s + (Number(v) || 0), 0);

  if (loading && !providers.length) return <Loading />;

  return (
    <Screen>
      <PageHeader
        title="Fund Providers"
        subtitle="Receive or send funds separately — no need to type minus for repayments"
        extra={<Button mode="contained" onPress={() => { setProviderName(''); setProviderModal(true); }}>Add provider</Button>}
      />

      <View style={ui.statRow}>
        <StatCard title="Providers" value={providers.length} variant="info" />
        <StatCard title="Combined ledger" value={formatCurrency(totalLedger)} variant="primary" />
      </View>

      <ContentCard title="All fund providers">
        {providers.length === 0 ? (
          <Text style={ui.muted}>No fund providers yet</Text>
        ) : (
          providers.map((p) => (
            <View key={p.id} style={ui.card}>
              <ListRow
                title={p.name}
                subtitle={`Ledger ${formatCurrency(p.ledgerBalance ?? 0)}${p.totalProfit ? ` · Profit ${formatCurrency(p.totalProfit)}` : ''}`}
                onPress={() => openLedger(p)}
              />
              <View style={ui.rowActions}>
                <Button compact onPress={() => openLedger(p)}>Ledger</Button>
                <Button compact mode="contained" onPress={() => { setSelected(p); openTxnModal('receive'); }}>
                  Receive
                </Button>
                <Button compact mode="outlined" textColor="#dc2626" onPress={() => { setSelected(p); openTxnModal('send'); }}>
                  Send
                </Button>
              </View>
            </View>
          ))
        )}
      </ContentCard>

      {/* Add provider */}
      <Modal visible={providerModal} animationType="slide" onRequestClose={() => setProviderModal(false)}>
        <SafeAreaView style={ui.modal}>
          <View style={ui.modalHeader}>
            <Text style={ui.modalTitle}>Add fund provider</Text>
            <Button mode="text" onPress={() => setProviderModal(false)}>Cancel</Button>
          </View>
          <View style={ui.modalBody}>
            <TextInput label="Name" value={providerName} onChangeText={setProviderName} mode="outlined" style={ui.input} />
            <Button mode="contained" loading={saving} onPress={onSaveProvider}>Save</Button>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Ledger */}
      <Modal visible={ledgerOpen} animationType="slide" onRequestClose={closeLedger}>
        <SafeAreaView style={ui.modal}>
          <View style={ui.modalHeader}>
            <Text style={ui.modalTitle}>{selected?.name}</Text>
            <Button mode="text" onPress={closeLedger}>Close</Button>
          </View>
          <ScrollView contentContainerStyle={ui.modalBody}>
            <StatCard title="Ledger balance" value={formatCurrency(selected?.ledgerBalance ?? 0)} variant="primary" />
            {selected?.totalProfit ? (
              <Text style={styles.profitLine}>Total profit: {formatCurrency(selected.totalProfit)}</Text>
            ) : null}

            <View style={styles.ledgerActions}>
              <Button mode="contained" onPress={() => openTxnModal('receive')}>Receive funds</Button>
              <Button mode="outlined" textColor="#dc2626" onPress={() => openTxnModal('send')}>Send / repay</Button>
              <Button mode="outlined" onPress={() => openTxnModal('share')}>P&L share</Button>
            </View>

            <ContentCard title="Transactions">
              {txnsLoading ? (
                <Loading fullScreen={false} />
              ) : transactions.length === 0 ? (
                <Text style={ui.muted}>No transactions yet</Text>
              ) : (
                transactions.map((t) => {
                  const autoPnL = isAutoPnLEntry(t);
                  return (
                    <View key={t.id} style={styles.txnRow}>
                      <ListRow
                        title={formatCurrency(t.amount)}
                        subtitle={`${formatDateTime(t.txn_date)}${t.account_label ? `\n${t.account_label}` : ''}${t.notes ? `\n${t.notes}` : ''}`}
                        right={
                          <Tag
                            label={Number(t.amount) >= 0 ? 'Received' : 'Sent'}
                            color={Number(t.amount) >= 0 ? '#059669' : '#dc2626'}
                          />
                        }
                      />
                      <Text style={styles.words}>{amountToWordsInr(t.amount)}</Text>
                      {t.provider_profit != null && (
                        <Text style={styles.profitLine}>Profit: {formatCurrency(t.provider_profit)}</Text>
                      )}
                      <View style={ui.rowActions}>
                        <Button compact onPress={() => openEditTxn(t)}>Edit</Button>
                        {!autoPnL && (
                          <Button
                            compact
                            textColor="#dc2626"
                            loading={rollingBackId === t.id}
                            onPress={() =>
                              Alert.alert(
                                'Roll back this entry?',
                                'Removes it from the provider ledger and reverses any wallet change.',
                                [
                                  { text: 'Cancel' },
                                  { text: 'Roll back', style: 'destructive', onPress: () => onRollbackTxn(t) },
                                ]
                              )
                            }
                          >
                            Roll back
                          </Button>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </ContentCard>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Add transaction */}
      <Modal visible={txnModal} animationType="slide" onRequestClose={closeTxnModal}>
        <SafeAreaView style={ui.modal}>
          <View style={ui.modalHeader}>
            <Text style={ui.modalTitle}>{txnTypeTitle(txnType, selected?.name)}</Text>
            <Button mode="text" onPress={closeTxnModal}>Cancel</Button>
          </View>
          <ScrollView contentContainerStyle={ui.modalBody} keyboardShouldPersistTaps="handled">
            {txnType === 'receive' && (
              <Banner variant="success">Money received from provider — credited to your wallet</Banner>
            )}
            {txnType === 'send' && (
              <Banner variant="warn">Money sent / repaid to provider — debited from your wallet</Banner>
            )}
            {txnType === 'share' && (
              <Text style={ui.hint}>Provider ledger only — wallet bank accounts are not used for P&L share entries.</Text>
            )}

            <TextInput
              label={
                txnType === 'share'
                  ? 'Share amount'
                  : txnType === 'send'
                    ? 'Amount sent / repaid (₹)'
                    : 'Amount received (₹)'
              }
              value={String(txnForm.amount ?? '')}
              onChangeText={(v) => setTxnForm({ ...txnForm, amount: v.replace(/-/g, '') })}
              keyboardType="numeric"
              mode="outlined"
              style={ui.input}
              placeholder="Enter positive amount only"
            />
            {txnForm.amount ? <Text style={styles.words}>{amountToWordsInr(txnForm.amount)}</Text> : null}

            <TextInput
              label="Date (ISO or leave default)"
              value={txnForm.txnDate ? String(txnForm.txnDate).slice(0, 19) : ''}
              onChangeText={(v) => setTxnForm({ ...txnForm, txnDate: v })}
              mode="outlined"
              style={ui.input}
              placeholder={todayIso().slice(0, 19)}
            />

            {txnType !== 'share' && activeAccounts.length > 0 && (
              <>
                <Text style={ui.sectionLabel}>
                  {txnType === 'send' ? 'Which account paid the funds?' : 'Which account received the funds?'}
                </Text>
                <SegmentedButtons
                  value={creditMode}
                  onValueChange={(v) => setCreditMode(v as CreditMode)}
                  buttons={[
                    { value: 'single', label: 'One account' },
                    { value: 'split', label: 'Split' },
                  ]}
                  style={{ marginBottom: 12 }}
                />

                {creditMode === 'single' ? (
                  activeAccounts.map((a) => (
                    <Pressable
                      key={a.id}
                      style={[ui.accountOption, txnForm.bankAccountId === a.id && ui.accountOptionActive]}
                      onPress={() => setTxnForm({ ...txnForm, bankAccountId: a.id })}
                    >
                      <Text>{a.label}{a.bank_name ? ` (${a.bank_name})` : ''} — {formatCurrency(a.balance)}</Text>
                    </Pressable>
                  ))
                ) : (
                  <>
                    {activeAccounts.map((a) => (
                      <View key={a.id} style={styles.splitRow}>
                        <Text style={styles.splitLabel}>{a.label}</Text>
                        <TextInput
                          value={creditSplits[a.id] || ''}
                          onChangeText={(v) => setCreditSplits((prev) => ({ ...prev, [a.id]: v }))}
                          keyboardType="numeric"
                          mode="outlined"
                          dense
                          style={styles.splitInput}
                          placeholder="₹0"
                        />
                      </View>
                    ))}
                    <Text style={[styles.splitTotal, splitTotal !== absTxnAmount && absTxnAmount > 0 && styles.splitError]}>
                      Split total: {formatCurrency(splitTotal)} / {formatCurrency(absTxnAmount)}
                    </Text>
                    {absTxnAmount > 0 && activeAccounts[0] && (
                      <Button
                        mode="text"
                        onPress={() => setCreditSplits({ [activeAccounts[0].id]: String(absTxnAmount) })}
                      >
                        Put full amount in first account
                      </Button>
                    )}
                  </>
                )}
              </>
            )}

            {txnType === 'receive' && (
              <TextInput
                label="Provider profit (optional)"
                value={String(txnForm.providerProfit ?? '')}
                onChangeText={(v) => setTxnForm({ ...txnForm, providerProfit: v })}
                keyboardType="numeric"
                mode="outlined"
                style={ui.input}
              />
            )}

            <TextInput
              label="Notes"
              value={txnForm.notes || ''}
              onChangeText={(v) => setTxnForm({ ...txnForm, notes: v })}
              multiline
              mode="outlined"
              style={ui.input}
            />

            <Button
              mode="contained"
              loading={saving}
              onPress={onSaveTxn}
              buttonColor={txnType === 'send' ? '#dc2626' : undefined}
            >
              {txnType === 'send' ? 'Record send / repay' : txnType === 'share' ? 'Record P&L share' : 'Record receive'}
            </Button>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Edit transaction */}
      <Modal visible={editTxnModal} animationType="slide" onRequestClose={() => setEditTxnModal(false)}>
        <SafeAreaView style={ui.modal}>
          <View style={ui.modalHeader}>
            <Text style={ui.modalTitle}>Edit transaction</Text>
            <Button mode="text" onPress={() => setEditTxnModal(false)}>Cancel</Button>
          </View>
          <View style={ui.modalBody}>
            <Banner variant={editForm.isSend ? 'warn' : 'success'}>
              {editForm.isSend ? 'Send / repay entry' : 'Receive funds entry'}
            </Banner>
            <TextInput
              label="Amount (₹)"
              value={editForm.amount || ''}
              onChangeText={(v) => setEditForm({ ...editForm, amount: v.replace(/-/g, '') })}
              keyboardType="numeric"
              mode="outlined"
              style={ui.input}
            />
            <TextInput
              label="Date"
              value={editForm.txnDate ? String(editForm.txnDate).slice(0, 19) : ''}
              onChangeText={(v) => setEditForm({ ...editForm, txnDate: v })}
              mode="outlined"
              style={ui.input}
            />
            <TextInput
              label="Provider profit"
              value={editForm.providerProfit || ''}
              onChangeText={(v) => setEditForm({ ...editForm, providerProfit: v })}
              keyboardType="numeric"
              mode="outlined"
              style={ui.input}
            />
            <TextInput
              label="Notes"
              value={editForm.notes || ''}
              onChangeText={(v) => setEditForm({ ...editForm, notes: v })}
              multiline
              mode="outlined"
              style={ui.input}
            />
            <Button mode="contained" loading={saving} onPress={onSaveTxnEdit}>Save changes</Button>
          </View>
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  ledgerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 16 },
  txnRow: { marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 8 },
  words: { fontSize: 12, color: '#64748b', paddingHorizontal: 4, marginBottom: 4 },
  profitLine: { fontSize: 13, color: '#64748b', paddingHorizontal: 4, marginBottom: 4 },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  splitLabel: { flex: 1, fontSize: 14 },
  splitInput: { width: 120 },
  splitTotal: { fontSize: 13, color: '#64748b', marginBottom: 4 },
  splitError: { color: '#dc2626' },
});
