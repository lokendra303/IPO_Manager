import { parsePositiveInt } from '../utils/validate.js';
import { AppError } from '../middleware/errorHandler.js';

export async function listMemberGroups(pool, tenantId) {
  const [groups] = await pool.query(
    `SELECT g.*,
            (SELECT COUNT(*) FROM members m WHERE m.member_group_id = g.id AND m.tenant_id = g.tenant_id) AS member_count
     FROM member_groups g
     WHERE g.tenant_id = ?
     ORDER BY g.sort_order, g.name, g.id`,
    [tenantId]
  );

  const [members] = await pool.query(
    `SELECT id, display_name, pan, status, member_group_id, sort_order
     FROM members
     WHERE tenant_id = ?
     ORDER BY sort_order, display_name, id`,
    [tenantId]
  );

  const membersByGroup = new Map();
  for (const m of members) {
    if (!m.member_group_id) continue;
    if (!membersByGroup.has(m.member_group_id)) membersByGroup.set(m.member_group_id, []);
    membersByGroup.get(m.member_group_id).push({
      id: m.id,
      displayName: m.display_name,
      pan: m.pan,
      status: m.status,
      sortOrder: m.sort_order,
    });
  }

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    sortOrder: g.sort_order,
    memberCount: Number(g.member_count),
    members: membersByGroup.get(g.id) || [],
  }));
}

export async function assertGroupNameUnique(pool, tenantId, name, excludeId = null) {
  const trimmed = name.trim();
  const params = [tenantId, trimmed];
  let sql = 'SELECT id FROM member_groups WHERE tenant_id = ? AND name = ?';
  if (excludeId) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }
  const [rows] = await pool.query(sql, params);
  if (rows.length) throw new AppError('A group with this name already exists', 409);
}

export async function assignMembersToGroup(conn, tenantId, groupId, memberIds) {
  const uniqueIds = [...new Set(memberIds.map((id) => parsePositiveInt(id, 'member id')))];
  const [groupRows] = await conn.query(
    'SELECT id FROM member_groups WHERE id = ? AND tenant_id = ?',
    [groupId, tenantId]
  );
  if (!groupRows.length) throw new AppError('Group not found', 404);

  if (uniqueIds.length) {
    const placeholders = uniqueIds.map(() => '?').join(',');
    const [found] = await conn.query(
      `SELECT id FROM members WHERE tenant_id = ? AND id IN (${placeholders})`,
      [tenantId, ...uniqueIds]
    );
    if (found.length !== uniqueIds.length) {
      throw new AppError('One or more members not found');
    }
  }

  await conn.query(
    'UPDATE members SET member_group_id = NULL WHERE member_group_id = ? AND tenant_id = ?',
    [groupId, tenantId]
  );

  if (uniqueIds.length) {
    const placeholders = uniqueIds.map(() => '?').join(',');
    await conn.query(
      `UPDATE members SET member_group_id = ? WHERE tenant_id = ? AND id IN (${placeholders})`,
      [groupId, tenantId, ...uniqueIds]
    );
  }
}
