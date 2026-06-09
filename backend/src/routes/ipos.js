import { Router } from 'express';

import { pool, withTransaction } from '../db/pool.js';

import { AppError } from '../middleware/errorHandler.js';

import { distributeIpo } from '../services/distributeService.js';

import { receiveIpoApplication, receiveIpoApplicationsBulk } from '../services/receiveApplicationService.js';
import { dedupeIds } from '../utils/validate.js';

import { parsePositiveInt, parseAmount } from '../utils/validate.js';
import { VALID_REGISTRARS } from '../utils/allotmentCheck.js';
import {
  IPO_SEGMENTS,
  ipoAllowsHni,
  serializeAllowedCategories,
  validateAllowedCategories,
} from '../constants/ipoCategories.js';



const router = Router();



router.get('/', async (req, res, next) => {

  try {

    const [rows] = await pool.query(

      `SELECT i.*,

        (SELECT COUNT(*) FROM ipo_applications a WHERE a.ipo_id = i.id) as application_count

       FROM ipos i WHERE i.tenant_id = ? ORDER BY i.created_at DESC`,

      [req.tenantId]

    );

    res.json(rows);

  } catch (err) {

    next(err);

  }

});



router.post('/', async (req, res, next) => {

  try {

    const {
      name, lotAmount, lotAmountRii, lotAmountHni, status, openDate, registrar, ipoSegment, allowedCategories,
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



    const [result] = await pool.query(

      `INSERT INTO ipos (tenant_id, name, lot_amount_rii, lot_amount_hni, lot_amount, status, open_date, registrar, ipo_segment, allowed_categories)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,

      [
        req.tenantId, name.trim(), lotRii, lotHni, lotRii, status || 'OPEN', openDate || null,
        registrar || null, segment, categoriesJson,
      ]

    );

    const [rows] = await pool.query('SELECT * FROM ipos WHERE id = ?', [result.insertId]);

    res.status(201).json(rows[0]);

  } catch (err) {

    next(err);

  }

});



router.get('/:id', async (req, res, next) => {

  try {

    const ipoId = parsePositiveInt(req.params.id, 'IPO id');

    const [rows] = await pool.query(

      'SELECT * FROM ipos WHERE id = ? AND tenant_id = ?',

      [ipoId, req.tenantId]

    );

    if (!rows.length) throw new AppError('IPO not found', 404);

    res.json(rows[0]);

  } catch (err) {

    next(err);

  }

});



router.patch('/:id', async (req, res, next) => {

  try {

    const ipoId = parsePositiveInt(req.params.id, 'IPO id');

    const {
      name, lotAmount, lotAmountRii, lotAmountHni, status, openDate, registrar, ipoSegment, allowedCategories,
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

    if (!fields.length) throw new AppError('No fields to update');



    values.push(ipoId, req.tenantId);

    await pool.query(`UPDATE ipos SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`, values);

    const [rows] = await pool.query('SELECT * FROM ipos WHERE id = ?', [ipoId]);

    res.json(rows[0]);

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
    const [rows] = await pool.query('SELECT * FROM ipos WHERE id = ?', [ipoId]);
    res.json(rows[0]);
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
    const [rows] = await pool.query('SELECT * FROM ipos WHERE id = ?', [ipoId]);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/applications', async (req, res, next) => {

  try {

    const ipoId = parsePositiveInt(req.params.id, 'IPO id');

    const [ipo] = await pool.query('SELECT id FROM ipos WHERE id = ? AND tenant_id = ?', [ipoId, req.tenantId]);

    if (!ipo.length) throw new AppError('IPO not found', 404);



    const [rows] = await pool.query(

      `SELECT a.*, m.display_name, m.pan, m.status as member_status, m.relationship_note,
              mg.name AS member_group_name,
              pay.display_name AS paid_to_display_name,
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

       ORDER BY mg.sort_order, mg.name, m.sort_order, m.id`,

      [ipoId, req.tenantId]

    );

    res.json(rows);

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



router.post('/applications/:appId/receive', async (req, res, next) => {

  try {

    const appId = parsePositiveInt(req.params.appId, 'application id');

    const returnToWallet = req.body.returnToWallet !== false;

    const { bankAccountId } = req.body;

    const notes = req.body.notes?.trim() || null;



    await withTransaction(async (conn) => {

      await receiveIpoApplication(conn, {

        tenantId: req.tenantId,

        appId,

        returnToWallet,

        bankAccountId,

        amount: req.body.amount,

        notes,

        userId: req.user.userId,

      });

    });



    const [rows] = await pool.query(

      `SELECT a.*, m.display_name, m.pan FROM ipo_applications a

       JOIN members m ON m.id = a.member_id WHERE a.id = ?`,

      [appId]

    );

    res.json(rows[0]);

  } catch (err) {

    next(err);

  }

});



export default router;

