import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { parsePositiveInt, parseOptionalAmount, validateAllotmentStatus } from '../utils/validate.js';
import { tryAutoDistributeApplication } from '../services/profitShareService.js';
import { normalizeInvestorCategory } from '../constants/ipoCategories.js';

const router = Router();

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
          `SELECT a.*, i.allowed_categories
           FROM ipo_applications a
           JOIN ipos i ON i.id = a.ipo_id
           WHERE a.id = ? AND a.tenant_id = ?`,
          [appId, req.tenantId]
        );
        if (!existing.length) {
          throw new AppError(`Application #${appId} not found`, 404);
        }

        const row = existing[0];
        validateAllotmentStatus(u.allotmentStatus);

        const fields = [];
        const values = [];

        if (u.allotmentStatus !== undefined) {
          fields.push('allotment_status = ?');
          values.push(u.allotmentStatus);
          if (u.allotmentStatus === 'NOT_ALLOTED') {
            fields.push('profit_loss = ?');
            values.push(null);
          } else if (u.allotmentStatus === 'ALLOTED' && u.profitLoss !== undefined) {
            fields.push('profit_loss = ?');
            values.push(u.profitLoss === null ? null : Number(u.profitLoss));
          }
        } else if (u.profitLoss !== undefined) {
          if (row.allotment_status !== 'ALLOTED') {
            throw new AppError(`Cannot set P&L unless allotment is ALLOTED (app #${appId})`);
          }
          fields.push('profit_loss = ?');
          values.push(u.profitLoss === null ? null : Number(u.profitLoss));
        }

        if (u.remarks !== undefined) {
          fields.push('remarks = ?');
          values.push(u.remarks || null);
        }
        if (u.amount !== undefined) {
          const amt = parseOptionalAmount(u.amount, 'amount');
          if (amt !== null && amt <= 0) throw new AppError('Application amount must be positive');
          fields.push('amount = ?');
          values.push(amt);
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

        values.push(appId, req.tenantId);
        await conn.query(
          `UPDATE ipo_applications SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`,
          values
        );
        ids.push(appId);

        const mayTriggerShare =
          u.profitLoss !== undefined || u.allotmentStatus === 'ALLOTED';

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

export default router;
