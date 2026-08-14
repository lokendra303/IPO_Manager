import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const scriptsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts');
const { getDbConnectionOptions } = await import(pathToFileURL(path.join(scriptsDir, 'db-config.js')).href);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function applyProfitSharesV2(conn) {
  if (!(await columnExists(conn, 'profit_share_defaults', 'loss_provider_percent'))) {
    await conn.query(
      `ALTER TABLE profit_share_defaults
       ADD COLUMN loss_provider_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
       ADD COLUMN loss_manager_percent DECIMAL(5, 2) NOT NULL DEFAULT 0`
    );
    console.log('Added loss % columns to profit_share_defaults');
  }
  if (!(await columnExists(conn, 'member_profit_shares', 'loss_provider_percent'))) {
    await conn.query(
      `ALTER TABLE member_profit_shares
       ADD COLUMN loss_provider_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
       ADD COLUMN loss_manager_percent DECIMAL(5, 2) NOT NULL DEFAULT 0`
    );
    console.log('Added loss % columns to member_profit_shares');
  }
  if (!(await columnExists(conn, 'profit_share_distributions', 'pnl_type'))) {
    await conn.query(
      `ALTER TABLE profit_share_distributions
       ADD COLUMN pnl_type ENUM('PROFIT', 'LOSS') NOT NULL DEFAULT 'PROFIT'`
    );
    await conn.query(
      `UPDATE profit_share_distributions SET pnl_type = 'LOSS' WHERE gross_profit_loss < 0`
    );
    console.log('Added pnl_type to profit_share_distributions');
  }
}

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows.length > 0;
}

async function applyProviderShareRulesV3(conn) {
  if (!(await tableExists(conn, 'fund_provider_share_rules'))) {
    await conn.query(
      `CREATE TABLE fund_provider_share_rules (
        fund_provider_id INT PRIMARY KEY,
        tenant_id INT NOT NULL,
        profit_provider_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
        profit_manager_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
        loss_provider_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
        loss_manager_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
        updated_at DATETIME DEFAULT NULL,
        FOREIGN KEY (fund_provider_id) REFERENCES fund_providers(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_provider_share_tenant (tenant_id)
      )`
    );
    console.log('Created fund_provider_share_rules');
  }

  if (!(await columnExists(conn, 'members', 'fund_provider_id'))) {
    await conn.query('ALTER TABLE members ADD COLUMN fund_provider_id INT DEFAULT NULL');
    console.log('Added members.fund_provider_id');
  }

  if (await tableExists(conn, 'profit_share_defaults')) {
    await conn.query(
      `INSERT INTO fund_provider_share_rules
       (fund_provider_id, tenant_id, profit_provider_percent, profit_manager_percent,
        loss_provider_percent, loss_manager_percent)
       SELECT default_fund_provider_id, tenant_id, default_provider_percent, manager_percent,
              COALESCE(loss_provider_percent, 0), COALESCE(loss_manager_percent, 0)
       FROM profit_share_defaults
       WHERE default_fund_provider_id IS NOT NULL
       ON DUPLICATE KEY UPDATE
         profit_provider_percent = VALUES(profit_provider_percent),
         profit_manager_percent = VALUES(profit_manager_percent),
         loss_provider_percent = VALUES(loss_provider_percent),
         loss_manager_percent = VALUES(loss_manager_percent)`
    );
  }

  if (await tableExists(conn, 'member_profit_shares')) {
    await conn.query(
      `UPDATE members m
       INNER JOIN member_profit_shares mps ON mps.member_id = m.id AND mps.tenant_id = m.tenant_id
       SET m.fund_provider_id = mps.fund_provider_id
       WHERE m.fund_provider_id IS NULL AND mps.fund_provider_id IS NOT NULL`
    );

    await conn.query(
      `INSERT INTO fund_provider_share_rules
       (fund_provider_id, tenant_id, profit_provider_percent, profit_manager_percent,
        loss_provider_percent, loss_manager_percent)
       SELECT mps.fund_provider_id, mps.tenant_id, mps.provider_percent, mps.manager_percent,
              COALESCE(mps.loss_provider_percent, 0), COALESCE(mps.loss_manager_percent, 0)
       FROM member_profit_shares mps
       WHERE mps.fund_provider_id IS NOT NULL
       ON DUPLICATE KEY UPDATE
         profit_provider_percent = IF(
           fund_provider_share_rules.profit_provider_percent = 0 AND fund_provider_share_rules.profit_manager_percent = 0,
           VALUES(profit_provider_percent),
           fund_provider_share_rules.profit_provider_percent
         )`
    );
  }
}

