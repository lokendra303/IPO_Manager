-- Fund adjust: roll unsettled not-allotted principal into a cheaper/equal new IPO

ALTER TABLE ipo_applications
  ADD COLUMN adjusted_out_amount DECIMAL(15, 2) NOT NULL DEFAULT 0 AFTER amount,
  ADD COLUMN adjusted_from_application_id INT DEFAULT NULL AFTER adjusted_out_amount;

ALTER TABLE ipo_applications
  ADD CONSTRAINT fk_apps_adjusted_from
    FOREIGN KEY (adjusted_from_application_id) REFERENCES ipo_applications(id) ON DELETE SET NULL;

ALTER TABLE member_ledger_entries
  MODIFY type ENUM('GIVEN', 'RECEIVED', 'BONUS', 'ADJUSTED_OUT') NOT NULL;

CREATE TABLE IF NOT EXISTS ipo_fund_adjustments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  from_application_id INT NOT NULL,
  to_application_id INT NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (from_application_id) REFERENCES ipo_applications(id) ON DELETE CASCADE,
  FOREIGN KEY (to_application_id) REFERENCES ipo_applications(id) ON DELETE CASCADE,
  INDEX idx_adjust_from (from_application_id),
  INDEX idx_adjust_to (to_application_id),
  INDEX idx_adjust_tenant (tenant_id)
);
