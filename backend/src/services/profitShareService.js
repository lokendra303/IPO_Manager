import { AppError } from '../middleware/errorHandler.js';
import {
  appendIpoIdIn,
  formatPeriodLabel,
  resolvePeriodIpoIds,
} from './profitAnalysisFilters.js';

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

function mapRuleTemplateRow(row) {
  const profitProviderPercent = Number(row.profit_provider_percent);
  const profitManagerPercent = Number(row.profit_manager_percent);
  const lossProviderPercent = Number(row.loss_provider_percent);
  const lossManagerPercent = Number(row.loss_manager_percent);
  const hasRule = profitProviderPercent + profitManagerPercent + lossProviderPercent + lossManagerPercent > 0;
  return {
    id: row.id,
    ruleName: row.rule_name?.trim() || row.provider_name,
    fundProviderId: row.fund_provider_id,
    providerName: row.provider_name,
    sortOrder: Number(row.sort_order ?? 0),
    hasRule,
    profitProviderPercent,
    profitManagerPercent,
    lossProviderPercent,
    lossManagerPercent,
  };
}

export async function listRuleTemplates(conn, tenantId) {
  const [rows] = await conn.query(
    `SELECT rt.*, fp.name AS provider_name
     FROM profit_share_rule_templates rt
     JOIN fund_providers fp ON fp.id = rt.fund_provider_id AND fp.tenant_id = rt.tenant_id
     WHERE rt.tenant_id = ?
     ORDER BY rt.sort_order, rt.rule_name, rt.id`,
    [tenantId]
  );
  return rows.map(mapRuleTemplateRow);
}

export async function getRuleTemplate(conn, tenantId, templateId) {
  const [rows] = await conn.query(
    `SELECT rt.*, fp.name AS provider_name
     FROM profit_share_rule_templates rt
     JOIN fund_providers fp ON fp.id = rt.fund_provider_id AND fp.tenant_id = rt.tenant_id
     WHERE rt.id = ? AND rt.tenant_id = ?`,
    [templateId, tenantId]
  );
  if (!rows.length) return null;
  return mapRuleTemplateRow(rows[0]);
}

export async function createRuleTemplate(conn, tenantId, {
  ruleName,
  fundProviderId,
  profitProviderPercent,
  profitManagerPercent,
  lossProviderPercent,
  lossManagerPercent,
  sortOrder,
}) {
  const pid = Number(fundProviderId);
  if (!pid) throw new AppError('Fund provider is required');

  const [fp] = await conn.query(
    'SELECT id, name FROM fund_providers WHERE id = ? AND tenant_id = ?',
    [pid, tenantId]
  );
  if (!fp.length) throw new AppError('Fund provider not found', 404);

  const percents = {
    profitProviderPercent,
    profitManagerPercent,
    lossProviderPercent,
    lossManagerPercent,
  };
  validateProfitLossPercents(percents);

  const name = ruleName?.trim() || fp[0].name;
  let order = Number(sortOrder);
  if (!Number.isFinite(order)) {
    const [maxRow] = await conn.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM profit_share_rule_templates WHERE tenant_id = ?',
      [tenantId]
    );
    order = Number(maxRow[0].next_order);
  }

  const [result] = await conn.query(
    `INSERT INTO profit_share_rule_templates
     (tenant_id, rule_name, fund_provider_id, profit_provider_percent, profit_manager_percent,
      loss_provider_percent, loss_manager_percent, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      name,
      pid,
      percents.profitProviderPercent,
      percents.profitManagerPercent,
      percents.lossProviderPercent,
      percents.lossManagerPercent,
      order,
    ]
  );

  return getRuleTemplate(conn, tenantId, result.insertId);
}

export async function updateRuleTemplate(conn, tenantId, templateId, fields) {
  const existing = await getRuleTemplate(conn, tenantId, templateId);
  if (!existing) throw new AppError('Rule template not found', 404);

  const updates = [];
  const values = [];

  if (fields.ruleName !== undefined) {
    updates.push('rule_name = ?');
    values.push(fields.ruleName?.trim() || existing.providerName);
  }
  if (fields.fundProviderId !== undefined) {
    const pid = Number(fields.fundProviderId);
    if (!pid) throw new AppError('Fund provider is required');
    const [fp] = await conn.query(
      'SELECT id FROM fund_providers WHERE id = ? AND tenant_id = ?',
      [pid, tenantId]
    );
    if (!fp.length) throw new AppError('Fund provider not found', 404);
    updates.push('fund_provider_id = ?');
    values.push(pid);
  }
  if (fields.sortOrder !== undefined) {
    updates.push('sort_order = ?');
    values.push(Number(fields.sortOrder));
  }
  const percentFields = [
    ['profit_provider_percent', 'profitProviderPercent'],
    ['profit_manager_percent', 'profitManagerPercent'],
    ['loss_provider_percent', 'lossProviderPercent'],
    ['loss_manager_percent', 'lossManagerPercent'],
  ];
  for (const [col, key] of percentFields) {
    if (fields[key] !== undefined) {
      updates.push(`${col} = ?`);
      values.push(Number(fields[key]));
    }
  }

  if (!updates.length) throw new AppError('No fields to update');

  const merged = {
    profitProviderPercent: fields.profitProviderPercent ?? existing.profitProviderPercent,
    profitManagerPercent: fields.profitManagerPercent ?? existing.profitManagerPercent,
    lossProviderPercent: fields.lossProviderPercent ?? existing.lossProviderPercent,
    lossManagerPercent: fields.lossManagerPercent ?? existing.lossManagerPercent,
  };
  if (
    fields.profitProviderPercent !== undefined
    || fields.profitManagerPercent !== undefined
    || fields.lossProviderPercent !== undefined
    || fields.lossManagerPercent !== undefined
  ) {
    validateProfitLossPercents(merged);
  }

  values.push(templateId, tenantId);
  await conn.query(
    `UPDATE profit_share_rule_templates SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
    values
  );

  return getRuleTemplate(conn, tenantId, templateId);
}

export async function deleteRuleTemplate(conn, tenantId, templateId) {
  const [result] = await conn.query(
    'DELETE FROM profit_share_rule_templates WHERE id = ? AND tenant_id = ?',
    [templateId, tenantId]
  );
  if (!result.affectedRows) throw new AppError('Rule template not found', 404);
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
    ruleName: r.rule_name?.trim() || r.provider_name,
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
    ipoId: row.ipo_id ?? null,
    ipoName: row.ipo_name ?? null,
    fundProviderId: row.fund_provider_id,
    providerName: row.provider_name,
    profitProviderPercent: Number(row.provider_percent),
    profitManagerPercent: Number(row.manager_percent),
    lossProviderPercent: Number(row.loss_provider_percent ?? 0),
    lossManagerPercent: Number(row.loss_manager_percent ?? 0),
    isActive: row.is_active == null ? true : Boolean(row.is_active),
  };
}

