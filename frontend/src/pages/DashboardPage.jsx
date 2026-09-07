import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRightOutlined,
  BellOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { formatCurrency, formatDateTime, maskPan } from '../utils/format';
import PageLoading from '../components/PageLoading';
import { useAuth } from '../context/AuthContext';

const TYPE_LABEL = {
  PROVIDER_IN: 'Provider in',
  DISTRIBUTE_OUT: 'Distributed',
  RETURN_IN: 'Returned',
  PROVIDER_OUT: 'Provider out',
  ADJUSTMENT: 'Adjustment',
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function moneyTone(value) {
  const n = Number(value || 0);
  if (n > 0) return 'up';
  if (n < 0) return 'down';
  return 'neutral';
}

function Kpi({ to, label, value, hint, tone = 'neutral' }) {
  const body = (
    <article className={`dash-kpi dash-kpi--${tone}`}>
      <span className="dash-kpi-label">{label}</span>
      <strong className="dash-kpi-value">{value}</strong>
      {hint ? <span className="dash-kpi-hint">{hint}</span> : null}
    </article>
  );
  return to ? <Link to={to} className="dash-kpi-a">{body}</Link> : body;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [summary, setSummary] = useState(null);
  const [txns, setTxns] = useState([]);
  const [openIssueCount, setOpenIssueCount] = useState(0);
  const [pnlTotals, setPnlTotals] = useState(null);
  const [dash, setDash] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      client.get('/wallet'),
      client.get('/summary'),
      client.get('/wallet/transactions'),
      client.get('/member-issues/count'),
      client.get('/profit-shares/totals').catch(() => ({ data: null })),
      client.get('/dashboard').catch(() => ({ data: null })),
    ])
      .then(([w, s, t, issues, pnl, d]) => {
        setWallet(w.data);
        setSummary(s.data);
        setTxns((t.data || []).slice(0, 6));
        setOpenIssueCount(issues.data.openCount ?? 0);
        setPnlTotals(pnl.data);
        setDash(d.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const pendingReturns = useMemo(
    () => (summary?.rows ?? []).filter((r) => Number(r.willReceiveFromTeam) > 0),
    [summary]
  );
  const totalPendingReturn = pendingReturns.reduce((s, r) => s + Number(r.willReceiveFromTeam), 0);
  const pendingReturnAppCount = summary?.totals?.pendingReturnApplicationCount ?? 0;

  if (loading) return <PageLoading />;

  const overall = pnlTotals?.overall ?? {};
  const managerNet = overall.managerShare ?? 0;
  const managerProfit = overall.managerProfit ?? 0;
  const managerLoss = overall.managerLoss ?? 0;
  const grossIpoPnL = overall.grossIpoPnL ?? summary?.totals?.totalIpoProfit ?? 0;
  const activeMembers = summary?.rows?.filter((r) => r.status === 'ACTIVE').length ?? 0;
  const openIpoRows = (summary?.ipoSummary?.rows ?? []).filter((r) => r.status === 'OPEN');
  const openIpoTotals = openIpoRows.reduce(
    (acc, r) => ({
      totalDistributed: acc.totalDistributed + Number(r.totalDistributed || 0),
      totalReturned: acc.totalReturned + Number(r.totalReturned || 0),
      pendingReturn: acc.pendingReturn + Number(r.pendingReturn || 0),
      applicationCount: acc.applicationCount + Number(r.applicationCount || 0),
    }),
    { totalDistributed: 0, totalReturned: 0, pendingReturn: 0, applicationCount: 0 }
  );

  const gmp = dash?.currentGmp;
  const gmpValue = gmp?.gmp != null ? `₹${gmp.gmp}` : '—';
  const gmpHint = gmp?.name
    ? `${gmp.name}${gmp.gmpPercentage != null ? ` · ${gmp.gmpPercentage}%` : ''}`
    : 'Latest listed GMP';

  return (
    <div className="dash">
      <header className="dash-head">
        <div>
          <p className="dash-hello">{greeting()}</p>
          <h1>Dashboard</h1>
          <p className="dash-lead">
            {user?.tenantName ? `${user.tenantName} · ` : ''}
            Money, allotment, and open IPOs in one place.
          </p>
        </div>
        <div className="dash-head-actions">
          <Link to="/live-ipos" className="dash-btn">Live IPOs</Link>
          <Link to="/wallet" className="dash-btn">Wallet</Link>
          <Link to="/summary" className="dash-btn dash-btn--primary">Summary</Link>
        </div>
      </header>

      {(openIssueCount > 0 || totalPendingReturn > 0) && (
        <div className="dash-alerts">
          {openIssueCount > 0 && (
            <Link to="/notifications" className="dash-alert dash-alert--warn">
              <BellOutlined />
              <span><strong>{openIssueCount}</strong> open member issue{openIssueCount === 1 ? '' : 's'}</span>
            </Link>
          )}
          {totalPendingReturn > 0 && (
            <Link to="/summary" className="dash-alert dash-alert--danger">
              <ClockCircleOutlined />
              <span>
                <strong>{formatCurrency(totalPendingReturn)}</strong>
                {' '}to collect from {pendingReturns.length} member{pendingReturns.length === 1 ? '' : 's'}
                {' '}({pendingReturnAppCount} application{pendingReturnAppCount === 1 ? '' : 's'})
              </span>
            </Link>
          )}
        </div>
      )}

      <section className="dash-money">
        <Link to="/wallet" className="dash-money-cell dash-money-cell--main">
          <span>Wallet balance</span>
          <strong>{formatCurrency(wallet?.balance ?? 0)}</strong>
          <em>Ready to distribute</em>
        </Link>
        <Link to="/profit-sharing" className={`dash-money-cell dash-money-cell--${moneyTone(managerNet)}`}>
          <span>Your net share</span>
          <strong>{formatCurrency(managerNet)}</strong>
          <em>Profit {formatCurrency(managerProfit)} · Loss {formatCurrency(managerLoss)}</em>
        </Link>
        <Link to="/summary" className={`dash-money-cell ${totalPendingReturn > 0 ? 'dash-money-cell--warn' : ''}`}>
          <span>Still with members</span>
          <strong>{formatCurrency(totalPendingReturn)}</strong>
          <em>{activeMembers} active member{activeMembers === 1 ? '' : 's'}</em>
        </Link>
      </section>

      {dash && (
        <section className="dash-card">
          <header className="dash-card-head">
            <h2>Today</h2>
            <Link to="/my-ipos">My IPOs <ArrowRightOutlined /></Link>
          </header>
          <div className="dash-kpi-grid">
            <Kpi to="/live-ipos" label="Live IPOs" value={dash.liveIpos ?? 0} tone="info" />
            <Kpi to="/my-ipos" label="My IPOs" value={dash.myIpos ?? 0} tone="teal" />
            <Kpi to="/my-ipos" label="My open IPOs" value={dash.openIpoCount ?? 0} tone="warn" />
            <Kpi to="/members" label="Applications" value={dash.teamApplications ?? 0} />
            <Kpi label="Allotment pending" value={dash.pendingAllotments ?? 0} tone="warn" />
            <Kpi label="Allotted" value={dash.allotted ?? 0} tone="up" />
            <Kpi label="Not allotted" value={dash.notAllotted ?? 0} tone="down" />
            <Kpi to="/gmp" label="Current GMP" value={gmpValue} hint={gmpHint} tone="info" />
          </div>
        </section>
      )}

      <div className="dash-main">
        <section className="dash-card">
          <header className="dash-card-head">
            <h2>Open IPOs</h2>
            <Link to="/summary">Full summary <ArrowRightOutlined /></Link>
          </header>
          <div className="dash-inline-stats">
            <div>
              <span>Distributed</span>
              <b>{formatCurrency(openIpoTotals.totalDistributed)}</b>
            </div>
            <div>
              <span>Returned</span>
              <b>{formatCurrency(openIpoTotals.totalReturned)}</b>
            </div>
            <div>
              <span>With members</span>
              <b className={openIpoTotals.pendingReturn > 0 ? 'is-down' : ''}>
                {formatCurrency(openIpoTotals.pendingReturn)}
              </b>
            </div>
          </div>
          {openIpoRows.length === 0 ? (
            <p className="dash-empty">No open IPOs. Distributed issues will show here.</p>
          ) : (
            <ul className="dash-list">
              {openIpoRows.map((row) => (
                <li key={row.ipoId}>
                  <Link to={`/ipos/${row.ipoId}`} className="dash-list-row">
                    <div>
                      <strong>{row.name}</strong>
                      <span>{row.applicationCount} member{row.applicationCount === 1 ? '' : 's'}</span>
                    </div>
                    <div className="dash-list-figures">
                      <span>{formatCurrency(row.totalDistributed)}</span>
                      <b className={Number(row.pendingReturn) > 0 ? 'is-down' : ''}>
                        {formatCurrency(row.pendingReturn)} out
                      </b>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dash-card">
          <header className="dash-card-head">
            <h2>P&L</h2>
            <Link to="/profit-sharing">Details <ArrowRightOutlined /></Link>
          </header>
          <div className="dash-pnl">
            <div>
              <span>Gross IPO</span>
              <b className={`is-${moneyTone(grossIpoPnL)}`}>{formatCurrency(grossIpoPnL)}</b>
            </div>
            <div>
              <span>Providers</span>
              <b>{formatCurrency(overall.providerShare ?? 0)}</b>
            </div>
            <div>
              <span>Members kept</span>
              <b>{formatCurrency(overall.memberShare ?? 0)}</b>
            </div>
            <div>
              <span>Expected</span>
              <b className={`is-${moneyTone(dash?.expectedProfit)}`}>{formatCurrency(dash?.expectedProfit ?? 0)}</b>
            </div>
          </div>
          {(overall.pendingCount > 0 || overall.distributionCount > 0) && (
            <p className="dash-note">
              Splits done: {overall.distributionCount ?? 0}
              {(overall.pendingCount ?? 0) > 0 && (
                <> · pending {formatCurrency(overall.grossPending ?? 0)} ({overall.pendingCount})</>
              )}
            </p>
          )}
        </section>
      </div>

      <div className="dash-main dash-main--bottom">
        {pendingReturns.length > 0 && (
          <section className="dash-card">
            <header className="dash-card-head">
              <h2>Pending returns</h2>
              <Link to="/summary">All members <ArrowRightOutlined /></Link>
            </header>
            <ul className="dash-list">
              {pendingReturns.slice(0, 8).map((row) => (
                <li key={row.memberId} className="dash-list-row dash-list-row--static">
                  <div>
                    <strong>{row.displayName}</strong>
                    <span>
                      {maskPan(row.pan) || 'No PAN'}
                      {row.memberGroupName ? ` · ${row.memberGroupName}` : ''}
                    </span>
                  </div>
                  <b className="is-down">{formatCurrency(row.willReceiveFromTeam)}</b>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="dash-card">
          <header className="dash-card-head">
            <h2>Wallet activity</h2>
            <Link to="/wallet">View all <ArrowRightOutlined /></Link>
          </header>
          {txns.length === 0 ? (
            <p className="dash-empty">No transactions yet.</p>
          ) : (
            <ul className="dash-list">
              {txns.map((row) => (
                <li key={row.id} className="dash-list-row dash-list-row--static">
                  <div>
                    <strong>{TYPE_LABEL[row.type] || String(row.type || '').replace(/_/g, ' ')}</strong>
                    <span>{formatDateTime(row.txn_date)}</span>
                  </div>
                  <b className={`is-${moneyTone(row.amount)}`}>{formatCurrency(row.amount)}</b>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
