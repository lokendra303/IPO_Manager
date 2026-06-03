import { useEffect, useState } from 'react';
import {
  Table, Button, Tag, Modal, Form, Input, InputNumber, DatePicker, Space,
  message, Drawer, Switch, Row, Col, Select, Typography,
} from 'antd';
import { PlusOutlined, TransactionOutlined, BankOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import client from '../api/client';
import { formatCurrency } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard from '../components/StatCard';
import { tableDefaults } from '../utils/table';

export default function FundProvidersPage() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [providerModal, setProviderModal] = useState(false);
  const [txnModal, setTxnModal] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [form] = Form.useForm();
  const [txnForm] = Form.useForm();
  const [bankAccounts, setBankAccounts] = useState([]);
  const [creditMode, setCreditMode] = useState('single');
  const [creditSplits, setCreditSplits] = useState({});
  const [txnAmount, setTxnAmount] = useState(null);

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

  const openTxnModal = () => {
    setCreditMode('single');
    setCreditSplits({});
    setTxnAmount(null);
    txnForm.setFieldsValue({ creditToWallet: true, txnDate: dayjs(), bankAccountId: undefined });
    setTxnModal(true);
  };

  const onSaveProvider = async (values) => {
    try {
      await client.post('/fund-providers', values);
      message.success('Fund provider added');
      setProviderModal(false);
      form.resetFields();
      load();
    } catch (err) {
      message.error(getErrorMessage(err, 'Failed'));
    }
  };

  const onSaveTxn = async (values) => {
    const amount = Number(values.amount);
    const splitEntries = Object.entries(creditSplits)
      .map(([bankAccountId, amt]) => ({ bankAccountId: Number(bankAccountId), amount: Number(amt) || 0 }))
      .filter((e) => e.amount > 0);
    const splitTotal = splitEntries.reduce((s, e) => s + e.amount, 0);

    if (values.creditToWallet && creditMode === 'split') {
      if (Math.abs(splitTotal - Math.abs(amount)) > 0.001) {
        message.error(`Split amounts (${formatCurrency(splitTotal)}) must equal transaction amount (${formatCurrency(Math.abs(amount))})`);
        return;
      }
      if (!splitEntries.length) {
        message.error('Enter how much went to each bank account');
        return;
      }
    }
    if (values.creditToWallet && creditMode === 'single' && !values.bankAccountId && bankAccounts.length > 1) {
      message.error('Select which bank account received the funds');
      return;
    }
    if (values.creditToWallet && creditMode === 'single' && !values.bankAccountId && bankAccounts.length === 0) {
      message.error('Add a bank account under Wallet first');
      return;
    }

    try {
      const body = {
        amount: values.amount,
        txnDate: values.txnDate?.toISOString(),
        notes: values.notes,
        providerProfit: values.providerProfit,
        creditToWallet: values.creditToWallet,
      };
      if (creditMode === 'split' && splitEntries.length) {
        body.accountCredits = amount < 0 ? undefined : splitEntries;
        body.accountDebits = amount < 0 ? splitEntries : undefined;
      } else if (values.bankAccountId) {
        body.bankAccountId = values.bankAccountId;
      }
      await client.post(`/fund-providers/${selected.id}/transactions`, body);
      message.success('Transaction recorded');
      setTxnModal(false);
      txnForm.resetFields();
      setCreditSplits({});
      load();
      loadAccounts();
      if (drawerOpen) openLedger(selected);
    } catch (err) {
      message.error(getErrorMessage(err, 'Failed'));
    }
  };

  const totalLedger = providers.reduce((s, p) => s + Number(p.ledgerBalance || 0), 0);
  const absTxnAmount = Math.abs(Number(txnAmount) || 0);
  const splitTotal = Object.values(creditSplits).reduce((s, v) => s + (Number(v) || 0), 0);

  const columns = [
    { title: 'Name', dataIndex: 'name', render: (v) => <span style={{ fontWeight: 500 }}>{v}</span> },
    { title: 'Ledger Balance', dataIndex: 'ledgerBalance', render: (v) => formatCurrency(v) },
    { title: 'Total Profit', dataIndex: 'totalProfit', render: (v) => (v ? formatCurrency(v) : '—') },
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
        <Tag color={v >= 0 ? 'success' : 'error'}>{formatCurrency(v)}</Tag>
      ),
    },
    { title: 'Bank Account(s)', dataIndex: 'account_label' },
    { title: 'Profit', dataIndex: 'provider_profit', render: (v) => (v != null ? formatCurrency(v) : '—') },
    { title: 'Notes', dataIndex: 'notes', ellipsis: true },
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
          <StatCard title="Combined Ledger" value={formatCurrency(totalLedger)} icon={<TransactionOutlined />} variant="primary" />
        </Col>
      </Row>

      <ContentCard title="All Fund Providers">
        <Table rowKey="id" loading={loading} columns={columns} dataSource={providers} {...tableDefaults} />
      </ContentCard>

      <Modal title="Add Fund Provider" open={providerModal} onCancel={() => setProviderModal(false)} onOk={() => form.submit()} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={onSaveProvider}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="Sagar Gupta" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={`Transaction — ${selected?.name}`} open={txnModal} onCancel={() => setTxnModal(false)} onOk={() => txnForm.submit()} destroyOnClose width={520}>
        <Form form={txnForm} layout="vertical" onFinish={onSaveTxn} initialValues={{ creditToWallet: true }}>
          <Form.Item name="amount" label="Amount (+ receive / − repay)" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} onChange={(v) => setTxnAmount(v)} />
          </Form.Item>
          <Form.Item name="txnDate" label="Date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="creditToWallet" label="Update wallet balances" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.creditToWallet !== cur.creditToWallet}>
            {({ getFieldValue }) => getFieldValue('creditToWallet') && (
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
        width={720}
        className="member-drawer"
        extra={(
          <Button type="primary" onClick={() => { setSelected(selected); openTxnModal(); }}>
            Add Transaction
          </Button>
        )}
      >
        <Row gutter={16} style={{ marginBottom: 20 }}>
          <Col span={12}>
            <StatCard title="Ledger Balance" value={formatCurrency(selected?.ledgerBalance)} icon={<BankOutlined />} variant="primary" />
          </Col>
        </Row>
        <Table rowKey="id" columns={txnCols} dataSource={transactions} size="middle" className="pro-table" pagination={{ pageSize: 15 }} />
      </Drawer>
    </div>
  );
}
