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