/** One active rule per member + IPO scope (ipo_id NULL = all IPOs). */
export async function setActiveMemberShareRule(conn, tenantId, memberId, ruleId) {
  const [rows] = await conn.query(
    `SELECT id, ipo_id FROM member_profit_shares
     WHERE id = ? AND member_id = ? AND tenant_id = ?`,
    [ruleId, memberId, tenantId]
  );
  if (!rows.length) throw new AppError('Share rule not found', 404);
  const ipoId = rows[0].ipo_id ?? null;
  await conn.query(
    `UPDATE member_profit_shares
     SET is_active = IF(id = ?, 1, 0)
     WHERE tenant_id = ? AND member_id = ? AND ipo_id <=> ?`,
    [ruleId, tenantId, memberId, ipoId]
  );
}

/** Rules for a specific IPO: IPO-specific active set if any, otherwise global (all IPOs) active rules. */
export function resolveRulesForIpo(allRules, ipoId) {
  const active = allRules.filter((r) => r.isActive !== false);
  const id = ipoId != null && ipoId !== '' ? Number(ipoId) : null;
  if (!id || Number.isNaN(id)) {
    return active.filter((r) => !r.ipoId);
  }
  const ipoSpecific = active.filter((r) => r.ipoId === id);
  if (ipoSpecific.length) return ipoSpecific;
  return active.filter((r) => !r.ipoId);
}

export async function resolveOptionalIpoId(conn, tenantId, ipoId) {
  if (ipoId == null || ipoId === '') return null;
  const id = Number(ipoId);
  if (!Number.isInteger(id) || id < 1) throw new AppError('Invalid IPO', 400);
  const [rows] = await conn.query(
    'SELECT id FROM ipos WHERE id = ? AND tenant_id = ?',
    [id, tenantId]
  );
  if (!rows.length) throw new AppError('IPO not found', 404);
  return id;
}

/** All share rules for a member (multiple allowed). */
export async function getMemberShareRules(conn, tenantId, memberId) {
  const [member] = await conn.query(
    'SELECT id FROM members WHERE id = ? AND tenant_id = ?',
    [memberId, tenantId]
  );
  if (!member.length) throw new AppError('Member not found', 404);

  const [rows] = await conn.query(
    `SELECT mps.*, fp.name AS provider_name, i.name AS ipo_name
     FROM member_profit_shares mps
     LEFT JOIN fund_providers fp ON fp.id = mps.fund_provider_id
     LEFT JOIN ipos i ON i.id = mps.ipo_id AND i.tenant_id = mps.tenant_id
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

function summarizeMemberShareRules(rules) {
  const activeRules = rules.filter((r) => r.isActive !== false);
  const globalRules = activeRules.filter((r) => !r.ipoId);
  const summaryRules = globalRules.length ? globalRules : activeRules;
  const profitP = summaryRules.reduce((s, r) => s + r.profitProviderPercent, 0);
  const profitM = summaryRules.reduce((s, r) => s + r.profitManagerPercent, 0);
  const lossP = summaryRules.reduce((s, r) => s + r.lossProviderPercent, 0);
  const lossM = summaryRules.reduce((s, r) => s + r.lossManagerPercent, 0);
  const providerNames = [...new Set(summaryRules.map((r) => r.providerName).filter(Boolean))];
  const hasRules = activeRules.length > 0;
  return {
    ruleCount: rules.length,
    activeRuleCount: activeRules.length,
    hasShareRule: hasRules,
    hasIpoSpecificRules: activeRules.some((r) => r.ipoId),
    rules,
    effectiveProviderName: providerNames.join(', ') || null,
    effectiveProfitProviderPercent: profitP,
    effectiveProfitManagerPercent: profitM,
    effectiveLossProviderPercent: lossP,
    effectiveLossManagerPercent: lossM,
    memberKeepsProfitPercent: Math.max(0, 100 - profitP - profitM),
    memberKeepsLossPercent: Math.max(0, 100 - lossP - lossM),
    ruleSource: hasRules ? 'member' : 'none',
  };
}

/** All members with share rules — two queries instead of N+1 per member. */
export async function listMembersWithShareRules(conn, tenantId) {
  const [members] = await conn.query(
    `SELECT m.id, m.display_name, m.pan, m.status, fp.name AS member_fund_provider_name
     FROM members m
     LEFT JOIN fund_providers fp ON fp.id = m.fund_provider_id
     WHERE m.tenant_id = ?
     ORDER BY m.sort_order, m.id`,
    [tenantId]
  );

  const [ruleRows] = await conn.query(
    `SELECT mps.*, fp.name AS provider_name, i.name AS ipo_name
     FROM member_profit_shares mps
     LEFT JOIN fund_providers fp ON fp.id = mps.fund_provider_id
     LEFT JOIN ipos i ON i.id = mps.ipo_id AND i.tenant_id = mps.tenant_id
     WHERE mps.tenant_id = ?
     ORDER BY mps.member_id, mps.sort_order, mps.id`,
    [tenantId]
  );

  const rulesByMember = new Map();
  for (const row of ruleRows) {
    const memberId = row.member_id;
    if (!rulesByMember.has(memberId)) rulesByMember.set(memberId, []);
    rulesByMember.get(memberId).push(mapMemberRuleRow(row));
  }

  return members.map((m) => {
    const rules = rulesByMember.get(m.id) || [];
    const summary = summarizeMemberShareRules(rules);
    return {
      memberId: m.id,
      displayName: m.display_name,
      pan: m.pan,
      status: m.status,
      memberFundProviderName: m.member_fund_provider_name || null,
      ...summary,
    };
  });
}

export async function addMemberShareRule(conn, tenantId, memberId, {
  ruleName,
  sortOrder,
  ipoId,
  fundProviderId,
  profitProviderPercent,
  profitManagerPercent,
  lossProviderPercent,
  lossManagerPercent,
}) {
  const [member] = await conn.query(
    'SELECT id, display_name FROM members WHERE id = ? AND tenant_id = ?',
    [memberId, tenantId]
  );
  if (!member.length) throw new AppError('Member not found', 404);

  const pid = Number(fundProviderId);
  if (!pid) throw new AppError('Fund provider is required');

  const [fp] = await conn.query(
    'SELECT id FROM fund_providers WHERE id = ? AND tenant_id = ?',
    [pid, tenantId]
  );
  if (!fp.length) throw new AppError('Fund provider not found', 404);

  const resolvedIpoId = await resolveOptionalIpoId(conn, tenantId, ipoId);

  const percents = {
    profitProviderPercent,
    profitManagerPercent,
    lossProviderPercent,
    lossManagerPercent,
  };
  validateProfitLossPercents(percents);

  let order = Number(sortOrder);
  if (!Number.isFinite(order)) {
    const [maxRow] = await conn.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM member_profit_shares WHERE member_id = ? AND tenant_id = ?',
      [memberId, tenantId]
    );
    order = Number(maxRow[0].next_order);
  }

  const [result] = await conn.query(
    `INSERT INTO member_profit_shares
     (tenant_id, member_id, ipo_id, rule_name, sort_order, fund_provider_id,
      provider_percent, manager_percent, loss_provider_percent, loss_manager_percent, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      tenantId,
      memberId,
      resolvedIpoId,
      ruleName?.trim() || 'New rule',
      order,
      pid,
      percents.profitProviderPercent,
      percents.profitManagerPercent,
      percents.lossProviderPercent,
      percents.lossManagerPercent,
    ]
  );

  await setActiveMemberShareRule(conn, tenantId, memberId, result.insertId);

  const { rules } = await getMemberShareRules(conn, tenantId, memberId);
  validateMemberRulesSet(rules);
  const created = rules.find((r) => r.id === result.insertId);
  return {
    rule: created || { id: result.insertId },
    displayName: member[0].display_name,
  };
}

