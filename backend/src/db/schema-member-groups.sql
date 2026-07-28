CREATE TABLE IF NOT EXISTS member_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  owner_member_id INT DEFAULT NULL,
  owner_external_name VARCHAR(120) DEFAULT NULL,
  owner_external_pan VARCHAR(10) DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_member_id) REFERENCES members(id) ON DELETE SET NULL,
  UNIQUE KEY uk_tenant_group_name (tenant_id, name),
  INDEX idx_member_groups_tenant (tenant_id)
);

CREATE TABLE IF NOT EXISTS member_group_bulk_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  member_group_id INT NOT NULL,
  ipo_id INT NOT NULL,
  owner_member_id INT DEFAULT NULL,
  owner_external_name VARCHAR(120) DEFAULT NULL,
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
);
