CREATE TABLE IF NOT EXISTS bank_account_transfers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  from_bank_account_id INT NOT NULL,
  to_bank_account_id INT NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  txn_date DATETIME NOT NULL,
  notes TEXT DEFAULT NULL,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (from_bank_account_id) REFERENCES manager_bank_accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (to_bank_account_id) REFERENCES manager_bank_accounts(id) ON DELETE RESTRICT,
  INDEX idx_bank_transfers_tenant (tenant_id)
);