async function indexExists(conn, table, indexName) {
  const [rows] = await conn.query(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  return rows.length > 0;
}

async function applyMemberMultiRulesV4(conn) {
  if (await tableExists(conn, 'member_profit_shares')) {
    if (!(await columnExists(conn, 'member_profit_shares', 'rule_name'))) {
      await conn.query(
        `ALTER TABLE member_profit_shares
         ADD COLUMN rule_name VARCHAR(100) DEFAULT NULL,
         ADD COLUMN sort_order INT NOT NULL DEFAULT 0`
      );
      console.log('Added rule_name, sort_order to member_profit_shares');
    }
    if (await indexExists(conn, 'member_profit_shares', 'uk_member_profit_share')) {
      // MySQL uses uk_member_profit_share for the member_id FK; drop FK first, then unique, then restore FK.
      const [fks] = await conn.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_profit_shares'
         AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'member_profit_shares_ibfk_2'`
      );
      if (fks.length) {
        await conn.query('ALTER TABLE member_profit_shares DROP FOREIGN KEY member_profit_shares_ibfk_2');
      }
      await conn.query('ALTER TABLE member_profit_shares DROP INDEX uk_member_profit_share');
      console.log('Dropped uk_member_profit_share — multiple rules per member allowed');
      if (!(await indexExists(conn, 'member_profit_shares', 'idx_member_profit_shares_member'))) {
        await conn.query(
          'ALTER TABLE member_profit_shares ADD INDEX idx_member_profit_shares_member (member_id, tenant_id)'
        );
      }
      if (fks.length) {
        await conn.query(
          `ALTER TABLE member_profit_shares
           ADD CONSTRAINT member_profit_shares_ibfk_2
           FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE`
        );
      }
    } else if (!(await indexExists(conn, 'member_profit_shares', 'idx_member_profit_shares_member'))) {
      await conn.query(
        'ALTER TABLE member_profit_shares ADD INDEX idx_member_profit_shares_member (member_id, tenant_id)'
      );
    }
    await conn.query(
      `UPDATE member_profit_shares SET rule_name = CONCAT('Rule ', id) WHERE rule_name IS NULL OR rule_name = ''`
    );
  }

  if (!(await tableExists(conn, 'profit_share_distribution_rules'))) {
    const sql = fs.readFileSync(
      path.join(__dirname, 'schema-profit-share-distribution-rules.sql'),
      'utf8'
    );
    await conn.query(sql);
    console.log('Created profit_share_distribution_rules');
  }
}

async function applyBankAccountsV5(conn) {
  if (!(await tableExists(conn, 'manager_bank_accounts'))) {
    const sql = fs.readFileSync(path.join(__dirname, 'schema-bank-accounts.sql'), 'utf8');
    await conn.query(sql);
    console.log('Created manager_bank_accounts');
  }

  if (!(await columnExists(conn, 'wallet_transactions', 'bank_account_id'))) {
    await conn.query(
      `ALTER TABLE wallet_transactions
       ADD COLUMN bank_account_id INT DEFAULT NULL,
       ADD INDEX idx_wallet_txn_account (bank_account_id),
       ADD CONSTRAINT fk_wallet_txn_bank_account
         FOREIGN KEY (bank_account_id) REFERENCES manager_bank_accounts(id) ON DELETE SET NULL`
    );
    console.log('Added wallet_transactions.bank_account_id');
  }

  if (!(await columnExists(conn, 'provider_transactions', 'bank_account_id'))) {
    await conn.query(
      `ALTER TABLE provider_transactions
       ADD COLUMN bank_account_id INT DEFAULT NULL,
       ADD INDEX idx_provider_txn_account (bank_account_id),
       ADD CONSTRAINT fk_provider_txn_bank_account
         FOREIGN KEY (bank_account_id) REFERENCES manager_bank_accounts(id) ON DELETE SET NULL`
    );
    console.log('Added provider_transactions.bank_account_id');
  }

  const [tenants] = await conn.query('SELECT tenant_id, balance FROM owner_wallets');
  for (const row of tenants) {
    const tenantId = row.tenant_id;
    const [existing] = await conn.query(
      'SELECT id FROM manager_bank_accounts WHERE tenant_id = ? LIMIT 1',
      [tenantId]
    );
    if (existing.length) continue;

    const balance = Number(row.balance ?? 0);
    const [ins] = await conn.query(
      `INSERT INTO manager_bank_accounts
       (tenant_id, label, is_default, is_active, balance, sort_order)
       VALUES (?, 'Primary', 0, 1, ?, 0)`,
      [tenantId, balance]
    );
    const accountId = ins.insertId;

    await conn.query(
      `UPDATE wallet_transactions SET bank_account_id = ? WHERE tenant_id = ? AND bank_account_id IS NULL`,
      [accountId, tenantId]
    );
    await conn.query(
      `UPDATE provider_transactions SET bank_account_id = ? WHERE tenant_id = ? AND bank_account_id IS NULL`,
      [accountId, tenantId]
    );
    console.log(`Migrated tenant ${tenantId} wallet to bank account ${accountId}`);
  }

}

async function applyBankTransfersV6(conn) {
  const transferTypes = "'TRANSFER_OUT','TRANSFER_IN'";
  const [col] = await conn.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wallet_transactions' AND COLUMN_NAME = 'type'`
  );
  const columnType = col[0]?.COLUMN_TYPE || '';
  if (!columnType.includes('TRANSFER_OUT')) {
    await conn.query(
      `ALTER TABLE wallet_transactions
       MODIFY COLUMN type ENUM('PROVIDER_IN', 'DISTRIBUTE_OUT', 'RETURN_IN', 'ADJUSTMENT', 'PROVIDER_OUT', ${transferTypes}) NOT NULL`
    );
    console.log('Added TRANSFER_OUT, TRANSFER_IN to wallet_transactions.type');
  }

  if (!(await tableExists(conn, 'bank_account_transfers'))) {
    const sql = fs.readFileSync(path.join(__dirname, 'schema-bank-transfers.sql'), 'utf8');
    await conn.query(sql);
    console.log('Created bank_account_transfers');
  }
}

async function applyMemberIssuesV7(conn) {
  if (!(await tableExists(conn, 'member_issues'))) {
    const sql = fs.readFileSync(path.join(__dirname, 'schema-member-issues.sql'), 'utf8');
    await conn.query(sql);
    console.log('Created member_issues');
  }
}

async function applyMemberGroupsV8(conn) {
  if (!(await tableExists(conn, 'member_groups'))) {
    const sql = fs.readFileSync(path.join(__dirname, 'schema-member-groups.sql'), 'utf8');
    await conn.query(sql);
    console.log('Created member_groups');
  }

  if (!(await columnExists(conn, 'members', 'member_group_id'))) {
    await conn.query(
      `ALTER TABLE members
       ADD COLUMN member_group_id INT DEFAULT NULL,
       ADD INDEX idx_members_group (member_group_id),
       ADD CONSTRAINT fk_members_group
         FOREIGN KEY (member_group_id) REFERENCES member_groups(id) ON DELETE SET NULL`
    );
    console.log('Added members.member_group_id');
  }

  const [legacy] = await conn.query(
    `SELECT DISTINCT tenant_id, bulk_group_label
     FROM members
     WHERE bulk_group_label IS NOT NULL AND TRIM(bulk_group_label) != ''`
  );

  for (const row of legacy) {
    const label = row.bulk_group_label.trim();
    const tenantId = row.tenant_id;
    const [existing] = await conn.query(
      'SELECT id FROM member_groups WHERE tenant_id = ? AND name = ?',
      [tenantId, label]
    );
    let groupId = existing[0]?.id;
    if (!groupId) {
      const [ins] = await conn.query(
        'INSERT INTO member_groups (tenant_id, name, sort_order) VALUES (?, ?, 0)',
        [tenantId, label]
      );
      groupId = ins.insertId;
      console.log(`Migrated bulk group "${label}" for tenant ${tenantId}`);
    }
    await conn.query(
      `UPDATE members SET member_group_id = ?
       WHERE tenant_id = ? AND bulk_group_label = ? AND member_group_id IS NULL`,
      [groupId, tenantId, label]
    );
  }
}

async function applyIssueResolutionNotesV9(conn) {
  if (await tableExists(conn, 'member_issues')) {
    if (!(await columnExists(conn, 'member_issues', 'resolution_note'))) {
      await conn.query('ALTER TABLE member_issues ADD COLUMN resolution_note TEXT DEFAULT NULL');
      console.log('Added member_issues.resolution_note');
    }
  }
}

async function applyAuditLogV10(conn) {
  if (!(await tableExists(conn, 'audit_logs'))) {
    const sql = fs.readFileSync(path.join(__dirname, 'schema-audit-log.sql'), 'utf8');
    await conn.query(sql);
    console.log('Created audit_logs');
  }
}

async function applyIpoRegistrarV11(conn) {
  if (!(await columnExists(conn, 'ipos', 'registrar'))) {
    await conn.query(
      `ALTER TABLE ipos ADD COLUMN registrar VARCHAR(32) DEFAULT NULL`
    );
    console.log('Added ipos.registrar');
  }
}

async function applyMemberShareIpoV12(conn) {
  if (!(await tableExists(conn, 'member_profit_shares'))) return;
  if (!(await columnExists(conn, 'member_profit_shares', 'ipo_id'))) {
    await conn.query(
      `ALTER TABLE member_profit_shares
       ADD COLUMN ipo_id INT DEFAULT NULL AFTER member_id`
    );
    console.log('Added member_profit_shares.ipo_id');
  }
  if (!(await indexExists(conn, 'member_profit_shares', 'idx_member_profit_shares_ipo'))) {
    await conn.query(
      'ALTER TABLE member_profit_shares ADD INDEX idx_member_profit_shares_ipo (member_id, ipo_id, tenant_id)'
    );
    console.log('Added idx_member_profit_shares_ipo');
  }
  const [fkRows] = await conn.query(
    `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_profit_shares'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'member_profit_shares_ipo_fk'`
  );
  if (!fkRows.length) {
    await conn.query(
      `ALTER TABLE member_profit_shares
       ADD CONSTRAINT member_profit_shares_ipo_fk
       FOREIGN KEY (ipo_id) REFERENCES ipos(id) ON DELETE CASCADE`
    );
    console.log('Added member_profit_shares IPO foreign key');
  }
}

async function applyMemberContactV13(conn) {
  if (!(await tableExists(conn, 'members'))) return;
  if (!(await columnExists(conn, 'members', 'email'))) {
    await conn.query('ALTER TABLE members ADD COLUMN email VARCHAR(255) DEFAULT NULL AFTER display_name');
    console.log('Added members.email');
  }
  if (!(await columnExists(conn, 'members', 'upi'))) {
    await conn.query('ALTER TABLE members ADD COLUMN upi VARCHAR(255) DEFAULT NULL AFTER email');
    console.log('Added members.upi');
  }
}

async function applyIpoCategoriesV14(conn) {
  if (await tableExists(conn, 'ipos')) {
    if (!(await columnExists(conn, 'ipos', 'ipo_segment'))) {
      await conn.query(
        `ALTER TABLE ipos ADD COLUMN ipo_segment ENUM('SME', 'MAINBOARD') NOT NULL DEFAULT 'MAINBOARD'`
      );
      console.log('Added ipos.ipo_segment');
    }
    if (!(await columnExists(conn, 'ipos', 'allowed_categories'))) {
      await conn.query(
        `ALTER TABLE ipos ADD COLUMN allowed_categories JSON NOT NULL DEFAULT ('["RII","HNI"]')`
      );
      console.log('Added ipos.allowed_categories');
    }
  }
  if (await tableExists(conn, 'ipo_applications')) {
    if (!(await columnExists(conn, 'ipo_applications', 'investor_category'))) {
      await conn.query(
        `ALTER TABLE ipo_applications
         ADD COLUMN investor_category ENUM('RII', 'HNI') NOT NULL DEFAULT 'RII' AFTER allotment_status`
      );
      console.log('Added ipo_applications.investor_category');
    }
  }
}

async function applyRemoveCmrV15(conn) {
  if (await tableExists(conn, 'ipo_applications')) {
    if (await columnExists(conn, 'ipo_applications', 'investor_category')) {
      await conn.query(
        `UPDATE ipo_applications SET investor_category = 'RII' WHERE investor_category = 'CMR'`
      );
      await conn.query(
        `ALTER TABLE ipo_applications
         MODIFY COLUMN investor_category ENUM('RII', 'HNI') NOT NULL DEFAULT 'RII'`
      );
      console.log('Removed CMR from ipo_applications.investor_category');
    }
  }
  if (await tableExists(conn, 'ipos') && await columnExists(conn, 'ipos', 'allowed_categories')) {
    const [rows] = await conn.query('SELECT id, allowed_categories FROM ipos');
    for (const row of rows) {
      let cats = row.allowed_categories;
      if (typeof cats === 'string') {
        try {
          cats = JSON.parse(cats);
        } catch {
          cats = [];
        }
      }
      if (!Array.isArray(cats)) continue;
      const filtered = cats.filter((c) => String(c).toUpperCase() !== 'CMR');
      if (filtered.length !== cats.length || filtered.length < 2) {
        const next = filtered.length >= 2 ? filtered : ['RII', 'HNI'];
        await conn.query('UPDATE ipos SET allowed_categories = ? WHERE id = ?', [
          JSON.stringify([...new Set(next.map((c) => String(c).toUpperCase()))]),
          row.id,
        ]);
      }
    }
    console.log('Stripped CMR from ipos.allowed_categories');
  }
}

async function applyIpoLotByCategoryV16(conn) {
  if (!(await tableExists(conn, 'ipos'))) return;
  if (!(await columnExists(conn, 'ipos', 'lot_amount_rii'))) {
    await conn.query(
      'ALTER TABLE ipos ADD COLUMN lot_amount_rii DECIMAL(15, 2) NULL AFTER lot_amount'
    );
    console.log('Added ipos.lot_amount_rii');
  }
  if (!(await columnExists(conn, 'ipos', 'lot_amount_hni'))) {
    await conn.query(
      'ALTER TABLE ipos ADD COLUMN lot_amount_hni DECIMAL(15, 2) NULL AFTER lot_amount_rii'
    );
    console.log('Added ipos.lot_amount_hni');
  }
  await conn.query(
    `UPDATE ipos
     SET lot_amount_rii = COALESCE(lot_amount_rii, lot_amount),
         lot_amount_hni = COALESCE(lot_amount_hni, lot_amount)
     WHERE lot_amount IS NOT NULL`
  );
  const [riiCol] = await conn.query(
    `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ipos' AND COLUMN_NAME = 'lot_amount_rii'`
  );
  if (riiCol[0]?.IS_NULLABLE === 'YES') {
    await conn.query(
      'ALTER TABLE ipos MODIFY lot_amount_rii DECIMAL(15, 2) NOT NULL'
    );
    await conn.query(
      'ALTER TABLE ipos MODIFY lot_amount_hni DECIMAL(15, 2) NOT NULL'
    );
    console.log('Set ipos lot_amount_rii / lot_amount_hni NOT NULL');
  }
}

async function applyOptionalHniV17(conn) {
  if (!(await tableExists(conn, 'ipos'))) return;
  const [hniCol] = await conn.query(
    `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ipos' AND COLUMN_NAME = 'lot_amount_hni'`
  );
  if (hniCol[0]?.IS_NULLABLE === 'NO') {
    await conn.query('ALTER TABLE ipos MODIFY lot_amount_hni DECIMAL(15, 2) NULL');
    console.log('Made ipos.lot_amount_hni nullable');
  }
}

async function applyGroupOwnerV18(conn) {
  if (await tableExists(conn, 'member_groups')) {
    if (!(await columnExists(conn, 'member_groups', 'owner_member_id'))) {
      await conn.query(
        'ALTER TABLE member_groups ADD COLUMN owner_member_id INT DEFAULT NULL AFTER name'
      );
      console.log('Added member_groups.owner_member_id');
    }
    const [fkRows] = await conn.query(
      `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_groups'
       AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'member_groups_owner_fk'`
    );
    if (!fkRows.length && (await columnExists(conn, 'member_groups', 'owner_member_id'))) {
      await conn.query(
        `ALTER TABLE member_groups
         ADD CONSTRAINT member_groups_owner_fk
         FOREIGN KEY (owner_member_id) REFERENCES members(id) ON DELETE SET NULL`
      );
      console.log('Added member_groups_owner_fk');
    }
  }
  if (await tableExists(conn, 'ipo_applications')) {
    if (!(await columnExists(conn, 'ipo_applications', 'paid_to_member_id'))) {
      await conn.query(
        'ALTER TABLE ipo_applications ADD COLUMN paid_to_member_id INT DEFAULT NULL AFTER investor_category'
      );
      console.log('Added ipo_applications.paid_to_member_id');
    }
  }
}

async function applyFixGroupBulkMemberCountV24(conn) {
  if (!(await tableExists(conn, 'member_group_bulk_payments'))) return;
  if (!(await tableExists(conn, 'ipo_applications'))) return;

  const [result] = await conn.query(
    `UPDATE member_group_bulk_payments bp
     JOIN (
       SELECT a.tenant_id, m.member_group_id, a.ipo_id, a.paid_to_member_id AS owner_member_id,
              COUNT(*) AS member_count, SUM(a.amount) AS total_amount
       FROM ipo_applications a
       JOIN members m ON m.id = a.member_id AND m.tenant_id = a.tenant_id
       WHERE a.paid_to_member_id IS NOT NULL AND m.member_group_id IS NOT NULL
       GROUP BY a.tenant_id, m.member_group_id, a.ipo_id, a.paid_to_member_id
     ) agg ON agg.tenant_id = bp.tenant_id
       AND agg.member_group_id = bp.member_group_id
       AND agg.ipo_id = bp.ipo_id
       AND agg.owner_member_id = bp.owner_member_id
     SET bp.member_count = agg.member_count,
         bp.total_amount = agg.total_amount`
  );
  if (result.affectedRows) {
    console.log(`Updated ${result.affectedRows} group bulk payment row(s) to include owner in member count`);
  }
}

async function applyGroupBulkPaymentsV23(conn) {
  if (!(await tableExists(conn, 'member_group_bulk_payments'))) {
    await conn.query(
      `CREATE TABLE member_group_bulk_payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        member_group_id INT NOT NULL,
        ipo_id INT NOT NULL,
        owner_member_id INT NOT NULL,
        total_amount DECIMAL(15, 2) NOT NULL,
        member_count INT NOT NULL,
        investor_category VARCHAR(10) DEFAULT NULL,
        paid_at DATETIME NOT NULL,
        notes VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (member_group_id) REFERENCES member_groups(id) ON DELETE CASCADE,
        FOREIGN KEY (ipo_id) REFERENCES ipos(id) ON DELETE CASCADE,
        FOREIGN KEY (owner_member_id) REFERENCES members(id) ON DELETE CASCADE,
        INDEX idx_group_bulk_group (member_group_id, paid_at),
        INDEX idx_group_bulk_tenant (tenant_id)
      )`
    );
    console.log('Created member_group_bulk_payments');
  }

  if (
    (await tableExists(conn, 'ipo_applications'))
    && (await columnExists(conn, 'ipo_applications', 'paid_to_member_id'))
    && (await tableExists(conn, 'members'))
    && (await tableExists(conn, 'member_groups'))
  ) {
    const [existing] = await conn.query('SELECT COUNT(*) AS c FROM member_group_bulk_payments');
    if (Number(existing[0].c) === 0) {
      await conn.query(
        `INSERT INTO member_group_bulk_payments
         (tenant_id, member_group_id, ipo_id, owner_member_id, total_amount, member_count,
          investor_category, paid_at, notes)
         SELECT a.tenant_id,
                m.member_group_id,
                a.ipo_id,
                a.paid_to_member_id,
                SUM(a.amount),
                COUNT(*),
                MAX(a.investor_category),
                COALESCE(MIN(a.date_given), MIN(a.created_at)),
                CONCAT('IPO: ', i.name, ' — ', g.name)
         FROM ipo_applications a
         JOIN members m ON m.id = a.member_id AND m.tenant_id = a.tenant_id
         JOIN member_groups g ON g.id = m.member_group_id
         JOIN ipos i ON i.id = a.ipo_id
         WHERE a.paid_to_member_id IS NOT NULL
           AND m.member_group_id IS NOT NULL
         GROUP BY a.tenant_id, m.member_group_id, a.ipo_id, a.paid_to_member_id`
      );
      console.log('Backfilled member_group_bulk_payments from IPO applications');
    }
  }

  if (!(await tableExists(conn, 'member_ledger_entries'))) return;
  const [missing] = await conn.query(
    `SELECT a.id, a.member_id, a.tenant_id, a.amount, a.date_given, a.paid_to_member_id,
            i.name AS ipo_name, g.name AS group_name
     FROM ipo_applications a
     JOIN ipos i ON i.id = a.ipo_id
     LEFT JOIN members m ON m.id = a.member_id
     LEFT JOIN member_groups g ON g.id = m.member_group_id
     WHERE NOT EXISTS (
       SELECT 1 FROM member_ledger_entries l
       WHERE l.ipo_application_id = a.id AND l.member_id = a.member_id AND l.type = 'GIVEN'
     )`
  );
  let fixed = 0;
  for (const row of missing) {
    const note = row.paid_to_member_id && row.paid_to_member_id !== row.member_id
      ? `IPO: ${row.ipo_name} — ${row.group_name || 'group'} (paid to group owner)`
      : `IPO: ${row.ipo_name}`;
    await conn.query(
      `INSERT INTO member_ledger_entries (member_id, tenant_id, type, amount, txn_date, ipo_application_id, notes)
       VALUES (?, ?, 'GIVEN', ?, ?, ?, ?)`,
      [
        row.member_id,
        row.tenant_id,
        row.amount,
        row.date_given || new Date(),
        row.id,
        note,
      ]
    );
    fixed += 1;
  }
  if (fixed) console.log(`Backfilled ${fixed} missing member GIVEN ledger entries`);
}

async function applyFixBulkOwnerLedgerV22(conn) {
  if (!(await tableExists(conn, 'member_ledger_entries'))) return;

  const [removedReceived] = await conn.query(
    `DELETE FROM member_ledger_entries
     WHERE type = 'RECEIVED'
       AND (notes LIKE '%group bulk (received on behalf%' OR notes LIKE '%bulk (received%')`
  );

  const [removedOwnerGiven] = await conn.query(
    `DELETE l FROM member_ledger_entries l
     WHERE l.type = 'GIVEN'
       AND l.notes LIKE '%bulk%'
       AND l.notes NOT LIKE '%paid to group owner%'
       AND EXISTS (
         SELECT 1 FROM ipo_applications a
         WHERE a.paid_to_member_id = l.member_id
           AND a.member_id <> l.member_id
           AND a.tenant_id = l.tenant_id
       )`
  );

  const rc = Number(removedReceived.affectedRows || 0) + Number(removedOwnerGiven.affectedRows || 0);
  if (rc > 0) {
    console.log(
      `Cleaned bulk owner ledgers: ${removedReceived.affectedRows || 0} RECEIVED, ${removedOwnerGiven.affectedRows || 0} duplicate owner GIVEN`
    );
  }
}

async function applyBulkMemberGivenLedgerV21(conn) {
  if (!(await tableExists(conn, 'ipo_applications'))) return;
  if (!(await tableExists(conn, 'member_ledger_entries'))) return;
  if (!(await columnExists(conn, 'ipo_applications', 'paid_to_member_id'))) return;

  const [rows] = await conn.query(
    `SELECT a.id, a.member_id, a.tenant_id, a.amount, a.date_given, a.paid_to_member_id,
            i.name AS ipo_name, m.display_name AS member_name, o.display_name AS owner_name
     FROM ipo_applications a
     JOIN ipos i ON i.id = a.ipo_id
     JOIN members m ON m.id = a.member_id
     JOIN members o ON o.id = a.paid_to_member_id
     WHERE a.paid_to_member_id IS NOT NULL
       AND a.paid_to_member_id <> a.member_id`
  );

  let insertedGiven = 0;
  let insertedReceived = 0;

  for (const row of rows) {
    const [hasGiven] = await conn.query(
      `SELECT 1 FROM member_ledger_entries
       WHERE ipo_application_id = ? AND member_id = ? AND tenant_id = ? AND type = 'GIVEN'
       LIMIT 1`,
      [row.id, row.member_id, row.tenant_id]
    );
    if (!hasGiven.length) {
      const txnDate = row.date_given || new Date();
      await conn.query(
        `INSERT INTO member_ledger_entries (member_id, tenant_id, type, amount, txn_date, ipo_application_id, notes)
         VALUES (?, ?, 'GIVEN', ?, ?, ?, ?)`,
        [
          row.member_id,
          row.tenant_id,
          row.amount,
          txnDate,
          row.id,
          `IPO: ${row.ipo_name} — bulk (paid to ${row.owner_name})`,
        ]
      );
      insertedGiven += 1;
    }
  }

  const [bulkGroups] = await conn.query(
    `SELECT a.tenant_id, a.ipo_id, a.paid_to_member_id AS owner_id,
            i.name AS ipo_name, o.display_name AS owner_name,
            SUM(a.amount) AS group_total, MIN(a.date_given) AS txn_date,
            GROUP_CONCAT(a.id) AS app_ids
     FROM ipo_applications a
     JOIN ipos i ON i.id = a.ipo_id
     JOIN members o ON o.id = a.paid_to_member_id
     WHERE a.paid_to_member_id IS NOT NULL
       AND a.paid_to_member_id <> a.member_id
     GROUP BY a.tenant_id, a.ipo_id, a.paid_to_member_id`
  );

  for (const g of bulkGroups) {
    const [hasReceived] = await conn.query(
      `SELECT 1 FROM member_ledger_entries
       WHERE member_id = ? AND tenant_id = ? AND type = 'RECEIVED'
         AND notes LIKE ? LIMIT 1`,
      [g.owner_id, g.tenant_id, `IPO: ${g.ipo_name} —%bulk%`]
    );
    if (!hasReceived.length) {
      const firstAppId = Number(String(g.app_ids).split(',')[0]);
      await conn.query(
        `INSERT INTO member_ledger_entries (member_id, tenant_id, type, amount, txn_date, ipo_application_id, notes)
         VALUES (?, ?, 'RECEIVED', ?, ?, ?, ?)`,
        [
          g.owner_id,
          g.tenant_id,
          g.group_total,
          g.txn_date || new Date(),
          firstAppId,
          `IPO: ${g.ipo_name} — group bulk (received on behalf of members)`,
        ]
      );
      insertedReceived += 1;
    }
  }

  if (insertedGiven || insertedReceived) {
    console.log(
      `Backfilled bulk IPO ledgers: ${insertedGiven} member GIVEN, ${insertedReceived} owner RECEIVED`
    );
  }
}

async function applyRuleTemplatesV20(conn) {
  if (!(await tableExists(conn, 'profit_share_rule_templates'))) {
    await conn.query(
      `CREATE TABLE profit_share_rule_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        rule_name VARCHAR(100) NOT NULL,
        fund_provider_id INT NOT NULL,
        profit_provider_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
        profit_manager_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
        loss_provider_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
        loss_manager_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (fund_provider_id) REFERENCES fund_providers(id) ON DELETE CASCADE,
        INDEX idx_rule_templates_tenant (tenant_id, sort_order)
      )`
    );
    console.log('Created profit_share_rule_templates');
  }
  if (
    (await tableExists(conn, 'fund_provider_share_rules'))
    && (await tableExists(conn, 'fund_providers'))
  ) {
    const [existing] = await conn.query('SELECT COUNT(*) AS c FROM profit_share_rule_templates');
    if (Number(existing[0].c) === 0) {
      await conn.query(
        `INSERT INTO profit_share_rule_templates
         (tenant_id, rule_name, fund_provider_id, profit_provider_percent, profit_manager_percent,
          loss_provider_percent, loss_manager_percent, sort_order)
         SELECT fpsr.tenant_id,
                COALESCE(NULLIF(TRIM(fpsr.rule_name), ''), fp.name),
                fpsr.fund_provider_id,
                fpsr.profit_provider_percent,
                fpsr.profit_manager_percent,
                fpsr.loss_provider_percent,
                fpsr.loss_manager_percent,
                fp.id
         FROM fund_provider_share_rules fpsr
         JOIN fund_providers fp ON fp.id = fpsr.fund_provider_id
         WHERE fpsr.profit_provider_percent + fpsr.profit_manager_percent
             + fpsr.loss_provider_percent + fpsr.loss_manager_percent > 0`
      );
      console.log('Seeded profit_share_rule_templates from fund_provider_share_rules');
    }
  }
}

async function applyProviderRuleNameV19(conn) {
  if (!(await tableExists(conn, 'fund_provider_share_rules'))) return;
  if (!(await columnExists(conn, 'fund_provider_share_rules', 'rule_name'))) {
    await conn.query(
      'ALTER TABLE fund_provider_share_rules ADD COLUMN rule_name VARCHAR(100) DEFAULT NULL AFTER tenant_id'
    );
    console.log('Added fund_provider_share_rules.rule_name');
  }
  await conn.query(
    `UPDATE fund_provider_share_rules fpsr
     JOIN fund_providers fp ON fp.id = fpsr.fund_provider_id
     SET fpsr.rule_name = fp.name
     WHERE fpsr.rule_name IS NULL OR TRIM(fpsr.rule_name) = ''`
  );
}

async function applySystemAdminV25(conn) {
  if (!(await tableExists(conn, 'system_admins'))) {
    await conn.query(
      `CREATE TABLE system_admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(191) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        display_name VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    );
    console.log('Created system_admins');
  }

  if (!(await columnExists(conn, 'tenants', 'status'))) {
    await conn.query(
      `ALTER TABLE tenants
       ADD COLUMN status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'APPROVED' AFTER name,
       ADD COLUMN approved_at TIMESTAMP NULL DEFAULT NULL,
       ADD COLUMN approved_by INT DEFAULT NULL,
       ADD COLUMN rejection_reason TEXT DEFAULT NULL`
    );
    await conn.query('UPDATE tenants SET status = ? WHERE status IS NULL OR status = ?', ['APPROVED', 'APPROVED']);
    console.log('Added tenant approval columns');
  }

  if (!(await indexExists(conn, 'tenants', 'idx_tenants_status'))) {
    await conn.query('CREATE INDEX idx_tenants_status ON tenants (status)');
    console.log('Added idx_tenants_status');
  }
}

async function applyTenantDisabledV26(conn) {
  if (await columnExists(conn, 'tenants', 'status')) {
    const [col] = await conn.query(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants' AND COLUMN_NAME = 'status'`
    );
    if (col[0] && !String(col[0].COLUMN_TYPE).includes('DISABLED')) {
      await conn.query(
        `ALTER TABLE tenants MODIFY status ENUM('PENDING', 'APPROVED', 'REJECTED', 'DISABLED') NOT NULL DEFAULT 'PENDING'`
      );
      console.log('Added DISABLED to tenants.status');
    }
  }

  if (!(await columnExists(conn, 'tenants', 'disabled_at'))) {
    await conn.query(
      `ALTER TABLE tenants
       ADD COLUMN disabled_at TIMESTAMP NULL DEFAULT NULL,
       ADD COLUMN disabled_by INT DEFAULT NULL,
       ADD COLUMN disable_reason TEXT DEFAULT NULL`
    );
    console.log('Added tenant disable columns');
  }
}

async function applyJsonCompatV27(conn) {
  const jsonColumns = [
    { table: 'audit_logs', column: 'metadata' },
    { table: 'fund_providers', column: 'contact_info' },
    { table: 'ipos', column: 'allowed_categories' },
  ];

  for (const { table, column } of jsonColumns) {
    if (!(await tableExists(conn, table)) || !(await columnExists(conn, table, column))) continue;
    const [col] = await conn.query(
      `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    if (col[0]?.DATA_TYPE?.toLowerCase() === 'json') {
      await conn.query(`ALTER TABLE \`${table}\` MODIFY \`${column}\` LONGTEXT DEFAULT NULL`);
      console.log(`Converted ${table}.${column} from JSON to LONGTEXT`);
    }
  }

  if (await indexExists(conn, 'audit_logs', 'idx_audit_tenant_time')) {
    await conn.query('ALTER TABLE audit_logs DROP INDEX idx_audit_tenant_time');
    await conn.query('CREATE INDEX idx_audit_tenant_time ON audit_logs (tenant_id, created_at)');
    console.log('Rebuilt idx_audit_tenant_time without DESC');
  }
}

async function applyTimestampCompatV28(conn) {
  const tables = [
    'members',
    'manager_bank_accounts',
    'ipo_applications',
    'profit_share_rule_templates',
    'fund_provider_share_rules',
    'profit_share_defaults',
    'member_profit_shares',
  ];

  for (const table of tables) {
    if (!(await tableExists(conn, table)) || !(await columnExists(conn, table, 'updated_at'))) continue;
    const [col] = await conn.query(
      `SELECT DATA_TYPE, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'updated_at'`,
      [table]
    );
    if (!col.length) continue;
    const type = col[0].DATA_TYPE?.toLowerCase();
    const columnType = String(col[0].COLUMN_TYPE || '');
    if (type === 'timestamp' || columnType.includes('ON UPDATE CURRENT_TIMESTAMP')) {
      await conn.query(`ALTER TABLE \`${table}\` MODIFY \`updated_at\` DATETIME DEFAULT NULL`);
      console.log(`Converted ${table}.updated_at to DATETIME for older MySQL compatibility`);
    }
  }
}

async function applyEmailIndexCompatV29(conn) {
  for (const table of ['users', 'system_admins']) {
    if (!(await tableExists(conn, table)) || !(await columnExists(conn, table, 'email'))) continue;
    const [col] = await conn.query(
      `SELECT CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'email'`,
      [table]
    );
    if (Number(col[0]?.CHARACTER_MAXIMUM_LENGTH) > 191) {
      await conn.query(`ALTER TABLE \`${table}\` MODIFY \`email\` VARCHAR(191) NOT NULL`);
      console.log(`Shrunk ${table}.email to VARCHAR(191) for index compatibility`);
    }
  }
}

async function applyNotAppliedV30(conn) {
  if (!(await tableExists(conn, 'ipo_applications')) || !(await columnExists(conn, 'ipo_applications', 'allotment_status'))) {
    return;
  }
  const [col] = await conn.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ipo_applications' AND COLUMN_NAME = 'allotment_status'`
  );
  const columnType = String(col[0]?.COLUMN_TYPE || '');
  if (!columnType.includes('NOT_APPLIED')) {
    await conn.query(
      `ALTER TABLE ipo_applications
       MODIFY allotment_status ENUM('PENDING', 'ALLOTED', 'NOT_ALLOTED', 'NOT_APPLIED') NOT NULL DEFAULT 'PENDING'`
    );
    console.log('Added NOT_APPLIED to ipo_applications.allotment_status');
  }
}

