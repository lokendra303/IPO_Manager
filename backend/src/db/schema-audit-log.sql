CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  actor_type ENUM('manager', 'member') NOT NULL,
  actor_id INT NOT NULL,
  actor_label VARCHAR(255) NOT NULL,
  action VARCHAR(64) NOT NULL,
  entity_type VARCHAR(64) DEFAULT NULL,
  entity_id INT DEFAULT NULL,
  summary VARCHAR(500) NOT NULL,
  metadata LONGTEXT DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_audit_tenant_time (tenant_id, created_at),
  INDEX idx_audit_tenant_action (tenant_id, action)
);
