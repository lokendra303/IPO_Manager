/**
 * Roll back today's (IST) Laser Power & Infra transactions for a tenant:
 * - Profit share distributions
 * - Fund receive (member returns to wallet)
 * - Provider P&L ledger entries
 * - Related wallet movements
 *
 * Usage: node scripts/rollback-today-laser.js [--dry-run] [--include-sbi]
 */
import { pool, withTransaction } from '../src/db/pool.js';
import { revokeProfitShareDistribution } from '../src/services/profitShareService.js';
import { applyWalletDelta } from '../src/services/walletService.js';
import { syncOwnerWalletTotal } from '../src/services/bankAccountService.js';

const IST = '+05:30';
const TENANT_ID = 2;
const IPO_ID = 10; // Laser Power & Infra
const dryRun = process.argv.includes('--dry-run');
const includeSbi = process.argv.includes('--include-sbi');

function istDateExpr(col) {
  return `DATE(CONVERT_TZ(${col}, '+00:00', '${IST}'))`;
}

async function getTodayIst(conn) {
  const [rows] = await conn.query(
    `SELECT DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${IST}'), '%Y-%m-%d') AS today_ist`
  );
  return String(rows[0].today_ist).slice(0, 10);
}

function dateArg() {
  const idx = process.argv.findIndex((a) => a.startsWith('--date='));
  if (idx >= 0) return process.argv[idx].split('=')[1];
  return null;
}

async function reverseAndDeleteWalletTxn(conn, wt, userId, todayIst) {
  const amount = Number(wt.amount);
  if (amount === 0) {
    if (!dryRun) await conn.query('DELETE FROM wallet_transactions WHERE id = ?', [wt.id]);
    return { id: wt.id, reversed: 0, deleted: true };
  }
  if (!dryRun) {
    await applyWalletDelta(conn, {
      tenantId: TENANT_ID,
      delta: -amount,
      bankAccountId: wt.bank_account_id,
      type: 'ADJUSTMENT',
      refType: 'rollback_today',
      refId: wt.id,
      txnDate: new Date(),
      notes: `Rollback ${todayIst} — ${wt.notes || wt.type}`,
      userId,
      allowNegativeBalance: true,
    });
    await conn.query('DELETE FROM wallet_transactions WHERE id = ?', [wt.id]);
  }
  return { id: wt.id, reversed: -amount, deleted: true, notes: wt.notes };
}

