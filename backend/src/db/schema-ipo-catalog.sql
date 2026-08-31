-- Global live-IPO catalog (shared across tenants). Tenant "My IPOs" remain in `ipos`.
CREATE TABLE IF NOT EXISTS registrars (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  website VARCHAR(512) DEFAULT NULL,
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ipo_catalog (
  id INT AUTO_INCREMENT PRIMARY KEY,
  external_id VARCHAR(191) NOT NULL,
  identity_key VARCHAR(191) NOT NULL,
  name VARCHAR(255) NOT NULL,
  company_name VARCHAR(255) DEFAULT NULL,
  symbol VARCHAR(64) DEFAULT NULL,
  ipo_type VARCHAR(64) DEFAULT NULL,
  market_type ENUM('MAINBOARD', 'SME') NOT NULL DEFAULT 'MAINBOARD',
  status ENUM('UPCOMING', 'OPEN', 'CLOSED', 'LISTED') NOT NULL DEFAULT 'UPCOMING',
  open_date DATE DEFAULT NULL,
  close_date DATE DEFAULT NULL,
  allotment_date DATE DEFAULT NULL,
  listing_date DATE DEFAULT NULL,
  price_min DECIMAL(15, 2) DEFAULT NULL,
  price_max DECIMAL(15, 2) DEFAULT NULL,
  issue_price DECIMAL(15, 2) DEFAULT NULL,
  lot_size INT DEFAULT NULL,
  issue_size VARCHAR(128) DEFAULT NULL,
  registrar_code VARCHAR(32) DEFAULT NULL,
  registrar_name VARCHAR(255) DEFAULT NULL,
  exchange VARCHAR(64) DEFAULT NULL,
  source_provider VARCHAR(64) NOT NULL,
  source_last_updated DATETIME DEFAULT NULL,
  gmp DECIMAL(15, 2) DEFAULT NULL,
  gmp_percentage DECIMAL(10, 4) DEFAULT NULL,
  estimated_listing_price DECIMAL(15, 2) DEFAULT NULL,
  gmp_updated_at DATETIME DEFAULT NULL,
  subscription_qib VARCHAR(32) DEFAULT NULL,
  subscription_nii VARCHAR(32) DEFAULT NULL,
  subscription_retail VARCHAR(32) DEFAULT NULL,
  subscription_total VARCHAR(32) DEFAULT NULL,
  subscription_updated_at DATETIME DEFAULT NULL,
  raw_payload LONGTEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  UNIQUE KEY uk_catalog_provider_external (source_provider, external_id),
  UNIQUE KEY uk_catalog_provider_identity (source_provider, identity_key),
  INDEX idx_catalog_status (status),
  INDEX idx_catalog_market (market_type),
  INDEX idx_catalog_open (open_date),
  INDEX idx_catalog_name (name)
);

CREATE TABLE IF NOT EXISTS ipo_gmp_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  catalog_id INT NOT NULL,
  gmp DECIMAL(15, 2) NOT NULL,
  gmp_percentage DECIMAL(10, 4) DEFAULT NULL,
  estimated_listing_price DECIMAL(15, 2) DEFAULT NULL,
  source VARCHAR(64) DEFAULT NULL,
  recorded_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (catalog_id) REFERENCES ipo_catalog(id) ON DELETE CASCADE,
  INDEX idx_gmp_catalog_time (catalog_id, recorded_at),
  INDEX idx_gmp_dedupe (catalog_id, gmp, recorded_at)
);

CREATE TABLE IF NOT EXISTS ipo_sync_state (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_name VARCHAR(64) NOT NULL UNIQUE,
  last_started_at DATETIME DEFAULT NULL,
  last_finished_at DATETIME DEFAULT NULL,
  last_success_at DATETIME DEFAULT NULL,
  last_error TEXT DEFAULT NULL,
  last_result LONGTEXT DEFAULT NULL,
  cooldown_until DATETIME DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS ipo_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT DEFAULT NULL,
  catalog_id INT DEFAULT NULL,
  ipo_id INT DEFAULT NULL,
  type VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT DEFAULT NULL,
  payload LONGTEXT DEFAULT NULL,
  read_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ipo_notif_type (type, created_at),
  INDEX idx_ipo_notif_tenant (tenant_id, created_at),
  INDEX idx_ipo_notif_catalog (catalog_id, type)
);
