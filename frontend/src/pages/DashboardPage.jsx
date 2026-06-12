import { useEffect, useMemo, useState } from 'react';
import { Alert, Col, Row, Table, Tag, Button, Typography } from 'antd';
import {
  WalletOutlined,
  RiseOutlined,
  TeamOutlined,
  ArrowRightOutlined,
  BellOutlined,
  ClockCircleOutlined,
  UserOutlined,
  FallOutlined,
  BankOutlined,
  PercentageOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { formatCurrency, formatPan, pnlClassName } from '../utils/format';
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
  const [pnlTotals, setPnlTotals] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      client.get('/wallet'),
      client.get('/summary'),
      client.get('/wallet/transactions'),
      client.get('/member-issues/count'),
      client.get('/profit-shares/totals').catch(() => ({ data: null })),
    ])
      .then(([w, s, t, issues, pnl]) => {
        setWallet(w.data);
        setSummary(s.data);
        setTxns(t.data.slice(0, 8));
        setOpenIssueCount(issues.data.openCount ?? 0);
        setPnlTotals(pnl.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const pendingReturns = useMemo(
    () => (summary?.rows ?? []).filter((r) => Number(r.willReceiveFromTeam) > 0),
    [summary]
  );
  const totalPendingReturn = pendingReturns.reduce((s, r) => s + Number(r.willReceiveFromTeam), 0);

  if (loading) return <PageLoading />;

  const overall = pnlTotals?.overall ?? {};
  const managerNet = overall.managerShare ?? 0;
  const managerProfit = overall.managerProfit ?? 0;
  const managerLoss = overall.managerLoss ?? 0;
  const grossIpoPnL = overall.grossIpoPnL ?? summary?.totals?.totalIpoProfit ?? 0;
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
    { title: 'PAN', dataIndex: 'pan', render: (v) => formatPan(v) || '—' },
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
      <ContentCard
        title="P&L overview"
        extra={(
          <Link to="/profit-sharing" className="content-card-extra-link">
            Profit sharing details <ArrowRightOutlined />
          </Link>
        )}
        padded
        className="dashboard-manager-card"
        style={{ marginBottom: 24 }}
      >
        <div className="dashboard-stat-grid">
          <StatCard
            title="Wallet balance"
            value={formatCurrency(wallet?.balance ?? 0)}
            icon={<WalletOutlined />}
            variant="primary"
          />
          <StatCard
            title="Your net share"
            value={formatCurrency(managerNet)}
            icon={<UserOutlined />}
            variant={managerNet >= 0 ? 'success' : 'danger'}
            valueClassName={pnlClassName(managerNet)}
          />
          <StatCard
            title="Your profit share"
            value={formatCurrency(managerProfit)}
            icon={<RiseOutlined />}
            variant="success"
            valueClassName="stat-card-value--profit"
          />
          <StatCard
            title="Your loss share"
            value={formatCurrency(managerLoss)}
            icon={<FallOutlined />}
            variant="danger"
            valueClassName="stat-card-value--loss"
          />
          <StatCard
            title="Gross IPO P&L"
            value={formatCurrency(grossIpoPnL)}
            icon={<PercentageOutlined />}
            variant={grossIpoPnL >= 0 ? 'success' : 'danger'}
            valueClassName={pnlClassName(grossIpoPnL)}
          />
          <StatCard
            title="Provider share (given)"
            value={formatCurrency(overall.providerShare ?? 0)}
            icon={<BankOutlined />}
            variant="info"
          />
          <StatCard
            title="Member share (kept)"
            value={formatCurrency(overall.memberShare ?? 0)}
            icon={<TeamOutlined />}
            variant="default"
          />
          <Link to="/members" className="stat-card-link">
            <StatCard
              title="Active members"
              value={activeMembers}
              icon={<TeamOutlined />}
              variant="info"
            />
          </Link>
        </div>
        {(overall.pendingCount > 0 || overall.distributionCount > 0) && (
          <Typography.Text type="secondary" className="dashboard-stat-footnote">
            P&L splits done: {overall.distributionCount ?? 0}
            {(overall.pendingCount ?? 0) > 0 && (
              <>
                {' · '}
                Pending split: {formatCurrency(overall.grossPending ?? 0)} ({overall.pendingCount} application
                {overall.pendingCount === 1 ? '' : 's'})
              </>
            )}
          </Typography.Text>
        )}
      </ContentCard>
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
