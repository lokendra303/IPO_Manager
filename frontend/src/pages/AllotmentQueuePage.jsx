import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Input, Alert, Segmented, Table, Typography, message, Result } from 'antd';
import {
  ArrowLeftOutlined,
  CalendarOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  ClockCircleFilled,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import client from '../api/client';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';
import PageLoading from '../components/PageLoading';
import StatCard from '../components/StatCard';
import AllotmentProcessPanel from '../components/AllotmentProcessPanel';
import AllotmentStatusBadge from '../components/AllotmentStatusBadge';
import { getErrorMessage } from '../utils/errors';
import { formatCurrency, relativeTime } from '../utils/format';
import { tableDefaults } from '../utils/table';
import { checkAllotmentSequentially, pickAllotmentTargets, applyAllotmentResult, sameAllotmentId } from '../utils/allotmentAutoCheck';
import { ipoIsListed } from '../utils/ipoProfit';

const AVATAR_TONES = [
  ['#ccfbf1', '#0f766e'],
  ['#e0e7ff', '#4338ca'],
  ['#fce7f3', '#be185d'],
  ['#ffedd5', '#c2410c'],
  ['#dbeafe', '#1d4ed8'],
  ['#ede9fe', '#6d28d9'],
];

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function avatarTone(name) {
  const s = String(name || '');
  let n = 0;
  for (let i = 0; i < s.length; i += 1) n += s.charCodeAt(i);
  return AVATAR_TONES[n % AVATAR_TONES.length];
}

function recount(applications) {
  const counts = {
    total: applications.length,
    allotted: 0,
    partiallyAllotted: 0,
    notAllotted: 0,
    pending: 0,
    checking: 0,
    checked: 0,
  };
  for (const row of applications) {
    const s = row.allotmentStatus;
    if (s === 'ALLOTED') counts.allotted += 1;
    else if (s === 'PARTIALLY_ALLOTTED') counts.partiallyAllotted += 1;
    else if (s === 'NOT_ALLOTED') counts.notAllotted += 1;
    else if (s === 'PENDING' || s === 'CHECKING' || s === 'RETRY' || s === 'ERROR') counts.pending += 1;
    if (s !== 'PENDING' && s !== 'CHECKING' && s !== 'RETRY') counts.checked += 1;
  }
  return counts;
}

function statusRank(status, isChecking) {
  if (isChecking) return 0;
  if (status === 'ALLOTED') return 1;
  if (status === 'PARTIALLY_ALLOTTED') return 2;
  if (status === 'NOT_ALLOTED') return 3;
  if (status === 'RETRY' || status === 'ERROR') return 4;
  if (status === 'PENDING' || status === 'CHECKING') return 5;
  return 6;
}

function isAllottedStatus(status) {
  return status === 'ALLOTED' || status === 'PARTIALLY_ALLOTTED';
}

function rowClassName(row, checkingId, waitingForListing) {
  const parts = ['allotment-row'];
  if (sameAllotmentId(checkingId, row.id)) parts.push('allotment-row--checking');
  else if (waitingForListing && isAllottedStatus(row.allotmentStatus)) parts.push('allotment-row--waiting');
  else if (isAllottedStatus(row.allotmentStatus)) parts.push('allotment-row--allotted');
  else if (row.allotmentStatus === 'NOT_ALLOTED') parts.push('allotment-row--missed');
  else if (['PENDING', 'CHECKING', 'RETRY', 'ERROR'].includes(row.allotmentStatus)) parts.push('allotment-row--pending');
  return parts.join(' ');
}

export default function AllotmentQueuePage() {
  const { id } = useParams();
  const [queue, setQueue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkingId, setCheckingId] = useState(null);
  const [progress, setProgress] = useState(null);
  const [summary, setSummary] = useState(null);
  const [activity, setActivity] = useState([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [q, setQ] = useState('');

  const [blocked, setBlocked] = useState(null);

  const load = ({ quiet } = {}) => {
    if (!quiet) setLoading(true);
    setBlocked(null);
    return client
      .get(`/ipos/${id}/allotment`)
      .then((r) => setQueue(r.data))
      .catch((err) => {
        if (err.response?.status === 409 && err.response?.data?.code === 'ALLOTMENT_NOT_OPEN') {
          setBlocked(getErrorMessage(err, 'Allotment is not open on NSE/BSE yet.'));
          setQueue(null);
          return;
        }
        message.error(getErrorMessage(err, 'Failed to load allotment'));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [id]);

  const patchRow = (appId, result) => {
    setQueue((prev) => {
      if (!prev?.applications) return prev;
      const applications = prev.applications.map((row) => (
        sameAllotmentId(row.id, appId) ? applyAllotmentResult(row, result) : row
      ));
      return { ...prev, applications, counts: recount(applications) };
    });
  };

  const applyQueue = (applications, counts) => {
    if (!Array.isArray(applications)) return;
    setQueue((prev) => {
      if (!prev) return prev;
      return { ...prev, applications, counts: counts || recount(applications) };
    });
  };

  const runCheck = async (recheck = false) => {
    const targets = pickAllotmentTargets(queue?.applications, recheck);
    if (!targets.length) {
      message.info(recheck ? 'No members to recheck' : 'No pending members');
      return;
    }
    setChecking(true);
    setSummary(null);
    setActivity([]);
    setProgress({
      current: 0,
      total: targets.length,
      name: null,
      phase: 'start',
      allotted: 0,
      notAllotted: 0,
    });
    let allotted = 0;
    let notAllotted = 0;
    try {
      const stats = await checkAllotmentSequentially({
        ipoId: id,
        targets,
        onProgress: ({ index, total, id: appId, name, phase, row, message: blocked, providerLabel }) => {
          setCheckingId(phase === 'checking' ? appId : null);
          if (row?.status === 'ALLOTED' || row?.status === 'PARTIALLY_ALLOTTED') allotted += 1;
          if (row?.status === 'NOT_ALLOTED') notAllotted += 1;
          if (phase === 'done' && row) {
            setActivity((prev) => [
              { key: `${appId}-${index}`, name, status: row.status, lots: row.allottedLots },
              ...prev,
            ].slice(0, 8));
          }
          setProgress({
            current: phase === 'checking' ? index : index + 1,
            total,
            name,
            phase,
            message: blocked,
            providerLabel,
            allotted,
            notAllotted,
          });
        },
        onQueue: applyQueue,
        onRow: (row, app) => {
          if (!row || row.skipped) return;
          patchRow(app.id, row);
        },
      });
      setSummary(stats);
      setStatusFilter('ALL');
      await load({ quiet: true });
      if (stats.message && !stats.checked) message.warning(stats.message);
      else {
        const waiting = !ipoIsListed(queue?.ipo);
        message.success(
          waiting && stats.allotted
            ? `Checked ${stats.checked} · ${stats.allotted} waiting for listing · ${stats.notAllotted} not allotted`
            : `Checked ${stats.checked} member${stats.checked === 1 ? '' : 's'}`
        );
      }
    } catch (err) {
      message.error(getErrorMessage(err, 'Allotment check failed'));
    } finally {
      setChecking(false);
      setCheckingId(null);
    }
  };

  const counts = queue?.counts || {};
  const rows = queue?.applications || [];
  const listed = ipoIsListed(queue?.ipo);
  const waitingForListing = !listed;
  const allottedCount = (counts.allotted || 0) + (counts.partiallyAllotted || 0);
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows
      .filter((row) => {
        if ((statusFilter === 'ALLOTTED' || statusFilter === 'WAITING') && !isAllottedStatus(row.allotmentStatus)) return false;
        if (statusFilter === 'NOT_ALLOTED' && row.allotmentStatus !== 'NOT_ALLOTED') return false;
        if (statusFilter === 'PENDING' && !['PENDING', 'CHECKING', 'RETRY', 'ERROR'].includes(row.allotmentStatus)) return false;
        if (!query) return true;
        return String(row.name || '').toLowerCase().includes(query)
          || String(row.maskedPan || '').toLowerCase().includes(query);
      })
      .sort((a, b) => {
        const rank = statusRank(a.allotmentStatus, sameAllotmentId(checkingId, a.id))
          - statusRank(b.allotmentStatus, sameAllotmentId(checkingId, b.id));
        if (rank !== 0) return rank;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
  }, [rows, statusFilter, q, checkingId]);

  const columns = [
    {
      title: 'Member',
      dataIndex: 'name',
      render: (name, row) => {
        const [bg, fg] = avatarTone(name);
        return (
          <div className="allotment-member">
            <span className="allotment-member-avatar" style={{ background: bg, color: fg }}>{initials(name)}</span>
            <div>
              <div className="allotment-member-name">{name}</div>
              <div className="allotment-member-sub">
                {row.maskedPan || 'No PAN'}
                {sameAllotmentId(checkingId, row.id) ? ' · querying registrar…' : ''}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Applied',
      dataIndex: 'appliedAmount',
      width: 140,
      align: 'right',
      render: (v, row) => (
        <div className="allotment-applied">
          <div>{formatCurrency(v)}</div>
          {row.appliedLots != null && (
            <div className="allotment-member-sub">{row.appliedLots} applied lot{row.appliedLots === 1 ? '' : 's'}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Allotted lots',
      dataIndex: 'allottedLots',
      width: 130,
      align: 'center',
      render: (v, row) => {
        if (row.allotmentStatus !== 'ALLOTED' && row.allotmentStatus !== 'PARTIALLY_ALLOTTED') {
          return <span className="allotment-lots allotment-lots--empty">—</span>;
        }
        return <span className="allotment-lots">{v ?? '—'}</span>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'allotmentStatus',
      width: 240,
      render: (status, row) => (
        <AllotmentStatusBadge
          status={status}
          lots={row.allottedLots}
          checking={sameAllotmentId(checkingId, row.id)}
          waitingForListing={waitingForListing}
        />
      ),
    },
    {
      title: 'Checked',
      dataIndex: 'checkedAt',
      width: 150,
      render: (v) => (
        <Typography.Text type="secondary">{v ? relativeTime(v) : 'Not yet'}</Typography.Text>
      ),
    },
  ];

  if (loading && !queue && !blocked) return <PageLoading />;

  if (blocked) {
    return (
      <div className="allotment-checker">
        <Result
          status="info"
          icon={<CalendarOutlined />}
          title="Allotment not open yet"
          subTitle={blocked}
          extra={(
            <Link to={`/ipos/${id}`}>
              <Button type="primary" icon={<ArrowLeftOutlined />}>Back to IPO</Button>
            </Link>
          )}
        />
      </div>
    );
  }

  const statFilters = [
    waitingForListing
      ? { key: 'WAITING', title: 'Waiting for listing', value: allottedCount, icon: <CalendarOutlined />, variant: 'info' }
      : { key: 'ALLOTTED', title: 'Allotted', value: allottedCount, icon: <CheckCircleFilled />, variant: 'success' },
    { key: 'NOT_ALLOTED', title: 'Not allotted', value: counts.notAllotted || 0, icon: <CloseCircleFilled />, variant: 'default' },
    { key: 'PENDING', title: 'Pending', value: counts.pending || 0, icon: <ClockCircleFilled />, variant: 'warning' },
    { key: 'ALL', title: 'Team', value: counts.total || 0, icon: <TeamOutlined />, variant: 'info' },
  ];

  return (
    <div className="allotment-checker">
      <PageHeader
        title={`${queue?.ipo?.name || 'IPO'} — Allotment`}
        subtitle="Checks the registrar that currently lists this IPO (MUFG Intime, KFintech, or Skyline). Bigshare, Cameo and Purva are detected when allotment is live, but those sites need a captcha."
        extra={
          <Link to={`/ipos/${id}`}>
            <Button icon={<ArrowLeftOutlined />}>Back to IPO</Button>
          </Link>
        }
      />

      {waitingForListing && allottedCount > 0 && (
        <Alert
          type="info"
          showIcon
          icon={<CalendarOutlined />}
          style={{ marginBottom: 16 }}
          message={`${allottedCount} allotted member${allottedCount === 1 ? '' : 's'} waiting for listing`}
          description="Funds stay blocked until the IPO lists. Mark it listed on the IPO page to enter withdrawal and P&L."
          action={(
            <Link to={`/ipos/${id}`}>
              <Button size="small" type="primary">Mark listed</Button>
            </Link>
          )}
        />
      )}

      <div className="dashboard-stat-grid" style={{ marginBottom: 16 }}>
        {statFilters.map((stat) => (
          <button
            key={stat.key}
            type="button"
            className={`allotment-stat-btn ${statusFilter === stat.key ? 'is-active' : ''}`}
            onClick={() => setStatusFilter(stat.key)}
          >
            <StatCard title={stat.title} value={stat.value} icon={stat.icon} variant={stat.variant} />
          </button>
        ))}
      </div>

      <ContentCard
        className="allotment-process-card"
        title={checking ? 'Checking allotment' : 'Check allotment'}
        extra={
          <div className="allotment-actions">
            <Button
              type="primary"
              icon={<SearchOutlined />}
              loading={checking}
              onClick={() => runCheck(false)}
            >
              Check pending
            </Button>
            <Button icon={<ReloadOutlined />} loading={checking} onClick={() => runCheck(true)}>
              Recheck all
            </Button>
          </div>
        }
        padded
        style={{ marginBottom: 16 }}
      >
        <AllotmentProcessPanel
          checking={checking}
          progress={progress}
          summary={summary}
          activity={activity}
          waitingForListing={waitingForListing}
        />
      </ContentCard>

      <ContentCard
        title={`Members (${filtered.length}${filtered.length !== rows.length ? ` of ${rows.length}` : ''})`}
        extra={
          <div className="allotment-table-tools">
            <Segmented
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { label: 'All', value: 'ALL' },
                waitingForListing
                  ? { label: 'Waiting for listing', value: 'WAITING' }
                  : { label: 'Allotted', value: 'ALLOTTED' },
                { label: 'Not allotted', value: 'NOT_ALLOTED' },
                { label: 'Pending', value: 'PENDING' },
              ]}
            />
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Search member or PAN"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: 220 }}
            />
          </div>
        }
      >
        <Table
          {...tableDefaults}
          className="pro-table allotment-table"
          rowKey={(row) => String(row.id)}
          columns={columns}
          dataSource={filtered}
          loading={loading && !checking}
          rowClassName={(row) => rowClassName(row, checkingId, waitingForListing)}
          pagination={filtered.length > 20 ? { pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} members` } : false}
          locale={{ emptyText: 'No applications match this filter' }}
        />
      </ContentCard>
    </div>
  );
}
