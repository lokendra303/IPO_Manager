import { AppError } from '../middleware/errorHandler.js';
import { formatPan } from '../utils/validate.js';

const ISSUE_CATEGORIES = new Set(['PAYMENT', 'PROFIT', 'ALLOTMENT', 'FUND_RETURN', 'OTHER']);

function parseAmount(value, label = 'amount') {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new AppError(`Invalid ${label}`, 400);
  return Math.round(n * 100) / 100;
}

function parseTxnDate(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) throw new AppError('Invalid payment date', 400);
  return d;
}

export async function getMemberUpcomingIpos(pool, tenantId, memberId) {
  const [rows] = await pool.query(
    `SELECT i.id, i.name, i.status, i.open_date, i.ipo_segment,
            i.lot_amount_rii, i.lot_amount_hni, i.lot_amount,
            a.id AS application_id, a.allotment_status, a.amount AS applied_amount,
            a.investor_category
     FROM ipos i
     LEFT JOIN ipo_applications a ON a.ipo_id = i.id AND a.member_id = ? AND a.tenant_id = i.tenant_id
     WHERE i.tenant_id = ?
       AND (COALESCE(i.is_invalid, 0) = 0 OR a.id IS NOT NULL)
     ORDER BY i.status = 'OPEN' DESC, i.open_date DESC, i.name ASC`,
    [memberId, tenantId]
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    openDate: row.open_date,
    ipoSegment: row.ipo_segment,
    lotAmountRii: Number(row.lot_amount_rii),
    lotAmountHni: row.lot_amount_hni != null ? Number(row.lot_amount_hni) : null,
    lotAmount: row.lot_amount != null ? Number(row.lot_amount) : null,
    applied: !!row.application_id,
    applicationId: row.application_id ?? null,
    allotmentStatus: row.allotment_status ?? null,
    appliedAmount: row.applied_amount != null ? Number(row.applied_amount) : null,
    investorCategory: row.investor_category ?? null,
  }));
}

