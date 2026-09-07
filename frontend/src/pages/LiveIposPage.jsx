import { useEffect, useMemo, useState } from 'react';
import { Alert, Input, Tooltip, message } from 'antd';
import { PlusOutlined, EyeOutlined, ReloadOutlined, CheckOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import client from '../api/client';
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
  return d.isValid() ? d.format('DD MMM') : '—';
}

function gmpTone(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '';
  return n > 0 ? 'ipo-gmp--up' : 'ipo-gmp--down';
}

function Kpi({ label, value, hint, tone = 'neutral', active, onClick }) {
  return (
    <button
      type="button"
      className={`dash-kpi-a mem-kpi-btn${active ? ' is-on' : ''}`}
      onClick={onClick}
    >
      <article className={`dash-kpi dash-kpi--${tone}`}>
        <span className="dash-kpi-label">{label}</span>
        <strong className="dash-kpi-value">{value}</strong>
        {hint ? <span className="dash-kpi-hint">{hint}</span> : null}
      </article>
    </button>
  );
}

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

  const counts = useMemo(() => ({
    ALL: rows.length,
    UPCOMING: rows.filter((r) => r.status === 'UPCOMING').length,
    OPEN: rows.filter((r) => r.status === 'OPEN').length,
    CLOSED: rows.filter((r) => r.status === 'CLOSED').length,
    LISTED: rows.filter((r) => r.status === 'LISTED').length,
  }), [rows]);

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

  const subtitle = usedFallback
    ? 'Sample data — IPO_PROVIDER is set to mock. Switch it off and click Refresh to load live IPOs.'
    : lastSyncedAt
      ? `Live market data · ${providerLabel(provider)} · Updated ${relativeTime(lastSyncedAt)}`
      : 'Live list from NSE, Downstox, and IPO Alerts. Add an IPO here before team applications.';

  return (
    <div className="liveipo">
      <header className="dash-head">
        <div>
          <p className="dash-hello">Market</p>
          <h1>Live IPOs</h1>
          <p className="dash-lead">{subtitle}</p>
        </div>
        <div className="dash-head-actions">
          <Link to="/my-ipos" className="dash-btn">My IPOs</Link>
          <button type="button" className="dash-btn dash-btn--primary" onClick={refresh} disabled={syncing}>
            <ReloadOutlined /> {syncing ? 'Syncing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {usedFallback && (
        <Alert
          type="info"
          showIcon
          className="mem-alert"
          message="Demo data — not the live market"
          description="IPO_PROVIDER is set to mock. Switch it off and click Refresh to load real IPOs."
        />
      )}

      <section className="dash-kpi-grid liveipo-kpis">
        <Kpi label="All" value={counts.ALL} hint="In the catalog" active={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')} />
        <Kpi label="Upcoming" value={counts.UPCOMING} tone="warn" active={statusFilter === 'UPCOMING'} onClick={() => setStatusFilter('UPCOMING')} />
        <Kpi label="Open" value={counts.OPEN} tone="up" active={statusFilter === 'OPEN'} onClick={() => setStatusFilter('OPEN')} />
        <Kpi label="Closed" value={counts.CLOSED} tone="down" active={statusFilter === 'CLOSED'} onClick={() => setStatusFilter('CLOSED')} />
        <Kpi label="Listed" value={counts.LISTED} tone="info" active={statusFilter === 'LISTED'} onClick={() => setStatusFilter('LISTED')} />
      </section>

      <section className="dash-card mem-card">
        <div className="mem-toolbar">
          <Input.Search
            className="mem-search"
            placeholder="Search name, company, symbol…"
            allowClear
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <p className="mem-count">
            Showing <strong>{filtered.length}</strong>
            {filtered.length !== rows.length ? ` of ${rows.length}` : ''}
          </p>
        </div>

        <div className="mem-chips" role="tablist" aria-label="IPO type">
          <button type="button" className={`mem-chip${typeFilter === 'ALL' ? ' is-on' : ''}`} onClick={() => setTypeFilter('ALL')}>
            All types
          </button>
          <button type="button" className={`mem-chip${typeFilter === 'MAINBOARD' ? ' is-on' : ''}`} onClick={() => setTypeFilter('MAINBOARD')}>
            Mainboard
          </button>
          <button type="button" className={`mem-chip${typeFilter === 'SME' ? ' is-on' : ''}`} onClick={() => setTypeFilter('SME')}>
            SME
          </button>
        </div>

        {loading && rows.length === 0 ? (
          <div className="ipo-grid" aria-hidden>
            {[1, 2, 3, 4, 5, 6].map((n) => <div key={n} className="mem-skel" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mem-empty">
            <p>{rows.length === 0 ? 'No live IPOs yet — click Refresh to sync.' : 'No IPOs match these filters.'}</p>
            {rows.length === 0 && (
              <button type="button" className="dash-btn dash-btn--primary" onClick={refresh}>
                <ReloadOutlined /> Refresh
              </button>
            )}
          </div>
        ) : (
          <div className="ipo-grid">
            {filtered.map((r) => {
              const meta = liveStatusMeta(r.status);
              const canAdd = canAddLiveIpoToMyIpos(r);
              const sub = r.subscription?.total;
              return (
                <article key={r.id} className="ipo-item">
                  <header className="ipo-item-head">
                    <div>
                      <div className="ipo-item-tags">
                        <span className={`ipo-pill is-${String(r.status || '').toLowerCase()}`}>
                          <span className={meta.dot} />
                          {meta.label}
                        </span>
                        <span className="ipo-pill is-muted">{r.marketType === 'SME' ? 'SME' : 'Mainboard'}</span>
                        {r.isMyIpo && <span className="ipo-pill is-ok">On My IPOs</span>}
                      </div>
                      <h3>{r.name}</h3>
                      <p className="ipo-item-sub">{r.companyName || r.symbol || '—'}</p>
                    </div>
                    <div className={`ipo-gmp ${gmpTone(r.gmp)}`}>
                      <span>GMP</span>
                      <strong>{formatGmp(r.gmp)}</strong>
                      {r.gmpPercentage != null && <em>{r.gmpPercentage}%</em>}
                    </div>
                  </header>

                  <div className="ipo-facts">
                    <div>
                      <span>Open</span>
                      <b>{formatDate(r.openDate)}</b>
                    </div>
                    <div>
                      <span>Close</span>
                      <b>{formatDate(r.closeDate)}</b>
                    </div>
                    <div>
                      <span>Price</span>
                      <b>{formatPriceBand(r)}</b>
                    </div>
                    <div>
                      <span>Lot</span>
                      <b>{r.lotSize ?? '—'}</b>
                    </div>
                    <div>
                      <span>Sub</span>
                      <b>{sub ? `${sub}x` : '—'}</b>
                    </div>
                    {r.estimatedListingPrice != null && (
                      <div>
                        <span>Est. listing</span>
                        <b>{formatCurrency(r.estimatedListingPrice)}</b>
                      </div>
                    )}
                  </div>

                  {(r.registrarName || r.registrar || r.issueSize) && (
                    <p className="ipo-item-foot">
                      {r.registrarName || r.registrar || 'Registrar —'}
                      {r.issueSize ? ` · ${r.issueSize}` : ''}
                    </p>
                  )}

                  <div className="ipo-item-actions">
                    <Link to={`/live-ipos/${r.id}`} className="dash-btn sg-mini">
                      <EyeOutlined /> Details
                    </Link>
                    {r.isMyIpo ? (
                      <button type="button" className="dash-btn sg-mini" disabled>
                        <CheckOutlined /> Added
                      </button>
                    ) : canAdd ? (
                      <button
                        type="button"
                        className="dash-btn dash-btn--primary sg-mini"
                        disabled={addingId === r.id}
                        onClick={() => addToMyIpos(r.id)}
                      >
                        <PlusOutlined /> {addingId === r.id ? 'Adding…' : 'Add to My IPOs'}
                      </button>
                    ) : (
                      <Tooltip title="Closed and listed IPOs cannot be added to My IPOs">
                        <span>
                          <button type="button" className="dash-btn sg-mini" disabled>
                            {r.status === 'LISTED' ? 'Listed' : 'Closed'}
                          </button>
                        </span>
                      </Tooltip>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
