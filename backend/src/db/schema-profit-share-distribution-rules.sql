CREATE TABLE IF NOT EXISTS profit_share_distribution_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  distribution_id INT NOT NULL,
  member_share_rule_id INT DEFAULT NULL,
  rule_name VARCHAR(100) DEFAULT NULL,
  fund_provider_id INT DEFAULT NULL,
  provider_percent DECIMAL(5, 2) NOT NULL,
  manager_percent DECIMAL(5, 2) NOT NULL,
  provider_amount DECIMAL(15, 2) NOT NULL,
  manager_amount DECIMAL(15, 2) NOT NULL,
  FOREIGN KEY (distribution_id) REFERENCES profit_share_distributions(id) ON DELETE CASCADE,
  FOREIGN KEY (member_share_rule_id) REFERENCES member_profit_shares(id) ON DELETE SET NULL,
  FOREIGN KEY (fund_provider_id) REFERENCES fund_providers(id) ON DELETE SET NULL,
  INDEX idx_dist_rules_distribution (distribution_id)
);
