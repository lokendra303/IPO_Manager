import { AppError } from '../middleware/errorHandler.js';

export function validatePercents(providerPercent, managerPercent, label = 'Share') {
  const p = Number(providerPercent);
  const m = Number(managerPercent);
  if (Number.isNaN(p) || p < 0 || p > 100) {
    throw new AppError(`${label}: provider percent must be between 0 and 100`);
  }
  if (Number.isNaN(m) || m < 0 || m > 100) {
    throw new AppError(`${label}: manager percent must be between 0 and 100`);
  }
  if (p + m > 100) {
    throw new AppError(`${label}: provider (${p}%) + manager (${m}%) cannot exceed 100%`);
  }
  return { providerPercent: p, managerPercent: m, memberPercent: 100 - p - m };
}

export function validateProfitLossPercents({
  profitProviderPercent,
  profitManagerPercent,
  lossProviderPercent,
  lossManagerPercent,
}) {
  validatePercents(profitProviderPercent, profitManagerPercent, 'Profit share');
  validatePercents(lossProviderPercent, lossManagerPercent, 'Loss share');
}

export function resolvePercentsForPnL(rule, grossProfitLoss) {
  const isLoss = Number(grossProfitLoss) < 0;
  if (isLoss) {
    return {
      providerPercent: rule.lossProviderPercent,
      managerPercent: rule.lossManagerPercent,
      isLoss: true,
      pnlType: 'LOSS',
      ruleLabel: 'loss',
    };
  }
  return {
    providerPercent: rule.profitProviderPercent,
    managerPercent: rule.profitManagerPercent,
    isLoss: false,
    pnlType: 'PROFIT',
    ruleLabel: 'profit',
  };
}

export function calculateSplit(grossProfitLoss, providerPercent, managerPercent) {
  const gross = Number(grossProfitLoss);
  const pPct = Number(providerPercent);
  const mPct = Number(managerPercent);
  const providerAmount = Math.round((gross * pPct) / 100 * 100) / 100;
  const managerAmount = Math.round((gross * mPct) / 100 * 100) / 100;
  const memberAmount = Math.round((gross - providerAmount - managerAmount) * 100) / 100;
  return {
    providerAmount,
    managerAmount,
    memberAmount,
    isLoss: gross < 0,
  };
}

function assertProviderForShare({ displayName, providerPercent, providerAmount, fundProviderId, ruleLabel }) {
  if (!fundProviderId) {
    throw new AppError(
      `${displayName}: set fund provider and share % for this member under Profit Sharing before distributing ${ruleLabel} share.`
    );
  }
  if (providerAmount !== 0 && providerPercent > 0 && !fundProviderId) {
    throw new AppError(
      `${displayName}: ${ruleLabel} provider share is ${providerPercent}% but no fund provider is assigned.`
    );
  }
}

function emptyRule(fundProviderId = null, providerName = null) {
  return {
    fundProviderId,
    providerName,
    profitProviderPercent: 0,
    profitManagerPercent: 0,
    lossProviderPercent: 0,
    lossManagerPercent: 0,
    source: 'none',
  };
}

export async function getProviderShareRule(conn, tenantId, fundProviderId) {
  const [rows] = await conn.query(
    `SELECT fpsr.*, fp.name as provider_name
     FROM fund_provider_share_rules fpsr
     JOIN fund_providers fp ON fp.id = fpsr.fund_provider_id
     WHERE fpsr.fund_provider_id = ? AND fpsr.tenant_id = ?`,
    [fundProviderId, tenantId]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    fundProviderId: r.fund_provider_id,
    providerName: r.provider_name,
    profitProviderPercent: Number(r.profit_provider_percent),
    profitManagerPercent: Number(r.profit_manager_percent),
    lossProviderPercent: Number(r.loss_provider_percent),
    lossManagerPercent: Number(r.loss_manager_percent),
    source: 'provider',
  };
}

function mapMemberRuleRow(row) {
  return {
    id: row.id,
    ruleName: row.rule_name || `Rule ${row.id}`,
    sortOrder: Number(row.sort_order ?? 0),
    fundProviderId: row.fund_provider_id,
    providerName: row.provider_name,
    profitProviderPercent: Number(row.provider_percent),
    profitManagerPercent: Number(row.manager_percent),
    lossProviderPercent: Number(row.loss_provider_percent ?? 0),
    lossManagerPercent: Number(row.loss_manager_percent ?? 0),
  };
}