export async function getMemberActivityFeed(pool, tenantId, memberId, { limit = 40 } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 40, 1), 100);
  const items = [];

  const [ledger] = await pool.query(
    `SELECT l.id, l.type, l.amount, l.txn_date, l.notes, i.name AS ipo_name
     FROM member_ledger_entries l
     LEFT JOIN ipo_applications a ON a.id = l.ipo_application_id
     LEFT JOIN ipos i ON i.id = a.ipo_id
     WHERE l.member_id = ? AND l.tenant_id = ?
     ORDER BY l.txn_date DESC, l.id DESC
     LIMIT ?`,
    [memberId, tenantId, cap]
  );

  for (const row of ledger) {
    const at = row.txn_date;
    if (row.type === 'GIVEN') {
      items.push({
        id: `ledger-given-${row.id}`,
        type: 'FUND_RECEIVED',
        at,
        title: row.ipo_name ? `Fund received for ${row.ipo_name}` : 'Fund received from manager',
        detail: row.notes || null,
        amount: Number(row.amount),
        ipoName: row.ipo_name ?? null,
      });
    } else if (row.type === 'RECEIVED') {
      items.push({
        id: `ledger-received-${row.id}`,
        type: 'FUND_RETURNED',
        at,
        title: row.ipo_name ? `Returned fund for ${row.ipo_name}` : 'Returned fund to manager',
        detail: row.notes || null,
        amount: Number(row.amount),
        ipoName: row.ipo_name ?? null,
      });
    } else if (row.type === 'BONUS') {
      items.push({
        id: `ledger-bonus-${row.id}`,
        type: 'BONUS',
        at,
        title: 'Bonus received',
        detail: row.notes || null,
        amount: Number(row.amount),
        ipoName: row.ipo_name ?? null,
      });
    }
  }

  const [apps] = await pool.query(
    `SELECT a.id, a.amount, a.allotment_status, a.profit_loss, a.trns_received,
            COALESCE(a.updated_at, a.created_at) AS event_at,
            i.id AS ipo_id, i.name AS ipo_name,
            psd.member_amount, psd.distributed_at
     FROM ipo_applications a
     JOIN ipos i ON i.id = a.ipo_id
     LEFT JOIN profit_share_distributions psd ON psd.ipo_application_id = a.id
     WHERE a.member_id = ? AND a.tenant_id = ?
     ORDER BY event_at DESC, a.id DESC
     LIMIT ?`,
    [memberId, tenantId, cap]
  );

  for (const row of apps) {
    if (row.allotment_status === 'ALLOTED') {
      items.push({
        id: `app-alloted-${row.id}`,
        type: 'ALLOTED',
        at: row.event_at,
        title: `Allotted — ${row.ipo_name}`,
        detail: row.profit_loss != null ? `Gross P&L ${Number(row.profit_loss)}` : null,
        amount: row.profit_loss != null ? Number(row.profit_loss) : Number(row.amount),
        ipoName: row.ipo_name,
        ipoId: row.ipo_id,
      });
    } else if (row.allotment_status === 'NOT_ALLOTED') {
      items.push({
        id: `app-not-alloted-${row.id}`,
        type: 'NOT_ALLOTED',
        at: row.event_at,
        title: `Not allotted — ${row.ipo_name}`,
        detail: null,
        amount: Number(row.amount),
        ipoName: row.ipo_name,
        ipoId: row.ipo_id,
      });
    } else if (row.allotment_status === 'PENDING') {
      items.push({
        id: `app-pending-${row.id}`,
        type: 'IPO_APPLIED',
        at: row.event_at,
        title: `Applied for ${row.ipo_name}`,
        detail: row.trns_received === 'Received' ? 'Fund returned to manager' : 'Fund return pending',
        amount: Number(row.amount),
        ipoName: row.ipo_name,
        ipoId: row.ipo_id,
      });
    }

    if (row.member_amount != null && row.distributed_at) {
      items.push({
        id: `profit-${row.id}`,
        type: 'PROFIT_SHARED',
        at: row.distributed_at,
        title: `Profit shared — ${row.ipo_name}`,
        detail: 'Your member share was distributed',
        amount: Number(row.member_amount),
        ipoName: row.ipo_name,
      });
    }
  }

  const [memberRow] = await pool.query(
    'SELECT member_group_id FROM members WHERE id = ? AND tenant_id = ?',
    [memberId, tenantId]
  );
  const groupId = memberRow[0]?.member_group_id;
  if (groupId) {
    const [group] = await pool.query(
      'SELECT owner_member_id FROM member_groups WHERE id = ? AND tenant_id = ?',
      [groupId, tenantId]
    );
    if (Number(group[0]?.owner_member_id) === Number(memberId)) {
      const [groupApps] = await pool.query(
        `SELECT a.id, a.amount, a.allotment_status, a.profit_loss,
                COALESCE(a.updated_at, a.created_at) AS event_at,
                m.display_name AS member_name, i.name AS ipo_name, i.id AS ipo_id
         FROM ipo_applications a
         JOIN members m ON m.id = a.member_id
         JOIN ipos i ON i.id = a.ipo_id
         WHERE a.tenant_id = ? AND m.member_group_id = ? AND m.id != ?
           AND a.allotment_status IN ('ALLOTED', 'NOT_ALLOTED')
         ORDER BY event_at DESC
         LIMIT ?`,
        [tenantId, groupId, memberId, cap]
      );
      for (const row of groupApps) {
        items.push({
          id: `group-${row.allotment_status}-${row.id}`,
          type: row.allotment_status === 'ALLOTED' ? 'GROUP_ALLOTED' : 'GROUP_NOT_ALLOTED',
          at: row.event_at,
          title:
            row.allotment_status === 'ALLOTED'
              ? `${row.member_name} allotted — ${row.ipo_name}`
              : `${row.member_name} not allotted — ${row.ipo_name}`,
          detail:
            row.allotment_status === 'ALLOTED' && row.profit_loss != null
              ? `Gross P&L ${Number(row.profit_loss)}`
              : null,
          amount:
            row.allotment_status === 'ALLOTED' && row.profit_loss != null
              ? Number(row.profit_loss)
              : Number(row.amount),
          ipoName: row.ipo_name,
          ipoId: row.ipo_id,
          memberName: row.member_name,
        });
      }
    }
  }

  const [issues] = await pool.query(
    `SELECT id, status, note, resolution_note, created_at, resolved_at
     FROM member_issues
     WHERE tenant_id = ? AND member_id = ?
     ORDER BY COALESCE(resolved_at, created_at) DESC
     LIMIT ?`,
    [tenantId, memberId, 20]
  );
  for (const row of issues) {
    items.push({
      id: `issue-open-${row.id}`,
      type: 'ISSUE_SUBMITTED',
      at: row.created_at,
      title: 'Issue submitted to manager',
      detail: row.note?.slice(0, 120) || null,
      amount: null,
    });
    if (row.status === 'RESOLVED' && row.resolved_at) {
      items.push({
        id: `issue-resolved-${row.id}`,
        type: 'ISSUE_RESOLVED',
        at: row.resolved_at,
        title: 'Manager resolved your issue',
        detail: row.resolution_note || 'No reply note',
        amount: null,
      });
    }
  }

  const [claims] = await pool.query(
    `SELECT id, amount, txn_date, status, notes, created_at, resolved_at, manager_note
     FROM member_fund_return_claims
     WHERE tenant_id = ? AND member_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [tenantId, memberId, 20]
  );
  for (const row of claims) {
    items.push({
      id: `claim-${row.id}`,
      type: 'FUND_RETURN_CLAIMED',
      at: row.created_at,
      title: `You reported a fund return of ${Number(row.amount)}`,
      detail: row.notes || row.payment_ref || null,
      amount: Number(row.amount),
      status: row.status,
    });
    if (row.status !== 'PENDING' && row.resolved_at) {
      items.push({
        id: `claim-resolved-${row.id}`,
        type: row.status === 'ACKNOWLEDGED' ? 'FUND_RETURN_ACK' : 'FUND_RETURN_REJECTED',
        at: row.resolved_at,
        title:
          row.status === 'ACKNOWLEDGED'
            ? 'Manager acknowledged your fund return'
            : 'Manager rejected your fund return claim',
        detail: row.manager_note || null,
        amount: Number(row.amount),
      });
    }
  }

  return items
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, cap);
}

export function buildMemberAttentionItems({ dashboard, upcomingIpos = [], issues = [], claims = [] }) {
  const items = [];
  const stats = dashboard?.stats ?? {};
  const pendingReturn = Number(stats.pendingReturn ?? 0);

  if (pendingReturn > 0) {
    items.push({
      id: 'pending-return',
      priority: 'high',
      type: 'PENDING_RETURN',
      title: `${pendingReturn} pending return to manager`,
      detail: 'Fund received minus what you have returned so far.',
      action: 'fund-return',
    });
  }

  const pendingAllotmentPersonal = (dashboard?.ipoApplications ?? []).filter(
    (a) => a.allotmentStatus === 'PENDING'
  );
  const pendingAllotmentGroup = (dashboard?.subGroup?.groupApplications ?? []).filter(
    (a) => a.allotmentStatus === 'PENDING'
  );
  const pendingIpoNames = [
    ...new Set([
      ...pendingAllotmentPersonal.map((a) => a.ipoName),
      ...pendingAllotmentGroup.map((a) => a.ipoName),
    ]),
  ];
  if (pendingIpoNames.length) {
    items.push({
      id: 'pending-allotment',
      priority: 'medium',
      type: 'PENDING_ALLOTMENT',
      title: `Check allotment for ${pendingIpoNames.slice(0, 2).join(', ')}${pendingIpoNames.length > 2 ? '…' : ''}`,
      detail: 'Use official BSE/NSE portals with each member PAN.',
      action: 'allotment',
      ipoNames: pendingIpoNames,
    });
  }

  const openIpos = upcomingIpos.filter((i) => i.status === 'OPEN' && !i.applied);
  if (openIpos.length) {
    items.push({
      id: 'open-ipos',
      priority: 'low',
      type: 'OPEN_IPO',
      title: `${openIpos.length} open IPO${openIpos.length === 1 ? '' : 's'} not applied yet`,
      detail: openIpos.map((i) => i.name).slice(0, 3).join(', '),
      action: 'upcoming',
    });
  }

  const recentProfit = (dashboard?.ipoApplications ?? []).filter(
    (a) => a.allotmentStatus === 'ALLOTED' && a.memberShare != null && a.memberShare > 0
  );
  if (recentProfit.length) {
    const latest = recentProfit[0];
    items.push({
      id: `profit-${latest.id}`,
      priority: 'low',
      type: 'PROFIT_RECEIVED',
      title: `Profit share for ${latest.ipoName}`,
      detail: `Your share: ${latest.memberShare}`,
      action: 'ipo',
      ipoName: latest.ipoName,
    });
  }

  const openIssues = issues.filter((i) => i.status === 'OPEN');
  if (openIssues.length) {
    items.push({
      id: 'open-issues',
      priority: 'medium',
      type: 'OPEN_ISSUE',
      title: `${openIssues.length} open issue${openIssues.length === 1 ? '' : 's'} with manager`,
      detail: 'Waiting for manager response.',
      action: 'issues',
    });
  }

  const pendingClaims = claims.filter((c) => c.status === 'PENDING');
  if (pendingClaims.length) {
    items.push({
      id: 'pending-claims',
      priority: 'low',
      type: 'CLAIM_PENDING',
      title: 'Fund return claim awaiting manager',
      detail: `${pendingClaims.length} claim(s) pending review.`,
      action: 'fund-return',
    });
  }

  if (dashboard?.subGroup?.isLeader) {
    const membersOwing = (dashboard.subGroup.members ?? []).filter(
      (m) => !m.isLeader && Number(m.pendingReturn ?? 0) > 0
    );
    if (membersOwing.length) {
      const total = membersOwing.reduce((s, m) => s + Number(m.pendingReturn ?? 0), 0);
      items.push({
        id: 'group-collections',
        priority: 'high',
        type: 'GROUP_COLLECTION',
        title: `Collect ${total} from ${membersOwing.length} member(s)`,
        detail: membersOwing.map((m) => m.displayName).slice(0, 4).join(', '),
        action: 'collections',
        members: membersOwing.map((m) => ({
          id: m.id,
          displayName: m.displayName,
          pan: m.pan,
          pendingReturn: m.pendingReturn,
          upi: m.upi ?? null,
        })),
      });
    }
  }

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

export async function getMemberIpoDetail(pool, tenantId, memberId, ipoId) {
  const id = Number(ipoId);
  if (!Number.isInteger(id) || id < 1) throw new AppError('Invalid IPO', 400);

  const [ipoRows] = await pool.query(
    `SELECT id, name, status, open_date, ipo_segment, lot_amount_rii, lot_amount_hni, lot_amount
     FROM ipos WHERE id = ? AND tenant_id = ?`,
    [id, tenantId]
  );
  if (!ipoRows.length) throw new AppError('IPO not found', 404);
  const ipo = ipoRows[0];

  const [personalApp] = await pool.query(
    `SELECT a.*, psd.member_amount, psd.distributed_at
     FROM ipo_applications a
     LEFT JOIN profit_share_distributions psd ON psd.ipo_application_id = a.id
     WHERE a.ipo_id = ? AND a.member_id = ? AND a.tenant_id = ?`,
    [id, memberId, tenantId]
  );

  const [memberRow] = await pool.query(
    'SELECT member_group_id FROM members WHERE id = ? AND tenant_id = ?',
    [memberId, tenantId]
  );
  const groupId = memberRow[0]?.member_group_id;

  let isLeader = false;
  let groupApplications = [];

  if (groupId) {
    const [group] = await pool.query(
      'SELECT owner_member_id FROM member_groups WHERE id = ? AND tenant_id = ?',
      [groupId, tenantId]
    );
    isLeader = Number(group[0]?.owner_member_id) === Number(memberId);

    if (isLeader) {
      const [rows] = await pool.query(
        `SELECT a.id, a.amount, a.allotment_status, a.profit_loss, a.investor_category,
                a.trns_received, m.id AS member_id, m.display_name, m.pan, m.upi,
                m.status AS member_status,
                psd.member_amount, psd.distributed_at
         FROM ipo_applications a
         JOIN members m ON m.id = a.member_id
         LEFT JOIN profit_share_distributions psd ON psd.ipo_application_id = a.id
         WHERE a.ipo_id = ? AND a.tenant_id = ? AND m.member_group_id = ?
         ORDER BY m.display_name`,
        [id, tenantId, groupId]
      );
      groupApplications = rows.map((row) => ({
        id: row.id,
        memberId: row.member_id,
        memberName: row.display_name,
        memberPan: formatPan(row.pan),
        memberUpi: row.upi ?? null,
        memberStatus: row.member_status,
        amount: Number(row.amount),
        allotmentStatus: row.allotment_status,
        investorCategory: row.investor_category,
        grossProfitLoss: row.profit_loss != null ? Number(row.profit_loss) : null,
        memberShare: row.member_amount != null ? Number(row.member_amount) : null,
        fundReturned: row.trns_received === 'Received',
        isLeader: Number(row.member_id) === Number(memberId),
      }));
    }
  }

  const personal = personalApp[0]
    ? {
        id: personalApp[0].id,
        amount: Number(personalApp[0].amount),
        allotmentStatus: personalApp[0].allotment_status,
        investorCategory: personalApp[0].investor_category,
        grossProfitLoss:
          personalApp[0].profit_loss != null ? Number(personalApp[0].profit_loss) : null,
        memberShare:
          personalApp[0].member_amount != null ? Number(personalApp[0].member_amount) : null,
        fundReturned: personalApp[0].trns_received === 'Received',
      }
    : null;

  return {
    ipo: {
      id: ipo.id,
      name: ipo.name,
      status: ipo.status,
      openDate: ipo.open_date,
      ipoSegment: ipo.ipo_segment,
      lotAmountRii: Number(ipo.lot_amount_rii),
      lotAmountHni: ipo.lot_amount_hni != null ? Number(ipo.lot_amount_hni) : null,
    },
    personalApplication: personal,
    isLeader,
    groupApplications,
  };
}

export async function updateMemberProfile(pool, tenantId, memberId, body) {
  const email = body.email != null ? String(body.email).trim() || null : undefined;
  const upi = body.upi != null ? String(body.upi).trim() || null : undefined;

  if (email === undefined && upi === undefined) {
    throw new AppError('Nothing to update', 400);
  }
  if (email && email.length > 255) throw new AppError('Email is too long', 400);
  if (upi && upi.length > 255) throw new AppError('UPI is too long', 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError('Invalid email address', 400);
  }

  const fields = [];
  const params = [];
  if (email !== undefined) {
    fields.push('email = ?');
    params.push(email);
  }
  if (upi !== undefined) {
    fields.push('upi = ?');
    params.push(upi);
  }
  params.push(memberId, tenantId);

  await pool.query(`UPDATE members SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`, params);

  const [rows] = await pool.query(
    'SELECT id, display_name, pan, email, upi, status FROM members WHERE id = ? AND tenant_id = ?',
    [memberId, tenantId]
  );
  if (!rows.length) throw new AppError('Member not found', 404);
  const m = rows[0];
  return {
    id: m.id,
    displayName: m.display_name,
    pan: formatPan(m.pan),
    email: m.email ?? null,
    upi: m.upi ?? null,
    status: m.status,
  };
}

export async function listFundReturnClaims(pool, tenantId, memberId) {
  const [rows] = await pool.query(
    `SELECT id, amount, txn_date, payment_ref, notes, status, manager_note, created_at, resolved_at
     FROM member_fund_return_claims
     WHERE tenant_id = ? AND member_id = ?
     ORDER BY created_at DESC`,
    [tenantId, memberId]
  );
  return rows.map((row) => ({
    id: row.id,
    amount: Number(row.amount),
    txnDate: row.txn_date,
    paymentRef: row.payment_ref ?? null,
    notes: row.notes ?? null,
    status: row.status,
    managerNote: row.manager_note ?? null,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? null,
  }));
}

export async function createFundReturnClaim(pool, tenantId, memberId, body) {
  const amount = parseAmount(body.amount);
  const txnDate = parseTxnDate(body.txnDate);
  const paymentRef = body.paymentRef ? String(body.paymentRef).trim().slice(0, 255) : null;
  const notes = body.notes ? String(body.notes).trim().slice(0, 1000) : null;

  const [result] = await pool.query(
    `INSERT INTO member_fund_return_claims
       (tenant_id, member_id, amount, txn_date, payment_ref, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tenantId, memberId, amount, txnDate, paymentRef, notes]
  );

  const [rows] = await pool.query('SELECT * FROM member_fund_return_claims WHERE id = ?', [
    result.insertId,
  ]);
  const row = rows[0];
  return {
    id: row.id,
    amount: Number(row.amount),
    txnDate: row.txn_date,
    paymentRef: row.payment_ref ?? null,
    notes: row.notes ?? null,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function getMemberStatement(pool, tenantId, memberId) {
  const { getMemberDetail } = await import('./memberDetailService.js');
  const detail = await getMemberDetail(pool, tenantId, memberId);
  if (!detail) throw new AppError('Member not found', 404);

  const [tenantRows] = await pool.query('SELECT name FROM tenants WHERE id = ?', [tenantId]);
  const teamName = tenantRows[0]?.name ?? 'IPO Team';

  const { member, stats, ipoApplications, ledgerEntries } = detail;

  return {
    generatedAt: new Date().toISOString(),
    teamName,
    appName: 'IPO Team Manager',
    developerName: 'Lokendra',
    member: {
      displayName: member.display_name,
      pan: formatPan(member.pan),
      email: member.email ?? null,
      upi: member.upi ?? null,
    },
    summary: {
      totalGiven: stats.totalGiven,
      totalReceived: stats.totalReceived,
      totalBonus: stats.bonus,
      pendingReturn: stats.willReceiveFromTeam,
      grossIpoPnL: stats.totalIpoProfit,
      totalMemberShare: stats.totalMemberShare,
      totalManagerShare: stats.totalManagerShare,
      totalProviderShare: stats.totalProviderShare,
      iposApplied: stats.iposApplied,
      iposAlloted: stats.iposAlloted,
      iposPending: stats.iposPending,
      iposNotAlloted: stats.iposNotAlloted,
    },
    ledger: ledgerEntries.map((entry) => ({
      type: entry.type,
      amount: Number(entry.amount),
      txnDate: entry.txn_date,
      ipoName: entry.ipo_name ?? null,
      notes: entry.notes ?? null,
    })),
    ipoApplications: ipoApplications.map((app) => ({
      id: app.id,
      ipoId: app.ipo_id,
      ipoName: app.ipo_name,
      ipoStatus: app.ipo_status,
      amount: Number(app.amount),
      allotmentStatus: app.allotment_status,
      investorCategory: app.investor_category,
      grossProfitLoss: app.profit_loss != null ? Number(app.profit_loss) : null,
      memberShare: app.member_share != null ? Number(app.member_share) : null,
      managerShare: app.manager_share != null ? Number(app.manager_share) : null,
      providerShare: app.provider_share != null ? Number(app.provider_share) : null,
      shareStatus: app.share_status ?? null,
      fundReturned: app.trns_received === 'Received',
    })),
  };
}

export function normalizeIssueCategory(value) {
  const cat = String(value || 'OTHER').toUpperCase();
  return ISSUE_CATEGORIES.has(cat) ? cat : 'OTHER';
}
