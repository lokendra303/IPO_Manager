import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard from '../components/StatCard';
import StatGrid from '../components/StatGrid';
import Loading from '../components/Loading';
import ListRow from '../components/ListRow';
import Tag from '../components/Tag';
import Banner from '../components/Banner';
import { formatCurrency, formatDateTime } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import SlideModal from '../components/SlideModal';
import { ui } from '../styles/ui';
import { useQuery } from '../hooks/useQuery';

const typeColors: Record<string, string> = {
  PROVIDER_IN: '#059669',
  DISTRIBUTE_OUT: '#d97706',
  RETURN_IN: '#0284c7',
  PROVIDER_OUT: '#dc2626',
  ADJUSTMENT: '#64748b',
  TRANSFER_OUT: '#ea580c',
  TRANSFER_IN: '#0891b2',
  PERSONAL_OUT: '#c026d3',
};

type ManagerProfit = {
  totalManagerShare?: number;
  personalWithdrawn?: number;
  availableManagerProfit?: number;
  walletBalance?: number;
  maxWithdraw?: number;
};

type WalletData = {
  balance: number;
  managerProfit: ManagerProfit | null;
  accounts: any[];
  txns: any[];
};

async function fetchWallet(): Promise<WalletData> {
  const [w, accts, t] = await Promise.all([
    client.get('/wallet'),
    client.get('/bank-accounts'),
    client.get('/wallet/transactions'),
  ]);
  return {
    balance: w.data.balance,
    managerProfit: w.data.managerProfit || null,
    accounts: accts.data.accounts || [],
    txns: t.data,
  };
}

