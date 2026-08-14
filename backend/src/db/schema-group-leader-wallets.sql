-- Sub-group leader wallet: manual send/receive (IPO distributes are derived from applications)

CREATE TABLE IF NOT EXISTS group_leader_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  member_group_id INT NOT NULL,
  ipo_id INT DEFAULT NULL,
  type ENUM('SENT', 'RECEIVED', 'ADJUSTMENT') NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  txn_date DATETIME NOT NULL,
  notes TEXT DEFAULT NULL,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (member_group_id) REFERENCES member_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (ipo_id) REFERENCES ipos(id) ON DELETE SET NULL,
  INDEX idx_gl_txn_group (member_group_id, txn_date),
  INDEX idx_gl_txn_tenant (tenant_id)
);
