import { AppError } from '../middleware/errorHandler.js';
import { parseAmount, parsePositiveInt, parseDate } from '../utils/validate.js';

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

async function loadGroup(conn, tenantId, groupId) {
  const id = parsePositiveInt(groupId, 'group id');
  const [rows] = await conn.query(
    `SELECT g.*, m.display_name AS owner_display_name, m.pan AS owner_pan
     FROM member_groups g
     LEFT JOIN members m ON m.id = g.owner_member_id
     WHERE g.id = ? AND g.tenant_id = ?`,
    [id, tenantId]
  );
  if (!rows.length) throw new AppError('Sub-group not found', 404);
  return rows[0];
}

function ownerLabel(group) {
  if (group.owner_member_id) {
    return group.owner_display_name || `Member #${group.owner_member_id}`;
  }
  if (group.owner_external_name) return group.owner_external_name;
  return null;
}

/** Apps whose cash was paid to this group's leader. */
function paidToLeaderSql(group, alias = 'a') {
  if (group.owner_member_id) {
    return {
      sql: `${alias}.paid_to_member_id = ?`,
      params: [group.owner_member_id],
    };
  }
  if (group.owner_external_name) {
    return {
      sql: `${alias}.paid_to_external_name = ?`,
      params: [group.owner_external_name],
    };
  }
  return { sql: '1=0', params: [] };
}

/** Ensure adjusted (and group) apps are attributed to the sub-group leader for wallet totals. */
async function repairGroupLeaderPaidTo(conn, tenantId, groupId = null) {
  // Member-owner groups: point paid_to at owner when still self/blank (common after early adjusts)
  await conn.query(
    `UPDATE ipo_applications a
     JOIN members m ON m.id = a.member_id AND m.tenant_id = a.tenant_id
     JOIN member_groups g ON g.id = m.member_group_id AND g.tenant_id = m.tenant_id
     SET a.paid_to_member_id = g.owner_member_id,
         a.paid_to_external_name = NULL
     WHERE a.tenant_id = ?
       AND g.owner_member_id IS NOT NULL
       AND (a.paid_to_member_id IS NULL OR a.paid_to_member_id = a.member_id)
       AND (a.adjusted_from_application_id IS NOT NULL
            OR a.trns_received IS NULL
            OR a.trns_received <> 'Received'
            OR COALESCE(a.adjusted_out_amount, 0) > 0)
       ${groupId ? 'AND g.id = ?' : ''}`,
    groupId ? [tenantId, groupId] : [tenantId]
  );

  await conn.query(
    `UPDATE ipo_applications a
     JOIN members m ON m.id = a.member_id AND m.tenant_id = a.tenant_id
     JOIN member_groups g ON g.id = m.member_group_id AND g.tenant_id = m.tenant_id
     SET a.paid_to_member_id = NULL,
         a.paid_to_external_name = g.owner_external_name
     WHERE a.tenant_id = ?
       AND g.owner_member_id IS NULL
       AND g.owner_external_name IS NOT NULL
       AND (a.paid_to_external_name IS NULL OR a.paid_to_external_name = '')
       AND (a.paid_to_member_id IS NULL OR a.paid_to_member_id = a.member_id)
       AND (a.adjusted_from_application_id IS NOT NULL
            OR a.trns_received IS NULL
            OR a.trns_received <> 'Received'
            OR COALESCE(a.adjusted_out_amount, 0) > 0)
       ${groupId ? 'AND g.id = ?' : ''}`,
    groupId ? [tenantId, groupId] : [tenantId]
  );
}

