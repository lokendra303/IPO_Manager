import { Router } from 'express';

import { pool, withTransaction } from '../db/pool.js';

import { AppError } from '../middleware/errorHandler.js';

import { distributeIpo, undistributeIpoApplication } from '../services/distributeService.js';

import { receiveIpoApplication, receiveIpoApplicationsBulk, receiveIpoApplicationsByGroups, undoReceiveIpoApplication } from '../services/receiveApplicationService.js';
import {
  listAdjustSourceIpos,
  previewAdjustFunds,
  adjustFundsToIpo,
  getCombineAdjustMeta,
  previewCombineAdjust,
  executeCombineAdjust,
} from '../services/adjustFundService.js';
import { dedupeIds } from '../utils/validate.js';

import { parsePositiveInt, parseAmount } from '../utils/validate.js';
import { toDate } from '../services/ipo/normalize.js';
import { VALID_REGISTRARS } from '../utils/allotmentCheck.js';
import { allotmentCheckGate } from '../services/ipo/allotmentReady.js';
import {
  IPO_SEGMENTS,
  ipoAllowsHni,
  serializeAllowedCategories,
  validateAllowedCategories,
} from '../constants/ipoCategories.js';
import {
  attachShareRulesToIpos,
  resolveOptionalShareRuleId,
  setIpoShareRules,
  setIpoSharePack,
} from '../services/ipoShareRuleService.js';
import { listMemberGroups } from '../services/memberGroupService.js';
import { ensureWallet } from '../services/walletService.js';
import { listBankAccounts, getWalletBalancesByPurpose } from '../services/bankAccountService.js';

function dateOnly(value) {
  return toDate(value);
}

function serializeIpo(row) {
  if (!row) return row;
  const listingDate = dateOnly(row.listing_date || row.catalog_listing_date);
  const allotmentDate = dateOnly(row.catalog_allotment_date || row.allotment_date);
  const gate = allotmentCheckGate(row);
  return {
    ...row,
    listing_date: listingDate,
    listingDate,
    allotment_date: allotmentDate,
    allotmentDate,
    gmp: row.catalog_gmp != null ? Number(row.catalog_gmp) : (row.gmp != null ? Number(row.gmp) : null),
    gmpPercentage: row.catalog_gmp_percentage != null ? Number(row.catalog_gmp_percentage) : null,
    estimatedListingPrice: row.catalog_estimated_listing_price != null
      ? Number(row.catalog_estimated_listing_price)
      : null,
    gmpLastUpdated: row.catalog_gmp_updated_at || null,
    catalogStatus: row.catalog_status || null,
    allotmentCheckReady: gate.ready,
    allotmentCheckBlockedReason: gate.reason,
  };
}

async function loadSerializedIpo(conn, tenantId, ipoId) {
  const [rows] = await conn.query(
    `SELECT i.* FROM ipos i WHERE i.id = ? AND i.tenant_id = ?`,
    [ipoId, tenantId]
  );
  if (!rows.length) return null;
  const [attached] = await attachShareRulesToIpos(conn, tenantId, [serializeIpo(rows[0])]);
  return attached;
}

const IPO_DETAIL_SQL = `SELECT i.*,
        c.gmp AS catalog_gmp,
        c.gmp_percentage AS catalog_gmp_percentage,
        c.estimated_listing_price AS catalog_estimated_listing_price,
        c.gmp_updated_at AS catalog_gmp_updated_at,
        c.status AS catalog_status,
        c.open_date AS catalog_open_date,
        c.close_date AS catalog_close_date,
        c.allotment_date AS catalog_allotment_date,
        c.listing_date AS catalog_listing_date,
        c.subscription_qib AS catalog_subscription_qib,
        c.subscription_nii AS catalog_subscription_nii,
        c.subscription_retail AS catalog_subscription_retail,
        c.subscription_total AS catalog_subscription_total,
        c.registrar_name AS catalog_registrar_name
       FROM ipos i
       LEFT JOIN ipo_catalog c ON c.id = i.catalog_id
       WHERE i.id = ? AND i.tenant_id = ?`;