/** Apply the same share rule to multiple members; failures are per-member, not rolled back across members. */
export async function applyBulkMemberShareRules(conn, tenantId, memberIds, rulePayload) {
  const applied = [];
  const failed = [];

  for (const rawId of memberIds) {
    const memberId = Number(rawId);
    if (!Number.isInteger(memberId) || memberId < 1) {
      failed.push({ memberId: rawId, displayName: null, error: 'Invalid member id' });
      continue;
    }
    try {
      const { rule, displayName } = await addMemberShareRule(conn, tenantId, memberId, rulePayload);
      applied.push({ memberId, displayName, ruleId: rule.id });
    } catch (err) {
      const [m] = await conn.query(
        'SELECT display_name FROM members WHERE id = ? AND tenant_id = ?',
        [memberId, tenantId]
      );
      failed.push({
        memberId,
        displayName: m[0]?.display_name || null,
        error: err.message || 'Failed to add rule',
      });
    }
  }

  return { applied, failed, appliedCount: applied.length, failedCount: failed.length };
}

function scopeLabelForRules(scopeRules) {
  const first = scopeRules[0];
  return first?.ipoId ? (first.ipoName || `IPO #${first.ipoId}`) : 'All IPOs';
}

export function validateMemberRulesSet(rules) {
  const activeRules = rules.filter((r) => r.isActive !== false);
  if (!activeRules.length) {
    throw new AppError('Add at least one active share rule for this member (or set a saved rule as active)');
  }

  const byScope = new Map();
  for (const r of activeRules) {
    const key = r.ipoId ?? 'global';
    if (!byScope.has(key)) byScope.set(key, []);
    byScope.get(key).push(r);
  }

  for (const scopeRules of byScope.values()) {
    const scopeName = scopeLabelForRules(scopeRules);
    if (scopeRules.length > 1) {
      throw new AppError(`Only one active rule allowed per IPO scope (${scopeName})`);
    }
    const r = scopeRules[0];
    const profitProvider = Number(r.profitProviderPercent);
    const profitManager = Number(r.profitManagerPercent);
    const lossProvider = Number(r.lossProviderPercent);
    const lossManager = Number(r.lossManagerPercent);

    if (profitProvider + profitManager > 100) {
      throw new AppError(
        `Profit shares for ${scopeName} (${profitProvider}% + ${profitManager}% manager) cannot exceed 100%`
      );
    }
    if (lossProvider + lossManager > 100) {
      throw new AppError(
        `Loss shares for ${scopeName} (${lossProvider}% + ${lossManager}% manager) cannot exceed 100%`
      );
    }
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

/** Manager/provider/member split for an application (stored distribution or live rules). */
export async function resolveApplicationProfitSplit(conn, tenantId, app) {
  const distribution = await getDistributionForApplication(conn, tenantId, app.id);
  if (distribution) {
    return {
      managerAmount: Number(distribution.manager_amount ?? 0),
      providerAmount: Number(distribution.provider_amount ?? 0),
      memberAmount: Number(distribution.member_amount ?? 0),
    };
  }

  let gross = app.profit_loss != null ? Number(app.profit_loss) : 0;
  if (!gross && app.withdrawal_money != null && app.amount != null) {
    gross = Math.round((Number(app.withdrawal_money) - Number(app.amount)) * 100) / 100;
  }
  if (!gross) {
    return { managerAmount: 0, providerAmount: 0, memberAmount: 0 };
  }

  const { rules: allRules } = await getMemberShareRules(conn, tenantId, app.member_id);
  const rules = resolveRulesForIpo(allRules, app.ipo_id);
  if (!rules.length) {
    return { managerAmount: 0, providerAmount: 0, memberAmount: gross };
  }

  const split = calculateMultiRuleSplit(gross, rules);
  return {
    managerAmount: split.totalManager,
    providerAmount: split.totalProvider,
    memberAmount: split.memberAmount,
  };
}

/** @deprecated Use getMemberShareRules — returns summary of global rules (or all if IPO-only) */
export async function getMemberShareRule(conn, tenantId, memberId) {
  const { rules, hasRules } = await getMemberShareRules(conn, tenantId, memberId);
  if (!hasRules) return emptyRule(null, null);

  const globalRules = rules.filter((r) => !r.ipoId);
  const summaryRules = globalRules.length ? globalRules : rules;

  const profitProviderPercent = summaryRules.reduce((s, r) => s + r.profitProviderPercent, 0);
  const profitManagerPercent = summaryRules.reduce((s, r) => s + r.profitManagerPercent, 0);
  const lossProviderPercent = summaryRules.reduce((s, r) => s + r.lossProviderPercent, 0);
  const lossManagerPercent = summaryRules.reduce((s, r) => s + r.lossManagerPercent, 0);
  const names = [...new Set(summaryRules.map((r) => r.providerName).filter(Boolean))];

  return {
    fundProviderId: summaryRules.length === 1 ? summaryRules[0].fundProviderId : null,
    providerName: names.length === 1 ? names[0] : names.join(', '),
    profitProviderPercent,
    profitManagerPercent,
    lossProviderPercent,
    lossManagerPercent,
    source: 'member',
    ruleCount: rules.length,
    hasIpoSpecificRules: rules.some((r) => r.ipoId),
    rules,
  };
}

function amountsMatch(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.01;
}

async function getDistributionForApplication(conn, tenantId, applicationId) {
  const [rows] = await conn.query(
    `SELECT psd.*, a.profit_loss, a.allotment_status, a.ipo_id, a.member_id,
            m.display_name, i.name AS ipo_name
     FROM profit_share_distributions psd
     JOIN ipo_applications a ON a.id = psd.ipo_application_id
     JOIN members m ON m.id = a.member_id
     JOIN ipos i ON i.id = a.ipo_id
     WHERE psd.ipo_application_id = ? AND psd.tenant_id = ?`,
    [applicationId, tenantId]
  );
  return rows[0] || null;
}

export async function distributionNeedsUpdate(conn, tenantId, app, distribution) {
  const gross = Number(app.profit_loss);
  if (!amountsMatch(distribution.gross_profit_loss, gross)) return true;

  const { rules: allRules } = await getMemberShareRules(conn, tenantId, app.member_id);
  const rules = resolveRulesForIpo(allRules, app.ipo_id);
  if (!rules.length) return false;

  const split = calculateMultiRuleSplit(gross, rules);
  return (
    !amountsMatch(distribution.provider_amount, split.totalProvider)
    || !amountsMatch(distribution.manager_amount, split.totalManager)
    || !amountsMatch(distribution.member_amount, split.memberAmount)
  );
}

/** Undo wallet/provider entries and remove a profit share distribution. */
export async function revokeProfitShareDistribution(conn, { tenantId, applicationId, userId }) {
  const distribution = await getDistributionForApplication(conn, tenantId, applicationId);
  if (!distribution) return { revoked: false, applicationId };

  const now = new Date();
  const managerAmount = Number(distribution.manager_amount ?? 0);

  // Manager share is normally credited only on Receive (inside RETURN_IN), not at split time.
  // Only reverse wallet cash when a legacy profit_share wallet credit exists for this app.
  if (managerAmount !== 0) {
    const [legacyCredits] = await conn.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM wallet_transactions
       WHERE tenant_id = ? AND ref_type = 'profit_share' AND ref_id = ?`,
      [tenantId, applicationId]
    );
    const legacyManagerInWallet = Number(legacyCredits[0]?.total ?? 0);
    if (Math.abs(legacyManagerInWallet) > 0.001) {
      const { applyWalletDelta } = await import('./walletService.js');
      await applyWalletDelta(conn, {
        tenantId,
        delta: -legacyManagerInWallet,
        type: 'ADJUSTMENT',
        refType: 'profit_share_reversal',
        refId: applicationId,
        txnDate: now,
        notes: `Reversal — manager share (${distribution.display_name}, ${distribution.ipo_name})`,
        userId,
        allowNegativeBalance: true,
      });
    }
  }

  const [ruleLines] = await conn.query(
    `SELECT psdr.*, fp.name AS provider_name
     FROM profit_share_distribution_rules psdr
     LEFT JOIN fund_providers fp ON fp.id = psdr.fund_provider_id
     WHERE psdr.distribution_id = ?`,
    [distribution.id]
  );

  for (const line of ruleLines) {
    const providerAmount = Number(line.provider_amount ?? 0);
    if (!line.fund_provider_id || providerAmount === 0) continue;

    const noteSuffix = `${distribution.display_name} (${distribution.ipo_name})`;
    const [providerTxns] = await conn.query(
      `SELECT id FROM provider_transactions
       WHERE tenant_id = ? AND fund_provider_id = ?
         AND account_label IN ('P&L Share', 'P&L Share (Loss)')
         AND ABS(COALESCE(provider_profit, 0) - ?) < 0.01
         AND notes LIKE ?
       ORDER BY id DESC LIMIT 1`,
      [tenantId, line.fund_provider_id, providerAmount, `%${noteSuffix}%`]
    );

    if (providerTxns.length) {
      await conn.query('DELETE FROM provider_transactions WHERE id = ?', [providerTxns[0].id]);
    } else {
      await conn.query(
        `INSERT INTO provider_transactions
         (fund_provider_id, tenant_id, amount, txn_date, account_label, notes, provider_profit, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          line.fund_provider_id,
          tenantId,
          0,
          now,
          'P&L Share Reversal',
          `Reversal — ${line.rule_name} — ${noteSuffix}`,
          -providerAmount,
          userId,
        ]
      );
    }
  }

  await conn.query(
    'DELETE FROM profit_share_distributions WHERE id = ? AND tenant_id = ?',
    [distribution.id, tenantId]
  );

  return { revoked: true, applicationId, distributionId: distribution.id };
}

