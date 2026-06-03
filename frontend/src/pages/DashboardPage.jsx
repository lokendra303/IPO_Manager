import { useEffect, useMemo, useState } from 'react';
import { Alert, Col, Row, Table, Tag, Button } from 'antd';
import {
  WalletOutlined,
  RiseOutlined,
  TeamOutlined,
  ArrowRightOutlined,
  BellOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { formatCurrency } from '../utils/format';
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
};

export default function DashboardPage() {
  const [wallet, setWallet] = useState(null);
  const [summary, setSummary] = useState(null);
  const [txns, setTxns] = useState([]);
  const [openIssueCount, setOpenIssueCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      client.get('/wallet'),
      client.get('/summary'),
      client.get('/wallet/transactions'),
      client.get('/member-issues/count'),
    ])
      .then(([w, s, t, issues]) => {
        setWallet(w.data);
        setSummary(s.data);
        setTxns(t.data.slice(0, 8));
        setOpenIssueCount(issues.data.openCount ?? 0);
      })
      .finally(() => setLoading(false));
  }, []);

  const pendingReturns = useMemo(
    () => (summary?.rows ?? []).filter((r) => Number(r.willReceiveFromTeam) > 0),
    [summary]
  );
  const totalPendingReturn = pendingReturns.reduce((s, r) => s + Number(r.willReceiveFromTeam), 0);

  if (loading) return <PageLoading />;

  const profit = summary?.totals?.totalIpoProfit ?? 0;
  const activeMembers = summary?.rows?.filter((r) => r.status === 'ACTIVE').length ?? 0;

  const txnCols = [
    { title: 'Date', dataIndex: 'txn_date', render: (v) => new Date(v).toLocaleString('en-IN') },
    { title: 'Type', dataIndex: 'type', render: (t) => <Tag color={typeColors[t]}>{t.replace(/_/g, ' ')}</Tag> },
    {
      title: 'Amount',
      dataIndex: 'amount',
      render: (v) => (
        <span className={Number(v) >= 0 ? 'amount-positive' : 'amount-negative'}>{formatCurrency(v)}</span>
      ),
    },
    { title: 'Balance', dataIndex: 'balance_after', render: (v) => formatCurrency(v) },
    { title: 'Notes', dataIndex: 'notes', ellipsis: true },
  ];

  const pendingCols = [
    { title: 'Member', dataIndex: 'displayName' },
    { title: 'PAN', dataIndex: 'pan' },
    {
      title: 'Pending return',
      dataIndex: 'willReceiveFromTeam',
      render: (v) => <span className="amount-negative">{formatCurrency(v)}</span>,
    },
    {
      title: 'Sub-Group',
      dataIndex: 'memberGroupName',
      render: (v) => (v ? <Tag>{v}</Tag> : '—'),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your wallet, team, and recent activity"
      />
      {openIssueCount > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<BellOutlined />}
          message={`${openIssueCount} open member issue${openIssueCount === 1 ? '' : 's'} need attention`}
          action={
            <Link to="/notifications">
              <Button size="small" type="primary">
                View notifications
              </Button>
            </Link>
          }
          style={{ marginBottom: 16 }}
        />
      )}
      {pendingReturns.length > 0 && (
        <Alert
          type="error"
          showIcon
          icon={<ClockCircleOutlined />}
          message={`${formatCurrency(totalPendingReturn)} pending from ${pendingReturns.length} member${pendingReturns.length === 1 ? '' : 's'} (Given − Received)`}
          action={
            <Link to="/summary">
              <Button size="small">View summary</Button>
            </Link>
          }
          style={{ marginBottom: 24 }}
        />
      )}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <StatCard
            title="Wallet Balance"
            value={formatCurrency(wallet?.balance ?? 0)}
            icon={<WalletOutlined />}
            variant="primary"
          />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard
            title="Total IPO Profit"
            value={formatCurrency(profit)}
            icon={<RiseOutlined />}
            variant={profit >= 0 ? 'success' : 'danger'}
            valueClassName={profit >= 0 ? 'stat-card-value--profit' : 'stat-card-value--loss'}
          />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard
            title="Active Members"
            value={activeMembers}
            icon={<TeamOutlined />}
            variant="info"
          />
        </Col>
      </Row>
      {pendingReturns.length > 0 && (
        <ContentCard
          title="Pending fund returns"
          extra={
            <Link to="/summary">
              <Button type="link" icon={<ArrowRightOutlined />}>
                Full summary
              </Button>
            </Link>
          }
          style={{ marginBottom: 24 }}
        >
          <Table
            rowKey="memberId"
            columns={pendingCols}
            dataSource={pendingReturns.slice(0, 8)}
            pagination={false}
            {...tableDefaults}
          />
        </ContentCard>
      )}
      <ContentCard
        title="Recent Wallet Transactions"
        extra={
          <Link to="/wallet">
            <Button type="link" icon={<ArrowRightOutlined />}>
              View all
            </Button>
          </Link>
        }
      >
        <Table rowKey="id" columns={txnCols} dataSource={txns} pagination={false} {...tableDefaults} />
      </ContentCard>
    </div>
  );
}
