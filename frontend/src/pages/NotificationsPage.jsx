import { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, Modal, Segmented, Space, Table, Tag, Typography, message } from 'antd';
import { CheckOutlined, ReloadOutlined, UndoOutlined } from '@ant-design/icons';
import client from '../api/client';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import PageLoading from '../components/PageLoading';
import { tableDefaults } from '../utils/table';
import { getErrorMessage } from '../utils/errors';

export default function NotificationsPage() {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [actionId, setActionId] = useState(null);
  const [resolveTarget, setResolveTarget] = useState(null);
  const [resolveForm] = Form.useForm();

  const load = useCallback(() => {
    setLoading(true);
    const params = filter === 'ALL' ? {} : { status: filter };
    return client
      .get('/member-issues', { params })
      .then((r) => setIssues(r.data))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (id, status, resolutionNote) => {
    setActionId(id);
    try {
      await client.patch(`/member-issues/${id}`, { status, resolutionNote });
      message.success(status === 'RESOLVED' ? 'Issue resolved — member can see your reply' : 'Issue reopened');
      setResolveTarget(null);
      resolveForm.resetFields();
      await load();
    } catch (err) {
      message.error(getErrorMessage(err, 'Update failed'));
    } finally {
      setActionId(null);
    }
  };

  const onConfirmResolve = (values) => {
    if (!resolveTarget) return;
    updateStatus(resolveTarget.id, 'RESOLVED', values.resolutionNote);
  };

  const filterOptions = [
    { label: filter === 'ALL' ? `All (${issues.length})` : 'All', value: 'ALL' },
    { label: filter === 'OPEN' ? `Open (${issues.length})` : 'Open', value: 'OPEN' },
    { label: filter === 'RESOLVED' ? `Resolved (${issues.length})` : 'Resolved', value: 'RESOLVED' },
  ];

  const cols = [
    {
      title: 'Submitted',
      dataIndex: 'created_at',
      width: 170,
      render: (v) => new Date(v).toLocaleString('en-IN'),
    },
    {
      title: 'Member',
      dataIndex: 'member_name',
      render: (name, row) => (
        <span>
          {name}
          <Tag style={{ marginLeft: 8 }}>{row.member_pan}</Tag>
        </span>
      ),
    },
    { title: 'Issue', dataIndex: 'note', ellipsis: true },
    {
      title: 'Manager reply',
      dataIndex: 'resolution_note',
      ellipsis: true,
      render: (v) => v || '—',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (s) => <Tag color={s === 'OPEN' ? 'orange' : 'green'}>{s === 'OPEN' ? 'Open' : 'Resolved'}</Tag>,
    },
    {
      title: 'Resolved',
      dataIndex: 'resolved_at',
      width: 170,
      render: (v) => (v ? new Date(v).toLocaleString('en-IN') : '—'),
    },
    {
      title: 'Action',
      key: 'action',
      width: 120,
      render: (_, row) =>
        row.status === 'OPEN' ? (
          <Button
            type="link"
            size="small"
            icon={<CheckOutlined />}
            onClick={() => {
              setResolveTarget(row);
              resolveForm.resetFields();
            }}
          >
            Resolve
          </Button>
        ) : (
          <Button
            type="link"
            size="small"
            icon={<UndoOutlined />}
            loading={actionId === row.id}
            onClick={() => updateStatus(row.id, 'OPEN')}
          >
            Reopen
          </Button>
        ),
    },
  ];

  if (loading && !issues.length) return <PageLoading />;

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Member issues — add a reply when resolving so members see your response"
        extra={
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            Refresh
          </Button>
        }
      />

      <ContentCard>
        <Space wrap style={{ marginBottom: 16 }}>
          <Segmented value={filter} onChange={setFilter} options={filterOptions} />
        </Space>

        <Table
          rowKey="id"
          columns={cols}
          dataSource={issues}
          loading={loading}
          pagination={{ pageSize: 15, showSizeChanger: true }}
          locale={{ emptyText: 'No member issues yet' }}
          {...tableDefaults}
        />
      </ContentCard>

      <Modal
        title={resolveTarget ? `Resolve issue — ${resolveTarget.member_name}` : 'Resolve issue'}
        open={!!resolveTarget}
        onCancel={() => setResolveTarget(null)}
        onOk={() => resolveForm.submit()}
        confirmLoading={!!actionId}
        okText="Mark resolved"
        destroyOnClose
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          Member wrote: <em>{resolveTarget?.note}</em>
        </Typography.Paragraph>
        <Form form={resolveForm} layout="vertical" onFinish={onConfirmResolve}>
          <Form.Item
            name="resolutionNote"
            label="Your reply (optional)"
            extra="Shown to the member in their portal when resolved"
          >
            <Input.TextArea
              rows={4}
              placeholder="e.g. Payment sent today, UTR 1234567890..."
              maxLength={2000}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
