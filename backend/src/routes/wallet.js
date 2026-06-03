import { Router } from 'express';
import { pool } from '../db/pool.js';
import { ensureWallet } from '../services/walletService.js';
import { listBankAccounts } from '../services/bankAccountService.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const conn = await pool.getConnection();
    try {
      const wallet = await ensureWallet(conn, req.tenantId);
      const accounts = await listBankAccounts(conn, req.tenantId);
      res.json({
        balance: Number(wallet.balance),
        accounts,
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
    const [rows] = await pool.query(
      `SELECT wt.*, mba.label as bank_account_label
       FROM wallet_transactions wt
       LEFT JOIN manager_bank_accounts mba ON mba.id = wt.bank_account_id
       WHERE wt.tenant_id = ?
       ORDER BY wt.txn_date DESC, wt.id DESC LIMIT 500`,
      [req.tenantId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
