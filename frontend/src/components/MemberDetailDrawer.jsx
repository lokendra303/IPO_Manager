import { useEffect, useState } from 'react';
import {
  Drawer, Spin, Table, Tag, Tabs, Empty, Alert, Button, Space, message, Tooltip,
} from 'antd';
import {
  CopyOutlined,
  CrownOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import client from '../api/client';
import { formatCurrency, formatPan, pnlClassName } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import NoteCell from './NoteCell';
import { copyToClipboard } from '../utils/allotmentCheck';
import { categoryTagColor, getLotAmountForCategory } from '../utils/ipoCategories';
import { isThirdPartyMandate } from '../utils/fundingMode';

const AVATAR_TONES = ['teal', 'slate', 'blue', 'amber', 'rose', 'violet'];

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

function CopyableValue({ value, label, children, mono }) {
  if (!value) return <span className="mdp-muted">Not added</span>;
  const onCopy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyToClipboard(String(value));
    message[ok ? 'success' : 'error'](ok ? `${label} copied` : 'Could not copy');
  };
  return (
    <Space size={4} align="center">
      {children ?? <span className={mono ? 'mdp-mono' : undefined}>{value}</span>}
      <Button
        type="text"
        size="small"
        icon={<CopyOutlined />}
        onClick={onCopy}
        aria-label={`Copy ${label}`}
        className="mdp-copy"
      />
    </Space>
  );
}

function Money({ value }) {
  const n = Number(value ?? 0);
  return <span className={pnlClassName(n)}>{formatCurrency(n)}</span>;
}

function InfoTile({ label, children }) {
  return (
    <div className="mdp-info-tile">
      <span className="mdp-info-label">{label}</span>
      <div className="mdp-info-value">{children}</div>
    </div>
  );
}

function SplitBar({ label, provider, memberPct, manager }) {
  const segs = [
    { key: 'provider', pct: Number(provider) || 0, title: `Provider ${provider}%` },
    { key: 'member', pct: Number(memberPct) || 0, title: `Member ${memberPct}%` },
    { key: 'manager', pct: Number(manager) || 0, title: `Manager ${manager}%` },
  ];
  return (
    <div className="mdp-split">
      <div className="mdp-split-head">
        <span>{label}</span>
        <span className="mdp-split-legend">
          <i className="mdp-dot mdp-dot--provider" /> Provider {provider}%
          <i className="mdp-dot mdp-dot--member" /> Member {memberPct}%
          <i className="mdp-dot mdp-dot--manager" /> Manager {manager}%
        </span>
      </div>
      <div className="mdp-split-track" role="img" aria-label={segs.map((s) => s.title).join(', ')}>
        {segs.map((s) => (
          s.pct > 0 ? (
            <span
              key={s.key}
              className={`mdp-split-seg mdp-split-seg--${s.key}`}
              style={{ flexGrow: s.pct, flexBasis: 0 }}
            >
              {s.pct >= 14 ? `${s.pct}%` : ''}
            </span>
          ) : null
        ))}
      </div>
    </div>
  );
}

const allotmentColors = {
  ALLOTED: 'green',
  NOT_ALLOTED: 'red',
  NOT_APPLIED: 'orange',
  PENDING: 'default',
};

const allotmentLabels = {
  ALLOTED: 'Alloted',
  NOT_ALLOTED: 'Not Alloted',
  NOT_APPLIED: 'Did not apply',
  PENDING: 'Pending',
};