async function applyUppercasePanV31(conn) {
  if (!(await tableExists(conn, 'members'))) return;
  const [result] = await conn.query(
    `UPDATE members SET pan = UPPER(TRIM(pan)) WHERE pan <> UPPER(TRIM(pan))`
  );
  if (result.affectedRows) {
    console.log(`Uppercased ${result.affectedRows} member PAN(s)`);
  }
}

async function applyOrphanedProfitShareCleanupV33(conn) {
  if (!(await tableExists(conn, 'profit_share_distributions'))) return;

  const { revokeProfitShareDistribution } = await import('../services/profitShareService.js');

  const [orphans] = await conn.query(
    `SELECT psd.ipo_application_id, psd.tenant_id
     FROM profit_share_distributions psd
     JOIN ipo_applications a ON a.id = psd.ipo_application_id
     WHERE a.allotment_status <> 'ALLOTED'
        OR (a.profit_loss IS NOT NULL AND ABS(a.profit_loss - psd.gross_profit_loss) >= 0.01)`
  );

  let cleaned = 0;
  for (const row of orphans) {
    const result = await revokeProfitShareDistribution(conn, {
      tenantId: row.tenant_id,
      applicationId: row.ipo_application_id,
      userId: null,
    });
    if (result.revoked) cleaned += 1;
  }

  if (cleaned) {
    console.log(`Reversed ${cleaned} orphaned profit share distribution(s)`);
  }
}