async function getIpoDerivedTotals(conn, tenantId, group) {
  const pay = paidToLeaderSql(group, 'a');
  if (!group.owner_member_id && !group.owner_external_name) {
    return {
      ipoSent: 0,
      ipoReturned: 0,
      ipoStillOut: 0,
      pendingAllotmentOut: 0,
      applicationCount: 0,
      unsettledCount: 0,
      pendingAllotmentCount: 0,
    };
  }

  // Effective capital with this leader (no double-count after fund adjust):
  // - pending = unsettled remaining (amount − adjusted_out), includes allotment PENDING
  // - returned = leftovers settled as Received
  // - given = pending + returned  (rolled apps drop off old IPO and appear on new IPO)
  const [[row]] = await conn.query(
    `SELECT
       COUNT(a.id) AS application_count,
       COALESCE(SUM(
         CASE
           WHEN a.trns_received = 'Received'
           THEN GREATEST(a.amount - COALESCE(a.adjusted_out_amount, 0), 0)
           ELSE 0
         END
       ), 0) AS ipo_returned,
       COALESCE(SUM(
         CASE
           WHEN a.trns_received = 'Received' THEN 0
           ELSE GREATEST(a.amount - COALESCE(a.adjusted_out_amount, 0), 0)
         END
       ), 0) AS ipo_still_out,
       COALESCE(SUM(
         CASE
           WHEN a.trns_received = 'Received' THEN 0
           WHEN a.allotment_status = 'PENDING'
           THEN GREATEST(a.amount - COALESCE(a.adjusted_out_amount, 0), 0)
           ELSE 0
         END
       ), 0) AS pending_allotment_out,
       SUM(
         CASE
           WHEN a.trns_received = 'Received' THEN 0
           ELSE 1
         END
       ) AS unsettled_count,
       SUM(
         CASE
           WHEN a.trns_received <> 'Received' AND a.allotment_status = 'PENDING' THEN 1
           ELSE 0
         END
       ) AS pending_allotment_count
     FROM ipo_applications a
     JOIN members m ON m.id = a.member_id AND m.tenant_id = a.tenant_id
     WHERE a.tenant_id = ?
       AND m.member_group_id = ?
       AND (${pay.sql})`,
    [tenantId, group.id, ...pay.params]
  );

  const ipoReturned = round2(row.ipo_returned);
  const ipoStillOut = round2(row.ipo_still_out);
  return {
    // Effective given = still with leader + already returned (adjust moves amount to the new IPO app)
    ipoSent: round2(ipoStillOut + ipoReturned),
    ipoReturned,
    ipoStillOut,
    pendingAllotmentOut: round2(row.pending_allotment_out),
    applicationCount: Number(row.application_count || 0),
    unsettledCount: Number(row.unsettled_count || 0),
    pendingAllotmentCount: Number(row.pending_allotment_count || 0),
  };
}

