import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Input, Segmented, Table, Tag, Tooltip, Typography, message, Space } from 'antd';
import { PlusOutlined, EyeOutlined, ReloadOutlined, CheckOutlined, SearchOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import client from '../api/client';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import { tableDefaults } from '../utils/table';
import { getErrorMessage } from '../utils/errors';
import { formatCurrency, relativeTime } from '../utils/format';
import { formatGmp, formatPriceBand, liveStatusMeta, canAddLiveIpoToMyIpos } from '../utils/liveIpo';

function providerLabel(name) {
  if (name === 'composite' || name === 'free') return 'NSE + Downstox + IPO Alerts';
  if (name === 'downstox') return 'Downstox';
  if (name === 'nse') return 'NSE';
  if (name === 'ipoalerts') return 'IPO Alerts';
  if (name === 'ipoguru') return 'IPO Guru';
  if (name === 'upstox') return 'Upstox';
  return name;
}

function formatDate(v) {
  if (!v) return '—';
  const d = dayjs(v);
  return d.isValid() ? d.format('DD MMM YYYY') : '—';
}

const STATUS_FILTERS = [
  { label: 'All', value: 'ALL' },
  { label: 'Upcoming', value: 'UPCOMING' },
  { label: 'Open', value: 'OPEN' },
  { label: 'Closed', value: 'CLOSED' },
  { label: 'Listed', value: 'LISTED' },
];

const TYPE_FILTERS = [
  { label: 'All types', value: 'ALL' },
  { label: 'Mainboard', value: 'MAINBOARD' },
  { label: 'SME', value: 'SME' },
];

export default function LiveIposPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [provider, setProvider] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [q, setQ] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [addingId, setAddingId] = useState(null);

  const load = (opts = {}) => {
    setLoading(true);
    return client
      .get('/live-ipos')
      .then((r) => {
        setRows(r.data.data || []);
        setLastSyncedAt(r.data.lastSyncedAt);
        setUsedFallback(Boolean(r.data.usedFallback));
        setProvider(r.data.provider || null);
        if (opts.toast && r.data.lastError) {
          message.warning(r.data.lastError);
        }
      })
      .catch((err) => message.error(getErrorMessage(err, 'Failed to load live IPOs')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const refresh = async () => {
    if (Date.now() < cooldownUntil) {
      message.info('Please wait a moment before refreshing again');
      return;
    }
    setSyncing(true);
    try {
      const { data } = await client.post('/live-ipos/sync');
      setCooldownUntil(Date.now() + 2 * 60 * 1000);
      message.success(`${data.updated || 0} IPOs updated, ${data.created || 0} new`);
      setStatusFilter('ALL');
      setTypeFilter('ALL');
      setQ('');
      await load();
    } catch (err) {
      const retry = err.response?.data?.retryAfterSeconds;
      if (retry) setCooldownUntil(Date.now() + retry * 1000);
      message.error(getErrorMessage(err, 'Sync failed — showing last saved data'));
      await load();
    } finally {
      setSyncing(false);
    }
  };

  const addToMyIpos = async (id) => {
    setAddingId(id);
    try {
      await client.post(`/live-ipos/${id}/add-to-my-ipos`);
      message.success('Added to My IPOs');
      await load();
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not add IPO'));
    } finally {
      setAddingId(null);
    }
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (needle) {
        const hit = [r.name, r.companyName, r.symbol].some((v) =>
          String(v || '').toLowerCase().includes(needle)
        );
        if (!hit) return false;
      }
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (typeFilter !== 'ALL' && r.marketType !== typeFilter) return false;
      return true;
    });
  }, [rows, statusFilter, typeFilter, q]);

  const columns = [
    {
      title: 'IPO',
      dataIndex: 'name',
      width: 240,
      ellipsis: true,
      render: (v, r) => (
        <div className="live-ipo-name-cell">
          <div className="live-ipo-name-cell__title">{v}</div>
          <Typography.Text type="secondary" className="live-ipo-name-cell__sub">
            {r.companyName || r.symbol || '—'}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 120,
      render: (s) => {
        const meta = liveStatusMeta(s);
        return (
          <Tag color={meta.color}>
            <span className={meta.dot} /> {meta.label}
          </Tag>
        );
      },
    },
    {
      title: 'Type',
      dataIndex: 'marketType',
      width: 110,
      render: (v) => <Tag>{v === 'SME' ? 'SME' : 'Mainboard'}</Tag>,
    },
    { title: 'Open', dataIndex: 'openDate', width: 110, render: formatDate },
    { title: 'Close', dataIndex: 'closeDate', width: 110, render: formatDate },
    { title: 'Allotment', dataIndex: 'allotmentDate', width: 110, render: formatDate },
    { title: 'Listing', dataIndex: 'listingDate', width: 110, render: formatDate },
    { title: 'Price band', key: 'band', width: 130, render: (_, r) => formatPriceBand(r) },
    { title: 'Lot', dataIndex: 'lotSize', width: 80, render: (v) => v ?? '—' },
    { title: 'Issue size', dataIndex: 'issueSize', width: 110, render: (v) => v || '—' },
    { title: 'Registrar', dataIndex: 'registrarName', width: 120, ellipsis: true, render: (v, r) => v || r.registrar || '—' },
    { title: 'Sub', dataIndex: ['subscription', 'total'], width: 72, render: (v) => (v ? `${v}x` : '—') },
    {
      title: 'GMP',
      dataIndex: 'gmp',
      width: 88,
      render: (v) => <span style={{ fontWeight: 600 }}>{formatGmp(v)}</span>,
    },
    {
      title: 'GMP %',
      dataIndex: 'gmpPercentage',
      width: 80,
      render: (v) => (v == null ? '—' : `${v}%`),
    },
    {
      title: 'Est. listing',
      dataIndex: 'estimatedListingPrice',
      width: 110,
      render: (v) => (v != null ? formatCurrency(v) : '—'),
    },
    {
      title: 'GMP updated',
      dataIndex: 'gmpLastUpdated',
      width: 120,
      render: (v) => relativeTime(v),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 168,
      fixed: 'right',
      render: (_, r) => (
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <Link to={`/live-ipos/${r.id}`}>
            <Button size="small" icon={<EyeOutlined />} block>
              View details
            </Button>
          </Link>
          {r.isMyIpo ? (
            <Button size="small" icon={<CheckOutlined />} disabled block>
              Added to My IPOs
            </Button>
          ) : canAddLiveIpoToMyIpos(r) ? (
            <Button
              size="small"
              type="primary"
              icon={<PlusOutlined />}
              loading={addingId === r.id}
              onClick={() => addToMyIpos(r.id)}
              block
            >
              Add to My IPOs
            </Button>
          ) : (
            <Tooltip title="Closed and listed IPOs cannot be added to My IPOs">
              <Button size="small" disabled block>
                {r.status === 'LISTED' ? 'Listed — cannot add' : 'Closed — cannot add'}
              </Button>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Live IPOs"
        subtitle={
          usedFallback
            ? 'Sample data — IPO_PROVIDER is set to mock. Switch it off and click Refresh to load live IPOs.'
            : lastSyncedAt
              ? `Live market data · ${providerLabel(provider)} · Last updated ${relativeTime(lastSyncedAt)}`
              : 'Live IPO list from free public feeds (NSE, Downstox, IPO Alerts). Adding an IPO here is required before team applications.'
        }
        extra={
          <Button icon={<ReloadOutlined />} loading={syncing} onClick={refresh}>
            {syncing ? 'Syncing…' : 'Refresh'}
          </Button>
        }
      />
      <ContentCard
        title={
          filtered.length === rows.length
            ? `Live list (${rows.length})`
            : `Live list (${filtered.length} of ${rows.length})`
        }
        extra={
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search name, company, symbol"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 260 }}
          />
        }
      >
        {usedFallback && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="Demo data — not the live market"
            description="IPO_PROVIDER is set to mock. Switch it off and click Refresh to load real IPOs from NSE, Downstox, and IPO Alerts."
          />
        )}
        <Segmented
          style={{ marginBottom: 8 }}
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_FILTERS}
        />
        <Segmented
          style={{ marginBottom: 16 }}
          value={typeFilter}
          onChange={setTypeFilter}
          options={TYPE_FILTERS}
        />
        <Table
          rowKey="id"
          loading={loading || syncing}
          columns={columns}
          dataSource={filtered}
          locale={{ emptyText: 'No live IPOs yet — click Refresh to sync' }}
          {...tableDefaults}
          pagination={{
            ...tableDefaults.pagination,
            pageSize: 50,
            showTotal: (t) => `${t} records`,
          }}
          className="pro-table live-ipos-table"
          scroll={{ x: 2100 }}
        />
      </ContentCard>
    </div>
  );
}
