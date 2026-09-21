import { AppError } from '../middleware/errorHandler.js';
import { validateProfitLossPercents } from './profitShareService.js';

export const MISSING_IPO_SHARE_RULE = 'Select a share template for this IPO';
export const MEMBER_NOT_ON_SHARE_RULE = 'This member is not on the selected share rule';
export const CONTRADICTING_SHARE_RULES = 'Selected share rules contradict';

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function memberKeepPercent(providerPercent, managerPercent) {
  return Math.max(0, 100 - num(providerPercent) - num(managerPercent));
}

export function mapShareRuleRow(row, members = []) {
  const profitProviderPercent = num(row.profit_provider_percent);
  const profitManagerPercent = num(row.profit_manager_percent);
  const lossProviderPercent = num(row.loss_provider_percent);
  const lossManagerPercent = num(row.loss_manager_percent);
  const mappedMembers = members.map((m) => ({
    memberId: m.member_id ?? m.memberId,
    displayName: m.display_name ?? m.displayName ?? null,
    pan: m.pan ?? null,
    status: m.status ?? null,
  }));
  return {
    id: row.id,
    ruleName: row.rule_name?.trim() || row.provider_name,
    fundProviderId: row.fund_provider_id,
    providerName: row.provider_name,
    sortOrder: num(row.sort_order),
    profitProviderPercent,
    profitManagerPercent,
    lossProviderPercent,
    lossManagerPercent,
    profitMemberPercent: memberKeepPercent(profitProviderPercent, profitManagerPercent),
    lossMemberPercent: memberKeepPercent(lossProviderPercent, lossManagerPercent),
    hasRule: true,
    members: mappedMembers,
    memberIds: mappedMembers.map((m) => Number(m.memberId)),
    memberCount: mappedMembers.length,
  };
}

/** Shape expected by calculateMultiRuleSplit. */
export function shareRuleToSplitRules(rule) {
  if (!rule) return [];
  return [{
    id: rule.id,
    ruleName: rule.ruleName,
    fundProviderId: rule.fundProviderId,
    providerName: rule.providerName,
    profitProviderPercent: rule.profitProviderPercent,
    profitManagerPercent: rule.profitManagerPercent,
    lossProviderPercent: rule.lossProviderPercent,
    lossManagerPercent: rule.lossManagerPercent,
    isActive: true,
    ipoId: null,
  }];
}

export function asShareRuleList(rulesOrRule) {
  if (!rulesOrRule) return [];
  return Array.isArray(rulesOrRule) ? rulesOrRule.filter(Boolean) : [rulesOrRule];
}

export function isMemberOnShareRule(rule, memberId) {
  if (!rule) return false;
  const id = Number(memberId);
  return (rule.memberIds || []).some((mid) => Number(mid) === id);
}

export function findShareRuleConflicts(rules) {
  const byMember = new Map();
  for (const rule of asShareRuleList(rules)) {
    for (const mid of rule.memberIds || []) {
      const id = Number(mid);
      const list = byMember.get(id) || [];
      list.push(rule);
      byMember.set(id, list);
    }
  }
  const conflicts = [];
  for (const [memberId, matched] of byMember) {
    if (matched.length < 2) continue;
    const displayName = matched
      .flatMap((r) => r.members || [])
      .find((m) => Number(m.memberId ?? m.id) === memberId)?.displayName;
    conflicts.push({
      memberId,
      displayName: displayName || `Member #${memberId}`,
      rules: matched,
      ruleNames: matched.map((r) => r.ruleName),
    });
  }
  return conflicts;
}

export function formatShareRuleConflicts(conflicts) {
  if (!conflicts?.length) return CONTRADICTING_SHARE_RULES;
  const detail = conflicts
    .slice(0, 4)
    .map((c) => `${c.displayName} is on ${c.ruleNames.join(' and ')}`)
    .join('; ');
  const extra = conflicts.length > 4 ? ` (+${conflicts.length - 4} more)` : '';
  return `${CONTRADICTING_SHARE_RULES}: ${detail}${extra}`;
}