/** All share rules for a member (multiple allowed). */
export async function getMemberShareRules(conn, tenantId, memberId) {
  const [member] = await conn.query(
    'SELECT id FROM members WHERE id = ? AND tenant_id = ?',
    [memberId, tenantId]
  );
  if (!member.length) throw new AppError('Member not found', 404);

  const [rows] = await conn.query(
    `SELECT mps.*, fp.name AS provider_name
     FROM member_profit_shares mps
     LEFT JOIN fund_providers fp ON fp.id = mps.fund_provider_id
     WHERE mps.member_id = ? AND mps.tenant_id = ?
     ORDER BY mps.sort_order, mps.id`,
    [memberId, tenantId]
  );

  const rules = rows.map(mapMemberRuleRow);
  return {
    memberId,
    rules,
    hasRules: rules.length > 0,
    ruleCount: rules.length,
  };
}

export function validateMemberRulesSet(rules) {
  if (!rules.length) {
    throw new AppError('Add at least one share rule for this member');
  }
  const profitProvider = rules.reduce((s, r) => s + Number(r.profitProviderPercent), 0);
  const profitManager = rules.reduce((s, r) => s + Number(r.profitManagerPercent), 0);
  const lossProvider = rules.reduce((s, r) => s + Number(r.lossProviderPercent), 0);
  const lossManager = rules.reduce((s, r) => s + Number(r.lossManagerPercent), 0);

  if (profitProvider + profitManager > 100) {
    throw new AppError(
      `Combined profit shares (${profitProvider}% + ${profitManager}% manager) cannot exceed 100% across all rules`
    );
  }
  if (lossProvider + lossManager > 100) {
    throw new AppError(
      `Combined loss shares (${lossProvider}% + ${lossManager}% manager) cannot exceed 100% across all rules`
    );
  }
  for (const r of rules) {
    if (!r.fundProviderId) {
      throw new AppError(`Rule "${r.ruleName}": fund provider is required`);
    }
    validateProfitLossPercents({
      profitProviderPercent: r.profitProviderPercent,
      profitManagerPercent: r.profitManagerPercent,
      lossProviderPercent: r.lossProviderPercent,
      lossManagerPercent: r.lossManagerPercent,
    });
  }
}

/** Apply every member rule to gross P&L (each rule % is of full gross). */
export function calculateMultiRuleSplit(grossProfitLoss, rules) {
  const gross = Number(grossProfitLoss);
  const isLoss = gross < 0;
  const lines = [];
  let totalProvider = 0;
  let totalManager = 0;

  for (const rule of rules) {
    const applied = resolvePercentsForPnL(
      {
        profitProviderPercent: rule.profitProviderPercent,
        profitManagerPercent: rule.profitManagerPercent,
        lossProviderPercent: rule.lossProviderPercent,
        lossManagerPercent: rule.lossManagerPercent,
      },
      gross
    );
    const split = calculateSplit(gross, applied.providerPercent, applied.managerPercent);
    lines.push({
      ruleId: rule.id,
      ruleName: rule.ruleName,
      fundProviderId: rule.fundProviderId,
      providerName: rule.providerName,
      providerPercent: applied.providerPercent,
      managerPercent: applied.managerPercent,
      providerAmount: split.providerAmount,
      managerAmount: split.managerAmount,
      pnlType: applied.pnlType,
      ruleLabel: applied.ruleLabel,
    });
    totalProvider += split.providerAmount;
    totalManager += split.managerAmount;
  }

  totalProvider = Math.round(totalProvider * 100) / 100;
  totalManager = Math.round(totalManager * 100) / 100;
  const memberAmount = Math.round((gross - totalProvider - totalManager) * 100) / 100;
  const sumProviderPct = lines.reduce((s, l) => s + l.providerPercent, 0);
  const sumManagerPct = lines.reduce((s, l) => s + l.managerPercent, 0);

  return {
    lines,
    totalProvider,
    totalManager,
    memberAmount,
    isLoss,
    pnlType: isLoss ? 'LOSS' : 'PROFIT',
    sumProviderPct,
    sumManagerPct,
  };
}