async function applyBankAccountDefaultV32(conn) {
  if (!(await tableExists(conn, 'manager_bank_accounts'))) return;

  const [tenants] = await conn.query(
    'SELECT DISTINCT tenant_id FROM manager_bank_accounts WHERE is_active = 1'
  );

  let fixed = 0;
  for (const { tenant_id: tenantId } of tenants) {
    const [defaults] = await conn.query(
      `SELECT id FROM manager_bank_accounts
       WHERE tenant_id = ? AND is_active = 1 AND is_default = 1
       ORDER BY sort_order, id`,
      [tenantId]
    );

    if (defaults.length === 1) continue;

    if (defaults.length > 1) {
      const keepId = defaults[0].id;
      await conn.query(
        'UPDATE manager_bank_accounts SET is_default = 0 WHERE tenant_id = ? AND id <> ?',
        [tenantId, keepId]
      );
      fixed += 1;
      continue;
    }

    const [first] = await conn.query(
      `SELECT id FROM manager_bank_accounts
       WHERE tenant_id = ? AND is_active = 1
       ORDER BY sort_order, id
       LIMIT 1`,
      [tenantId]
    );
    if (!first.length) continue;

    await conn.query(
      'UPDATE manager_bank_accounts SET is_default = 0 WHERE tenant_id = ?',
      [tenantId]
    );
    await conn.query(
      'UPDATE manager_bank_accounts SET is_default = 1 WHERE id = ?',
      [first[0].id]
    );
    fixed += 1;
  }

  if (fixed) {
    console.log(`Set default bank account for ${fixed} tenant(s)`);
  }
}

