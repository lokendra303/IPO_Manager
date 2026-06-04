import { parsePositiveInt } from '../utils/validate.js';
import { AppError } from '../middleware/errorHandler.js';

export async function listMemberGroups(pool, tenantId) {
  const [groups] = await pool.query(
    `SELECT g.*,
            o.display_name AS owner_display_name,
            o.pan AS owner_pan,
            (SELECT COUNT(*) FROM members m WHERE m.member_group_id = g.id AND m.tenant_id = g.tenant_id) AS member_count
     FROM member_groups g
     LEFT JOIN members o ON o.id = g.owner_member_id
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
    ownerMemberId: g.owner_member_id ?? null,
    ownerDisplayName: g.owner_display_name ?? null,
    ownerPan: g.owner_pan ?? null,
    memberCount: Number(g.member_count),
    members: membersByGroup.get(g.id) || [],
  }));
}

export async function assertGroupOwner(conn, tenantId, groupId, ownerMemberId) {
  if (ownerMemberId == null || ownerMemberId === '') {
    await conn.query(
      'UPDATE member_groups SET owner_member_id = NULL WHERE id = ? AND tenant_id = ?',
      [groupId, tenantId]
    );
    return null;
  }
  const ownerId = parsePositiveInt(ownerMemberId, 'owner member id');
  const [rows] = await conn.query(
    `SELECT m.id, m.display_name FROM members m
     WHERE m.id = ? AND m.tenant_id = ? AND m.member_group_id = ?`,
    [ownerId, tenantId, groupId]
  );
  if (!rows.length) {
    throw new AppError('Group owner must be a member of this sub-group');
  }
  await conn.query(
    'UPDATE member_groups SET owner_member_id = ? WHERE id = ? AND tenant_id = ?',
    [ownerId, groupId, tenantId]
  );
  return ownerId;
}

export async function loadGroupForBulkDistribute(conn, tenantId, ipoId, groupId) {
  const gid = parsePositiveInt(groupId, 'group id');
  const [groupRows] = await conn.query(
    `SELECT g.id, g.name, g.owner_member_id, o.display_name AS owner_display_name, o.status AS owner_status
     FROM member_groups g
     LEFT JOIN members o ON o.id = g.owner_member_id
     WHERE g.id = ? AND g.tenant_id = ?`,
    [gid, tenantId]
  );
  if (!groupRows.length) throw new AppError('Member group not found', 404);
  const group = groupRows[0];
  if (!group.owner_member_id) {
    throw new AppError(`Set a group owner for “${group.name}” under Member Sub-Groups`);
  }
  if (group.owner_status !== 'ACTIVE') {
    throw new AppError(`Group owner ${group.owner_display_name} must be active`);
  }

  const [members] = await conn.query(
    `SELECT m.id, m.display_name, m.pan, m.status
     FROM members m
     WHERE m.member_group_id = ? AND m.tenant_id = ? AND m.status = 'ACTIVE'
       AND NOT EXISTS (
         SELECT 1 FROM ipo_applications a
         WHERE a.ipo_id = ? AND a.member_id = m.id
       )`,
    [gid, tenantId, parsePositiveInt(ipoId, 'IPO id')]
  );
  if (!members.length) {
    throw new AppError(`No active members in “${group.name}” are available for this IPO`);
  }

  return { group, members };
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

  const [grp] = await conn.query(
    'SELECT owner_member_id FROM member_groups WHERE id = ? AND tenant_id = ?',
    [groupId, tenantId]
  );
  const ownerId = grp[0]?.owner_member_id;
  if (ownerId && !uniqueIds.some((id) => Number(id) === Number(ownerId))) {
    await conn.query(
      'UPDATE member_groups SET owner_member_id = NULL WHERE id = ? AND tenant_id = ?',
      [groupId, tenantId]
    );
  }
}
