import { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, Space, Tag, message, Popconfirm, Typography, Row, Col,
} from 'antd';
import {
  WalletOutlined, PlusOutlined, ArrowLeftOutlined, TransactionOutlined, DeleteOutlined,
  BankOutlined, CheckCircleOutlined, WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { formatCurrency } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard from '../components/StatCard';
import ModalDatePicker from '../components/ModalDatePicker';
import { tableDefaults } from '../utils/table';

function MetricRow({ label, value, tone }) {
  const toneClass =
    tone === 'success'
      ? 'leader-wallet-metric__value--success'
      : tone === 'warning'
        ? 'leader-wallet-metric__value--warning'
        : tone === 'danger'
          ? 'leader-wallet-metric__value--danger'
          : '';
  return (
    <div className="leader-wallet-metric">
      <span className="leader-wallet-metric__label">{label}</span>
      <span className={`leader-wallet-metric__value ${toneClass}`}>{value}</span>
    </div>
  );
}

function MatchRow({ ok, title, detail }) {
  return (
    <div className={`leader-wallet-match ${ok ? 'leader-wallet-match--ok' : 'leader-wallet-match--gap'}`}>
      <div className="leader-wallet-match__icon">
        {ok ? <CheckCircleOutlined /> : <WarningOutlined />}
      </div>
      <div className="leader-wallet-match__body">
        <div className="leader-wallet-match__title">{title}</div>
        {detail ? <div className="leader-wallet-match__detail">{detail}</div> : null}
      </div>
    </div>
  );
}

function LeaderWalletCard({ leader, onOpen, onAddCash }) {
  const matchOk = leader.matchOk ?? Math.abs(Number(leader.matchGap) || 0) < 0.5;
  return (
    <ContentCard
      className="leader-wallet-panel leader-wallet-card"
      title={
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{leader.leaderName}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {leader.groupName} · {leader.memberCount} members
          </Typography.Text>
        </Space>
      }
      extra={
        <Space>
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => onAddCash(leader.groupId)}>
            Cash
          </Button>
          <Button size="small" onClick={() => onOpen(leader.groupId)}>
            Open
          </Button>
        </Space>
      }
    >
      <div className="leader-wallet-panel__body">
        <div className="leader-wallet-metrics">
          <MetricRow label="Cash sent" value={formatCurrency(leader.cashSent)} />
          <MetricRow label="Cash received" value={formatCurrency(leader.cashReceived)} tone="success" />
          <MetricRow label="Cash pending" value={formatCurrency(leader.cashPending)} tone="warning" />
          <MetricRow label="IPO pending" value={formatCurrency(leader.ipoPending ?? leader.ipoStillOut)} />
        </div>
        <MatchRow
          ok={matchOk}
          title={
            matchOk
              ? 'Matched — cash pending = IPO pending'
              : `Gap ${formatCurrency(leader.matchGap)}`
          }
          detail={
            matchOk
              ? null
              : `Cash ${formatCurrency(leader.cashPending)} · IPO ${formatCurrency(leader.ipoPending ?? leader.ipoStillOut)}`
          }
        />
      </div>
    </ContentCard>
  );
}