export async function isIpoFinancialsFrozen(conn, tenantId, ipoId) {
  const [rows] = await conn.query(
    'SELECT status FROM ipos WHERE id = ? AND tenant_id = ?',
    [ipoId, tenantId]
  );
  return rows[0]?.status === 'CLOSED';
}

/** Block application edits, receive, undo, etc. when IPO is closed or invalid. */
export async function assertIpoApplicationsEditable(conn, tenantId, ipoId) {
  const [rows] = await conn.query(
    `SELECT status, COALESCE(is_invalid, 0) AS is_invalid
     FROM ipos WHERE id = ? AND tenant_id = ?`,
    [ipoId, tenantId]
  );
  if (!rows.length) throw new AppError('IPO not found', 404);
  if (rows[0].status === 'CLOSED') {
    throw new AppError('IPO is closed. Reopen the IPO to edit applications or perform actions.');
  }
  if (rows[0].is_invalid) {
    throw new AppError('Invalid IPO. Restore it from the IPO list to edit applications or perform actions.');
  }
}

/** Auto-apply member share rules when app is ALLOTED with non-zero P&L (skips if already distributed). */
export async function tryAutoDistributeApplication(conn, { tenantId, applicationId, userId }) {
  const [app] = await conn.query(
    `SELECT allotment_status, profit_loss, withdrawal_money, member_id, ipo_id
     FROM ipo_applications WHERE id = ? AND tenant_id = ?`,
    [applicationId, tenantId]
  );
  if (!app.length) return { applicationId, skipped: true, reason: 'Application not found' };

  if (await isIpoFinancialsFrozen(conn, tenantId, app[0].ipo_id)) {
    return { applicationId, skipped: true, reason: 'IPO is closed — reopen to run P&L splits' };
  }

  const existing = await getDistributionForApplication(conn, tenantId, applicationId);
  if (existing && app[0].allotment_status !== 'ALLOTED') {
    await revokeProfitShareDistribution(conn, { tenantId, applicationId, userId });
    return { applicationId, skipped: true, reason: 'Not allotted — prior share reversed' };
  }
  if (existing && (app[0].withdrawal_money == null || app[0].profit_loss == null || Number(app[0].profit_loss) === 0)) {
    await revokeProfitShareDistribution(conn, { tenantId, applicationId, userId });
    return { applicationId, skipped: true, reason: 'No P&L set — prior share reversed' };
  }
  if (app[0].allotment_status !== 'ALLOTED') {
    return { applicationId, skipped: true, reason: 'Not allotted' };
  }
  if (app[0].withdrawal_money == null || app[0].profit_loss == null || Number(app[0].profit_loss) === 0) {
    return { applicationId, skipped: true, reason: 'No P&L set' };
  }
  if (existing && !(await distributionNeedsUpdate(conn, tenantId, app[0], existing))) {
    return { applicationId, skipped: true, reason: 'Already distributed' };
  }
  if (existing) {
    await revokeProfitShareDistribution(conn, { tenantId, applicationId, userId });
  }

  const results = await distributeProfitShares(conn, {
    tenantId,
    applicationIds: [applicationId],
    userId,
  });
  return results[0] || { applicationId, skipped: true, reason: 'No distribution result' };
}