async function applyEmailAuthV34(conn) {
  if (!(await tableExists(conn, 'users'))) return;

  if (!(await columnExists(conn, 'users', 'email_verified_at'))) {
    await conn.query('ALTER TABLE users ADD COLUMN email_verified_at DATETIME DEFAULT NULL');
    console.log('Added users.email_verified_at');
  }
  if (!(await columnExists(conn, 'users', 'email_verification_token'))) {
    await conn.query('ALTER TABLE users ADD COLUMN email_verification_token VARCHAR(64) DEFAULT NULL');
    console.log('Added users.email_verification_token');
  }
  if (!(await columnExists(conn, 'users', 'email_verification_expires'))) {
    await conn.query('ALTER TABLE users ADD COLUMN email_verification_expires DATETIME DEFAULT NULL');
    console.log('Added users.email_verification_expires');
  }
  if (!(await columnExists(conn, 'users', 'password_reset_token'))) {
    await conn.query('ALTER TABLE users ADD COLUMN password_reset_token VARCHAR(64) DEFAULT NULL');
    console.log('Added users.password_reset_token');
  }
  if (!(await columnExists(conn, 'users', 'password_reset_expires'))) {
    await conn.query('ALTER TABLE users ADD COLUMN password_reset_expires DATETIME DEFAULT NULL');
    console.log('Added users.password_reset_expires');
  }

  await conn.query(
    `UPDATE users SET email_verified_at = COALESCE(email_verified_at, created_at)
     WHERE email_verified_at IS NULL`
  );
}

async function applyAdminPasswordOtpV35(conn) {
  if (!(await tableExists(conn, 'system_admins'))) return;

  if (!(await columnExists(conn, 'system_admins', 'password_reset_otp_hash'))) {
    await conn.query('ALTER TABLE system_admins ADD COLUMN password_reset_otp_hash VARCHAR(255) DEFAULT NULL');
    console.log('Added system_admins.password_reset_otp_hash');
  }
  if (!(await columnExists(conn, 'system_admins', 'password_reset_otp_expires'))) {
    await conn.query('ALTER TABLE system_admins ADD COLUMN password_reset_otp_expires DATETIME DEFAULT NULL');
    console.log('Added system_admins.password_reset_otp_expires');
  }
  if (!(await columnExists(conn, 'system_admins', 'password_reset_token'))) {
    await conn.query('ALTER TABLE system_admins ADD COLUMN password_reset_token VARCHAR(64) DEFAULT NULL');
    console.log('Added system_admins.password_reset_token');
  }
  if (!(await columnExists(conn, 'system_admins', 'password_reset_expires'))) {
    await conn.query('ALTER TABLE system_admins ADD COLUMN password_reset_expires DATETIME DEFAULT NULL');
    console.log('Added system_admins.password_reset_expires');
  }
}

async function applyProfileOtpV36(conn) {
  for (const table of ['users', 'system_admins']) {
    if (!(await tableExists(conn, table))) continue;

    if (!(await columnExists(conn, table, 'password_reset_otp_hash'))) {
      await conn.query(`ALTER TABLE ${table} ADD COLUMN password_reset_otp_hash VARCHAR(255) DEFAULT NULL`);
      console.log(`Added ${table}.password_reset_otp_hash`);
    }
    if (!(await columnExists(conn, table, 'password_reset_otp_expires'))) {
      await conn.query(`ALTER TABLE ${table} ADD COLUMN password_reset_otp_expires DATETIME DEFAULT NULL`);
      console.log(`Added ${table}.password_reset_otp_expires`);
    }
    if (!(await columnExists(conn, table, 'profile_otp_hash'))) {
      await conn.query(`ALTER TABLE ${table} ADD COLUMN profile_otp_hash VARCHAR(255) DEFAULT NULL`);
      console.log(`Added ${table}.profile_otp_hash`);
    }
    if (!(await columnExists(conn, table, 'profile_otp_expires'))) {
      await conn.query(`ALTER TABLE ${table} ADD COLUMN profile_otp_expires DATETIME DEFAULT NULL`);
      console.log(`Added ${table}.profile_otp_expires`);
    }
    if (!(await columnExists(conn, table, 'profile_action_token'))) {
      await conn.query(`ALTER TABLE ${table} ADD COLUMN profile_action_token VARCHAR(64) DEFAULT NULL`);
      console.log(`Added ${table}.profile_action_token`);
    }
    if (!(await columnExists(conn, table, 'profile_action_expires'))) {
      await conn.query(`ALTER TABLE ${table} ADD COLUMN profile_action_expires DATETIME DEFAULT NULL`);
      console.log(`Added ${table}.profile_action_expires`);
    }
  }
}

async function applyEmailChangeOtpV37(conn) {
  for (const table of ['users', 'system_admins']) {
    if (!(await tableExists(conn, table))) continue;

    if (!(await columnExists(conn, table, 'profile_pending_email'))) {
      await conn.query(`ALTER TABLE ${table} ADD COLUMN profile_pending_email VARCHAR(191) DEFAULT NULL`);
      console.log(`Added ${table}.profile_pending_email`);
    }
    if (!(await columnExists(conn, table, 'profile_new_email_otp_hash'))) {
      await conn.query(`ALTER TABLE ${table} ADD COLUMN profile_new_email_otp_hash VARCHAR(255) DEFAULT NULL`);
      console.log(`Added ${table}.profile_new_email_otp_hash`);
    }
    if (!(await columnExists(conn, table, 'profile_new_email_otp_expires'))) {
      await conn.query(`ALTER TABLE ${table} ADD COLUMN profile_new_email_otp_expires DATETIME DEFAULT NULL`);
      console.log(`Added ${table}.profile_new_email_otp_expires`);
    }
  }
}

async function applyReceivePerfIndexesV38(conn) {
  if (!(await indexExists(conn, 'member_ledger_entries', 'idx_ledger_app_type'))) {
    await conn.query(
      'ALTER TABLE member_ledger_entries ADD INDEX idx_ledger_app_type (ipo_application_id, type)'
    );
    console.log('Added idx_ledger_app_type on member_ledger_entries');
  }
  if (!(await indexExists(conn, 'wallet_transactions', 'idx_wallet_ref'))) {
    await conn.query(
      'ALTER TABLE wallet_transactions ADD INDEX idx_wallet_ref (tenant_id, ref_type, ref_id, type)'
    );
    console.log('Added idx_wallet_ref on wallet_transactions');
  }
}

async function applyMemberPortalExtensionsV39(conn) {
  if (!(await tableExists(conn, 'member_fund_return_claims'))) {
    const sql = fs.readFileSync(
      path.join(__dirname, 'schema-member-portal-extensions.sql'),
      'utf8'
    );
    await conn.query(sql);
    console.log('Created member_fund_return_claims');
  }

  if (await tableExists(conn, 'member_issues')) {
    if (!(await columnExists(conn, 'member_issues', 'category'))) {
      await conn.query(
        `ALTER TABLE member_issues
         ADD COLUMN category ENUM('PAYMENT', 'PROFIT', 'ALLOTMENT', 'FUND_RETURN', 'OTHER')
         NOT NULL DEFAULT 'OTHER' AFTER note`
      );
      console.log('Added member_issues.category');
    }
  }
}

