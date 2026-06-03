import { Router } from 'express';

import { pool, withTransaction } from '../db/pool.js';

import { AppError } from '../middleware/errorHandler.js';

import { distributeIpo } from '../services/distributeService.js';

import { creditWallet } from '../services/walletService.js';

import { parsePositiveInt, parseAmount } from '../utils/validate.js';



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

    const { name, lotAmount, status, openDate } = req.body;

    if (!name?.trim()) throw new AppError('IPO name is required');

    const lot = parseAmount(lotAmount, { fieldName: 'lot amount' });

    if (!['OPEN', 'CLOSED'].includes(status || 'OPEN') && status) {

      throw new AppError('Status must be OPEN or CLOSED');

    }



    const [result] = await pool.query(

      `INSERT INTO ipos (tenant_id, name, lot_amount, status, open_date) VALUES (?, ?, ?, ?, ?)`,

      [req.tenantId, name.trim(), lot, status || 'OPEN', openDate || null]

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

    const { name, lotAmount, status, openDate } = req.body;

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

    if (lotAmount !== undefined) {
      if (existing[0].status === 'CLOSED') {
        throw new AppError('Cannot change lot amount on a closed IPO. Reopen it first.');
      }
      fields.push('lot_amount = ?');
      values.push(parseAmount(lotAmount, { fieldName: 'lot amount' }));
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
              psd.id AS profit_share_distribution_id,
              psd.provider_amount AS share_provider_amount,
              psd.manager_amount AS share_manager_amount,
              psd.member_amount AS share_member_amount,
              psd.distributed_at AS share_distributed_at,
              psd.pnl_type AS share_pnl_type

       FROM ipo_applications a

       JOIN members m ON m.id = a.member_id

       LEFT JOIN profit_share_distributions psd ON psd.ipo_application_id = a.id

       WHERE a.ipo_id = ? AND a.tenant_id = ?

       ORDER BY m.sort_order, m.id`,

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

    const { memberIds, amounts, markReceived, markGiven, bankAccountId, accountDebits } = req.body;

    if (!memberIds?.length) throw new AppError('Select at least one member');



    const result = await withTransaction((conn) =>

      distributeIpo(conn, {

        tenantId: req.tenantId,

        ipoId,

        memberIds,

        amounts,

        markReceived: markReceived !== false,

        markGiven: markGiven !== false,

        bankAccountId,

        accountDebits,

        userId: req.user.userId,

      })

    );



    res.status(201).json(result);

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

      const [apps] = await conn.query(

        `SELECT a.*, i.name as ipo_name FROM ipo_applications a

         JOIN ipos i ON i.id = a.ipo_id

         WHERE a.id = ? AND a.tenant_id = ?`,

        [appId, req.tenantId]

      );

      if (!apps.length) throw new AppError('Application not found', 404);

      const app = apps[0];



      const recvAmount =

        req.body.amount !== undefined

          ? parseAmount(req.body.amount, { fieldName: 'receive amount' })

          : parseAmount(app.amount, { fieldName: 'application amount' });



      const now = new Date();



      const [existingLedger] = await conn.query(

        `SELECT id FROM member_ledger_entries WHERE ipo_application_id = ? AND type = 'RECEIVED'`,

        [appId]

      );



      const [existingWalletReturn] = await conn.query(

        `SELECT id FROM wallet_transactions

         WHERE tenant_id = ? AND type = 'RETURN_IN' AND ref_type = 'ipo_application' AND ref_id = ?`,

        [req.tenantId, appId]

      );



      if (existingLedger.length && existingWalletReturn.length) {

        throw new AppError('This application is already fully settled');

      }



      if (!existingLedger.length) {

        await conn.query(

          `UPDATE ipo_applications SET date_received = COALESCE(date_received, ?), trns_received = 'Received' WHERE id = ?`,

          [now, appId]

        );

        await conn.query(

          `INSERT INTO member_ledger_entries (member_id, tenant_id, type, amount, txn_date, ipo_application_id, notes)

           VALUES (?, ?, 'RECEIVED', ?, ?, ?, ?)`,

          [app.member_id, req.tenantId, recvAmount, now, appId, notes || `Return: ${app.ipo_name}`]

        );

      } else if (app.trns_received !== 'Received') {

        await conn.query(

          `UPDATE ipo_applications SET date_received = ?, trns_received = 'Received' WHERE id = ?`,

          [now, appId]

        );

      }



      if (returnToWallet) {

        if (existingWalletReturn.length) {

          throw new AppError('Funds were already returned to wallet for this application');

        }

        await creditWallet(conn, {

          tenantId: req.tenantId,

          amount: recvAmount,

          bankAccountId,

          type: 'RETURN_IN',

          refType: 'ipo_application',

          refId: appId,

          txnDate: now,

          notes: notes || `Return from ${app.ipo_name}`,

          userId: req.user.userId,

        });

      }

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

