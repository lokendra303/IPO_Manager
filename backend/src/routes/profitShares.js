import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { parsePositiveInt } from '../utils/validate.js';
import {
  validateProfitLossPercents,
  getMemberShareRule,
  getMemberShareRules,
  getProviderShareRule,
  distributeProfitShares,
  getProfitShareReport,
  getProfitTotalsReport,
  calculateMultiRuleSplit,
  validateMemberRulesSet,
} from '../services/profitShareService.js';

const router = Router();

function parseSharePercents(body) {
  const profitProviderPercent = body.profitProviderPercent ?? body.providerPercent ?? 0;
  const profitManagerPercent = body.profitManagerPercent ?? body.managerPercent ?? 0;
  const lossProviderPercent = body.lossProviderPercent ?? 0;
  const lossManagerPercent = body.lossManagerPercent ?? 0;
  return {
    profitProviderPercent,
    profitManagerPercent,
    lossProviderPercent,
    lossManagerPercent,
  };
}

/** All fund providers with their share rules */
router.get('/providers', async (req, res, next) => {
  try {
    const [providers] = await pool.query(
      'SELECT id, name FROM fund_providers WHERE tenant_id = ? ORDER BY name',
      [req.tenantId]
    );

    const conn = await pool.getConnection();
    try {
      const rows = await Promise.all(
        providers.map(async (p) => {
          const rule = await getProviderShareRule(conn, req.tenantId, p.id);
          const [memberCount] = await conn.query(
            'SELECT COUNT(*) as c FROM members WHERE tenant_id = ? AND fund_provider_id = ?',
            [req.tenantId, p.id]
          );
          return {
            fundProviderId: p.id,
            providerName: p.name,
            memberCount: Number(memberCount[0].c),
            hasRule: !!rule,
            profitProviderPercent: rule?.profitProviderPercent ?? 0,
            profitManagerPercent: rule?.profitManagerPercent ?? 0,
            lossProviderPercent: rule?.lossProviderPercent ?? 0,
            lossManagerPercent: rule?.lossManagerPercent ?? 0,
          };
        })
      );
      res.json(rows);
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.put('/providers/:providerId', async (req, res, next) => {
  try {
    const providerId = parsePositiveInt(req.params.providerId, 'provider id');
    const percents = parseSharePercents(req.body);
    validateProfitLossPercents(percents);

    const [fp] = await pool.query(
      'SELECT id, name FROM fund_providers WHERE id = ? AND tenant_id = ?',
      [providerId, req.tenantId]
    );
    if (!fp.length) throw new AppError('Fund provider not found', 404);

    await pool.query(
      `INSERT INTO fund_provider_share_rules
       (fund_provider_id, tenant_id, profit_provider_percent, profit_manager_percent,
        loss_provider_percent, loss_manager_percent)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         profit_provider_percent = VALUES(profit_provider_percent),
         profit_manager_percent = VALUES(profit_manager_percent),
         loss_provider_percent = VALUES(loss_provider_percent),
         loss_manager_percent = VALUES(loss_manager_percent)`,
      [
        providerId,
        req.tenantId,
        percents.profitProviderPercent,
        percents.profitManagerPercent,
        percents.lossProviderPercent,
        percents.lossManagerPercent,
      ]
    );

    const conn = await pool.getConnection();
    try {
      const rule = await getProviderShareRule(conn, req.tenantId, providerId);
      res.json({ fundProviderId: providerId, providerName: fp[0].name, ...rule });
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

/** Members: assigned provider + effective % */
router.get('/members', async (req, res, next) => {
  try {
    const [members] = await pool.query(
      `SELECT m.id, m.display_name, m.pan, m.status,
              (SELECT COUNT(*) FROM member_profit_shares mps WHERE mps.member_id = m.id) AS rule_count
       FROM members m
       WHERE m.tenant_id = ?
       ORDER BY m.sort_order, m.id`,
      [req.tenantId]
    );

    const conn = await pool.getConnection();
    try {
      const withRules = await Promise.all(
        members.map(async (m) => {
          const { rules, hasRules } = await getMemberShareRules(conn, req.tenantId, m.id);
          const profitP = rules.reduce((s, r) => s + r.profitProviderPercent, 0);
          const profitM = rules.reduce((s, r) => s + r.profitManagerPercent, 0);
          const lossP = rules.reduce((s, r) => s + r.lossProviderPercent, 0);
          const lossM = rules.reduce((s, r) => s + r.lossManagerPercent, 0);
          const providerNames = [...new Set(rules.map((r) => r.providerName).filter(Boolean))];
          return {
            memberId: m.id,
            displayName: m.display_name,
            pan: m.pan,
            status: m.status,
            ruleCount: rules.length,
            hasShareRule: hasRules,
            rules,
            effectiveProviderName: providerNames.join(', ') || null,
            effectiveProfitProviderPercent: profitP,
            effectiveProfitManagerPercent: profitM,
            effectiveLossProviderPercent: lossP,
            effectiveLossManagerPercent: lossM,
            memberKeepsProfitPercent: Math.max(0, 100 - profitP - profitM),
            memberKeepsLossPercent: Math.max(0, 100 - lossP - lossM),
            ruleSource: hasRules ? 'member' : 'none',
          };
        })
      );
      res.json(withRules);
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.patch('/members/:memberId/provider', async (req, res, next) => {
  try {
    const memberId = parsePositiveInt(req.params.memberId, 'member id');
    const { fundProviderId } = req.body;

    const [member] = await pool.query(
      'SELECT id FROM members WHERE id = ? AND tenant_id = ?',
      [memberId, req.tenantId]
    );
    if (!member.length) throw new AppError('Member not found', 404);

    if (fundProviderId) {
      const [fp] = await pool.query(
        'SELECT id FROM fund_providers WHERE id = ? AND tenant_id = ?',
        [fundProviderId, req.tenantId]
      );
      if (!fp.length) throw new AppError('Fund provider not found', 404);
    }

    await pool.query(
      'UPDATE members SET fund_provider_id = ? WHERE id = ? AND tenant_id = ?',
      [fundProviderId || null, memberId, req.tenantId]
    );

    const conn = await pool.getConnection();
    try {
      const effective = await getMemberShareRule(conn, req.tenantId, memberId);
      res.json({ memberId, fundProviderId: fundProviderId || null, ...effective });
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.get('/members/:memberId/rules', async (req, res, next) => {
  try {
    const memberId = parsePositiveInt(req.params.memberId, 'member id');
    const conn = await pool.getConnection();
    try {
      const data = await getMemberShareRules(conn, req.tenantId, memberId);
      res.json(data);
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/members/:memberId/rules', async (req, res, next) => {
  try {
    const memberId = parsePositiveInt(req.params.memberId, 'member id');
    const { fundProviderId, ruleName, sortOrder } = req.body;
    const percents = parseSharePercents(req.body);

    const [member] = await pool.query(
      'SELECT id FROM members WHERE id = ? AND tenant_id = ?',
      [memberId, req.tenantId]
    );
    if (!member.length) throw new AppError('Member not found', 404);
    if (!fundProviderId) throw new AppError('Fund provider is required');

    const { providerId } = await (async () => {
      const pid = parsePositiveInt(fundProviderId, 'fund provider id');
      const [fp] = await pool.query(
        'SELECT id FROM fund_providers WHERE id = ? AND tenant_id = ?',
        [pid, req.tenantId]
      );
      if (!fp.length) throw new AppError('Fund provider not found', 404);
      return { providerId: pid };
    })();

    validateProfitLossPercents(percents);

    const [result] = await pool.query(
      `INSERT INTO member_profit_shares
       (tenant_id, member_id, rule_name, sort_order, fund_provider_id,
        provider_percent, manager_percent, loss_provider_percent, loss_manager_percent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.tenantId,
        memberId,
        ruleName?.trim() || 'New rule',
        Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
        providerId,
        percents.profitProviderPercent,
        percents.profitManagerPercent,
        percents.lossProviderPercent,
        percents.lossManagerPercent,
      ]
    );

    const conn = await pool.getConnection();
    try {
      const { rules } = await getMemberShareRules(conn, req.tenantId, memberId);
      validateMemberRulesSet(rules);
      const created = rules.find((r) => r.id === result.insertId);
      res.status(201).json(created || { id: result.insertId });
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.put('/members/:memberId/rules/:ruleId', async (req, res, next) => {
  try {
    const memberId = parsePositiveInt(req.params.memberId, 'member id');
    const ruleId = parsePositiveInt(req.params.ruleId, 'rule id');
    const { fundProviderId, ruleName, sortOrder } = req.body;
    const percents = parseSharePercents(req.body);

    const [existing] = await pool.query(
      'SELECT id FROM member_profit_shares WHERE id = ? AND member_id = ? AND tenant_id = ?',
      [ruleId, memberId, req.tenantId]
    );
    if (!existing.length) throw new AppError('Share rule not found', 404);

    const fields = [];
    const values = [];
    if (ruleName !== undefined) {
      fields.push('rule_name = ?');
      values.push(ruleName?.trim() || 'Rule');
    }
    if (sortOrder !== undefined) {
      fields.push('sort_order = ?');
      values.push(Number(sortOrder));
    }
    if (fundProviderId !== undefined) {
      const pid = parsePositiveInt(fundProviderId, 'fund provider id');
      const [fp] = await pool.query(
        'SELECT id FROM fund_providers WHERE id = ? AND tenant_id = ?',
        [pid, req.tenantId]
      );
      if (!fp.length) throw new AppError('Fund provider not found', 404);
      fields.push('fund_provider_id = ?');
      values.push(pid);
    }
    if (req.body.profitProviderPercent !== undefined || req.body.providerPercent !== undefined) {
      fields.push('provider_percent = ?');
      values.push(percents.profitProviderPercent);
    }
    if (req.body.profitManagerPercent !== undefined || req.body.managerPercent !== undefined) {
      fields.push('manager_percent = ?');
      values.push(percents.profitManagerPercent);
    }
    if (req.body.lossProviderPercent !== undefined) {
      fields.push('loss_provider_percent = ?');
      values.push(percents.lossProviderPercent);
    }
    if (req.body.lossManagerPercent !== undefined) {
      fields.push('loss_manager_percent = ?');
      values.push(percents.lossManagerPercent);
    }

    if (!fields.length) throw new AppError('No fields to update');

    const touchesPercents =
      req.body.profitProviderPercent !== undefined
      || req.body.providerPercent !== undefined
      || req.body.profitManagerPercent !== undefined
      || req.body.managerPercent !== undefined
      || req.body.lossProviderPercent !== undefined
      || req.body.lossManagerPercent !== undefined;
    if (touchesPercents) validateProfitLossPercents(percents);

    values.push(ruleId, memberId, req.tenantId);
    await pool.query(
      `UPDATE member_profit_shares SET ${fields.join(', ')} WHERE id = ? AND member_id = ? AND tenant_id = ?`,
      values
    );

    const conn = await pool.getConnection();
    try {
      const { rules } = await getMemberShareRules(conn, req.tenantId, memberId);
      validateMemberRulesSet(rules);
      const updated = rules.find((r) => r.id === ruleId);
      res.json(updated);
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.delete('/members/:memberId/rules/:ruleId', async (req, res, next) => {
  try {
    const memberId = parsePositiveInt(req.params.memberId, 'member id');
    const ruleId = parsePositiveInt(req.params.ruleId, 'rule id');
    const [result] = await pool.query(
      'DELETE FROM member_profit_shares WHERE id = ? AND member_id = ? AND tenant_id = ?',
      [ruleId, memberId, req.tenantId]
    );
    if (result.affectedRows === 0) throw new AppError('Share rule not found', 404);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/members/:memberId', async (req, res, next) => {
  try {
    const memberId = parsePositiveInt(req.params.memberId, 'member id');
    await pool.query(
      'DELETE FROM member_profit_shares WHERE member_id = ? AND tenant_id = ?',
      [memberId, req.tenantId]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/** Copy a fund provider template into the member edit form (client-side) or save directly */
router.get('/providers/:providerId/template', async (req, res, next) => {
  try {
    const providerId = parsePositiveInt(req.params.providerId, 'provider id');
    const conn = await pool.getConnection();
    try {
      const rule = await getProviderShareRule(conn, req.tenantId, providerId);
      if (!rule) {
        throw new AppError('No template saved for this fund provider', 404);
      }
      res.json({
        profitProviderPercent: rule.profitProviderPercent,
        profitManagerPercent: rule.profitManagerPercent,
        lossProviderPercent: rule.lossProviderPercent,
        lossManagerPercent: rule.lossManagerPercent,
      });
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/preview', async (req, res, next) => {
  try {
    const { ipoId, applicationIds } = req.body;
    const conn = await pool.getConnection();
    try {
      let query = `
        SELECT a.id, a.member_id, a.profit_loss, m.display_name, i.name as ipo_name
        FROM ipo_applications a
        JOIN members m ON m.id = a.member_id
        JOIN ipos i ON i.id = a.ipo_id
        LEFT JOIN profit_share_distributions psd ON psd.ipo_application_id = a.id
        WHERE a.tenant_id = ? AND a.allotment_status = 'ALLOTED' AND a.profit_loss IS NOT NULL AND psd.id IS NULL
      `;
      const params = [req.tenantId];
      if (ipoId) {
        query += ' AND a.ipo_id = ?';
        params.push(ipoId);
      }
      if (applicationIds?.length) {
        query += ` AND a.id IN (${applicationIds.map(() => '?').join(',')})`;
        params.push(...applicationIds);
      }
      const [apps] = await conn.query(query, params);

      const previews = [];
      for (const app of apps) {
        const { rules, hasRules } = await getMemberShareRules(conn, req.tenantId, app.member_id);
        const gross = Number(app.profit_loss);
        let configWarning = null;
        if (!hasRules || !rules.length) {
          configWarning = 'Add at least one share rule for this member under Profit Sharing';
        }
        let split;
        try {
          split = calculateMultiRuleSplit(gross, rules);
        } catch (e) {
          configWarning = e.message || 'Invalid share rules';
          split = {
            pnlType: gross >= 0 ? 'PROFIT' : 'LOSS',
            providerAmount: 0,
            managerAmount: 0,
            memberAmount: gross,
            lines: [],
          };
        }

        previews.push({
          applicationId: app.id,
          memberName: app.display_name,
          ipoName: app.ipo_name,
          grossProfitLoss: gross,
          pnlType: split.pnlType,
          ruleCount: rules.length,
          ruleSource: hasRules ? 'member' : 'none',
          ruleLines: split.lines,
          providerAmount: split.totalProvider,
          managerAmount: split.totalManager,
          memberAmount: split.memberAmount,
          configWarning,
        });
      }
      res.json(previews);
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/distribute', async (req, res, next) => {
  try {
    const { ipoId, applicationIds } = req.body;
    const results = await withTransaction((conn) =>
      distributeProfitShares(conn, {
        tenantId: req.tenantId,
        ipoId: ipoId || null,
        applicationIds,
        userId: req.user.userId,
      })
    );
    const distributed = results.filter((r) => !r.skipped);
    const skipped = results.filter((r) => r.skipped);
    res.json({ distributed, skipped, count: distributed.length });
  } catch (err) {
    next(err);
  }
});

router.get('/report', async (req, res, next) => {
  try {
    const report = await getProfitShareReport(pool, req.tenantId);
    res.json(report);
  } catch (err) {
    next(err);
  }
});

/** Totals by member, fund provider, and manager */
router.get('/totals', async (req, res, next) => {
  try {
    const totals = await getProfitTotalsReport(pool, req.tenantId);
    res.json(totals);
  } catch (err) {
    next(err);
  }
});

export default router;
