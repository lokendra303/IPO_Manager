import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  listMemberGroups,
  assertGroupNameUnique,
  assignMembersToGroup,
} from '../services/memberGroupService.js';
import { parsePositiveInt } from '../utils/validate.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const groups = await listMemberGroups(pool, req.tenantId);
    res.json(groups);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const name = req.body.name?.trim();
    if (!name) throw new AppError('Group name is required');
    await assertGroupNameUnique(pool, req.tenantId, name);

    const sortOrder = Number.isFinite(Number(req.body.sortOrder)) ? Number(req.body.sortOrder) : 0;
    const [result] = await pool.query(
      'INSERT INTO member_groups (tenant_id, name, sort_order) VALUES (?, ?, ?)',
      [req.tenantId, name, sortOrder]
    );

    const memberIds = req.body.memberIds;
    if (Array.isArray(memberIds) && memberIds.length) {
      await withTransaction((conn) =>
        assignMembersToGroup(conn, req.tenantId, result.insertId, memberIds)
      );
    }

    const groups = await listMemberGroups(pool, req.tenantId);
    const created = groups.find((g) => g.id === result.insertId);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id, 'group id');
    const [existing] = await pool.query(
      'SELECT id FROM member_groups WHERE id = ? AND tenant_id = ?',
      [id, req.tenantId]
    );
    if (!existing.length) throw new AppError('Group not found', 404);

    const fields = [];
    const values = [];

    if (req.body.name !== undefined) {
      const name = req.body.name?.trim();
      if (!name) throw new AppError('Group name cannot be empty');
      await assertGroupNameUnique(pool, req.tenantId, name, id);
      fields.push('name = ?');
      values.push(name);
    }
    if (req.body.sortOrder !== undefined) {
      fields.push('sort_order = ?');
      values.push(Number.isFinite(Number(req.body.sortOrder)) ? Number(req.body.sortOrder) : 0);
    }

    if (fields.length) {
      values.push(id, req.tenantId);
      await pool.query(
        `UPDATE member_groups SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`,
        values
      );
    }

    const groups = await listMemberGroups(pool, req.tenantId);
    res.json(groups.find((g) => g.id === id));
  } catch (err) {
    next(err);
  }
});

router.put('/:id/members', async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id, 'group id');
    const memberIds = Array.isArray(req.body.memberIds) ? req.body.memberIds : [];
    await withTransaction((conn) => assignMembersToGroup(conn, req.tenantId, id, memberIds));
    const groups = await listMemberGroups(pool, req.tenantId);
    res.json(groups.find((g) => g.id === id));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id, 'group id');
    const [existing] = await pool.query(
      'SELECT id FROM member_groups WHERE id = ? AND tenant_id = ?',
      [id, req.tenantId]
    );
    if (!existing.length) throw new AppError('Group not found', 404);

    await pool.query(
      'UPDATE members SET member_group_id = NULL WHERE member_group_id = ? AND tenant_id = ?',
      [id, req.tenantId]
    );
    await pool.query('DELETE FROM member_groups WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
