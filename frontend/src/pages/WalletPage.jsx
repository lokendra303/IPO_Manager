import { useEffect, useState } from 'react';
import {
  Table, Tag, Row, Col, Button, Modal, Form, Input, message, Space, Select, InputNumber, DatePicker,
  Typography, Alert,
} from 'antd';
import {
  WalletOutlined, PlusOutlined, BankOutlined, SwapOutlined, EditOutlined, UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import client from '../api/client';
import { formatCurrency } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import ContentCard from '../components/ContentCard';
import PageLoading from '../components/PageLoading';
import NoteCell from '../components/NoteCell';
import { tableDefaults } from '../utils/table';

const typeColors = {
  PROVIDER_IN: 'success',
  DISTRIBUTE_OUT: 'warning',
  RETURN_IN: 'processing',
  PROVIDER_OUT: 'error',
  ADJUSTMENT: 'default',
  TRANSFER_OUT: 'orange',
  TRANSFER_IN: 'cyan',
  PERSONAL_OUT: 'magenta',
};

export default function WalletPage() {
  const [balance, setBalance] = useState(0);
  const [managerProfit, setManagerProfit] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accountModal, setAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [savingAccount, setSavingAccount] = useState(false);
  const [transferModal, setTransferModal] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [personalModal, setPersonalModal] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [form] = Form.useForm();
  const [transferForm] = Form.useForm();
  const [personalForm] = Form.useForm();

  const activeAccounts = accounts.filter((a) => a.is_active);
  const maxWithdraw = Number(managerProfit?.maxWithdraw ?? 0);

  const load = () => {
    setLoading(true);
    Promise.all([
      client.get('/wallet'),
      client.get('/bank-accounts'),
      client.get('/wallet/transactions'),
    ])
      .then(([w, accts, t]) => {
        setBalance(w.data.balance);
        setManagerProfit(w.data.managerProfit || null);
        setAccounts(accts.data.accounts || []);
        setTxns(t.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openAddAccount = () => {
    setEditingAccount(null);
    form.resetFields();
    setAccountModal(true);
  };

  const openEditAccount = (record, e) => {
    e?.stopPropagation();
    setEditingAccount(record);
    form.setFieldsValue({
      label: record.label,
      bankName: record.bank_name || undefined,
      accountNumber: record.account_number || undefined,
      isActive: record.is_active,
      isDefault: record.is_default,
    });
    setAccountModal(true);
  };

  const onSaveAccount = async (values) => {
    setSavingAccount(true);
    try {
      const body = {
        label: values.label,
        bankName: values.bankName,
        accountNumber: values.accountNumber,
      };
      if (editingAccount) {
        body.isActive = values.isActive;
        if (activeAccounts.length > 1) {
          body.isDefault = values.isDefault;
        }
        await client.patch(`/bank-accounts/${editingAccount.id}`, body);
        message.success('Bank details updated');
      } else {
        await client.post('/bank-accounts', body);
        message.success('Bank account added');
      }
      setAccountModal(false);
      setEditingAccount(null);
      form.resetFields();
      load();
    } catch (err) {
      message.error(getErrorMessage(err, 'Failed'));
    } finally {
      setSavingAccount(false);
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

  const openPersonalWithdraw = () => {
    personalForm.resetFields();
    const defaultAccount = activeAccounts.find((a) => a.is_default) || activeAccounts[0];
    personalForm.setFieldsValue({
      bankAccountId: defaultAccount?.id,
      txnDate: dayjs(),
    });
    setPersonalModal(true);
  };

  const onPersonalWithdraw = async (values) => {
    setWithdrawing(true);
    try {
      await client.post('/wallet/personal-withdraw', {
        amount: values.amount,
        bankAccountId: values.bankAccountId,
        notes: values.notes,
        txnDate: values.txnDate?.toISOString(),
      });
      message.success('Personal withdrawal recorded from manager profit');
      setPersonalModal(false);
      personalForm.resetFields();
      load();
    } catch (err) {
      message.error(getErrorMessage(err, 'Withdrawal failed'));
    } finally {
      setWithdrawing(false);
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
    { title: 'Notes', dataIndex: 'notes', render: (v) => <NoteCell value={v} /> },
  ];

  const accountCols = [
    {
      title: 'Account',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Space>
            <span style={{ fontWeight: 500 }}>{r.label}</span>
            {r.is_default && r.is_active && <Tag color="blue">Default</Tag>}
            {!r.is_active && <Tag>Inactive</Tag>}
          </Space>
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
    {
      title: '',
      width: 90,
      render: (_, r) => (
        <Button size="small" icon={<EditOutlined />} onClick={(e) => openEditAccount(r, e)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Owner Wallet"
        subtitle="Total across all accounts — personal withdrawals use manager profit only"
        extra={(
          <Space wrap>
            <Button
              icon={<UserOutlined />}
              onClick={openPersonalWithdraw}
              disabled={maxWithdraw <= 0 || activeAccounts.length === 0}
            >
              Personal withdrawal
            </Button>
            <Button
              icon={<SwapOutlined />}
              onClick={openTransfer}
              disabled={activeAccounts.length < 2}
            >
              Transfer Between Accounts
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openAddAccount}>
              Add Bank Account
            </Button>
          </Space>
        )}
      />
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <StatCard
            title="Total Available"
            value={formatCurrency(balance)}
            icon={<WalletOutlined />}
            variant="primary"
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatCard
            title="Available manager profit"
            value={formatCurrency(managerProfit?.availableManagerProfit ?? 0)}
            icon={<UserOutlined />}
            variant="success"
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatCard
            title="Personal withdrawn"
            value={formatCurrency(managerProfit?.personalWithdrawn ?? 0)}
            variant="warning"
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatCard
            title="Max personal withdraw"
            value={formatCurrency(maxWithdraw)}
            icon={<BankOutlined />}
            variant="info"
          />
        </Col>
      </Row>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
        message="Personal withdrawal uses manager IPO profit only. Provider profit is reserved in the wallet and must be handled under Fund Providers."
        description={
          managerProfit?.providerAccruedProfit > 0
            ? `Provider profit reserved: ${formatCurrency(managerProfit.providerAccruedProfit)} (not withdrawable here).`
            : undefined
        }
      />

      <ContentCard title="Bank Accounts" style={{ marginBottom: 24 }}>
        <Table
          rowKey="id"
          columns={accountCols}
          dataSource={accounts}
          pagination={false}
          locale={{ emptyText: 'No bank accounts — add one to distribute IPO funds' }}
          {...tableDefaults}
        />
      </ContentCard>

      <ContentCard title="Transaction History">
        <Table rowKey="id" columns={columns} dataSource={txns} {...tableDefaults} />
      </ContentCard>

      <Modal
        title={editingAccount ? 'Edit bank details' : 'Add Bank Account'}
        open={accountModal}
        onCancel={() => { setAccountModal(false); setEditingAccount(null); }}
        onOk={() => form.submit()}
        confirmLoading={savingAccount}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={onSaveAccount}>
          <Form.Item name="label" label="Label" rules={[{ required: true }]}>
            <Input placeholder="HDFC Main, SBI Team, KVB" />
          </Form.Item>
          <Form.Item name="bankName" label="Bank name">
            <Input placeholder="HDFC Bank" allowClear />
          </Form.Item>
          <Form.Item name="accountNumber" label="Account number">
            <Input placeholder="XXXX1234" allowClear />
          </Form.Item>
          {editingAccount && (
            <>
              <Form.Item label="Current balance">
                <Input value={formatCurrency(editingAccount.balance)} disabled />
              </Form.Item>
              <Form.Item
                name="isActive"
                label="Status"
                extra="Inactive accounts are hidden from IPO pay/distribute but keep their balance and history."
              >
                <Select
                  options={[
                    { value: true, label: 'Active' },
                    { value: false, label: 'Inactive' },
                  ]}
                />
              </Form.Item>
              {activeAccounts.length > 1 && (
                <Form.Item
                  name="isDefault"
                  label="Default account"
                  extra="Used for automatic wallet entries (e.g. profit share) when no account is selected."
                >
                  <Select
                    options={[
                      { value: true, label: 'Yes — use for automatic entries' },
                      { value: false, label: 'No' },
                    ]}
                  />
                </Form.Item>
              )}
            </>
          )}
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

      <Modal
        title="Personal withdrawal (manager profit)"
        open={personalModal}
        onCancel={() => setPersonalModal(false)}
        onOk={() => personalForm.submit()}
        confirmLoading={withdrawing}
        okButtonProps={{ disabled: maxWithdraw <= 0 }}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          Max withdraw: {formatCurrency(maxWithdraw)} (manager profit{' '}
          {formatCurrency(managerProfit?.availableManagerProfit ?? 0)}
          {managerProfit?.providerAccruedProfit > 0
            ? `, provider profit reserved ${formatCurrency(managerProfit.providerAccruedProfit)}`
            : ''}
          , wallet {formatCurrency(balance)}). Provider profit cannot be withdrawn here.
        </Typography.Paragraph>
        <Form form={personalForm} layout="vertical" onFinish={onPersonalWithdraw}>
          <Form.Item
            name="bankAccountId"
            label="From account"
            rules={[{ required: true, message: 'Select account' }]}
          >
            <Select options={accountOptions} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item
            name="amount"
            label="Amount"
            rules={[
              { required: true, message: 'Enter amount' },
              {
                validator: (_, value) => {
                  if (value == null) return Promise.resolve();
                  if (Number(value) > maxWithdraw) {
                    return Promise.reject(new Error(`Max is ${formatCurrency(maxWithdraw)}`));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <InputNumber min={0.01} max={maxWithdraw || undefined} style={{ width: '100%' }} prefix="₹" />
          </Form.Item>
          <Form.Item name="txnDate" label="Date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="Notes (optional)">
            <Input.TextArea rows={2} placeholder="e.g. Personal expense" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
