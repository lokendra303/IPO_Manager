import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Col,
  Descriptions,
  Empty,
  Input,
  Modal,
  Row,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  ReloadOutlined,
  HistoryOutlined,
  UserOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  FilterOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import client from '../api/client';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard from '../components/StatCard';
import PageLoading from '../components/PageLoading';
import { tableDefaults } from '../utils/table';

function formatAuditDate(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return { date, time, full: d.toLocaleString('en-IN') };
}

function actionTagColor(action = '') {
  if (action.startsWith('IPO_')) return 'cyan';
  if (action.startsWith('MEMBER_') && !action.includes('ISSUE')) return 'blue';
  if (action.startsWith('GROUP_')) return 'purple';
  if (action.startsWith('PROVIDER_') || action.startsWith('BANK_')) return 'gold';
  if (action.includes('ISSUE')) return 'orange';
  if (action.startsWith('SETTINGS_')) return 'red';
  if (action.startsWith('PROFIT_')) return 'green';
  if (action.startsWith('AUTH_')) return 'default';
  return 'default';
}

function formatEntityType(type) {
  if (!type) return null;
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMetadataKey(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function formatMetadataValue(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function AuditLogPage() {
  const [data, setData] = useState({ rows: [], total: 0, page: 1, pageSize: 30 });
  const [stats, setStats] = useState(null);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    action: undefined,
    actorType: 'all',
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [purging, setPurging] = useState(false);

  const RETENTION_DAYS = 5;

  useEffect(() => {
    Promise.all([
      client.get('/audit-logs/actions'),
      client.get('/audit-logs/stats'),
    ]).then(([actionsRes, statsRes]) => {
      setActions(actionsRes.data);
      setStats(statsRes.data);
    });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    return client
      .get('/audit-logs', {
        params: {
          page,
          pageSize,
          search: filters.search || undefined,
          action: filters.action,
          actorType: filters.actorType === 'all' ? undefined : filters.actorType,
        },
      })
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, [page, pageSize, filters]);

  const refreshAll = useCallback(() => {
    client.get('/audit-logs/stats').then((r) => setStats(r.data));
    return load();
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  const hasActiveFilters = useMemo(
    () => Boolean(filters.search || filters.action || filters.actorType !== 'all'),
    [filters]
  );

  const clearFilters = () => {
    setFilters({ search: '', action: undefined, actorType: 'all' });
    setPage(1);
  };

  const purgeOldLogs = async () => {
    try {
      const { data: preview } = await client.get('/audit-logs/purge-preview', {
        params: { days: RETENTION_DAYS },
      });
      if (preview.count === 0) {
        message.info(`No audit logs older than ${RETENTION_DAYS} days to delete`);
        return;
      }

      Modal.confirm({
        title: 'Delete old audit logs?',
        content: (
          <Typography.Text>
            This will permanently delete{' '}
            <strong>{preview.count.toLocaleString('en-IN')}</strong> event
            {preview.count === 1 ? '' : 's'} older than {RETENTION_DAYS} days from your team.
            This cannot be undone.
          </Typography.Text>
        ),
        okText: 'Delete',
        okButtonProps: { danger: true },
        onOk: async () => {
          setPurging(true);
          try {
            const { data } = await client.delete('/audit-logs/purge', {
              params: { days: RETENTION_DAYS },
            });
            if (data.deleted) {
              message.success(
                `Deleted ${data.deleted.toLocaleString('en-IN')} audit log${data.deleted === 1 ? '' : 's'}`
              );
            } else {
              message.info(data.message || 'Nothing to delete');
            }
            setPage(1);
            await refreshAll();
          } finally {
            setPurging(false);
          }
        },
      });
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to check audit logs');
    }
  };

  const cols = [
    {
      title: 'When',
      dataIndex: 'created_at',
      width: 130,
      render: (v) => {
        const { date, time, full } = formatAuditDate(v);
        return (
          <Tooltip title={full}>
            <div className="audit-date">
              <span className="audit-date-day">{date}</span>
              <span className="audit-date-time">{time}</span>
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: 'Who',
      dataIndex: 'actor_label',
      width: 220,
      render: (label, row) => (
        <div className="audit-actor">
          <div className={`audit-actor-avatar audit-actor-avatar--${row.actor_type}`}>
            {row.actor_type === 'manager' ? <UserOutlined /> : <TeamOutlined />}
          </div>
          <div className="audit-actor-text">
            <span className="audit-actor-name">{label}</span>
            <span className="audit-actor-role">
              {row.actor_type === 'manager' ? 'Manager' : 'Member'}
            </span>
          </div>
        </div>
      ),
    },
    {
      title: 'Action',
      dataIndex: 'actionLabel',
      width: 150,
      render: (v, row) => (
        <Tag bordered={false} color={actionTagColor(row.action)} className="audit-action-tag">
          {v || row.action}
        </Tag>
      ),
    },
    {
      title: 'Summary',
      dataIndex: 'summary',
      ellipsis: true,
      render: (v) => <span className="audit-summary">{v}</span>,
    },
    {
      title: 'Entity',
      key: 'entity',
      width: 130,
      render: (_, row) =>
        row.entity_type ? (
          <span className="audit-entity">
            {formatEntityType(row.entity_type)}
            {row.entity_id ? <span className="audit-entity-id">#{row.entity_id}</span> : null}
          </span>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
  ];

  if (loading && !data.rows.length && !stats) return <PageLoading />;

  return (
    <div className="audit-log-page">
      <PageHeader
        title="Audit Log"
        subtitle="Complete history of changes, distributions, and sign-ins across your team"
        extra={
          <Space wrap>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={purgeOldLogs}
              loading={purging}
            >
              Delete logs older than {RETENTION_DAYS} days
            </Button>
            <Button icon={<ReloadOutlined />} onClick={refreshAll} loading={loading}>
              Refresh
            </Button>
          </Space>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Total events"
            value={stats?.total ?? data.total ?? 0}
            icon={<HistoryOutlined />}
            variant="primary"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Last 24 hours"
            value={stats?.last24h ?? 0}
            icon={<ClockCircleOutlined />}
            variant="info"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="By managers"
            value={stats?.manager ?? 0}
            icon={<UserOutlined />}
            variant="warning"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="By members"
            value={stats?.member ?? 0}
            icon={<TeamOutlined />}
            variant="success"
          />
        </Col>
      </Row>

      <ContentCard
        title="Activity log"
        extra={
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {data.total.toLocaleString('en-IN')} record{data.total === 1 ? '' : 's'}
            {hasActiveFilters ? ' (filtered)' : ''}
          </Typography.Text>
        }
      >
        <div className="audit-toolbar">
          <div className="audit-toolbar-row">
            <Input.Search
              className="audit-search"
              placeholder="Search summary or actor…"
              allowClear
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              onSearch={() => setPage(1)}
            />
            <Select
              allowClear
              placeholder="All action types"
              className="audit-filter-select"
              value={filters.action}
              onChange={(v) => {
                setFilters((f) => ({ ...f, action: v }));
                setPage(1);
              }}
              options={actions.map((a) => ({ value: a.value, label: a.label }))}
              showSearch
              optionFilterProp="label"
            />
            <Segmented
              className="audit-actor-segment"
              value={filters.actorType}
              onChange={(v) => {
                setFilters((f) => ({ ...f, actorType: v }));
                setPage(1);
              }}
              options={[
                { label: 'All', value: 'all' },
                { label: 'Manager', value: 'manager' },
                { label: 'Member', value: 'member' },
              ]}
            />
            {hasActiveFilters && (
              <Button type="link" onClick={clearFilters} className="audit-clear-filters">
                Clear filters
              </Button>
            )}
          </div>
          {hasActiveFilters && (
            <div className="audit-filter-hint">
              <FilterOutlined /> Showing filtered results — expand a row for request details
            </div>
          )}
        </div>

        <Table
          rowKey="id"
          className="pro-table audit-table"
          columns={cols}
          dataSource={data.rows}
          loading={loading}
          expandable={{
            expandedRowClassName: () => 'audit-expanded-row',
            expandedRowRender: (row) =>
              row.metadata ? (
                <Descriptions
                  bordered
                  size="small"
                  column={{ xs: 1, sm: 2, lg: 3 }}
                  className="audit-metadata"
                >
                  {Object.entries(row.metadata).map(([key, value]) => (
                    <Descriptions.Item key={key} label={formatMetadataKey(key)}>
                      {formatMetadataValue(value)}
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              ) : (
                <Typography.Text type="secondary">No additional details recorded</Typography.Text>
              ),
            rowExpandable: (row) => !!row.metadata,
          }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  hasActiveFilters
                    ? 'No events match your filters'
                    : 'No activity recorded yet — actions will appear here automatically'
                }
              />
            ),
          }}
          {...tableDefaults}
          pagination={{
            current: page,
            pageSize,
            total: data.total,
            showSizeChanger: true,
            showTotal: (t) => `${t.toLocaleString('en-IN')} events`,
            pageSizeOptions: ['20', '30', '50', '100'],
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      </ContentCard>
    </div>
  );
}
