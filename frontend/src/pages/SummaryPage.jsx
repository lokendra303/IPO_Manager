import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Table, Col, Row, Tag, Tooltip } from 'antd';
import {
  InfoCircleOutlined,
  WalletOutlined,
  BankOutlined,
  RiseOutlined,
  ClockCircleOutlined,
  FundOutlined,
} from '@ant-design/icons';
import client from '../api/client';
import { formatCurrency, formatPan, pnlClassName } from '../utils/format';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import ContentCard from '../components/ContentCard';
import PageLoading from '../components/PageLoading';
import { tableDefaults } from '../utils/table';

function renderPnl(value) {
  return <span className={pnlClassName(value)}>{formatCurrency(value)}</span>;
}

export default function SummaryPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get('/summary').then((r) => setData(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoading />;

  const profit = data.totals.totalIpoProfit;
  const ipo = data.ipoSummary;
  const ipoTotals = ipo?.totals;
  const openIpoRows = (ipo?.rows ?? []).filter((r) => r.status === 'OPEN');
  const openIpoTotals = openIpoRows.reduce(
    (acc, r) => ({
      totalDistributed: acc.totalDistributed + Number(r.totalDistributed || 0),
      totalReturned: acc.totalReturned + Number(r.totalReturned || 0),
      pendingReturn: acc.pendingReturn + Number(r.pendingReturn || 0),
      applicationCount: acc.applicationCount + Number(r.applicationCount || 0),
    }),
    { totalDistributed: 0, totalReturned: 0, pendingReturn: 0, applicationCount: 0 }
  );

  const ipoColumns = [
    {
      title: 'IPO',
      dataIndex: 'name',
      fixed: 'left',
      width: 180,
      ellipsis: true,
      render: (v, r) => (
        <Link to={`/ipos/${r.ipoId}`} style={{ fontWeight: 500 }}>
          {v}
        </Link>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 88,
      render: (s) => <Tag color={s === 'OPEN' ? 'success' : 'default'}>{s}</Tag>,
    },
    {
      title: 'Segment',
      dataIndex: 'ipoSegment',
      width: 100,
      render: (v) => (v === 'SME' ? 'SME' : 'Mainboard'),
    },
    { title: 'Members', dataIndex: 'applicationCount', width: 88, align: 'center' },
    { title: 'Distributed', dataIndex: 'totalDistributed', width: 120, render: formatCurrency },
    { title: 'Returned', dataIndex: 'totalReturned', width: 120, render: formatCurrency },
    {
      title: (
        <span>
          Pending Return{' '}
          <Tooltip title="Distributed amount not yet marked as received back to wallet">
            <InfoCircleOutlined style={{ color: '#94a3b8' }} />
          </Tooltip>
        </span>
      ),
      dataIndex: 'pendingReturn',
      width: 130,
      render: (v) => (
        <span className={Number(v) > 0 ? 'amount-negative' : ''}>{formatCurrency(v)}</span>
      ),
    },
    {
      title: 'Fund returns',
      width: 110,
      align: 'center',
      render: (_, r) => `${r.returnedCount} / ${r.applicationCount}`,
    },
    { title: 'Alloted', dataIndex: 'allottedCount', width: 80, align: 'center' },
    { title: 'Not Alloted', dataIndex: 'notAllottedCount', width: 96, align: 'center' },
    { title: 'Did not apply', dataIndex: 'notAppliedCount', width: 108, align: 'center' },
    { title: 'Pending allot.', dataIndex: 'pendingAllotmentCount', width: 108, align: 'center' },
    {
      title: 'Gross P&L',
      dataIndex: 'totalProfitLoss',
      width: 120,
      render: renderPnl,
    },
    {
      title: 'Provider share',
      dataIndex: 'shareProviderTotal',
      width: 120,
      render: (v) => (v ? renderPnl(v) : '—'),
    },
    {
      title: 'Manager share',
      dataIndex: 'shareManagerTotal',
      width: 120,
      render: (v) => (v ? renderPnl(v) : '—'),
    },
    {
      title: 'Member share',
      dataIndex: 'shareMemberTotal',
      width: 120,
      render: (v) => (v ? renderPnl(v) : '—'),
    },
    {
      title: 'P&L splits',
      dataIndex: 'profitSharedCount',
      width: 88,
      align: 'center',
      render: (v) => v || '—',
    },
  ];

  const columns = [
    { title: 'Member', dataIndex: 'displayName', fixed: 'left', render: (v) => <span style={{ fontWeight: 500 }}>{v}</span> },
    { title: 'PAN', dataIndex: 'pan', render: (v) => formatPan(v) || '—' },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (s) => <Tag color={s === 'ACTIVE' ? 'success' : 'error'}>{s}</Tag>,
    },
    { title: 'Total Given', dataIndex: 'totalGiven', render: formatCurrency },
    {
      title: (
        <span>
          Total Received{' '}
          <Tooltip title="Money this member paid back to you (UPI/refund). Not used for sub-group bulk paid to owner.">
            <InfoCircleOutlined style={{ color: '#94a3b8' }} />
          </Tooltip>
        </span>
      ),
      dataIndex: 'totalReceived',
      render: formatCurrency,
    },
    { title: 'Bonus', dataIndex: 'bonus', render: (v) => (v ? formatCurrency(v) : '—') },
    { title: 'IPOs Applied', dataIndex: 'iposApplied' },
    { title: 'IPOs Alloted', dataIndex: 'iposAlloted' },
    {
      title: 'Total IPO Profit',
      dataIndex: 'totalIpoProfit',
      render: renderPnl,
    },
    {
      title: (
        <span>
          Pending From Team{' '}
          <Tooltip title="Principal still owed back on allotted or not-allotted IPOs (excludes applications still awaiting allotment)">
            <InfoCircleOutlined style={{ color: '#94a3b8' }} />
          </Tooltip>
        </span>
      ),
      dataIndex: 'willReceiveFromTeam',
      render: (v) => (
        <span className={Number(v) !== 0 ? 'amount-negative' : ''}>{formatCurrency(v)}</span>
      ),
    },
    { title: 'Sub-Group', dataIndex: 'memberGroupName', ellipsis: true },
  ];

  return (
    <div>
      <PageHeader
        title="Team Summary"
        subtitle="IPO-wise and member-wise funds, allotments, returns, and profit & loss"
      />
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Free Wallet" value={formatCurrency(data.availableFreeAmount)} icon={<WalletOutlined />} variant="primary" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Distributed (open IPOs)"
            value={formatCurrency(openIpoTotals.totalDistributed)}
            icon={<FundOutlined />}
            variant="info"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Team IPO Profit"
            value={formatCurrency(profit)}
            icon={<RiseOutlined />}
            variant={profit >= 0 ? 'success' : 'danger'}
            valueClassName={profit >= 0 ? 'stat-card-value--profit' : 'stat-card-value--loss'}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Pending From Team" value={formatCurrency(data.totals.willReceiveFromTeam)} icon={<ClockCircleOutlined />} variant="warning" />
        </Col>
      </Row>

      {openIpoRows.length > 0 && (
        <ContentCard
          title={`Open IPOs — current distributed (${openIpoRows.length})`}
          style={{ marginBottom: 24 }}
        >
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={8} lg={8}>
              <StatCard
                title="Distributed now"
                value={formatCurrency(openIpoTotals.totalDistributed)}
                icon={<FundOutlined />}
                variant="info"
              />
            </Col>
            <Col xs={24} sm={8} lg={8}>
              <StatCard
                title="Returned"
                value={formatCurrency(openIpoTotals.totalReturned)}
                icon={<RiseOutlined />}
                variant="success"
              />
            </Col>
            <Col xs={24} sm={8} lg={8}>
              <StatCard
                title="Still with members"
                value={formatCurrency(openIpoTotals.pendingReturn)}
                icon={<ClockCircleOutlined />}
                variant="warning"
              />
            </Col>
          </Row>
          <Table
            rowKey="ipoId"
            columns={[
              {
                title: 'IPO',
                dataIndex: 'name',
                render: (v, r) => (
                  <Link to={`/ipos/${r.ipoId}`} style={{ fontWeight: 500 }}>
                    {v}
                  </Link>
                ),
              },
              { title: 'Distributed', dataIndex: 'totalDistributed', render: formatCurrency },
              { title: 'Returned', dataIndex: 'totalReturned', render: formatCurrency },
              {
                title: 'Still with members',
                dataIndex: 'pendingReturn',
                render: (v) => (
                  <span className={Number(v) > 0 ? 'amount-negative' : ''}>{formatCurrency(v)}</span>
                ),
              },
              { title: 'Members', dataIndex: 'applicationCount', align: 'center' },
            ]}
            dataSource={openIpoRows}
            pagination={false}
            {...tableDefaults}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ fontWeight: 600, background: '#f0fdfa' }}>
                  <Table.Summary.Cell index={0}>TOTAL</Table.Summary.Cell>
                  <Table.Summary.Cell>{formatCurrency(openIpoTotals.totalDistributed)}</Table.Summary.Cell>
                  <Table.Summary.Cell>{formatCurrency(openIpoTotals.totalReturned)}</Table.Summary.Cell>
                  <Table.Summary.Cell>{formatCurrency(openIpoTotals.pendingReturn)}</Table.Summary.Cell>
                  <Table.Summary.Cell>{openIpoTotals.applicationCount}</Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        </ContentCard>
      )}

      {ipo?.rows?.length > 0 && (
        <div style={{ marginBottom: 24 }}>
        <ContentCard title={`All IPOs — full summary (${ipoTotals.ipoCount})`}>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={8} lg={6}>
              <StatCard
                title="Total Distributed (all)"
                value={formatCurrency(ipoTotals.totalDistributed)}
                icon={<FundOutlined />}
                variant="info"
              />
            </Col>
            <Col xs={24} sm={8} lg={6}>
              <StatCard
                title="Gross IPO P&L"
                value={formatCurrency(ipoTotals.totalProfitLoss)}
                icon={<RiseOutlined />}
                variant={ipoTotals.totalProfitLoss >= 0 ? 'success' : 'danger'}
                valueClassName={ipoTotals.totalProfitLoss >= 0 ? 'stat-card-value--profit' : 'stat-card-value--loss'}
              />
            </Col>
            <Col xs={24} sm={8} lg={6}>
              <StatCard
                title="Pending IPO Returns"
                value={formatCurrency(ipoTotals.pendingReturn)}
                icon={<ClockCircleOutlined />}
                variant="warning"
              />
            </Col>
            <Col xs={24} sm={8} lg={6}>
              <StatCard
                title="Manager Share (all IPOs)"
                value={formatCurrency(ipoTotals.shareManagerTotal)}
                icon={<BankOutlined />}
                variant="primary"
              />
            </Col>
          </Row>
          <Table
            rowKey="ipoId"
            columns={ipoColumns}
            dataSource={ipo.rows}
            scroll={{ x: 1800 }}
            pagination={false}
            {...tableDefaults}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ fontWeight: 600, background: '#f0fdfa' }}>
                  <Table.Summary.Cell index={0} colSpan={3}>TOTAL</Table.Summary.Cell>
                  <Table.Summary.Cell>{ipoTotals.applicationCount}</Table.Summary.Cell>
                  <Table.Summary.Cell>{formatCurrency(ipoTotals.totalDistributed)}</Table.Summary.Cell>
                  <Table.Summary.Cell>{formatCurrency(ipoTotals.totalReturned)}</Table.Summary.Cell>
                  <Table.Summary.Cell>{formatCurrency(ipoTotals.pendingReturn)}</Table.Summary.Cell>
                  <Table.Summary.Cell>{ipoTotals.returnedCount} / {ipoTotals.applicationCount}</Table.Summary.Cell>
                  <Table.Summary.Cell>{ipoTotals.allottedCount}</Table.Summary.Cell>
                  <Table.Summary.Cell>{ipoTotals.notAllottedCount}</Table.Summary.Cell>
                  <Table.Summary.Cell>{ipoTotals.notAppliedCount}</Table.Summary.Cell>
                  <Table.Summary.Cell>{ipoTotals.pendingAllotmentCount}</Table.Summary.Cell>
                  <Table.Summary.Cell>{renderPnl(ipoTotals.totalProfitLoss)}</Table.Summary.Cell>
                  <Table.Summary.Cell>{renderPnl(ipoTotals.shareProviderTotal)}</Table.Summary.Cell>
                  <Table.Summary.Cell>{renderPnl(ipoTotals.shareManagerTotal)}</Table.Summary.Cell>
                  <Table.Summary.Cell>{renderPnl(ipoTotals.shareMemberTotal)}</Table.Summary.Cell>
                  <Table.Summary.Cell>{ipoTotals.profitSharedCount || '—'}</Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        </ContentCard>
        </div>
      )}

      <ContentCard title="Member-wise Summary">
        <Table
          rowKey="memberId"
          columns={columns}
          dataSource={data.rows}
          scroll={{ x: 1400 }}
          rowClassName={(r) => (r.mismatch ? 'summary-mismatch' : '')}
          pagination={false}
          {...tableDefaults}
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row style={{ fontWeight: 600, background: '#f0fdfa' }}>
                <Table.Summary.Cell index={0} colSpan={3}>TOTAL</Table.Summary.Cell>
                <Table.Summary.Cell>{formatCurrency(data.totals.totalGiven)}</Table.Summary.Cell>
                <Table.Summary.Cell>{formatCurrency(data.totals.totalReceived)}</Table.Summary.Cell>
                <Table.Summary.Cell />
                <Table.Summary.Cell>{data.totals.iposApplied}</Table.Summary.Cell>
                <Table.Summary.Cell>{data.totals.iposAlloted}</Table.Summary.Cell>
                <Table.Summary.Cell>{renderPnl(data.totals.totalIpoProfit)}</Table.Summary.Cell>
                <Table.Summary.Cell>{formatCurrency(data.totals.willReceiveFromTeam)}</Table.Summary.Cell>
                <Table.Summary.Cell />
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </ContentCard>
    </div>
  );
}
