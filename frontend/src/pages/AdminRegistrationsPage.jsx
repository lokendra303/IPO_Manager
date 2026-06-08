import { useCallback, useEffect, useState } from 'react';
import { Table, Tag, Button, Space, Tabs, message, Modal, Input, Typography } from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined, ReloadOutlined, StopOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { formatCurrency } from '../utils/format';
import { Link, useSearchParams } from 'react-router-dom';
import adminClient from '../api/adminClient';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import { formatDateTime } from '../utils/format';
import { getErrorMessage } from '../utils/errors';

const STATUS_COLORS = { PENDING: 'gold', APPROVED: 'green', REJECTED: 'red', DISABLED: 'default' };

export default function AdminRegistrationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') || 'PENDING';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    adminClient
      .get('/admin/registrations', { params: { status } })
      .then((r) => setRows(r.data))
      .catch((err) => message.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (id) => {
    setActionId(id);
    try {
      const { data } = await adminClient.post(`/admin/registrations/${id}/approve`);
      message.success(data.message);
      load();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setActionId(null);
    }
  };

  const reject = (id, teamName) => {
    let reason = '';
    Modal.confirm({
      title: `Reject "${teamName}"?`,
      content: (
        <div>
          <Typography.Text type="secondary">The manager will not be able to sign in.</Typography.Text>
          <Input.TextArea
            rows={3}
            placeholder="Reason (optional)"
            style={{ marginTop: 12 }}
            onChange={(e) => { reason = e.target.value; }}
          />
        </div>
      ),
      okText: 'Reject',
      okButtonProps: { danger: true },
      onOk: async () => {
        setActionId(id);
        try {
          const { data } = await adminClient.post(`/admin/registrations/${id}/reject`, { reason });
          message.success(data.message);
          load();
        } catch (err) {
          message.error(getErrorMessage(err));
          throw err;
        } finally {
          setActionId(null);
        }
      },
    });
  };

  const reopen = async (id) => {
    setActionId(id);
    try {
      const { data } = await adminClient.post(`/admin/registrations/${id}/reopen`);
      message.success(data.message);
      load();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setActionId(null);
    }
  };

  const disableTeam = (id, teamName) => {
    let reason = '';
    Modal.confirm({
      title: `Disable "${teamName}"?`,
      content: (
        <div>
          <Typography.Text type="secondary">Managers and members cannot sign in while disabled.</Typography.Text>
          <Input.TextArea rows={3} placeholder="Reason (optional)" style={{ marginTop: 12 }} onChange={(e) => { reason = e.target.value; }} />
        </div>
      ),
      okText: 'Disable',
      okButtonProps: { danger: true },
      onOk: async () => {
        setActionId(id);
        try {
          const { data } = await adminClient.post(`/admin/tenants/${id}/disable`, { reason });
          message.success(data.message);
          load();
        } catch (err) {
          message.error(getErrorMessage(err));
          throw err;
        } finally {
          setActionId(null);
        }
      },
    });
  };

  const enableTeam = async (id) => {
    setActionId(id);
    try {
      const { data } = await adminClient.post(`/admin/tenants/${id}/enable`);
      message.success(data.message);
      load();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setActionId(null);
    }
  };

  const columns = [
    { title: 'Team', dataIndex: 'name', key: 'name', render: (v, r) => <Link to={`/admin/tenants/${r.id}`}>{v}</Link> },
    { title: 'Owner Email', dataIndex: 'owner_email', key: 'owner_email' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (s) => <Tag color={STATUS_COLORS[s]}>{s}</Tag>,
    },
    { title: 'Members', dataIndex: 'member_count', key: 'member_count', width: 90 },
    { title: 'Wallet', dataIndex: 'wallet_balance', key: 'wallet_balance', width: 110, render: formatCurrency },
    {
      title: 'Registered',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v) => formatDateTime(v),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 280,
      render: (_, r) => (
        <Space wrap>
          <Link to={`/admin/tenants/${r.id}`}>
            <Button size="small" icon={<EyeOutlined />}>Details</Button>
          </Link>
          {r.status === 'PENDING' && (
            <>
              <Button size="small" type="primary" icon={<CheckOutlined />} loading={actionId === r.id} onClick={() => approve(r.id)}>Approve</Button>
              <Button size="small" danger icon={<CloseOutlined />} loading={actionId === r.id} onClick={() => reject(r.id, r.name)}>Reject</Button>
            </>
          )}
          {r.status === 'REJECTED' && (
            <Button size="small" icon={<ReloadOutlined />} loading={actionId === r.id} onClick={() => reopen(r.id)}>Reopen</Button>
          )}
          {r.status === 'APPROVED' && (
            <Button size="small" danger icon={<StopOutlined />} loading={actionId === r.id} onClick={() => disableTeam(r.id, r.name)}>Disable</Button>
          )}
          {r.status === 'DISABLED' && (
            <Button size="small" type="primary" icon={<CheckCircleOutlined />} loading={actionId === r.id} onClick={() => enableTeam(r.id)}>Enable</Button>
          )}
        </Space>
      ),
    },
  ];

  if (status !== 'PENDING') {
    columns.splice(5, 0, {
      title: status === 'APPROVED' ? 'Approved' : 'Reason',
      key: 'extra',
      render: (_, r) =>
        r.status === 'APPROVED'
          ? formatDateTime(r.approved_at)
          : r.rejection_reason || '—',
    });
  }

  return (
    <div>
      <PageHeader
        title="Manager Accounts"
        subtitle="Review registration requests and manage team access"
      />
      <ContentCard>
        <Tabs
          activeKey={status}
          onChange={(key) => setSearchParams({ status: key })}
          items={[
            { key: 'PENDING', label: 'Pending' },
            { key: 'APPROVED', label: 'Approved' },
            { key: 'REJECTED', label: 'Rejected' },
            { key: 'DISABLED', label: 'Disabled' },
            { key: 'ALL', label: 'All' },
          ]}
        />
        <Table
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 900 }}
        />
      </ContentCard>
    </div>
  );
}