export async function distributeProfitShares(conn, { tenantId, ipoId, applicationIds, userId }) {
  if (ipoId && (await isIpoFinancialsFrozen(conn, tenantId, ipoId))) {
    throw new AppError('Cannot distribute P&L for a closed IPO. Reopen the IPO first.');
  }

  let query = `
    SELECT a.*, i.name as ipo_name, m.display_name, i.status AS ipo_status
    FROM ipo_applications a
    JOIN ipos i ON i.id = a.ipo_id
    JOIN members m ON m.id = a.member_id
    WHERE a.tenant_id = ? AND a.allotment_status = 'ALLOTED' AND a.withdrawal_money IS NOT NULL AND a.profit_loss IS NOT NULL
      AND i.status = 'OPEN'
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
    const existing = await getDistributionForApplication(conn, tenantId, app.id);
    if (existing && !(await distributionNeedsUpdate(conn, tenantId, app, existing))) {
      results.push({ applicationId: app.id, memberName: app.display_name, skipped: true, reason: 'Already distributed' });
      continue;
    }
    if (existing) {
      await revokeProfitShareDistribution(conn, { tenantId, applicationId: app.id, userId });
    }

    const { rules: allRules } = await getMemberShareRules(conn, tenantId, app.member_id);
    const rules = resolveRulesForIpo(allRules, app.ipo_id);

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

    if (!rules.length) {
      const ipoHint = app.ipo_name ? ` for ${app.ipo_name}` : '';
      results.push({
        applicationId: app.id,
        memberName: app.display_name,
        skipped: true,
        reason: `No share rules for this member${ipoHint} (Profit Sharing)`,
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
        // Accrue profit separately — do not increase provider principal until reinvested.
        await conn.query(
          `INSERT INTO provider_transactions
           (fund_provider_id, tenant_id, amount, txn_date, account_label, notes, provider_profit, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            line.fundProviderId,
            tenantId,
            0,
            now,
            isLoss ? 'P&L Share (Loss)' : 'P&L Share',
            `${line.ruleName} — ${app.display_name} (${app.ipo_name})`,
            line.providerAmount,
            userId,
          ]
        );
      }
    }

    // Manager share is credited to wallet when fund return is received (not here).

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

/** Preview pending P&L splits and rows that need re-split after rule changes. */
export async function previewProfitShares(conn, tenantId, { ipoId, applicationIds } = {}) {
  let query = `
    SELECT a.id, a.member_id, a.ipo_id, a.profit_loss, m.display_name, i.name as ipo_name,
           psd.id AS distribution_id
    FROM ipo_applications a
    JOIN members m ON m.id = a.member_id
    JOIN ipos i ON i.id = a.ipo_id
    LEFT JOIN profit_share_distributions psd ON psd.ipo_application_id = a.id
    WHERE a.tenant_id = ? AND a.allotment_status = 'ALLOTED'
      AND a.withdrawal_money IS NOT NULL AND a.profit_loss IS NOT NULL
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
  const previews = [];

  for (const app of apps) {
    const gross = Number(app.profit_loss);
    const { rules: allRules } = await getMemberShareRules(conn, tenantId, app.member_id);
    const rules = resolveRulesForIpo(allRules, app.ipo_id);
    let configWarning = null;
    if (!rules.length) {
      const ipoHint = app.ipo_name ? ` for ${app.ipo_name}` : '';
      configWarning = `Add share rule for this member${ipoHint} under Profit Sharing`;
    }
    let split;
    try {
      split = calculateMultiRuleSplit(gross, rules);
    } catch (e) {
      configWarning = e.message || 'Invalid share rules';
      split = {
        pnlType: gross >= 0 ? 'PROFIT' : 'LOSS',
        totalProvider: 0,
        totalManager: 0,
        memberAmount: gross,
        lines: [],
      };
    }

    let needsResplit = false;
    if (app.distribution_id) {
      const existing = await getDistributionForApplication(conn, tenantId, app.id);
      needsResplit = existing ? await distributionNeedsUpdate(conn, tenantId, app, existing) : false;
      if (!needsResplit) continue;
    }

    previews.push({
      applicationId: app.id,
      memberName: app.display_name,
      ipoName: app.ipo_name,
      grossProfitLoss: gross,
      pnlType: split.pnlType,
      ruleCount: rules.length,
      ruleSource: rules.length ? 'member' : 'none',
      ruleLines: split.lines,
      providerAmount: split.totalProvider,
      managerAmount: split.totalManager,
      memberAmount: split.memberAmount,
      configWarning,
      needsResplit,
    });
  }

  return previews;
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
     WHERE a.tenant_id = ? AND a.allotment_status = 'ALLOTED' AND a.withdrawal_money IS NOT NULL AND a.profit_loss IS NOT NULL AND psd.id IS NULL`,
    [tenantId]
  );

  const conn = await pool.getConnection();
  const enrichedDistributions = [];
  try {
    for (const d of distributions) {
      const [appRows] = await conn.query(
        `SELECT a.* FROM ipo_applications a WHERE a.id = ? AND a.tenant_id = ?`,
        [d.ipo_application_id, tenantId]
      );
      const app = appRows[0];
      const needsResplit = app
        ? await distributionNeedsUpdate(conn, tenantId, app, d)
        : false;
      enrichedDistributions.push({
        ...d,
        ruleLines: linesByDist[d.id] || [],
        needsResplit,
      });
    }
  } finally {
    conn.release();
  }

  return {
    distributions: enrichedDistributions,
    byProvider,
    totals: totals[0],
    pending,
  };
}