export function assertMemberOnShareRule(rule, memberId) {
  const { rules, error } = tryResolveShareRulesForMember(rule, memberId);
  if (error) throw new AppError(error);
  return rules[0] ? { ...asShareRuleList(rule).find((r) => r.id === rules[0].id) } : rule;
}

export function tryResolveShareRulesForMember(rulesOrRule, memberId) {
  const selected = asShareRuleList(rulesOrRule);
  if (!selected.length) return { rules: [], error: MISSING_IPO_SHARE_RULE };
  const matches = selected.filter((rule) => isMemberOnShareRule(rule, memberId));
  if (!matches.length) return { rules: [], error: MEMBER_NOT_ON_SHARE_RULE };
  if (matches.length > 1) {
    return { rules: [], error: formatShareRuleConflicts(findShareRuleConflicts(matches)) };
  }
  return { rules: shareRuleToSplitRules(matches[0]), error: null };
}

async function loadMembersForRuleIds(conn, tenantId, ruleIds) {
  const byRule = new Map();
  if (!ruleIds.length) return byRule;
  const [rows] = await conn.query(
    `SELECT rm.rule_id, rm.member_id, m.display_name, m.pan, m.status
     FROM profit_share_rule_members rm
     JOIN members m ON m.id = rm.member_id AND m.tenant_id = ?
     WHERE rm.rule_id IN (${ruleIds.map(() => '?').join(',')})
     ORDER BY m.display_name, rm.member_id`,
    [tenantId, ...ruleIds]
  );
  for (const row of rows) {
    const list = byRule.get(row.rule_id) || [];
    list.push(row);
    byRule.set(row.rule_id, list);
  }
  return byRule;
}

async function loadRuleRows(conn, tenantId, ruleIds = null) {
  let sql = `SELECT r.*, fp.name AS provider_name
     FROM profit_share_rules r
     JOIN fund_providers fp ON fp.id = r.fund_provider_id AND fp.tenant_id = r.tenant_id
     WHERE r.tenant_id = ?`;
  const params = [tenantId];
  if (ruleIds?.length) {
    sql += ` AND r.id IN (${ruleIds.map(() => '?').join(',')})`;
    params.push(...ruleIds);
  }
  sql += ' ORDER BY r.sort_order, r.rule_name, r.id';
  const [rows] = await conn.query(sql, params);
  const membersByRule = await loadMembersForRuleIds(conn, tenantId, rows.map((r) => r.id));
  return rows.map((row) => mapShareRuleRow(row, membersByRule.get(row.id) || []));
}

export async function listShareRules(conn, tenantId) {
  return loadRuleRows(conn, tenantId);
}

export async function getShareRule(conn, tenantId, ruleId) {
  const id = Number(ruleId);
  if (!id) return null;
  const rows = await loadRuleRows(conn, tenantId, [id]);
  return rows[0] || null;
}

export async function requireShareRule(conn, tenantId, ruleId) {
  const rule = await getShareRule(conn, tenantId, ruleId);
  if (!rule) throw new AppError('Share rule not found', 404);
  return rule;
}

async function assertFundProvider(conn, tenantId, fundProviderId) {
  const pid = Number(fundProviderId);
  if (!pid) throw new AppError('Fund provider is required');
  const [fp] = await conn.query(
    'SELECT id, name FROM fund_providers WHERE id = ? AND tenant_id = ?',
    [pid, tenantId]
  );
  if (!fp.length) throw new AppError('Fund provider not found', 404);
  return fp[0];
}

