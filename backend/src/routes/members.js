import { Router } from 'express';

import { pool } from '../db/pool.js';

import { AppError } from '../middleware/errorHandler.js';

import { getMemberDetail, assertUniquePan } from '../services/memberDetailService.js';

import { parsePositiveInt } from '../utils/validate.js';



const router = Router();



const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;



function normalizePan(pan) {

  const p = String(pan).toUpperCase().trim();

  if (!PAN_REGEX.test(p)) throw new AppError('Invalid PAN format (e.g. ABCDE1234F)');

  return p;

}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const UPI_REGEX = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9]{2,64}$/;

function normalizeEmail(email) {
  if (email == null || email === '') return null;
  const e = String(email).trim().toLowerCase();
  if (!EMAIL_REGEX.test(e)) throw new AppError('Invalid email address');
  return e;
}

function normalizeUpi(upi) {
  if (upi == null || upi === '') return null;
  const u = String(upi).trim().toLowerCase();
  if (!UPI_REGEX.test(u)) throw new AppError('Invalid UPI ID (e.g. name@paytm or 9876543210@ybl)');
  return u;
}



router.get('/', async (req, res, next) => {

  try {

    const [rows] = await pool.query(

      `SELECT m.*,
              fp.name AS fund_provider_name,
              mg.name AS member_group_name,
              mps.id AS share_rule_id,
              mps.fund_provider_id AS share_fund_provider_id,
              mps.provider_percent AS share_profit_provider_percent,
              mps.manager_percent AS share_profit_manager_percent,
              mps.loss_provider_percent AS share_loss_provider_percent,
              mps.loss_manager_percent AS share_loss_manager_percent,
              fp2.name AS share_provider_name
       FROM members m
       LEFT JOIN fund_providers fp ON fp.id = m.fund_provider_id
       LEFT JOIN member_groups mg ON mg.id = m.member_group_id
       LEFT JOIN member_profit_shares mps ON mps.member_id = m.id AND mps.tenant_id = m.tenant_id
       LEFT JOIN fund_providers fp2 ON fp2.id = mps.fund_provider_id
       WHERE m.tenant_id = ? ORDER BY m.sort_order, m.id`,

      [req.tenantId]

    );

    res.json(rows);

  } catch (err) {

    next(err);

  }

});



router.get('/:id/detail', async (req, res, next) => {

  try {

    const detail = await getMemberDetail(pool, req.tenantId, req.params.id);

    if (!detail) throw new AppError('Member not found', 404);

    res.json(detail);

  } catch (err) {

    next(err);

  }

});



