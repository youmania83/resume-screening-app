-- supabase/migrations/04_keka_integration_foundation.sql

-- 1. Alter existing tables to add synchronization tracking columns
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS external_id VARCHAR;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_system VARCHAR;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sync_status VARCHAR;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS external_id VARCHAR;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source_system VARCHAR;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS sync_status VARCHAR;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

ALTER TABLE interviews ADD COLUMN IF NOT EXISTS external_id VARCHAR;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS source_system VARCHAR;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS sync_status VARCHAR;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- 2. Create recruitment stages table
CREATE TABLE IF NOT EXISTS stages (
  id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  description TEXT,
  order_index INT,
  external_id VARCHAR,
  source_system VARCHAR,
  sync_status VARCHAR,
  last_synced_at TIMESTAMPTZ
);

-- 3. Create applications table (linking candidates and jobs in stages)
CREATE TABLE IF NOT EXISTS applications (
  id VARCHAR PRIMARY KEY,
  candidate_id VARCHAR REFERENCES candidates(id) ON DELETE CASCADE,
  job_id VARCHAR REFERENCES jobs(id) ON DELETE CASCADE,
  application_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR NOT NULL, -- e.g. active, hired, rejected
  stage VARCHAR NOT NULL,  -- Current recruitment stage name/ID
  source VARCHAR,          -- e.g. LinkedIn, Keka, Referral
  external_id VARCHAR,
  source_system VARCHAR,
  sync_status VARCHAR,
  last_synced_at TIMESTAMPTZ
);

-- 4. Create offers table for candidate compensation details
CREATE TABLE IF NOT EXISTS offers (
  id VARCHAR PRIMARY KEY,
  candidate_id VARCHAR REFERENCES candidates(id) ON DELETE CASCADE,
  job_id VARCHAR REFERENCES jobs(id) ON DELETE CASCADE,
  salary VARCHAR NOT NULL,
  joining_date TIMESTAMPTZ,
  status VARCHAR NOT NULL, -- e.g. draft, sent, accepted, declined
  offer_letter_url TEXT,
  external_id VARCHAR,
  source_system VARCHAR,
  sync_status VARCHAR,
  last_synced_at TIMESTAMPTZ
);

-- 5. Create documents table for managing sync'd candidate assets
CREATE TABLE IF NOT EXISTS documents (
  id VARCHAR PRIMARY KEY,
  candidate_id VARCHAR REFERENCES candidates(id) ON DELETE CASCADE,
  title VARCHAR NOT NULL,
  file_url TEXT NOT NULL,
  document_type VARCHAR, -- e.g. resume, portfolio, onboarding
  uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  external_id VARCHAR,
  source_system VARCHAR,
  sync_status VARCHAR,
  last_synced_at TIMESTAMPTZ
);

-- 6. Create webhook_events table for tracking & reprocessing webhook payloads
CREATE TABLE IF NOT EXISTS webhook_events (
  id VARCHAR PRIMARY KEY,
  event_type VARCHAR NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  error_message TEXT,
  retry_count INT DEFAULT 0,
  received_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMPTZ
);
