import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Input } from 'antd';
import client from '../api/client';
import { formatCurrency, formatPan, pnlClassName } from '../utils/format';
import PageLoading from '../components/PageLoading';

function moneyTone(value) {
  const n = Number(value || 0);
  if (n > 0) return 'up';
  if (n < 0) return 'down';
  return 'neutral';
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

function Fact({ label, value, tone }) {
  return (
    <div>
      <span>{label}</span>
      <b className={tone || undefined}>{value}</b>
    </div>
  );
}

function IpoCard({ row, rich }) {
  const pending = Number(row.pendingReturn) > 0;
  const open = row.status === 'OPEN';
  return (
    <Link to={`/ipos/${row.ipoId}`} className="ipo-item sum-ipo">
      <header className="ipo-item-head">
        <div>
          <div className="ipo-item-tags">
            <span className={`ipo-pill ${open ? 'is-open' : 'is-closed'}`}>{open ? 'Open' : 'Closed'}</span>
            <span className="ipo-pill is-muted">{row.ipoSegment === 'SME' ? 'SME' : 'Mainboard'}</span>
          </div>
          <h3>{row.name}</h3>
        </div>
        {rich && (
          <div className={`ipo-gmp ${pnlClassName(row.totalProfitLoss) === 'amount-positive' ? 'ipo-gmp--up' : pnlClassName(row.totalProfitLoss) === 'amount-negative' ? 'ipo-gmp--down' : ''}`}>
            <span>Gross P&L</span>
            <strong>{formatCurrency(row.totalProfitLoss)}</strong>
          </div>
        )}
      </header>
      <div className="ipo-facts">
        <Fact label="Distributed" value={formatCurrency(row.totalDistributed)} />
        <Fact label="Returned" value={formatCurrency(row.totalReturned)} />
        <Fact
          label="Still with members"
          value={formatCurrency(row.pendingReturn)}
          tone={pending ? 'ipo-gmp--down' : undefined}
        />
        <Fact label="Members" value={row.applicationCount ?? 0} />
        {rich && (
          <>
            <Fact label="Allotted" value={row.allottedCount ?? 0} />
            <Fact label="Not allotted" value={row.notAllottedCount ?? 0} />
            <Fact label="Did not apply" value={row.notAppliedCount ?? 0} />
            <Fact label="Pending allot." value={row.pendingAllotmentCount ?? 0} />
          </>
        )}
      </div>
      {rich && (
        <p className="ipo-item-foot">
          Returns {row.returnedCount}/{row.applicationCount}
          {Number(row.shareManagerTotal) ? ` · Manager ${formatCurrency(row.shareManagerTotal)}` : ''}
          {Number(row.shareProviderTotal) ? ` · Provider ${formatCurrency(row.shareProviderTotal)}` : ''}
          {Number(row.shareMemberTotal) ? ` · Member ${formatCurrency(row.shareMemberTotal)}` : ''}
          {row.profitSharedCount ? ` · ${row.profitSharedCount} splits` : ''}
        </p>
      )}
    </Link>
  );
}

export default function SummaryPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('OPEN');
  const [search, setSearch] = useState('');

  useEffect(() => {
    client
      .get('/summary')
      .then((r) => {
        setData(r.data);
        const openCount = (r.data?.ipoSummary?.rows ?? []).filter((row) => row.status === 'OPEN').length;
        setTab(openCount > 0 ? 'OPEN' : 'IPOS');
      })
      .finally(() => setLoading(false));
  }, []);

  const profit = data?.totals?.totalIpoProfit ?? 0;
  const ipo = data?.ipoSummary;
  const ipoTotals = ipo?.totals;
  const openIpoRows = useMemo(
    () => (ipo?.rows ?? []).filter((r) => r.status === 'OPEN'),
    [ipo]
  );
  const openIpoTotals = useMemo(
    () =>
      openIpoRows.reduce(
        (acc, r) => ({
          totalDistributed: acc.totalDistributed + Number(r.totalDistributed || 0),
          totalReturned: acc.totalReturned + Number(r.totalReturned || 0),
          pendingReturn: acc.pendingReturn + Number(r.pendingReturn || 0),
          applicationCount: acc.applicationCount + Number(r.applicationCount || 0),
        }),
        { totalDistributed: 0, totalReturned: 0, pendingReturn: 0, applicationCount: 0 }
      ),
    [openIpoRows]
  );

  const filteredIpos = useMemo(() => {
    const source = tab === 'OPEN' ? openIpoRows : (ipo?.rows ?? []);
    const q = search.trim().toLowerCase();
    if (!q) return source;
    return source.filter((r) => String(r.name || '').toLowerCase().includes(q));
  }, [tab, openIpoRows, ipo, search]);

  const filteredMembers = useMemo(() => {
    const source = data?.rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return source;
    return source.filter((r) =>
      [r.displayName, r.pan, r.memberGroupName]
        .some((v) => String(v || '').toLowerCase().includes(q))
    );
  }, [data, search]);

  if (loading) return <PageLoading />;

  if (!data) {
    return (
      <div className="sum">
        <header className="dash-head">
          <div>
            <p className="dash-hello">Team</p>
            <h1>Summary</h1>
            <p className="dash-lead">Could not load summary.</p>
          </div>
        </header>
      </div>
    );
  }

  const pendingTeam = data.totals.willReceiveFromTeam;

  return (
    <div className="sum">
      <header className="dash-head">
        <div>
          <p className="dash-hello">Team</p>
          <h1>Summary</h1>
          <p className="dash-lead">Funds, allotments, returns, and P&L by IPO and member.</p>
        </div>
        <div className="dash-head-actions">
          <Link to="/wallet" className="dash-btn">Wallet</Link>
          <Link to="/my-ipos" className="dash-btn">My IPOs</Link>
          <Link to="/profit-sharing" className="dash-btn dash-btn--primary">P&L share</Link>
        </div>
      </header>

      <section className="dash-money">
        <Link to="/wallet" className="dash-money-cell dash-money-cell--main">
          <span>Free wallet</span>
          <strong>{formatCurrency(data.availableFreeAmount)}</strong>
          <em>Ready to distribute</em>
        </Link>
        <Link to="/profit-sharing" className={`dash-money-cell dash-money-cell--${moneyTone(profit)}`}>
          <span>Team IPO profit</span>
          <strong>{formatCurrency(profit)}</strong>
          <em>Gross P&L across members</em>
        </Link>
        <button
          type="button"
          className={`dash-money-cell ${Number(pendingTeam) > 0 ? 'dash-money-cell--warn' : ''}`}
          onClick={() => { setTab('MEMBERS'); setSearch(''); }}
        >
          <span>Pending from team</span>
          <strong>{formatCurrency(pendingTeam)}</strong>
          <em>Still with members</em>
        </button>
      </section>

      <section className="dash-kpi-grid mem-kpis">
        <Kpi
          label="Open IPOs"
          value={openIpoRows.length}
          hint={formatCurrency(openIpoTotals.totalDistributed)}
          tone="warn"
          active={tab === 'OPEN'}
          onClick={() => setTab('OPEN')}
        />
        <Kpi
          label="All IPOs"
          value={ipoTotals?.ipoCount ?? ipo?.rows?.length ?? 0}
          hint="Full history"
          tone="teal"
          active={tab === 'IPOS'}
          onClick={() => setTab('IPOS')}
        />
        <Kpi
          label="Members"
          value={data.rows?.length ?? 0}
          hint="Given and returned"
          active={tab === 'MEMBERS'}
          onClick={() => setTab('MEMBERS')}
        />
        <Kpi
          label="Still out"
          value={formatCurrency(openIpoTotals.pendingReturn)}
          hint="Open IPO funds"
          tone={openIpoTotals.pendingReturn > 0 ? 'down' : 'neutral'}
          onClick={() => setTab('OPEN')}
          active={false}
        />
      </section>

      <section className="dash-card mem-card">
        <div className="mem-toolbar">
          <Input.Search
            className="mem-search"
            placeholder={tab === 'MEMBERS' ? 'Search member, PAN, group…' : 'Search IPO…'}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <p className="mem-count">
            Showing <strong>{tab === 'MEMBERS' ? filteredMembers.length : filteredIpos.length}</strong>
          </p>
        </div>

        {tab !== 'MEMBERS' && (
          <div className="dash-inline-stats sum-totals">
            {tab === 'OPEN' ? (
              <>
                <Fact label="Distributed" value={formatCurrency(openIpoTotals.totalDistributed)} />
                <Fact label="Returned" value={formatCurrency(openIpoTotals.totalReturned)} />
                <Fact
                  label="Still with members"
                  value={formatCurrency(openIpoTotals.pendingReturn)}
                  tone={openIpoTotals.pendingReturn > 0 ? 'ipo-gmp--down' : undefined}
                />
                <Fact label="Applications" value={openIpoTotals.applicationCount} />
              </>
            ) : (
              <>
                <Fact label="Distributed" value={formatCurrency(ipoTotals?.totalDistributed)} />
                <Fact
                  label="Gross P&L"
                  value={formatCurrency(ipoTotals?.totalProfitLoss)}
                  tone={pnlClassName(ipoTotals?.totalProfitLoss) === 'amount-positive' ? 'ipo-gmp--up' : pnlClassName(ipoTotals?.totalProfitLoss) === 'amount-negative' ? 'ipo-gmp--down' : undefined}
                />
                <Fact
                  label="Pending returns"
                  value={formatCurrency(ipoTotals?.pendingReturn)}
                  tone={Number(ipoTotals?.pendingReturn) > 0 ? 'ipo-gmp--down' : undefined}
                />
                <Fact label="Manager share" value={formatCurrency(ipoTotals?.shareManagerTotal)} />
              </>
            )}
          </div>
        )}

        {tab === 'MEMBERS' && (
          <div className="dash-inline-stats sum-totals">
            <Fact label="Given" value={formatCurrency(data.totals.totalGiven)} />
            <Fact label="Received" value={formatCurrency(data.totals.totalReceived)} />
            <Fact
              label="IPO profit"
              value={formatCurrency(data.totals.totalIpoProfit)}
              tone={pnlClassName(data.totals.totalIpoProfit) === 'amount-positive' ? 'ipo-gmp--up' : pnlClassName(data.totals.totalIpoProfit) === 'amount-negative' ? 'ipo-gmp--down' : undefined}
            />
            <Fact
              label="Pending from team"
              value={formatCurrency(data.totals.willReceiveFromTeam)}
              tone={Number(data.totals.willReceiveFromTeam) > 0 ? 'ipo-gmp--down' : undefined}
            />
          </div>
        )}

        {tab !== 'MEMBERS' && (filteredIpos.length === 0 ? (
          <p className="mem-empty">
            {tab === 'OPEN' ? 'No open IPOs with distributions.' : 'No IPO summary rows yet.'}
          </p>
        ) : (
          <div className="ipo-grid">
            {filteredIpos.map((row) => (
              <IpoCard key={row.ipoId} row={row} rich={tab === 'IPOS'} />
            ))}
          </div>
        ))}

        {tab === 'MEMBERS' && (filteredMembers.length === 0 ? (
          <p className="mem-empty">No members match.</p>
        ) : (
          <ul className="sum-members">
            {filteredMembers.map((row) => (
              <li key={row.memberId} className={row.mismatch ? 'sum-member is-mismatch' : 'sum-member'}>
                <div className="sum-member-top">
                  <div>
                    <strong>{row.displayName}</strong>
                    <p className="mem-person-meta">
                      <span>{formatPan(row.pan) || 'No PAN'}</span>
                      <span>{row.status === 'ACTIVE' ? 'Active' : 'Inactive'}</span>
                      {row.memberGroupName ? <span>{row.memberGroupName}</span> : null}
                    </p>
                  </div>
                  <b className={pnlClassName(row.totalIpoProfit) === 'amount-positive' ? 'ipo-gmp--up' : pnlClassName(row.totalIpoProfit) === 'amount-negative' ? 'ipo-gmp--down' : ''}>
                    {formatCurrency(row.totalIpoProfit)}
                  </b>
                </div>
                <div className="ipo-facts">
                  <Fact label="Given" value={formatCurrency(row.totalGiven)} />
                  <Fact label="Received" value={formatCurrency(row.totalReceived)} />
                  <Fact
                    label="Pending"
                    value={formatCurrency(row.willReceiveFromTeam)}
                    tone={Number(row.willReceiveFromTeam) !== 0 ? 'ipo-gmp--down' : undefined}
                  />
                  <Fact label="Applied / allotted" value={`${row.iposApplied} / ${row.iposAlloted}`} />
                  {Number(row.bonus) > 0 && <Fact label="Bonus" value={formatCurrency(row.bonus)} />}
                </div>
                {row.mismatch && <p className="sum-mismatch-note">Figures do not reconcile — check this member.</p>}
              </li>
            ))}
          </ul>
        ))}
      </section>
    </div>
  );
}
