import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, Col, Descriptions, Empty, Input, Row, Segmented, Select, Table, Tag, Tooltip, Typography,
} from 'antd';
import { ReloadOutlined, HistoryOutlined, UserOutlined, TeamOutlined, ClockCircleOutlined, FilterOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import adminClient from '../api/adminClient';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import StatCard from '../components/StatCard';
import PageLoading from '../components/PageLoading';
import { tableDefaults } from '../utils/table';

function formatAuditDate(iso) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    full: d.toLocaleString('en-IN'),
  };
}

function actionTagColor(action = '') {
  if (action.startsWith('IPO_')) return 'cyan';
  if (action.startsWith('ADMIN_')) return 'red';
  if (action.startsWith('MEMBER_') && !action.includes('ISSUE')) return 'blue';
  if (action.startsWith('GROUP_')) return 'purple';
  if (action.startsWith('PROVIDER_') || action.startsWith('BANK_')) return 'gold';
  if (action.includes('ISSUE')) return 'orange';
  if (action.startsWith('SETTINGS_')) return 'red';
  if (action.startsWith('PROFIT_')) return 'green';
  if (action.startsWith('AUTH_')) return 'default';
  return 'default';
}

function formatMetadataKey(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
}

function formatMetadataValue(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function AdminAuditLogPage() {
  const [data, setData] = useState({ rows: [], total: 0, page: 1, pageSize: 30 });
  const [stats, setStats] = useState(null);
  const [actions, setActions] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', action: undefined, actorType: 'all', tenantId: undefined });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);

  useEffect(() => {
    Promise.all([
      adminClient.get('/admin/audit-logs/actions'),
      adminClient.get('/admin/tenants-list'),
    ]).then(([actionsRes, tenantsRes]) => {
      setActions(actionsRes.data);
      setTenants(tenantsRes.data);
    });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const statsParams = filters.tenantId ? { tenantId: filters.tenantId } : {};
    return Promise.all([
      adminClient.get('/admin/audit-logs/stats', { params: statsParams }),
      adminClient.get('/admin/audit-logs', {
        params: {
          page,
          pageSize,
          search: filters.search || undefined,
          action: filters.action,
          tenantId: filters.tenantId,
          actorType: filters.actorType === 'all' ? undefined : filters.actorType,
        },
      }),
    ])
      .then(([statsRes, logsRes]) => {
        setStats(statsRes.data);
        setData(logsRes.data);
      })
      .finally(() => setLoading(false));
  }, [page, pageSize, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const hasActiveFilters = useMemo(
    () => Boolean(filters.search || filters.action || filters.tenantId || filters.actorType !== 'all'),
    [filters]
  );

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
      title: 'Team',
      dataIndex: 'tenant_name',
      width: 140,
      ellipsis: true,
      render: (v, row) => <Link to={`/admin/tenants/${row.tenant_id}`}>{v}</Link>,
    },
    {
      title: 'Who',
      dataIndex: 'actor_label',
      width: 200,
      render: (label, row) => (
        <div className="audit-actor">
          <div className={`audit-actor-avatar audit-actor-avatar--${row.actor_type}`}>
            {row.actor_type === 'manager' ? <UserOutlined /> : <TeamOutlined />}
          </div>
          <div className="audit-actor-text">
            <span className="audit-actor-name">{label}</span>
            <span className="audit-actor-role">{row.actor_type === 'manager' ? 'Manager' : 'Member'}</span>
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
  ];

  if (loading && !data.rows.length && !stats) return <PageLoading />;

  return (
    <div className="audit-log-page">
      <PageHeader
        title="Platform Audit Log"
        subtitle="Activity across all manager teams — sign-ins, IPO actions, wallet changes, and more"
        extra={
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            Refresh
          </Button>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Total events" value={stats?.total ?? 0} icon={<HistoryOutlined />} variant="primary" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Last 24 hours" value={stats?.last24h ?? 0} icon={<ClockCircleOutlined />} variant="info" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Teams with activity" value={stats?.tenantCount ?? 0} icon={<TeamOutlined />} variant="warning" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Manager events" value={stats?.manager ?? 0} icon={<UserOutlined />} variant="success" />
        </Col>
      </Row>

      <ContentCard title="All teams activity">
        <div className="audit-toolbar">
          <div className="audit-toolbar-row">
            <Input.Search
              className="audit-search"
              placeholder="Search team, summary, or actor…"
              allowClear
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              onSearch={() => setPage(1)}
            />
            <Select
              allowClear
              placeholder="All teams"
              className="audit-filter-select"
              value={filters.tenantId}
              onChange={(v) => { setFilters((f) => ({ ...f, tenantId: v })); setPage(1); }}
              options={tenants.map((t) => ({ value: t.id, label: `${t.name} (${t.status})` }))}
              showSearch
              optionFilterProp="label"
            />
            <Select
              allowClear
              placeholder="All action types"
              className="audit-filter-select"
              value={filters.action}
              onChange={(v) => { setFilters((f) => ({ ...f, action: v })); setPage(1); }}
              options={actions.map((a) => ({ value: a.value, label: a.label }))}
              showSearch
              optionFilterProp="label"
            />
            <Segmented
              className="audit-actor-segment"
              value={filters.actorType}
              onChange={(v) => { setFilters((f) => ({ ...f, actorType: v })); setPage(1); }}
              options={[
                { label: 'All', value: 'all' },
                { label: 'Manager', value: 'manager' },
                { label: 'Member', value: 'member' },
              ]}
            />
            {hasActiveFilters && (
              <Button type="link" onClick={() => { setFilters({ search: '', action: undefined, actorType: 'all', tenantId: undefined }); setPage(1); }}>
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
            expandedRowRender: (row) => (
              <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }} className="audit-metadata">
                <Descriptions.Item label="Team">{row.tenant_name}</Descriptions.Item>
                <Descriptions.Item label="IP address">{row.ip_address || '—'}</Descriptions.Item>
                {row.metadata
                  ? Object.entries(row.metadata).map(([key, value]) => (
                      <Descriptions.Item key={key} label={formatMetadataKey(key)}>
                        {formatMetadataValue(value)}
                      </Descriptions.Item>
                    ))
                  : (
                    <Descriptions.Item label="Details" span={3}>
                      <Typography.Text type="secondary">No additional details recorded</Typography.Text>
                    </Descriptions.Item>
                  )}
              </Descriptions>
            ),
          }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No activity recorded" /> }}
          {...tableDefaults}
          pagination={{
            current: page,
            pageSize,
            total: data.total,
            showSizeChanger: true,
            showTotal: (t) => `${t.toLocaleString('en-IN')} events`,
            pageSizeOptions: ['20', '30', '50', '100'],
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          }}
          scroll={{ x: 1000 }}
        />
      </ContentCard>
    </div>
  );
}
