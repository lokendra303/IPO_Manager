import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { parsePositiveInt, parseOptionalAmount, validateAllotmentStatus } from '../utils/validate.js';
import {
  tryAutoDistributeApplication,
  revokeProfitShareDistribution,
  isIpoFinancialsFrozen,
  assertIpoApplicationsEditable,
} from '../services/profitShareService.js';
import { normalizeInvestorCategory } from '../constants/ipoCategories.js';

const router = Router();

function computeProfitLoss(withdrawalMoney, amount) {
  if (withdrawalMoney == null || withdrawalMoney === '') return null;
  const withdrawal = Number(withdrawalMoney);
  const distributed = Number(amount ?? 0);
  if (Number.isNaN(withdrawal)) return null;
  return Math.round((withdrawal - distributed) * 100) / 100;
}

router.patch('/bulk', async (req, res, next) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates) || !updates.length) {
      throw new AppError('Updates array required');
    }

    const autoDistributions = [];

    const updatedIds = await withTransaction(async (conn) => {
      const ids = [];

      for (const u of updates) {
        if (!u?.id) continue;
        const appId = parsePositiveInt(u.id, 'application id');

        const [existing] = await conn.query(
          `SELECT a.*, i.allowed_categories, i.listing_date
           FROM ipo_applications a
           JOIN ipos i ON i.id = a.ipo_id
           WHERE a.id = ? AND a.tenant_id = ?`,
          [appId, req.tenantId]
        );
        if (!existing.length) {
          throw new AppError(`Application #${appId} not found`, 404);
        }

        const row = existing[0];
        await assertIpoApplicationsEditable(conn, req.tenantId, row.ipo_id);
        const ipoClosed = await isIpoFinancialsFrozen(conn, req.tenantId, row.ipo_id);
        validateAllotmentStatus(u.allotmentStatus);

        const fields = [];
        const values = [];

        let effectiveAmount = Number(row.amount);
        if (u.amount !== undefined) {
          const amt = parseOptionalAmount(u.amount, 'amount');
          if (amt !== null && amt <= 0) throw new AppError('Application amount must be positive');
          fields.push('amount = ?');
          values.push(amt);
          effectiveAmount = amt;
        }

        let effectiveWithdrawal = row.withdrawal_money;
        if (u.withdrawalMoney !== undefined) {
          effectiveWithdrawal =
            u.withdrawalMoney === null || u.withdrawalMoney === ''
              ? null
              : Number(u.withdrawalMoney);
          if (effectiveWithdrawal != null && Number.isNaN(effectiveWithdrawal)) {
            throw new AppError(`Invalid withdrawal amount for app #${appId}`);
          }
          if (effectiveWithdrawal != null && !row.listing_date) {
            throw new AppError('IPO is not listed yet. Wait for listing before entering withdrawal money.');
          }
          fields.push('withdrawal_money = ?');
          values.push(effectiveWithdrawal);
        }

        const nextAllotment = u.allotmentStatus ?? row.allotment_status;
        const ipoListed = Boolean(row.listing_date);

        if (u.allotmentStatus !== undefined) {
          fields.push('allotment_status = ?');
          values.push(u.allotmentStatus);
          if (u.allotmentStatus === 'NOT_ALLOTED' || u.allotmentStatus === 'NOT_APPLIED') {
            fields.push('profit_loss = ?');
            values.push(null);
            fields.push('withdrawal_money = ?');
            values.push(null);
            effectiveWithdrawal = null;
          }
        }

        if (nextAllotment === 'ALLOTED' && ipoListed) {
          const withdrawalForCalc =
            u.withdrawalMoney !== undefined ? effectiveWithdrawal : row.withdrawal_money;
          if (withdrawalForCalc != null && withdrawalForCalc !== '') {
            const computed = computeProfitLoss(withdrawalForCalc, effectiveAmount);
            fields.push('profit_loss = ?');
            values.push(computed);
          } else if (u.profitLoss !== undefined) {
            fields.push('profit_loss = ?');
            values.push(u.profitLoss === null ? null : Number(u.profitLoss));
          }
        } else if (u.profitLoss !== undefined && u.allotmentStatus === undefined) {
          if (row.allotment_status !== 'ALLOTED') {
            throw new AppError(`Cannot set P&L unless allotment is ALLOTED (app #${appId})`);
          }
          if (!ipoListed) {
            throw new AppError('IPO is not listed yet. Wait for listing before entering P&L.');
          }
          fields.push('profit_loss = ?');
          values.push(u.profitLoss === null ? null : Number(u.profitLoss));
        }

        if (u.remarks !== undefined) {
          fields.push('remarks = ?');
          values.push(u.remarks || null);
        }
        if (u.dateReceived !== undefined) {
          fields.push('date_received = ?');
          values.push(u.dateReceived ? new Date(u.dateReceived) : null);
        }
        if (u.trnsReceived !== undefined) {
          fields.push('trns_received = ?');
          values.push(u.trnsReceived || null);
        }
        if (u.dateGiven !== undefined) {
          fields.push('date_given = ?');
          values.push(u.dateGiven ? new Date(u.dateGiven) : null);
        }
        if (u.trnsGiven !== undefined) {
          fields.push('trns_given = ?');
          values.push(u.trnsGiven || null);
        }
        if (u.investorCategory !== undefined) {
          fields.push('investor_category = ?');
          values.push(normalizeInvestorCategory(u.investorCategory, row.allowed_categories));
        }

        if (!fields.length) continue;

        const willClearPnL =
          u.allotmentStatus === 'NOT_ALLOTED'
          || u.allotmentStatus === 'NOT_APPLIED'
          || u.profitLoss === null
          || u.withdrawalMoney === null;

        const profitUpdated =
          u.profitLoss !== undefined
          || u.withdrawalMoney !== undefined
          || (u.amount !== undefined && row.withdrawal_money != null);

        values.push(appId, req.tenantId);
        await conn.query(
          `UPDATE ipo_applications SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`,
          values
        );
        ids.push(appId);

        if (willClearPnL && !ipoClosed) {
          await revokeProfitShareDistribution(conn, {
            tenantId: req.tenantId,
            applicationId: appId,
            userId: req.user.userId,
          });
        }

        const mayTriggerShare =
          !ipoClosed
          && !willClearPnL
          && (profitUpdated || u.allotmentStatus === 'ALLOTED');

        if (mayTriggerShare) {
          const result = await tryAutoDistributeApplication(conn, {
            tenantId: req.tenantId,
            applicationId: appId,
            userId: req.user.userId,
          });
          autoDistributions.push(result);
        }
      }

      if (!ids.length) throw new AppError('No valid updates to apply');
      return ids;
    });

    const placeholders = updatedIds.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT a.*, m.display_name, m.pan,
              psd.id AS profit_share_distribution_id,
              psd.provider_amount AS share_provider_amount,
              psd.manager_amount AS share_manager_amount,
              psd.member_amount AS share_member_amount,
              psd.distributed_at AS share_distributed_at,
              psd.pnl_type AS share_pnl_type
       FROM ipo_applications a
       JOIN members m ON m.id = a.member_id
       LEFT JOIN profit_share_distributions psd ON psd.ipo_application_id = a.id
       WHERE a.id IN (${placeholders}) AND a.tenant_id = ?`,
      [...updatedIds, req.tenantId]
    );

    res.json({ applications: rows, autoDistributions });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/allotment', async (req, res, next) => {
  try {
    const applicationId = parsePositiveInt(req.params.id, 'application id');
    const { saveAllotmentResult, claimNextPending, getAllotmentQueue } = await import(
      '../services/ipo/allotmentQueueService.js'
    );
    const saved = await withTransaction((conn) =>
      saveAllotmentResult(conn, {
        tenantId: req.tenantId,
        applicationId,
        result: req.body.result || req.body.allotmentStatus,
        allottedLots: req.body.allottedLots,
        applicationNumber: req.body.applicationNumber,
      })
    );

    let next = { applicant: null, done: true };
    if (req.body.checkNext !== false) {
      next = await withTransaction((conn) =>
        claimNextPending(conn, { tenantId: req.tenantId, ipoId: saved.ipoId })
      );
    }
    const queue = await withTransaction((conn) =>
      getAllotmentQueue(conn, { tenantId: req.tenantId, ipoId: saved.ipoId })
    );
    res.json({
      success: true,
      status: saved.status,
      next: next.applicant,
      done: Boolean(next.done),
      counts: queue.counts,
      lastChecked: queue.lastChecked,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
