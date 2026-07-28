import { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, DatePicker, Space,
  message, Switch, Row, Col, Select, Typography, Popconfirm,
} from 'antd';
import { PlusOutlined, TransactionOutlined, BankOutlined, EditOutlined, UndoOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import client from '../api/client';
import { formatCurrency } from '../utils/format';
import AmountWithWords from '../components/AmountWithWords';
import { getErrorMessage } from '../utils/errors';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard from '../components/StatCard';
import NoteCell from '../components/NoteCell';
import { tableDefaults } from '../utils/table';

export default function FundProvidersPage() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [providerModal, setProviderModal] = useState(false);
  const [editProviderModal, setEditProviderModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);
  const [editProviderForm] = Form.useForm();
  const [savingProviderEdit, setSavingProviderEdit] = useState(false);
  const [txnModal, setTxnModal] = useState(false);
  const [editTxnModal, setEditTxnModal] = useState(false);
  const [editingTxn, setEditingTxn] = useState(null);
  const [savingTxnEdit, setSavingTxnEdit] = useState(false);
  const [savingTxn, setSavingTxn] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [rollingBackTxnId, setRollingBackTxnId] = useState(null);
  const [viewProviderId, setViewProviderId] = useState(null);
  const [txnsLoading, setTxnsLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [form] = Form.useForm();
  const [txnForm] = Form.useForm();
  const [editTxnForm] = Form.useForm();
  const [bankAccounts, setBankAccounts] = useState([]);
  const [creditMode, setCreditMode] = useState('single');
  const [creditSplits, setCreditSplits] = useState({});
  const [txnAmount, setTxnAmount] = useState(null);
  const [txnType, setTxnType] = useState('funds');
  const [reinvestModal, setReinvestModal] = useState(false);
  const [reinvestForm] = Form.useForm();
  const [reinvesting, setReinvesting] = useState(false);

  const load = () => {
    setLoading(true);
    client.get('/fund-providers').then((r) => setProviders(r.data)).finally(() => setLoading(false));
  };

  const loadAccounts = () => {
    client.get('/bank-accounts').then((r) => setBankAccounts(r.data.accounts || []));
  };

  useEffect(() => {
    load();
    loadAccounts();
  }, []);

  const viewProvider = viewProviderId ? providers.find((p) => p.id === viewProviderId) : null;

  const loadTransactions = async (providerId) => {
    if (!providerId) {
      setTransactions([]);
      return;
    }
    setTxnsLoading(true);
    try {
      const { data } = await client.get(`/fund-providers/${providerId}/transactions`);
      setTransactions(data);
    } finally {
      setTxnsLoading(false);
    }
  };

  useEffect(() => {
    if (viewProviderId) {
      const p = providers.find((x) => x.id === viewProviderId);
      if (p) {
        setSelected(p);
        loadTransactions(viewProviderId);
      }
    } else {
      setTransactions([]);
      setSelected(null);
    }
  }, [viewProviderId, providers]);

  useEffect(() => {
    if (providers.length === 1 && viewProviderId == null) {
      setViewProviderId(providers[0].id);
    }
  }, [providers, viewProviderId]);

  const selectProvider = (provider) => {
    setViewProviderId(provider.id);
    setSelected(provider);
  };

  const refreshProviderView = async () => {
    load();
    if (viewProviderId) {
      await loadTransactions(viewProviderId);
      const { data } = await client.get('/fund-providers');
      const updated = data.find((p) => p.id === viewProviderId);
      if (updated) setSelected(updated);
    }
  };

  const openLedger = (provider) => {
    selectProvider(provider);
  };

  const openTxnModal = (type = 'funds') => {
    setTxnType(type);
    setCreditMode('single');
    setCreditSplits({});
    setTxnAmount(null);
    txnForm.setFieldsValue({
      creditToWallet: type === 'funds',
      txnDate: dayjs(),
      bankAccountId: undefined,
      providerProfit: undefined,
    });
    setTxnModal(true);
  };

  const onSaveProvider = async (values) => {
    if (savingProvider) return;
    setSavingProvider(true);
    try {
      await client.post('/fund-providers', values);
      message.success('Fund provider added');
      setProviderModal(false);
      form.resetFields();
      load();
    } catch (err) {
      message.error(getErrorMessage(err, 'Failed'));
    } finally {
      setSavingProvider(false);
    }
  };

  const openEditProvider = (provider) => {
    setEditingProvider(provider);
    editProviderForm.setFieldsValue({ name: provider.name });
    setEditProviderModal(true);
  };

  const onSaveProviderEdit = async (values) => {
    if (!editingProvider || savingProviderEdit) return;
    setSavingProviderEdit(true);
    try {
      await client.patch(`/fund-providers/${editingProvider.id}`, { name: values.name.trim() });
      message.success('Fund provider updated');
      setEditProviderModal(false);
      setEditingProvider(null);
      editProviderForm.resetFields();
      load();
    } catch (err) {
      message.error(getErrorMessage(err, 'Failed to update provider'));
    } finally {
      setSavingProviderEdit(false);
    }
  };

  const openEditTxn = (txn) => {
    setEditingTxn(txn);
    editTxnForm.setFieldsValue({
      amount: txn.amount,
      txnDate: dayjs(txn.txn_date),
      notes: txn.notes,
      providerProfit: txn.provider_profit,
    });
    setEditTxnModal(true);
  };

  const onSaveTxnEdit = async (values) => {
    if (!editingTxn || !selected) return;
    setSavingTxnEdit(true);
    try {
      await client.patch(`/fund-providers/${selected.id}/transactions/${editingTxn.id}`, {
        amount: values.amount,
        txnDate: values.txnDate?.toISOString(),
        notes: values.notes,
        providerProfit: values.providerProfit,
      });
      message.success('Transaction updated — wallet balance synced');
      setEditTxnModal(false);
      setEditingTxn(null);
      editTxnForm.resetFields();
      load();
      loadAccounts();
      refreshProviderView();
    } catch (err) {
      message.error(getErrorMessage(err, 'Failed to update transaction'));
    } finally {
      setSavingTxnEdit(false);
    }
  };

  const onRollbackTxn = async (txn) => {
    if (!selected || rollingBackTxnId) return;
    setRollingBackTxnId(txn.id);
    try {
      const { data } = await client.delete(`/fund-providers/${selected.id}/transactions/${txn.id}`);
      message.success(
        `Transaction rolled back — ${formatCurrency(data.amount)} removed from provider ledger${
          txn.account_label ? ' and wallet adjusted' : ''
        }`
      );
      load();
      loadAccounts();
      refreshProviderView();
    } catch (err) {
      message.error(getErrorMessage(err, 'Failed to roll back transaction'));
    } finally {
      setRollingBackTxnId(null);
    }
  };

  const onSaveTxn = async (values) => {
    if (savingTxn) return;

    const amount = Number(values.amount);
    const splitEntries = Object.entries(creditSplits)
      .map(([bankAccountId, amt]) => ({ bankAccountId: Number(bankAccountId), amount: Number(amt) || 0 }))
      .filter((e) => e.amount > 0);
    const splitTotal = splitEntries.reduce((s, e) => s + e.amount, 0);

    const isShareOnly = txnType === 'share';

    if (!isShareOnly && values.creditToWallet && creditMode === 'split') {
      if (Math.abs(splitTotal - Math.abs(amount)) > 0.001) {
        message.error(`Split amounts (${formatCurrency(splitTotal)}) must equal transaction amount (${formatCurrency(Math.abs(amount))})`);
        return;
      }
      if (!splitEntries.length) {
        message.error('Enter how much went to each bank account');
        return;
      }
    }
    if (!isShareOnly && values.creditToWallet && creditMode === 'single' && !values.bankAccountId && bankAccounts.length > 1) {
      message.error('Select which bank account received the funds');
      return;
    }
    if (!isShareOnly && values.creditToWallet && creditMode === 'single' && !values.bankAccountId && bankAccounts.length === 0) {
      message.error('Add a bank account under Wallet first');
      return;
    }

    setSavingTxn(true);
    try {
      const body = {
        amount: values.amount,
        txnDate: values.txnDate?.toISOString(),
        notes: values.notes,
        providerProfit: isShareOnly ? (values.providerProfit ?? values.amount) : undefined,
        creditToWallet: isShareOnly ? false : values.creditToWallet,
      };
      if (!isShareOnly && creditMode === 'split' && splitEntries.length) {
        body.accountCredits = amount < 0 ? undefined : splitEntries;
        body.accountDebits = amount < 0 ? splitEntries : undefined;
      } else if (!isShareOnly && values.bankAccountId) {
        body.bankAccountId = values.bankAccountId;
      }
      await client.post(`/fund-providers/${selected.id}/transactions`, body);
      setTxnModal(false);
      txnForm.resetFields();
      setCreditSplits({});
      setTxnAmount(null);
      setTxnType('funds');
      message.success(
        isShareOnly
          ? `P&L share accrued — ${formatCurrency(amount)} (not added to principal yet)`
          : amount >= 0
            ? `Funds added successfully — ${formatCurrency(amount)}`
            : `Repayment recorded — ${formatCurrency(Math.abs(amount))}`
      );
      load();
      loadAccounts();
      if (viewProviderId) refreshProviderView();
    } catch (err) {
      message.error(getErrorMessage(err, 'Failed to record transaction'));
    } finally {
      setSavingTxn(false);
    }
  };

  const onReinvestProfit = async (values) => {
    if (!selected || reinvesting) return;
    if (!values.bankAccountId && bankAccounts.length > 1) {
      message.error('Select which bank account should receive the principal');
      return;
    }
    if (!values.bankAccountId && bankAccounts.length === 0) {
      message.error('Add a bank account under Wallet first');
      return;
    }
    setReinvesting(true);
    try {
      const { data } = await client.post(`/fund-providers/${selected.id}/reinvest-profit`, {
        amount: values.amount,
        txnDate: values.txnDate?.toISOString(),
        notes: values.notes,
        bankAccountId: values.bankAccountId,
        creditToWallet: values.creditToWallet !== false,
      });
      message.success(data.message || 'Profit reinvested into principal');
      setReinvestModal(false);
      reinvestForm.resetFields();
      load();
      loadAccounts();
      refreshProviderView();
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not reinvest profit'));
    } finally {
      setReinvesting(false);
    }
  };

  const openReinvestModal = () => {
    const defAcct = bankAccounts.length === 1 ? bankAccounts[0].id : undefined;
    reinvestForm.setFieldsValue({
      amount: selected?.accruedProfit > 0 ? selected.accruedProfit : undefined,
      txnDate: dayjs(),
      notes: 'Profit reinvested into principal',
      bankAccountId: defAcct,
      creditToWallet: true,
    });
    setReinvestModal(true);
  };

  const totalPrincipal = providers.reduce((s, p) => s + Number(p.principalBalance ?? p.ledgerBalance ?? 0), 0);
  const totalAccrued = providers.reduce((s, p) => s + Number(p.accruedProfit ?? p.totalProfit ?? 0), 0);

  const displayPrincipal = viewProvider
    ? Number(viewProvider.principalBalance ?? viewProvider.ledgerBalance ?? 0)
    : totalPrincipal;
  const displayAccrued = viewProvider
    ? Number(viewProvider.accruedProfit ?? viewProvider.totalProfit ?? 0)
    : totalAccrued;
  const displayCombined = displayPrincipal + displayAccrued;
  const statsScope = viewProvider ? viewProvider.name : 'All providers';

  const isAutoPnLEntry = (txn) => {
    const label = txn.account_label || '';
    return label === 'P&L Share' || label === 'P&L Share (Loss)' || label === 'P&L Share (Manual)' || label === 'P&L Share (Manual Loss)';
  };

  const isReinvestEntry = (txn) => (txn.account_label || '') === 'Profit Reinvested';

  const columns = [
    { title: 'Name', dataIndex: 'name', render: (v) => <span style={{ fontWeight: 500 }}>{v}</span> },
    {
      title: 'Principal (given)',
      dataIndex: 'principalBalance',
      render: (_, r) => <AmountWithWords value={r.principalBalance ?? r.ledgerBalance ?? 0} compact />,
    },
    {
      title: 'Accrued profit',
      dataIndex: 'accruedProfit',
      render: (_, r) => {
        const v = r.accruedProfit ?? r.totalProfit ?? 0;
        return v ? <AmountWithWords value={v} compact /> : '—';
      },
    },
    {
      title: 'Total',
      render: (_, r) => {
        const total = r.totalBalance ?? (Number(r.principalBalance ?? r.ledgerBalance ?? 0) + Number(r.accruedProfit ?? r.totalProfit ?? 0));
        return <AmountWithWords value={total} compact />;
      },
    },
    {
      title: 'Actions',
      render: (_, r) => (
        <Space>
          <Button icon={<TransactionOutlined />} onClick={() => openLedger(r)}>
            Ledger
          </Button>
          <Button icon={<EditOutlined />} onClick={() => openEditProvider(r)}>
            Edit
          </Button>
          <Button
            type="primary"
            size="small"
            onClick={() => {
              selectProvider(r);
              openTxnModal();
            }}
          >
            Add Funds
          </Button>
        </Space>
      ),
    },
  ];

  const absTxnAmount = Math.abs(Number(txnAmount) || 0);
  const splitTotal = Object.values(creditSplits).reduce((s, v) => s + (Number(v) || 0), 0);

  const txnCols = [
    { title: 'Date', dataIndex: 'txn_date', render: (v) => dayjs(v).format('DD MMM YYYY') },
    {
      title: 'Principal',
      dataIndex: 'amount',
      render: (v) => (Number(v) !== 0 ? <AmountWithWords value={v} compact /> : '—'),
    },
    {
      title: 'Profit (accrued)',
      dataIndex: 'provider_profit',
      render: (v) => (v != null && Number(v) !== 0 ? <AmountWithWords value={v} compact /> : '—'),
    },
    { title: 'Bank Account(s)', dataIndex: 'account_label', render: (v) => v || '—' },
    {
      title: 'Notes',
      dataIndex: 'notes',
      render: (v) => <NoteCell value={v} maxWidth={480} />,
    },
    {
      title: '',
      width: 150,
      render: (_, r) => {
        const isAutoPnL = isAutoPnLEntry(r);
        const isAccrualOnly = Number(r.amount) === 0 && r.provider_profit != null;
        const canEdit = !isAutoPnL && !isAccrualOnly && !isReinvestEntry(r);
        return (
          <Space size="small">
            {canEdit && (
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditTxn(r)}>
                Edit
              </Button>
            )}
            {!isAutoPnL && (
              <Popconfirm
                title="Roll back this entry?"
                description="Removes it from the provider ledger and reverses any wallet change."
                okText="Roll back"
                okButtonProps={{ danger: true, loading: rollingBackTxnId === r.id }}
                onConfirm={() => onRollbackTxn(r)}
              >
                <Button
                  size="small"
                  danger
                  icon={<UndoOutlined />}
                  loading={rollingBackTxnId === r.id}
                >
                  Roll back
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Fund Providers"
        subtitle="Record provider funds — you choose which bank account(s) received the money"
        extra={(
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setProviderModal(true); }}>
            Add Provider
          </Button>
        )}
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }} align="middle">
        <Col xs={24} md={8}>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>View provider</Typography.Text>
          <Select
            style={{ width: '100%' }}
            placeholder="Select a provider"
            value={viewProviderId ?? 'all'}
            onChange={(v) => setViewProviderId(v === 'all' ? null : v)}
            options={[
              { value: 'all', label: `All providers (${providers.length})` },
              ...providers.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <StatCard title={`Principal — ${statsScope}`} value={<AmountWithWords value={displayPrincipal} />} icon={<BankOutlined />} variant="primary" />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatCard
            title={`Accrued profit — ${statsScope}`}
            value={<AmountWithWords value={displayAccrued} />}
            icon={<TransactionOutlined />}
            variant="success"
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatCard
            title={`Combined — ${statsScope}`}
            value={<AmountWithWords value={displayCombined} />}
            icon={<BankOutlined />}
            variant="info"
          />
        </Col>
        {!viewProvider && (
          <Col xs={24} sm={12} md={6}>
            <StatCard title="Providers" value={providers.length} icon={<BankOutlined />} variant="info" />
          </Col>
        )}
      </Row>

      {!viewProvider ? (
        <ContentCard title="All Fund Providers">
          <Table rowKey="id" loading={loading} columns={columns} dataSource={providers} {...tableDefaults} />
        </ContentCard>
      ) : (
        <ContentCard
          title={`${viewProvider.name} — Transactions`}
          extra={(
            <Space wrap>
              <Button icon={<EditOutlined />} onClick={() => openEditProvider(viewProvider)}>
                Edit provider
              </Button>
              <Button
                onClick={openReinvestModal}
                disabled={!selected?.accruedProfit || Number(selected.accruedProfit) <= 0}
              >
                Add profit to principal
              </Button>
              <Button onClick={() => openTxnModal('share')}>Accrue P&L share</Button>
              <Button type="primary" onClick={() => openTxnModal('funds')}>Add / repay funds</Button>
            </Space>
          )}
        >
          <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
            Principal is funds given or repaid (updates wallet). Accrued profit is P&L share only — use
            {' '}&quot;Add profit to principal&quot; to move it into principal and credit your wallet.
          </Typography.Paragraph>
          <Table
            rowKey="id"
            loading={txnsLoading}
            columns={txnCols}
            dataSource={transactions}
            size="middle"
            className="pro-table ledger-table"
            pagination={{ pageSize: 15 }}
            scroll={{ x: 900 }}
          />
        </ContentCard>
      )}

      <Modal
        title="Add Fund Provider"
        open={providerModal}
        onCancel={() => !savingProvider && setProviderModal(false)}
        onOk={() => form.submit()}
        confirmLoading={savingProvider}
        maskClosable={!savingProvider}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={onSaveProvider}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="Sagar Gupta" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit Fund Provider"
        open={editProviderModal}
        onCancel={() => !savingProviderEdit && setEditProviderModal(false)}
        onOk={() => editProviderForm.submit()}
        confirmLoading={savingProviderEdit}
        maskClosable={!savingProviderEdit}
        destroyOnClose
      >
        <Form form={editProviderForm} layout="vertical" onFinish={onSaveProviderEdit}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Enter provider name' }]}>
            <Input placeholder="Provider name" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={txnType === 'share' ? `P&L Share — ${selected?.name}` : `Transaction — ${selected?.name}`}
        open={txnModal}
        onCancel={() => {
          if (savingTxn) return;
          setTxnModal(false);
          setTxnType('funds');
        }}
        onOk={() => txnForm.submit()}
        confirmLoading={savingTxn}
        maskClosable={!savingTxn}
        destroyOnClose
        width={520}
      >
        <Form form={txnForm} layout="vertical" onFinish={onSaveTxn} initialValues={{ creditToWallet: true }}>
          <Form.Item label="Transaction type">
            <Select
              value={txnType}
              onChange={(v) => {
                setTxnType(v);
                if (v === 'share') {
                  txnForm.setFieldsValue({ creditToWallet: false, bankAccountId: undefined });
                  setCreditSplits({});
                } else {
                  txnForm.setFieldsValue({ creditToWallet: true });
                }
              }}
              options={[
                { value: 'funds', label: 'Add / repay funds (updates wallet)' },
                { value: 'share', label: 'Accrue P&L share (does not add to principal)' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label={txnType === 'share' ? 'Share amount' : 'Amount (+ receive / − repay)'}
            rules={[{ required: true }]}
          >
            <InputNumber style={{ width: '100%' }} onChange={(v) => setTxnAmount(v)} />
          </Form.Item>
          <Form.Item name="txnDate" label="Date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          {txnType === 'funds' && (
            <Form.Item name="creditToWallet" label="Update wallet balances" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
          {txnType === 'funds' && (
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              Records principal only (wallet in/out). P&L profit is tracked separately via &quot;Accrue P&L share&quot;.
            </Typography.Text>
          )}
          {txnType === 'share' && (
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              Adds to accrued profit only — not principal. Use &quot;Add profit to principal&quot; when ready to reinvest.
            </Typography.Text>
          )}
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.creditToWallet !== cur.creditToWallet}>
            {({ getFieldValue }) => txnType === 'funds' && getFieldValue('creditToWallet') && (
              <>
                <Typography.Text strong>Which account(s) received / paid funds?</Typography.Text>
                <Select
                  style={{ width: '100%', marginTop: 8, marginBottom: 12 }}
                  value={creditMode}
                  onChange={setCreditMode}
                  options={[
                    { value: 'single', label: 'One account' },
                    { value: 'split', label: 'Split across multiple accounts' },
                  ]}
                />
                {creditMode === 'single' ? (
                  <Form.Item
                    name="bankAccountId"
                    label="Bank account"
                    rules={bankAccounts.length > 1 ? [{ required: true, message: 'Select an account' }] : []}
                  >
                    <Select
                      placeholder="Select bank account"
                      allowClear={bankAccounts.length <= 1}
                      options={bankAccounts.map((a) => ({
                        value: a.id,
                        label: `${a.label}${a.bank_name ? ` (${a.bank_name})` : ''} — ${formatCurrency(a.balance)}`,
                      }))}
                    />
                  </Form.Item>
                ) : (
                  <div>
                    {bankAccounts.map((a) => (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ flex: 1 }}>{a.label}</span>
                        <InputNumber
                          min={0}
                          style={{ width: 140 }}
                          placeholder="₹0"
                          value={creditSplits[a.id]}
                          onChange={(v) => setCreditSplits((prev) => ({ ...prev, [a.id]: v }))}
                        />
                      </div>
                    ))}
                    <Typography.Text type={splitTotal === absTxnAmount && absTxnAmount > 0 ? undefined : 'danger'}>
                      Split total: {formatCurrency(splitTotal)} / {formatCurrency(absTxnAmount)}
                    </Typography.Text>
                    {absTxnAmount > 0 && (
                      <Button
                        type="link"
                        size="small"
                        onClick={() => {
                          let remaining = absTxnAmount;
                          const next = {};
                          for (const acc of bankAccounts) {
                            if (remaining <= 0) break;
                            next[acc.id] = remaining;
                            remaining = 0;
                          }
                          setCreditSplits(next);
                        }}
                      >
                        Put full amount in first account
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit Transaction"
        open={editTxnModal}
        onCancel={() => { setEditTxnModal(false); setEditingTxn(null); }}
        onOk={() => editTxnForm.submit()}
        confirmLoading={savingTxnEdit}
        destroyOnClose
        width={480}
      >
        <Form form={editTxnForm} layout="vertical" onFinish={onSaveTxnEdit}>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="txnDate" label="Date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
          {editingTxn && Number(editingTxn.amount) === 0 && editingTxn.provider_profit != null && (
            <Form.Item name="providerProfit" label="Accrued profit">
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title={`Add profit to principal — ${selected?.name}`}
        open={reinvestModal}
        onCancel={() => !reinvesting && setReinvestModal(false)}
        onOk={() => reinvestForm.submit()}
        confirmLoading={reinvesting}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">
          Accrued profit available:{' '}
          <strong>{formatCurrency(selected?.accruedProfit ?? selected?.totalProfit ?? 0)}</strong>
          . This will increase provider principal and credit your manager wallet (same as new capital).
        </Typography.Paragraph>
        <Form form={reinvestForm} layout="vertical" onFinish={onReinvestProfit} initialValues={{ creditToWallet: true }}>
          <Form.Item
            name="amount"
            label="Amount to add to principal"
            rules={[{ required: true, message: 'Enter amount' }]}
          >
            <InputNumber min={0.01} max={selected?.accruedProfit ?? selected?.totalProfit} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="bankAccountId"
            label="Credit to bank account"
            rules={bankAccounts.length > 1 ? [{ required: true, message: 'Select account' }] : []}
          >
            <Select
              placeholder="Select bank account"
              allowClear={bankAccounts.length <= 1}
              options={bankAccounts.map((a) => ({
                value: a.id,
                label: `${a.label} — ${formatCurrency(a.balance)}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="txnDate" label="Date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