const IPO_APPLICATIONS_SQL = `SELECT a.*, m.display_name, m.pan, m.status as member_status, m.relationship_note,
              mg.name AS member_group_name,
              m.member_group_id,
              pay.display_name AS paid_to_display_name,
              a.paid_to_external_name,
              psd.id AS profit_share_distribution_id,
              psd.provider_amount AS share_provider_amount,
              psd.manager_amount AS share_manager_amount,
              psd.member_amount AS share_member_amount,
              psd.distributed_at AS share_distributed_at,
              psd.pnl_type AS share_pnl_type
       FROM ipo_applications a
       JOIN members m ON m.id = a.member_id
       LEFT JOIN member_groups mg ON mg.id = m.member_group_id
       LEFT JOIN members pay ON pay.id = a.paid_to_member_id
       LEFT JOIN profit_share_distributions psd ON psd.ipo_application_id = a.id
       WHERE a.ipo_id = ? AND a.tenant_id = ?
       ORDER BY mg.sort_order, mg.name, m.sort_order, m.id`;

async function loadIpoDetail(conn, tenantId, ipoId) {
  const [rows] = await conn.query(IPO_DETAIL_SQL, [ipoId, tenantId]);
  if (!rows.length) return null;
  const [attached] = await attachShareRulesToIpos(conn, tenantId, [serializeIpo(rows[0])]);
  return attached;
}

async function loadIpoApplications(conn, tenantId, ipoId) {
  const [rows] = await conn.query(IPO_APPLICATIONS_SQL, [ipoId, tenantId]);
  return rows;
}

const router = Router();



router.get('/', async (req, res, next) => {

  try {
    const namesOnly = req.query.namesOnly === '1' || req.query.namesOnly === 'true';
    const invalidOnly = req.query.invalidOnly === '1' || req.query.invalidOnly === 'true';
    const includeInvalid = req.query.includeInvalid === '1' || req.query.includeInvalid === 'true';

    if (namesOnly) {
      let invalidFilter = 'AND COALESCE(is_invalid, 0) = 0';
      if (invalidOnly) invalidFilter = 'AND COALESCE(is_invalid, 0) = 1';
      else if (includeInvalid) invalidFilter = '';
      const [rows] = await pool.query(
        `SELECT id, name FROM ipos
         WHERE tenant_id = ? ${invalidFilter}
         ORDER BY name, id`,
        [req.tenantId]
      );
      return res.json(rows);
    }

    let invalidFilter = 'AND COALESCE(i.is_invalid, 0) = 0';
    if (invalidOnly) invalidFilter = 'AND COALESCE(i.is_invalid, 0) = 1';
    else if (includeInvalid) invalidFilter = '';

    const [rows] = await pool.query(

      `SELECT i.*,
        c.gmp AS catalog_gmp,
        c.gmp_percentage AS catalog_gmp_percentage,
        c.estimated_listing_price AS catalog_estimated_listing_price,
        c.gmp_updated_at AS catalog_gmp_updated_at,
        c.status AS catalog_status,
        c.open_date AS catalog_open_date,
        c.close_date AS catalog_close_date,
        c.allotment_date AS catalog_allotment_date,
        c.listing_date AS catalog_listing_date,
        COALESCE(stats.application_count, 0) AS application_count,
        COALESCE(stats.allotted_count, 0) AS allotted_count,
        COALESCE(stats.pending_return_count, 0) AS pending_return_count
       FROM ipos i
       LEFT JOIN ipo_catalog c ON c.id = i.catalog_id
       LEFT JOIN (
         SELECT ipo_id,
           COUNT(*) AS application_count,
           SUM(CASE WHEN allotment_status IN ('ALLOTED', 'PARTIALLY_ALLOTTED') THEN 1 ELSE 0 END) AS allotted_count,
           SUM(CASE WHEN (trns_received IS NULL OR trns_received <> 'Received')
                     AND allotment_status <> 'PENDING' THEN 1 ELSE 0 END) AS pending_return_count
         FROM ipo_applications
         WHERE tenant_id = ?
         GROUP BY ipo_id
       ) stats ON stats.ipo_id = i.id
       WHERE i.tenant_id = ? ${invalidFilter}
       ORDER BY COALESCE(i.open_date, DATE(i.created_at)) DESC, i.id DESC`,

      [req.tenantId, req.tenantId]

    );

    res.json(rows.map(serializeIpo));

  } catch (err) {

    next(err);

  }

});



