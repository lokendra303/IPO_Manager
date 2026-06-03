export async function getSummary(pool, tenantId) {
  const [members] = await pool.query(
    `SELECT m.id, m.display_name, m.pan, m.status, m.relationship_note, m.bulk_group_label
     FROM members m WHERE m.tenant_id = ? ORDER BY m.sort_order, m.id`,
    [tenantId]
  );

  const [ledger] = await pool.query(
    `SELECT member_id, type, SUM(amount) as total
     FROM member_ledger_entries WHERE tenant_id = ?
     GROUP BY member_id, type`,
    [tenantId]
  );

  const [appStats] = await pool.query(
    `SELECT member_id,
            COUNT(*) as ipos_applied,
            SUM(CASE WHEN allotment_status = 'ALLOTED' THEN 1 ELSE 0 END) as ipos_alloted,
            SUM(CASE WHEN allotment_status = 'ALLOTED' THEN COALESCE(profit_loss, 0) ELSE 0 END) as total_ipo_profit
     FROM ipo_applications WHERE tenant_id = ?
     GROUP BY member_id`,
    [tenantId]
  );

  const [walletRows] = await pool.query(
    'SELECT balance FROM owner_wallets WHERE tenant_id = ?',
    [tenantId]
  );

  const [providerBalance] = await pool.query(
    `SELECT COALESCE(SUM(pt.amount), 0) as net_provider_balance
     FROM provider_transactions pt
     JOIN fund_providers fp ON fp.id = pt.fund_provider_id
     WHERE pt.tenant_id = ?`,
    [tenantId]
  );

  const ledgerMap = {};
  for (const row of ledger) {
    if (!ledgerMap[row.member_id]) ledgerMap[row.member_id] = { given: 0, received: 0 };
    if (row.type === 'GIVEN') ledgerMap[row.member_id].given = Number(row.total);
    if (row.type === 'RECEIVED') ledgerMap[row.member_id].received = Number(row.total);
    if (row.type === 'BONUS') ledgerMap[row.member_id].bonus = Number(row.total);
  }

  const appMap = {};
  for (const row of appStats) {
    appMap[row.member_id] = {
      iposApplied: Number(row.ipos_applied),
      iposAlloted: Number(row.ipos_alloted),
      totalIpoProfit: Number(row.total_ipo_profit),
    };
  }

  const rows = members.map((m) => {
    const lg = ledgerMap[m.id] || { given: 0, received: 0, bonus: 0 };
    const ap = appMap[m.id] || { iposApplied: 0, iposAlloted: 0, totalIpoProfit: 0 };
    const willReceiveFromTeam = lg.given - lg.received;
    return {
      memberId: m.id,
      displayName: m.display_name,
      pan: m.pan,
      status: m.status,
      relationshipNote: m.relationship_note,
      bulkGroupLabel: m.bulk_group_label,
      totalGiven: lg.given,
      totalReceived: lg.received,
      bonus: lg.bonus || 0,
      iposApplied: ap.iposApplied,
      iposAlloted: ap.iposAlloted,
      totalIpoProfit: ap.totalIpoProfit,
      willReceiveFromTeam,
      mismatch: willReceiveFromTeam !== 0,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      totalGiven: acc.totalGiven + r.totalGiven,
      totalReceived: acc.totalReceived + r.totalReceived,
      iposApplied: acc.iposApplied + r.iposApplied,
      iposAlloted: acc.iposAlloted + r.iposAlloted,
      totalIpoProfit: acc.totalIpoProfit + r.totalIpoProfit,
      willReceiveFromTeam: acc.willReceiveFromTeam + r.willReceiveFromTeam,
    }),
    { totalGiven: 0, totalReceived: 0, iposApplied: 0, iposAlloted: 0, totalIpoProfit: 0, willReceiveFromTeam: 0 }
  );

  return {
    rows,
    totals,
    availableFreeAmount: Number(walletRows[0]?.balance ?? 0),
    providerNetBalance: Number(providerBalance[0]?.net_provider_balance ?? 0),
  };
}
