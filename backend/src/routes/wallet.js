import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { ensureWallet } from '../services/walletService.js';
import { listBankAccounts } from '../services/bankAccountService.js';
import {
  getManagerProfitSummary,
  personalWithdraw,
} from '../services/managerProfitService.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const conn = await pool.getConnection();
    try {
      const wallet = await ensureWallet(conn, req.tenantId);
      const accounts = await listBankAccounts(conn, req.tenantId);
      const managerProfit = await getManagerProfitSummary(conn, req.tenantId);
      res.json({
        balance: Number(wallet.balance),
        accounts,
        managerProfit,
      });
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.get('/transactions', async (req, res, next) => {
  try {
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.trunc(limitRaw), 1), 500)
      : 500;
    const [rows] = await pool.query(
      `SELECT wt.*, mba.label as bank_account_label
       FROM wallet_transactions wt
       LEFT JOIN manager_bank_accounts mba ON mba.id = wt.bank_account_id
       WHERE wt.tenant_id = ?
       ORDER BY wt.txn_date DESC, wt.id DESC LIMIT ?`,
      [req.tenantId, limit]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/personal-withdraw', async (req, res, next) => {
  try {
    const result = await withTransaction((conn) =>
      personalWithdraw(conn, {
        tenantId: req.tenantId,
        amount: req.body.amount,
        bankAccountId: req.body.bankAccountId,
        notes: req.body.notes,
        userId: req.user?.id,
        txnDate: req.body.txnDate,
      })
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