export default function GroupLeaderWalletsPage() {
  const [rows, setRows] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [txnOpen, setTxnOpen] = useState(false);
  const [txnMode, setTxnMode] = useState('list');
  const [savingTxn, setSavingTxn] = useState(false);
  const [ipos, setIpos] = useState([]);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    Promise.all([
      client.get('/group-leader-wallets'),
      client.get('/group-leader-wallets/overview'),
    ])
      .then(([listRes, ovRes]) => {
        setRows(listRes.data || []);
        setOverview(ovRes.data || null);
      })
      .catch((err) => message.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    client.get('/ipos').then((r) => setIpos(r.data || [])).catch(() => {});
  }, []);

  const openDetail = async (groupId) => {
    setDetailLoading(true);
    try {
      const { data } = await client.get(`/group-leader-wallets/${groupId}`);
      setDetail(data);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setDetailLoading(false);
    }
  };

  const openCashTxn = (presetGroupId) => {
    setTxnMode(detail ? 'detail' : 'list');
    form.resetFields();
    form.setFieldsValue({
      type: 'SENT',
      txnDate: dayjs(),
      groupId: presetGroupId || detail?.groupId || undefined,
    });
    setTxnOpen(true);
  };

  const onAddTxn = async (values) => {
    const groupId = values.groupId || detail?.groupId;
    if (!groupId) {
      message.warning('Select a leader / sub-group');
      return;
    }
    setSavingTxn(true);
    try {
      const { data } = await client.post(`/group-leader-wallets/${groupId}/transactions`, {
        type: values.type,
        amount: values.amount,
        txnDate: values.txnDate ? dayjs(values.txnDate).format('YYYY-MM-DD') : undefined,
        notes: values.notes,
        ipoId: values.ipoId || undefined,
      });
      if (detail && detail.groupId === groupId) {
        setDetail(data.detail);
      }
      message.success('Cash entry recorded');
      setTxnOpen(false);
      form.resetFields();
      load();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setSavingTxn(false);
    }
  };

  const onDeleteTxn = async (groupId, txnId) => {
    try {
      const { data } = await client.delete(
        `/group-leader-wallets/${groupId}/transactions/${txnId}`
      );
      if (detail && detail.groupId === groupId) {
        setDetail(data);
      }
      message.success('Transaction removed');
      load();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const cash = overview?.cashWallet;
  const provider = overview?.providerWallet;
  const leaderCards = overview?.leaderWallets?.length
    ? overview.leaderWallets
    : (rows || []).filter((r) => r.hasOwner);

  const txnModal = (
    <Modal
      title="Leader cash entry"
      open={txnOpen}
      onCancel={() => setTxnOpen(false)}
      onOk={() => form.submit()}
      confirmLoading={savingTxn}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={onAddTxn}>
        {(txnMode === 'list' || !detail) && (
          <Form.Item name="groupId" label="Leader / sub-group" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select leader"
              options={(overview?.leaders || rows.filter((r) => r.hasOwner)).map((g) => ({
                value: g.groupId,
                label: `${g.groupName} — ${g.leaderName}`,
              }))}
            />
          </Form.Item>
        )}
        <Form.Item name="type" label="Type" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'SENT', label: 'SENT — you gave cash to leader' },
              { value: 'RECEIVED', label: 'RECEIVED — you collected from leader' },
              { value: 'ADJUSTMENT', label: 'ADJUSTMENT — balance correction (+/−)' },
            ]}
          />
        </Form.Item>
        <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
          <InputNumber style={{ width: '100%' }} min={0.01} step={1} placeholder="e.g. 150000" />
        </Form.Item>
        <Form.Item name="txnDate" label="Date">
          <ModalDatePicker />
        </Form.Item>
        <Form.Item name="ipoId" label="IPO (optional)">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            options={(ipos || []).map((i) => ({ value: i.id, label: i.name }))}
          />
        </Form.Item>
        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={2} placeholder="e.g. Cash transfer / UPI to leader" />
        </Form.Item>
      </Form>
      <Typography.Text type="secondary">
        Goes into that leader’s cash wallet only — does not debit provider wallet.
      </Typography.Text>
    </Modal>
  );

  if (detail) {
    const matchOk = detail.match?.ok ?? detail.matchOk;
    const cashPending = detail.cashWallet?.pending ?? detail.cashPending;
    const ipoPending = detail.match?.ipoPending ?? detail.ipoStillOut;
    return (
      <div>
        <PageHeader
          title={
            <Space>
              <WalletOutlined />
              {detail.leaderName}
            </Space>
          }
          subtitle={`${detail.groupName} · ${detail.memberCount} members · own cash wallet`}
          extra={
            <Space wrap>
              <Button icon={<ArrowLeftOutlined />} onClick={() => { setDetail(null); load(); }}>
                All leaders
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openCashTxn(detail.groupId)}>
                Cash entry
              </Button>
              <Link to="/member-groups">
                <Button>Sub-groups</Button>
              </Link>
            </Space>
          }
        />

        <Row gutter={[16, 16]} className="leader-wallet-overview" style={{ marginBottom: 16 }}>
          <Col xs={24} md={8}>
            <ContentCard className="leader-wallet-panel" title="Cash wallet">
              <div className="leader-wallet-panel__body">
                <div className="leader-wallet-metrics">
                  <MetricRow label="Cash sent" value={formatCurrency(detail.cashWallet?.sent ?? detail.cashSent)} />
                  <MetricRow
                    label="Cash received"
                    value={formatCurrency(detail.cashWallet?.received ?? detail.cashReceived)}
                    tone="success"
                  />
                  <MetricRow label="Cash pending" value={formatCurrency(cashPending)} tone="warning" />
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => openCashTxn(detail.groupId)}>
                  Add cash entry
                </Button>
              </div>
            </ContentCard>
          </Col>
          <Col xs={24} md={8}>
            <ContentCard className="leader-wallet-panel" title="IPO with this leader">
              <div className="leader-wallet-panel__body">
                <div className="leader-wallet-metrics">
                  <MetricRow label="IPO given" value={formatCurrency(detail.ipoSent)} />
                  <MetricRow label="IPO returned" value={formatCurrency(detail.ipoReturned)} tone="success" />
                  <MetricRow label="IPO pending" value={formatCurrency(ipoPending)} tone="warning" />
                </div>
              </div>
            </ContentCard>
          </Col>
          <Col xs={24} md={8}>
            <ContentCard className="leader-wallet-panel" title="Match this wallet">
              <div className="leader-wallet-panel__body">
                <MatchRow
                  ok={matchOk}
                  title={
                    matchOk
                      ? 'Matched — cash pending = IPO pending'
                      : `Gap ${formatCurrency(detail.match?.gap ?? detail.matchGap)}`
                  }
                  detail={`Cash ${formatCurrency(cashPending)} · IPO ${formatCurrency(ipoPending)}`}
                />
                <Typography.Paragraph type="secondary" className="leader-wallet-panel__hint">
                  Enter cash SENT/RECEIVED for this leader until cash pending matches IPO pending.
                </Typography.Paragraph>
              </div>
            </ContentCard>
          </Col>
        </Row>

        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          IPO pending includes allotment-PENDING (
          {formatCurrency(detail.pendingAllotmentOut || 0)}
          {detail.pendingAllotmentCount ? ` · ${detail.pendingAllotmentCount} apps` : ''}
          ).
        </Typography.Paragraph>

        <ContentCard title="IPO-wise" style={{ marginBottom: 16 }}>
          <Table
            size="small"
            rowKey="ipoId"
            dataSource={detail.ipoWise || []}
            pagination={false}
            locale={{ emptyText: 'No IPO funds paid to this leader yet' }}
            columns={[
              {
                title: 'IPO',
                dataIndex: 'ipoName',
                render: (v, r) => (
                  <Link to={`/ipos/${r.ipoId}`}>
                    {v} <Tag>{r.ipoStatus}</Tag>
                  </Link>
                ),
              },
              { title: 'Apps', dataIndex: 'applicationCount', width: 70, align: 'right' },
              {
                title: 'Given',
                dataIndex: 'sent',
                align: 'right',
                render: (v) => formatCurrency(v),
              },
              {
                title: 'Returned',
                dataIndex: 'returned',
                align: 'right',
                render: (v) => formatCurrency(v),
              },
              {
                title: 'Pending',
                dataIndex: 'stillOut',
                align: 'right',
                render: (v, r) => (
                  <span>
                    <Typography.Text type={v > 0 ? 'warning' : undefined} strong={v > 0}>
                      {formatCurrency(v)}
                    </Typography.Text>
                    {r.pendingAllotmentOut > 0 && (
                      <Typography.Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
                        incl. pending allotment {formatCurrency(r.pendingAllotmentOut)}
                      </Typography.Text>
                    )}
                  </span>
                ),
              },
            ]}
          />
        </ContentCard>

        <ContentCard title="Cash & activity" style={{ marginBottom: 16 }}>
          <Table
            size="small"
            rowKey="id"
            loading={detailLoading}
            dataSource={detail.activity || []}
            pagination={{ pageSize: 20 }}
            columns={[
              {
                title: 'Date',
                dataIndex: 'txnDate',
                width: 120,
                render: (v) => (v ? dayjs(v).format('DD MMM YYYY') : '—'),
              },
              {
                title: 'Type',
                dataIndex: 'type',
                width: 110,
                render: (v, r) => (
                  <Tag color={v === 'SENT' ? 'blue' : v === 'RECEIVED' ? 'green' : 'orange'}>
                    {v}
                    {r.source === 'ipo_bulk' ? ' · IPO' : r.source === 'manual' ? ' · cash' : ''}
                  </Tag>
                ),
              },
              {
                title: 'Amount',
                dataIndex: 'amount',
                align: 'right',
                width: 120,
                render: (v) => formatCurrency(v),
              },
              {
                title: 'IPO',
                dataIndex: 'ipoName',
                render: (v) => v || '—',
              },
              {
                title: 'Notes',
                dataIndex: 'notes',
                ellipsis: true,
              },
              {
                title: '',
                width: 70,
                render: (_, r) =>
                  r.source === 'manual' ? (
                    <Popconfirm
                      title="Delete this cash entry?"
                      onConfirm={() => onDeleteTxn(detail.groupId, r.manualId)}
                    >
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  ) : null,
              },
            ]}
          />
        </ContentCard>

        {txnModal}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={
          <Space>
            <WalletOutlined />
            Leader wallets
          </Space>
        }
        subtitle="Each leader has their own cash wallet — match cash pending to IPO pending"
        extra={
          <Space wrap>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openCashTxn()}>
              Add cash entry
            </Button>
            <Link to="/wallet">
              <Button icon={<BankOutlined />}>Provider wallet</Button>
            </Link>
            <Link to="/member-groups">
              <Button>Manage sub-groups</Button>
            </Link>
          </Space>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <StatCard
            title="Provider balance"
            value={formatCurrency(provider?.balance)}
            icon={<BankOutlined />}
            variant="primary"
          />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard
            title="All cash sent"
            value={formatCurrency(cash?.sent)}
            icon={<TransactionOutlined />}
            variant="info"
          />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard
            title="All cash pending"
            value={formatCurrency(cash?.pending)}
            icon={<WalletOutlined />}
            variant="warning"
          />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard
            title="Leaders"
            value={String(leaderCards.length)}
            icon={<WalletOutlined />}
            variant="default"
          />
        </Col>
      </Row>

      <Typography.Title level={5} style={{ marginTop: 8, marginBottom: 12 }}>
        Leader wallets
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        Add cash SENT to each leader (₹1,50,000, ₹1,00,000…). Match when that leader’s cash pending equals their IPO pending.
      </Typography.Paragraph>

      <Row gutter={[16, 16]} className="leader-wallet-overview" style={{ marginBottom: 16 }}>
        {leaderCards.map((leader) => (
          <Col xs={24} md={12} xl={8} key={leader.groupId}>
            <LeaderWalletCard
              leader={leader}
              onOpen={openDetail}
              onAddCash={openCashTxn}
            />
          </Col>
        ))}
        {!loading && !leaderCards.length && (
          <Col span={24}>
            <ContentCard>
              <Typography.Text type="secondary">
                No leaders yet — <Link to="/member-groups">set a sub-group owner</Link> first.
              </Typography.Text>
            </ContentCard>
          </Col>
        )}
      </Row>

      {(rows || []).some((r) => !r.hasOwner) && (
        <ContentCard title="Groups without owner" style={{ marginBottom: 16 }}>
          <Table
            size="small"
            rowKey="groupId"
            pagination={false}
            dataSource={(rows || []).filter((r) => !r.hasOwner)}
            columns={[
              { title: 'Sub-group', dataIndex: 'groupName' },
              {
                title: 'Members',
                dataIndex: 'memberCount',
                width: 100,
                align: 'right',
              },
              {
                title: '',
                width: 140,
                render: () => (
                  <Link to="/member-groups">Set owner</Link>
                ),
              },
            ]}
          />
        </ContentCard>
      )}

      <ContentCard
        title="Cash ledger (all leaders)"
        style={{ marginBottom: 16 }}
        extra={
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openCashTxn()}>
            Add entry
          </Button>
        }
      >
        <Table
          {...tableDefaults}
          loading={loading}
          rowKey="id"
          dataSource={overview?.ledger || []}
          pagination={{ pageSize: 15 }}
          locale={{ emptyText: 'No cash entries yet — add SENT on a leader wallet' }}
          columns={[
            {
              title: 'Date',
              dataIndex: 'txnDate',
              width: 120,
              render: (v) => (v ? dayjs(v).format('DD MMM YYYY') : '—'),
            },
            {
              title: 'Leader',
              render: (_, r) => (
                <Button type="link" style={{ padding: 0 }} onClick={() => openDetail(r.groupId)}>
                  <span>
                    <Typography.Text strong>{r.leaderName || r.groupName}</Typography.Text>
                    <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                      {r.groupName}
                    </Typography.Text>
                  </span>
                </Button>
              ),
            },
            {
              title: 'Type',
              dataIndex: 'type',
              width: 110,
              render: (v) => (
                <Tag color={v === 'SENT' ? 'blue' : v === 'RECEIVED' ? 'green' : 'orange'}>{v}</Tag>
              ),
            },
            {
              title: 'Amount',
              dataIndex: 'amount',
              align: 'right',
              width: 120,
              render: (v) => formatCurrency(v),
            },
            {
              title: 'IPO',
              dataIndex: 'ipoName',
              render: (v) => v || '—',
            },
            {
              title: 'Notes',
              dataIndex: 'notes',
              ellipsis: true,
            },
            {
              title: '',
              width: 70,
              render: (_, r) => (
                <Popconfirm
                  title="Delete this cash entry?"
                  onConfirm={() => onDeleteTxn(r.groupId, r.id)}
                >
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              ),
            },
          ]}
        />
      </ContentCard>

      {txnModal}
    </div>
  );
}
