import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

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
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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

  if (await tableExists(conn, 'manager_bank_accounts')) {
    await conn.query('UPDATE manager_bank_accounts SET is_default = 0');
    console.log('Cleared default flags on bank accounts');
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

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'ipo_user',
    password: process.env.DB_PASSWORD || 'ipo_password',
    database: process.env.DB_NAME || 'ipo_team',
    multipleStatements: true,
  });

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
  console.log('Migration completed successfully.');
  await conn.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
