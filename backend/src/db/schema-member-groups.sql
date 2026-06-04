CREATE TABLE IF NOT EXISTS member_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  owner_member_id INT DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_member_id) REFERENCES members(id) ON DELETE SET NULL,
  UNIQUE KEY uk_tenant_group_name (tenant_id, name),
  INDEX idx_member_groups_tenant (tenant_id)
);
