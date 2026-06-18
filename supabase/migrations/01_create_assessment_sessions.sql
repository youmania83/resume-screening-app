/* 01_create_assessment_sessions.sql */
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE assessment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  attempt_id uuid REFERENCES assessment_attempts(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('active','completed','abandoned','force_resumed')),
  started_at timestamp NOT NULL DEFAULT now(),
  last_heartbeat timestamp NOT NULL DEFAULT now(),
  completed_at timestamp,
  browser_fingerprint text,
  ip_address inet,
  metadata jsonb
);

CREATE INDEX idx_assessment_sessions_candidate_active ON assessment_sessions(candidate_id, status) WHERE status = 'active';
