import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Collapse,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
  Result,
} from 'antd';
import {
  CopyOutlined,
  RiseOutlined,
  RollbackOutlined,
  StockOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { copyToClipboard } from '../utils/allotmentCheck';
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
  groupApplicationsByIpo,
  summarizeIpoGroupRows,
} from '../utils/memberPortal';
import { downloadMemberFullLedgerPdf } from '../utils/memberLedgerPdf';

const allotmentColors = {
  PENDING: 'processing',
  ALLOTED: 'success',
  NOT_ALLOTED: 'default',
};

export default function MemberPortalPage() {
  const [dashboard, setDashboard] = useState(null);
  const [issues, setIssues] = useState([]);
  const [attention, setAttention] = useState([]);
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
  const [pdfLoading, setPdfLoading] = useState(false);

  const memberPanEarly = formatPan(dashboard?.member?.pan);

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

  const load = () => {
    setLoadError(null);
    return Promise.allSettled([
      client.get('/member-portal/dashboard'),
      client.get('/member-portal/issues'),
      client.get('/member-portal/attention'),
      client.get('/member-portal/fund-return-claims'),
    ]).then(([dashRes, issuesRes, attRes, claimsRes]) => {
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
      if (claimsRes.status === 'fulfilled') setFundClaims(claimsRes.value.data || []);
      else setFundClaims([]);
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
      message.success('Issue submitted');
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
      message.success('Fund return reported');
      claimForm.resetFields();
      const { data } = await client.get('/member-portal/fund-return-claims');
      setFundClaims(data);
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not submit claim'));
    } finally {
      setClaimSubmitting(false);
    }
  };

  const downloadPdfReport = async () => {
    setPdfLoading(true);
    try {
      const { data } = await client.get('/member-portal/statement');
      if (!data.teamName && dashboard?.teamName) data.teamName = dashboard.teamName;
      const group = dashboard?.subGroup;
      const groupPayload =
        group?.isLeader
          ? {
              isLeader: true,
              teamName: data.teamName || dashboard?.teamName,
              groupName: group.name,
              leaderName: dashboard?.member?.displayName,
              groupStats: group.groupStats || {},
              groupApplications: group.groupApplications || [],
              members: group.members || [],
            }
          : null;
      downloadMemberFullLedgerPdf(data, groupPayload);
      message.success('PDF downloaded');
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not generate PDF'));
    } finally {
      setPdfLoading(false);
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
            <Button
              type="primary"
              onClick={() => {
                setLoading(true);
                load().finally(() => setLoading(false));
              }}
            >
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
  const pendingReturn = stats.pendingReturn ?? 0;
  const memberPan = formatPan(dashboard?.member?.pan);
  const isGroupLeader = subGroup?.isLeader === true;
  const groupMembers = subGroup?.members ?? [];
  const totalGroupPendingReturn = groupMembers.reduce(
    (sum, m) => sum + Number(m.pendingReturn ?? 0),
    0
  );

  const openIpoDetail = (ipoId) => {
    if (ipoId) setIpoDrawerId(ipoId);
  };

  const handleAttentionAction = (item) => {
    if (item.action === 'fund-return' || item.action === 'issues' || item.action === 'collections') {
      document.getElementById('member-tools')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (item.action === 'allotment') {
      document.getElementById('member-ipos')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (item.action === 'ipo' && item.ipoName) {
      const id =
        (dashboard?.ipoApplications ?? []).find((a) => a.ipoName === item.ipoName)?.ipoId ??
        subGroup?.groupApplications?.find((a) => a.ipoName === item.ipoName)?.ipoId;
      openIpoDetail(id);
    }
  };

  const copyMyPan = async () => {
    if (!memberPan) return;
    const ok = await copyToClipboard(memberPan);
    message[ok ? 'success' : 'error'](ok ? 'PAN copied' : 'Could not copy');
  };

  return (
    <div className="member-portal-page">
      <PageHeader
        title={`Hello, ${dashboard?.member?.displayName || 'Member'}`}
        subtitle={
          subGroup?.name
            ? `${subGroup.name}${isGroupLeader ? ' · Leader' : ''}`
            : 'Your IPO summary'
        }
        extra={
          memberPan ? (
            <Button icon={<CopyOutlined />} onClick={copyMyPan}>
              Copy PAN
            </Button>
          ) : null
        }
      />

      {pendingReturn > 0 && (
        <Alert
          type="warning"
          showIcon
          className="member-portal-alert"
          message={`${formatCurrency(pendingReturn)} pending to return to your manager`}
          style={{ marginBottom: 16 }}
        />
      )}

      {attention.length > 0 && (
        <ContentCard title="Needs attention" style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            {attention.map((item) => (
              <Alert
                key={item.id}
                type={item.priority === 'high' ? 'warning' : 'info'}
                showIcon
                message={item.title}
                description={
                  item.action ? (
                    <Button type="link" size="small" style={{ padding: 0 }} onClick={() => handleAttentionAction(item)}>
                      Open
                    </Button>
                  ) : item.detail || null
                }
              />
            ))}
          </Space>
        </ContentCard>
      )}

      <div className="member-portal-stat-grid member-portal-stat-grid--3" style={{ marginBottom: 16 }}>
        <StatCard
          title="Your profit"
          value={formatCurrency(memberProfit)}
          icon={<RiseOutlined />}
          variant={memberProfit >= 0 ? 'success' : 'danger'}
          valueClassName={memberProfit >= 0 ? 'stat-card-value--profit' : 'stat-card-value--loss'}
        />
        <StatCard
          title="To return"
          value={formatCurrency(pendingReturn)}
          icon={<RollbackOutlined />}
          variant={pendingReturn !== 0 ? 'danger' : 'primary'}
          valueClassName={pendingReturn !== 0 ? 'stat-card-value--loss' : ''}
        />
        <StatCard
          title="IPOs applied"
          value={stats.iposApplied ?? 0}
          icon={<StockOutlined />}
          variant="primary"
        />
      </div>

      <ContentCard id="member-ipos" title="Your IPOs" style={{ marginBottom: 16 }}>
        {personalIpoGroups.length ? (
          <Table
            rowKey={(r) => r.ipoName || r.id}
            size="small"
            pagination={false}
            dataSource={personalIpoGroups.map(({ ipoName, rows }) => ({
              ipoName,
              ipoId: rows[0]?.ipoId,
              summary: summarizeIpoGroupRows(rows),
              status: rows[0]?.allotmentStatus,
              amount: rows.reduce((s, r) => s + Number(r.amount || 0), 0),
              share: rows.reduce((s, r) => s + Number(r.memberShare || 0), 0),
            }))}
            onRow={(row) => ({
              onClick: () => openIpoDetail(row.ipoId),
              style: row.ipoId ? { cursor: 'pointer' } : undefined,
            })}
            columns={[
              { title: 'IPO', dataIndex: 'ipoName' },
              { title: 'Amount', dataIndex: 'amount', render: (v) => formatCurrency(v) },
              {
                title: 'Status',
                dataIndex: 'status',
                render: (s) =>
                  s ? <Tag color={allotmentColors[s]}>{String(s).replace(/_/g, ' ')}</Tag> : '—',
              },
              {
                title: 'Your share',
                dataIndex: 'share',
                render: (v, row) =>
                  row.status === 'ALLOTED' ? formatCurrency(v) : '—',
              },
            ]}
            {...tableDefaults}
          />
        ) : (
          <Typography.Text type="secondary">No IPO applications yet</Typography.Text>
        )}
      </ContentCard>

      {isGroupLeader && (
        <ContentCard title={`Group · ${subGroup.name}`} style={{ marginBottom: 16 }}>
          {totalGroupPendingReturn > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message={`${formatCurrency(totalGroupPendingReturn)} group pending return`}
            />
          )}
          <Table
            rowKey="id"
            size="small"
            pagination={groupMembers.length > 10 ? { pageSize: 10 } : false}
            dataSource={groupMembers}
            columns={[
              {
                title: 'Member',
                dataIndex: 'displayName',
                render: (v, row) => `${v}${row.isLeader ? ' (You)' : ''}`,
              },
              {
                title: 'Profit',
                dataIndex: 'totalMemberShare',
                render: (v) => formatCurrency(v ?? 0),
              },
              {
                title: 'To return',
                dataIndex: 'pendingReturn',
                render: (v) => (
                  <span className={Number(v) > 0 ? 'amount-negative' : undefined}>
                    {formatCurrency(v ?? 0)}
                  </span>
                ),
              },
            ]}
            {...tableDefaults}
          />
        </ContentCard>
      )}

      <ContentCard id="member-tools" title="Tools" style={{ marginBottom: 16 }}>
        <Collapse
          items={[
            {
              key: 'return',
              label: 'Report fund return',
              children: (
                <>
                  <Form form={claimForm} layout="vertical" onFinish={onSubmitClaim} style={{ maxWidth: 420 }}>
                    <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Enter amount' }]}>
                      <InputNumber min={1} style={{ width: '100%' }} addonBefore="₹" />
                    </Form.Item>
                    <Form.Item name="paymentRef" label="UPI / ref (optional)">
                      <Input />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={claimSubmitting}>
                      Submit
                    </Button>
                  </Form>
                  {fundClaims.length > 0 && (
                    <Table
                      style={{ marginTop: 16 }}
                      rowKey="id"
                      size="small"
                      pagination={false}
                      dataSource={fundClaims.slice(0, 5)}
                      columns={[
                        { title: 'Amount', dataIndex: 'amount', render: (v) => formatCurrency(v) },
                        {
                          title: 'Status',
                          dataIndex: 'status',
                          render: (s) => (
                            <Tag color={s === 'ACKNOWLEDGED' ? 'success' : s === 'REJECTED' ? 'error' : 'warning'}>
                              {s}
                            </Tag>
                          ),
                        },
                        {
                          title: 'Date',
                          dataIndex: 'createdAt',
                          render: (v) => dayjs(v).format('DD MMM'),
                        },
                      ]}
                      {...tableDefaults}
                    />
                  )}
                </>
              ),
            },
            {
              key: 'profile',
              label: 'Profile & PAN',
              children: (
                <>
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                    PAN {memberPan || '—'}
                    {memberPan ? (
                      <Button type="link" size="small" icon={<CopyOutlined />} onClick={copyMyPan}>
                        Copy
                      </Button>
                    ) : null}
                  </Typography.Paragraph>
                  <Form form={profileForm} layout="vertical" onFinish={onSaveProfile} style={{ maxWidth: 420 }}>
                    <Form.Item name="email" label="Email">
                      <Input type="email" />
                    </Form.Item>
                    <Form.Item name="upi" label="UPI">
                      <Input placeholder="name@upi" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={profileSubmitting}>
                      Save
                    </Button>
                  </Form>
                </>
              ),
            },
            {
              key: 'issue',
              label: 'Raise an issue',
              children: (
                <>
                  <Form form={form} layout="vertical" onFinish={onSubmitIssue} initialValues={{ category: 'OTHER' }} style={{ maxWidth: 420 }}>
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
                    <Form.Item name="note" label="Note" rules={[{ required: true, message: 'Describe the issue' }]}>
                      <Input.TextArea rows={3} maxLength={2000} />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={submitting}>
                      Submit
                    </Button>
                  </Form>
                  {issues.length > 0 && (
                    <Table
                      style={{ marginTop: 16 }}
                      rowKey="id"
                      size="small"
                      pagination={false}
                      dataSource={issues.slice(0, 5)}
                      columns={[
                        { title: 'Note', dataIndex: 'note', ellipsis: true },
                        {
                          title: 'Status',
                          dataIndex: 'status',
                          render: (s) => <Tag color={s === 'RESOLVED' ? 'success' : 'processing'}>{s}</Tag>,
                        },
                      ]}
                      {...tableDefaults}
                    />
                  )}
                </>
              ),
            },
            {
              key: 'pdf',
              label: 'Download statement PDF',
              children: (
                <Button type="primary" loading={pdfLoading} onClick={downloadPdfReport}>
                  {isGroupLeader ? 'Download PDF (you + group)' : 'Download PDF'}
                </Button>
              ),
            },
          ]}
        />
      </ContentCard>

      <MemberIpoDetailDrawer
        ipoId={ipoDrawerId}
        open={!!ipoDrawerId}
        onClose={() => setIpoDrawerId(null)}
      />
    </div>
  );
}
