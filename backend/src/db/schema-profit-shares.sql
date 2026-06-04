-- Reusable named share rules (multiple per tenant; apply to members from Rule list)
CREATE TABLE IF NOT EXISTS profit_share_rule_templates (
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (fund_provider_id) REFERENCES fund_providers(id) ON DELETE CASCADE,
  INDEX idx_rule_templates_tenant (tenant_id, sort_order)
);

-- Per fund provider: separate profit & loss share % (legacy single template)
CREATE TABLE IF NOT EXISTS fund_provider_share_rules (
  fund_provider_id INT PRIMARY KEY,
  tenant_id INT NOT NULL,
  rule_name VARCHAR(100) DEFAULT NULL,
  profit_provider_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  profit_manager_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  loss_provider_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  loss_manager_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (fund_provider_id) REFERENCES fund_providers(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_provider_share_tenant (tenant_id)
);

-- Legacy team defaults (optional fallback)
CREATE TABLE IF NOT EXISTS profit_share_defaults (
  tenant_id INT PRIMARY KEY,
  manager_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  default_fund_provider_id INT DEFAULT NULL,
  default_provider_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  loss_provider_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  loss_manager_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (default_fund_provider_id) REFERENCES fund_providers(id) ON DELETE SET NULL
);

-- Multiple share rules per member (each: fund provider + profit/loss %)
CREATE TABLE IF NOT EXISTS member_profit_shares (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  member_id INT NOT NULL,
  ipo_id INT DEFAULT NULL,
  rule_name VARCHAR(100) DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  fund_provider_id INT DEFAULT NULL,
  provider_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  manager_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  loss_provider_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  loss_manager_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (ipo_id) REFERENCES ipos(id) ON DELETE CASCADE,
  FOREIGN KEY (fund_provider_id) REFERENCES fund_providers(id) ON DELETE SET NULL,
  INDEX idx_member_profit_shares_member (member_id, tenant_id),
  INDEX idx_member_profit_shares_ipo (member_id, ipo_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS profit_share_distributions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  ipo_application_id INT NOT NULL,
  member_id INT NOT NULL,
  fund_provider_id INT DEFAULT NULL,
  gross_profit_loss DECIMAL(15, 2) NOT NULL,
  pnl_type ENUM('PROFIT', 'LOSS') NOT NULL DEFAULT 'PROFIT',
  provider_percent DECIMAL(5, 2) NOT NULL,
  manager_percent DECIMAL(5, 2) NOT NULL,
  provider_amount DECIMAL(15, 2) NOT NULL,
  manager_amount DECIMAL(15, 2) NOT NULL,
  member_amount DECIMAL(15, 2) NOT NULL,
  distributed_at DATETIME NOT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (ipo_application_id) REFERENCES ipo_applications(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (fund_provider_id) REFERENCES fund_providers(id) ON DELETE SET NULL,
  UNIQUE KEY uk_profit_dist_app (ipo_application_id),
  INDEX idx_profit_dist_tenant (tenant_id)
);