/** @deprecated Use getMemberShareRules — returns summary of all rules */
export async function getMemberShareRule(conn, tenantId, memberId) {
  const { rules, hasRules } = await getMemberShareRules(conn, tenantId, memberId);
  if (!hasRules) return emptyRule(null, null);

  const profitProviderPercent = rules.reduce((s, r) => s + r.profitProviderPercent, 0);
  const profitManagerPercent = rules.reduce((s, r) => s + r.profitManagerPercent, 0);
  const lossProviderPercent = rules.reduce((s, r) => s + r.lossProviderPercent, 0);
  const lossManagerPercent = rules.reduce((s, r) => s + r.lossManagerPercent, 0);
  const names = [...new Set(rules.map((r) => r.providerName).filter(Boolean))];

  return {
    fundProviderId: rules.length === 1 ? rules[0].fundProviderId : null,
    providerName: names.length === 1 ? names[0] : names.join(', '),
    profitProviderPercent,
    profitManagerPercent,
    lossProviderPercent,
    lossManagerPercent,
    source: 'member',
    ruleCount: rules.length,
    rules,
  };
}

/** Auto-apply member share rules when app is ALLOTED with non-zero P&L (skips if already distributed). */
export async function tryAutoDistributeApplication(conn, { tenantId, applicationId, userId }) {
  const [app] = await conn.query(
    `SELECT allotment_status, profit_loss FROM ipo_applications WHERE id = ? AND tenant_id = ?`,
    [applicationId, tenantId]
  );
  if (!app.length) return { applicationId, skipped: true, reason: 'Application not found' };
  if (app[0].allotment_status !== 'ALLOTED') {
    return { applicationId, skipped: true, reason: 'Not allotted' };
  }
  if (app[0].profit_loss == null || Number(app[0].profit_loss) === 0) {
    return { applicationId, skipped: true, reason: 'No P&L set' };
  }

  const results = await distributeProfitShares(conn, {
    tenantId,
    applicationIds: [applicationId],
    userId,
  });
  return results[0] || { applicationId, skipped: true, reason: 'No distribution result' };
}