async function getManualTotals(conn, tenantId, groupId) {
  const [[row]] = await conn.query(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'SENT' THEN amount ELSE 0 END), 0) AS manual_sent,
       COALESCE(SUM(CASE WHEN type = 'RECEIVED' THEN amount ELSE 0 END), 0) AS manual_received,
       COALESCE(SUM(CASE WHEN type = 'ADJUSTMENT' THEN amount ELSE 0 END), 0) AS manual_adjustment
     FROM group_leader_transactions
     WHERE tenant_id = ? AND member_group_id = ?`,
    [tenantId, groupId]
  );
  return {
    manualSent: round2(row.manual_sent),
    manualReceived: round2(row.manual_received),
    manualAdjustment: round2(row.manual_adjustment),
  };
}

function composeBalances(ipo, manual) {
  // Simple wallet view for the manager:
  // - totalGiven = everything paid to this leader (IPO apps + manual SENT)
  // - totalReturned = settled back from leader (IPO received leftovers + manual RECEIVED)
  // - pendingWithLeader = still out with leader (includes PENDING allotment apps)
  const totalGiven = round2(ipo.ipoSent + manual.manualSent);
  const totalReturned = round2(ipo.ipoReturned + manual.manualReceived);
  const pendingWithLeader = round2(
    ipo.ipoStillOut + manual.manualSent - manual.manualReceived + manual.manualAdjustment
  );
  const cashPending = round2(
    manual.manualSent - manual.manualReceived + manual.manualAdjustment
  );
  const matchGap = round2(cashPending - ipo.ipoStillOut);
  return {
    ...ipo,
    ...manual,
    // cash book (manual ledger only) — use this to match IPO pending
    cashSent: manual.manualSent,
    cashReceived: manual.manualReceived,
    cashAdjustment: manual.manualAdjustment,
    cashPending,
    matchGap,
    matchOk: Math.abs(matchGap) < 0.5,
    // primary simple fields (IPO + cash combined)
    totalGiven,
    totalReturned,
    pendingWithLeader,
    // backward-compatible aliases
    totalSent: totalGiven,
    totalReceived: totalReturned,
    available: pendingWithLeader,
  };
}

export async function listGroupLeaderWallets(conn, tenantId) {
  await repairGroupLeaderPaidTo(conn, tenantId);

  const [groups] = await conn.query(
    `SELECT g.*, m.display_name AS owner_display_name, m.pan AS owner_pan,
            (SELECT COUNT(*) FROM members mm WHERE mm.member_group_id = g.id AND mm.tenant_id = g.tenant_id) AS member_count
     FROM member_groups g
     LEFT JOIN members m ON m.id = g.owner_member_id
     WHERE g.tenant_id = ?
     ORDER BY g.sort_order, g.name`,
    [tenantId]
  );

  const rows = [];
  for (const g of groups) {
    const leaderName = ownerLabel(g);
    if (!leaderName) {
      rows.push({
        groupId: g.id,
        groupName: g.name,
        leaderName: null,
        leaderType: 'none',
        ownerMemberId: null,
        memberCount: Number(g.member_count || 0),
        ipoSent: 0,
        ipoReturned: 0,
        ipoStillOut: 0,
        pendingAllotmentOut: 0,
        pendingAllotmentCount: 0,
        manualSent: 0,
        manualReceived: 0,
        manualAdjustment: 0,
        cashSent: 0,
        cashReceived: 0,
        cashAdjustment: 0,
        cashPending: 0,
        matchGap: 0,
        matchOk: true,
        totalGiven: 0,
        totalReturned: 0,
        pendingWithLeader: 0,
        totalSent: 0,
        totalReceived: 0,
        available: 0,
        applicationCount: 0,
        unsettledCount: 0,
        hasOwner: false,
      });
      continue;
    }
    const ipo = await getIpoDerivedTotals(conn, tenantId, g);
    const manual = await getManualTotals(conn, tenantId, g.id);
    const bal = composeBalances(ipo, manual);
    rows.push({
      groupId: g.id,
      groupName: g.name,
      leaderName,
      leaderType: g.owner_member_id ? 'member' : 'external',
      ownerMemberId: g.owner_member_id || null,
      ownerExternalName: g.owner_external_name || null,
      memberCount: Number(g.member_count || 0),
      hasOwner: true,
      ...bal,
    });
  }
  return rows;
}

export async function getGroupLeaderWalletDetail(conn, tenantId, groupId) {
  const group = await loadGroup(conn, tenantId, groupId);
  await repairGroupLeaderPaidTo(conn, tenantId, group.id);
  const leaderName = ownerLabel(group);
  if (!leaderName) {
    throw new AppError('Set a sub-group leader (owner) before using the leader wallet');
  }

  const [[memberCountRow]] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM members WHERE tenant_id = ? AND member_group_id = ?`,
    [tenantId, group.id]
  );

  const ipo = await getIpoDerivedTotals(conn, tenantId, group);
  const manual = await getManualTotals(conn, tenantId, group.id);
  const bal = composeBalances(ipo, manual);

  const pay = paidToLeaderSql(group, 'a');
  const [ipoRows] = await conn.query(
    `SELECT
       i.id AS ipo_id,
       i.name AS ipo_name,
       i.status AS ipo_status,
       COUNT(a.id) AS application_count,
       COALESCE(SUM(
         CASE
           WHEN a.trns_received = 'Received'
           THEN GREATEST(a.amount - COALESCE(a.adjusted_out_amount, 0), 0)
           ELSE 0
         END
       ), 0) AS returned,
       COALESCE(SUM(
         CASE
           WHEN a.trns_received = 'Received' THEN 0
           ELSE GREATEST(a.amount - COALESCE(a.adjusted_out_amount, 0), 0)
         END
       ), 0) AS still_out,
       COALESCE(SUM(
         CASE
           WHEN a.trns_received = 'Received' THEN 0
           WHEN a.allotment_status = 'PENDING'
           THEN GREATEST(a.amount - COALESCE(a.adjusted_out_amount, 0), 0)
           ELSE 0
         END
       ), 0) AS pending_allotment_out,
       SUM(
         CASE
           WHEN a.trns_received <> 'Received' AND a.allotment_status = 'PENDING' THEN 1
           ELSE 0
         END
       ) AS pending_allotment_count
     FROM ipo_applications a
     JOIN members m ON m.id = a.member_id AND m.tenant_id = a.tenant_id
     JOIN ipos i ON i.id = a.ipo_id
     WHERE a.tenant_id = ?
       AND m.member_group_id = ?
       AND (${pay.sql})
     GROUP BY i.id, i.name, i.status
     HAVING still_out > 0.001 OR returned > 0.001 OR pending_allotment_out > 0.001 OR COUNT(a.id) > 0
     ORDER BY COALESCE(i.open_date, DATE(i.created_at)) DESC, i.id DESC`,
    [tenantId, group.id, ...pay.params]
  );

  const [bulkRows] = await conn.query(
    `SELECT bp.*, i.name AS ipo_name
     FROM member_group_bulk_payments bp
     JOIN ipos i ON i.id = bp.ipo_id
     WHERE bp.tenant_id = ? AND bp.member_group_id = ?
     ORDER BY bp.paid_at DESC, bp.id DESC`,
    [tenantId, group.id]
  );

  const [manualTxns] = await conn.query(
    `SELECT t.*, i.name AS ipo_name
     FROM group_leader_transactions t
     LEFT JOIN ipos i ON i.id = t.ipo_id
     WHERE t.tenant_id = ? AND t.member_group_id = ?
     ORDER BY t.txn_date DESC, t.id DESC`,
    [tenantId, group.id]
  );

  // Unified activity feed
  const activity = [];
  for (const bp of bulkRows) {
    activity.push({
      id: `bulk-${bp.id}`,
      source: 'ipo_bulk',
      type: 'SENT',
      amount: round2(bp.total_amount),
      txnDate: bp.paid_at,
      ipoId: bp.ipo_id,
      ipoName: bp.ipo_name,
      notes: bp.notes || `Bulk pay (${bp.member_count} members)`,
      memberCount: bp.member_count,
    });
  }
  for (const t of manualTxns) {
    activity.push({
      id: `manual-${t.id}`,
      source: 'manual',
      manualId: t.id,
      type: t.type,
      amount: round2(t.amount),
      txnDate: t.txn_date,
      ipoId: t.ipo_id,
      ipoName: t.ipo_name,
      notes: t.notes,
    });
  }
  activity.sort((a, b) => new Date(b.txnDate) - new Date(a.txnDate));

  return {
    groupId: group.id,
    groupName: group.name,
    leaderName,
    leaderType: group.owner_member_id ? 'member' : 'external',
    ownerMemberId: group.owner_member_id || null,
    ownerExternalName: group.owner_external_name || null,
    memberCount: Number(memberCountRow.cnt || 0),
    ...bal,
    cashWallet: {
      sent: bal.cashSent,
      received: bal.cashReceived,
      adjustment: bal.cashAdjustment,
      pending: bal.cashPending,
    },
    match: {
      cashPending: bal.cashPending,
      ipoPending: bal.ipoStillOut,
      gap: bal.matchGap,
      ok: bal.matchOk,
    },
    ipoWise: ipoRows.map((r) => {
      const stillOut = round2(r.still_out);
      const returned = round2(r.returned);
      return {
        ipoId: r.ipo_id,
        ipoName: r.ipo_name,
        ipoStatus: r.ipo_status,
        applicationCount: Number(r.application_count),
        // Effective given on this IPO after adjusts (pending + returned), not raw app face value
        sent: round2(stillOut + returned),
        returned,
        stillOut,
        pendingWithLeader: stillOut,
        pendingAllotmentOut: round2(r.pending_allotment_out),
        pendingAllotmentCount: Number(r.pending_allotment_count || 0),
        available: stillOut,
      };
    }),
    activity,
    manualTransactions: manualTxns.map((t) => ({
      id: t.id,
      type: t.type,
      amount: round2(t.amount),
      txnDate: t.txn_date,
      ipoId: t.ipo_id,
      ipoName: t.ipo_name,
      notes: t.notes,
    })),
  };
}