export default function MemberDetailDrawer({ memberId, open, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !memberId) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    client
      .get(`/members/${memberId}/detail`)
      .then((r) => setData(r.data))
      .catch((err) => setError(getErrorMessage(err, 'Failed to load member details')))
      .finally(() => setLoading(false));
  }, [open, memberId]);

  const m = data?.member;
  const s = data?.stats;
  const group = data?.group;
  const isLeader = Boolean(data?.isGroupLeader || group?.isLeader);
  const groupStats = group?.groupStats || {};

  const ipoColumns = [
    { title: 'IPO', dataIndex: 'ipo_name', render: (v, r) => (
      <Link to={`/ipos/${r.ipo_id}`} onClick={onClose}>{v}</Link>
    )},
    {
      title: 'Lot',
      render: (_, r) => formatCurrency(
        getLotAmountForCategory(
          { lot_amount_rii: r.lot_amount_rii, lot_amount_hni: r.lot_amount_hni, lot_amount: r.lot_amount },
          r.investor_category
        )
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      render: (v, r) => {
        const remaining = Number(
          r.remaining_principal ?? Math.max(0, Number(v || 0) - Number(r.adjusted_out_amount || 0))
        );
        if (Number(r.adjusted_out_amount || 0) > 0.001) {
          return (
            <span>
              {formatCurrency(remaining)}
              <span className="mdp-subline">of {formatCurrency(v)} adjusted</span>
            </span>
          );
        }
        return formatCurrency(v);
      },
    },
    {
      title: 'Category',
      dataIndex: 'investor_category',
      width: 72,
      render: (v) => (v ? <Tag color={categoryTagColor(v)}>{v}</Tag> : '—'),
    },
    { title: 'Received', dataIndex: 'trns_received', render: (v) => v ? <Tag color="green">{v}</Tag> : '—' },
    { title: 'Given', dataIndex: 'trns_given', render: (v, r) => (
      isThirdPartyMandate(r)
        ? <Tag color="magenta">3rd party mandate</Tag>
        : v ? <Tag color="blue">{v}</Tag> : '—'
    ) },
    {
      title: 'Allotment',
      dataIndex: 'allotment_status',
      render: (v) => <Tag color={allotmentColors[v]}>{allotmentLabels[v] || v}</Tag>,
    },
    {
      title: 'Gross P&L',
      dataIndex: 'profit_loss',
      render: (v, r) => (r.allotment_status !== 'ALLOTED' ? '—' : <Money value={v} />),
    },
    {
      title: 'Member share',
      dataIndex: 'member_share',
      render: (v, r) => {
        if (r.allotment_status !== 'ALLOTED' || r.profit_loss == null) return '—';
        if (v == null) return <Tag color="warning">No rules</Tag>;
        return (
          <Space size={4}>
            <Money value={v} />
            {r.share_status === 'pending' && <Tag color="orange">Pending split</Tag>}
          </Space>
        );
      },
    },
    {
      title: 'Manager share',
      dataIndex: 'manager_share',
      render: (v, r) => (r.allotment_status !== 'ALLOTED' || r.profit_loss == null || v == null ? '—' : <Money value={v} />),
    },
    {
      title: 'Provider share',
      dataIndex: 'provider_share',
      render: (v, r) => (r.allotment_status !== 'ALLOTED' || r.profit_loss == null || v == null ? '—' : <Money value={v} />),
    },
    { title: 'Remarks', dataIndex: 'remarks', ellipsis: true },
    { title: 'Date', dataIndex: 'created_at', render: (v) => dayjs(v).format('DD MMM YYYY') },
  ];

  const ledgerColumns = [
    { title: 'Date', dataIndex: 'txn_date', render: (v) => dayjs(v).format('DD MMM YYYY HH:mm') },
    {
      title: 'Type',
      dataIndex: 'type',
      render: (t) => <Tag color={t === 'GIVEN' ? 'orange' : t === 'RECEIVED' ? 'green' : 'purple'}>{t}</Tag>,
    },
    { title: 'Amount', dataIndex: 'amount', render: formatCurrency },
    { title: 'IPO', dataIndex: 'ipo_name', render: (v) => v || '—' },
    { title: 'Notes', dataIndex: 'notes', render: (v) => <NoteCell value={v} /> },
  ];

  const groupMemberColumns = [
    {
      title: 'Member',
      dataIndex: 'displayName',
      render: (v, row) => (
        <div className="mdp-person-cell">
          <span className={`mem-avatar mem-avatar--${avatarTone(row.id)}`}>{initials(v)}</span>
          <div>
            <strong>
              {v}
              {row.isLeader ? <em>Leader</em> : null}
            </strong>
            <span>{row.pan || '—'}</span>
          </div>
        </div>
      ),
    },
    {
      title: 'Contact',
      render: (_, row) => (
        <div className="mdp-contact-cell">
          <span>{row.email || 'No email'}</span>
          <span className="mdp-mono">{row.upi || 'No UPI'}</span>
        </div>
      ),
    },
    { title: 'Relation', dataIndex: 'relationshipNote', render: (v) => v || '—' },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (v) => (
        <span className={`mem-status ${v === 'ACTIVE' ? 'is-on' : 'is-off'}`}>
          {v === 'ACTIVE' ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      title: 'Pending',
      dataIndex: 'pendingReturn',
      render: (v) => <span className={Number(v) > 0 ? 'amount-negative' : undefined}>{formatCurrency(v ?? 0)}</span>,
    },
    { title: 'Profit', dataIndex: 'totalMemberShare', render: (v) => <Money value={v} /> },
    {
      title: 'IPOs',
      render: (_, row) => `${row.iposApplied ?? 0} · ${row.iposAlloted ?? 0} alloted`,
    },
  ];

  const bulkColumns = [
    {
      title: 'IPO',
      dataIndex: 'ipoName',
      render: (v, r) => (r.ipoId ? <Link to={`/ipos/${r.ipoId}`} onClick={onClose}>{v}</Link> : v),
    },
    { title: 'Paid', dataIndex: 'paidAt', render: (v) => (v ? dayjs(v).format('DD MMM YYYY') : '—') },
    {
      title: 'Category',
      dataIndex: 'investorCategory',
      render: (v) => (v ? <Tag color={categoryTagColor(v)}>{v}</Tag> : '—'),
    },
    { title: 'Members', dataIndex: 'memberCount', render: (v) => v ?? '—' },
    { title: 'Amount sent', dataIndex: 'totalAmount', render: (v) => <strong>{formatCurrency(v)}</strong> },
  ];

  const groupIpoColumns = [
    { title: 'IPO', dataIndex: 'ipoName' },
    { title: 'Member', dataIndex: 'memberName' },
    { title: 'Amount', dataIndex: 'amount', render: formatCurrency },
    {
      title: 'Allotment',
      dataIndex: 'allotmentStatus',
      render: (v) => <Tag color={allotmentColors[v]}>{allotmentLabels[v] || v}</Tag>,
    },
    {
      title: 'Member share',
      dataIndex: 'memberShare',
      render: (v, r) => (r.allotmentStatus === 'ALLOTED' ? <Money value={v ?? 0} /> : '—'),
    },
  ];

  const tabItems = data ? [
    {
      key: 'ipos',
      label: `Personal IPOs (${data.ipoApplications.length})`,
      children: data.ipoApplications.length ? (
        <Table
          rowKey="id"
          columns={ipoColumns}
          dataSource={data.ipoApplications}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1200 }}
          className="pro-table"
          size="middle"
        />
      ) : (
        <Empty description="No IPO applications yet" />
      ),
    },
    {
      key: 'ledger',
      label: `Fund ledger (${data.ledgerEntries.length})`,
      children: data.ledgerEntries.length ? (
        <Table
          rowKey="id"
          columns={ledgerColumns}
          dataSource={data.ledgerEntries}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 'max-content' }}
          className="pro-table"
          size="middle"
        />
      ) : (
        <Empty description="No transactions yet" />
      ),
    },
  ] : [];

  if (data && isLeader) {
    tabItems.push({
      key: 'group-ipos',
      label: `Group IPOs (${group?.groupApplications?.length ?? 0})`,
      children: group?.groupApplications?.length ? (
        <Table
          rowKey="id"
          columns={groupIpoColumns}
          dataSource={group.groupApplications}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 'max-content' }}
          className="pro-table"
          size="middle"
        />
      ) : (
        <Empty description="No group IPO applications yet" />
      ),
    });
  }

  return (
    <Drawer
      title={m ? m.display_name : 'Member profile'}
      open={open}
      onClose={onClose}
      width={1120}
      className="member-drawer"
      destroyOnClose
      styles={{ body: { padding: 0, background: '#f1f5f9' } }}
    >
      {loading ? (
        <Spin style={{ display: 'block', margin: '64px auto' }} />
      ) : error ? (
        <Alert type="error" message={error} showIcon style={{ margin: 24 }} />
      ) : data ? (
        <div className="mdp">
          <header className={`mdp-hero${isLeader ? ' mdp-hero--leader' : ''}`}>
            <span className={`mdp-avatar mem-avatar--${avatarTone(m.id)}`}>
              {initials(m.display_name)}
            </span>
            <div className="mdp-hero-main">
              <p className="mdp-kicker">
                {isLeader ? 'Group leader profile' : 'Member profile'}
              </p>
              <h2>
                {m.display_name}
                <span className={`mem-status ${m.status === 'ACTIVE' ? 'is-on' : 'is-off'}`}>
                  {m.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                </span>
                {isLeader ? (
                  <span className="mdp-leader-pill">
                    <CrownOutlined /> Leader
                  </span>
                ) : null}
              </h2>
              <p className="mdp-hero-meta">
                {m.relationship_note || 'No relationship noted'}
                {m.member_group_name ? ` · ${m.member_group_name}` : ' · No sub-group'}
                {m.created_at ? ` · Since ${dayjs(m.created_at).format('MMM YYYY')}` : ''}
              </p>
            </div>
          </header>

          {m.status === 'INACTIVE' && (
            <Alert
              type="warning"
              showIcon
              message="This member is inactive"
              description="They are excluded from IPO distribute and cannot log in with PAN. Activate them from the Members page to restore access."
            />
          )}

          {group && !isLeader && (
            <div className="mdp-group-banner">
              <TeamOutlined />
              <div>
                <strong>Belongs to {group.name}</strong>
                <span>
                  Leader {group.leaderDisplayName || 'not set'}
                  {group.leaderPan ? ` · ${group.leaderPan}` : ''}
                  {group.memberCount ? ` · ${group.memberCount} members` : ''}
                </span>
              </div>
            </div>
          )}

          <section className="mdp-card">
            <div className="mdp-card-head">
              <h3>Personal details</h3>
            </div>
            <div className="mdp-info-grid">
              <InfoTile label="PAN">
                <CopyableValue value={formatPan(m.pan)} label="PAN" mono />
              </InfoTile>
              <InfoTile label="Email">
                <CopyableValue value={m.email} label="Email">
                  <a href={`mailto:${m.email}`}>{m.email}</a>
                </CopyableValue>
              </InfoTile>
              <InfoTile label="UPI ID">
                <CopyableValue value={m.upi} label="UPI ID" mono />
              </InfoTile>
              <InfoTile label="Relationship">{m.relationship_note || <span className="mdp-muted">Not added</span>}</InfoTile>
              <InfoTile label="Sub-group">{m.member_group_name || <span className="mdp-muted">Ungrouped</span>}</InfoTile>
              <InfoTile label="Fund source">{m.fund_provider_name || <span className="mdp-muted">—</span>}</InfoTile>
            </div>

            <div className="mdp-rules">
              <div className="mdp-card-head mdp-card-head--nested">
                <h4>P&amp;L share rules</h4>
                {!data.profitShare?.configured ? (
                  <Link to="/profit-sharing" onClick={onClose}>Set rules</Link>
                ) : null}
              </div>
              {data.profitShare?.configured ? (
                <>
                  {(data.profitShare.rules || []).map((rule) => (
                    <div key={rule.id} className="mdp-rule">
                      <div className="mdp-rule-tags">
                        <Tag color="blue">{rule.ruleName}</Tag>
                        <Tag color={rule.ipoId ? 'purple' : 'default'}>
                          {rule.ipoId ? (rule.ipoName || 'IPO') : 'All IPOs'}
                        </Tag>
                        <span className="mdp-rule-provider">{rule.providerName}</span>
                      </div>
                      <SplitBar
                        label="Profit"
                        provider={rule.profitProviderPercent}
                        memberPct={rule.profitMemberPercent}
                        manager={rule.profitManagerPercent}
                      />
                      <SplitBar
                        label="Loss"
                        provider={rule.lossProviderPercent}
                        memberPct={rule.lossMemberPercent}
                        manager={rule.lossManagerPercent}
                      />
                    </div>
                  ))}
                  {data.profitShare.ruleCount > 1 ? (
                    <div className="mdp-rule">
                      <div className="mdp-rule-tags">
                        <Tag>Combined</Tag>
                      </div>
                      <SplitBar
                        label="Profit"
                        provider={data.profitShare.profitProviderPercent}
                        memberPct={data.profitShare.profitMemberPercent}
                        manager={data.profitShare.profitManagerPercent}
                      />
                      <SplitBar
                        label="Loss"
                        provider={data.profitShare.lossProviderPercent}
                        memberPct={data.profitShare.lossMemberPercent}
                        manager={data.profitShare.lossManagerPercent}
                      />
                    </div>
                  ) : null}
                </>
              ) : (
                <Tag color="warning">Not configured — set under Profit Sharing</Tag>
              )}
            </div>
          </section>

          <div className="mdp-money">
            <div className={`mdp-money-cell mdp-money-cell--main${s.willReceiveFromTeam ? ' is-due' : ''}`}>
              <span>
                <Tooltip title="Principal still with the member and not yet marked received. Includes applications awaiting allotment, and subtracts funds already adjusted to another IPO.">
                  Pending return
                </Tooltip>
              </span>
              <strong>{formatCurrency(s.willReceiveFromTeam)}</strong>
              <em>Still with this member</em>
            </div>
            <div className="mdp-money-cell">
              <span>Total given</span>
              <strong>{formatCurrency(s.totalGiven)}</strong>
              <em>Sent to this member</em>
            </div>
            <div className="mdp-money-cell mdp-money-cell--up">
              <span>Total received</span>
              <strong>{formatCurrency(s.totalReceived)}</strong>
              <em>Returned from this member</em>
            </div>
          </div>

          <div className="mdp-kpi-grid">
            <article className="mdp-kpi">
              <span>Applied</span>
              <strong>{s.iposApplied}</strong>
            </article>
            <article className="mdp-kpi mdp-kpi--up">
              <span>Alloted</span>
              <strong>{s.iposAlloted}</strong>
            </article>
            <article className="mdp-kpi mdp-kpi--down">
              <span>Not alloted</span>
              <strong>{s.iposNotAlloted}</strong>
            </article>
            <article className="mdp-kpi mdp-kpi--info">
              <span>Pending IPOs</span>
              <strong>{s.iposPending}</strong>
            </article>
          </div>

          <div className="mdp-kpi-grid mdp-kpi-grid--pnl">
            <article className="mdp-kpi">
              <span>Gross IPO P&amp;L</span>
              <strong className={pnlClassName(s.totalIpoProfit)}>{formatCurrency(s.totalIpoProfit)}</strong>
            </article>
            <article className="mdp-kpi">
              <span>Member share</span>
              <strong className={pnlClassName(s.totalMemberShare ?? 0)}>{formatCurrency(s.totalMemberShare ?? 0)}</strong>
            </article>
            <article className="mdp-kpi">
              <span>Provider share</span>
              <strong>{formatCurrency(s.totalProviderShare ?? 0)}</strong>
            </article>
            <article className="mdp-kpi">
              <span>Manager share</span>
              <strong>{formatCurrency(s.totalManagerShare ?? 0)}</strong>
            </article>
          </div>

          {isLeader && group && (
            <section className="mdp-card mdp-group">
              <div className="mdp-card-head">
                <div>
                  <p className="mdp-kicker">Sub-group</p>
                  <h3>
                    <CrownOutlined /> {group.name}
                  </h3>
                  <p className="mdp-hero-meta">
                    {group.memberCount} members · You are the group leader
                  </p>
                </div>
                <Space wrap>
                  <Link to="/member-groups" onClick={onClose}>Manage group</Link>
                  <Link to="/group-leader-wallets" onClick={onClose}>Leader wallet</Link>
                </Space>
              </div>

              <div className="mdp-money mdp-money--group">
                <div className="mdp-money-cell mdp-money-cell--main">
                  <span>Fund distributed</span>
                  <strong>{formatCurrency(groupStats.fundDistributed ?? 0)}</strong>
                  <em>Bulk IPO pays sent to this leader</em>
                </div>
                <div className={`mdp-money-cell${groupStats.pendingReturn ? ' mdp-money-cell--down' : ''}`}>
                  <span>Group pending</span>
                  <strong>{formatCurrency(groupStats.pendingReturn ?? 0)}</strong>
                  <em>Still with group members</em>
                </div>
                <div className="mdp-money-cell mdp-money-cell--up">
                  <span>Group member profit</span>
                  <strong>{formatCurrency(groupStats.totalMemberShare ?? 0)}</strong>
                  <em>Across all members in {group.name}</em>
                </div>
              </div>

              <div className="mdp-kpi-grid">
                <article className="mdp-kpi">
                  <span>Cash sent</span>
                  <strong>{formatCurrency(groupStats.cashSent ?? 0)}</strong>
                </article>
                <article className="mdp-kpi mdp-kpi--up">
                  <span>Cash received</span>
                  <strong>{formatCurrency(groupStats.cashReceived ?? 0)}</strong>
                </article>
                <article className="mdp-kpi">
                  <span>Group IPOs</span>
                  <strong>{groupStats.iposApplied ?? 0}</strong>
                </article>
                <article className="mdp-kpi mdp-kpi--up">
                  <span>Group alloted</span>
                  <strong>{groupStats.iposAlloted ?? 0}</strong>
                </article>
              </div>

              <div className="mdp-card-head mdp-card-head--nested">
                <h4>Group members</h4>
              </div>
              {group.members?.length ? (
                <Table
                  rowKey="id"
                  columns={groupMemberColumns}
                  dataSource={group.members}
                  pagination={false}
                  size="middle"
                  className="pro-table"
                  scroll={{ x: 860 }}
                />
              ) : (
                <Empty description="No members in this group" />
              )}

              <div className="mdp-card-head mdp-card-head--nested">
                <h4>Fund distribution history</h4>
              </div>
              <p className="mdp-hint">
                One bulk transfer per IPO paid to this leader. Each member’s own share still appears on their personal ledger.
              </p>
              {group.bulkPayments?.length ? (
                <Table
                  rowKey="id"
                  columns={bulkColumns}
                  dataSource={group.bulkPayments}
                  pagination={false}
                  size="middle"
                  className="pro-table"
                />
              ) : (
                <Empty description="No bulk payments yet — use Bulk to owner on an IPO." />
              )}
            </section>
          )}

          <section className="mdp-card mdp-tabs">
            <Tabs items={tabItems} />
          </section>
        </div>
      ) : null}
    </Drawer>
  );
}