async function normalizeMemberIds(conn, tenantId, memberIds) {
  const ids = [...new Set((memberIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return [];
  const [rows] = await conn.query(
    `SELECT id FROM members WHERE tenant_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
    [tenantId, ...ids]
  );
  if (rows.length !== ids.length) {
    throw new AppError('One or more members were not found', 400);
  }
  return ids;
}

async function replaceRuleMembers(conn, ruleId, memberIds) {
  await conn.query('DELETE FROM profit_share_rule_members WHERE rule_id = ?', [ruleId]);
  if (!memberIds.length) return;
  const values = memberIds.map((memberId) => [ruleId, memberId]);
  await conn.query(
    `INSERT INTO profit_share_rule_members (rule_id, member_id) VALUES ${values.map(() => '(?, ?)').join(',')}`,
    values.flat()
  );
}

export async function createShareRule(conn, tenantId, {
  ruleName,
  fundProviderId,
  profitProviderPercent,
  profitManagerPercent,
  lossProviderPercent,
  lossManagerPercent,
  sortOrder,
  memberIds,
}) {
  const fp = await assertFundProvider(conn, tenantId, fundProviderId);
  const percents = {
    profitProviderPercent,
    profitManagerPercent,
    lossProviderPercent,
    lossManagerPercent,
  };
  validateProfitLossPercents(percents);
  const name = ruleName?.trim() || fp.name;
  let order = Number(sortOrder);
  if (!Number.isFinite(order)) {
    const [maxRow] = await conn.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM profit_share_rules WHERE tenant_id = ?',
      [tenantId]
    );
    order = Number(maxRow[0].next_order);
  }
  const members = await normalizeMemberIds(conn, tenantId, memberIds);
  const [result] = await conn.query(
    `INSERT INTO profit_share_rules
     (tenant_id, rule_name, fund_provider_id, profit_provider_percent, profit_manager_percent,
      loss_provider_percent, loss_manager_percent, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      name,
      fp.id,
      percents.profitProviderPercent,
      percents.profitManagerPercent,
      percents.lossProviderPercent,
      percents.lossManagerPercent,
      order,
    ]
  );
  await replaceRuleMembers(conn, result.insertId, members);
  const rule = await getShareRule(conn, tenantId, result.insertId);
  await ensureSoloSharePack(conn, tenantId, rule);
  return rule;
}

export async function updateShareRule(conn, tenantId, ruleId, fields) {
  const existing = await requireShareRule(conn, tenantId, ruleId);
  const updates = [];
  const values = [];

  if (fields.ruleName !== undefined) {
    updates.push('rule_name = ?');
    values.push(fields.ruleName?.trim() || existing.providerName);
  }
  if (fields.fundProviderId !== undefined) {
    const fp = await assertFundProvider(conn, tenantId, fields.fundProviderId);
    updates.push('fund_provider_id = ?');
    values.push(fp.id);
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

  if (updates.length) {
    updates.push('updated_at = NOW()');
    values.push(ruleId, tenantId);
    await conn.query(
      `UPDATE profit_share_rules SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
      values
    );
  }

  if (fields.memberIds !== undefined) {
    const members = await normalizeMemberIds(conn, tenantId, fields.memberIds);
    await replaceRuleMembers(conn, existing.id, members);
  } else if (!updates.length) {
    throw new AppError('No fields to update');
  }

  const updated = await getShareRule(conn, tenantId, existing.id);
  if (fields.memberIds !== undefined) {
    await assertPacksValidForRule(conn, tenantId, updated.id);
  }
  if (fields.ruleName !== undefined) {
    await renameSoloSharePack(conn, tenantId, existing, updated);
  }
  return updated;
}

export async function setShareRuleMembers(conn, tenantId, ruleId, memberIds) {
  const existing = await requireShareRule(conn, tenantId, ruleId);
  const members = await normalizeMemberIds(conn, tenantId, memberIds);
  await replaceRuleMembers(conn, existing.id, members);
  const updated = await getShareRule(conn, tenantId, existing.id);
  await assertPacksValidForRule(conn, tenantId, updated.id);
  return updated;
}

export async function deleteShareRule(conn, tenantId, ruleId) {
  const existing = await requireShareRule(conn, tenantId, ruleId);
  await conn.query(
    'UPDATE ipos SET profit_share_rule_id = NULL WHERE tenant_id = ? AND profit_share_rule_id = ?',
    [tenantId, existing.id]
  );
  await conn.query('DELETE FROM profit_share_rules WHERE id = ? AND tenant_id = ?', [existing.id, tenantId]);
  await conn.query(
    `DELETE p FROM profit_share_packs p
     LEFT JOIN profit_share_pack_rules pr ON pr.pack_id = p.id
     WHERE p.tenant_id = ? AND pr.pack_id IS NULL`,
    [tenantId]
  );
  return { ok: true };
}

export async function resolveShareRuleIds(conn, tenantId, ruleIds) {
  const ids = [...new Set((ruleIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return [];
  const rules = await loadRuleRows(conn, tenantId, ids);
  if (rules.length !== ids.length) throw new AppError('Share rule not found', 404);
  return ids;
}

export async function setIpoShareRules(conn, tenantId, ipoId, ruleIds) {
  const [ipos] = await conn.query('SELECT id FROM ipos WHERE id = ? AND tenant_id = ?', [ipoId, tenantId]);
  if (!ipos.length) throw new AppError('IPO not found', 404);
  const ids = await resolveShareRuleIds(conn, tenantId, ruleIds);
  const rules = ids.length ? await loadRuleRows(conn, tenantId, ids) : [];
  const conflicts = findShareRuleConflicts(rules);
  if (conflicts.length) throw new AppError(formatShareRuleConflicts(conflicts));
  await conn.query('DELETE FROM ipo_profit_share_rules WHERE ipo_id = ?', [ipoId]);
  if (ids.length) {
    await conn.query(
      `INSERT INTO ipo_profit_share_rules (ipo_id, rule_id) VALUES ${ids.map(() => '(?, ?)').join(',')}`,
      ids.flatMap((ruleId) => [ipoId, ruleId])
    );
  }
  await conn.query(
    'UPDATE ipos SET profit_share_rule_id = ? WHERE id = ? AND tenant_id = ?',
    [ids[0] ?? null, ipoId, tenantId]
  );
  return rules;
}

export function mapSharePackRow(row, rules = []) {
  const list = asShareRuleList(rules);
  const conflicts = findShareRuleConflicts(list);
  const memberIds = [...new Set(list.flatMap((r) => r.memberIds || []))];
  return {
    id: row.id,
    packName: row.pack_name?.trim() || list.map((r) => r.ruleName).filter(Boolean).join(' + ') || 'Share template',
    sortOrder: num(row.sort_order),
    ruleIds: list.map((r) => r.id),
    rules: list,
    ruleCount: list.length,
    memberIds,
    memberCount: memberIds.length,
    conflicts,
    hasConflicts: conflicts.length > 0,
  };
}

async function replacePackRules(conn, packId, ruleIds) {
  await conn.query('DELETE FROM profit_share_pack_rules WHERE pack_id = ?', [packId]);
  if (!ruleIds.length) return;
  await conn.query(
    `INSERT INTO profit_share_pack_rules (pack_id, rule_id) VALUES ${ruleIds.map(() => '(?, ?)').join(',')}`,
    ruleIds.flatMap((ruleId) => [packId, ruleId])
  );
}

async function loadPackRows(conn, tenantId, packIds = null, preloadedRules = null) {
  let sql = `SELECT p.* FROM profit_share_packs p WHERE p.tenant_id = ?`;
  const params = [tenantId];
  if (packIds?.length) {
    sql += ` AND p.id IN (${packIds.map(() => '?').join(',')})`;
    params.push(...packIds);
  }
  sql += ' ORDER BY p.sort_order, p.pack_name, p.id';
  const [rows] = await conn.query(sql, params);
  if (!rows.length) return [];
  const [links] = await conn.query(
    `SELECT pack_id, rule_id FROM profit_share_pack_rules
     WHERE pack_id IN (${rows.map(() => '?').join(',')})`,
    rows.map((r) => r.id)
  );
  const ruleIds = [...new Set(links.map((r) => r.rule_id))];
  let rules;
  if (Array.isArray(preloadedRules)) {
    const want = new Set(ruleIds);
    rules = preloadedRules.filter((r) => want.has(r.id));
  } else {
    rules = ruleIds.length ? await loadRuleRows(conn, tenantId, ruleIds) : [];
  }
  const byId = new Map(rules.map((r) => [r.id, r]));
  const rulesByPack = new Map();
  for (const link of links) {
    const rule = byId.get(link.rule_id);
    if (!rule) continue;
    const list = rulesByPack.get(link.pack_id) || [];
    if (!list.some((r) => r.id === rule.id)) list.push(rule);
    rulesByPack.set(link.pack_id, list);
  }
  return rows.map((row) => mapSharePackRow(row, rulesByPack.get(row.id) || []));
}

export async function listSharePacks(conn, tenantId, preloadedRules = null) {
  return loadPackRows(conn, tenantId, null, preloadedRules);
}

export async function getSharePack(conn, tenantId, packId) {
  const id = Number(packId);
  if (!id) return null;
  const rows = await loadPackRows(conn, tenantId, [id]);
  return rows[0] || null;
}

export async function requireSharePack(conn, tenantId, packId) {
  const pack = await getSharePack(conn, tenantId, packId);
  if (!pack) throw new AppError('Share template not found', 404);
  return pack;
}

async function assertPackRuleSet(conn, tenantId, ruleIds) {
  const ids = await resolveShareRuleIds(conn, tenantId, ruleIds);
  if (!ids.length) throw new AppError('Select at least one share rule for this template');
  const rules = await loadRuleRows(conn, tenantId, ids);
  const conflicts = findShareRuleConflicts(rules);
  if (conflicts.length) throw new AppError(formatShareRuleConflicts(conflicts));
  return { ids, rules };
}

export async function createSharePack(conn, tenantId, { packName, ruleIds, sortOrder }) {
  const { ids, rules } = await assertPackRuleSet(conn, tenantId, ruleIds);
  const name = packName?.trim() || rules.map((r) => r.ruleName).filter(Boolean).join(' + ') || 'Share template';
  let order = Number(sortOrder);
  if (!Number.isFinite(order)) {
    const [maxRow] = await conn.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM profit_share_packs WHERE tenant_id = ?',
      [tenantId]
    );
    order = Number(maxRow[0].next_order);
  }
  const [result] = await conn.query(
    'INSERT INTO profit_share_packs (tenant_id, pack_name, sort_order) VALUES (?, ?, ?)',
    [tenantId, name, order]
  );
  await replacePackRules(conn, result.insertId, ids);
  return getSharePack(conn, tenantId, result.insertId);
}

export async function updateSharePack(conn, tenantId, packId, fields) {
  const existing = await requireSharePack(conn, tenantId, packId);
  const updates = [];
  const values = [];
  if (fields.packName !== undefined) {
    updates.push('pack_name = ?');
    values.push(fields.packName?.trim() || existing.packName);
  }
  if (fields.sortOrder !== undefined) {
    updates.push('sort_order = ?');
    values.push(Number(fields.sortOrder));
  }
  let nextIds = existing.ruleIds;
  let nextRules = existing.rules;
  if (fields.ruleIds !== undefined) {
    const asserted = await assertPackRuleSet(conn, tenantId, fields.ruleIds);
    nextIds = asserted.ids;
    nextRules = asserted.rules;
  }
  if (updates.length) {
    updates.push('updated_at = NOW()');
    values.push(existing.id, tenantId);
    await conn.query(
      `UPDATE profit_share_packs SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
      values
    );
  }
  if (fields.ruleIds !== undefined) {
    await replacePackRules(conn, existing.id, nextIds);
    const [ipos] = await conn.query(
      'SELECT id FROM ipos WHERE tenant_id = ? AND profit_share_pack_id = ?',
      [tenantId, existing.id]
    );
    for (const ipo of ipos) {
      await setIpoShareRules(conn, tenantId, ipo.id, nextIds);
      await conn.query(
        'UPDATE ipos SET profit_share_pack_id = ? WHERE id = ? AND tenant_id = ?',
        [existing.id, ipo.id, tenantId]
      );
    }
  } else if (!updates.length) {
    throw new AppError('No fields to update');
  }
  return getSharePack(conn, tenantId, existing.id);
}

export async function deleteSharePack(conn, tenantId, packId) {
  const existing = await requireSharePack(conn, tenantId, packId);
  const [ipos] = await conn.query(
    'SELECT id FROM ipos WHERE tenant_id = ? AND profit_share_pack_id = ?',
    [tenantId, existing.id]
  );
  for (const ipo of ipos) {
    await setIpoShareRules(conn, tenantId, ipo.id, []);
  }
  await conn.query(
    'UPDATE ipos SET profit_share_pack_id = NULL WHERE tenant_id = ? AND profit_share_pack_id = ?',
    [tenantId, existing.id]
  );
  await conn.query('DELETE FROM profit_share_packs WHERE id = ? AND tenant_id = ?', [existing.id, tenantId]);
  return { ok: true };
}

export async function ensureSoloSharePack(conn, tenantId, rule) {
  if (!rule?.id) return null;
  const [rows] = await conn.query(
    `SELECT p.id
     FROM profit_share_packs p
     JOIN profit_share_pack_rules pr ON pr.pack_id = p.id
     WHERE p.tenant_id = ?
     GROUP BY p.id
     HAVING COUNT(*) = 1 AND MAX(pr.rule_id) = ?`,
    [tenantId, rule.id]
  );
  if (rows.length) return getSharePack(conn, tenantId, rows[0].id);
  return createSharePack(conn, tenantId, { packName: rule.ruleName, ruleIds: [rule.id] });
}

async function renameSoloSharePack(conn, tenantId, previous, updated) {
  const [rows] = await conn.query(
    `SELECT p.id, p.pack_name
     FROM profit_share_packs p
     JOIN profit_share_pack_rules pr ON pr.pack_id = p.id
     WHERE p.tenant_id = ?
     GROUP BY p.id, p.pack_name
     HAVING COUNT(*) = 1 AND MAX(pr.rule_id) = ?`,
    [tenantId, updated.id]
  );
  for (const row of rows) {
    if (row.pack_name === previous.ruleName || row.pack_name === updated.ruleName) {
      await conn.query(
        'UPDATE profit_share_packs SET pack_name = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?',
        [updated.ruleName, row.id, tenantId]
      );
    }
  }
}

async function assertPacksValidForRule(conn, tenantId, ruleId) {
  const [rows] = await conn.query(
    `SELECT DISTINCT pack_id FROM profit_share_pack_rules WHERE rule_id = ?`,
    [ruleId]
  );
  if (!rows.length) return;
  const packs = await loadPackRows(conn, tenantId, rows.map((r) => r.pack_id));
  const conflicts = packs.flatMap((p) => p.conflicts || []);
  if (conflicts.length) throw new AppError(formatShareRuleConflicts(conflicts));
}

export async function setIpoSharePack(conn, tenantId, ipoId, packId) {
  const [ipos] = await conn.query('SELECT id FROM ipos WHERE id = ? AND tenant_id = ?', [ipoId, tenantId]);
  if (!ipos.length) throw new AppError('IPO not found', 404);
  if (packId == null || packId === '') {
    await setIpoShareRules(conn, tenantId, ipoId, []);
    await conn.query(
      'UPDATE ipos SET profit_share_pack_id = NULL WHERE id = ? AND tenant_id = ?',
      [ipoId, tenantId]
    );
    return [];
  }
  const pack = await requireSharePack(conn, tenantId, packId);
  if (pack.hasConflicts) throw new AppError(formatShareRuleConflicts(pack.conflicts));
  await setIpoShareRules(conn, tenantId, ipoId, pack.ruleIds);
  await conn.query(
    'UPDATE ipos SET profit_share_pack_id = ? WHERE id = ? AND tenant_id = ?',
    [pack.id, ipoId, tenantId]
  );
  return pack.rules;
}

export async function loadSharePacksByIpoIds(conn, tenantId, ipoIds) {
  const ids = [...new Set((ipoIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const map = new Map();
  if (!ids.length) return map;
  const [rows] = await conn.query(
    `SELECT id, profit_share_pack_id
     FROM ipos
     WHERE tenant_id = ? AND id IN (${ids.map(() => '?').join(',')}) AND profit_share_pack_id IS NOT NULL`,
    [tenantId, ...ids]
  );
  const packIds = [...new Set(rows.map((r) => r.profit_share_pack_id))];
  if (!packIds.length) return map;
  const packs = await loadPackRows(conn, tenantId, packIds);
  const byId = new Map(packs.map((p) => [p.id, p]));
  for (const row of rows) {
    const pack = byId.get(row.profit_share_pack_id);
    if (pack) map.set(Number(row.id), pack);
  }
  return map;
}

export async function resolveOptionalSharePackId(conn, tenantId, packId) {
  if (packId == null || packId === '') return null;
  const id = Number(packId);
  if (!Number.isInteger(id) || id < 1) throw new AppError('Invalid share template', 400);
  await requireSharePack(conn, tenantId, id);
  return id;
}

export async function getShareRulesForIpo(conn, tenantId, ipoId) {
  const map = await loadShareRulesByIpoIds(conn, tenantId, [ipoId]);
  if (!map.has(Number(ipoId))) {
    const [rows] = await conn.query(
      'SELECT id FROM ipos WHERE id = ? AND tenant_id = ?',
      [ipoId, tenantId]
    );
    if (!rows.length) throw new AppError('IPO not found', 404);
  }
  return map.get(Number(ipoId)) || [];
}

export async function getShareRuleForIpo(conn, tenantId, ipoId) {
  const rules = await getShareRulesForIpo(conn, tenantId, ipoId);
  return rules[0] || null;
}

export async function requireIpoShareRule(conn, tenantId, ipoId) {
  const rules = await getShareRulesForIpo(conn, tenantId, ipoId);
  if (!rules.length) throw new AppError(MISSING_IPO_SHARE_RULE);
  return rules;
}

export async function assertMembersOnIpoShareRule(conn, tenantId, ipoId, memberIds) {
  const rules = await requireIpoShareRule(conn, tenantId, ipoId);
  const conflicts = findShareRuleConflicts(rules);
  if (conflicts.length) throw new AppError(formatShareRuleConflicts(conflicts));
  for (const memberId of [...new Set((memberIds || []).map(Number))]) {
    const { error } = tryResolveShareRulesForMember(rules, memberId);
    if (error) throw new AppError(error);
  }
  return rules;
}

export async function loadShareRulesByIpoIds(conn, tenantId, ipoIds) {
  const ids = [...new Set((ipoIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const map = new Map();
  if (!ids.length) return map;
  const [linkRows] = await conn.query(
    `SELECT ipr.ipo_id, ipr.rule_id
     FROM ipo_profit_share_rules ipr
     JOIN ipos i ON i.id = ipr.ipo_id AND i.tenant_id = ?
     WHERE ipr.ipo_id IN (${ids.map(() => '?').join(',')})`,
    [tenantId, ...ids]
  );
  const links = [...linkRows];
  let ruleIds = [...new Set(links.map((r) => r.rule_id))];
  if (!links.length) {
    const [legacy] = await conn.query(
      `SELECT id, profit_share_rule_id
       FROM ipos
       WHERE tenant_id = ? AND id IN (${ids.map(() => '?').join(',')}) AND profit_share_rule_id IS NOT NULL`,
      [tenantId, ...ids]
    );
    for (const row of legacy) {
      links.push({ ipo_id: row.id, rule_id: row.profit_share_rule_id });
    }
    ruleIds = [...new Set(links.map((r) => r.rule_id))];
  }
  if (!ruleIds.length) return map;
  const rules = await loadRuleRows(conn, tenantId, ruleIds);
  const byId = new Map(rules.map((r) => [r.id, r]));
  for (const link of links) {
    const rule = byId.get(link.rule_id);
    if (!rule) continue;
    const ipoId = Number(link.ipo_id);
    const list = map.get(ipoId) || [];
    if (!list.some((r) => r.id === rule.id)) list.push(rule);
    map.set(ipoId, list);
  }
  return map;
}

export async function resolveOptionalShareRuleId(conn, tenantId, ruleId) {
  if (ruleId == null || ruleId === '') return null;
  const id = Number(ruleId);
  if (!Number.isInteger(id) || id < 1) throw new AppError('Invalid share rule', 400);
  await requireShareRule(conn, tenantId, id);
  return id;
}

export function serializeAssignedShareRules(rules, pack = null) {
  const list = asShareRuleList(rules);
  const ids = list.map((r) => r.id);
  const memberIds = [...new Set(list.flatMap((r) => r.memberIds || []))];
  return {
    profitShareRuleIds: ids,
    profitShareRules: list.map((r) => ({
      id: r.id,
      ruleName: r.ruleName,
      memberCount: r.memberCount,
      profitMemberPercent: r.profitMemberPercent,
      memberIds: r.memberIds,
    })),
    profitShareRuleId: ids[0] ?? null,
    profit_share_rule_id: ids[0] ?? null,
    profitShareRuleName: pack?.packName || list.map((r) => r.ruleName).filter(Boolean).join(', ') || null,
    profitShareMemberCount: memberIds.length,
    profitShareMemberPercent: list.length === 1 ? list[0].profitMemberPercent : null,
    profitSharePackId: pack?.id ?? null,
    profit_share_pack_id: pack?.id ?? null,
    profitSharePackName: pack?.packName ?? null,
    profitSharePack: pack
      ? {
        id: pack.id,
        packName: pack.packName,
        ruleIds: pack.ruleIds,
        ruleCount: pack.ruleCount,
        memberCount: pack.memberCount,
      }
      : null,
  };
}

export function serializeIpoShareRuleFields(row) {
  return serializeAssignedShareRules([]);
}

export async function attachShareRulesToIpos(conn, tenantId, ipos) {
  const rows = (ipos || []).filter(Boolean);
  if (!rows.length) return rows;
  const byIpo = await loadShareRulesByIpoIds(conn, tenantId, rows.map((r) => r.id));
  const packsByIpo = await loadSharePacksByIpoIds(conn, tenantId, rows.map((r) => r.id));
  return rows.map((ipo) => ({
    ...ipo,
    ...serializeAssignedShareRules(byIpo.get(Number(ipo.id)) || [], packsByIpo.get(Number(ipo.id)) || null),
  }));
}

export const IPO_SHARE_RULE_SELECT = `
  psr.rule_name AS profit_share_rule_name,
  psr.profit_provider_percent AS profit_share_profit_provider_percent,
  psr.profit_manager_percent AS profit_share_profit_manager_percent,
  (SELECT COUNT(*) FROM profit_share_rule_members rm WHERE rm.rule_id = i.profit_share_rule_id) AS profit_share_member_count
`;
