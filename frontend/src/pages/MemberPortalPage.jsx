import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Col,
  Form,
  Input,
  Row,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  StockOutlined,
  ClockCircleOutlined,
  RiseOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
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
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const load = () =>
    Promise.all([client.get('/member-portal/dashboard'), client.get('/member-portal/issues')]).then(
      ([d, i]) => {
        setDashboard(d.data);
        setIssues(i.data);
      }
    );

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

  const stats = dashboard?.stats ?? {};
  const profit = stats.totalIpoProfit ?? 0;

  const ipoCols = [
    { title: 'IPO', dataIndex: 'ipoName' },
    {
      title: 'Amount',
      dataIndex: 'amount',
      render: (v) => formatCurrency(v),
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
  ];

  const issueCols = [
    {
      title: 'Submitted',
      dataIndex: 'created_at',
      render: (v) => new Date(v).toLocaleString('en-IN'),
    },
    { title: 'Note', dataIndex: 'note', ellipsis: true },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (s) => <Tag color={s === 'OPEN' ? 'orange' : 'green'}>{s}</Tag>,
    },
  ];

  return (
    <div>
      <PageHeader
        title={`Hello, ${dashboard?.member?.displayName || 'Member'}`}
        subtitle="Your IPO applications and profit summary"
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="IPOs Applied"
            value={stats.iposApplied ?? 0}
            icon={<StockOutlined />}
            variant="primary"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Pending Allotment"
            value={stats.iposPending ?? 0}
            icon={<ClockCircleOutlined />}
            variant="warning"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Allotted"
            value={stats.iposAlloted ?? 0}
            icon={<CheckCircleOutlined />}
            variant="info"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Total Profit"
            value={formatCurrency(profit)}
            icon={<RiseOutlined />}
            variant={profit >= 0 ? 'success' : 'danger'}
            valueClassName={profit >= 0 ? 'stat-card-value--profit' : 'stat-card-value--loss'}
          />
        </Col>
      </Row>

      <ContentCard title="Your IPO Applications" style={{ marginBottom: 24 }}>
        <Table
          rowKey="id"
          columns={ipoCols}
          dataSource={dashboard?.ipoApplications ?? []}
          pagination={false}
          locale={{ emptyText: 'No IPO applications yet' }}
          {...tableDefaults}
        />
      </ContentCard>

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