router.post('/', async (req, res, next) => {

  try {

    const {
      pan, displayName, email, upi, status, relationshipNote, bulkGroupLabel, sortOrder, fundProviderId, memberGroupId,
    } = req.body;

    if (!pan || !displayName?.trim()) throw new AppError('PAN and display name are required');

    const normalizedPan = normalizePan(pan);

    await assertUniquePan(pool, req.tenantId, normalizedPan);

    let providerId = null;
    if (fundProviderId) {
      const pid = parsePositiveInt(fundProviderId, 'fund provider id');
      const [fp] = await pool.query(
        'SELECT id FROM fund_providers WHERE id = ? AND tenant_id = ?',
        [pid, req.tenantId]
      );
      if (!fp.length) throw new AppError('Fund provider not found', 404);
      providerId = pid;
    }

    let groupId = null;
    if (memberGroupId) {
      const gid = parsePositiveInt(memberGroupId, 'member group id');
      const [grp] = await pool.query(
        'SELECT id FROM member_groups WHERE id = ? AND tenant_id = ?',
        [gid, req.tenantId]
      );
      if (!grp.length) throw new AppError('Member group not found', 404);
      groupId = gid;
    }

    let resolvedSortOrder = Number(sortOrder);
    if (!Number.isFinite(resolvedSortOrder)) {
      const [maxRow] = await pool.query(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM members WHERE tenant_id = ?',
        [req.tenantId]
      );
      resolvedSortOrder = maxRow[0].next_order;
    }

    const [result] = await pool.query(

      `INSERT INTO members (tenant_id, pan, display_name, email, upi, status, relationship_note, bulk_group_label, sort_order, fund_provider_id, member_group_id)

       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,

      [

        req.tenantId,

        normalizedPan,

        displayName.trim(),

        normalizeEmail(email),

        normalizeUpi(upi),

        status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',

        relationshipNote?.trim() || null,

        bulkGroupLabel?.trim() || null,

        resolvedSortOrder,

        providerId,

        groupId,

      ]

    );

    const [rows] = await pool.query('SELECT * FROM members WHERE id = ?', [result.insertId]);

    res.status(201).json(rows[0]);

  } catch (err) {

    next(err);

  }

});



router.patch('/:id', async (req, res, next) => {

  try {

    const id = parsePositiveInt(req.params.id, 'member id');

    const [existing] = await pool.query(

      'SELECT * FROM members WHERE id = ? AND tenant_id = ?',

      [id, req.tenantId]

    );

    if (!existing.length) throw new AppError('Member not found', 404);



    const fields = [];

    const values = [];

    const map = {

      pan: 'pan',

      displayName: 'display_name',

      email: 'email',

      upi: 'upi',

      status: 'status',

      relationshipNote: 'relationship_note',

      bulkGroupLabel: 'bulk_group_label',

      sortOrder: 'sort_order',

      fundProviderId: 'fund_provider_id',

      memberGroupId: 'member_group_id',

    };



    for (const [key, col] of Object.entries(map)) {

      if (req.body[key] === undefined) continue;

      if (key === 'pan') {

        const p = normalizePan(req.body[key]);

        await assertUniquePan(pool, req.tenantId, p, id);

        fields.push(`${col} = ?`);

        values.push(p);

      } else if (key === 'displayName') {

        if (!req.body[key]?.trim()) throw new AppError('Display name cannot be empty');

        fields.push(`${col} = ?`);

        values.push(req.body[key].trim());

      } else if (key === 'email') {

        fields.push(`${col} = ?`);

        values.push(normalizeEmail(req.body[key]));

      } else if (key === 'upi') {

        fields.push(`${col} = ?`);

        values.push(normalizeUpi(req.body[key]));

      } else if (key === 'status') {

        if (!['ACTIVE', 'INACTIVE'].includes(req.body[key])) {

          throw new AppError('Status must be ACTIVE or INACTIVE');

        }

        fields.push(`${col} = ?`);

        values.push(req.body[key]);

      } else if (key === 'sortOrder') {

        fields.push(`${col} = ?`);

        values.push(Number.isFinite(Number(req.body[key])) ? Number(req.body[key]) : 0);

      } else if (key === 'fundProviderId') {

        if (req.body[key] === null || req.body[key] === '') {

          fields.push(`${col} = ?`);

          values.push(null);

        } else {

          const pid = parsePositiveInt(req.body[key], 'fund provider id');

          const [fp] = await pool.query(

            'SELECT id FROM fund_providers WHERE id = ? AND tenant_id = ?',

            [pid, req.tenantId]

          );

          if (!fp.length) throw new AppError('Fund provider not found', 404);

          fields.push(`${col} = ?`);

          values.push(pid);

        }

      } else if (key === 'memberGroupId') {

        if (req.body[key] === null || req.body[key] === '') {

          fields.push(`${col} = ?`);

          values.push(null);

        } else {

          const gid = parsePositiveInt(req.body[key], 'member group id');

          const [grp] = await pool.query(

            'SELECT id FROM member_groups WHERE id = ? AND tenant_id = ?',

            [gid, req.tenantId]

          );

          if (!grp.length) throw new AppError('Member group not found', 404);

          const currentGroupId = existing[0].member_group_id;
          if (currentGroupId && Number(currentGroupId) !== gid) {
            throw new AppError(
              'Member is already in a sub-group. Clear sub-group first, then assign to another.',
              409
            );
          }

          fields.push(`${col} = ?`);

          values.push(gid);

        }

      } else {

        fields.push(`${col} = ?`);

        values.push(req.body[key]?.trim?.() ?? req.body[key] ?? null);

      }

    }



    if (!fields.length) throw new AppError('No fields to update');

    values.push(id, req.tenantId);

    await pool.query(

      `UPDATE members SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`,

      values

    );

    const [rows] = await pool.query('SELECT * FROM members WHERE id = ?', [id]);

    res.json(rows[0]);

  } catch (err) {

    next(err);

  }

});



router.delete('/:id', async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id, 'member id');
    const [existing] = await pool.query(
      'SELECT id FROM members WHERE id = ? AND tenant_id = ?',
      [id, req.tenantId]
    );
    if (!existing.length) throw new AppError('Member not found', 404);

    const checks = [
      ['ipo_applications', 'IPO applications'],
      ['member_ledger_entries', 'transaction history'],
      ['member_issues', 'submitted issues'],
      ['member_profit_shares', 'profit share rules'],
    ];

    for (const [table] of checks) {
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM ${table} WHERE member_id = ? AND tenant_id = ?`,
        [id, req.tenantId]
      );
      if (Number(rows[0].cnt) > 0) {
        throw new AppError(
          'Members with history cannot be deleted. Set status to Inactive instead — their records will be kept.',
          409
        );
      }
    }

    await pool.query('DELETE FROM members WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});



export default router;