export async function createGroupLeaderTransaction(conn, {
  tenantId,
  groupId,
  type,
  amount,
  txnDate,
  notes,
  ipoId,
  userId,
}) {
  const group = await loadGroup(conn, tenantId, groupId);
  if (!group.owner_member_id && !group.owner_external_name) {
    throw new AppError('Set a sub-group leader before recording transactions');
  }

  const t = String(type || '').toUpperCase();
  if (!['SENT', 'RECEIVED', 'ADJUSTMENT'].includes(t)) {
    throw new AppError('Type must be SENT, RECEIVED, or ADJUSTMENT');
  }

  let amt = parseAmount(amount, { fieldName: 'amount' });
  if (t === 'ADJUSTMENT') {
    // allow negative adjustment via signed amount
    amt = parseAmount(amount, { allowNegative: true, fieldName: 'amount' });
  } else if (amt <= 0) {
    throw new AppError('Amount must be positive');
  }

  let resolvedIpoId = null;
  if (ipoId != null && ipoId !== '') {
    resolvedIpoId = parsePositiveInt(ipoId, 'IPO id');
    const [ipos] = await conn.query(
      'SELECT id FROM ipos WHERE id = ? AND tenant_id = ?',
      [resolvedIpoId, tenantId]
    );
    if (!ipos.length) throw new AppError('IPO not found', 404);
  }

  const when = txnDate ? parseDate(txnDate, 'txn date') : new Date();
  const [result] = await conn.query(
    `INSERT INTO group_leader_transactions
     (tenant_id, member_group_id, ipo_id, type, amount, txn_date, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      group.id,
      resolvedIpoId,
      t,
      amt,
      when,
      notes?.trim() || null,
      userId || null,
    ]
  );

  return getGroupLeaderWalletDetail(conn, tenantId, group.id).then((detail) => ({
    transactionId: result.insertId,
    detail,
  }));
}

export async function deleteGroupLeaderTransaction(conn, tenantId, groupId, txnId) {
  await loadGroup(conn, tenantId, groupId);
  const id = parsePositiveInt(txnId, 'transaction id');
  const [result] = await conn.query(
    `DELETE FROM group_leader_transactions
     WHERE id = ? AND tenant_id = ? AND member_group_id = ?`,
    [id, tenantId, groupId]
  );
  if (!result.affectedRows) throw new AppError('Transaction not found', 404);
  return getGroupLeaderWalletDetail(conn, tenantId, groupId);
}

/**
 * Cash book for all leaders + match vs provider wallet / IPO pending.
 * Manual SENT/RECEIVED entries are the cash ledger (like provider transactions).
 */
export async function getGroupLeaderWalletsOverview(conn, tenantId) {
  const [[cash]] = await conn.query(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'SENT' THEN amount ELSE 0 END), 0) AS cash_sent,
       COALESCE(SUM(CASE WHEN type = 'RECEIVED' THEN amount ELSE 0 END), 0) AS cash_received,
       COALESCE(SUM(CASE WHEN type = 'ADJUSTMENT' THEN amount ELSE 0 END), 0) AS cash_adjustment,
       COUNT(*) AS txn_count
     FROM group_leader_transactions
     WHERE tenant_id = ?`,
    [tenantId]
  );

  const cashSent = round2(cash.cash_sent);
  const cashReceived = round2(cash.cash_received);
  const cashAdjustment = round2(cash.cash_adjustment);
  const cashPending = round2(cashSent - cashReceived + cashAdjustment);

  // IPO-derived pending still with leaders (paid_to leader), across all groups
  const groups = await listGroupLeaderWallets(conn, tenantId);
  let ipoPending = 0;
  let ipoGiven = 0;
  let ipoReturned = 0;
  for (const g of groups) {
    if (!g.hasOwner) continue;
    ipoPending = round2(ipoPending + Number(g.ipoStillOut || 0));
    ipoGiven = round2(ipoGiven + Number(g.ipoSent || 0));
    ipoReturned = round2(ipoReturned + Number(g.ipoReturned || 0));
  }

  const [[providerBal]] = await conn.query(
    `SELECT COALESCE(SUM(balance), 0) AS provider_balance
     FROM manager_bank_accounts
     WHERE tenant_id = ? AND is_active = 1 AND purpose = 'PROVIDER'`,
    [tenantId]
  );
  const providerBalance = round2(providerBal.provider_balance);

  const [[provTxn]] = await conn.query(
    `SELECT
       COALESCE(SUM(CASE WHEN wt.type = 'DISTRIBUTE_OUT' THEN ABS(wt.amount) ELSE 0 END), 0) AS distributed,
       COALESCE(SUM(CASE WHEN wt.type = 'RETURN_IN' THEN ABS(wt.amount) ELSE 0 END), 0) AS returned_in,
       COALESCE(SUM(CASE WHEN wt.type = 'PROVIDER_IN' THEN ABS(wt.amount) ELSE 0 END), 0) AS provider_in,
       COALESCE(SUM(CASE WHEN wt.type = 'PROVIDER_OUT' THEN ABS(wt.amount) ELSE 0 END), 0) AS provider_out
     FROM wallet_transactions wt
     LEFT JOIN manager_bank_accounts mba ON mba.id = wt.bank_account_id
     WHERE wt.tenant_id = ?
       AND (mba.purpose IS NULL OR mba.purpose = 'PROVIDER')`,
    [tenantId]
  );
  const providerDistributed = round2(provTxn.distributed);
  const providerReturnedIn = round2(provTxn.returned_in);
  const providerNetOut = round2(providerDistributed - providerReturnedIn);

  const [ledgerRows] = await conn.query(
    `SELECT t.*, g.name AS group_name,
            COALESCE(m.display_name, g.owner_external_name) AS leader_name,
            i.name AS ipo_name
     FROM group_leader_transactions t
     JOIN member_groups g ON g.id = t.member_group_id AND g.tenant_id = t.tenant_id
     LEFT JOIN members m ON m.id = g.owner_member_id
     LEFT JOIN ipos i ON i.id = t.ipo_id
     WHERE t.tenant_id = ?
     ORDER BY t.txn_date DESC, t.id DESC
     LIMIT 200`,
    [tenantId]
  );

  const leadersWithOwner = groups
    .filter((g) => g.hasOwner)
    .map((g) => ({
      groupId: g.groupId,
      groupName: g.groupName,
      leaderName: g.leaderName,
      leaderType: g.leaderType,
      memberCount: g.memberCount,
      cashSent: g.cashSent,
      cashReceived: g.cashReceived,
      cashPending: g.cashPending,
      ipoPending: g.ipoStillOut,
      ipoGiven: g.ipoSent,
      ipoReturned: g.ipoReturned,
      matchGap: g.matchGap,
      matchOk: g.matchOk,
      pendingAllotmentOut: g.pendingAllotmentOut,
    }));

  return {
    cashWallet: {
      sent: cashSent,
      received: cashReceived,
      adjustment: cashAdjustment,
      pending: cashPending,
      txnCount: Number(cash.txn_count || 0),
    },
    providerWallet: {
      balance: providerBalance,
      distributed: providerDistributed,
      returnedIn: providerReturnedIn,
      netOut: providerNetOut,
      providerIn: round2(provTxn.provider_in),
      providerOut: round2(provTxn.provider_out),
    },
    ipoWithLeaders: {
      given: ipoGiven,
      returned: ipoReturned,
      pending: ipoPending,
    },
    match: {
      // Totals across leaders (each leader also has their own match)
      cashSentVsProviderOut: round2(cashSent - providerNetOut),
      cashPendingVsIpoPending: round2(cashPending - ipoPending),
    },
    leaderWallets: leadersWithOwner,
    ledger: ledgerRows.map((t) => ({
      id: t.id,
      groupId: t.member_group_id,
      groupName: t.group_name,
      leaderName: t.leader_name,
      type: t.type,
      amount: round2(t.amount),
      txnDate: t.txn_date,
      ipoId: t.ipo_id,
      ipoName: t.ipo_name,
      notes: t.notes,
    })),
    leaders: leadersWithOwner,
  };
}
