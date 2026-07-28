import { parsePositiveInt } from '../utils/validate.js';
import { AppError } from '../middleware/errorHandler.js';

export function groupHasOwnerRow(group) {
  if (!group) return false;
  if (group.owner_member_id) return true;
  const ext = group.owner_external_name?.trim?.() ?? group.owner_external_name;
  return Boolean(ext);
}

export async function listMemberGroups(pool, tenantId) {
  const [groups] = await pool.query(
    `SELECT g.*,
            o.display_name AS owner_member_display_name,
            o.pan AS owner_member_pan,
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

  return groups.map((g) => {
    const ownerExternalName = g.owner_external_name?.trim() || null;
    const ownerExternalPan = g.owner_external_pan?.trim() || null;
    const ownerDisplayName = g.owner_member_display_name ?? ownerExternalName ?? null;
    const ownerPan = g.owner_member_pan ?? ownerExternalPan ?? null;
    return {
      id: g.id,
      name: g.name,
      sortOrder: g.sort_order,
      ownerMemberId: g.owner_member_id ?? null,
      ownerExternalName,
      ownerExternalPan,
      ownerDisplayName,
      ownerPan,
      memberCount: Number(g.member_count),
      members: membersByGroup.get(g.id) || [],
    };
  });
}

/**
 * Set sub-group owner: either a member in the group, or a third-party name (not on the member list).
 */
export async function setGroupOwner(conn, tenantId, groupId, body) {
  const memberFieldSent = body.ownerMemberId !== undefined;
  const externalNameSent = body.ownerExternalName !== undefined;
  const externalPanSent = body.ownerExternalPan !== undefined;

  if (!memberFieldSent && !externalNameSent && !externalPanSent) {
    return null;
  }

  const externalName =
    externalNameSent && body.ownerExternalName != null ? String(body.ownerExternalName).trim() : null;
  const externalPan =
    externalPanSent && body.ownerExternalPan != null
      ? String(body.ownerExternalPan).trim().toUpperCase().slice(0, 10) || null
      : externalNameSent
        ? null
        : undefined;

  const hasMemberId =
    memberFieldSent && body.ownerMemberId != null && body.ownerMemberId !== '';

  if (hasMemberId) {
    const ownerId = parsePositiveInt(body.ownerMemberId, 'owner member id');
    const [rows] = await conn.query(
      `SELECT m.id FROM members m
       WHERE m.id = ? AND m.tenant_id = ? AND m.member_group_id = ?`,
      [ownerId, tenantId, groupId]
    );
    if (!rows.length) {
      throw new AppError('Group owner must be a member of this sub-group');
    }
    await conn.query(
      `UPDATE member_groups
       SET owner_member_id = ?, owner_external_name = NULL, owner_external_pan = NULL
       WHERE id = ? AND tenant_id = ?`,
      [ownerId, groupId, tenantId]
    );
    return ownerId;
  }

  if (externalNameSent) {
    if (!externalName) {
      await conn.query(
        `UPDATE member_groups
         SET owner_member_id = NULL, owner_external_name = NULL, owner_external_pan = NULL
         WHERE id = ? AND tenant_id = ?`,
        [groupId, tenantId]
      );
      return null;
    }
    const panValue = externalPanSent ? externalPan : null;
    await conn.query(
      `UPDATE member_groups
       SET owner_member_id = NULL, owner_external_name = ?, owner_external_pan = ?
       WHERE id = ? AND tenant_id = ?`,
      [externalName, panValue, groupId, tenantId]
    );
    return null;
  }

  if (memberFieldSent && (body.ownerMemberId === null || body.ownerMemberId === '')) {
    await conn.query(
      'UPDATE member_groups SET owner_member_id = NULL WHERE id = ? AND tenant_id = ?',
      [groupId, tenantId]
    );
  }
  return null;
}

/** @deprecated Use setGroupOwner */
export async function assertGroupOwner(conn, tenantId, groupId, ownerMemberId) {
  return setGroupOwner(conn, tenantId, groupId, {
    ownerMemberId,
    ownerExternalName: ownerMemberId == null || ownerMemberId === '' ? null : undefined,
  });
}

export async function loadGroupForBulkDistribute(conn, tenantId, ipoId, groupId) {
  const gid = parsePositiveInt(groupId, 'group id');
  const [groupRows] = await conn.query(
    `SELECT g.id, g.name, g.owner_member_id, g.owner_external_name, g.owner_external_pan,
            o.display_name AS owner_display_name, o.status AS owner_status
     FROM member_groups g
     LEFT JOIN members o ON o.id = g.owner_member_id
     WHERE g.id = ? AND g.tenant_id = ?`,
    [gid, tenantId]
  );
  if (!groupRows.length) throw new AppError('Member group not found', 404);
  const group = groupRows[0];
  const externalName = group.owner_external_name?.trim() || null;
  if (!group.owner_member_id && !externalName) {
    throw new AppError(`Set a group owner for “${group.name}” under Member Sub-Groups`);
  }
  if (group.owner_member_id && group.owner_status !== 'ACTIVE') {
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

  return { group: { ...group, owner_external_name: externalName }, members };
}

export async function listGroupBulkTransactions(pool, tenantId, groupId = null) {
  const params = [tenantId];
  let groupFilter = '';
  if (groupId != null) {
    groupFilter = ' AND bp.member_group_id = ?';
    params.push(parsePositiveInt(groupId, 'group id'));
  }

  const [rows] = await pool.query(
    `SELECT bp.id, bp.member_group_id, bp.ipo_id, bp.owner_member_id, bp.owner_external_name,
            bp.total_amount, bp.member_count,
            bp.investor_category, bp.paid_at, bp.notes,
            g.name AS group_name,
            i.name AS ipo_name,
            o.display_name AS owner_member_display_name,
            (
              SELECT COUNT(*)
              FROM ipo_applications a
              JOIN members m ON m.id = a.member_id
              WHERE a.ipo_id = bp.ipo_id
                AND m.member_group_id = bp.member_group_id
                AND (
                  (bp.owner_member_id IS NOT NULL AND a.paid_to_member_id = bp.owner_member_id)
                  OR (bp.owner_external_name IS NOT NULL AND a.paid_to_external_name = bp.owner_external_name)
                )
            ) AS app_member_count,
            (
              SELECT COALESCE(SUM(a.amount), 0)
              FROM ipo_applications a
              JOIN members m ON m.id = a.member_id
              WHERE a.ipo_id = bp.ipo_id
                AND m.member_group_id = bp.member_group_id
                AND (
                  (bp.owner_member_id IS NOT NULL AND a.paid_to_member_id = bp.owner_member_id)
                  OR (bp.owner_external_name IS NOT NULL AND a.paid_to_external_name = bp.owner_external_name)
                )
            ) AS app_total_amount
     FROM member_group_bulk_payments bp
     JOIN member_groups g ON g.id = bp.member_group_id
     JOIN ipos i ON i.id = bp.ipo_id
     LEFT JOIN members o ON o.id = bp.owner_member_id
     WHERE bp.tenant_id = ?${groupFilter}
     ORDER BY bp.paid_at DESC, bp.id DESC`,
    params
  );

  return rows.map((r) => {
    const appCount = Number(r.app_member_count);
    const appTotal = Number(r.app_total_amount);
    const ownerDisplayName = r.owner_member_display_name ?? r.owner_external_name ?? null;
    return {
      id: r.id,
      memberGroupId: r.member_group_id,
      groupName: r.group_name,
      ipoId: r.ipo_id,
      ipoName: r.ipo_name,
      ownerMemberId: r.owner_member_id,
      ownerExternalName: r.owner_external_name,
      ownerDisplayName,
      totalAmount: appTotal > 0 ? appTotal : Number(r.total_amount),
      memberCount: appCount > 0 ? appCount : Number(r.member_count),
      investorCategory: r.investor_category,
      paidAt: r.paid_at,
      notes: r.notes,
    };
  });
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

/** Members already in a different sub-group must be unassigned there before joining another. */
export async function assertMembersNotInOtherGroup(conn, tenantId, targetGroupId, memberIds) {
  if (!memberIds.length) return;

  const uniqueIds = [...new Set(memberIds.map((id) => parsePositiveInt(id, 'member id')))];
  const placeholders = uniqueIds.map(() => '?').join(',');
  const [rows] = await conn.query(
    `SELECT m.id, m.display_name, g.name AS group_name
     FROM members m
     JOIN member_groups g ON g.id = m.member_group_id AND g.tenant_id = m.tenant_id
     WHERE m.tenant_id = ? AND m.id IN (${placeholders})
       AND m.member_group_id IS NOT NULL
       AND m.member_group_id != ?`,
    [tenantId, ...uniqueIds, targetGroupId]
  );

  if (!rows.length) return;

  const list = rows.map((r) => `${r.display_name} (“${r.group_name}”)`).join(', ');
  throw new AppError(
    `Cannot assign — already in another sub-group: ${list}. Unassign from their current group first.`,
    409
  );
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
    await assertMembersNotInOtherGroup(conn, tenantId, groupId, uniqueIds);
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
    'SELECT owner_member_id, owner_external_name FROM member_groups WHERE id = ? AND tenant_id = ?',
    [groupId, tenantId]
  );
  const ownerId = grp[0]?.owner_member_id;
  const hasExternal = Boolean(grp[0]?.owner_external_name?.trim());
  if (ownerId && !hasExternal && !uniqueIds.some((id) => Number(id) === Number(ownerId))) {
    await conn.query(
      'UPDATE member_groups SET owner_member_id = NULL WHERE id = ? AND tenant_id = ?',
      [groupId, tenantId]
    );
  }
}