async function applyEmailVerificationOtpV40(conn) {
  if (!(await tableExists(conn, 'users'))) return;
  if (!(await columnExists(conn, 'users', 'email_verification_token'))) return;

  await conn.query(
    'ALTER TABLE users MODIFY COLUMN email_verification_token VARCHAR(255) DEFAULT NULL'
  );
  console.log('Widened users.email_verification_token for OTP hashes');
}

async function applyProviderProfitAccrualV41(conn) {
  if (!(await tableExists(conn, 'provider_transactions'))) return;

  const [result] = await conn.query(
    `UPDATE provider_transactions
     SET amount = 0
     WHERE account_label IN ('P&L Share', 'P&L Share (Loss)')
       AND COALESCE(provider_profit, 0) != 0
       AND amount != 0`
  );
  if (result.affectedRows > 0) {
    console.log(`Moved ${result.affectedRows} IPO P&L share row(s) to accrual-only (amount=0)`);
  }
}

/** Accrual-only payouts (no wallet link) must not reduce principal. */
async function applyProviderAccrualPrincipalFixV42(conn) {
  if (!(await tableExists(conn, 'provider_transactions'))) return;
  if (!(await tableExists(conn, 'wallet_transactions'))) return;

  const [result] = await conn.query(
    `UPDATE provider_transactions pt
     LEFT JOIN wallet_transactions wt
       ON wt.ref_type = 'provider_transaction' AND wt.ref_id = pt.id AND wt.tenant_id = pt.tenant_id
     SET pt.amount = 0
     WHERE pt.amount != 0
       AND pt.provider_profit IS NOT NULL
       AND pt.provider_profit != 0
       AND COALESCE(pt.account_label, '') != 'Profit Reinvested'
       AND wt.id IS NULL`
  );
  if (result.affectedRows > 0) {
    console.log(`Fixed ${result.affectedRows} accrual payout(s) that wrongly hit principal`);
  }
}

async function applyWithdrawalMoneyV43(conn) {
  if (!(await tableExists(conn, 'ipo_applications'))) return;
  if (await columnExists(conn, 'ipo_applications', 'withdrawal_money')) return;

  await conn.query(
    `ALTER TABLE ipo_applications
     ADD COLUMN withdrawal_money DECIMAL(15, 2) DEFAULT NULL AFTER profit_loss`
  );
  console.log('Added ipo_applications.withdrawal_money');
}

async function applyClearOrphanProfitLossV44(conn) {
  if (!(await tableExists(conn, 'ipo_applications'))) return;
  if (!(await columnExists(conn, 'ipo_applications', 'withdrawal_money'))) return;

  const [result] = await conn.query(
    `UPDATE ipo_applications
     SET withdrawal_money = amount + profit_loss
     WHERE withdrawal_money IS NULL AND profit_loss IS NOT NULL`
  );
  if (result.affectedRows > 0) {
    console.log(`Backfilled withdrawal_money for ${result.affectedRows} application(s) from profit_loss`);
  }
}

async function applyRecoverProfitFromDistributionsV45(conn) {
  if (!(await tableExists(conn, 'ipo_applications'))) return;
  if (!(await tableExists(conn, 'profit_share_distributions'))) return;
  if (!(await columnExists(conn, 'ipo_applications', 'withdrawal_money'))) return;

  const [result] = await conn.query(
    `UPDATE ipo_applications a
     JOIN profit_share_distributions psd ON psd.ipo_application_id = a.id
     SET a.profit_loss = psd.gross_profit_loss,
         a.withdrawal_money = a.amount + psd.gross_profit_loss
     WHERE a.withdrawal_money IS NULL
       AND (a.profit_loss IS NULL OR ABS(a.profit_loss - psd.gross_profit_loss) < 0.01)`
  );
  if (result.affectedRows > 0) {
    console.log(`Recovered profit + withdrawal for ${result.affectedRows} application(s) from P&L distributions`);
  }
}

async function applyIpoInvalidFlagV46(conn) {
  if (!(await tableExists(conn, 'ipos'))) return;
  if (await columnExists(conn, 'ipos', 'is_invalid')) return;

  await conn.query(
    `ALTER TABLE ipos
     ADD COLUMN is_invalid TINYINT(1) NOT NULL DEFAULT 0 AFTER status,
     ADD COLUMN invalidated_at DATETIME DEFAULT NULL AFTER is_invalid,
     ADD INDEX idx_ipos_tenant_invalid (tenant_id, is_invalid)`
  );
  console.log('Added ipos.is_invalid for soft-hiding duplicate/invalid IPOs');
}

async function applyGroupExternalOwnerV51(conn) {
  if (!(await tableExists(conn, 'member_groups'))) return;

  if (!(await columnExists(conn, 'member_groups', 'owner_external_name'))) {
    await conn.query(
      `ALTER TABLE member_groups
       ADD COLUMN owner_external_name VARCHAR(120) DEFAULT NULL AFTER owner_member_id,
       ADD COLUMN owner_external_pan VARCHAR(10) DEFAULT NULL AFTER owner_external_name`
    );
    console.log('Added member_groups.owner_external_name / owner_external_pan');
  }

  if (await tableExists(conn, 'member_group_bulk_payments')) {
    if (!(await columnExists(conn, 'member_group_bulk_payments', 'owner_external_name'))) {
      await conn.query(
        `ALTER TABLE member_group_bulk_payments
         ADD COLUMN owner_external_name VARCHAR(120) DEFAULT NULL AFTER owner_member_id`
      );
      console.log('Added member_group_bulk_payments.owner_external_name');
    }
    const [bpCol] = await conn.query(
      `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_group_bulk_payments'
         AND COLUMN_NAME = 'owner_member_id'`
    );
    if (bpCol[0]?.IS_NULLABLE === 'NO') {
      await conn.query(
        'ALTER TABLE member_group_bulk_payments MODIFY owner_member_id INT DEFAULT NULL'
      );
      console.log('Made member_group_bulk_payments.owner_member_id nullable');
    }
  }

  if (await tableExists(conn, 'ipo_applications')) {
    if (!(await columnExists(conn, 'ipo_applications', 'paid_to_external_name'))) {
      await conn.query(
        `ALTER TABLE ipo_applications
         ADD COLUMN paid_to_external_name VARCHAR(120) DEFAULT NULL AFTER paid_to_member_id`
      );
      console.log('Added ipo_applications.paid_to_external_name');
    }
  }
}

async function applyIpoLastApplyDateV50(conn) {
  if (!(await tableExists(conn, 'ipos'))) return;
  if (!(await columnExists(conn, 'ipos', 'last_apply_date'))) {
    await conn.query(
      `ALTER TABLE ipos
       ADD COLUMN last_apply_date DATE DEFAULT NULL AFTER open_date`
    );
    console.log('Added ipos.last_apply_date');
  }
  // Backfill open_date from created_at so month/year filters work for older IPOs
  const [result] = await conn.query(
    `UPDATE ipos
     SET open_date = DATE(created_at)
     WHERE open_date IS NULL AND created_at IS NOT NULL`
  );
  if (result.affectedRows > 0) {
    console.log(`Backfilled open_date for ${result.affectedRows} IPO(s) from created_at`);
  }
}

async function applyPersonalWithdrawV47(conn) {
  if (!(await tableExists(conn, 'wallet_transactions'))) return;
  const [col] = await conn.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wallet_transactions' AND COLUMN_NAME = 'type'`
  );
  const columnType = col[0]?.COLUMN_TYPE || '';
  if (columnType.includes('PERSONAL_OUT')) return;

  await conn.query(
    `ALTER TABLE wallet_transactions
     MODIFY COLUMN type ENUM(
       'PROVIDER_IN', 'DISTRIBUTE_OUT', 'RETURN_IN', 'ADJUSTMENT', 'PROVIDER_OUT',
       'TRANSFER_OUT', 'TRANSFER_IN', 'PERSONAL_OUT'
     ) NOT NULL`
  );
  console.log('Added PERSONAL_OUT to wallet_transactions.type');
}

/**
 * Early HNI rollout defaulted allowed_categories to ["RII","HNI"] and copied
 * lot_amount into lot_amount_hni. Strip unused HNI so RII-only IPOs don't show
 * a duplicate HNI lot. Keep HNI when there are HNI applications or a distinct lot.
 */
async function applyMemberShareRuleActiveV49(conn) {
  if (!(await tableExists(conn, 'member_profit_shares'))) return;
  if (!(await columnExists(conn, 'member_profit_shares', 'is_active'))) {
    await conn.query(
      `ALTER TABLE member_profit_shares
       ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER loss_manager_percent`
    );
    console.log('Added member_profit_shares.is_active');
  }

  await conn.query(
    `UPDATE member_profit_shares mps
     INNER JOIN (
       SELECT member_id, tenant_id, ipo_id, MAX(id) AS keep_id
       FROM member_profit_shares
       GROUP BY member_id, tenant_id, ipo_id
     ) latest
       ON latest.member_id = mps.member_id
      AND latest.tenant_id = mps.tenant_id
      AND latest.ipo_id <=> mps.ipo_id
     SET mps.is_active = IF(mps.id = latest.keep_id, 1, 0)`
  );
  console.log('Ensured one active member share rule per IPO scope');
}

async function applyStripUnusedDefaultHniV48(conn) {
  if (!(await tableExists(conn, 'ipos'))) return;

  const [rows] = await conn.query(
    `SELECT i.id, i.allowed_categories, i.lot_amount_rii, i.lot_amount_hni, i.lot_amount
     FROM ipos i
     WHERE NOT EXISTS (
       SELECT 1 FROM ipo_applications a
       WHERE a.ipo_id = i.id AND a.investor_category = 'HNI'
     )`
  );

  let updated = 0;
  for (const row of rows) {
    let cats = row.allowed_categories;
    if (typeof cats === 'string') {
      try {
        cats = JSON.parse(cats);
      } catch {
        continue;
      }
    }
    if (!Array.isArray(cats)) continue;
    const upper = cats.map((c) => String(c).toUpperCase());
    if (!upper.includes('HNI')) continue;

    const rii = Number(row.lot_amount_rii ?? row.lot_amount);
    const hni = row.lot_amount_hni != null ? Number(row.lot_amount_hni) : null;
    const hniLooksDefault = hni == null || (!Number.isNaN(rii) && hni === rii);
    if (!hniLooksDefault) continue;

    await conn.query(
      `UPDATE ipos SET allowed_categories = ?, lot_amount_hni = NULL WHERE id = ?`,
      [JSON.stringify(['RII']), row.id]
    );
    updated += 1;
  }

  if (updated) {
    console.log(`Stripped unused default HNI from ${updated} IPO(s)`);
  }
}

