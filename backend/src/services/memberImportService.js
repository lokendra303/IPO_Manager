import { AppError } from '../middleware/errorHandler.js';
import { assertUniquePan } from './memberDetailService.js';

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UPI_REGEX = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9]{2,64}$/;
const MAX_IMPORT = 500;

function cell(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizePan(pan) {
  return cell(pan).toUpperCase().replace(/[\s-]/g, '');
}

function normalizeEmail(email) {
  const e = cell(email).toLowerCase();
  return e || null;
}

function normalizeUpi(upi) {
  const u = cell(upi).toLowerCase();
  return u || null;
}

function rowError(message) {
  return { ok: false, error: message };
}

export async function importMembers(conn, tenantId, rawMembers) {
  if (!Array.isArray(rawMembers) || !rawMembers.length) {
    throw new AppError('Select at least one member to add');
  }
  if (rawMembers.length > MAX_IMPORT) {
    throw new AppError(`You can import at most ${MAX_IMPORT} members at a time`);
  }

  const [existing] = await conn.query(
    'SELECT pan FROM members WHERE tenant_id = ?',
    [tenantId]
  );
  const existingPans = new Set(existing.map((r) => String(r.pan || '').toUpperCase()));

  const [groups] = await conn.query(
    'SELECT id, name FROM member_groups WHERE tenant_id = ?',
    [tenantId]
  );
  const groupByName = new Map(groups.map((g) => [String(g.name).trim().toLowerCase(), g.id]));

  const [[maxRow]] = await conn.query(
    'SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM members WHERE tenant_id = ?',
    [tenantId]
  );
  let nextSort = Number(maxRow.max_order) + 1;
  const seen = new Set();
  const results = [];

  for (let i = 0; i < rawMembers.length; i += 1) {
    const raw = rawMembers[i] || {};
    const pan = normalizePan(raw.pan);
    if (!pan) {
      results.push(rowError('PAN is required'));
      continue;
    }
    if (pan.length !== 10) {
      results.push({ ...rowError('PAN must be 10 characters'), pan });
      continue;
    }
    if (!PAN_REGEX.test(pan)) {
      results.push({ ...rowError('PAN format must be ABCDE1234F (5 letters, 4 digits, 1 letter)'), pan });
      continue;
    }
    if (existingPans.has(pan) || seen.has(pan)) {
      results.push({ ...rowError(existingPans.has(pan) ? 'Already on the team' : 'Duplicate PAN in this import'), pan });
      continue;
    }

    const email = normalizeEmail(raw.email);
    if (email && !EMAIL_REGEX.test(email)) {
      results.push({ ...rowError('Invalid email'), pan });
      continue;
    }
    const upi = normalizeUpi(raw.upi);
    if (upi && !UPI_REGEX.test(upi)) {
      results.push({ ...rowError('Invalid UPI ID'), pan });
      continue;
    }

    const statusRaw = cell(raw.status).toUpperCase();
    const status = statusRaw === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
    if (statusRaw && statusRaw !== 'ACTIVE' && statusRaw !== 'INACTIVE') {
      results.push({ ...rowError('Status must be ACTIVE or INACTIVE'), pan });
      continue;
    }

    const displayName = cell(raw.displayName || raw.name);
    if (!displayName) {
      results.push({ ...rowError('Name is required'), pan });
      continue;
    }
    const relationshipNote = cell(raw.relationshipNote || raw.relationship_note) || null;
    const subGroup = cell(raw.subGroup || raw.sub_group || raw.memberGroupName);
    let groupId = null;
    if (raw.memberGroupId) {
      const gid = Number(raw.memberGroupId);
      if (Number.isInteger(gid) && gid > 0 && groups.some((g) => g.id === gid)) groupId = gid;
    } else if (subGroup) {
      groupId = groupByName.get(subGroup.toLowerCase()) || null;
    }

    let sortOrder = Number(raw.sortOrder ?? raw.sort_order);
    if (!Number.isFinite(sortOrder)) {
      sortOrder = nextSort;
      nextSort += 1;
    }

    try {
      await assertUniquePan(conn, tenantId, pan);
      const [result] = await conn.query(
        `INSERT INTO members (tenant_id, pan, display_name, email, upi, status, relationship_note, sort_order, member_group_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, pan, displayName, email, upi, status, relationshipNote, sortOrder, groupId]
      );
      existingPans.add(pan);
      seen.add(pan);
      const [rows] = await conn.query('SELECT * FROM members WHERE id = ?', [result.insertId]);
      results.push({ ok: true, pan, member: rows[0] });
    } catch (err) {
      results.push({ ok: false, pan, error: err.message || 'Could not add member' });
    }
  }

  return {
    createdCount: results.filter((r) => r.ok).length,
    failedCount: results.filter((r) => !r.ok).length,
    results,
  };
}
