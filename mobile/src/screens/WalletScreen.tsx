import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard from '../components/StatCard';
import Loading from '../components/Loading';
import ListRow from '../components/ListRow';
import Tag from '../components/Tag';
import { formatCurrency, formatDateTime } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import { openActionSheet } from '../utils/actionSheet';
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
  providerAccruedProfit?: number;
};

type WalletData = {
  balance: number;
  providerBalance?: number;
  managerBalance?: number;
  managerProfit: ManagerProfit | null;
  accounts: any[];
  txns: any[];
};

async function fetchWallet(): Promise<WalletData> {
  const [w, t] = await Promise.all([
    client.get('/wallet'),
    client.get('/wallet/transactions', { params: { limit: 40 } }),
  ]);
  return {
    balance: w.data.balance,
    providerBalance: w.data.providerBalance,
    managerBalance: w.data.managerBalance,
    managerProfit: w.data.managerProfit || null,
    accounts: w.data.accounts || [],
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
  const { data, loading, refresh } = useQuery(fetcher, [], { cacheKey: 'wallet' });

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
    const managerAccs = (data?.accounts ?? []).filter(
      (a: any) => a.is_active && a.purpose === 'MANAGER'
    );
    const defaultAccount = managerAccs[0];
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
  const providerBalance = data?.providerBalance ?? data?.managerProfit?.providerBalance ?? 0;
  const managerBalance = data?.managerBalance ?? data?.managerProfit?.managerBalance ?? 0;
  const managerProfit = data?.managerProfit;
  const accounts = data?.accounts ?? [];
  const txns = data?.txns ?? [];
  const activeAccounts = accounts.filter((a) => a.is_active);
  const managerAccounts = activeAccounts.filter((a: any) => a.purpose === 'MANAGER');
  const maxWithdraw = Number(managerProfit?.maxWithdraw ?? 0);

  const withdrawalInfo =
    'Personal withdrawals come from the Manager Profit wallet only. Provider wallet is for IPO distribute.';

  const openAddAccount = () => {
    setEditingAccount(null);
    setForm({});
    setAccountModal(true);
  };

  const openTransfer = () => {
    setTransfer({});
    setTransferModal(true);
  };

  const openHeaderMore = () => {
    openActionSheet(
      'Wallet',
      [
        { text: 'Refresh', onPress: refresh },
        { text: 'Add bank account', onPress: openAddAccount },
        { text: 'Transfer between accounts', onPress: openTransfer },
      ],
      withdrawalInfo
    );
  };

  const openAccountMore = (account: any) => {
    openActionSheet(account.label, [
      {
        text: 'Edit account',
        onPress: () => {
          setEditingAccount(account);
          setForm({
            label: account.label,
            bankName: account.bank_name,
            accountNumber: account.account_number,
            isActive: account.is_active,
          });
          setAccountModal(true);
        },
      },
    ]);
  };

  return (
    <Screen>
      <PageHeader
        title="Wallet"
        extra={
          <Button compact mode="text" onPress={openHeaderMore}>
            More
          </Button>
        }
      />
      <View style={ui.statRow}>
        <StatCard title="Provider wallet" value={formatCurrency(providerBalance)} variant="primary" />
        <StatCard title="Manager profit" value={formatCurrency(managerBalance)} variant="success" />
      </View>
      <View style={ui.statRow}>
        <StatCard title="Total cash" value={formatCurrency(balance)} variant="info" />
        <StatCard title="Max withdraw" value={formatCurrency(maxWithdraw)} variant="warning" />
      </View>
      <ContentCard
        title="Bank accounts"
        extra={
          <Button
            compact
            mode="contained"
            disabled={maxWithdraw <= 0 || managerAccounts.length === 0}
            onPress={openPersonalWithdraw}
          >
            Withdraw
          </Button>
        }
      >
        {accounts.map((a) => (
          <ListRow
            key={a.id}
            title={a.label}
            subtitle={formatCurrency(a.balance)}
            right={
              <Tag
                label={
                  a.purpose === 'MANAGER'
                    ? 'Manager'
                    : a.is_active
                      ? a.is_default
                        ? 'Default'
                        : 'Provider'
                      : 'Inactive'
                }
              />
            }
            onPress={() => openAccountMore(a)}
          />
        ))}
      </ContentCard>
      <ContentCard title="Transactions">
        {txns.map((t) => (
          <ListRow
            key={t.id}
            title={t.type?.replace(/_/g, ' ')}
            subtitle={`${formatDateTime(t.txn_date)} · ${t.bank_account_label || '—'}`}
            right={
              <Text style={{ color: typeColors[t.type] || '#64748b', fontWeight: '600' }}>
                {formatCurrency(t.amount)}
              </Text>
            }
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
          Max: {formatCurrency(maxWithdraw)} from manager profit wallet ({formatCurrency(managerBalance)})
        </Text>
        <Text style={[ui.hint, { marginBottom: 8 }]}>
          Manager accounts: {managerAccounts.map((a: any) => `${a.id}:${a.label}`).join(', ') || 'none'}
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