export async function distributeProfitShares(conn, { tenantId, ipoId, applicationIds, userId }) {
  let query = `
    SELECT a.*, i.name as ipo_name, m.display_name
    FROM ipo_applications a
    JOIN ipos i ON i.id = a.ipo_id
    JOIN members m ON m.id = a.member_id
    WHERE a.tenant_id = ? AND a.allotment_status = 'ALLOTED' AND a.profit_loss IS NOT NULL
  `;
  const params = [tenantId];

  if (ipoId) {
    query += ' AND a.ipo_id = ?';
    params.push(ipoId);
  }
  if (applicationIds?.length) {
    query += ` AND a.id IN (${applicationIds.map(() => '?').join(',')})`;
    params.push(...applicationIds);
  }

  const [apps] = await conn.query(query, params);

  const results = [];
  const now = new Date();

  for (const app of apps) {
    const [existing] = await conn.query(
      'SELECT id FROM profit_share_distributions WHERE ipo_application_id = ?',
      [app.id]
    );
    if (existing.length) {
      results.push({ applicationId: app.id, memberName: app.display_name, skipped: true, reason: 'Already distributed' });
      continue;
    }

    const { rules, hasRules } = await getMemberShareRules(conn, tenantId, app.member_id);

    const gross = Number(app.profit_loss);
    if (gross === 0) {
      results.push({
        applicationId: app.id,
        memberName: app.display_name,
        skipped: true,
        reason: 'P&L is zero',
      });
      continue;
    }

    if (!hasRules) {
      results.push({
        applicationId: app.id,
        memberName: app.display_name,
        skipped: true,
        reason: 'No share rules for this member (Profit Sharing)',
      });
      continue;
    }

    validateMemberRulesSet(rules);

    const split = calculateMultiRuleSplit(gross, rules);
    const { lines, totalProvider, totalManager, memberAmount, isLoss, pnlType, sumProviderPct, sumManagerPct } =
      split;

    const headerProviderId = lines.length === 1 ? lines[0].fundProviderId : null;

    const [distResult] = await conn.query(
      `INSERT INTO profit_share_distributions
       (tenant_id, ipo_application_id, member_id, fund_provider_id, gross_profit_loss, pnl_type,
        provider_percent, manager_percent, provider_amount, manager_amount, member_amount, distributed_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        app.id,
        app.member_id,
        headerProviderId,
        app.profit_loss,
        pnlType,
        sumProviderPct,
        sumManagerPct,
        totalProvider,
        totalManager,
        memberAmount,
        now,
        `IPO: ${app.ipo_name} (${lines.length} rule(s))`,
      ]
    );
    const distributionId = distResult.insertId;

    for (const line of lines) {
      await conn.query(
        `INSERT INTO profit_share_distribution_rules
         (distribution_id, member_share_rule_id, rule_name, fund_provider_id,
          provider_percent, manager_percent, provider_amount, manager_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          distributionId,
          line.ruleId,
          line.ruleName,
          line.fundProviderId,
          line.providerPercent,
          line.managerPercent,
          line.providerAmount,
          line.managerAmount,
        ]
      );

      if (line.fundProviderId && line.providerAmount !== 0) {
        await conn.query(
          `INSERT INTO provider_transactions
           (fund_provider_id, tenant_id, amount, txn_date, account_label, notes, provider_profit, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            line.fundProviderId,
            tenantId,
            line.providerAmount,
            now,
            isLoss ? 'P&L Share (Loss)' : 'P&L Share',
            `${line.ruleName} — ${app.display_name} (${app.ipo_name})`,
            line.providerAmount,
            userId,
          ]
        );
      }
    }

    if (totalManager !== 0) {
      const { applyWalletDelta } = await import('./walletService.js');
      await applyWalletDelta(conn, {
        tenantId,
        delta: totalManager,
        type: totalManager > 0 ? 'RETURN_IN' : 'ADJUSTMENT',
        refType: 'profit_share',
        refId: app.id,
        txnDate: now,
        notes: isLoss
          ? `Manager loss share — ${app.display_name} (${app.ipo_name})`
          : `Manager profit share — ${app.display_name} (${app.ipo_name})`,
        userId,
        allowNegativeBalance: isLoss,
      });
    }

    const providerNames = [...new Set(lines.map((l) => l.providerName).filter(Boolean))].join(', ');

    results.push({
      applicationId: app.id,
      memberName: app.display_name,
      ipoName: app.ipo_name,
      grossProfitLoss: gross,
      isLoss,
      pnlType,
      ruleLabel: isLoss ? 'loss' : 'profit',
      ruleSource: 'member',
      ruleCount: lines.length,
      ruleLines: lines,
      providerPercent: sumProviderPct,
      managerPercent: sumManagerPct,
      providerAmount: totalProvider,
      managerAmount: totalManager,
      memberAmount,
      providerName: providerNames,
      skipped: false,
    });
  }

  return results;
}

export async function getProfitShareReport(pool, tenantId) {
  const [distributions] = await pool.query(
    `SELECT psd.*, m.display_name, m.pan, i.name as ipo_name, fp.name as provider_name
     FROM profit_share_distributions psd
     JOIN members m ON m.id = psd.member_id
     JOIN ipo_applications a ON a.id = psd.ipo_application_id
     JOIN ipos i ON i.id = a.ipo_id
     LEFT JOIN fund_providers fp ON fp.id = psd.fund_provider_id
     WHERE psd.tenant_id = ?
     ORDER BY psd.distributed_at DESC`,
    [tenantId]
  );

  const [ruleLines] = await pool.query(
    `SELECT psdr.*, fp.name AS provider_name
     FROM profit_share_distribution_rules psdr
     JOIN profit_share_distributions psd ON psd.id = psdr.distribution_id
     LEFT JOIN fund_providers fp ON fp.id = psdr.fund_provider_id
     WHERE psd.tenant_id = ?
     ORDER BY psdr.distribution_id, psdr.id`,
    [tenantId]
  );
  const linesByDist = {};
  for (const line of ruleLines) {
    if (!linesByDist[line.distribution_id]) linesByDist[line.distribution_id] = [];
    linesByDist[line.distribution_id].push(line);
  }

  const [byProvider] = await pool.query(
    `SELECT fp.id, fp.name,
            SUM(psdr.provider_amount) as total_provider_share,
            COUNT(DISTINCT psdr.id) as distribution_count
     FROM profit_share_distribution_rules psdr
     JOIN profit_share_distributions psd ON psd.id = psdr.distribution_id
     JOIN fund_providers fp ON fp.id = psdr.fund_provider_id
     WHERE psd.tenant_id = ?
     GROUP BY fp.id, fp.name`,
    [tenantId]
  );

  const [totals] = await pool.query(
    `SELECT
       COALESCE(SUM(gross_profit_loss), 0) as total_gross,
       COALESCE(SUM(provider_amount), 0) as total_provider,
       COALESCE(SUM(manager_amount), 0) as total_manager,
       COALESCE(SUM(member_amount), 0) as total_member
     FROM profit_share_distributions WHERE tenant_id = ?`,
    [tenantId]
  );

  const [pending] = await pool.query(
    `SELECT a.id, a.profit_loss, m.display_name, i.name as ipo_name, fp.name as provider_name
     FROM ipo_applications a
     JOIN members m ON m.id = a.member_id
     JOIN ipos i ON i.id = a.ipo_id
     LEFT JOIN fund_providers fp ON fp.id = m.fund_provider_id
     LEFT JOIN profit_share_distributions psd ON psd.ipo_application_id = a.id
     WHERE a.tenant_id = ? AND a.allotment_status = 'ALLOTED' AND a.profit_loss IS NOT NULL AND psd.id IS NULL`,
    [tenantId]
  );

  return {
    distributions: distributions.map((d) => ({
      ...d,
      ruleLines: linesByDist[d.id] || [],
    })),
    byProvider,
    totals: totals[0],
    pending,
  };
}

export async function getProfitTotalsReport(pool, tenantId) {
  const [overallDist] = await pool.query(
    `SELECT
       COUNT(*) as distribution_count,
       COALESCE(SUM(gross_profit_loss), 0) as gross_distributed,
       COALESCE(SUM(provider_amount), 0) as provider_share,
       COALESCE(SUM(manager_amount), 0) as manager_share,
       COALESCE(SUM(member_amount), 0) as member_share,
       COALESCE(SUM(CASE WHEN pnl_type = 'PROFIT' THEN gross_profit_loss ELSE 0 END), 0) as gross_profit,
       COALESCE(SUM(CASE WHEN pnl_type = 'LOSS' THEN gross_profit_loss ELSE 0 END), 0) as gross_loss
     FROM profit_share_distributions WHERE tenant_id = ?`,
    [tenantId]
  );

  const [overallIpo] = await pool.query(
    `SELECT
       COALESCE(SUM(profit_loss), 0) as gross_ipo_pnl,
       COALESCE(SUM(CASE WHEN profit_loss > 0 THEN profit_loss ELSE 0 END), 0) as ipo_profit,
       COALESCE(SUM(CASE WHEN profit_loss < 0 THEN profit_loss ELSE 0 END), 0) as ipo_loss
     FROM ipo_applications
     WHERE tenant_id = ? AND allotment_status = 'ALLOTED' AND profit_loss IS NOT NULL`,
    [tenantId]
  );

  const [pendingGross] = await pool.query(
    `SELECT COALESCE(SUM(a.profit_loss), 0) as pending_gross, COUNT(*) as pending_count
     FROM ipo_applications a
     LEFT JOIN profit_share_distributions psd ON psd.ipo_application_id = a.id
     WHERE a.tenant_id = ? AND a.allotment_status = 'ALLOTED' AND a.profit_loss IS NOT NULL AND psd.id IS NULL`,
    [tenantId]
  );

  const [byMember] = await pool.query(
    `SELECT m.id AS member_id, m.display_name, m.pan,
            COALESCE(app.gross_ipo_pnl, 0) AS gross_ipo_pnl,
            COALESCE(app.ipo_count, 0) AS ipo_count,
            COALESCE(dist.gross_distributed, 0) AS gross_distributed,
            COALESCE(dist.provider_share, 0) AS provider_share,
            COALESCE(dist.manager_share, 0) AS manager_share,
            COALESCE(dist.member_share, 0) AS member_share,
            COALESCE(dist.distribution_count, 0) AS distribution_count,
            COALESCE(pend.pending_gross, 0) AS pending_gross
     FROM members m
     LEFT JOIN (
       SELECT member_id,
              SUM(profit_loss) AS gross_ipo_pnl,
              COUNT(*) AS ipo_count
       FROM ipo_applications
       WHERE tenant_id = ? AND allotment_status = 'ALLOTED' AND profit_loss IS NOT NULL
       GROUP BY member_id
     ) app ON app.member_id = m.id
     LEFT JOIN (
       SELECT member_id,
              SUM(gross_profit_loss) AS gross_distributed,
              SUM(provider_amount) AS provider_share,
              SUM(manager_amount) AS manager_share,
              SUM(member_amount) AS member_share,
              COUNT(*) AS distribution_count
       FROM profit_share_distributions
       WHERE tenant_id = ?
       GROUP BY member_id
     ) dist ON dist.member_id = m.id
     LEFT JOIN (
       SELECT a.member_id, SUM(a.profit_loss) AS pending_gross
       FROM ipo_applications a
       LEFT JOIN profit_share_distributions psd ON psd.ipo_application_id = a.id
       WHERE a.tenant_id = ? AND a.allotment_status = 'ALLOTED' AND a.profit_loss IS NOT NULL AND psd.id IS NULL
       GROUP BY a.member_id
     ) pend ON pend.member_id = m.id
     WHERE m.tenant_id = ?
     HAVING gross_ipo_pnl != 0 OR gross_distributed != 0 OR pending_gross != 0
     ORDER BY m.sort_order, m.id`,
    [tenantId, tenantId, tenantId, tenantId]
  );

  const [byProvider] = await pool.query(
    `SELECT fp.id AS fund_provider_id, fp.name AS provider_name,
            COALESCE(SUM(psdr.provider_amount), 0) AS total_share,
            COALESCE(SUM(CASE WHEN psd.pnl_type = 'PROFIT' THEN psdr.provider_amount ELSE 0 END), 0) AS profit_share,
            COALESCE(SUM(CASE WHEN psd.pnl_type = 'LOSS' THEN psdr.provider_amount ELSE 0 END), 0) AS loss_share,
            COUNT(DISTINCT psdr.id) AS distribution_count
     FROM fund_providers fp
     LEFT JOIN profit_share_distribution_rules psdr ON psdr.fund_provider_id = fp.id
     LEFT JOIN profit_share_distributions psd ON psd.id = psdr.distribution_id AND psd.tenant_id = fp.tenant_id
     WHERE fp.tenant_id = ?
     GROUP BY fp.id, fp.name
     HAVING total_share != 0
     ORDER BY fp.name`,
    [tenantId]
  );

  const dist = overallDist[0] || {};
  const ipo = overallIpo[0] || {};
  const pend = pendingGross[0] || {};

  const num = (v) => Number(v ?? 0);

  return {
    overall: {
      grossIpoPnL: num(ipo.gross_ipo_pnl),
      ipoProfit: num(ipo.ipo_profit),
      ipoLoss: num(ipo.ipo_loss),
      grossDistributed: num(dist.gross_distributed),
      grossPending: num(pend.pending_gross),
      pendingCount: Number(pend.pending_count ?? 0),
      providerShare: num(dist.provider_share),
      managerShare: num(dist.manager_share),
      memberShare: num(dist.member_share),
      distributionCount: Number(dist.distribution_count ?? 0),
      distributedProfit: num(dist.gross_profit),
      distributedLoss: num(dist.gross_loss),
    },
    manager: {
      totalShare: num(dist.manager_share),
      label: 'Manager (you)',
    },
    byMember: byMember.map((r) => ({
      memberId: r.member_id,
      displayName: r.display_name,
      pan: r.pan,
      grossIpoPnL: num(r.gross_ipo_pnl),
      ipoCount: Number(r.ipo_count),
      grossDistributed: num(r.gross_distributed),
      pendingGross: num(r.pending_gross),
      providerShare: num(r.provider_share),
      managerShare: num(r.manager_share),
      memberShare: num(r.member_share),
      distributionCount: Number(r.distribution_count),
    })),
    byProvider: byProvider.map((r) => ({
      fundProviderId: r.fund_provider_id,
      providerName: r.provider_name,
      totalShare: num(r.total_share),
      profitShare: num(r.profit_share),
      lossShare: num(r.loss_share),
      grossPnLBase: num(r.gross_pnl_base),
      distributionCount: Number(r.distribution_count),
    })),
  };
}
