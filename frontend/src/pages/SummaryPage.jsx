import { useEffect, useState } from 'react';
import { Table, Col, Row, Tag, Tooltip } from 'antd';
import {
  InfoCircleOutlined,
  WalletOutlined,
  BankOutlined,
  RiseOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import client from '../api/client';
import { formatCurrency } from '../utils/format';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import ContentCard from '../components/ContentCard';
import PageLoading from '../components/PageLoading';
import { tableDefaults } from '../utils/table';

export default function SummaryPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get('/summary').then((r) => setData(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoading />;

  const profit = data.totals.totalIpoProfit;

  const columns = [
    { title: 'Member', dataIndex: 'displayName', fixed: 'left', render: (v) => <span style={{ fontWeight: 500 }}>{v}</span> },
    { title: 'PAN', dataIndex: 'pan' },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (s) => <Tag color={s === 'ACTIVE' ? 'success' : 'error'}>{s}</Tag>,
    },
    { title: 'Total Given', dataIndex: 'totalGiven', render: formatCurrency },
    { title: 'Total Received', dataIndex: 'totalReceived', render: formatCurrency },
    { title: 'Bonus', dataIndex: 'bonus', render: (v) => (v ? formatCurrency(v) : '—') },
    { title: 'IPOs Applied', dataIndex: 'iposApplied' },
    { title: 'IPOs Alloted', dataIndex: 'iposAlloted' },
    {
      title: 'Total IPO Profit',
      dataIndex: 'totalIpoProfit',
      render: (v) => (
        <span className={Number(v) < 0 ? 'amount-negative' : Number(v) > 0 ? 'amount-positive' : ''}>
          {formatCurrency(v)}
        </span>
      ),
    },
    {
      title: (
        <span>
          Pending From Team{' '}
          <Tooltip title="Total Given minus Total Received — highlighted when non-zero">
            <InfoCircleOutlined style={{ color: '#94a3b8' }} />
          </Tooltip>
        </span>
      ),
      dataIndex: 'willReceiveFromTeam',
      render: (v) => (
        <span className={Number(v) !== 0 ? 'amount-negative' : ''}>{formatCurrency(v)}</span>
      ),
    },
    { title: 'Bulk Group', dataIndex: 'bulkGroupLabel', ellipsis: true },
  ];

  return (
    <div>
      <PageHeader
        title="Team Summary"
        subtitle="Aggregated funds, IPO stats, and profit across all members"
      />
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Free Wallet" value={formatCurrency(data.availableFreeAmount)} icon={<WalletOutlined />} variant="primary" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Provider Net" value={formatCurrency(data.providerNetBalance)} icon={<BankOutlined />} variant="info" />
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
                <Table.Summary.Cell>
                  <span className={profit >= 0 ? 'amount-positive' : 'amount-negative'}>
                    {formatCurrency(data.totals.totalIpoProfit)}
                  </span>
                </Table.Summary.Cell>
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
