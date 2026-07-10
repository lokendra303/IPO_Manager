CREATE TABLE IF NOT EXISTS member_fund_return_claims (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  member_id INT NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  txn_date DATETIME NOT NULL,
  payment_ref VARCHAR(255) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  status ENUM('PENDING', 'ACKNOWLEDGED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  manager_note TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  INDEX idx_fund_return_claims_member (tenant_id, member_id, status)
);
