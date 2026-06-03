import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { parsePositiveInt } from '../utils/validate.js';
import {
  listBankAccounts,
  getBankAccount,
  syncOwnerWalletTotal,
} from '../services/bankAccountService.js';
import { transferBetweenBankAccounts } from '../services/walletService.js';
import { parseDate } from '../utils/validate.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const conn = await pool.getConnection();
    try {
      const accounts = await listBankAccounts(conn, req.tenantId, { activeOnly: false });
      const totalBalance = accounts
        .filter((a) => a.is_active)
        .reduce((s, a) => s + a.balance, 0);
      res.json({ accounts, totalBalance });
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { label, bankName, accountNumber, sortOrder } = req.body;
    if (!label?.trim()) throw new AppError('Account label is required');

    const row = await withTransaction(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO manager_bank_accounts
         (tenant_id, label, bank_name, account_number, is_default, is_active, balance, sort_order)
         VALUES (?, ?, ?, ?, 0, 1, 0, ?)`,
        [
          req.tenantId,
          label.trim(),
          bankName?.trim() || null,
          accountNumber?.trim() || null,
          sortOrder ?? 0,
        ]
      );
      await syncOwnerWalletTotal(conn, req.tenantId);
      return getBankAccount(conn, req.tenantId, result.insertId);
    });

    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const accountId = parsePositiveInt(req.params.id, 'bank account id');
    const { label, bankName, accountNumber, isActive, sortOrder } = req.body;

    const row = await withTransaction(async (conn) => {
      await getBankAccount(conn, req.tenantId, accountId);

      const fields = [];
      const values = [];
      if (label !== undefined) {
        if (!label?.trim()) throw new AppError('Account label cannot be empty');
        fields.push('label = ?');
        values.push(label.trim());
      }
      if (bankName !== undefined) {
        fields.push('bank_name = ?');
        values.push(bankName?.trim() || null);
      }
      if (accountNumber !== undefined) {
        fields.push('account_number = ?');
        values.push(accountNumber?.trim() || null);
      }
      if (isActive !== undefined) {
        fields.push('is_active = ?');
        values.push(isActive ? 1 : 0);
      }
      if (sortOrder !== undefined) {
        fields.push('sort_order = ?');
        values.push(sortOrder);
      }
      if (!fields.length) throw new AppError('No fields to update');

      values.push(accountId, req.tenantId);
      await conn.query(
        `UPDATE manager_bank_accounts SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`,
        values
      );
      await syncOwnerWalletTotal(conn, req.tenantId);
      return getBankAccount(conn, req.tenantId, accountId);
    });

    res.json(row);
  } catch (err) {
    next(err);
  }
});

router.post('/transfer', async (req, res, next) => {
  try {
    const { fromBankAccountId, toBankAccountId, amount, txnDate, notes } = req.body;
    if (!fromBankAccountId || !toBankAccountId) {
      throw new AppError('From and to bank accounts are required');
    }

    const result = await withTransaction((conn) =>
      transferBetweenBankAccounts(conn, {
        tenantId: req.tenantId,
        fromBankAccountId,
        toBankAccountId,
        amount,
        txnDate: txnDate ? parseDate(txnDate, 'transfer date') : undefined,
        notes,
        userId: req.user.userId,
      })
    );

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
