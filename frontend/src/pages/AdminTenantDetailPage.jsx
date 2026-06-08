import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Descriptions, Tag, Table, Button, Space, Spin, message, Modal, Input, Typography, Row, Col, Tabs,
} from 'antd';
import {
  ArrowLeftOutlined, CheckOutlined, CloseOutlined, ReloadOutlined,
  StopOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import adminClient from '../api/adminClient';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard from '../components/StatCard';
import { formatDateTime, formatCurrency, pnlClassName } from '../utils/format';
import { getErrorMessage } from '../utils/errors';

const STATUS_COLORS = { PENDING: 'gold', APPROVED: 'green', REJECTED: 'red', DISABLED: 'default' };

export default function AdminTenantDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = () => {
    setLoading(true);
    adminClient
      .get(`/admin/tenants/${id}`)
      .then((r) => setData(r.data))
      .catch((err) => {
        message.error(getErrorMessage(err));
        navigate('/admin/registrations');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const runAction = async (fn, successMsg) => {
    setActing(true);
    try {
      const { data: res } = await fn();
      message.success(successMsg || res.message);
      load();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setActing(false);
    }
  };

  const approve = () => runAction(() => adminClient.post(`/admin/registrations/${id}/approve`));
  const reopen = () => runAction(() => adminClient.post(`/admin/registrations/${id}/reopen`));

  const reject = () => {
    let reason = '';
    Modal.confirm({
      title: 'Reject this team?',
      content: <Input.TextArea rows={3} placeholder="Reason (optional)" onChange={(e) => { reason = e.target.value; }} />,
      okText: 'Reject',
      okButtonProps: { danger: true },
      onOk: () => runAction(() => adminClient.post(`/admin/registrations/${id}/reject`, { reason }), 'Team rejected'),
    });
  };

  const disable = () => {
    let reason = '';
    Modal.confirm({
      title: 'Disable this team?',
      content: (
        <div>
          <Typography.Text type="secondary">Managers and members will not be able to sign in.</Typography.Text>
          <Input.TextArea rows={3} placeholder="Reason (optional)" style={{ marginTop: 12 }} onChange={(e) => { reason = e.target.value; }} />
        </div>
      ),
      okText: 'Disable',
      okButtonProps: { danger: true },
      onOk: () => runAction(() => adminClient.post(`/admin/tenants/${id}/disable`, { reason }), 'Team disabled'),
    });
  };

  const enable = () => runAction(() => adminClient.post(`/admin/tenants/${id}/enable`), 'Team re-enabled');

  if (loading || !data) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;

  const { tenant, financial, members, fundProviders, bankAccounts, ipos, applications, memberSummary, memberPnL } = data;
  const f = financial;

  return (
    <div>
      <PageHeader
        title={tenant.name}
        subtitle={`Owner: ${tenant.owner_email}`}
        extra={
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/registrations')}>Back</Button>
            {tenant.status === 'PENDING' && (
              <>
                <Button type="primary" icon={<CheckOutlined />} loading={acting} onClick={approve}>Approve</Button>
                <Button danger icon={<CloseOutlined />} loading={acting} onClick={reject}>Reject</Button>
              </>
            )}
            {tenant.status === 'REJECTED' && (
              <Button icon={<ReloadOutlined />} loading={acting} onClick={reopen}>Reopen</Button>
            )}
            {tenant.status === 'APPROVED' && (
              <Button danger icon={<StopOutlined />} loading={acting} onClick={disable}>Disable team</Button>
            )}
            {tenant.status === 'DISABLED' && (
              <Button type="primary" icon={<CheckCircleOutlined />} loading={acting} onClick={enable}>Re-enable team</Button>
            )}
          </Space>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}><StatCard title="Wallet balance" value={formatCurrency(f.walletBalance)} variant="primary" /></Col>
        <Col xs={24} sm={12} lg={6}><StatCard title="Bank accounts" value={formatCurrency(f.bankBalance)} variant="info" /></Col>
        <Col xs={24} sm={12} lg={6}><StatCard title="Currently invested" value={formatCurrency(f.currentInvested)} variant="warning" /></Col>
        <Col xs={24} sm={12} lg={6}><StatCard title="Outstanding with members" value={formatCurrency(f.outstandingWithMembers)} variant="danger" /></Col>
        <Col xs={24} sm={12} lg={6}><StatCard title="IPO profit" value={formatCurrency(f.ipoProfit)} variant="success" valueClassName="amount-positive" /></Col>
        <Col xs={24} sm={12} lg={6}><StatCard title="IPO loss" value={formatCurrency(f.ipoLoss)} variant="danger" valueClassName="amount-negative" /></Col>
        <Col xs={24} sm={12} lg={6}><StatCard title="Net IPO P&L" value={formatCurrency(f.grossIpoPnL)} variant="primary" valueClassName={pnlClassName(f.grossIpoPnL)} /></Col>
        <Col xs={24} sm={12} lg={6}><StatCard title="Pending distribution" value={formatCurrency(f.grossPendingDistribution)} variant="warning" /></Col>
      </Row>

      <ContentCard title="Team & account">
        <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} bordered size="small">
          <Descriptions.Item label="Status"><Tag color={STATUS_COLORS[tenant.status]}>{tenant.status}</Tag></Descriptions.Item>
          <Descriptions.Item label="Owner">{tenant.owner_email}</Descriptions.Item>
          <Descriptions.Item label="Registered">{formatDateTime(tenant.created_at)}</Descriptions.Item>
          <Descriptions.Item label="Members">{members.length}</Descriptions.Item>
          <Descriptions.Item label="Fund providers">{fundProviders.length}</Descriptions.Item>
          <Descriptions.Item label="Open IPOs">{f.openIpos} / {f.totalIpos}</Descriptions.Item>
          <Descriptions.Item label="Total given to members">{formatCurrency(f.totalGivenToMembers)}</Descriptions.Item>
          <Descriptions.Item label="Total received">{formatCurrency(f.totalReceivedFromMembers)}</Descriptions.Item>
          <Descriptions.Item label="Provider net balance">{formatCurrency(f.providerNetBalance)}</Descriptions.Item>
          <Descriptions.Item label="Manager share (distributed)">{formatCurrency(f.managerShareTotal)}</Descriptions.Item>
          <Descriptions.Item label="Provider share">{formatCurrency(f.providerShareTotal)}</Descriptions.Item>
          <Descriptions.Item label="Member share">{formatCurrency(f.memberShareTotal)}</Descriptions.Item>
          {tenant.disable_reason && (
            <Descriptions.Item label="Disable reason" span={3}>{tenant.disable_reason}</Descriptions.Item>
          )}
          {tenant.rejection_reason && (
            <Descriptions.Item label="Rejection reason" span={3}>{tenant.rejection_reason}</Descriptions.Item>
          )}
        </Descriptions>
      </ContentCard>

      <div style={{ marginTop: 16 }}>
        <ContentCard title="Details">
          <Tabs
            items={[
              {
                key: 'members',
                label: `Members (${members.length})`,
                children: (
                  <Table
                    rowKey="memberId"
                    size="small"
                    scroll={{ x: 900 }}
                    dataSource={memberSummary}
                    pagination={{ pageSize: 20 }}
                    columns={[
                      { title: 'Name', dataIndex: 'displayName' },
                      { title: 'PAN', dataIndex: 'pan' },
                      { title: 'Status', dataIndex: 'status', render: (s) => <Tag color={s === 'ACTIVE' ? 'green' : 'default'}>{s}</Tag> },
                      { title: 'Given', dataIndex: 'totalGiven', render: formatCurrency },
                      { title: 'Received', dataIndex: 'totalReceived', render: formatCurrency },
                      { title: 'Outstanding', dataIndex: 'willReceiveFromTeam', render: (v) => <span className={pnlClassName(v)}>{formatCurrency(v)}</span> },
                      { title: 'IPOs applied', dataIndex: 'iposApplied' },
                      { title: 'Allotted', dataIndex: 'iposAlloted' },
                      { title: 'IPO P&L', dataIndex: 'totalIpoProfit', render: (v) => <span className={pnlClassName(v)}>{formatCurrency(v)}</span> },
                    ]}
                  />
                ),
              },
              {
                key: 'applications',
                label: `IPO applications (${applications.length})`,
                children: (
                  <Table
                    rowKey="id"
                    size="small"
                    scroll={{ x: 1100 }}
                    dataSource={applications}
                    pagination={{ pageSize: 20 }}
                    columns={[
                      { title: 'IPO', dataIndex: 'ipo_name' },
                      { title: 'Member', dataIndex: 'member_name' },
                      { title: 'Amount', dataIndex: 'amount', render: formatCurrency },
                      { title: 'Allotment', dataIndex: 'allotment_status', render: (s) => <Tag>{s}</Tag> },
                      { title: 'P&L', dataIndex: 'profit_loss', render: (v) => v != null ? <span className={pnlClassName(v)}>{formatCurrency(v)}</span> : '—' },
                      { title: 'Given', dataIndex: 'date_given', render: (v) => v ? formatDateTime(v) : '—' },
                      { title: 'Received', dataIndex: 'date_received', render: (v) => v ? formatDateTime(v) : '—' },
                    ]}
                  />
                ),
              },
              {
                key: 'ipos',
                label: `IPOs (${ipos.length})`,
                children: (
                  <Table
                    rowKey="id"
                    size="small"
                    dataSource={ipos}
                    pagination={false}
                    columns={[
                      { title: 'Name', dataIndex: 'name' },
                      { title: 'Status', dataIndex: 'status', render: (s) => <Tag color={s === 'OPEN' ? 'blue' : 'default'}>{s}</Tag> },
                      { title: 'Lot (RII)', dataIndex: 'lot_amount_rii', render: formatCurrency },
                      { title: 'Segment', dataIndex: 'ipo_segment' },
                      { title: 'Created', dataIndex: 'created_at', render: formatDateTime },
                    ]}
                  />
                ),
              },
              {
                key: 'providers',
                label: `Fund providers (${fundProviders.length})`,
                children: (
                  <Table
                    rowKey="id"
                    size="small"
                    dataSource={fundProviders}
                    pagination={false}
                    columns={[
                      { title: 'Name', dataIndex: 'name' },
                      { title: 'Net balance', dataIndex: 'net_balance', render: formatCurrency },
                      { title: 'Created', dataIndex: 'created_at', render: formatDateTime },
                    ]}
                  />
                ),
              },
              {
                key: 'banks',
                label: `Bank accounts (${bankAccounts.length})`,
                children: (
                  <Table
                    rowKey="id"
                    size="small"
                    dataSource={bankAccounts}
                    pagination={false}
                    columns={[
                      { title: 'Label', dataIndex: 'label' },
                      { title: 'Bank', dataIndex: 'bank_name', render: (v) => v || '—' },
                      { title: 'Balance', dataIndex: 'balance', render: formatCurrency },
                      { title: 'Default', dataIndex: 'is_default', render: (v) => v ? <Tag color="blue">Yes</Tag> : '—' },
                      { title: 'Active', dataIndex: 'is_active', render: (v) => <Tag color={v ? 'green' : 'default'}>{v ? 'Yes' : 'No'}</Tag> },
                    ]}
                  />
                ),
              },
              ...(memberPnL?.length ? [{
                key: 'pnl',
                label: 'Profit sharing',
                children: (
                  <Table
                    rowKey="memberId"
                    size="small"
                    scroll={{ x: 900 }}
                    dataSource={memberPnL}
                    pagination={{ pageSize: 20 }}
                    columns={[
                      { title: 'Member', dataIndex: 'displayName' },
                      { title: 'PAN', dataIndex: 'pan' },
                      { title: 'IPO P&L', dataIndex: 'grossIpoPnL', render: (v) => <span className={pnlClassName(v)}>{formatCurrency(v)}</span> },
                      { title: 'Distributed', dataIndex: 'grossDistributed', render: formatCurrency },
                      { title: 'Manager share', dataIndex: 'managerShare', render: formatCurrency },
                      { title: 'Provider share', dataIndex: 'providerShare', render: formatCurrency },
                      { title: 'Member share', dataIndex: 'memberShare', render: formatCurrency },
                      { title: 'Pending', dataIndex: 'pendingGross', render: formatCurrency },
                    ]}
                  />
                ),
              }] : []),
            ]}
          />
        </ContentCard>
      </div>
    </div>
  );
}
