import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { parsePositiveInt } from '../utils/validate.js';
import {
  validateProfitLossPercents,
  getMemberShareRule,
  getMemberShareRules,
  getProviderShareRule,
  listRuleTemplates,
  getRuleTemplate,
  createRuleTemplate,
  updateRuleTemplate,
  deleteRuleTemplate,
  listMembersWithShareRules,
  distributeProfitShares,
  getProfitShareReport,
  getProfitTotalsReport,
  calculateMultiRuleSplit,
  validateMemberRulesSet,
  addMemberShareRule,
  applyBulkMemberShareRules,
  resolveRulesForIpo,
  resolveOptionalIpoId,
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

/** Named share rule templates (Rule list — multiple rules allowed) */
router.get('/rule-templates', async (req, res, next) => {
  try {
    const conn = await pool.getConnection();
    try {
      const rows = await listRuleTemplates(conn, req.tenantId);
      res.json(rows);
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/rule-templates', async (req, res, next) => {
  try {
    const percents = parseSharePercents(req.body);
    validateProfitLossPercents(percents);
    const conn = await pool.getConnection();
    try {
      const created = await createRuleTemplate(conn, req.tenantId, {
        ruleName: req.body.ruleName,
        fundProviderId: req.body.fundProviderId,
        sortOrder: req.body.sortOrder,
        ...percents,
      });
      res.status(201).json(created);
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.put('/rule-templates/:templateId', async (req, res, next) => {
  try {
    const templateId = parsePositiveInt(req.params.templateId, 'template id');
    const percents = parseSharePercents(req.body);
    if (
      req.body.profitProviderPercent !== undefined
      || req.body.profitManagerPercent !== undefined
      || req.body.lossProviderPercent !== undefined
      || req.body.lossManagerPercent !== undefined
    ) {
      validateProfitLossPercents(percents);
    }
    const conn = await pool.getConnection();
    try {
      const updated = await updateRuleTemplate(conn, req.tenantId, templateId, {
        ruleName: req.body.ruleName,
        fundProviderId: req.body.fundProviderId,
        sortOrder: req.body.sortOrder,
        ...percents,
      });
      res.json(updated);
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.delete('/rule-templates/:templateId', async (req, res, next) => {
  try {
    const templateId = parsePositiveInt(req.params.templateId, 'template id');
    const conn = await pool.getConnection();
    try {
      await deleteRuleTemplate(conn, req.tenantId, templateId);
      res.json({ ok: true });
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.get('/rule-templates/:templateId', async (req, res, next) => {
  try {
    const templateId = parsePositiveInt(req.params.templateId, 'template id');
    const conn = await pool.getConnection();
    try {
      const row = await getRuleTemplate(conn, req.tenantId, templateId);
      if (!row) throw new AppError('Rule template not found', 404);
      res.json(row);
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

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
            ruleName: rule?.ruleName ?? p.name,
            memberCount: Number(memberCount[0].c),
            hasRule: !!rule && (
              Number(rule.profitProviderPercent) + Number(rule.profitManagerPercent)
              + Number(rule.lossProviderPercent) + Number(rule.lossManagerPercent) > 0
            ),
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

    const ruleName = req.body.ruleName?.trim() || fp[0].name;

    await pool.query(
      `INSERT INTO fund_provider_share_rules
       (fund_provider_id, tenant_id, rule_name, profit_provider_percent, profit_manager_percent,
        loss_provider_percent, loss_manager_percent)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         rule_name = VALUES(rule_name),
         profit_provider_percent = VALUES(profit_provider_percent),
         profit_manager_percent = VALUES(profit_manager_percent),
         loss_provider_percent = VALUES(loss_provider_percent),
         loss_manager_percent = VALUES(loss_manager_percent)`,
      [
        providerId,
        req.tenantId,
        ruleName,
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
    const conn = await pool.getConnection();
    try {
      const rows = await listMembersWithShareRules(conn, req.tenantId);
      res.json(rows);
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

/** Apply one share rule definition to many members at once */
router.post('/members/bulk-rules', async (req, res, next) => {
  try {
    const { memberIds, fundProviderId, ruleName, sortOrder, ipoId } = req.body;
    if (!Array.isArray(memberIds) || !memberIds.length) {
      throw new AppError('Select at least one member', 400);
    }
    if (!fundProviderId) throw new AppError('Fund provider is required');

    const percents = parseSharePercents(req.body);
    const conn = await pool.getConnection();
    try {
      const result = await applyBulkMemberShareRules(conn, req.tenantId, memberIds, {
        ruleName,
        sortOrder,
        fundProviderId,
        ipoId,
        ...percents,
      });
      res.status(result.appliedCount ? 201 : 400).json(result);
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
    if (!fundProviderId) throw new AppError('Fund provider is required');

    const conn = await pool.getConnection();
    try {
      const { rule } = await addMemberShareRule(conn, req.tenantId, memberId, {
        ruleName,
        sortOrder,
        fundProviderId,
        ...percents,
      });
      res.status(201).json(rule);
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
    const { fundProviderId, ruleName, sortOrder, ipoId } = req.body;
    const percents = parseSharePercents(req.body);

    const [existing] = await pool.query(
      'SELECT id FROM member_profit_shares WHERE id = ? AND member_id = ? AND tenant_id = ?',
      [ruleId, memberId, req.tenantId]
    );
    if (!existing.length) throw new AppError('Share rule not found', 404);

    const connForIpo = await pool.getConnection();
    let resolvedIpoId;
    try {
      if ('ipoId' in req.body) {
        resolvedIpoId = await resolveOptionalIpoId(connForIpo, req.tenantId, ipoId);
      }
    } finally {
      connForIpo.release();
    }

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
    if ('ipoId' in req.body) {
      fields.push('ipo_id = ?');
      values.push(resolvedIpoId);
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
      const templates = await listRuleTemplates(conn, req.tenantId);
      const match = templates.find((t) => t.fundProviderId === providerId && t.hasRule);
      const rule = match || await getProviderShareRule(conn, req.tenantId, providerId);
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
        SELECT a.id, a.member_id, a.ipo_id, a.profit_loss, m.display_name, i.name as ipo_name
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
        const { rules: allRules } = await getMemberShareRules(conn, req.tenantId, app.member_id);
        const rules = resolveRulesForIpo(allRules, app.ipo_id);
        const gross = Number(app.profit_loss);
        let configWarning = null;
        if (!rules.length) {
          const ipoHint = app.ipo_name ? ` for ${app.ipo_name}` : '';
          configWarning = `Add share rule for this member${ipoHint} under Profit Sharing`;
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
          ruleSource: rules.length ? 'member' : 'none',
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