async function main() {
  const summary = {
    todayIst: null,
    distributionsRevoked: [],
    walletReversed: [],
    providerDeleted: 0,
    ledgerDeleted: 0,
    appsReset: [],
    skippedWallet: [],
  };

  await withTransaction(async (conn) => {
    const todayIst = dateArg() ?? (await getTodayIst(conn));
    summary.todayIst = todayIst;
    const istCreated = `${istDateExpr('created_at')} = ?`;

    const [owners] = await conn.query(
      `SELECT id FROM users WHERE tenant_id = ? AND role = 'owner' LIMIT 1`,
      [TENANT_ID]
    );
    const userId = owners[0]?.id ?? null;

    console.log(`Rolling back Laser Power transactions for ${todayIst} (IST)${dryRun ? ' [DRY RUN]' : ''}…`);

    const [dists] = await conn.query(
      `SELECT psd.id, psd.ipo_application_id, m.display_name
       FROM profit_share_distributions psd
       JOIN ipo_applications a ON a.id = psd.ipo_application_id
       JOIN members m ON m.id = a.member_id
       WHERE a.ipo_id = ? AND a.tenant_id = ? AND ${istDateExpr('psd.distributed_at')} = ?`,
      [IPO_ID, TENANT_ID, todayIst]
    );

    for (const d of dists) {
      console.log(`  Revoke profit share: app ${d.ipo_application_id} (${d.display_name})`);
      if (!dryRun) {
        const result = await revokeProfitShareDistribution(conn, {
          tenantId: TENANT_ID,
          applicationId: d.ipo_application_id,
          userId,
        });
        summary.distributionsRevoked.push({ appId: d.ipo_application_id, ...result });
      } else {
        summary.distributionsRevoked.push({ appId: d.ipo_application_id, dryRun: true });
      }
    }

    const laserWalletFilter = `(wt.notes LIKE '%Laser Power%' OR wt.ref_type IN ('profit_share', 'profit_share_reversal') OR (wt.ref_type = 'ipo_application' AND a.ipo_id = ?))`;
    const [laserWallet] = await conn.query(
      `SELECT wt.*
       FROM wallet_transactions wt
       LEFT JOIN ipo_applications a ON a.id = wt.ref_id AND wt.ref_type = 'ipo_application'
       WHERE wt.tenant_id = ? AND ${istDateExpr('wt.created_at')} = ?
         AND (${laserWalletFilter})
       ORDER BY wt.id`,
      [TENANT_ID, todayIst, IPO_ID]
    );

    const receiveAppIds = [
      ...new Set(
        laserWallet
          .filter((wt) => wt.ref_type === 'ipo_application')
          .map((wt) => wt.ref_id)
      ),
    ];

    for (const wt of laserWallet) {
      console.log(`  Reverse wallet #${wt.id}: ${wt.type} ${wt.amount} — ${wt.notes}`);
      summary.walletReversed.push(await reverseAndDeleteWalletTxn(conn, wt, userId, todayIst));
    }

    const [ledgerCount] = await conn.query(
      `SELECT COUNT(*) AS c FROM member_ledger_entries l
       JOIN ipo_applications a ON a.id = l.ipo_application_id
       WHERE a.ipo_id = ? AND l.tenant_id = ? AND l.type = 'RECEIVED'
         AND ${istDateExpr('l.created_at')} = ?`,
      [IPO_ID, TENANT_ID, todayIst]
    );
    if (!dryRun) {
      const [delLedger] = await conn.query(
        `DELETE l FROM member_ledger_entries l
         JOIN ipo_applications a ON a.id = l.ipo_application_id
         WHERE a.ipo_id = ? AND l.tenant_id = ? AND l.type = 'RECEIVED'
           AND ${istDateExpr('l.created_at')} = ?`,
        [IPO_ID, TENANT_ID, todayIst]
      );
      summary.ledgerDeleted = delLedger.affectedRows;
    } else {
      summary.ledgerDeleted = ledgerCount[0]?.c ?? 0;
    }

    for (const appId of receiveAppIds) {
      if (!dryRun) {
        await conn.query(
          `UPDATE ipo_applications SET trns_received = NULL, date_received = NULL
           WHERE id = ? AND tenant_id = ? AND ipo_id = ?`,
          [appId, TENANT_ID, IPO_ID]
        );
      }
      summary.appsReset.push(appId);
    }

    const [orphanProvider] = await conn.query(
      `SELECT id, account_label, amount, provider_profit, notes FROM provider_transactions
       WHERE tenant_id = ? AND ${istCreated} AND notes LIKE '%Laser Power%'`,
      [TENANT_ID, todayIst]
    );
    if (!dryRun && orphanProvider.length) {
      const [delProv] = await conn.query(
        `DELETE FROM provider_transactions WHERE tenant_id = ? AND ${istCreated} AND notes LIKE '%Laser Power%'`,
        [TENANT_ID, todayIst]
      );
      summary.providerDeleted = delProv.affectedRows;
    } else {
      summary.providerDeleted = orphanProvider.length;
    }

    if (includeSbi) {
      const [sbiWallet] = await conn.query(
        `SELECT wt.* FROM wallet_transactions wt
         WHERE wt.tenant_id = ? AND ${istDateExpr('wt.created_at')} = ? AND wt.notes LIKE '%SBI MF%'
         ORDER BY wt.id`,
        [TENANT_ID, todayIst]
      );
      for (const wt of sbiWallet) {
        console.log(`  Reverse SBI wallet #${wt.id}: ${wt.type} ${wt.amount} — ${wt.notes}`);
        summary.walletReversed.push(await reverseAndDeleteWalletTxn(conn, wt, userId, todayIst));
      }
    }

    if (!dryRun) {
      await syncOwnerWalletTotal(conn, TENANT_ID);
    }
  });

  console.log('\n=== Rollback summary ===');
  console.log(JSON.stringify(summary, null, 2));
  await pool.end();
}

main().catch(async (err) => {
  console.error('Rollback failed:', err);
  await pool.end();
  process.exit(1);
});
