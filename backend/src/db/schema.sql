CREATE TABLE IF NOT EXISTS system_admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) DEFAULT NULL,
  password_reset_otp_hash VARCHAR(255) DEFAULT NULL,
  password_reset_otp_expires DATETIME DEFAULT NULL,
  password_reset_token VARCHAR(64) DEFAULT NULL,
  password_reset_expires DATETIME DEFAULT NULL,
  profile_otp_hash VARCHAR(255) DEFAULT NULL,
  profile_otp_expires DATETIME DEFAULT NULL,
  profile_action_token VARCHAR(64) DEFAULT NULL,
  profile_action_expires DATETIME DEFAULT NULL,
  profile_pending_email VARCHAR(191) DEFAULT NULL,
  profile_new_email_otp_hash VARCHAR(255) DEFAULT NULL,
  profile_new_email_otp_expires DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_system_admins_password_reset_token (password_reset_token)
);

CREATE TABLE IF NOT EXISTS tenants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  status ENUM('PENDING', 'APPROVED', 'REJECTED', 'DISABLED') NOT NULL DEFAULT 'PENDING',
  approved_at TIMESTAMP NULL DEFAULT NULL,
  approved_by INT DEFAULT NULL,
  rejection_reason TEXT DEFAULT NULL,
  disabled_at TIMESTAMP NULL DEFAULT NULL,
  disabled_by INT DEFAULT NULL,
  disable_reason TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (approved_by) REFERENCES system_admins(id) ON DELETE SET NULL,
  FOREIGN KEY (disabled_by) REFERENCES system_admins(id) ON DELETE SET NULL,
  INDEX idx_tenants_status (status)
);

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('owner', 'super_admin') NOT NULL DEFAULT 'owner',
  email_verified_at DATETIME DEFAULT NULL,
  email_verification_token VARCHAR(255) DEFAULT NULL,
  email_verification_expires DATETIME DEFAULT NULL,
  password_reset_otp_hash VARCHAR(255) DEFAULT NULL,
  password_reset_otp_expires DATETIME DEFAULT NULL,
  password_reset_token VARCHAR(64) DEFAULT NULL,
  password_reset_expires DATETIME DEFAULT NULL,
  profile_otp_hash VARCHAR(255) DEFAULT NULL,
  profile_otp_expires DATETIME DEFAULT NULL,
  profile_action_token VARCHAR(64) DEFAULT NULL,
  profile_action_expires DATETIME DEFAULT NULL,
  profile_pending_email VARCHAR(191) DEFAULT NULL,
  profile_new_email_otp_hash VARCHAR(255) DEFAULT NULL,
  profile_new_email_otp_expires DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_users_email_verification_token (email_verification_token),
  INDEX idx_users_password_reset_token (password_reset_token)
);

CREATE TABLE IF NOT EXISTS members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  pan VARCHAR(10) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) DEFAULT NULL,
  upi VARCHAR(255) DEFAULT NULL,
  relationship_note VARCHAR(100) DEFAULT NULL,
  bulk_group_label VARCHAR(100) DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  fund_provider_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_members_tenant (tenant_id),
  INDEX idx_members_provider (fund_provider_id)
);

CREATE TABLE IF NOT EXISTS fund_providers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  contact_info LONGTEXT DEFAULT NULL,
  default_account_label VARCHAR(100) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_providers_tenant (tenant_id)
);

CREATE TABLE IF NOT EXISTS manager_bank_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  label VARCHAR(100) NOT NULL,
  bank_name VARCHAR(100) DEFAULT NULL,
  account_number VARCHAR(50) DEFAULT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_bank_accounts_tenant (tenant_id)
);

CREATE TABLE IF NOT EXISTS owner_wallets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL UNIQUE,
  balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS provider_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fund_provider_id INT NOT NULL,
  tenant_id INT NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  txn_date DATETIME NOT NULL,
  account_label VARCHAR(100) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  provider_profit DECIMAL(15, 2) DEFAULT NULL,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fund_provider_id) REFERENCES fund_providers(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_provider_txn_provider (fund_provider_id)
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  type ENUM('PROVIDER_IN', 'DISTRIBUTE_OUT', 'RETURN_IN', 'ADJUSTMENT', 'PROVIDER_OUT', 'TRANSFER_OUT', 'TRANSFER_IN') NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  balance_after DECIMAL(15, 2) NOT NULL,
  ref_type VARCHAR(50) DEFAULT NULL,
  ref_id INT DEFAULT NULL,
  txn_date DATETIME NOT NULL,
  notes TEXT DEFAULT NULL,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_wallet_txn_tenant (tenant_id),
  INDEX idx_wallet_ref (tenant_id, ref_type, ref_id, type)
);

CREATE TABLE IF NOT EXISTS ipos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  lot_amount_rii DECIMAL(15, 2) NOT NULL,
  lot_amount_hni DECIMAL(15, 2) DEFAULT NULL,
  lot_amount DECIMAL(15, 2) DEFAULT NULL,
  status ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  open_date DATE DEFAULT NULL,
  ipo_segment ENUM('SME', 'MAINBOARD') NOT NULL DEFAULT 'MAINBOARD',
  allowed_categories LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_ipos_tenant (tenant_id)
);

CREATE TABLE IF NOT EXISTS ipo_applications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ipo_id INT NOT NULL,
  member_id INT NOT NULL,
  tenant_id INT NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  date_received DATETIME DEFAULT NULL,
  trns_received VARCHAR(20) DEFAULT NULL,
  date_given DATETIME DEFAULT NULL,
  trns_given VARCHAR(20) DEFAULT NULL,
  allotment_status ENUM('PENDING', 'ALLOTED', 'NOT_ALLOTED', 'NOT_APPLIED') NOT NULL DEFAULT 'PENDING',
  investor_category ENUM('RII', 'HNI') NOT NULL DEFAULT 'RII',
  paid_to_member_id INT DEFAULT NULL,
  profit_loss DECIMAL(15, 2) DEFAULT NULL,
  remarks TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  FOREIGN KEY (ipo_id) REFERENCES ipos(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (paid_to_member_id) REFERENCES members(id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE KEY uk_ipo_member (ipo_id, member_id),
  INDEX idx_apps_ipo (ipo_id)
);

CREATE TABLE IF NOT EXISTS member_ledger_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  member_id INT NOT NULL,
  tenant_id INT NOT NULL,
  type ENUM('GIVEN', 'RECEIVED', 'BONUS') NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  txn_date DATETIME NOT NULL,
  ipo_application_id INT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (ipo_application_id) REFERENCES ipo_applications(id) ON DELETE SET NULL,
  INDEX idx_ledger_member (member_id),
  INDEX idx_ledger_app_type (ipo_application_id, type)
);
