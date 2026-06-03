import { useEffect, useState } from 'react';
import {
  Drawer, Spin, Row, Col, Table, Tag, Tabs, Descriptions, Empty, Alert,
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FundOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import StatCard from './StatCard';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import client from '../api/client';
import { formatCurrency } from '../utils/format';
import { getErrorMessage } from '../utils/errors';

const allotmentColors = {
  ALLOTED: 'green',
  NOT_ALLOTED: 'red',
  PENDING: 'default',
};

const allotmentLabels = {
  ALLOTED: 'Alloted',
  NOT_ALLOTED: 'Not Alloted',
  PENDING: 'Pending',
};

export default function MemberDetailDrawer({ memberId, open, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !memberId) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    client
      .get(`/members/${memberId}/detail`)
      .then((r) => setData(r.data))
      .catch((err) => setError(getErrorMessage(err, 'Failed to load member details')))
      .finally(() => setLoading(false));
  }, [open, memberId]);

  const m = data?.member;
  const s = data?.stats;

  const ipoColumns = [
    { title: 'IPO', dataIndex: 'ipo_name', render: (v, r) => (
      <Link to={`/ipos/${r.ipo_id}`} onClick={onClose}>{v}</Link>
    )},
    { title: 'Lot', dataIndex: 'lot_amount', render: formatCurrency },
    { title: 'Amount', dataIndex: 'amount', render: formatCurrency },
    { title: 'Received', dataIndex: 'trns_received', render: (v) => v ? <Tag color="green">{v}</Tag> : '—' },
    { title: 'Given', dataIndex: 'trns_given', render: (v) => v ? <Tag color="blue">{v}</Tag> : '—' },
    {
      title: 'Allotment',
      dataIndex: 'allotment_status',
      render: (v) => <Tag color={allotmentColors[v]}>{allotmentLabels[v] || v}</Tag>,
    },
    {
      title: 'P&L',
      dataIndex: 'profit_loss',
      render: (v, r) => {
        if (r.allotment_status !== 'ALLOTED') return '—';
        const n = Number(v ?? 0);
        return <span style={{ color: n < 0 ? '#cf1322' : n > 0 ? '#389e0d' : undefined }}>{formatCurrency(n)}</span>;
      },
    },
    { title: 'Remarks', dataIndex: 'remarks', ellipsis: true },
    { title: 'Date', dataIndex: 'created_at', render: (v) => dayjs(v).format('DD MMM YYYY') },
  ];

  const ledgerColumns = [
    { title: 'Date', dataIndex: 'txn_date', render: (v) => dayjs(v).format('DD MMM YYYY HH:mm') },
    {
      title: 'Type',
      dataIndex: 'type',
      render: (t) => <Tag color={t === 'GIVEN' ? 'orange' : t === 'RECEIVED' ? 'green' : 'purple'}>{t}</Tag>,
    },
    { title: 'Amount', dataIndex: 'amount', render: formatCurrency },
    { title: 'IPO', dataIndex: 'ipo_name', render: (v) => v || '—' },
    { title: 'Notes', dataIndex: 'notes', ellipsis: true },
  ];

  return (
    <Drawer
      title={m ? `${m.display_name} — Member Details` : 'Member Details'}
      open={open}
      onClose={onClose}
      width={960}
      className="member-drawer"
      destroyOnClose
    >
      {loading ? (
        <Spin style={{ display: 'block', margin: '48px auto' }} />
      ) : error ? (
        <Alert type="error" message={error} showIcon />
      ) : data ? (
        <>
          {m.status === 'INACTIVE' && (
            <Alert
              type="warning"
              showIcon
              message="This member is inactive"
              description="They are excluded from IPO distribute and cannot log in with PAN. Activate them from the Members page to restore access."
              style={{ marginBottom: 16 }}
            />
          )}
          <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="PAN">{m.pan}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={m.status === 'ACTIVE' ? 'green' : 'default'}>
                {m.status === 'ACTIVE' ? 'Active' : 'Inactive'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Relationship">{m.relationship_note || '—'}</Descriptions.Item>
            <Descriptions.Item label="Sub-Group">{m.member_group_name || '—'}</Descriptions.Item>
            <Descriptions.Item label="P&L share rules" span={2}>
              {data.profitShare?.configured ? (
                <div>
                  {(data.profitShare.rules || []).map((rule) => (
                    <div key={rule.id} style={{ marginBottom: 4 }}>
                      <Tag color="blue">{rule.ruleName}</Tag>
                      {' '}{rule.providerName}
                      {' · '}Profit: {rule.profitProviderPercent}% / {rule.profitManagerPercent}%
                      {' · '}Loss: {rule.lossProviderPercent}% / {rule.lossManagerPercent}%
                    </div>
                  ))}
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    Combined — Profit: {data.profitShare.profitProviderPercent}% + {data.profitShare.profitManagerPercent}% manager
                    {' · '}Loss: {data.profitShare.lossProviderPercent}% + {data.profitShare.lossManagerPercent}% manager
                  </div>
                </div>
              ) : (
                <Tag color="warning">Not configured — set under Profit Sharing</Tag>
              )}
            </Descriptions.Item>
          </Descriptions>

          <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
            <Col xs={12} sm={8}>
              <StatCard title="Total Given" value={formatCurrency(s.totalGiven)} variant="warning" icon={<ArrowUpOutlined />} />
            </Col>
            <Col xs={12} sm={8}>
              <StatCard title="Total Received" value={formatCurrency(s.totalReceived)} variant="success" icon={<ArrowDownOutlined />} />
            </Col>
            <Col xs={12} sm={8}>
              <StatCard
                title="Pending"
                value={formatCurrency(s.willReceiveFromTeam)}
                variant={s.willReceiveFromTeam !== 0 ? 'danger' : 'primary'}
                valueClassName={s.willReceiveFromTeam !== 0 ? 'stat-card-value--loss' : ''}
                icon={<ClockCircleOutlined />}
              />
            </Col>
            <Col xs={12} sm={6}>
              <StatCard title="Applied" value={s.iposApplied} variant="info" icon={<FundOutlined />} />
            </Col>
            <Col xs={12} sm={6}>
              <StatCard title="Alloted" value={s.iposAlloted} variant="success" icon={<CheckCircleOutlined />} />
            </Col>
            <Col xs={12} sm={6}>
              <StatCard title="Not Alloted" value={s.iposNotAlloted} variant="danger" icon={<CloseCircleOutlined />} />
            </Col>
            <Col xs={12} sm={6}>
              <StatCard title="Pending IPOs" value={s.iposPending} variant="primary" icon={<ClockCircleOutlined />} />
            </Col>
            <Col xs={24}>
              <StatCard
                title="Total IPO P&L"
                value={formatCurrency(s.totalIpoProfit)}
                variant={s.totalIpoProfit >= 0 ? 'success' : 'danger'}
                valueClassName={s.totalIpoProfit >= 0 ? 'stat-card-value--profit' : 'stat-card-value--loss'}
                icon={<FundOutlined />}
              />
            </Col>
          </Row>

          <Tabs
            items={[
              {
                key: 'ipos',
                label: `IPO Applications (${data.ipoApplications.length})`,
                children: data.ipoApplications.length ? (
                  <Table
                    rowKey="id"
                    columns={ipoColumns}
                    dataSource={data.ipoApplications}
                    pagination={{ pageSize: 10 }}
                    scroll={{ x: 800 }}
                    className="pro-table"
                    size="middle"
                  />
                ) : (
                  <Empty description="No IPO applications yet" />
                ),
              },
              {
                key: 'ledger',
                label: `Transactions (${data.ledgerEntries.length})`,
                children: data.ledgerEntries.length ? (
                  <Table
                    rowKey="id"
                    columns={ledgerColumns}
                    dataSource={data.ledgerEntries}
                    pagination={{ pageSize: 10 }}
                    className="pro-table"
                    size="middle"
                  />
                ) : (
                  <Empty description="No transactions yet" />
                ),
              },
            ]}
          />
        </>
      ) : null}
    </Drawer>
  );
}
