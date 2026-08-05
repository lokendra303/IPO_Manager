import { Router } from 'express';

import { pool, withTransaction } from '../db/pool.js';

import { AppError } from '../middleware/errorHandler.js';

import {
  creditWallet,
  debitWallet,
  creditWalletFromAccounts,
  debitWalletFromAccounts,
  applyWalletDelta,
} from '../services/walletService.js';
import { requireBankAccountId, getBankAccount, assertAccountAllocations, syncOwnerWalletTotal } from '../services/bankAccountService.js';

import { parsePositiveInt, parseDate } from '../utils/validate.js';



const router = Router();



function safeParseContact(info) {

  if (!info) return null;

  if (typeof info === 'object') return info;

  try {

    return JSON.parse(info);

  } catch {

    return null;

  }

}



router.get('/', async (req, res, next) => {

  try {

    const [providers] = await pool.query(

      'SELECT * FROM fund_providers WHERE tenant_id = ? ORDER BY name',

      [req.tenantId]

    );



    const [balances] = await pool.query(
      `SELECT fund_provider_id,
              SUM(amount) AS principal_balance,
              SUM(COALESCE(provider_profit, 0)) AS accrued_profit
       FROM provider_transactions WHERE tenant_id = ?
       GROUP BY fund_provider_id`,
      [req.tenantId]
    );

    const balanceMap = Object.fromEntries(
      balances.map((b) => {
        const principal = Number(b.principal_balance);
        const accrued = Number(b.accrued_profit);
        return [
          b.fund_provider_id,
          { principal, accrued, total: principal + accrued },
        ];
      })
    );

    res.json(
      providers.map((p) => {
        const bal = balanceMap[p.id] || { principal: 0, accrued: 0, total: 0 };
        return {
          ...p,
          contact_info: safeParseContact(p.contact_info),
          principalBalance: bal.principal,
          accruedProfit: bal.accrued,
          totalBalance: bal.total,
          ledgerBalance: bal.principal,
          totalProfit: bal.accrued,
        };
      })
    );

  } catch (err) {

    next(err);

  }

});



router.post('/', async (req, res, next) => {

  try {

    const { name, contactInfo, defaultAccountLabel } = req.body;

    if (!name?.trim()) throw new AppError('Provider name is required');



    const [result] = await pool.query(

      `INSERT INTO fund_providers (tenant_id, name, contact_info, default_account_label)

       VALUES (?, ?, ?, ?)`,

      [

        req.tenantId,

        name.trim(),

        contactInfo ? JSON.stringify(contactInfo) : null,

        defaultAccountLabel?.trim() || null,

      ]

    );

    const [rows] = await pool.query('SELECT * FROM fund_providers WHERE id = ?', [result.insertId]);

    const row = rows[0];

    row.contact_info = safeParseContact(row.contact_info);

    res.status(201).json(row);

  } catch (err) {

    next(err);

  }

});



router.patch('/:id', async (req, res, next) => {

  try {

    const providerId = parsePositiveInt(req.params.id, 'provider id');

    const { name, contactInfo, defaultAccountLabel } = req.body;

    const [existing] = await pool.query(

      'SELECT * FROM fund_providers WHERE id = ? AND tenant_id = ?',

      [providerId, req.tenantId]

    );

    if (!existing.length) throw new AppError('Provider not found', 404);



    const fields = [];

    const values = [];

    if (name !== undefined) {

      if (!name?.trim()) throw new AppError('Provider name cannot be empty');

      fields.push('name = ?');

      values.push(name.trim());

    }

    if (contactInfo !== undefined) {

      fields.push('contact_info = ?');

      values.push(contactInfo ? JSON.stringify(contactInfo) : null);

    }

    if (defaultAccountLabel !== undefined) {

      fields.push('default_account_label = ?');

      values.push(defaultAccountLabel?.trim() || null);

    }

    if (!fields.length) throw new AppError('No fields to update');



    values.push(providerId, req.tenantId);

    await pool.query(`UPDATE fund_providers SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`, values);



    const [rows] = await pool.query('SELECT * FROM fund_providers WHERE id = ?', [providerId]);

    const row = rows[0];

    row.contact_info = safeParseContact(row.contact_info);

    res.json(row);

  } catch (err) {

    next(err);

  }

});



router.get('/:id/transactions', async (req, res, next) => {

  try {

    const providerId = parsePositiveInt(req.params.id, 'provider id');

    const [provider] = await pool.query(

      'SELECT * FROM fund_providers WHERE id = ? AND tenant_id = ?',

      [providerId, req.tenantId]

    );

    if (!provider.length) throw new AppError('Provider not found', 404);



    const [txns] = await pool.query(

      `SELECT * FROM provider_transactions

       WHERE fund_provider_id = ? AND tenant_id = ?

       ORDER BY txn_date DESC, id DESC`,

      [providerId, req.tenantId]

    );

    res.json(txns);

  } catch (err) {

    next(err);

  }

});



