import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Col,
  Collapse,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
  Result,
} from 'antd';
import {
  StockOutlined,
  HourglassOutlined,
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
  RollbackOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';import dayjs from 'dayjs';
import {
  getAllotmentPortals,
  openAllotmentPortal,
  copyToClipboard,
  EXCHANGE_PORTALS,
} from '../utils/allotmentCheck';
import client from '../api/client';
import { formatCurrency, formatPan } from '../utils/format';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import ContentCard from '../components/ContentCard';
import PageLoading from '../components/PageLoading';
import MemberIpoDetailDrawer from '../components/MemberIpoDetailDrawer';
import { tableDefaults } from '../utils/table';
import { getErrorMessage } from '../utils/errors';
import {
  buildCollectionWhatsAppMessage,
  groupApplicationsByIpo,
  openWhatsAppReminder,
  statementToText,
  summarizeIpoGroupRows,
} from '../utils/memberPortal';
const allotmentColors = {
  PENDING: 'processing',
  ALLOTED: 'success',
  NOT_ALLOTED: 'default',
};

export default function MemberPortalPage() {
  const [dashboard, setDashboard] = useState(null);
  const [issues, setIssues] = useState([]);
  const [attention, setAttention] = useState([]);
  const [activity, setActivity] = useState([]);
  const [upcomingIpos, setUpcomingIpos] = useState([]);
  const [fundClaims, setFundClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [profileForm] = Form.useForm();
  const [claimForm] = Form.useForm();
  const [ipoDrawerId, setIpoDrawerId] = useState(null);

  const groupAppsEarly = dashboard?.subGroup?.groupApplications ?? [];
  const isGroupLeaderEarly = dashboard?.subGroup?.isLeader === true;
  const memberPanEarly = formatPan(dashboard?.member?.pan);

  const groupIpoGroups = useMemo(
    () => groupApplicationsByIpo(groupAppsEarly),
    [groupAppsEarly]
  );

  const personalIpoGroups = useMemo(
    () =>
      groupApplicationsByIpo(
        (dashboard?.ipoApplications ?? []).map((app) => ({
          ...app,
          memberName: dashboard?.member?.displayName || 'You',
          memberPan: memberPanEarly,
        }))
      ),
    [dashboard?.ipoApplications, dashboard?.member?.displayName, memberPanEarly]
  );

  const allotmentIpoGroups = useMemo(() => {
    if (isGroupLeaderEarly && groupAppsEarly.length) {
      return groupApplicationsByIpo(groupAppsEarly);
    }
    return groupApplicationsByIpo(
      (dashboard?.ipoApplications ?? []).map((app) => ({
        ...app,
        memberName: dashboard?.member?.displayName || 'You',
        memberPan: memberPanEarly,
      }))
    );
  }, [dashboard?.ipoApplications, dashboard?.member?.displayName, groupAppsEarly, isGroupLeaderEarly, memberPanEarly]);

  const load = () => {
    setLoadError(null);
    return Promise.allSettled([
      client.get('/member-portal/dashboard'),
      client.get('/member-portal/issues'),
      client.get('/member-portal/attention'),
      client.get('/member-portal/activity?limit=15'),
      client.get('/member-portal/upcoming-ipos'),
      client.get('/member-portal/fund-return-claims'),
    ]).then(([dashRes, issuesRes, attRes, actRes, ipoRes, claimsRes]) => {
      if (dashRes.status === 'fulfilled') {
        setDashboard(dashRes.value.data);
        profileForm.setFieldsValue({
          email: dashRes.value.data?.member?.email || '',
          upi: dashRes.value.data?.member?.upi || '',
        });
      } else {
        setDashboard(null);
        setLoadError(getErrorMessage(dashRes.reason, 'Could not load your portal'));
      }
      if (issuesRes.status === 'fulfilled') {
        setIssues(Array.isArray(issuesRes.value.data) ? issuesRes.value.data : []);
      } else setIssues([]);
      if (attRes.status === 'fulfilled') setAttention(attRes.value.data || []);
      else setAttention([]);
      if (actRes.status === 'fulfilled') setActivity(actRes.value.data || []);
      else setActivity([]);
      if (ipoRes.status === 'fulfilled') setUpcomingIpos(ipoRes.value.data || []);
      else setUpcomingIpos([]);
      if (claimsRes.status === 'fulfilled') setFundClaims(claimsRes.value.data || []);
      else setFundClaims([]);
      if (issuesRes.status === 'rejected' && dashRes.status === 'fulfilled') {
        message.warning('Could not load your issues list');
      }
    });
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const onSubmitIssue = async (values) => {
    setSubmitting(true);
    try {
      await client.post('/member-portal/issues', {
        note: values.note?.trim(),
        category: values.category || 'OTHER',
      });
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

  const onSaveProfile = async (values) => {
    setProfileSubmitting(true);
    try {
      await client.patch('/member-portal/profile', {
        email: values.email?.trim() || null,
        upi: values.upi?.trim() || null,
      });
      message.success('Profile updated');
      await load();
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not update profile'));
    } finally {
      setProfileSubmitting(false);
    }
  };

  const onSubmitClaim = async (values) => {
    setClaimSubmitting(true);
    try {
      await client.post('/member-portal/fund-return-claims', {
        amount: values.amount,
        paymentRef: values.paymentRef?.trim() || undefined,
        notes: values.notes?.trim() || undefined,
        txnDate: new Date().toISOString(),
      });
      message.success('Fund return reported to your manager');
      claimForm.resetFields();
      const { data } = await client.get('/member-portal/fund-return-claims');
      setFundClaims(data);
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not submit claim'));
    } finally {
      setClaimSubmitting(false);
    }
  };

  const downloadStatement = async (format = 'json') => {
    try {
      const { data } = await client.get('/member-portal/statement');
      const blob =
        format === 'text'
          ? new Blob([statementToText(data)], { type: 'text/plain;charset=utf-8' })
          : new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const ext = format === 'text' ? 'txt' : 'json';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `member-statement-${dayjs().format('YYYY-MM-DD')}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not download statement'));
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
  const memberProfit = stats.totalMemberShare ?? 0;
  const grossIpoPnL = stats.grossIpoPnL ?? 0;
  const pendingReturn = stats.pendingReturn ?? 0;
  const memberPan = formatPan(dashboard?.member?.pan);
  const isGroupLeader = subGroup?.isLeader === true;
  const groupMembers = subGroup?.members ?? [];
  const groupApps = subGroup?.groupApplications ?? [];
  const groupStats = subGroup?.groupStats ?? {};
  const totalGroupPendingReturn = groupMembers.reduce(
    (sum, m) => sum + Number(m.pendingReturn ?? 0),
    0
  );
  const hasPendingAllotment =
    (dashboard?.ipoApplications ?? []).some((a) => a.allotmentStatus === 'PENDING') ||
    groupApps.some((a) => a.allotmentStatus === 'PENDING');

  const membersOwing = groupMembers.filter(
    (m) => !m.isLeader && Number(m.pendingReturn ?? 0) > 0
  );

  const resolveIpoId = (ipoName) =>
    upcomingIpos.find((i) => i.name === ipoName)?.id ??
    groupApps.find((a) => a.ipoName === ipoName)?.ipoId ??
    null;

  const openIpoDetail = (ipoId) => {
    if (ipoId) setIpoDrawerId(ipoId);
  };

  const handleAttentionAction = (item) => {
    if (item.action === 'fund-return' || item.action === 'issues' || item.action === 'collections') {
      document.getElementById('member-tools')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (item.action === 'allotment') {
      document.getElementById('member-allotment')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (item.action === 'upcoming') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (item.action === 'ipo' && item.ipoName) {
      openIpoDetail(resolveIpoId(item.ipoName));
    }
  };

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
      title: 'IPO gross P&L',
      dataIndex: 'grossProfitLoss',
      render: (v, row) =>
        row.allotmentStatus !== 'ALLOTED' || v == null ? '—' : (
          <span className={Number(v) >= 0 ? 'amount-positive' : 'amount-negative'}>
            {formatCurrency(v)}
          </span>
        ),
    },
    {
      title: 'Your profit share',
      dataIndex: 'memberShare',
      render: (v, row) => {
        if (row.allotmentStatus !== 'ALLOTED' || row.grossProfitLoss == null) return '—';
        if (v == null) return <Tag color="warning">Pending split</Tag>;
        return (
          <span className={Number(v) >= 0 ? 'amount-positive' : 'amount-negative'}>
            {formatCurrency(v)}
          </span>
        );
      },
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

  const ledgerTypeLabel = (t) => {
    if (t === 'GIVEN') return 'IPO fund from manager';
    if (t === 'RECEIVED') return 'Returned to manager';
    return t;
  };

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
          {ledgerTypeLabel(t)}
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
    { title: 'PAN', dataIndex: 'pan', render: (v) => formatPan(v) || '—' },
    {
      title: 'UPI',
      dataIndex: 'upi',
      render: (v) => v || '—',
    },
    {
      title: 'IPOs',
      dataIndex: 'iposApplied',
      align: 'center',
    },
    {
      title: 'Allotted',
      dataIndex: 'iposAlloted',
      align: 'center',
      render: (v) => v ?? 0,
    },
    {
      title: 'IPO gross P&L',
      dataIndex: 'grossIpoPnL',
      render: (v) =>
        v == null || v === 0 ? '—' : (
          <span className={Number(v) >= 0 ? 'amount-positive' : 'amount-negative'}>
            {formatCurrency(v)}
          </span>
        ),
    },
    {
      title: 'Member share',
      dataIndex: 'totalMemberShare',
      render: (v) =>
        v == null || v === 0 ? '—' : (
          <span className={Number(v) >= 0 ? 'amount-positive' : 'amount-negative'}>
            {formatCurrency(v)}
          </span>
        ),
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

  const groupAppCols = [
    { title: 'Member', dataIndex: 'memberName' },
    { title: 'PAN', dataIndex: 'memberPan', render: (v) => formatPan(v) || '—' },
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
      title: 'Fund return',
      dataIndex: 'fundReturned',
      render: (v) => (v ? <Tag color="success">Returned</Tag> : <Tag color="warning">Pending</Tag>),
    },
    {
      title: 'IPO gross P&L',
      dataIndex: 'grossProfitLoss',
      render: (v, row) =>
        row.allotmentStatus !== 'ALLOTED' || v == null ? '—' : (
          <span className={Number(v) >= 0 ? 'amount-positive' : 'amount-negative'}>
            {formatCurrency(v)}
          </span>
        ),
    },
    {
      title: 'Member share',
      dataIndex: 'memberShare',
      render: (v, row) => {
        if (row.allotmentStatus !== 'ALLOTED' || row.grossProfitLoss == null) return '—';
        if (v == null) return <Tag color="warning">Pending split</Tag>;
        return (
          <span className={Number(v) >= 0 ? 'amount-positive' : 'amount-negative'}>
            {formatCurrency(v)}
          </span>
        );
      },
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
    {
      title: 'Category',
      dataIndex: 'category',
      render: (v) => <Tag>{v || 'OTHER'}</Tag>,
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

  const copyField = async (value, label) => {
    if (!value) return;
    const ok = await copyToClipboard(value);
    message[ok ? 'success' : 'error'](ok ? `${label} copied` : 'Could not copy');
  };

  return (
    <div className="member-portal-page">
      <PageHeader
        title={`Hello, ${dashboard?.member?.displayName || 'Member'}`}
        subtitle="Your fund flow, IPO applications, and profit summary"
      />

      {pendingReturn > 0 && (
        <Alert
          type="warning"
          showIcon
          className="member-portal-alert"
          message={`${formatCurrency(pendingReturn)} pending to return to your manager`}
          description="This is the difference between fund received from your team and what you have returned so far."
        />
      )}

      {attention.length > 0 && (
        <ContentCard title="Needs your attention" style={{ marginBottom: 24 }}>
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            {attention.map((item) => (
              <Alert
                key={item.id}
                type={item.priority === 'high' ? 'warning' : item.priority === 'medium' ? 'info' : 'success'}
                showIcon
                message={item.title}
                description={
                  <Space direction="vertical" size={4}>
                    {item.detail ? <span>{item.detail}</span> : null}
                    {item.action ? (
                      <Button type="link" size="small" style={{ padding: 0 }} onClick={() => handleAttentionAction(item)}>
                        View details
                      </Button>
                    ) : null}
                  </Space>
                }
              />
            ))}
          </Space>
        </ContentCard>
      )}

      {upcomingIpos.length > 0 && (
        <ContentCard title="Upcoming & open IPOs" style={{ marginBottom: 24 }}>
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={upcomingIpos.slice(0, 8)}
            onRow={(row) => ({
              onClick: () => openIpoDetail(row.id),
              style: { cursor: 'pointer' },
            })}
            columns={[
              { title: 'IPO', dataIndex: 'name' },
              { title: 'Status', dataIndex: 'status', render: (s) => <Tag color={s === 'OPEN' ? 'green' : 'default'}>{s}</Tag> },
              { title: 'Open date', dataIndex: 'openDate', render: (v) => (v ? dayjs(v).format('DD MMM YYYY') : '—') },
              { title: 'Applied', dataIndex: 'applied', render: (v, row) => (v ? <Tag color="blue">{row.allotmentStatus || 'Yes'}</Tag> : <Tag>Not yet</Tag>) },
              { title: 'Lot (RII)', dataIndex: 'lotAmountRii', render: (v) => formatCurrency(v) },
            ]}
            {...tableDefaults}
          />
        </ContentCard>
      )}

      {activity.length > 0 && (
        <ContentCard
          title="Recent activity"
          style={{ marginBottom: 24 }}
          extra={
            <Button type="link" onClick={() => document.getElementById('member-activity')?.scrollIntoView({ behavior: 'smooth' })}>
              View all
            </Button>
          }
        >
          <Table
            rowKey="id"
            size="small"
            pagination={activity.length > 5 ? { pageSize: 5 } : false}
            dataSource={activity.slice(0, 5)}
            onRow={(row) => ({
              onClick: () => row.ipoId && openIpoDetail(row.ipoId),
              style: row.ipoId ? { cursor: 'pointer' } : undefined,
            })}
            columns={[
              { title: 'When', dataIndex: 'at', render: (v) => dayjs(v).format('DD MMM YYYY HH:mm') },
              { title: 'Event', dataIndex: 'title' },
              { title: 'Amount', dataIndex: 'amount', render: (v) => (v != null ? formatCurrency(v) : '—') },
            ]}
            {...tableDefaults}
          />
        </ContentCard>
      )}

      <ContentCard title="Your profile" style={{ marginBottom: 24 }}>
        <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }} className="member-portal-profile">
          <Descriptions.Item label="PAN">
            {memberPan ? (
              <Space size={4}>
                <Typography.Text code>{memberPan}</Typography.Text>
                <Button type="text" size="small" icon={<CopyOutlined />} onClick={copyMyPan} aria-label="Copy PAN" />
              </Space>
            ) : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Sub-group">
            {subGroup ? <Tag color="blue">{subGroup.name}</Tag> : <Typography.Text type="secondary">Not assigned</Typography.Text>}
          </Descriptions.Item>
          <Descriptions.Item label="Role">
            {isGroupLeader ? (
              <Tag color="gold" icon={<CrownOutlined />}>Sub-group leader</Tag>
            ) : subGroup?.leaderDisplayName ? (
              <Typography.Text type="secondary">Member</Typography.Text>
            ) : (
              '—'
            )}
          </Descriptions.Item>
          {subGroup && !isGroupLeader && (
            <Descriptions.Item label="Group leader" span={{ xs: 1, sm: 2, lg: 3 }}>
              {subGroup.leaderDisplayName ? (
                <Space size={4} wrap>
                  <Typography.Text strong>{subGroup.leaderDisplayName}</Typography.Text>
                  {subGroup.leaderPan && <Typography.Text code>{formatPan(subGroup.leaderPan)}</Typography.Text>}
                </Space>
              ) : (
                <Typography.Text type="secondary">No leader assigned yet</Typography.Text>
              )}
            </Descriptions.Item>
          )}
          <Descriptions.Item label="Email">
            {dashboard?.member?.email ? (
              <Space size={4}>
                <a href={`mailto:${dashboard.member.email}`}>{dashboard.member.email}</a>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => copyField(dashboard.member.email, 'Email')}
                  aria-label="Copy email"
                />
              </Space>
            ) : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="UPI">
            {dashboard?.member?.upi ? (
              <Space size={4}>
                <Typography.Text code>{dashboard.member.upi}</Typography.Text>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => copyField(dashboard.member.upi, 'UPI')}
                  aria-label="Copy UPI"
                />
              </Space>
            ) : '—'}
          </Descriptions.Item>
        </Descriptions>
        <Typography.Title level={5} style={{ marginTop: 16 }}>Update contact details</Typography.Title>
        <Form form={profileForm} layout="vertical" onFinish={onSaveProfile} style={{ maxWidth: 480 }}>
          <Form.Item name="email" label="Email">
            <Input type="email" placeholder="you@example.com" />
          </Form.Item>
          <Form.Item name="upi" label="UPI ID">
            <Input placeholder="name@upi" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={profileSubmitting}>Save profile</Button>
        </Form>
      </ContentCard>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <ContentCard title="Report fund return">
            <Typography.Paragraph type="secondary">
              Tell your manager you paid them back. They will confirm and update your ledger.
            </Typography.Paragraph>
            <Form form={claimForm} layout="vertical" onFinish={onSubmitClaim}>
              <Form.Item name="amount" label="Amount returned" rules={[{ required: true, message: 'Enter amount' }]}>
                <InputNumber min={1} style={{ width: '100%' }} addonBefore="₹" />
              </Form.Item>
              <Form.Item name="paymentRef" label="UPI / transaction ref">
                <Input placeholder="Optional reference" />
              </Form.Item>
              <Form.Item name="notes" label="Notes">
                <Input.TextArea rows={2} maxLength={1000} />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={claimSubmitting}>Submit to manager</Button>
            </Form>
          </ContentCard>
        </Col>
        <Col xs={24} lg={12}>
          <ContentCard title="Statement & fund return claims">
            <Space style={{ marginBottom: 16 }}>
              <Button onClick={() => downloadStatement('text')}>Download statement (TXT)</Button>
              <Button onClick={() => downloadStatement('json')}>Download statement (JSON)</Button>
            </Space>
            <Table
              rowKey="id"
              size="small"
              dataSource={fundClaims}
              pagination={fundClaims.length > 5 ? { pageSize: 5 } : false}
              locale={{ emptyText: 'No fund return claims yet' }}
              columns={[
                { title: 'Amount', dataIndex: 'amount', render: (v) => formatCurrency(v) },
                { title: 'Status', dataIndex: 'status', render: (s) => <Tag color={s === 'ACKNOWLEDGED' ? 'success' : s === 'REJECTED' ? 'error' : 'warning'}>{s}</Tag> },
                { title: 'Submitted', dataIndex: 'createdAt', render: (v) => dayjs(v).format('DD MMM YYYY') },
              ]}
              {...tableDefaults}
            />
          </ContentCard>
        </Col>
      </Row>

      <ContentCard title="Overview" style={{ marginBottom: 24 }}>
        <Typography.Text type="secondary" className="member-portal-section-label">Fund</Typography.Text>
        <div className="member-portal-stat-grid member-portal-stat-grid--3">
          <StatCard
            title="Fund received"
            value={formatCurrency(stats.totalGiven ?? 0)}
            icon={<ArrowDownOutlined />}
            variant="warning"
          />
          <StatCard
            title="Fund returned"
            value={formatCurrency(stats.totalReceived ?? 0)}
            icon={<ArrowUpOutlined />}
            variant="success"
          />
          <StatCard
            title="Pending to return"
            value={formatCurrency(pendingReturn)}
            icon={<RollbackOutlined />}
            variant={pendingReturn !== 0 ? 'danger' : 'primary'}
            valueClassName={pendingReturn !== 0 ? 'stat-card-value--loss' : ''}
          />
        </div>

        <Typography.Text type="secondary" className="member-portal-section-label">IPO</Typography.Text>
        <div className="member-portal-stat-grid member-portal-stat-grid--ipo ipo-summary-stats">
          <StatCard
            title="Applied"
            value={stats.iposApplied ?? 0}
            icon={<StockOutlined />}
            variant="primary"
          />
          <StatCard
            title="Pending allotment"
            value={stats.iposPending ?? 0}
            icon={<HourglassOutlined />}
            variant="warning"
          />
          <StatCard
            title="Allotted"
            value={stats.iposAlloted ?? 0}
            icon={<CheckCircleOutlined />}
            variant="info"
          />
          <StatCard
            title="Not allotted"
            value={stats.iposNotAlloted ?? 0}
            icon={<CloseCircleOutlined />}
            variant="danger"
          />
          <StatCard
            title="Your profit share"
            value={formatCurrency(memberProfit)}
            icon={<RiseOutlined />}
            variant={memberProfit >= 0 ? 'success' : 'danger'}
            valueClassName={memberProfit >= 0 ? 'stat-card-value--profit' : 'stat-card-value--loss'}
          />
          {(stats.bonus ?? 0) > 0 && (
            <StatCard
              title="Bonus"
              value={formatCurrency(stats.bonus)}
              icon={<FundOutlined />}
              variant="success"
            />
          )}
        </div>
        {grossIpoPnL !== 0 && Math.abs(grossIpoPnL - memberProfit) > 0.01 && (
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 13 }}>
            Total IPO profit before your team split: {formatCurrency(grossIpoPnL)}
            {' · '}
            Your share is based on rules set by your manager.
          </Typography.Text>
        )}
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
            description="Bulk IPO funds are paid to you on behalf of your group. Below is each member’s IPO allotment, profit, and pending return to your manager."
          />
          {(groupStats.iposApplied ?? 0) > 0 && (
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col xs={12} sm={6}>
                <StatCard title="Group IPOs" value={groupStats.iposApplied ?? 0} variant="primary" />
              </Col>
              <Col xs={12} sm={6}>
                <StatCard title="Allotted" value={groupStats.iposAlloted ?? 0} variant="success" />
              </Col>
              <Col xs={12} sm={6}>
                <StatCard
                  title="Group IPO P&L"
                  value={formatCurrency(groupStats.grossIpoPnL ?? 0)}
                  variant="primary"
                  valueClassName={
                    Number(groupStats.grossIpoPnL ?? 0) >= 0 ? 'amount-positive' : 'amount-negative'
                  }
                />
              </Col>
              <Col xs={12} sm={6}>
                <StatCard
                  title="Group member share"
                  value={formatCurrency(groupStats.totalMemberShare ?? 0)}
                  variant="success"
                />
              </Col>
            </Row>
          )}
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            Members ({subGroup.memberCount ?? groupMembers.length})
          </Typography.Title>
          {totalGroupPendingReturn > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message={`${formatCurrency(totalGroupPendingReturn)} total pending to refund to manager`}
              description="Sum of each member’s pending return (fund received minus returned)."
            />
          )}
          <Table
            rowKey="id"
            columns={groupMemberCols}
            dataSource={groupMembers}
            pagination={groupMembers.length > 10 ? { pageSize: 10 } : false}
            locale={{ emptyText: 'No members in this sub-group' }}
            scroll={{ x: 'max-content' }}
            style={{ marginBottom: 24 }}
            {...tableDefaults}
            summary={() =>
              groupMembers.length > 0 ? (
                <Table.Summary fixed>
                  <Table.Summary.Row style={{ fontWeight: 600, background: '#fff7ed' }}>
                    <Table.Summary.Cell index={0} colSpan={5}>
                      Total to refund to manager
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5}>
                      <span className={totalGroupPendingReturn !== 0 ? 'amount-negative' : undefined}>
                        {formatCurrency(totalGroupPendingReturn)}
                      </span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} colSpan={3} />
                  </Table.Summary.Row>
                </Table.Summary>
              ) : null
            }
          />
          {groupIpoGroups.length > 0 && (
            <>
              <Typography.Title level={5}>Group IPO applications (by IPO)</Typography.Title>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
                Grouped by IPO name. Click an IPO header to expand members.
              </Typography.Paragraph>
              <Collapse
                style={{ marginBottom: 24 }}
                items={groupIpoGroups.map(({ ipoName, ipoId, rows }) => ({
                  key: ipoName,
                  label: (
                    <Space>
                      <Button type="link" style={{ padding: 0 }} onClick={(e) => { e.stopPropagation(); openIpoDetail(ipoId ?? resolveIpoId(ipoName)); }}>
                        {ipoName}
                      </Button>
                      <Typography.Text type="secondary">{summarizeIpoGroupRows(rows)}</Typography.Text>
                    </Space>
                  ),
                  children: (
                    <Table
                      rowKey="id"
                      size="small"
                      columns={groupAppCols}
                      dataSource={rows}
                      pagination={false}
                      scroll={{ x: 'max-content' }}
                      {...tableDefaults}
                    />
                  ),
                }))}
              />
            </>
          )}
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

      <ContentCard title="Your IPO applications (by IPO)" style={{ marginBottom: 24 }}>
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
                  <Typography.Text code>{memberPan}</Typography.Text>, then search.
                </span>
                <Space wrap>
                  <Button size="small" icon={<CopyOutlined />} onClick={copyMyPan}>Copy my PAN</Button>
                  {getAllotmentPortals().map((p) => (
                    <Button key={p.id} size="small" icon={<LinkOutlined />} onClick={() => openAllotmentPortal(p.url)}>
                      {p.name}
                    </Button>
                  ))}
                </Space>
              </Space>
            }
          />
        )}
        {personalIpoGroups.length ? (
          <Collapse
            items={personalIpoGroups.map(({ ipoName, rows }) => ({
              key: ipoName,
              label: (
                <Space>
                  <span>{ipoName}</span>
                  <Typography.Text type="secondary">{summarizeIpoGroupRows(rows)}</Typography.Text>
                </Space>
              ),
              children: (
                <Table rowKey="id" size="small" columns={ipoCols} dataSource={rows} pagination={false} {...tableDefaults} />
              ),
            }))}
          />
        ) : (
          <Typography.Text type="secondary">No IPO applications yet</Typography.Text>
        )}
      </ContentCard>

      <ContentCard id="member-allotment" title={isGroupLeader ? 'Allotment — your sub-group' : 'Allotment status'} style={{ marginBottom: 24 }}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          Grouped by IPO. Copy each member PAN and check on official BSE/NSE portals.
        </Typography.Paragraph>
        {allotmentIpoGroups.length ? (
          <Collapse
            items={allotmentIpoGroups.map(({ ipoName, rows }) => ({
              key: `allot-${ipoName}`,
              label: (
                <Space>
                  <span>{ipoName}</span>
                  <Typography.Text type="secondary">{summarizeIpoGroupRows(rows)}</Typography.Text>
                </Space>
              ),
              children: (
                <Table
                  rowKey={(r) => `${r.id}-${r.memberPan}`}
                  size="small"
                  pagination={false}
                  dataSource={rows}
                  columns={[
                    { title: 'Member', dataIndex: 'memberName' },
                    { title: 'PAN', dataIndex: 'memberPan', render: (v) => formatPan(v) },
                    { title: 'Amount', dataIndex: 'amount', render: (v) => formatCurrency(v) },
                    {
                      title: 'Allotment',
                      dataIndex: 'allotmentStatus',
                      render: (s) => <Tag color={allotmentColors[s]}>{s.replace(/_/g, ' ')}</Tag>,
                    },
                    {
                      title: '',
                      key: 'copy',
                      render: (_, row) => (
                        <Button size="small" icon={<CopyOutlined />} onClick={() => copyField(formatPan(row.memberPan), 'PAN')}>
                          Copy PAN
                        </Button>
                      ),
                    },
                  ]}
                  {...tableDefaults}
                />
              ),
            }))}
          />
        ) : (
          <Typography.Text type="secondary">No IPO applications yet</Typography.Text>
        )}
      </ContentCard>

      {isGroupLeader && membersOwing.length > 0 && (
        <ContentCard title="Collect from members" style={{ marginBottom: 24 }}>
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={`${formatCurrency(membersOwing.reduce((s, m) => s + Number(m.pendingReturn ?? 0), 0))} pending across ${membersOwing.length} member(s)`}
            description="Remind members to return IPO fund to you, then you refund your manager."
          />
          <Table
            rowKey="id"
            size="small"
            dataSource={membersOwing}
            pagination={membersOwing.length > 8 ? { pageSize: 8 } : false}
            columns={[
              { title: 'Member', dataIndex: 'displayName' },
              { title: 'PAN', dataIndex: 'pan', render: (v) => formatPan(v) },
              { title: 'UPI', dataIndex: 'upi', render: (v) => v || '—' },
              { title: 'Pending', dataIndex: 'pendingReturn', render: (v) => formatCurrency(v) },
              {
                title: 'Actions',
                key: 'actions',
                render: (_, row) => (
                  <Space>
                    {row.upi ? (
                      <Button size="small" icon={<CopyOutlined />} onClick={() => copyField(row.upi, 'UPI')}>
                        Copy UPI
                      </Button>
                    ) : null}
                    <Button
                      size="small"
                      icon={<WhatsAppOutlined />}
                      onClick={() =>
                        openWhatsAppReminder(
                          buildCollectionWhatsAppMessage(
                            row.displayName,
                            Number(row.pendingReturn),
                            dashboard?.member?.displayName
                          )
                        )
                      }
                    >
                      WhatsApp
                    </Button>
                  </Space>
                ),
              },
            ]}
            {...tableDefaults}
          />
        </ContentCard>
      )}

      {activity.length > 0 && (
        <ContentCard id="member-activity" title="Full activity feed" style={{ marginBottom: 24 }}>
          <Table
            rowKey="id"
            size="small"
            pagination={activity.length > 15 ? { pageSize: 15 } : false}
            dataSource={activity}
            onRow={(row) => ({
              onClick: () => row.ipoId && openIpoDetail(row.ipoId),
              style: row.ipoId ? { cursor: 'pointer' } : undefined,
            })}
            columns={[
              { title: 'When', dataIndex: 'at', render: (v) => dayjs(v).format('DD MMM YYYY HH:mm') },
              { title: 'Event', dataIndex: 'title' },
              { title: 'Detail', dataIndex: 'detail', ellipsis: true, render: (v) => v || '—' },
              { title: 'Amount', dataIndex: 'amount', render: (v) => (v != null ? formatCurrency(v) : '—') },
            ]}
            {...tableDefaults}
          />
        </ContentCard>
      )}

      {(dashboard?.ledgerEntries ?? []).length > 0 && (
        <ContentCard title="Your transactions" style={{ marginBottom: 24 }}>
          {isGroupLeader ? (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
              Your personal fund ledger — not collections from sub-group members. Each row is your own IPO
              share from the manager. The combined bulk UPI paid to you for the whole group is listed above
              under Bulk payments received.
            </Typography.Paragraph>
          ) : (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
              Fund the manager sent you for IPOs and what you have returned.
            </Typography.Paragraph>
          )}
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

      <Row gutter={[16, 16]} id="member-tools">
        <Col xs={24} lg={12}>
          <ContentCard title="Raise an Issue">
            <Typography.Paragraph type="secondary">
              Describe any problem or question. Your manager will see this in their dashboard alerts.
            </Typography.Paragraph>
            <Form form={form} layout="vertical" onFinish={onSubmitIssue} initialValues={{ category: 'OTHER' }}>
              <Form.Item name="category" label="Category">
                <Select
                  options={[
                    { value: 'PAYMENT', label: 'Payment' },
                    { value: 'PROFIT', label: 'Profit' },
                    { value: 'ALLOTMENT', label: 'Allotment' },
                    { value: 'FUND_RETURN', label: 'Fund return' },
                    { value: 'OTHER', label: 'Other' },
                  ]}
                />
              </Form.Item>
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

      <MemberIpoDetailDrawer
        ipoId={ipoDrawerId}
        open={!!ipoDrawerId}
        onClose={() => setIpoDrawerId(null)}
      />
    </div>
  );
}
