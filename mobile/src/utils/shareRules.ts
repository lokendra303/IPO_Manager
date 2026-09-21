export function memberKeepPercent(providerPercent: number, managerPercent: number) {
  return Math.max(0, 100 - (Number(providerPercent) || 0) - (Number(managerPercent) || 0));
}

export function shareRuleLabel(rule: any, compact = false) {
  if (!rule) return '';
  const name = rule.ruleName || rule.providerName || 'Share rule';
  const n = rule.memberCount ?? rule.members?.length ?? 0;
  const keep = rule.profitMemberPercent
    ?? memberKeepPercent(rule.profitProviderPercent, rule.profitManagerPercent);
  if (compact) return `${name} · member ${keep}%`;
  return `${name} · ${n} member${n === 1 ? '' : 's'} · member ${keep}%`;
}

export function shareRuleMemberIds(rule: any): number[] {
  if (!rule) return [];
  if (Array.isArray(rule.memberIds) && rule.memberIds.length) {
    return rule.memberIds.map(Number);
  }
  return (rule.members || []).map((m: any) => Number(m.memberId ?? m.id)).filter(Boolean);
}

export function assignedShareRuleIds(ipo: any): number[] {
  const ids = ipo?.profitShareRuleIds;
  if (Array.isArray(ids) && ids.length) {
    return [...new Set(ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0))];
  }
  const one = ipo?.profitShareRuleId ?? ipo?.profit_share_rule_id;
  const id = Number(one);
  return Number.isInteger(id) && id > 0 ? [id] : [];
}