router.post('/', async (req, res, next) => {

  try {

    const {
      name, lotAmount, lotAmountRii, lotAmountHni, status, openDate, lastApplyDate, registrar, ipoSegment, allowedCategories,
      profitShareRuleId, profitShareRuleIds, profitSharePackId,
    } = req.body;

    if (!name?.trim()) throw new AppError('IPO name is required');

    const lotRii = parseAmount(
      lotAmountRii ?? lotAmount,
      { fieldName: 'RII lot amount' }
    );
    const allowed = validateAllowedCategories(allowedCategories);
    let lotHni = null;
    if (allowed.includes('HNI') && lotAmountHni != null && lotAmountHni !== '') {
      lotHni = parseAmount(lotAmountHni, { fieldName: 'HNI lot amount' });
    }

    if (!['OPEN', 'CLOSED'].includes(status || 'OPEN') && status) {

      throw new AppError('Status must be OPEN or CLOSED');

    }

    if (registrar && !VALID_REGISTRARS.includes(registrar)) {
      throw new AppError('Invalid registrar');
    }

    const segment = (ipoSegment || 'MAINBOARD').toUpperCase();
    if (!IPO_SEGMENTS.includes(segment)) {
      throw new AppError('IPO segment must be SME or MAINBOARD');
    }
    const categoriesJson = serializeAllowedCategories(allowedCategories);
    const shareRuleIds = profitShareRuleIds !== undefined
      ? profitShareRuleIds
      : (profitShareRuleId ? [profitShareRuleId] : []);
    const shareRuleId = shareRuleIds.length
      ? await resolveOptionalShareRuleId(pool, req.tenantId, shareRuleIds[0])
      : null;

    const [result] = await pool.query(

      `INSERT INTO ipos (tenant_id, name, lot_amount_rii, lot_amount_hni, lot_amount, status, open_date, last_apply_date, registrar, ipo_segment, allowed_categories, profit_share_rule_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,

      [
        req.tenantId, name.trim(), lotRii, lotHni, lotRii, status || 'OPEN', openDate || null, lastApplyDate || null,
        registrar || null, segment, categoriesJson, shareRuleId,
      ]

    );

    if (profitSharePackId !== undefined) {
      await setIpoSharePack(pool, req.tenantId, result.insertId, profitSharePackId || null);
    } else if (shareRuleIds.length) {
      await setIpoShareRules(pool, req.tenantId, result.insertId, shareRuleIds);
    }

    res.status(201).json(await loadSerializedIpo(pool, req.tenantId, result.insertId));

  } catch (err) {

    next(err);

  }

});

/** Combine adjust: multi old IPOs → multi new IPOs (must be before /:id). */
router.get('/adjust-combine/meta', async (req, res, next) => {
  try {
    const conn = await pool.getConnection();
    try {
      const meta = await getCombineAdjustMeta(conn, req.tenantId);
      res.json(meta);
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/adjust-combine/preview', async (req, res, next) => {
  try {
    const conn = await pool.getConnection();
    try {
      const preview = await previewCombineAdjust(conn, {
        tenantId: req.tenantId,
        fromIpoIds: req.body.fromIpoIds || [],
        targetIpoIds: req.body.targetIpoIds || [],
        investorCategory: req.body.investorCategory,
        assignments: req.body.assignments || [],
      });
      res.json(preview);
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/adjust-combine', async (req, res, next) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const result = await withTransaction((conn) =>
      executeCombineAdjust(conn, {
        tenantId: req.tenantId,
        items,
        investorCategory: req.body.investorCategory,
        userId: req.user.userId,
        bankAccountId: req.body.bankAccountId,
      })
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/setup', async (req, res, next) => {
  try {
    const ipoId = parsePositiveInt(req.params.id, 'IPO id');
    const conn = await pool.getConnection();
    try {
      const ipo = await loadIpoDetail(conn, req.tenantId, ipoId);
      if (!ipo) throw new AppError('IPO not found', 404);
      const applications = await loadIpoApplications(conn, req.tenantId, ipoId);
      const [members] = await conn.query(
        `SELECT m.id, m.display_name, m.pan, m.status, m.member_group_id,
                m.sort_order, m.relationship_note, mg.name AS member_group_name
         FROM members m
         LEFT JOIN member_groups mg ON mg.id = m.member_group_id
         WHERE m.tenant_id = ? AND m.status = 'ACTIVE'
         ORDER BY m.sort_order, m.id`,
        [req.tenantId]
      );
      const groups = await listMemberGroups(conn, req.tenantId);
      await ensureWallet(conn, req.tenantId);
      const accounts = await listBankAccounts(conn, req.tenantId);
      const balances = await getWalletBalancesByPurpose(conn, req.tenantId);
      res.json({
        ipo,
        applications,
        members,
        groups,
        wallet: {
          balance: balances.totalBalance,
          providerBalance: balances.providerBalance,
          managerBalance: balances.managerBalance,
          accounts,
        },
      });
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const ipoId = parsePositiveInt(req.params.id, 'IPO id');
    const ipo = await loadIpoDetail(pool, req.tenantId, ipoId);
    if (!ipo) throw new AppError('IPO not found', 404);
    res.json(ipo);
  } catch (err) {
    next(err);
  }
});



router.patch('/:id', async (req, res, next) => {

  try {

    const ipoId = parsePositiveInt(req.params.id, 'IPO id');

    const {
      name, lotAmount, lotAmountRii, lotAmountHni, status, openDate, lastApplyDate, listingDate, registrar, ipoSegment, allowedCategories,
      profitShareRuleId, profitShareRuleIds, profitSharePackId,
    } = req.body;

    const [existing] = await pool.query(

      'SELECT * FROM ipos WHERE id = ? AND tenant_id = ?',

      [ipoId, req.tenantId]

    );

    if (!existing.length) throw new AppError('IPO not found', 404);



    const fields = [];

    const values = [];

    if (name !== undefined) {

      if (!name?.trim()) throw new AppError('IPO name cannot be empty');

      fields.push('name = ?');

      values.push(name.trim());

    }

    if (lotAmountRii !== undefined || lotAmountHni !== undefined || lotAmount !== undefined) {
      if (existing[0].status === 'CLOSED') {
        throw new AppError('Cannot change lot amount on a closed IPO. Reopen it first.');
      }
      const nextRii = lotAmountRii !== undefined
        ? parseAmount(lotAmountRii, { fieldName: 'RII lot amount' })
        : lotAmount !== undefined
          ? parseAmount(lotAmount, { fieldName: 'lot amount' })
          : null;
      const nextHni = lotAmountHni !== undefined
        ? parseAmount(lotAmountHni, { fieldName: 'HNI lot amount' })
        : lotAmount !== undefined
          ? parseAmount(lotAmount, { fieldName: 'lot amount' })
          : null;
      if (nextRii !== null) {
        fields.push('lot_amount_rii = ?', 'lot_amount = ?');
        values.push(nextRii, nextRii);
      }
      if (nextHni !== null) {
        fields.push('lot_amount_hni = ?');
        values.push(nextHni);
      }
    }

    if (status !== undefined) {

      if (!['OPEN', 'CLOSED'].includes(status)) throw new AppError('Status must be OPEN or CLOSED');

      fields.push('status = ?');

      values.push(status);

    }

    if (openDate !== undefined) {

      fields.push('open_date = ?');

      values.push(openDate || null);

    }

    if (lastApplyDate !== undefined) {

      fields.push('last_apply_date = ?');

      values.push(lastApplyDate || null);

    }

    if (listingDate !== undefined) {

      fields.push('listing_date = ?');

      values.push(listingDate || null);

    }

    if (registrar !== undefined) {
      if (registrar && !VALID_REGISTRARS.includes(registrar)) {
        throw new AppError('Invalid registrar');
      }
      fields.push('registrar = ?');
      values.push(registrar || null);
    }

    if (ipoSegment !== undefined) {
      const segment = String(ipoSegment).toUpperCase();
      if (!IPO_SEGMENTS.includes(segment)) throw new AppError('IPO segment must be SME or MAINBOARD');
      fields.push('ipo_segment = ?');
      values.push(segment);
    }

    if (allowedCategories !== undefined) {
      const allowed = validateAllowedCategories(allowedCategories);
      fields.push('allowed_categories = ?');
      values.push(serializeAllowedCategories(allowedCategories));
      if (!allowed.includes('HNI')) {
        fields.push('lot_amount_hni = ?');
        values.push(null);
      }
    }

    if (profitSharePackId !== undefined) {
      await setIpoSharePack(pool, req.tenantId, ipoId, profitSharePackId || null);
    } else if (profitShareRuleIds !== undefined || profitShareRuleId !== undefined) {
      const nextIds = profitShareRuleIds !== undefined
        ? profitShareRuleIds
        : (profitShareRuleId ? [profitShareRuleId] : []);
      await setIpoShareRules(pool, req.tenantId, ipoId, nextIds);
      await pool.query(
        'UPDATE ipos SET profit_share_pack_id = NULL WHERE id = ? AND tenant_id = ?',
        [ipoId, req.tenantId]
      );
    }

    if (
      !fields.length
      && profitShareRuleIds === undefined
      && profitShareRuleId === undefined
      && profitSharePackId === undefined
    ) {
      throw new AppError('No fields to update');
    }

    if (fields.length) {
      values.push(ipoId, req.tenantId);
      await pool.query(`UPDATE ipos SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`, values);
    }

    res.json(await loadSerializedIpo(pool, req.tenantId, ipoId));

  } catch (err) {

    next(err);

  }

});

router.post('/:id/close', async (req, res, next) => {
  try {
    const ipoId = parsePositiveInt(req.params.id, 'IPO id');
    const [existing] = await pool.query(
      'SELECT * FROM ipos WHERE id = ? AND tenant_id = ?',
      [ipoId, req.tenantId]
    );
    if (!existing.length) throw new AppError('IPO not found', 404);
    if (existing[0].status === 'CLOSED') {
      throw new AppError('IPO is already closed');
    }

    await pool.query(
      'UPDATE ipos SET status = ? WHERE id = ? AND tenant_id = ?',
      ['CLOSED', ipoId, req.tenantId]
    );
    res.json(await loadSerializedIpo(pool, req.tenantId, ipoId));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reopen', async (req, res, next) => {
  try {
    const ipoId = parsePositiveInt(req.params.id, 'IPO id');
    const [existing] = await pool.query(
      'SELECT * FROM ipos WHERE id = ? AND tenant_id = ?',
      [ipoId, req.tenantId]
    );
    if (!existing.length) throw new AppError('IPO not found', 404);
    if (existing[0].status === 'OPEN') {
      throw new AppError('IPO is already open');
    }

    await pool.query(
      'UPDATE ipos SET status = ? WHERE id = ? AND tenant_id = ?',
      ['OPEN', ipoId, req.tenantId]
    );
    res.json(await loadSerializedIpo(pool, req.tenantId, ipoId));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/invalidate', async (req, res, next) => {
  try {
    const ipoId = parsePositiveInt(req.params.id, 'IPO id');
    const [existing] = await pool.query(
      'SELECT * FROM ipos WHERE id = ? AND tenant_id = ?',
      [ipoId, req.tenantId]
    );
    if (!existing.length) throw new AppError('IPO not found', 404);
    if (existing[0].is_invalid) {
      throw new AppError('IPO is already marked invalid');
    }

    await pool.query(
      'UPDATE ipos SET is_invalid = 1, invalidated_at = NOW() WHERE id = ? AND tenant_id = ?',
      [ipoId, req.tenantId]
    );
    res.json(await loadSerializedIpo(pool, req.tenantId, ipoId));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/restore', async (req, res, next) => {
  try {
    const ipoId = parsePositiveInt(req.params.id, 'IPO id');
    const [existing] = await pool.query(
      'SELECT * FROM ipos WHERE id = ? AND tenant_id = ?',
      [ipoId, req.tenantId]
    );
    if (!existing.length) throw new AppError('IPO not found', 404);
    if (!existing[0].is_invalid) {
      throw new AppError('IPO is not marked invalid');
    }

    await pool.query(
      'UPDATE ipos SET is_invalid = 0, invalidated_at = NULL WHERE id = ? AND tenant_id = ?',
      [ipoId, req.tenantId]
    );
    res.json(await loadSerializedIpo(pool, req.tenantId, ipoId));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const ipoId = parsePositiveInt(req.params.id, 'IPO id');
    const [existing] = await pool.query(
      'SELECT * FROM ipos WHERE id = ? AND tenant_id = ?',
      [ipoId, req.tenantId]
    );
    if (!existing.length) throw new AppError('IPO not found', 404);
    if (!existing[0].is_invalid) {
      throw new AppError('Only invalid IPOs can be deleted. Mark as invalid first.', 409);
    }

    const [[appCount]] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM ipo_applications WHERE ipo_id = ? AND tenant_id = ?',
      [ipoId, req.tenantId]
    );
    if (Number(appCount.cnt) > 0) {
      throw new AppError(
        'This IPO has applications and cannot be deleted. Keep it as invalid, or undo distributions/settlements first.',
        409
      );
    }

    const [[walletCount]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM wallet_transactions
       WHERE tenant_id = ? AND ref_type = 'ipo' AND ref_id = ?`,
      [req.tenantId, ipoId]
    );
    if (Number(walletCount.cnt) > 0) {
      throw new AppError(
        'This IPO has wallet history and cannot be deleted. Keep it as invalid.',
        409
      );
    }

    await pool.query('DELETE FROM ipos WHERE id = ? AND tenant_id = ?', [ipoId, req.tenantId]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/applications', async (req, res, next) => {
  try {
    const ipoId = parsePositiveInt(req.params.id, 'IPO id');
    const [ipo] = await pool.query('SELECT id FROM ipos WHERE id = ? AND tenant_id = ?', [ipoId, req.tenantId]);
    if (!ipo.length) throw new AppError('IPO not found', 404);
    res.json(await loadIpoApplications(pool, req.tenantId, ipoId));
  } catch (err) {
    next(err);
  }
});



router.post('/:id/distribute', async (req, res, next) => {

  try {

    const ipoId = parsePositiveInt(req.params.id, 'IPO id');

    const {
      memberIds, amounts, markGiven, bankAccountId, accountDebits, investorCategory, memberCategories,
      groupBulks,
    } = req.body;

    if (!memberIds?.length && !groupBulks?.length) {
      throw new AppError('Select at least one member or sub-group');
    }



    const result = await withTransaction((conn) =>

      distributeIpo(conn, {

        tenantId: req.tenantId,

        ipoId,

        memberIds,

        amounts,

        markGiven: markGiven !== false,

        bankAccountId,

        accountDebits,

        investorCategory,

        memberCategories,

        groupBulks,

        userId: req.user.userId,

      })

    );



    res.status(201).json(result);

  } catch (err) {

    next(err);

  }

});

router.get('/:id/adjust-sources', async (req, res, next) => {
  try {
    const targetIpoId = parsePositiveInt(req.params.id, 'IPO id');
    const conn = await pool.getConnection();
    try {
      const sources = await listAdjustSourceIpos(conn, req.tenantId, targetIpoId);
      res.json(sources);
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.get('/:id/adjust-preview', async (req, res, next) => {
  try {
    const targetIpoId = parsePositiveInt(req.params.id, 'IPO id');
    const fromIpoId = parsePositiveInt(req.query.fromIpoId, 'source IPO id');
    const applicationIds = req.query.applicationIds
      ? String(req.query.applicationIds).split(',').filter(Boolean)
      : undefined;
    const conn = await pool.getConnection();
    try {
      const preview = await previewAdjustFunds(conn, {
        tenantId: req.tenantId,
        targetIpoId,
        fromIpoId,
        investorCategory: req.query.investorCategory,
        applicationIds,
      });
      res.json(preview);
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/:id/adjust-from', async (req, res, next) => {
  try {
    const targetIpoId = parsePositiveInt(req.params.id, 'IPO id');
    const fromIpoId = parsePositiveInt(req.body.fromIpoId, 'source IPO id');
    const applicationIds = dedupeIds(req.body.applicationIds || []);
    const result = await withTransaction((conn) =>
      adjustFundsToIpo(conn, {
        tenantId: req.tenantId,
        targetIpoId,
        fromIpoId,
        applicationIds,
        investorCategory: req.body.investorCategory,
        userId: req.user.userId,
        bankAccountId: req.body.bankAccountId,
      })
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/applications/receive-bulk', async (req, res, next) => {

  try {

    const applicationIds = dedupeIds(req.body.applicationIds || []);

    if (!applicationIds.length) {

      throw new AppError('Select at least one application to receive');

    }

    const returnToWallet = req.body.returnToWallet !== false;

    const { bankAccountId } = req.body;

    const notes = req.body.notes?.trim() || null;



    const result = await withTransaction(async (conn) =>

      receiveIpoApplicationsBulk(conn, {

        tenantId: req.tenantId,

        applicationIds,

        returnToWallet,

        bankAccountId,

        notes,

        userId: req.user.userId,

      })

    );



    res.json(result);

  } catch (err) {

    next(err);

  }

});



router.post('/:id/receive-by-groups', async (req, res, next) => {
  try {
    const ipoId = parsePositiveInt(req.params.id, 'IPO id');
    const groupIds = dedupeIds(req.body.groupIds || []);
    if (!groupIds.length) {
      throw new AppError('Select at least one sub-group to receive');
    }
    const returnToWallet = req.body.returnToWallet !== false;
    const { bankAccountId } = req.body;
    const notes = req.body.notes?.trim() || null;

    const result = await withTransaction(async (conn) =>
      receiveIpoApplicationsByGroups(conn, {
        tenantId: req.tenantId,
        ipoId,
        groupIds,
        returnToWallet,
        bankAccountId,
        notes,
        userId: req.user.userId,
      })
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
});



router.post('/applications/:appId/receive', async (req, res, next) => {

  try {

    const appId = parsePositiveInt(req.params.appId, 'application id');

    const returnToWallet = req.body.returnToWallet !== false;

    const { bankAccountId } = req.body;

    const notes = req.body.notes?.trim() || null;



    const receiveResult = await withTransaction(async (conn) =>

      receiveIpoApplication(conn, {

        tenantId: req.tenantId,

        appId,

        returnToWallet,

        bankAccountId,

        amount: req.body.amount,

        notes,

        userId: req.user.userId,

      })

    );



    const [rows] = await pool.query(

      `SELECT a.*, m.display_name, m.pan FROM ipo_applications a

       JOIN members m ON m.id = a.member_id WHERE a.id = ?`,

      [appId]

    );

    const [walletRows] = await pool.query(
      'SELECT COALESCE(balance, 0) AS balance FROM owner_wallets WHERE tenant_id = ?',
      [req.tenantId]
    );

    res.json({
      ...rows[0],
      walletAmount: receiveResult.walletAmount,
      walletBalance: Number(walletRows[0]?.balance ?? 0),
    });

  } catch (err) {

    next(err);

  }

});



router.post('/applications/:appId/undo-receive', async (req, res, next) => {
  try {
    const appId = parsePositiveInt(req.params.appId, 'application id');
    const revokeProfitSplit = req.body.revokeProfitSplit === true;

    const result = await withTransaction(async (conn) =>
      undoReceiveIpoApplication(conn, {
        tenantId: req.tenantId,
        appId,
        userId: req.user.userId,
        revokeProfitSplit,
      })
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/applications/:appId/undistribute', async (req, res, next) => {
  try {
    const appId = parsePositiveInt(req.params.appId, 'application id');
    const result = await withTransaction(async (conn) =>
      undistributeIpoApplication(conn, {
        tenantId: req.tenantId,
        appId,
        userId: req.user.userId,
        bankAccountId: req.body.bankAccountId,
      })
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/add-to-my-ipos', async (req, res, next) => {
  try {
    const catalogId = parsePositiveInt(req.params.id, 'IPO id');
    const { addCatalogToMyIpos } = await import('../services/ipo/catalogService.js');
    const result = await withTransaction((conn) =>
      addCatalogToMyIpos(conn, {
        tenantId: req.tenantId,
        catalogId,
        userId: req.user?.userId,
      })
    );
    res.status(result.alreadyAdded ? 200 : 201).json({
      success: true,
      alreadyAdded: result.alreadyAdded,
      ipo: (await attachShareRulesToIpos(pool, req.tenantId, [serializeIpo(result.ipo)]))[0],
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/remove-from-my-ipos', async (req, res, next) => {
  try {
    const ipoId = parsePositiveInt(req.params.id, 'IPO id');
    const { removeFromMyIpos } = await import('../services/ipo/catalogService.js');
    const result = await withTransaction((conn) =>
      removeFromMyIpos(conn, {
        tenantId: req.tenantId,
        ipoId,
        confirm: req.body?.confirm === true,
      })
    );
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/gmp/history', async (req, res, next) => {
  try {
    const ipoId = parsePositiveInt(req.params.id, 'IPO id');
    const [rows] = await pool.query(
      'SELECT catalog_id FROM ipos WHERE id = ? AND tenant_id = ?',
      [ipoId, req.tenantId]
    );
    if (!rows.length) throw new AppError('IPO not found', 404);
    const { getGmpHistory, presentGmpHistory, toGmpCurrent } = await import('../services/ipo/gmpService.js');
    if (!rows[0].catalog_id) {
      return res.json({ success: true, current: null, summary: presentGmpHistory([]).summary, history: [] });
    }
    const historyRows = await getGmpHistory(pool, rows[0].catalog_id);
    const [cat] = await pool.query(
      'SELECT gmp, gmp_percentage, estimated_listing_price, gmp_updated_at, issue_price FROM ipo_catalog WHERE id = ?',
      [rows[0].catalog_id]
    );
    const current = toGmpCurrent(cat[0]);
    res.json({
      success: true,
      current,
      ...presentGmpHistory(historyRows, current),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/gmp', async (req, res, next) => {
  try {
    const ipoId = parsePositiveInt(req.params.id, 'IPO id');
    const [rows] = await pool.query(
      `SELECT c.gmp, c.gmp_percentage, c.estimated_listing_price, c.gmp_updated_at, c.issue_price
       FROM ipos i LEFT JOIN ipo_catalog c ON c.id = i.catalog_id
       WHERE i.id = ? AND i.tenant_id = ?`,
      [ipoId, req.tenantId]
    );
    if (!rows.length) throw new AppError('IPO not found', 404);
    const { toGmpCurrent } = await import('../services/ipo/gmpService.js');
    const row = rows[0];
    const current = toGmpCurrent({
      gmp: row.gmp,
      gmp_percentage: row.gmp_percentage,
      estimated_listing_price: row.estimated_listing_price,
      gmp_updated_at: row.gmp_updated_at,
      issue_price: row.issue_price,
    });
    res.json({
      success: true,
      gmp: current?.gmp ?? null,
      gmpPercentage: current?.gmpPercentage ?? null,
      estimatedListingPrice: current?.estimatedListingPrice ?? null,
      lastUpdated: current?.lastUpdated ?? null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/sync-gmp', async (req, res, next) => {
  try {
    parsePositiveInt(req.params.id, 'IPO id');
    const { syncLiveIpos } = await import('../services/ipo/syncService.js');
    const result = await syncLiveIpos(pool, { force: true, jobName: 'gmp' });
    if (!result.success) {
      return res.status(503).json({
        success: false,
        message: result.message || 'IPO provider temporarily unavailable',
      });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;

