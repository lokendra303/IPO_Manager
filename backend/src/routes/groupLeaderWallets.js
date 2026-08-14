import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import {
  listGroupLeaderWallets,
  getGroupLeaderWalletDetail,
  getGroupLeaderWalletsOverview,
  createGroupLeaderTransaction,
  deleteGroupLeaderTransaction,
} from '../services/groupLeaderWalletService.js';
import { parsePositiveInt } from '../utils/validate.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const conn = await pool.getConnection();
    try {
      const rows = await listGroupLeaderWallets(conn, req.tenantId);
      res.json(rows);
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.get('/overview', async (req, res, next) => {
  try {
    const conn = await pool.getConnection();
    try {
      const overview = await getGroupLeaderWalletsOverview(conn, req.tenantId);
      res.json(overview);
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.get('/:groupId', async (req, res, next) => {
  try {
    const groupId = parsePositiveInt(req.params.groupId, 'group id');
    const conn = await pool.getConnection();
    try {
      const detail = await getGroupLeaderWalletDetail(conn, req.tenantId, groupId);
      res.json(detail);
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/:groupId/transactions', async (req, res, next) => {
  try {
    const groupId = parsePositiveInt(req.params.groupId, 'group id');
    const { type, amount, txnDate, notes, ipoId } = req.body;
    const result = await withTransaction((conn) =>
      createGroupLeaderTransaction(conn, {
        tenantId: req.tenantId,
        groupId,
        type,
        amount,
        txnDate,
        notes,
        ipoId,
        userId: req.user.userId,
      })
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/:groupId/transactions/:txnId', async (req, res, next) => {
  try {
    const groupId = parsePositiveInt(req.params.groupId, 'group id');
    const txnId = parsePositiveInt(req.params.txnId, 'transaction id');
    const detail = await withTransaction((conn) =>
      deleteGroupLeaderTransaction(conn, req.tenantId, groupId, txnId)
    );
    res.json(detail);
  } catch (err) {
    next(err);
  }
});

export default router;
