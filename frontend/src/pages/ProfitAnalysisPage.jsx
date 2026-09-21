import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Modal, Select, message } from 'antd';
import {
  DownloadOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatPan, pnlClassName } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import {
  createProfitAnalysisPdfPreviewUrl,
  downloadProfitAnalysisPdf,
} from '../utils/profitAnalysisPdf';
import PageLoading from '../components/PageLoading';

const MONTH_OPTIONS = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Aug' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dec' },
];

const AVATAR_TONES = ['teal', 'slate', 'blue', 'amber', 'rose', 'violet'];

function yearOptions() {
  const current = new Date().getFullYear();
  const years = [];
  for (let y = current; y >= current - 10; y -= 1) {
    years.push({ value: y, label: String(y) });
  }
  return years;
}

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((p) => p[0]).join('').toUpperCase() || '?';
}

function avatarTone(id) {
  return AVATAR_TONES[Math.abs(Number(id) || 0) % AVATAR_TONES.length];
}

function Amt({ value }) {
  return <b className={pnlClassName(value)}>{formatCurrency(value)}</b>;
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

function ShareMix({ member, manager, provider }) {
  const m = Math.abs(Number(member) || 0);
  const g = Math.abs(Number(manager) || 0);
  const p = Math.abs(Number(provider) || 0);
  const total = m + g + p;
  if (!total) return null;
  return (
    <div
      className="panal-mix"
      role="img"
      aria-label={`Member ${formatCurrency(member)}, you ${formatCurrency(manager)}, provider ${formatCurrency(provider)}`}
    >
      {m > 0 ? <span className="panal-mix-seg panal-mix-seg--member" style={{ flexGrow: m }} /> : null}
      {g > 0 ? <span className="panal-mix-seg panal-mix-seg--manager" style={{ flexGrow: g }} /> : null}
      {p > 0 ? <span className="panal-mix-seg panal-mix-seg--provider" style={{ flexGrow: p }} /> : null}
    </div>
  );
}

function ShareGrid({ member, manager, provider, gross, pending, splits }) {
  return (
    <div className="panal-shares">
      {gross != null ? (
        <div>
          <span>Gross P&amp;L</span>
          <Amt value={gross} />
        </div>
      ) : null}
      <div>
        <span>Member</span>
        <Amt value={member} />
      </div>
      <div>
        <span>You</span>
        <Amt value={manager} />
      </div>
      <div>
        <span>Provider</span>
        <Amt value={provider} />
      </div>
      {pending != null && Number(pending) !== 0 ? (
        <div className="panal-shares-cell--warn">
          <span>Pending</span>
          <Amt value={pending} />
        </div>
      ) : null}
      {splits != null ? (
        <div>
          <span>Splits</span>
          <b>{splits}</b>
        </div>
      ) : null}
    </div>
  );
}

function PersonCard({ row, showGroup }) {
  return (
    <article className="panal-person">
      <span className={`mem-avatar mem-avatar--${avatarTone(row.memberId)}`}>
        {initials(row.displayName)}
      </span>
      <div className="panal-person-main">
        <div className="panal-person-top">
          <strong>{row.displayName}</strong>
          {row.isGroupLeader || row.isLeader ? <span className="mem-status is-on">Leader</span> : null}
        </div>
        <p className="mem-person-meta">
          {formatPan(row.pan) || 'No PAN'}
          {showGroup && row.memberGroupName ? ` · ${row.memberGroupName}` : ''}
        </p>
        <ShareGrid
          gross={row.grossIpoPnL}
          member={row.memberShare}
          manager={row.managerShare}
          provider={row.providerShare}
          pending={row.pendingGross}
        />
        <ShareMix member={row.memberShare} manager={row.managerShare} provider={row.providerShare} />
      </div>
    </article>
  );
}

function SliceCard({ title, subtitle, row }) {
  return (
    <article className="panal-slice">
      <div className="panal-slice-top">
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
      <ShareGrid
        member={row.memberShare}
        manager={row.managerShare}
        provider={row.providerShare}
        gross={row.grossDistributed}
        splits={row.distributionCount}
      />
      <ShareMix member={row.memberShare} manager={row.managerShare} provider={row.providerShare} />
    </article>
  );
}

function EmptyState({ children }) {
  return <p className="panal-empty">{children}</p>;
}

export default function ProfitAnalysisPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('revenue');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewFileName, setPreviewFileName] = useState('');
  const [year, setYear] = useState(null);
  const [months, setMonths] = useState([]);

  const yearOpts = useMemo(() => yearOptions(), []);

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (year) {
      params.year = year;
      if (months.length) params.months = months.join(',');
    }
    client
      .get('/profit-shares/analysis', { params })
      .then((r) => setData(r.data))
      .catch((err) => message.error(getErrorMessage(err, 'Could not load analysis')))
      .finally(() => setLoading(false));
  }, [year, months]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const pdfMeta = () => ({
    teamName: user?.tenantName || 'IPO Team',
    generatedAt: new Date().toISOString(),
  });

  const downloadPdf = () => {
    if (!data) return;
    setPdfLoading(true);
    try {
      downloadProfitAnalysisPdf(data, pdfMeta());
      message.success('Profit analysis PDF downloaded');
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not generate PDF'));
    } finally {
      setPdfLoading(false);
    }
  };

  const previewPdf = () => {
    if (!data) return;
    setPdfLoading(true);
    try {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const { url, fileName } = createProfitAnalysisPdfPreviewUrl(data, pdfMeta());
      setPreviewUrl(url);
      setPreviewFileName(fileName);
      setPreviewOpen(true);
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not preview PDF'));
    } finally {
      setPdfLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewOpen(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  const toggleMonth = (m) => {
    if (!year) return;
    setMonths((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort((a, b) => a - b)));
  };

  if (loading && !data) return <PageLoading />;

  const revenue = data?.revenue || {};
  const manager = data?.manager || {};
  const overall = data?.overall || {};
  const reportScope = data?.reportScope || {};
  const applicationCount = Number(
    reportScope.applicationCount ?? overall.applicationCount ?? revenue.applicationCount ?? 0
  );
  const profitApps = Number(reportScope.profitApps ?? overall.profitApps ?? 0);
  const iposApplied = Number(reportScope.iposApplied ?? overall.iposApplied ?? 0);
  const iposProfit = Number(reportScope.iposProfit ?? overall.iposProfit ?? 0);
  const appsLabel =
    reportScope.applicationsLabel
    || (applicationCount === 1 ? '1 application' : `${applicationCount} applications`);
  const iposAppliedLabel =
    reportScope.iposAppliedLabel
    || (iposApplied === 1 ? '1 IPO applied' : `${iposApplied} IPOs applied`);
  const iposProfitLabel =
    reportScope.iposProfitLabel
    || (iposProfit === 1 ? '1 IPO gave profit' : `${iposProfit} IPOs gave profit`);
  const periodLabel =
    reportScope.filters?.label
    || reportScope.periodLabel
    || 'All time';

  const members = data?.members || [];
  const subGroups = data?.subGroups || [];
  const ungroupedMembers = data?.ungroupedMembers || [];
  const providers = data?.providers || [];
  const segments = data?.bySegment || [];
  const categories = data?.byCategory || [];
  const pendingCount = Number(overall.pendingCount || 0);
  const splitCount = Number(overall.distributionCount || 0);

  const tabs = [
    { key: 'revenue', label: 'Revenue' },
    { key: 'members', label: 'Members', count: members.length },
    { key: 'subgroups', label: 'Sub-groups', count: subGroups.length },
    { key: 'providers', label: 'Providers', count: providers.length },
    { key: 'manager', label: 'You' },
  ];

  return (
    <div className={`panal${loading ? ' is-loading' : ''}`}>
      <header className="dash-head">
        <div>
          <p className="dash-hello">P&amp;L report</p>
          <h1>Profit analysis</h1>
          <p className="dash-lead">
            {periodLabel} · {iposAppliedLabel} · {iposProfitLabel}
          </p>
        </div>
        <div className="dash-head-actions">
          <Link to="/profit-sharing" className="dash-btn">Sharing</Link>
          <button type="button" className="dash-btn" disabled={pdfLoading || !data} onClick={previewPdf}>
            <EyeOutlined /> Preview
          </button>
          <button
            type="button"
            className="dash-btn dash-btn--primary"
            disabled={pdfLoading || !data}
            onClick={downloadPdf}
          >
            <DownloadOutlined /> Download PDF
          </button>
        </div>
      </header>

      <section className="dash-card panal-period">
        <div className="dash-card-head">
          <h2>Period</h2>
          {(year || months.length > 0) && (
            <button
              type="button"
              className="dash-btn sg-mini"
              onClick={() => {
                setYear(null);
                setMonths([]);
              }}
            >
              All time
            </button>
          )}
        </div>
        <Select
          allowClear
          placeholder="All years"
          className="panal-year"
          options={yearOpts}
          value={year}
          onChange={(v) => {
            setYear(v ?? null);
            if (!v) setMonths([]);
          }}
        />
        <div className="mem-chips panal-months">
          {MONTH_OPTIONS.map((m) => (
            <button
              key={m.value}
              type="button"
              disabled={!year}
              className={`mem-chip${months.includes(m.value) ? ' is-on' : ''}`}
              onClick={() => toggleMonth(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
        {!year ? (
          <p className="panal-period-hint">Pick a year to filter by month.</p>
        ) : (
          <p className="panal-period-hint">{appsLabel} in this period.</p>
        )}
      </section>

      <div className="pshare-money">
        <div className="pshare-money-cell pshare-money-cell--main">
          <span>Gross IPO P&amp;L</span>
          <strong>{formatCurrency(overall.grossIpoPnL)}</strong>
          <em>{iposAppliedLabel}</em>
        </div>
        <div className="pshare-money-cell">
          <span>Members</span>
          <strong>{formatCurrency(revenue.memberShare)}</strong>
          <em>Kept by members</em>
        </div>
        <div className="pshare-money-cell pshare-money-cell--up">
          <span>You</span>
          <strong>{formatCurrency(revenue.managerShare)}</strong>
          <em>Manager share</em>
        </div>
        <div className="pshare-money-cell">
          <span>Providers</span>
          <strong>{formatCurrency(revenue.providerShare)}</strong>
          <em>Fund provider share</em>
        </div>
      </div>

      <section className="dash-kpi-grid panal-kpis">
        <Kpi
          label="IPOs applied"
          value={iposApplied}
          hint={iposProfitLabel}
          tone="info"
          active={view === 'revenue'}
          onClick={() => setView('revenue')}
        />
        <Kpi
          label="IPOs in profit"
          value={iposProfit}
          hint={`${profitApps} apps in profit`}
          tone="up"
          active={view === 'revenue'}
          onClick={() => setView('revenue')}
        />
        <Kpi
          label="Pending split"
          value={pendingCount}
          hint={formatCurrency(revenue.pendingGross)}
          tone={pendingCount > 0 ? 'warn' : 'neutral'}
          active={view === 'revenue'}
          onClick={() => setView('revenue')}
        />
        <Kpi
          label="Splits recorded"
          value={splitCount}
          hint="Distributed applications"
          tone="teal"
          active={view === 'members'}
          onClick={() => setView('members')}
        />
      </section>

      <nav className="pshare-tabs" role="tablist" aria-label="Profit analysis sections">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={view === tab.key}
            className={`pshare-tab${view === tab.key ? ' is-on' : ''}`}
            onClick={() => setView(tab.key)}
          >
            {tab.label}
            {tab.count != null ? <b>{tab.count}</b> : null}
          </button>
        ))}
      </nav>

      {view === 'revenue' && (
        <>
          <p className="panal-lead">
            Split of distributed P&amp;L into who keeps the revenue — members, you, and fund providers.
            Pending amounts are allotted but not yet split.
          </p>
          <div className="panal-mini">
            <div>
              <span>Gross split (done)</span>
              <strong>{formatCurrency(revenue.grossDistributed)}</strong>
            </div>
            <div className="panal-mini--warn">
              <span>Pending to split</span>
              <strong>{formatCurrency(revenue.pendingGross)}</strong>
              <em>{pendingCount} application{pendingCount === 1 ? '' : 's'}</em>
            </div>
            <div>
              <span>Splits recorded</span>
              <strong>{splitCount}</strong>
            </div>
          </div>
          <ShareMix
            member={revenue.memberShare}
            manager={revenue.managerShare}
            provider={revenue.providerShare}
          />
          <div className="panal-legend">
            <span><i className="panal-dot panal-dot--member" /> Member</span>
            <span><i className="panal-dot panal-dot--manager" /> You</span>
            <span><i className="panal-dot panal-dot--provider" /> Provider</span>
          </div>

          <div className="panal-two">
            <section className="dash-card">
              <header className="dash-card-head">
                <h2>By IPO segment</h2>
              </header>
              {segments.length === 0 ? (
                <EmptyState>No splits yet</EmptyState>
              ) : (
                <ul className="panal-list">
                  {segments.map((row) => (
                    <li key={row.ipoSegment}>
                      <SliceCard title={row.label} row={row} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="dash-card">
              <header className="dash-card-head">
                <h2>By investor category</h2>
              </header>
              {categories.length === 0 ? (
                <EmptyState>No splits yet</EmptyState>
              ) : (
                <ul className="panal-list">
                  {categories.map((row) => (
                    <li key={row.investorCategory}>
                      <SliceCard title={row.label} row={row} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      {view === 'members' && (
        members.length === 0 ? (
          <EmptyState>No allotted IPO P&amp;L yet for this period.</EmptyState>
        ) : (
          <ul className="panal-list">
            {members.map((row) => (
              <li key={row.memberId}>
                <PersonCard row={row} showGroup />
              </li>
            ))}
          </ul>
        )
      )}

      {view === 'subgroups' && (
        <>
          <p className="panal-lead">
            Each group lists members with their own profit share. Totals are the sum against that
            leader’s group — profit stays with each member, not transferred to the leader.
          </p>
          {subGroups.length === 0 ? (
            <EmptyState>No sub-groups with members yet.</EmptyState>
          ) : (
            subGroups.map((g) => (
              <section key={g.groupId} className="dash-card panal-group">
                <header className="dash-card-head">
                  <h2>{g.groupName}</h2>
                  <span className="panal-group-meta">
                    {g.memberCount} member{g.memberCount === 1 ? '' : 's'} · Leader {g.leaderDisplayName || '—'}
                  </span>
                </header>
                <ShareGrid
                  gross={g.totals?.grossIpoPnL}
                  member={g.totals?.memberShare}
                  manager={g.totals?.managerShare}
                  provider={g.totals?.providerShare}
                />
                <ShareMix
                  member={g.totals?.memberShare}
                  manager={g.totals?.managerShare}
                  provider={g.totals?.providerShare}
                />
                <ul className="panal-list panal-list--nested">
                  {(g.members || []).map((row) => (
                    <li key={row.memberId}>
                      <PersonCard row={row} />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
          {ungroupedMembers.length > 0 && (
            <section className="dash-card panal-group">
              <header className="dash-card-head">
                <h2>Not in a sub-group</h2>
                <span className="panal-group-meta">{ungroupedMembers.length} members</span>
              </header>
              <ul className="panal-list panal-list--nested">
                {ungroupedMembers.map((row) => (
                  <li key={row.memberId}>
                    <PersonCard row={row} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {view === 'providers' && (
        providers.length === 0 ? (
          <EmptyState>No provider shares recorded yet.</EmptyState>
        ) : (
          <ul className="panal-list">
            {providers.map((row) => (
              <li key={row.fundProviderId}>
                <article className="panal-slice">
                  <div className="panal-slice-top">
                    <strong>{row.providerName}</strong>
                    <span>{row.distributionCount || 0} splits</span>
                  </div>
                  <div className="panal-shares">
                    <div>
                      <span>Total</span>
                      <Amt value={row.totalShare} />
                    </div>
                    <div>
                      <span>From profit</span>
                      <Amt value={row.profitShare} />
                    </div>
                    <div>
                      <span>From loss</span>
                      <Amt value={row.lossShare} />
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )
      )}

      {view === 'manager' && (
        <section className="dash-card panal-you">
          <header className="dash-card-head">
            <h2>{manager.label || 'Your share'}</h2>
          </header>
          <div className="pshare-money pshare-money--nested">
            <div className="pshare-money-cell pshare-money-cell--main">
              <span>Total share</span>
              <strong>{formatCurrency(manager.totalShare)}</strong>
              <em>Net after profit and loss splits</em>
            </div>
            <div className="pshare-money-cell pshare-money-cell--up">
              <span>From profit</span>
              <strong>{formatCurrency(manager.profitShare)}</strong>
              <em>Your cut on winning IPOs</em>
            </div>
            <div className="pshare-money-cell pshare-money-cell--warn">
              <span>From loss</span>
              <strong>{formatCurrency(manager.lossShare)}</strong>
              <em>Your share of losses</em>
            </div>
          </div>
        </section>
      )}

      <Modal
        title={previewFileName || 'Profit analysis report'}
        open={previewOpen}
        onCancel={closePreview}
        width="95vw"
        style={{ top: 24 }}
        styles={{ body: { padding: 0, height: '80vh' } }}
        footer={[
          <Button key="close" onClick={closePreview}>
            Close
          </Button>,
          <Button
            key="download"
            type="primary"
            icon={<DownloadOutlined />}
            onClick={() => {
              downloadPdf();
            }}
          >
            Download PDF
          </Button>,
        ]}
        destroyOnClose
      >
        {previewUrl ? (
          <iframe
            title="Profit analysis PDF preview"
            src={previewUrl}
            style={{ width: '100%', height: '80vh', border: 'none' }}
          />
        ) : null}
      </Modal>
    </div>
  );
}