export async function getProfitTotalsReport(pool, tenantId, filters = {}) {
  const ipoIds = await resolvePeriodIpoIds(pool, tenantId, filters);

  const empty = () => ({
    overall: {
      grossIpoPnL: 0,
      ipoProfit: 0,
      ipoLoss: 0,
      grossDistributed: 0,
      grossPending: 0,
      pendingCount: 0,
      providerShare: 0,
      managerShare: 0,
      memberShare: 0,
      distributionCount: 0,
      distributedProfit: 0,
      distributedLoss: 0,
      managerProfit: 0,
      managerLoss: 0,
    },
    manager: {
      totalShare: 0,
      profitShare: 0,
      lossShare: 0,
      label: 'Manager (you)',
    },
    byMember: [],
    byProvider: [],
  });

  if (Array.isArray(ipoIds) && ipoIds.length === 0) {
    return empty();
  }

  const distParams = [tenantId];
  const distIpoSql = appendIpoIdIn('a.ipo_id', ipoIds, distParams);
  const [overallDist] = await pool.query(
    `SELECT
       COUNT(*) as distribution_count,
       COALESCE(SUM(psd.gross_profit_loss), 0) as gross_distributed,
       COALESCE(SUM(psd.provider_amount), 0) as provider_share,
       COALESCE(SUM(psd.manager_amount), 0) as manager_share,
       COALESCE(SUM(psd.member_amount), 0) as member_share,
       COALESCE(SUM(CASE WHEN psd.pnl_type = 'PROFIT' THEN psd.gross_profit_loss ELSE 0 END), 0) as gross_profit,
       COALESCE(SUM(CASE WHEN psd.pnl_type = 'LOSS' THEN psd.gross_profit_loss ELSE 0 END), 0) as gross_loss,
       COALESCE(SUM(CASE WHEN psd.pnl_type = 'PROFIT' THEN psd.manager_amount ELSE 0 END), 0) as manager_profit,
       COALESCE(SUM(CASE WHEN psd.pnl_type = 'LOSS' THEN psd.manager_amount ELSE 0 END), 0) as manager_loss
     FROM profit_share_distributions psd
     JOIN ipo_applications a ON a.id = psd.ipo_application_id
     WHERE psd.tenant_id = ?${distIpoSql}`,
    distParams
  );

  const ipoParams = [tenantId];
  const ipoFilterSql = appendIpoIdIn('ipo_id', ipoIds, ipoParams);
  const [overallIpo] = await pool.query(
    `SELECT
       COALESCE(SUM(profit_loss), 0) as gross_ipo_pnl,
       COALESCE(SUM(CASE WHEN profit_loss > 0 THEN profit_loss ELSE 0 END), 0) as ipo_profit,
       COALESCE(SUM(CASE WHEN profit_loss < 0 THEN profit_loss ELSE 0 END), 0) as ipo_loss
     FROM ipo_applications
     WHERE tenant_id = ? AND allotment_status = 'ALLOTED' AND withdrawal_money IS NOT NULL AND profit_loss IS NOT NULL${ipoFilterSql}`,
    ipoParams
  );

  const pendParams = [tenantId];
  const pendIpoSql = appendIpoIdIn('a.ipo_id', ipoIds, pendParams);
  const [pendingGross] = await pool.query(
    `SELECT COALESCE(SUM(a.profit_loss), 0) as pending_gross, COUNT(*) as pending_count
     FROM ipo_applications a
     LEFT JOIN profit_share_distributions psd ON psd.ipo_application_id = a.id
     WHERE a.tenant_id = ? AND a.allotment_status = 'ALLOTED' AND a.withdrawal_money IS NOT NULL AND a.profit_loss IS NOT NULL AND psd.id IS NULL${pendIpoSql}`,
    pendParams
  );

  const memberAppParams = [tenantId];
  const memberAppIpoSql = appendIpoIdIn('ipo_id', ipoIds, memberAppParams);
  const memberDistParams = [tenantId];
  const memberDistIpoSql = appendIpoIdIn('a.ipo_id', ipoIds, memberDistParams);
  const memberPendParams = [tenantId];
  const memberPendIpoSql = appendIpoIdIn('a.ipo_id', ipoIds, memberPendParams);
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
       WHERE tenant_id = ? AND allotment_status = 'ALLOTED' AND withdrawal_money IS NOT NULL AND profit_loss IS NOT NULL${memberAppIpoSql}
       GROUP BY member_id
     ) app ON app.member_id = m.id
     LEFT JOIN (
       SELECT psd.member_id,
              SUM(psd.gross_profit_loss) AS gross_distributed,
              SUM(psd.provider_amount) AS provider_share,
              SUM(psd.manager_amount) AS manager_share,
              SUM(psd.member_amount) AS member_share,
              COUNT(*) AS distribution_count
       FROM profit_share_distributions psd
       JOIN ipo_applications a ON a.id = psd.ipo_application_id
       WHERE psd.tenant_id = ?${memberDistIpoSql}
       GROUP BY psd.member_id
     ) dist ON dist.member_id = m.id
     LEFT JOIN (
       SELECT a.member_id, SUM(a.profit_loss) AS pending_gross
       FROM ipo_applications a
       LEFT JOIN profit_share_distributions psd ON psd.ipo_application_id = a.id
       WHERE a.tenant_id = ? AND a.allotment_status = 'ALLOTED' AND a.withdrawal_money IS NOT NULL AND a.profit_loss IS NOT NULL AND psd.id IS NULL${memberPendIpoSql}
       GROUP BY a.member_id
     ) pend ON pend.member_id = m.id
     WHERE m.tenant_id = ?
     HAVING gross_ipo_pnl != 0 OR gross_distributed != 0 OR pending_gross != 0
     ORDER BY m.sort_order, m.id`,
    [...memberAppParams, ...memberDistParams, ...memberPendParams, tenantId]
  );

  const providerParams = [tenantId];
  const providerIpoSql = appendIpoIdIn('a.ipo_id', ipoIds, providerParams);
  const [byProviderRows] = await pool.query(
    ipoIds == null
      ? `SELECT fp.id AS fund_provider_id, fp.name AS provider_name,
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
       ORDER BY fp.name`
      : `SELECT fp.id AS fund_provider_id, fp.name AS provider_name,
              COALESCE(SUM(psdr.provider_amount), 0) AS total_share,
              COALESCE(SUM(CASE WHEN psd.pnl_type = 'PROFIT' THEN psdr.provider_amount ELSE 0 END), 0) AS profit_share,
              COALESCE(SUM(CASE WHEN psd.pnl_type = 'LOSS' THEN psdr.provider_amount ELSE 0 END), 0) AS loss_share,
              COUNT(DISTINCT psdr.id) AS distribution_count
       FROM fund_providers fp
       INNER JOIN profit_share_distribution_rules psdr ON psdr.fund_provider_id = fp.id
       INNER JOIN profit_share_distributions psd ON psd.id = psdr.distribution_id AND psd.tenant_id = fp.tenant_id
       INNER JOIN ipo_applications a ON a.id = psd.ipo_application_id
       WHERE fp.tenant_id = ?${providerIpoSql}
       GROUP BY fp.id, fp.name
       HAVING total_share != 0
       ORDER BY fp.name`,
    providerParams
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
      managerProfit: num(dist.manager_profit),
      managerLoss: num(dist.manager_loss),
    },
    manager: {
      totalShare: num(dist.manager_share),
      profitShare: num(dist.manager_profit),
      lossShare: num(dist.manager_loss),
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
    byProvider: byProviderRows.map((r) => ({
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

/**
 * Profit analysis: revenue-style split (member / manager / provider),
 * member-wise detail, and sub-group leader rollups (members keep profit attribution;
 * leader section shows each member’s share + group totals).
 * @param {{ year?: number|null, months?: number[] }} [filters]
 */
export async function getProfitAnalysisReport(pool, tenantId, filters = {}) {
  const totals = await getProfitTotalsReport(pool, tenantId, filters);
  const ipoIds = await resolvePeriodIpoIds(pool, tenantId, filters);
  const periodLabel = formatPeriodLabel(filters);
  const num = (v) => Number(v ?? 0);

  const [groups] = await pool.query(
    `SELECT mg.id, mg.name, mg.owner_member_id, mg.owner_external_name, mg.owner_external_pan,
            owner.display_name AS owner_display_name, owner.pan AS owner_pan
     FROM member_groups mg
     LEFT JOIN members owner ON owner.id = mg.owner_member_id
     WHERE mg.tenant_id = ?
     ORDER BY mg.sort_order, mg.id`,
    [tenantId]
  );

  const [groupMembers] = await pool.query(
    `SELECT m.id, m.display_name, m.pan, m.status, m.member_group_id, m.sort_order
     FROM members m
     WHERE m.tenant_id = ? AND m.member_group_id IS NOT NULL
     ORDER BY m.sort_order, m.id`,
    [tenantId]
  );

  const memberShareMap = Object.fromEntries(
    (totals.byMember || []).map((r) => [r.memberId, r])
  );

  const membersByGroup = {};
  for (const m of groupMembers) {
    const gid = m.member_group_id;
    if (!membersByGroup[gid]) membersByGroup[gid] = [];
    membersByGroup[gid].push(m);
  }

  const emptyShare = () => ({
    grossIpoPnL: 0,
    ipoCount: 0,
    grossDistributed: 0,
    pendingGross: 0,
    providerShare: 0,
    managerShare: 0,
    memberShare: 0,
    distributionCount: 0,
  });

  const subGroups = groups.map((g) => {
    const members = (membersByGroup[g.id] || []).map((m) => {
      const share = memberShareMap[m.id] || emptyShare();
      return {
        memberId: m.id,
        displayName: m.display_name,
        pan: m.pan,
        status: m.status,
        isLeader: Number(m.id) === Number(g.owner_member_id),
        ...share,
      };
    });

    const groupTotals = members.reduce(
      (acc, m) => ({
        grossIpoPnL: acc.grossIpoPnL + m.grossIpoPnL,
        ipoCount: acc.ipoCount + m.ipoCount,
        grossDistributed: acc.grossDistributed + m.grossDistributed,
        pendingGross: acc.pendingGross + m.pendingGross,
        providerShare: acc.providerShare + m.providerShare,
        managerShare: acc.managerShare + m.managerShare,
        memberShare: acc.memberShare + m.memberShare,
        distributionCount: acc.distributionCount + m.distributionCount,
      }),
      emptyShare()
    );

    return {
      groupId: g.id,
      groupName: g.name,
      leaderMemberId: g.owner_member_id,
      leaderDisplayName: g.owner_display_name ?? g.owner_external_name?.trim() ?? null,
      leaderPan: g.owner_pan ?? g.owner_external_pan ?? null,
      memberCount: members.length,
      totals: groupTotals,
      members,
    };
  }).filter((g) => g.memberCount > 0);

  const segParams = [tenantId];
  const segIpoSql = appendIpoIdIn('a.ipo_id', ipoIds, segParams);
  const [bySegment] = await pool.query(
    `SELECT COALESCE(i.ipo_segment, 'MAINBOARD') AS ipo_segment,
            COALESCE(SUM(psd.gross_profit_loss), 0) AS gross_distributed,
            COALESCE(SUM(psd.provider_amount), 0) AS provider_share,
            COALESCE(SUM(psd.manager_amount), 0) AS manager_share,
            COALESCE(SUM(psd.member_amount), 0) AS member_share,
            COUNT(psd.id) AS distribution_count
     FROM profit_share_distributions psd
     JOIN ipo_applications a ON a.id = psd.ipo_application_id
     JOIN ipos i ON i.id = a.ipo_id
     WHERE psd.tenant_id = ?${segIpoSql}
     GROUP BY COALESCE(i.ipo_segment, 'MAINBOARD')
     ORDER BY ipo_segment`,
    segParams
  );

  const catParams = [tenantId];
  const catIpoSql = appendIpoIdIn('a.ipo_id', ipoIds, catParams);
  const [byCategory] = await pool.query(
    `SELECT COALESCE(a.investor_category, 'RII') AS investor_category,
            COALESCE(SUM(psd.gross_profit_loss), 0) AS gross_distributed,
            COALESCE(SUM(psd.provider_amount), 0) AS provider_share,
            COALESCE(SUM(psd.manager_amount), 0) AS manager_share,
            COALESCE(SUM(psd.member_amount), 0) AS member_share,
            COUNT(psd.id) AS distribution_count
     FROM profit_share_distributions psd
     JOIN ipo_applications a ON a.id = psd.ipo_application_id
     WHERE psd.tenant_id = ?${catIpoSql}
     GROUP BY COALESCE(a.investor_category, 'RII')
     ORDER BY investor_category`,
    catParams
  );

  const scopeParams = [tenantId];
  const scopeIpoSql = appendIpoIdIn('a.ipo_id', ipoIds, scopeParams);
  const [[ipoScope]] = await pool.query(
    `SELECT
       COUNT(DISTINCT a.ipo_id) AS ipo_count,
       COUNT(a.id) AS allotted_app_count,
       SUM(CASE WHEN a.profit_loss > 0.005 THEN 1 ELSE 0 END) AS profit_apps,
       SUM(CASE WHEN a.profit_loss < -0.005 THEN 1 ELSE 0 END) AS loss_apps,
       SUM(CASE WHEN ABS(a.profit_loss) <= 0.005 THEN 1 ELSE 0 END) AS flat_apps,
       COUNT(DISTINCT CASE WHEN psd.id IS NOT NULL THEN a.ipo_id END) AS ipos_with_splits
     FROM ipo_applications a
     LEFT JOIN profit_share_distributions psd ON psd.ipo_application_id = a.id
     JOIN ipos i ON i.id = a.ipo_id AND COALESCE(i.is_invalid, 0) = 0
     WHERE a.tenant_id = ?
       AND a.allotment_status = 'ALLOTED'
       AND a.withdrawal_money IS NOT NULL
       AND a.profit_loss IS NOT NULL${scopeIpoSql}`,
    scopeParams
  );

  // Active applications = distinct ACTIVE members who applied on report IPOs
  // (team application base). Profit/loss counts stay at allotted-app level.
  const activeOuterParams = [tenantId];
  const activeOuterIpoSql = appendIpoIdIn('a.ipo_id', ipoIds, activeOuterParams);
  const activeInnerParams = [tenantId];
  const activeInnerIpoSql = appendIpoIdIn('a2.ipo_id', ipoIds, activeInnerParams);
  const [[activeScope]] = await pool.query(
    `SELECT COUNT(DISTINCT a.member_id) AS application_count
     FROM ipo_applications a
     JOIN members m ON m.id = a.member_id AND m.status = 'ACTIVE'
     JOIN ipos i ON i.id = a.ipo_id AND COALESCE(i.is_invalid, 0) = 0
     WHERE a.tenant_id = ?
       AND a.allotment_status <> 'NOT_APPLIED'${activeOuterIpoSql}
       AND a.ipo_id IN (
         SELECT DISTINCT a2.ipo_id
         FROM ipo_applications a2
         JOIN ipos i2 ON i2.id = a2.ipo_id AND COALESCE(i2.is_invalid, 0) = 0
         WHERE a2.tenant_id = ?
           AND a2.allotment_status = 'ALLOTED'
           AND a2.withdrawal_money IS NOT NULL
           AND a2.profit_loss IS NOT NULL${activeInnerIpoSql}
       )`,
    [...activeOuterParams, ...activeInnerParams]
  );

  // IPO coverage in period (or all time): every IPO the team applied to vs those that made profit.
  const lifeProfitParams = [tenantId];
  const lifeProfitIpoSql = appendIpoIdIn('a.ipo_id', ipoIds, lifeProfitParams);
  const lifeLossParams = [tenantId];
  const lifeLossIpoSql = appendIpoIdIn('a.ipo_id', ipoIds, lifeLossParams);
  const lifeOuterParams = [tenantId];
  const lifeOuterIpoSql = appendIpoIdIn('i.id', ipoIds, lifeOuterParams);
  const [ipoLifeRows] = await pool.query(
    `SELECT
       COUNT(*) AS ipos_applied,
       SUM(CASE WHEN profit_ipos.ipo_id IS NOT NULL THEN 1 ELSE 0 END) AS ipos_profit,
       SUM(CASE WHEN loss_ipos.ipo_id IS NOT NULL THEN 1 ELSE 0 END) AS ipos_loss
     FROM ipos i
     LEFT JOIN (
       SELECT DISTINCT a.ipo_id
       FROM ipo_applications a
       WHERE a.tenant_id = ?
         AND a.profit_loss > 0.005${lifeProfitIpoSql}
     ) profit_ipos ON profit_ipos.ipo_id = i.id
     LEFT JOIN (
       SELECT DISTINCT a.ipo_id
       FROM ipo_applications a
       WHERE a.tenant_id = ?
         AND a.profit_loss < -0.005${lifeLossIpoSql}
     ) loss_ipos ON loss_ipos.ipo_id = i.id
     WHERE i.tenant_id = ?
       AND COALESCE(i.is_invalid, 0) = 0${lifeOuterIpoSql}
       AND EXISTS (
         SELECT 1 FROM ipo_applications a
         WHERE a.ipo_id = i.id
           AND a.tenant_id = i.tenant_id
           AND a.allotment_status <> 'NOT_APPLIED'
       )`,
    [...lifeProfitParams, ...lifeLossParams, ...lifeOuterParams]
  );

  const ungroupedMembers = (totals.byMember || []).filter((m) => {
    const inGroup = groupMembers.some((gm) => Number(gm.id) === Number(m.memberId));
    return !inGroup;
  });

  const membersEnriched = (totals.byMember || []).map((m) => {
    const gm = groupMembers.find((x) => Number(x.id) === Number(m.memberId));
    const group = gm ? groups.find((g) => Number(g.id) === Number(gm.member_group_id)) : null;
    return {
      ...m,
      memberGroupId: group?.id ?? null,
      memberGroupName: group?.name ?? null,
      isGroupLeader: group ? Number(group.owner_member_id) === Number(m.memberId) : false,
    };
  });

  const ipoCount = Number(ipoScope?.ipo_count ?? 0);
  const applicationCount = Number(activeScope?.application_count ?? 0);
  const allottedAppCount = Number(ipoScope?.allotted_app_count ?? 0);
  const profitApps = Number(ipoScope?.profit_apps ?? 0);
  const lossApps = Number(ipoScope?.loss_apps ?? 0);
  const flatApps = Number(ipoScope?.flat_apps ?? 0);
  const iposWithSplits = Number(ipoScope?.ipos_with_splits ?? 0);
  const iposApplied = Number(ipoLifeRows[0]?.ipos_applied ?? 0);
  const iposProfit = Number(ipoLifeRows[0]?.ipos_profit ?? 0);
  const iposLoss = Number(ipoLifeRows[0]?.ipos_loss ?? 0);

  return {
    overall: {
      ...totals.overall,
      ipoCount,
      applicationCount,
      allottedAppCount,
      profitApps,
      lossApps,
      flatApps,
      iposWithSplits,
      iposApplied,
      iposProfit,
      iposLoss,
    },
    manager: totals.manager,
    providers: totals.byProvider || [],
    members: membersEnriched,
    ungroupedMembers,
    subGroups,
    bySegment: bySegment.map((r) => ({
      ipoSegment: r.ipo_segment,
      label: r.ipo_segment === 'SME' ? 'SME' : 'Mainboard',
      grossDistributed: num(r.gross_distributed),
      providerShare: num(r.provider_share),
      managerShare: num(r.manager_share),
      memberShare: num(r.member_share),
      distributionCount: Number(r.distribution_count),
    })),
    byCategory: byCategory.map((r) => ({
      investorCategory: r.investor_category,
      label: r.investor_category,
      grossDistributed: num(r.gross_distributed),
      providerShare: num(r.provider_share),
      managerShare: num(r.manager_share),
      memberShare: num(r.member_share),
      distributionCount: Number(r.distribution_count),
    })),
    revenue: {
      memberShare: num(totals.overall?.memberShare),
      managerShare: num(totals.overall?.managerShare),
      providerShare: num(totals.overall?.providerShare),
      grossDistributed: num(totals.overall?.grossDistributed),
      pendingGross: num(totals.overall?.grossPending),
      ipoCount,
      applicationCount,
      allottedAppCount,
      profitApps,
      lossApps,
      flatApps,
      iposApplied,
      iposProfit,
      iposLoss,
    },
    reportScope: {
      ipoCount,
      applicationCount,
      allottedAppCount,
      profitApps,
      lossApps,
      flatApps,
      iposWithSplits,
      iposApplied,
      iposProfit,
      iposLoss,
      label: ipoCount === 1 ? '1 IPO' : `${ipoCount} IPOs`,
      applicationsLabel:
        applicationCount === 1
          ? '1 active application'
          : `${applicationCount} active applications`,
      iposAppliedLabel:
        iposApplied === 1 ? '1 IPO applied' : `${iposApplied} IPOs applied`,
      iposProfitLabel:
        iposProfit === 1 ? '1 IPO gave profit' : `${iposProfit} IPOs gave profit`,
      filters: {
        year: filters.year ?? null,
        months: filters.months || [],
        label: periodLabel,
      },
      periodLabel,
    },
  };
}