export function assignedSharePackId(ipo: any): number | null {
  const id = Number(ipo?.profitSharePackId ?? ipo?.profit_share_pack_id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function sharePackLabel(pack: any) {
  if (!pack) return '';
  const name = pack.packName || pack.ruleName || 'Share template';
  const n = pack.ruleCount ?? pack.rules?.length ?? 0;
  const m = pack.memberCount ?? 0;
  return `${name} · ${n} rule${n === 1 ? '' : 's'} · ${m} member${m === 1 ? '' : 's'}`;
}

export function findShareRuleConflicts(rules: any[]) {
  const byMember = new Map<number, any[]>();
  for (const rule of rules || []) {
    if (!rule) continue;
    for (const mid of shareRuleMemberIds(rule)) {
      const list = byMember.get(mid) || [];
      list.push(rule);
      byMember.set(mid, list);
    }
  }
  const conflicts: { memberId: number; displayName: string; ruleNames: string[] }[] = [];
  for (const [memberId, matched] of byMember) {
    if (matched.length < 2) continue;
    const displayName = matched
      .flatMap((r) => r.members || [])
      .find((m: any) => Number(m.memberId ?? m.id) === memberId)?.displayName;
    conflicts.push({
      memberId,
      displayName: displayName || `Member #${memberId}`,
      ruleNames: matched.map((r) => r.ruleName || r.providerName),
    });
  }
  return conflicts;
}

export function formatShareRuleConflicts(conflicts: { displayName: string; ruleNames: string[] }[]) {
  if (!conflicts?.length) return 'Selected share rules contradict';
  const detail = conflicts
    .slice(0, 4)
    .map((c) => `${c.displayName} is on ${c.ruleNames.join(' and ')}`)
    .join('; ');
  const extra = conflicts.length > 4 ? ` (+${conflicts.length - 4} more)` : '';
  return `Selected share rules contradict: ${detail}${extra}`;
}

export function nextShareRuleIdsWithoutConflict(
  currentIds: number[],
  ruleId: number,
  allRules: any[],
): { ids: number[]; error: string | null } {
  const id = Number(ruleId);
  const next = currentIds.includes(id)
    ? currentIds.filter((x) => x !== id)
    : [...currentIds, id];
  const selected = (allRules || []).filter((r) => next.includes(Number(r.id)));
  const conflicts = findShareRuleConflicts(selected);
  if (conflicts.length) return { ids: currentIds, error: formatShareRuleConflicts(conflicts) };
  return { ids: next, error: null };
}

export function ruleConflictsWithSelected(rule: any, selectedIds: number[], allRules: any[]) {
  if (!rule) return false;
  const selected = new Set((selectedIds || []).map(Number));
  if (selected.has(Number(rule.id))) return false;
  const next = (allRules || []).filter((r) => selected.has(Number(r.id)) || Number(r.id) === Number(rule.id));
  return findShareRuleConflicts(next).length > 0;
}

export function isActiveMember(member: any) {
  return String(member?.status || 'ACTIVE').toUpperCase() === 'ACTIVE';
}

export function membersForRulePicker(allMembers: any[], selectedIds: number[] = []) {
  const selected = new Set((selectedIds || []).map(Number));
  return (allMembers || []).filter((m) => (
    isActiveMember(m) || selected.has(Number(m.memberId ?? m.id))
  ));
}

export function mergeMemberDirectories(shareRows: any[] = [], memberRows: any[] = []) {
  const byId = new Map<number, any>();
  for (const row of memberRows || []) {
    const id = Number(row.id ?? row.memberId);
    if (!Number.isInteger(id) || id < 1 || byId.has(id)) continue;
    byId.set(id, {
      memberId: id,
      displayName: row.display_name ?? row.displayName,
      pan: row.pan,
      status: row.status,
      memberGroupId: row.member_group_id ?? row.memberGroupId ?? null,
      memberGroupName: row.member_group_name ?? row.memberGroupName ?? null,
      member_group_id: row.member_group_id ?? row.memberGroupId ?? null,
      memberFundProviderName: row.fund_provider_name || row.memberFundProviderName || null,
    });
  }
  for (const row of shareRows || []) {
    const id = Number(row.memberId ?? row.id);
    if (!Number.isInteger(id) || id < 1) continue;
    const current = byId.get(id) || {};
    byId.set(id, {
      ...current,
      ...row,
      memberId: id,
      displayName: row.displayName || current.displayName,
      status: row.status || current.status,
      memberGroupId: row.memberGroupId ?? row.member_group_id ?? current.memberGroupId ?? current.member_group_id ?? null,
      memberGroupName: row.memberGroupName ?? row.member_group_name ?? current.memberGroupName ?? current.member_group_name ?? null,
      member_group_id: row.member_group_id ?? row.memberGroupId ?? current.member_group_id ?? current.memberGroupId ?? null,
    });
  }
  return [...byId.values()];
}

export function memberGroupId(member: any) {
  const id = Number(member?.memberGroupId ?? member?.member_group_id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function activeMemberIdsInGroup(allMembers: any[], groupId: number | null) {
  return (allMembers || [])
    .filter(isActiveMember)
    .filter((m) => {
      const gid = memberGroupId(m);
      return groupId == null ? gid == null : gid === Number(groupId);
    })
    .map((m) => Number(m.memberId ?? m.id));
}

export function toggleGroupMemberIds(currentIds: number[], groupMemberIds: number[]) {
  const current = [...new Set((currentIds || []).map(Number))];
  const group = [...new Set((groupMemberIds || []).map(Number))];
  if (!group.length) return current;
  const allOn = group.every((id) => current.includes(id));
  if (allOn) return current.filter((id) => !group.includes(id));
  return [...new Set([...current, ...group])];
}

export function isGroupFullySelected(currentIds: number[], groupMemberIds: number[]) {
  const current = new Set((currentIds || []).map(Number));
  const group = (groupMemberIds || []).map(Number);
  return group.length > 0 && group.every((id) => current.has(id));
}

export function groupBulkSelectOptions(allMembers: any[], groups: any[] = []) {
  const options: { key: string; groupId: number | null; label: string; ids: number[] }[] = [];
  for (const g of groups || []) {
    const ids = activeMemberIdsInGroup(allMembers, g.id);
    if (!ids.length) continue;
    options.push({
      key: `g-${g.id}`,
      groupId: g.id,
      label: g.name,
      ids,
    });
  }
  const ungrouped = activeMemberIdsInGroup(allMembers, null);
  if (ungrouped.length) {
    options.push({
      key: 'ungrouped',
      groupId: null,
      label: 'No sub-group',
      ids: ungrouped,
    });
  }
  return options;
}
