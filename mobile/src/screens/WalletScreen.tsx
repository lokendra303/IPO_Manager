import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, SegmentedButtons, TextInput } from 'react-native-paper';
import client from '../api/client';
import Screen from '../components/Screen';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard from '../components/StatCard';
import Loading from '../components/Loading';
import Tag from '../components/Tag';
import { formatCurrency, formatDateTime } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import { openActionSheet } from '../utils/actionSheet';
import SlideModal from '../components/SlideModal';
import { ui } from '../styles/ui';
import { useQuery } from '../hooks/useQuery';
import { colors, radii, spacing } from '../theme';

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
  const { data, setData, loading, refresh } = useQuery(fetcher, [], { cacheKey: 'wallet' });

  const onSaveAccount = async () => {
    try {
      const body: Record<string, unknown> = {
        label: form.label,
        bankName: form.bankName,
        accountNumber: form.accountNumber,
        purpose: form.purpose || 'PROVIDER',
      };
      if (editingAccount) {
        body.isActive = form.isActive ?? editingAccount.is_active;
        await client.patch(`/bank-accounts/${editingAccount.id}`, body);
      } else {
        await client.post('/bank-accounts', body);
      }
      setAccountModal(false);
      void refresh();
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
      void refresh();
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
      const { data: result } = await client.post('/wallet/personal-withdraw', {
        amount,
        bankAccountId: Number(personal.bankAccountId),
        notes: personal.notes || undefined,
      });
      setPersonalModal(false);
      // Apply server result immediately so the UI doesn't wait on a full reload
      setData((prev) => {
        const base = prev ?? {
          balance: 0,
          accounts: [],
          txns: [],
          managerProfit: null,
        };
        const accountId = Number(personal.bankAccountId);
        return {
          ...base,
          balance: Number(result.newBalance ?? result.walletBalance ?? base.balance),
          providerBalance: result.providerBalance ?? base.providerBalance,
          managerBalance: result.managerBalance ?? base.managerBalance,
          managerProfit: {
            ...(base.managerProfit || {}),
            totalManagerShare: result.totalManagerShare,
            personalWithdrawn: result.personalWithdrawn,
            availableManagerProfit: result.availableManagerProfit,
            maxWithdraw: result.maxWithdraw,
            providerAccruedProfit: result.providerAccruedProfit,
            walletBalance: result.walletBalance ?? result.newBalance,
          },
          accounts: (base.accounts || []).map((a: any) =>
            a.id === accountId
              ? {
                  ...a,
                  balance: Math.round((Number(a.balance) - amount) * 100) / 100,
                }
              : a
          ),
        };
      });
      void refresh();
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
    setForm({ purpose: 'PROVIDER' });
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
            purpose: account.purpose || 'PROVIDER',
          });
          setAccountModal(true);
        },
      },
    ]);
  };

  return (
    <Screen bottomNavInset>
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
        {accounts.length === 0 ? (
          <Text style={styles.empty}>No bank accounts yet. Use More to add one.</Text>
        ) : (
          accounts.map((a) => {
            const role =
              a.purpose === 'MANAGER'
                ? 'Manager'
                : a.is_active
                  ? a.is_default
                    ? 'Default'
                    : 'Provider'
                  : 'Inactive';
            const roleColor = a.purpose === 'MANAGER' ? '#7c3aed' : a.is_active ? colors.primary : '#64748b';
            return (
              <Pressable
                key={a.id}
                style={({ pressed }) => [styles.account, pressed && styles.pressed]}
                onPress={() => openAccountMore(a)}
              >
                <View style={styles.accountTop}>
                  <Text style={styles.accountName}>{a.label}</Text>
                  <Tag label={role} color={roleColor} />
                </View>
                <Text style={styles.accountAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {formatCurrency(a.balance)}
                </Text>
              </Pressable>
            );
          })
        )}
      </ContentCard>
      <ContentCard title="Transactions">
        {txns.length === 0 ? (
          <Text style={styles.empty}>No transactions yet.</Text>
        ) : (
          txns.map((t) => (
            <View key={t.id} style={styles.txn}>
              <View style={styles.txnTop}>
                <Text style={styles.txnType}>{String(t.type || '').replace(/_/g, ' ')}</Text>
                <Text style={[styles.txnAmount, { color: typeColors[t.type] || colors.text }]} numberOfLines={1}>
                  {formatCurrency(t.amount)}
                </Text>
              </View>
              <Text style={styles.txnMeta}>
                {formatDateTime(t.txn_date)}
                {t.bank_account_label ? ` · ${t.bank_account_label}` : ''}
              </Text>
            </View>
          ))
        )}
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
        {!editingAccount ? (
          <SegmentedButtons
            style={{ marginBottom: 12 }}
            value={form.purpose || 'PROVIDER'}
            onValueChange={(v) => setForm({ ...form, purpose: v })}
            buttons={[
              { value: 'PROVIDER', label: 'Provider' },
              { value: 'MANAGER', label: 'Manager' },
            ]}
          />
        ) : null}
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

const styles = StyleSheet.create({
  account: {
    backgroundColor: '#f8fafc',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  pressed: { backgroundColor: colors.primaryLight, borderColor: colors.primaryMuted },
  accountTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  accountName: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.text },
  accountAmount: { marginTop: 6, fontSize: 20, fontWeight: '800', color: colors.text },
  txn: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  txnTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  txnType: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  txnAmount: { fontSize: 16, fontWeight: '800', flexShrink: 0 },
  txnMeta: { marginTop: 4, fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  empty: { fontSize: 15, fontWeight: '600', color: colors.text },
});
