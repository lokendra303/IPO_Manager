import { useEffect, useState } from 'react';
import {
  Table, Tag, Row, Col, Button, Modal, Form, Input, message, Space, Select, InputNumber, DatePicker,
} from 'antd';
import { WalletOutlined, PlusOutlined, BankOutlined, SwapOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import client from '../api/client';
import { formatCurrency } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import ContentCard from '../components/ContentCard';
import PageLoading from '../components/PageLoading';
import { tableDefaults } from '../utils/table';

const typeColors = {
  PROVIDER_IN: 'success',
  DISTRIBUTE_OUT: 'warning',
  RETURN_IN: 'processing',
  PROVIDER_OUT: 'error',
  ADJUSTMENT: 'default',
  TRANSFER_OUT: 'orange',
  TRANSFER_IN: 'cyan',
};

export default function WalletPage() {
  const [balance, setBalance] = useState(0);
  const [accounts, setAccounts] = useState([]);
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accountModal, setAccountModal] = useState(false);
  const [transferModal, setTransferModal] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [form] = Form.useForm();
  const [transferForm] = Form.useForm();

  const activeAccounts = accounts.filter((a) => a.is_active);

  const load = () => {
    setLoading(true);
    Promise.all([client.get('/wallet'), client.get('/wallet/transactions')])
      .then(([w, t]) => {
        setBalance(w.data.balance);
        setAccounts(w.data.accounts || []);
        setTxns(t.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const onSaveAccount = async (values) => {
    try {
      await client.post('/bank-accounts', {
        label: values.label,
        bankName: values.bankName,
        accountNumber: values.accountNumber,
      });
      message.success('Bank account added');
      setAccountModal(false);
      form.resetFields();
      load();
    } catch (err) {
      message.error(getErrorMessage(err, 'Failed'));
    }
  };

  const openTransfer = () => {
    transferForm.resetFields();
    transferForm.setFieldsValue({ txnDate: dayjs() });
    setTransferModal(true);
  };

  const onTransfer = async (values) => {
    if (values.fromBankAccountId === values.toBankAccountId) {
      message.error('Choose two different accounts');
      return;
    }
    setTransferring(true);
    try {
      await client.post('/bank-accounts/transfer', {
        fromBankAccountId: values.fromBankAccountId,
        toBankAccountId: values.toBankAccountId,
        amount: values.amount,
        txnDate: values.txnDate?.toISOString(),
        notes: values.notes,
      });
      message.success('Transfer completed');
      setTransferModal(false);
      transferForm.resetFields();
      load();
    } catch (err) {
      message.error(getErrorMessage(err, 'Transfer failed'));
    } finally {
      setTransferring(false);
    }
  };

  const accountOptions = activeAccounts.map((a) => ({
    value: a.id,
    label: `${a.label} — ${formatCurrency(a.balance)}`,
  }));

  if (loading) return <PageLoading />;

  const columns = [
    { title: 'Date', dataIndex: 'txn_date', render: (v) => new Date(v).toLocaleString('en-IN') },
    {
      title: 'Type',
      dataIndex: 'type',
      render: (t) => <Tag color={typeColors[t] || 'default'}>{t.replace(/_/g, ' ')}</Tag>,
    },
    { title: 'Bank Account', dataIndex: 'bank_account_label', render: (v) => v || '—' },
    {
      title: 'Amount',
      dataIndex: 'amount',
      render: (v) => (
        <span className={Number(v) >= 0 ? 'amount-positive' : 'amount-negative'}>{formatCurrency(v)}</span>
      ),
    },
    { title: 'Account Balance After', dataIndex: 'balance_after', render: (v) => formatCurrency(v) },
    {
      title: 'Reference',
      render: (_, r) => (r.ref_type === 'bank_transfer' ? `Transfer #${r.ref_id}` : r.ref_type ? `${r.ref_type} #${r.ref_id}` : '—'),
    },
    { title: 'Notes', dataIndex: 'notes', ellipsis: true },
  ];

  const accountCols = [
    {
      title: 'Account',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: 500 }}>{r.label}</span>
          {(r.bank_name || r.account_number) && (
            <span style={{ fontSize: 12, color: '#888' }}>
              {[r.bank_name, r.account_number].filter(Boolean).join(' · ')}
            </span>
          )}
        </Space>
      ),
    },
    {
      title: 'Balance',
      dataIndex: 'balance',
      render: (v) => formatCurrency(v),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Owner Wallet"
        subtitle="Total across all accounts — transfer between your own bank accounts anytime"
        extra={(
          <Space wrap>
            <Button
              icon={<SwapOutlined />}
              onClick={openTransfer}
              disabled={activeAccounts.length < 2}
            >
              Transfer Between Accounts
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setAccountModal(true); }}>
              Add Bank Account
            </Button>
          </Space>
        )}
      />
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={8}>
          <StatCard
            title="Total Available"
            value={formatCurrency(balance)}
            icon={<WalletOutlined />}
            variant="primary"
          />
        </Col>
        <Col xs={24} sm={12} md={8}>
          <StatCard
            title="Active Accounts"
            value={activeAccounts.length}
            icon={<BankOutlined />}
            variant="info"
          />
        </Col>
      </Row>

      <ContentCard title="Bank Accounts" style={{ marginBottom: 24 }}>
        <Table
          rowKey="id"
          columns={accountCols}
          dataSource={activeAccounts}
          pagination={false}
          size="middle"
        />
      </ContentCard>

      <ContentCard title="Transaction History">
        <Table rowKey="id" columns={columns} dataSource={txns} {...tableDefaults} />
      </ContentCard>

      <Modal
        title="Add Bank Account"
        open={accountModal}
        onCancel={() => setAccountModal(false)}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={onSaveAccount}>
          <Form.Item name="label" label="Label" rules={[{ required: true }]}>
            <Input placeholder="HDFC Main, SBI Team, KVB" />
          </Form.Item>
          <Form.Item name="bankName" label="Bank name (optional)">
            <Input placeholder="HDFC Bank" />
          </Form.Item>
          <Form.Item name="accountNumber" label="Account number (optional)">
            <Input placeholder="XXXX1234" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Transfer Between Accounts"
        open={transferModal}
        onCancel={() => setTransferModal(false)}
        onOk={() => transferForm.submit()}
        confirmLoading={transferring}
        destroyOnClose
      >
        <Form form={transferForm} layout="vertical" onFinish={onTransfer}>
          <Form.Item
            name="fromBankAccountId"
            label="From account"
            rules={[{ required: true, message: 'Select source account' }]}
          >
            <Select placeholder="Debit from" options={accountOptions} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item
            name="toBankAccountId"
            label="To account"
            rules={[{ required: true, message: 'Select destination account' }]}
          >
            <Select placeholder="Credit to" options={accountOptions} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
            <InputNumber min={0.01} style={{ width: '100%' }} prefix="₹" />
          </Form.Item>
          <Form.Item name="txnDate" label="Date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="Notes (optional)">
            <Input.TextArea rows={2} placeholder="e.g. Moved to SBI for IPO payout" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
