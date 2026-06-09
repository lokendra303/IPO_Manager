import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Col,
  Form,
  Input,
  Row,
  Space,
  Table,
  Tag,
  Typography,
  message,
  Result,
} from 'antd';
import {
  StockOutlined,
  ClockCircleOutlined,
  RiseOutlined,
  CheckCircleOutlined,
  LinkOutlined,
  CopyOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  FundOutlined,
  CloseCircleOutlined,
  TeamOutlined,
  CrownOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getAllotmentPortals,
  openAllotmentPortal,
  copyToClipboard,
  EXCHANGE_PORTALS,
} from '../utils/allotmentCheck';
import client from '../api/client';
import { formatCurrency } from '../utils/format';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import ContentCard from '../components/ContentCard';
import PageLoading from '../components/PageLoading';
import { tableDefaults } from '../utils/table';
import { getErrorMessage } from '../utils/errors';

const allotmentColors = {
  PENDING: 'processing',
  ALLOTED: 'success',
  NOT_ALLOTED: 'default',
};

export default function MemberPortalPage() {
  const [dashboard, setDashboard] = useState(null);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const load = () => {
    setLoadError(null);
    return Promise.allSettled([
      client.get('/member-portal/dashboard'),
      client.get('/member-portal/issues'),
    ]).then(([dashRes, issuesRes]) => {
      if (dashRes.status === 'fulfilled') {
        setDashboard(dashRes.value.data);
      } else {
        setDashboard(null);
        setLoadError(getErrorMessage(dashRes.reason, 'Could not load your portal'));
      }
      if (issuesRes.status === 'fulfilled') {
        setIssues(Array.isArray(issuesRes.value.data) ? issuesRes.value.data : []);
      } else {
        setIssues([]);
        if (dashRes.status === 'fulfilled') {
          message.warning('Could not load your issues list');
        }
      }
    });
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const onSubmitIssue = async (values) => {
    setSubmitting(true);
    try {
      await client.post('/member-portal/issues', { note: values.note?.trim() });
      message.success('Issue submitted — your manager will be notified');
      form.resetFields();
      const { data } = await client.get('/member-portal/issues');
      setIssues(data);
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not submit issue'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PageLoading />;

  if (loadError && !dashboard) {
    return (
      <div>
        <PageHeader title="Member portal" />
        <Result
          status="error"
          title="Could not load portal"
          subTitle={loadError}
          extra={
            <Button type="primary" onClick={() => { setLoading(true); load().finally(() => setLoading(false)); }}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  const stats = dashboard?.stats ?? {};
  const subGroup = dashboard?.subGroup;
  const profit = stats.totalIpoProfit ?? 0;
  const pendingReturn = stats.pendingReturn ?? 0;
  const memberPan = dashboard?.member?.pan;
  const isGroupLeader = subGroup?.isLeader === true;
  const hasPendingAllotment = (dashboard?.ipoApplications ?? []).some(
    (a) => a.allotmentStatus === 'PENDING'
  );

  const copyMyPan = async () => {
    if (!memberPan) return;
    const ok = await copyToClipboard(memberPan);
    message[ok ? 'success' : 'error'](ok ? 'Your PAN copied' : 'Could not copy');
  };

  const ipoCols = [
    { title: 'IPO', dataIndex: 'ipoName' },
    {
      title: 'Amount',
      dataIndex: 'amount',
      render: (v) => formatCurrency(v),
    },
    {
      title: 'Fund return',
      dataIndex: 'fundReturned',
      render: (returned, row) =>
        returned ? (
          <Tag color="success">Returned</Tag>
        ) : (
          <Tag color="warning">Pending {formatCurrency(row.amount)}</Tag>
        ),
    },
    {
      title: 'Allotment',
      dataIndex: 'allotmentStatus',
      render: (s) => <Tag color={allotmentColors[s]}>{s.replace(/_/g, ' ')}</Tag>,
    },
    {
      title: 'P&L',
      dataIndex: 'profitLoss',
      render: (v) =>
        v == null ? '—' : (
          <span className={Number(v) >= 0 ? 'amount-positive' : 'amount-negative'}>
            {formatCurrency(v)}
          </span>
        ),
    },
    {
      title: 'Check status',
      key: 'check',
      render: (_, row) =>
        row.allotmentStatus === 'PENDING' ? (
          <Button
            type="link"
            size="small"
            icon={<LinkOutlined />}
            onClick={() => openAllotmentPortal(EXCHANGE_PORTALS[0].url)}
          >
            BSE portal
          </Button>
        ) : (
          '—'
        ),
    },
  ];

  const ledgerCols = [
    {
      title: 'Date',
      dataIndex: 'txnDate',
      render: (v) => dayjs(v).format('DD MMM YYYY HH:mm'),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      render: (t) => (
        <Tag color={t === 'GIVEN' ? 'orange' : t === 'RECEIVED' ? 'green' : 'purple'}>
          {t === 'GIVEN' ? 'Received from team' : t === 'RECEIVED' ? 'Returned to team' : t}
        </Tag>
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      render: (v) => formatCurrency(v),
    },
    { title: 'IPO', dataIndex: 'ipoName', render: (v) => v || '—' },
    { title: 'Notes', dataIndex: 'notes', ellipsis: true, render: (v) => v || '—' },
  ];

  const groupMemberCols = [
    {
      title: 'Member',
      dataIndex: 'displayName',
      render: (v, row) => (
        <Space size={6}>
          <span style={{ fontWeight: row.isLeader ? 600 : 400 }}>{v}</span>
          {row.isLeader && <Tag color="gold">You</Tag>}
        </Space>
      ),
    },
    { title: 'PAN', dataIndex: 'pan' },
    {
      title: 'IPOs',
      dataIndex: 'iposApplied',
      align: 'center',
    },
    {
      title: 'Pending return',
      dataIndex: 'pendingReturn',
      render: (v) => (
        <span className={Number(v) !== 0 ? 'amount-negative' : undefined}>
          {formatCurrency(v)}
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (s) => (
        <Tag color={s === 'ACTIVE' ? 'success' : 'default'}>
          {s === 'ACTIVE' ? 'Active' : 'Inactive'}
        </Tag>
      ),
    },
  ];

  const bulkPaymentCols = [
    {
      title: 'Date',
      dataIndex: 'paidAt',
      render: (v) => (v ? dayjs(v).format('DD MMM YYYY') : '—'),
    },
    { title: 'IPO', dataIndex: 'ipoName' },
    {
      title: 'Bulk transfer',
      dataIndex: 'totalAmount',
      render: (v) => formatCurrency(v),
    },
    {
      title: 'Members',
      dataIndex: 'memberCount',
      align: 'center',
    },
    {
      title: 'Category',
      dataIndex: 'investorCategory',
      render: (v) => (v ? <Tag>{v}</Tag> : '—'),
    },
  ];

  const issueCols = [
    {
      title: 'Submitted',
      dataIndex: 'created_at',
      render: (v) => new Date(v).toLocaleString('en-IN'),
    },
    { title: 'Your note', dataIndex: 'note', ellipsis: true },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (s) => <Tag color={s === 'OPEN' ? 'orange' : 'green'}>{s === 'OPEN' ? 'Open' : 'Resolved'}</Tag>,
    },
    {
      title: 'Manager reply',
      dataIndex: 'resolution_note',
      render: (v, row) =>
        row.status === 'RESOLVED' ? (
          v ? v : <Typography.Text type="secondary">Resolved (no note)</Typography.Text>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={`Hello, ${dashboard?.member?.displayName || 'Member'}`}
        subtitle="Your fund flow, IPO applications, and profit summary"
      />

      {pendingReturn > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 24 }}
          message={`${formatCurrency(pendingReturn)} pending to return to your manager`}
          description="This is the difference between fund received from your team and what you have returned so far."
        />
      )}

      {(dashboard?.member?.email || dashboard?.member?.upi || dashboard?.member?.pan || subGroup) && (
        <ContentCard title="Your profile" style={{ marginBottom: 24 }}>
          <Space direction="vertical" size={8}>
            {subGroup && (
              <Space wrap>
                <span>
                  Sub-group: <Tag color="blue">{subGroup.name}</Tag>
                </span>
                {isGroupLeader ? (
                  <Tag color="gold" icon={<CrownOutlined />}>Sub-group leader</Tag>
                ) : subGroup.leaderDisplayName ? (
                  <span>
                    Leader: <Typography.Text strong>{subGroup.leaderDisplayName}</Typography.Text>
                    {subGroup.leaderPan ? (
                      <> (<Typography.Text code>{subGroup.leaderPan}</Typography.Text>)</>
                    ) : null}
                  </span>
                ) : (
                  <Typography.Text type="secondary">No leader assigned yet</Typography.Text>
                )}
              </Space>
            )}
            {dashboard.member.pan && (
              <Space>
                <span>PAN: <Typography.Text code>{dashboard.member.pan}</Typography.Text></span>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={copyMyPan}
                  aria-label="Copy PAN"
                />
              </Space>
            )}
            {dashboard.member.email && (
              <Space>
                <span>
                  Email: <a href={`mailto:${dashboard.member.email}`}>{dashboard.member.email}</a>
                </span>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={async () => {
                    const ok = await copyToClipboard(dashboard.member.email);
                    message[ok ? 'success' : 'error'](ok ? 'Email copied' : 'Could not copy');
                  }}
                  aria-label="Copy email"
                />
              </Space>
            )}
            {dashboard.member.upi && (
              <Space>
                <span>UPI: <Typography.Text code>{dashboard.member.upi}</Typography.Text></span>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={async () => {
                    const ok = await copyToClipboard(dashboard.member.upi);
                    message[ok ? 'success' : 'error'](ok ? 'UPI copied' : 'Could not copy');
                  }}
                  aria-label="Copy UPI"
                />
              </Space>
            )}
          </Space>
        </ContentCard>
      )}

      <ContentCard title="Fund summary" style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <StatCard
              title="Fund received"
              value={formatCurrency(stats.totalGiven ?? 0)}
              icon={<ArrowDownOutlined />}
              variant="warning"
            />
          </Col>
          <Col xs={24} sm={8}>
            <StatCard
              title="Fund returned"
              value={formatCurrency(stats.totalReceived ?? 0)}
              icon={<ArrowUpOutlined />}
              variant="success"
            />
          </Col>
          <Col xs={24} sm={8}>
            <StatCard
              title="Pending to return"
              value={formatCurrency(pendingReturn)}
              icon={<ClockCircleOutlined />}
              variant={pendingReturn !== 0 ? 'danger' : 'primary'}
              valueClassName={pendingReturn !== 0 ? 'stat-card-value--loss' : ''}
            />
          </Col>
        </Row>
      </ContentCard>

      <ContentCard title="IPO summary" style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={8} lg={4}>
            <StatCard
              title="IPOs Applied"
              value={stats.iposApplied ?? 0}
              icon={<StockOutlined />}
              variant="primary"
            />
          </Col>
          <Col xs={12} sm={8} lg={4}>
            <StatCard
              title="Pending Allotment"
              value={stats.iposPending ?? 0}
              icon={<ClockCircleOutlined />}
              variant="warning"
            />
          </Col>
          <Col xs={12} sm={8} lg={4}>
            <StatCard
              title="Allotted"
              value={stats.iposAlloted ?? 0}
              icon={<CheckCircleOutlined />}
              variant="info"
            />
          </Col>
          <Col xs={12} sm={8} lg={4}>
            <StatCard
              title="Not Allotted"
              value={stats.iposNotAlloted ?? 0}
              icon={<CloseCircleOutlined />}
              variant="danger"
            />
          </Col>
          <Col xs={12} sm={8} lg={4}>
            <StatCard
              title="Total P&L"
              value={formatCurrency(profit)}
              icon={<RiseOutlined />}
              variant={profit >= 0 ? 'success' : 'danger'}
              valueClassName={profit >= 0 ? 'stat-card-value--profit' : 'stat-card-value--loss'}
            />
          </Col>
          {(stats.bonus ?? 0) > 0 && (
            <Col xs={12} sm={8} lg={4}>
              <StatCard
                title="Bonus"
                value={formatCurrency(stats.bonus)}
                icon={<FundOutlined />}
                variant="success"
              />
            </Col>
          )}
        </Row>
      </ContentCard>

      {isGroupLeader && (
        <ContentCard
          title={
            <Space>
              <TeamOutlined />
              Your sub-group — {subGroup.name}
            </Space>
          }
          style={{ marginBottom: 24 }}
        >
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="You are the sub-group leader"
            description="Bulk IPO funds are paid to you on behalf of your group. Collect from members and return to your manager. Below is each member’s pending return (fund received minus returned)."
          />
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            Members ({subGroup.memberCount ?? subGroup.members?.length ?? 0})
          </Typography.Title>
          <Table
            rowKey="id"
            columns={groupMemberCols}
            dataSource={subGroup.members ?? []}
            pagination={(subGroup.members?.length ?? 0) > 10 ? { pageSize: 10 } : false}
            locale={{ emptyText: 'No members in this sub-group' }}
            scroll={{ x: 'max-content' }}
            style={{ marginBottom: 24 }}
            {...tableDefaults}
          />
          <Typography.Title level={5}>Bulk payments received</Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            One transfer per IPO when your manager uses bulk pay to owner on Distribute.
          </Typography.Paragraph>
          <Table
            rowKey="id"
            columns={bulkPaymentCols}
            dataSource={subGroup.bulkPayments ?? []}
            pagination={(subGroup.bulkPayments?.length ?? 0) > 10 ? { pageSize: 10 } : false}
            locale={{ emptyText: 'No bulk payments yet' }}
            scroll={{ x: 'max-content' }}
            {...tableDefaults}
          />
        </ContentCard>
      )}

      <ContentCard title="Your IPO Applications" style={{ marginBottom: 24 }}>
        {hasPendingAllotment && memberPan && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="Check allotment with your PAN"
            description={
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <span>
                  After allotment day, use official BSE/NSE sites: select the IPO name, enter PAN{' '}
                  <Typography.Text code>{memberPan}</Typography.Text>, then search. Results are not
                  fetched automatically into this app.
                </span>
                <Space wrap>
                  <Button size="small" icon={<CopyOutlined />} onClick={copyMyPan}>
                    Copy my PAN
                  </Button>
                  {getAllotmentPortals().map((p) => (
                    <Button
                      key={p.id}
                      size="small"
                      icon={<LinkOutlined />}
                      onClick={() => openAllotmentPortal(p.url)}
                    >
                      {p.name}
                    </Button>
                  ))}
                </Space>
              </Space>
            }
          />
        )}
        <Table
          rowKey="id"
          columns={ipoCols}
          dataSource={dashboard?.ipoApplications ?? []}
          pagination={false}
          locale={{ emptyText: 'No IPO applications yet' }}
          {...tableDefaults}
        />
      </ContentCard>

      {(dashboard?.ledgerEntries ?? []).length > 0 && (
        <ContentCard title="Your transactions" style={{ marginBottom: 24 }}>
          <Table
            rowKey="id"
            columns={ledgerCols}
            dataSource={dashboard.ledgerEntries}
            pagination={dashboard.ledgerEntries.length > 10 ? { pageSize: 10 } : false}
            locale={{ emptyText: 'No transactions yet' }}
            scroll={{ x: 'max-content' }}
            {...tableDefaults}
          />
        </ContentCard>
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <ContentCard title="Raise an Issue">
            <Typography.Paragraph type="secondary">
              Describe any problem or question. Your manager will see this in their dashboard alerts.
            </Typography.Paragraph>
            <Form form={form} layout="vertical" onFinish={onSubmitIssue}>
              <Form.Item
                name="note"
                label="Issue / note"
                rules={[{ required: true, message: 'Please describe your issue' }]}
              >
                <Input.TextArea rows={4} placeholder="e.g. Payment not received for XYZ IPO..." maxLength={2000} showCount />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={submitting}>
                Submit issue
              </Button>
            </Form>
          </ContentCard>
        </Col>
        <Col xs={24} lg={12}>
          <ContentCard title="Your Submitted Issues">
            {issues.some((i) => i.status === 'RESOLVED' && i.resolution_note) && (
              <Alert
                type="success"
                showIcon
                message="Your manager replied to a resolved issue — see the reply column below"
                style={{ marginBottom: 16 }}
              />
            )}
            {issues.some((i) => i.status === 'OPEN') && (
              <Alert
                type="info"
                showIcon
                message="You have open issue(s) awaiting manager response"
                style={{ marginBottom: 16 }}
              />
            )}
            <Table
              rowKey="id"
              columns={issueCols}
              dataSource={issues}
              pagination={issues.length > 5 ? { pageSize: 5 } : false}
              locale={{ emptyText: 'No issues submitted yet' }}
              {...tableDefaults}
            />
          </ContentCard>
        </Col>
      </Row>
    </div>
  );
}