async function applyWalletPurposeSplitV52(conn) {
  if (!(await tableExists(conn, 'manager_bank_accounts'))) return;

  if (!(await columnExists(conn, 'manager_bank_accounts', 'purpose'))) {
    await conn.query(
      `ALTER TABLE manager_bank_accounts
       ADD COLUMN purpose ENUM('PROVIDER', 'MANAGER') NOT NULL DEFAULT 'PROVIDER'
       AFTER is_active`
    );
    console.log('Added manager_bank_accounts.purpose');
  }

  if (await tableExists(conn, 'wallet_transactions')) {
    const [col] = await conn.query(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wallet_transactions' AND COLUMN_NAME = 'type'`
    );
    const columnType = col[0]?.COLUMN_TYPE || '';
    if (!columnType.includes('MANAGER_PROFIT_IN')) {
      await conn.query(
        `ALTER TABLE wallet_transactions
         MODIFY COLUMN type ENUM(
           'PROVIDER_IN', 'DISTRIBUTE_OUT', 'RETURN_IN', 'ADJUSTMENT', 'PROVIDER_OUT',
           'TRANSFER_OUT', 'TRANSFER_IN', 'PERSONAL_OUT', 'MANAGER_PROFIT_IN'
         ) NOT NULL`
      );
      console.log('Added MANAGER_PROFIT_IN to wallet_transactions.type');
    }
  }

  // Ensure every tenant with any bank account also has a Manager Profit account
  const [tenants] = await conn.query(
    `SELECT DISTINCT tenant_id FROM manager_bank_accounts`
  );
  for (const { tenant_id: tenantId } of tenants) {
    const [mgr] = await conn.query(
      `SELECT id FROM manager_bank_accounts
       WHERE tenant_id = ? AND purpose = 'MANAGER' LIMIT 1`,
      [tenantId]
    );
    if (!mgr.length) {
      await conn.query(
        `INSERT INTO manager_bank_accounts
         (tenant_id, label, bank_name, is_default, is_active, purpose, balance, sort_order)
         VALUES (?, 'Manager Profit', NULL, 0, 1, 'MANAGER', 0, 100)`,
        [tenantId]
      );
      console.log(`Created Manager Profit account for tenant ${tenantId}`);
    }
  }

  // Peel manager profit cash out of PROVIDER accounts into MANAGER accounts.
  // Never touch undeployed principal: only move excess above (principal − funds still with members).
  // Also subtract prior profit_share_reversal adjustments (those amounts already left the wallet).
  for (const { tenant_id: tenantId } of tenants) {
    // Idempotent: skip tenants already split (V53 repairs over-peel separately)
    const [[priorSplit]] = await conn.query(
      `SELECT id FROM wallet_transactions
       WHERE tenant_id = ? AND ref_type = 'wallet_split' LIMIT 1`,
      [tenantId]
    );
    if (priorSplit) continue;

    const [[mgrShare]] = await conn.query(
      `SELECT COALESCE(SUM(manager_amount), 0) AS total
       FROM profit_share_distributions WHERE tenant_id = ?`,
      [tenantId]
    );
    const [[withdrawn]] = await conn.query(
      `SELECT COALESCE(SUM(-amount), 0) AS total
       FROM wallet_transactions WHERE tenant_id = ? AND type = 'PERSONAL_OUT'`,
      [tenantId]
    );
    const [[reversed]] = await conn.query(
      `SELECT COALESCE(SUM(-amount), 0) AS total
       FROM wallet_transactions
       WHERE tenant_id = ? AND type = 'ADJUSTMENT' AND ref_type = 'profit_share_reversal'`,
      [tenantId]
    );
    const owed = Math.round(
      (Number(mgrShare.total) - Number(withdrawn.total) - Number(reversed.total)) * 100
    ) / 100;
    if (owed <= 0.001) continue;

    const [[mgrAcc]] = await conn.query(
      `SELECT id, balance FROM manager_bank_accounts
       WHERE tenant_id = ? AND purpose = 'MANAGER' AND is_active = 1
       ORDER BY id LIMIT 1`,
      [tenantId]
    );
    if (!mgrAcc) continue;

    const alreadyInManager = Number(mgrAcc.balance);
    let need = Math.round((owed - alreadyInManager) * 100) / 100;
    if (need <= 0.001) continue;

    const [[prin]] = await conn.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM provider_transactions WHERE tenant_id = ?`,
      [tenantId]
    );
    const [[stillOut]] = await conn.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM ipo_applications
       WHERE tenant_id = ? AND (trns_received IS NULL OR trns_received <> 'Received')`,
      [tenantId]
    );
    const [[provSum]] = await conn.query(
      `SELECT COALESCE(SUM(balance), 0) AS total FROM manager_bank_accounts
       WHERE tenant_id = ? AND purpose = 'PROVIDER' AND is_active = 1`,
      [tenantId]
    );
    const undeployedPrincipal = Math.round(
      (Number(prin.total) - Number(stillOut.total)) * 100
    ) / 100;
    const excessOverPrincipal = Math.max(
      0,
      Math.round((Number(provSum.total) - undeployedPrincipal) * 100) / 100
    );
    need = Math.min(need, excessOverPrincipal);
    if (need <= 0.001) {
      console.log(
        `Tenant ${tenantId}: skip manager peel — no excess over undeployed principal ₹${undeployedPrincipal}`
      );
      continue;
    }

    const [providerAccs] = await conn.query(
      `SELECT id, label, balance FROM manager_bank_accounts
       WHERE tenant_id = ? AND purpose = 'PROVIDER' AND is_active = 1 AND balance > 0
       ORDER BY is_default DESC, id`,
      [tenantId]
    );

    let remaining = need;
    const now = new Date();
    for (const acc of providerAccs) {
      if (remaining <= 0.001) break;
      // Keep enough in this account so overall provider side stays ≥ undeployed principal
      const take = Math.min(Number(acc.balance), remaining);
      if (take <= 0.001) continue;

      const newProvBal = Math.round((Number(acc.balance) - take) * 100) / 100;
      const [mgrBalRows] = await conn.query(
        `SELECT balance FROM manager_bank_accounts WHERE id = ? FOR UPDATE`,
        [mgrAcc.id]
      );
      const newMgrBal = Math.round((Number(mgrBalRows[0].balance) + take) * 100) / 100;

      await conn.query(`UPDATE manager_bank_accounts SET balance = ? WHERE id = ?`, [
        newProvBal,
        acc.id,
      ]);
      await conn.query(`UPDATE manager_bank_accounts SET balance = ? WHERE id = ?`, [
        newMgrBal,
        mgrAcc.id,
      ]);

      await conn.query(
        `INSERT INTO wallet_transactions
         (tenant_id, bank_account_id, type, amount, balance_after, ref_type, ref_id, txn_date, notes, created_by)
         VALUES (?, ?, 'TRANSFER_OUT', ?, ?, 'wallet_split', NULL, ?, ?, NULL)`,
        [
          tenantId,
          acc.id,
          -take,
          newProvBal,
          now,
          `Split manager profit → Manager Profit (from ${acc.label})`,
        ]
      );
      await conn.query(
        `INSERT INTO wallet_transactions
         (tenant_id, bank_account_id, type, amount, balance_after, ref_type, ref_id, txn_date, notes, created_by)
         VALUES (?, ?, 'TRANSFER_IN', ?, ?, 'wallet_split', NULL, ?, ?, NULL)`,
        [
          tenantId,
          mgrAcc.id,
          take,
          newMgrBal,
          now,
          `Split manager profit ← ${acc.label}`,
        ]
      );

      remaining = Math.round((remaining - take) * 100) / 100;
      console.log(
        `Tenant ${tenantId}: moved ₹${take} manager profit from ${acc.label} → Manager Profit`
      );
    }

    if (remaining > 0.01) {
      console.log(
        `Tenant ${tenantId}: could only move part of owed manager profit; shortfall ₹${remaining}`
      );
    }

    const [[sum]] = await conn.query(
      `SELECT COALESCE(SUM(balance), 0) AS total FROM manager_bank_accounts
       WHERE tenant_id = ? AND is_active = 1`,
      [tenantId]
    );
    await conn.query(`UPDATE owner_wallets SET balance = ? WHERE tenant_id = ?`, [
      Number(sum.total),
      tenantId,
    ]);
  }
}

/**
 * V52 initially peeled SUM(manager_amount) − personal withdrawals without:
 *  - subtracting profit_share_reversal amounts already removed from the wallet
 *  - protecting undeployed principal (principal − funds still with members)
 * That pulled principal cash into the Manager Profit wallet. Move the shortfall back.
 */
