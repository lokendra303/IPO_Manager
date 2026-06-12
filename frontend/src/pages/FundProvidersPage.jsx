import { useEffect, useState } from 'react';
import {
  Table, Button, Tag, Modal, Form, Input, InputNumber, DatePicker, Space,
  message, Drawer, Switch, Row, Col, Select, Typography, Popconfirm,
} from 'antd';
import { PlusOutlined, TransactionOutlined, BankOutlined, EditOutlined, UndoOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import client from '../api/client';
import { formatCurrency, amountToWordsInr } from '../utils/format';
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
  const [txnModal, setTxnModal] = useState(false);
  const [editTxnModal, setEditTxnModal] = useState(false);
  const [editingTxn, setEditingTxn] = useState(null);
  const [savingTxnEdit, setSavingTxnEdit] = useState(false);
  const [savingTxn, setSavingTxn] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [rollingBackTxnId, setRollingBackTxnId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  const openLedger = async (provider) => {
    setSelected(provider);
    setDrawerOpen(true);
    const { data } = await client.get(`/fund-providers/${provider.id}/transactions`);
    setTransactions(data);
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
      openLedger(selected);
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
      openLedger(selected);
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
        providerProfit: isShareOnly ? (values.providerProfit ?? values.amount) : values.providerProfit,
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
          ? `P&L share recorded for provider — ${formatCurrency(amount)}`
          : amount >= 0
            ? `Funds added successfully — ${formatCurrency(amount)}`
            : `Repayment recorded — ${formatCurrency(Math.abs(amount))}`
      );
      load();
      loadAccounts();
      if (drawerOpen) openLedger(selected);
    } catch (err) {
      message.error(getErrorMessage(err, 'Failed to record transaction'));
    } finally {
      setSavingTxn(false);
    }
  };

  const totalLedger = providers.reduce((s, p) => s + Number(p.ledgerBalance || 0), 0);
  const absTxnAmount = Math.abs(Number(txnAmount) || 0);
  const splitTotal = Object.values(creditSplits).reduce((s, v) => s + (Number(v) || 0), 0);

  const columns = [
    { title: 'Name', dataIndex: 'name', render: (v) => <span style={{ fontWeight: 500 }}>{v}</span> },
    {
      title: 'Ledger Balance',
      dataIndex: 'ledgerBalance',
      render: (v) => <AmountWithWords value={v} compact />,
    },
    {
      title: 'Total Profit',
      dataIndex: 'totalProfit',
      render: (v) => (v ? <AmountWithWords value={v} compact /> : '—'),
    },
    {
      title: 'Actions',
      render: (_, r) => (
        <Space>
          <Button icon={<TransactionOutlined />} onClick={() => openLedger(r)}>
            Ledger
          </Button>
          <Button
            type="primary"
            size="small"
            onClick={() => {
              setSelected(r);
              openTxnModal();
            }}
          >
            Add Funds
          </Button>
        </Space>
      ),
    },
  ];

  const txnCols = [
    { title: 'Date', dataIndex: 'txn_date', render: (v) => dayjs(v).format('DD MMM YYYY') },
    {
      title: 'Amount',
      dataIndex: 'amount',
      render: (v) => (
        <div>
          <Tag color={v >= 0 ? 'success' : 'error'}>{formatCurrency(v)}</Tag>
          <div className="amount-with-words__text" style={{ marginTop: 4, maxWidth: 260 }}>
            {amountToWordsInr(v)}
          </div>
        </div>
      ),
    },
    { title: 'Bank Account(s)', dataIndex: 'account_label' },
    {
      title: 'Profit',
      dataIndex: 'provider_profit',
      render: (v) => (v != null ? <AmountWithWords value={v} compact /> : '—'),
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      render: (v) => <NoteCell value={v} maxWidth={480} />,
    },
    {
      title: '',
      width: 150,
      render: (_, r) => {
        const isAutoPnL = r.account_label === 'P&L Share' || r.account_label === 'P&L Share (Loss)';
        return (
          <Space size="small">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditTxn(r)}>
              Edit
            </Button>
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

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={8}>
          <StatCard title="Providers" value={providers.length} icon={<BankOutlined />} variant="info" />
        </Col>
        <Col xs={24} sm={12} md={8}>
          <StatCard
            title="Combined Ledger"
            value={<AmountWithWords value={totalLedger} />}
            icon={<TransactionOutlined />}
            variant="primary"
          />
        </Col>
      </Row>

      <ContentCard title="All Fund Providers">
        <Table rowKey="id" loading={loading} columns={columns} dataSource={providers} {...tableDefaults} />
      </ContentCard>

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
                { value: 'share', label: 'P&L share to provider (ledger only)' },
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
          {txnType === 'share' && (
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              Provider ledger only — your wallet bank accounts are not used for P&L share entries.
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
          {txnType === 'funds' && (
            <Form.Item name="providerProfit" label="Provider Profit (optional)">
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
          )}
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
          <Form.Item name="providerProfit" label="Provider Profit">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={selected?.name}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={920}
        className="member-drawer fund-provider-ledger-drawer"
        extra={(
          <Space>
            <Button onClick={() => openTxnModal('share')}>Record P&L Share</Button>
            <Button type="primary" onClick={() => openTxnModal('funds')}>Add Transaction</Button>
          </Space>
        )}
      >
        <Row gutter={16} style={{ marginBottom: 20 }}>
          <Col xs={24} md={12}>
            <StatCard
              title="Ledger Balance"
              value={<AmountWithWords value={selected?.ledgerBalance} />}
              icon={<BankOutlined />}
              variant="primary"
            />
          </Col>
        </Row>
        <Table
          rowKey="id"
          columns={txnCols}
          dataSource={transactions}
          size="middle"
          className="pro-table ledger-table"
          pagination={{ pageSize: 15 }}
          scroll={{ x: 800 }}
        />
      </Drawer>
    </div>
  );
}