export default function WalletScreen() {
  const [accountModal, setAccountModal] = useState(false);
  const [transferModal, setTransferModal] = useState(false);
  const [personalModal, setPersonalModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [transfer, setTransfer] = useState<any>({});
  const [personal, setPersonal] = useState<any>({});
  const [withdrawing, setWithdrawing] = useState(false);

  const fetcher = useCallback(() => fetchWallet(), []);
  const { data, loading, refresh } = useQuery(fetcher);

  const onSaveAccount = async () => {
    try {
      const body: Record<string, unknown> = { label: form.label, bankName: form.bankName, accountNumber: form.accountNumber };
      if (editingAccount) {
        body.isActive = form.isActive ?? editingAccount.is_active;
        await client.patch(`/bank-accounts/${editingAccount.id}`, body);
      } else {
        await client.post('/bank-accounts', body);
      }
      setAccountModal(false);
      await refresh();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Failed'));
    }
  };

  const onTransfer = async () => {
    if (transfer.fromBankAccountId === transfer.toBankAccountId) {
      Alert.alert('Error', 'Choose two different accounts');
      return;
    }
    try {
      await client.post('/bank-accounts/transfer', {
        fromBankAccountId: Number(transfer.fromBankAccountId),
        toBankAccountId: Number(transfer.toBankAccountId),
        amount: Number(transfer.amount),
        notes: transfer.notes,
      });
      setTransferModal(false);
      await refresh();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Transfer failed'));
    }
  };

  const openPersonalWithdraw = () => {
    const active = (data?.accounts ?? []).filter((a: any) => a.is_active);
    const defaultAccount = active.find((a: any) => a.is_default) || active[0];
    setPersonal({
      bankAccountId: defaultAccount ? String(defaultAccount.id) : '',
      amount: '',
      notes: '',
    });
    setPersonalModal(true);
  };

  const onPersonalWithdraw = async () => {
    const maxWithdraw = Number(data?.managerProfit?.maxWithdraw ?? 0);
    const amount = Number(personal.amount);
    if (!personal.bankAccountId) {
      Alert.alert('Error', 'Select a bank account');
      return;
    }
    if (!(amount > 0)) {
      Alert.alert('Error', 'Enter a valid amount');
      return;
    }
    if (amount > maxWithdraw) {
      Alert.alert('Error', `Max withdraw is ${formatCurrency(maxWithdraw)}`);
      return;
    }
    setWithdrawing(true);
    try {
      await client.post('/wallet/personal-withdraw', {
        amount,
        bankAccountId: Number(personal.bankAccountId),
        notes: personal.notes || undefined,
      });
      setPersonalModal(false);
      await refresh();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Withdrawal failed'));
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading && !data) return <Loading />;

  const balance = data?.balance ?? 0;
  const managerProfit = data?.managerProfit;
  const accounts = data?.accounts ?? [];
  const txns = data?.txns ?? [];
  const activeAccounts = accounts.filter((a) => a.is_active);
  const maxWithdraw = Number(managerProfit?.maxWithdraw ?? 0);

  return (
    <Screen>
      <PageHeader
        title="Wallet"
        subtitle="Personal withdrawals use manager profit only"
        extra={<Button compact mode="outlined" onPress={refresh}>Refresh</Button>}
      />
      <StatGrid>
        <StatCard title="Wallet balance" value={formatCurrency(balance)} variant="primary" />
        <StatCard
          title="Available manager profit"
          value={formatCurrency(managerProfit?.availableManagerProfit ?? 0)}
          variant="success"
        />
        <StatCard
          title="Personal withdrawn"
          value={formatCurrency(managerProfit?.personalWithdrawn ?? 0)}
          variant="warning"
        />
        <StatCard title="Max personal withdraw" value={formatCurrency(maxWithdraw)} variant="info" />
      </StatGrid>
      <Banner variant="info">
        Personal withdrawal uses manager IPO profit only. Provider profit is reserved
        {managerProfit?.providerAccruedProfit
          ? ` (${formatCurrency(managerProfit.providerAccruedProfit)})`
          : ''}
        {' '}and must be handled under Fund Providers.
      </Banner>
      <ContentCard title="Bank accounts" extra={
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button
            compact
            mode="contained"
            disabled={maxWithdraw <= 0 || activeAccounts.length === 0}
            onPress={openPersonalWithdraw}
          >
            Personal withdraw
          </Button>
          <Button compact onPress={() => { setEditingAccount(null); setForm({}); setAccountModal(true); }}>Add</Button>
          <Button compact onPress={() => { setTransfer({}); setTransferModal(true); }}>Transfer</Button>
        </View>
      }>
        {accounts.map((a) => (
          <ListRow
            key={a.id}
            title={a.label}
            subtitle={[a.bank_name, a.account_number].filter(Boolean).join(' · ') || formatCurrency(a.balance)}
            right={<Tag label={a.is_active ? (a.is_default ? 'Default' : 'Active') : 'Inactive'} />}
          />
        ))}
      </ContentCard>
      <ContentCard title="Transactions">
        {txns.map((t) => (
          <ListRow
            key={t.id}
            title={t.type?.replace(/_/g, ' ')}
            subtitle={`${formatDateTime(t.txn_date)} · ${t.bank_account_label || '—'}${t.notes ? ` · ${t.notes}` : ''}`}
            right={<Text style={{ color: typeColors[t.type] || '#64748b', fontWeight: '600' }}>{formatCurrency(t.amount)}</Text>}
          />
        ))}
      </ContentCard>

      <SlideModal
        visible={accountModal}
        title={editingAccount ? 'Edit account' : 'Add account'}
        onClose={() => setAccountModal(false)}
        closeLabel="Cancel"
      >
        <TextInput label="Label" value={form.label || ''} onChangeText={(v) => setForm({ ...form, label: v })} mode="outlined" style={ui.input} />
        <TextInput label="Bank name" value={form.bankName || ''} onChangeText={(v) => setForm({ ...form, bankName: v })} mode="outlined" style={ui.input} />
        <TextInput label="Account number" value={form.accountNumber || ''} onChangeText={(v) => setForm({ ...form, accountNumber: v })} mode="outlined" style={ui.input} />
        <Button mode="contained" onPress={onSaveAccount}>Save</Button>
      </SlideModal>

      <SlideModal
        visible={transferModal}
        title="Transfer between accounts"
        onClose={() => setTransferModal(false)}
        closeLabel="Cancel"
      >
        <TextInput label="From account ID" value={String(transfer.fromBankAccountId || '')} onChangeText={(v) => setTransfer({ ...transfer, fromBankAccountId: v })} keyboardType="numeric" mode="outlined" style={ui.input} />
        <TextInput label="To account ID" value={String(transfer.toBankAccountId || '')} onChangeText={(v) => setTransfer({ ...transfer, toBankAccountId: v })} keyboardType="numeric" mode="outlined" style={ui.input} />
        <Text style={ui.hint}>Active accounts: {activeAccounts.map((a) => `${a.id}:${a.label}`).join(', ')}</Text>
        <TextInput label="Amount" value={String(transfer.amount || '')} onChangeText={(v) => setTransfer({ ...transfer, amount: v })} keyboardType="numeric" mode="outlined" style={ui.input} />
        <TextInput label="Notes" value={transfer.notes || ''} onChangeText={(v) => setTransfer({ ...transfer, notes: v })} mode="outlined" style={ui.input} />
        <Button mode="contained" onPress={onTransfer}>Transfer</Button>
      </SlideModal>

      <SlideModal
        visible={personalModal}
        title="Personal withdrawal"
        onClose={() => setPersonalModal(false)}
        closeLabel="Cancel"
      >
        <Text style={ui.hint}>
          Max: {formatCurrency(maxWithdraw)} · Manager profit{' '}
          {formatCurrency(managerProfit?.availableManagerProfit ?? 0)}
          {managerProfit?.providerAccruedProfit
            ? ` · Provider reserved ${formatCurrency(managerProfit.providerAccruedProfit)}`
            : ''}
          {' '}· Wallet {formatCurrency(balance)}
        </Text>
        <Text style={[ui.hint, { marginBottom: 8 }]}>
          Provider profit cannot be withdrawn here. Active accounts:{' '}
          {activeAccounts.map((a) => `${a.id}:${a.label}`).join(', ')}
        </Text>
        <TextInput
          label="From account ID"
          value={String(personal.bankAccountId || '')}
          onChangeText={(v) => setPersonal({ ...personal, bankAccountId: v })}
          keyboardType="numeric"
          mode="outlined"
          style={ui.input}
        />
        <TextInput
          label="Amount"
          value={String(personal.amount || '')}
          onChangeText={(v) => setPersonal({ ...personal, amount: v })}
          keyboardType="numeric"
          mode="outlined"
          style={ui.input}
        />
        <TextInput
          label="Notes (optional)"
          value={personal.notes || ''}
          onChangeText={(v) => setPersonal({ ...personal, notes: v })}
          mode="outlined"
          style={ui.input}
        />
        <Button mode="contained" loading={withdrawing} disabled={withdrawing || maxWithdraw <= 0} onPress={onPersonalWithdraw}>
          Withdraw from manager profit
        </Button>
      </SlideModal>
    </Screen>
  );
}