async function applyWalletSplitOverpeelRepairV53(conn) {
  if (!(await tableExists(conn, 'manager_bank_accounts'))) return;
  if (!(await columnExists(conn, 'manager_bank_accounts', 'purpose'))) return;

  const [tenants] = await conn.query(`SELECT DISTINCT tenant_id FROM manager_bank_accounts`);
  for (const { tenant_id: tenantId } of tenants) {
    const [[already]] = await conn.query(
      `SELECT id FROM wallet_transactions
       WHERE tenant_id = ? AND ref_type = 'wallet_split_repair' LIMIT 1`,
      [tenantId]
    );
    if (already) continue;

    const [[prin]] = await conn.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM provider_transactions WHERE tenant_id = ?`,
      [tenantId]
    );
    const [[stillOut]] = await conn.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM ipo_applications
       WHERE tenant_id = ? AND (trns_received IS NULL OR trns_received <> 'Received')`,
      [tenantId]
    );
    const [[provSum]] = await conn.query(
      `SELECT COALESCE(SUM(balance), 0) AS total FROM manager_bank_accounts
       WHERE tenant_id = ? AND purpose = 'PROVIDER' AND is_active = 1`,
      [tenantId]
    );
    const [[mgrSum]] = await conn.query(
      `SELECT COALESCE(SUM(balance), 0) AS total FROM manager_bank_accounts
       WHERE tenant_id = ? AND purpose = 'MANAGER' AND is_active = 1`,
      [tenantId]
    );

    const undeployedPrincipal = Math.round(
      (Number(prin.total) - Number(stillOut.total)) * 100
    ) / 100;
    const shortfall = Math.round((undeployedPrincipal - Number(provSum.total)) * 100) / 100;
    if (shortfall <= 0.01) continue;

    const repair = Math.min(shortfall, Number(mgrSum.total));
    if (repair <= 0.01) {
      console.log(
        `Tenant ${tenantId}: provider short ₹${shortfall} vs undeployed principal, but manager wallet empty`
      );
      continue;
    }

    const [[mgrAcc]] = await conn.query(
      `SELECT id, label, balance FROM manager_bank_accounts
       WHERE tenant_id = ? AND purpose = 'MANAGER' AND is_active = 1 AND balance > 0
       ORDER BY id LIMIT 1`,
      [tenantId]
    );
    const [[provAcc]] = await conn.query(
      `SELECT id, label, balance FROM manager_bank_accounts
       WHERE tenant_id = ? AND purpose = 'PROVIDER' AND is_active = 1
       ORDER BY is_default DESC, id LIMIT 1`,
      [tenantId]
    );
    if (!mgrAcc || !provAcc) continue;

    const take = Math.min(repair, Number(mgrAcc.balance));
    const newMgrBal = Math.round((Number(mgrAcc.balance) - take) * 100) / 100;
    const newProvBal = Math.round((Number(provAcc.balance) + take) * 100) / 100;
    const now = new Date();

    await conn.query(`UPDATE manager_bank_accounts SET balance = ? WHERE id = ?`, [
      newMgrBal,
      mgrAcc.id,
    ]);
    await conn.query(`UPDATE manager_bank_accounts SET balance = ? WHERE id = ?`, [
      newProvBal,
      provAcc.id,
    ]);

    await conn.query(
      `INSERT INTO wallet_transactions
       (tenant_id, bank_account_id, type, amount, balance_after, ref_type, ref_id, txn_date, notes, created_by)
       VALUES (?, ?, 'TRANSFER_OUT', ?, ?, 'wallet_split_repair', NULL, ?, ?, NULL)`,
      [
        tenantId,
        mgrAcc.id,
        -take,
        newMgrBal,
        now,
        `Repair over-split — return principal to provider (from ${mgrAcc.label})`,
      ]
    );
    await conn.query(
      `INSERT INTO wallet_transactions
       (tenant_id, bank_account_id, type, amount, balance_after, ref_type, ref_id, txn_date, notes, created_by)
       VALUES (?, ?, 'TRANSFER_IN', ?, ?, 'wallet_split_repair', NULL, ?, ?, NULL)`,
      [
        tenantId,
        provAcc.id,
        take,
        newProvBal,
        now,
        `Repair over-split — restore undeployed principal ← ${mgrAcc.label}`,
      ]
    );

    const [[sum]] = await conn.query(
      `SELECT COALESCE(SUM(balance), 0) AS total FROM manager_bank_accounts
       WHERE tenant_id = ? AND is_active = 1`,
      [tenantId]
    );
    await conn.query(`UPDATE owner_wallets SET balance = ? WHERE tenant_id = ?`, [
      Number(sum.total),
      tenantId,
    ]);

    console.log(
      `Tenant ${tenantId}: repaired ₹${take} principal back to provider ` +
        `(undeployed ₹${undeployedPrincipal}; ${provAcc.label} now ₹${newProvBal})`
    );
  }
}

async function applyFundAdjustV54(conn) {
  if (!(await tableExists(conn, 'ipo_applications'))) return;

  if (!(await columnExists(conn, 'ipo_applications', 'adjusted_out_amount'))) {
    await conn.query(
      `ALTER TABLE ipo_applications
       ADD COLUMN adjusted_out_amount DECIMAL(15, 2) NOT NULL DEFAULT 0 AFTER amount`
    );
    console.log('Added ipo_applications.adjusted_out_amount');
  }

  if (!(await columnExists(conn, 'ipo_applications', 'adjusted_from_application_id'))) {
    await conn.query(
      `ALTER TABLE ipo_applications
       ADD COLUMN adjusted_from_application_id INT DEFAULT NULL AFTER adjusted_out_amount`
    );
    console.log('Added ipo_applications.adjusted_from_application_id');
  }

  const [fkRows] = await conn.query(
    `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'ipo_applications'
       AND COLUMN_NAME = 'adjusted_from_application_id'
       AND REFERENCED_TABLE_NAME = 'ipo_applications'`
  );
  if (!fkRows.length && (await columnExists(conn, 'ipo_applications', 'adjusted_from_application_id'))) {
    await conn.query(
      `ALTER TABLE ipo_applications
       ADD CONSTRAINT fk_apps_adjusted_from
         FOREIGN KEY (adjusted_from_application_id) REFERENCES ipo_applications(id) ON DELETE SET NULL`
    );
    console.log('Added fk_apps_adjusted_from');
  }

  if (await tableExists(conn, 'member_ledger_entries')) {
    const [col] = await conn.query(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_ledger_entries' AND COLUMN_NAME = 'type'`
    );
    if (col[0] && !String(col[0].COLUMN_TYPE).includes('ADJUSTED_OUT')) {
      await conn.query(
        `ALTER TABLE member_ledger_entries
         MODIFY type ENUM('GIVEN', 'RECEIVED', 'BONUS', 'ADJUSTED_OUT') NOT NULL`
      );
      console.log('Added ADJUSTED_OUT to member_ledger_entries.type');
    }
  }

  if (!(await tableExists(conn, 'ipo_fund_adjustments'))) {
    await conn.query(
      `CREATE TABLE IF NOT EXISTS ipo_fund_adjustments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        from_application_id INT NOT NULL,
        to_application_id INT NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        created_by INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (from_application_id) REFERENCES ipo_applications(id) ON DELETE CASCADE,
        FOREIGN KEY (to_application_id) REFERENCES ipo_applications(id) ON DELETE CASCADE,
        UNIQUE KEY uk_adjust_to_app (to_application_id),
        INDEX idx_adjust_from (from_application_id),
        INDEX idx_adjust_tenant (tenant_id)
      )`
    );
    console.log('Created ipo_fund_adjustments');
  }
}

async function applyGroupLeaderWalletsV55(conn) {
  if (!(await tableExists(conn, 'group_leader_transactions'))) {
    const sql = fs.readFileSync(path.join(__dirname, 'schema-group-leader-wallets.sql'), 'utf8');
    await conn.query(sql);
    console.log('Created group_leader_transactions');
  }
}

async function migrate() {
  const conn = await mysql.createConnection(getDbConnectionOptions());

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await conn.query(schema);
  const profitShares = fs.readFileSync(path.join(__dirname, 'schema-profit-shares.sql'), 'utf8');
  await conn.query(profitShares);
  await applyProfitSharesV2(conn);
  await applyProviderShareRulesV3(conn);
  await applyMemberMultiRulesV4(conn);
  await applyBankAccountsV5(conn);
  await applyBankTransfersV6(conn);
  await applyMemberIssuesV7(conn);
  await applyMemberGroupsV8(conn);
  await applyIssueResolutionNotesV9(conn);
  await applyAuditLogV10(conn);
  await applyIpoRegistrarV11(conn);
  await applyMemberShareIpoV12(conn);
  await applyMemberContactV13(conn);
  await applyIpoCategoriesV14(conn);
  await applyRemoveCmrV15(conn);
  await applyIpoLotByCategoryV16(conn);
  await applyOptionalHniV17(conn);
  await applyGroupOwnerV18(conn);
  await applyProviderRuleNameV19(conn);
  await applyRuleTemplatesV20(conn);
  await applyBulkMemberGivenLedgerV21(conn);
  await applyFixBulkOwnerLedgerV22(conn);
  await applyGroupBulkPaymentsV23(conn);
  await applyFixGroupBulkMemberCountV24(conn);
  await applySystemAdminV25(conn);
  await applyTenantDisabledV26(conn);
  await applyJsonCompatV27(conn);
  await applyTimestampCompatV28(conn);
  await applyEmailIndexCompatV29(conn);
  await applyNotAppliedV30(conn);
  await applyUppercasePanV31(conn);
  await applyBankAccountDefaultV32(conn);
  await applyOrphanedProfitShareCleanupV33(conn);
  await applyEmailAuthV34(conn);
  await applyAdminPasswordOtpV35(conn);
  await applyProfileOtpV36(conn);
  await applyEmailChangeOtpV37(conn);
  await applyReceivePerfIndexesV38(conn);
  await applyMemberPortalExtensionsV39(conn);
  await applyEmailVerificationOtpV40(conn);
  await applyProviderProfitAccrualV41(conn);
  await applyProviderAccrualPrincipalFixV42(conn);
  await applyWithdrawalMoneyV43(conn);
  await applyClearOrphanProfitLossV44(conn);
  await applyRecoverProfitFromDistributionsV45(conn);
  await applyIpoInvalidFlagV46(conn);
  await applyPersonalWithdrawV47(conn);
  await applyStripUnusedDefaultHniV48(conn);
  await applyMemberShareRuleActiveV49(conn);
  await applyIpoLastApplyDateV50(conn);
  await applyGroupExternalOwnerV51(conn);
  await applyWalletPurposeSplitV52(conn);
  await applyWalletSplitOverpeelRepairV53(conn);
  await applyFundAdjustV54(conn);
  await applyGroupLeaderWalletsV55(conn);
  console.log('Migration completed successfully.');
  await conn.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