router.post('/:id/transactions', async (req, res, next) => {

  try {

    const providerId = parsePositiveInt(req.params.id, 'provider id');

    const { amount, txnDate, accountLabel, bankAccountId, accountCredits, notes, providerProfit, creditToWallet } = req.body;



    const amt = Number(amount);

    if (amount === undefined || amount === null || amount === '' || Number.isNaN(amt) || amt === 0) {

      throw new AppError('Amount is required and must be non-zero');

    }



    const [provider] = await pool.query(

      'SELECT * FROM fund_providers WHERE id = ? AND tenant_id = ?',

      [providerId, req.tenantId]

    );

    if (!provider.length) throw new AppError('Provider not found', 404);



    const txnDateVal = parseDate(txnDate, 'transaction date');

    let profitVal = null;

    if (providerProfit !== undefined && providerProfit !== null && providerProfit !== '') {

      profitVal = Number(providerProfit);

      if (Number.isNaN(profitVal)) throw new AppError('Invalid provider profit amount');

    }

    const isAccrualOnly = creditToWallet === false;
    const principalAmount = isAccrualOnly ? 0 : amt;
    const accruedProfitAmount = isAccrualOnly ? (profitVal ?? amt) : profitVal;
    if (isAccrualOnly && (accruedProfitAmount === 0 || Number.isNaN(accruedProfitAmount))) {
      throw new AppError('Profit share amount is required');
    }

    const result = await withTransaction(async (conn) => {
      const absAmt = Math.abs(amt);
      let resolvedAccountId = null;
      let resolvedAccountLabel = accountLabel?.trim() || null;
      let normalizedCredits = null;
      let normalizedDebits = null;

      if (creditToWallet !== false) {
        if (accountCredits?.length) {
          normalizedCredits = await assertAccountAllocations(
            conn,
            req.tenantId,
            accountCredits,
            absAmt,
            'deposit'
          );
          resolvedAccountLabel = normalizedCredits.map((c) => `${c.label}: ₹${c.amount}`).join(', ');
          resolvedAccountId = normalizedCredits.length === 1 ? normalizedCredits[0].bankAccountId : null;
        } else {
          resolvedAccountId = await requireBankAccountId(conn, req.tenantId, bankAccountId);
          const account = await getBankAccount(conn, req.tenantId, resolvedAccountId);
          resolvedAccountLabel = account.label;
        }
      } else if (bankAccountId) {
        resolvedAccountId = await requireBankAccountId(conn, req.tenantId, bankAccountId);
        const account = await getBankAccount(conn, req.tenantId, resolvedAccountId);
        resolvedAccountLabel = account.label;
      }

      if (creditToWallet !== false && amt < 0 && req.body.accountDebits?.length) {
        normalizedDebits = await assertAccountAllocations(
          conn,
          req.tenantId,
          req.body.accountDebits,
          absAmt,
          'repayment'
        );
        resolvedAccountLabel = normalizedDebits.map((d) => `${d.label}: ₹${d.amount}`).join(', ');
        resolvedAccountId = normalizedDebits.length === 1 ? normalizedDebits[0].bankAccountId : null;
      }

      const accrualLabel =
        isAccrualOnly && !resolvedAccountLabel
          ? (accruedProfitAmount >= 0 ? 'P&L Share (Manual)' : 'P&L Share (Manual Loss)')
          : resolvedAccountLabel;

      const [txnResult] = await conn.query(
        `INSERT INTO provider_transactions
         (fund_provider_id, tenant_id, amount, txn_date, account_label, bank_account_id, notes, provider_profit, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          providerId,
          req.tenantId,
          principalAmount,
          txnDateVal,
          accrualLabel,
          resolvedAccountId,
          notes?.trim() || null,
          accruedProfitAmount,
          req.user.userId,
        ]
      );

      let newBalance = null;
      const txnNotes = notes?.trim() || (amt > 0 ? `Fund from ${provider[0].name}` : `Repayment to ${provider[0].name}`);

      if (creditToWallet !== false) {
        if (amt > 0) {
          if (normalizedCredits?.length) {
            newBalance = await creditWalletFromAccounts(conn, {
              tenantId: req.tenantId,
              credits: normalizedCredits,
              type: 'PROVIDER_IN',
              refType: 'provider_transaction',
              refId: txnResult.insertId,
              txnDate: txnDateVal,
              notes: txnNotes,
              userId: req.user.userId,
            });
          } else {
            newBalance = await creditWallet(conn, {
              tenantId: req.tenantId,
              amount: amt,
              bankAccountId: resolvedAccountId,
              type: 'PROVIDER_IN',
              refType: 'provider_transaction',
              refId: txnResult.insertId,
              txnDate: txnDateVal,
              notes: txnNotes,
              userId: req.user.userId,
            });
          }
        } else if (normalizedDebits?.length) {
          newBalance = await debitWalletFromAccounts(conn, {
            tenantId: req.tenantId,
            debits: normalizedDebits,
            type: 'PROVIDER_OUT',
            refType: 'provider_transaction',
            refId: txnResult.insertId,
            txnDate: txnDateVal,
            notes: txnNotes,
            userId: req.user.userId,
          });
        } else {
          newBalance = await debitWallet(conn, {
            tenantId: req.tenantId,
            amount: absAmt,
            bankAccountId: resolvedAccountId,
            type: 'PROVIDER_OUT',
            refType: 'provider_transaction',
            refId: txnResult.insertId,
            txnDate: txnDateVal,
            notes: txnNotes,
            userId: req.user.userId,
          });
        }
      }

      return { transactionId: txnResult.insertId, walletBalance: newBalance };
    });



    const [txn] = await pool.query('SELECT * FROM provider_transactions WHERE id = ?', [result.transactionId]);

    res.status(201).json({ transaction: txn[0], walletBalance: result.walletBalance });

  } catch (err) {

    next(err);

  }

});



router.delete('/:id/transactions/:txnId', async (req, res, next) => {
  try {
    const providerId = parsePositiveInt(req.params.id, 'provider id');
    const txnId = parsePositiveInt(req.params.txnId, 'transaction id');

    const result = await withTransaction(async (conn) => {
      const [existing] = await conn.query(
        `SELECT * FROM provider_transactions
         WHERE id = ? AND fund_provider_id = ? AND tenant_id = ?`,
        [txnId, providerId, req.tenantId]
      );
      if (!existing.length) throw new AppError('Transaction not found', 404);

      const txn = existing[0];
      const label = txn.account_label || '';
      if (label === 'P&L Share' || label === 'P&L Share (Loss)') {
        throw new AppError(
          'This entry was created by IPO P&L split. Change allotment/P&L on the IPO page to reverse it.',
          400
        );
      }

      const [walletTxns] = await conn.query(
        `SELECT id, bank_account_id, amount FROM wallet_transactions
         WHERE tenant_id = ? AND ref_type = 'provider_transaction' AND ref_id = ?`,
        [req.tenantId, txnId]
      );

      const now = new Date();
      for (const wt of walletTxns) {
        const amount = Number(wt.amount);
        if (!amount) continue;
        await applyWalletDelta(conn, {
          tenantId: req.tenantId,
          delta: -amount,
          bankAccountId: wt.bank_account_id,
          type: 'ADJUSTMENT',
          refType: 'provider_transaction_reversal',
          refId: txnId,
          txnDate: now,
          notes: `Rollback — ${txn.notes?.trim() || 'provider transaction'}`,
          userId: req.user.userId,
          allowNegativeBalance: true,
        });
      }

      await conn.query('DELETE FROM provider_transactions WHERE id = ?', [txnId]);
      const walletBalance = await syncOwnerWalletTotal(conn, req.tenantId);
      return { walletBalance, amount: Number(txn.amount) };
    });

    res.json({
      rolledBack: true,
      transactionId: txnId,
      amount: result.amount,
      walletBalance: result.walletBalance,
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/transactions/:txnId', async (req, res, next) => {

  try {

    const providerId = parsePositiveInt(req.params.id, 'provider id');

    const txnId = parsePositiveInt(req.params.txnId, 'transaction id');

    const { amount, txnDate, notes, providerProfit } = req.body;



    const result = await withTransaction(async (conn) => {

      const [existing] = await conn.query(

        `SELECT * FROM provider_transactions

         WHERE id = ? AND fund_provider_id = ? AND tenant_id = ?`,

        [txnId, providerId, req.tenantId]

      );

      if (!existing.length) throw new AppError('Transaction not found', 404);

      const label = existing[0].account_label || '';
      if (label === 'P&L Share' || label === 'P&L Share (Loss)') {
        throw new AppError(
          'This entry was created by IPO P&L split. Change allotment/P&L on the IPO page to reverse it.',
          400
        );
      }

      const [walletLink] = await conn.query(
        `SELECT id FROM wallet_transactions
         WHERE ref_type = 'provider_transaction' AND ref_id = ? AND tenant_id = ? LIMIT 1`,
        [txnId, req.tenantId]
      );
      const hasWalletLink = walletLink.length > 0;
      const isReinvest = label === 'Profit Reinvested';

      if (amount !== undefined) {
        const amt = Number(amount);
        if (Number.isNaN(amt) || amt === 0) throw new AppError('Amount must be non-zero');
        const profitOnRow = existing[0].provider_profit != null ? Number(existing[0].provider_profit) : null;
        if (!hasWalletLink && !isReinvest && profitOnRow != null && profitOnRow !== 0 && amt !== 0) {
          throw new AppError(
            'This accrual payout has no wallet link — amount must stay 0; only provider profit applies',
            400
          );
        }
      }

      const updates = [];
      const values = [];

      if (amount !== undefined) {
        const amt = Number(amount);
        updates.push('amount = ?');
        values.push(amt);
      }

      if (txnDate !== undefined) {

        updates.push('txn_date = ?');

        values.push(parseDate(txnDate, 'transaction date'));

      }

      if (notes !== undefined) {

        updates.push('notes = ?');

        values.push(notes?.trim() || null);

      }

      if (providerProfit !== undefined) {

        const profitVal = providerProfit === null || providerProfit === '' ? null : Number(providerProfit);

        if (profitVal !== null && Number.isNaN(profitVal)) throw new AppError('Invalid provider profit amount');

        updates.push('provider_profit = ?');

        values.push(profitVal);

      }



      if (!updates.length) throw new AppError('No fields to update');



      values.push(txnId, providerId, req.tenantId);

      await conn.query(

        `UPDATE provider_transactions SET ${updates.join(', ')} WHERE id = ? AND fund_provider_id = ? AND tenant_id = ?`,

        values

      );



      const walletBalance = await syncOwnerWalletTotal(conn, req.tenantId);

      return { walletBalance };

    });



    const [txn] = await pool.query('SELECT * FROM provider_transactions WHERE id = ?', [txnId]);

    res.json({ transaction: txn[0], walletBalance: result.walletBalance });

  } catch (err) {

    next(err);

  }

});



router.post('/:id/reinvest-profit', async (req, res, next) => {
  try {
    const providerId = parsePositiveInt(req.params.id, 'provider id');
    const reinvestAmt = Number(req.body.amount);
    if (!reinvestAmt || Number.isNaN(reinvestAmt) || reinvestAmt <= 0) {
      throw new AppError('Reinvest amount must be greater than zero', 400);
    }

    const [provider] = await pool.query(
      'SELECT * FROM fund_providers WHERE id = ? AND tenant_id = ?',
      [providerId, req.tenantId]
    );
    if (!provider.length) throw new AppError('Provider not found', 404);

    const txnDateVal = parseDate(req.body.txnDate, 'transaction date');
    const notes = req.body.notes?.trim() || 'Profit reinvested into principal';

    const result = await withTransaction(async (conn) => {
      const [accruedRows] = await conn.query(
        `SELECT COALESCE(SUM(provider_profit), 0) AS accrued
         FROM provider_transactions
         WHERE fund_provider_id = ? AND tenant_id = ?`,
        [providerId, req.tenantId]
      );
      const accrued = Number(accruedRows[0]?.accrued ?? 0);
      if (reinvestAmt > accrued + 0.001) {
        throw new AppError(
          `Cannot reinvest ${reinvestAmt}. Accrued profit available: ${accrued.toFixed(2)}`,
          400
        );
      }

      // Ledger only: P&L share cash is already in the wallet from IPO Receive
      // (RETURN_IN includes provider share). Crediting wallet again would double-count.
      const [txnResult] = await conn.query(
        `INSERT INTO provider_transactions
         (fund_provider_id, tenant_id, amount, txn_date, account_label, bank_account_id, notes, provider_profit, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          providerId,
          req.tenantId,
          reinvestAmt,
          txnDateVal,
          'Profit Reinvested',
          null,
          notes,
          -reinvestAmt,
          req.user.userId,
        ]
      );

      const walletBalance = await syncOwnerWalletTotal(conn, req.tenantId);

      return {
        transactionId: txnResult.insertId,
        accruedAfter: accrued - reinvestAmt,
        walletBalance,
      };
    });

    const [txn] = await pool.query('SELECT * FROM provider_transactions WHERE id = ?', [result.transactionId]);
    res.status(201).json({
      transaction: txn[0],
      accruedProfitAfter: result.accruedAfter,
      walletBalance: result.walletBalance,
      message: `${reinvestAmt} moved from accrued profit into principal (cash already in wallet from IPO returns)`,
    });
  } catch (err) {
    next(err);
  }
});



export default router;

