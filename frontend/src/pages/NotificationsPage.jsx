import { useCallback, useEffect, useState } from 'react';
import { Button, Segmented, Space, Table, Tag, message } from 'antd';
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

  const updateStatus = async (id, status) => {
    setActionId(id);
    try {
      await client.patch(`/member-issues/${id}`, { status });
      message.success(status === 'RESOLVED' ? 'Issue marked resolved' : 'Issue reopened');
      await load();
    } catch (err) {
      message.error(getErrorMessage(err, 'Update failed'));
    } finally {
      setActionId(null);
    }
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
            loading={actionId === row.id}
            onClick={() => updateStatus(row.id, 'RESOLVED')}
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
        subtitle="Member issues and resolutions"
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
    </div>
  );
}
